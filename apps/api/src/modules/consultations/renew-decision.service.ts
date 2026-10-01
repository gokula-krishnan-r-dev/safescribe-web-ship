import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ConsultationStep, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS, getDefaultPrompt } from '@/modules/ai-config/ai-config.defaults';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  applyBulkDuration,
  applyPlanPatch,
  applyDraftGenerated,
  buildStep4Summary,
  buildRenewDapPayload,
  canMarkCommunicationComplete,
  confirmNoAffectedProfessional,
  confirmPlanIncompleteCopy,
  confirmRenewalPlan,
  confirmRenewPatientInfo,
  deriveMedicationSafety,
  evaluateRenewStep4Gate,
  evaluateTherapyReviewGate,
  formatRenewDuration,
  generateRenewDocuments,
  isRenewPatientInfoConfirmed,
  markRenewCommunicationComplete,
  parseCustomDurationInput,
  parseRenewPayload,
  planConfirmIssues,
  RENEW_CUSTOM_DURATION_LIMITS,
  RENEW_DOCUMENT_KINDS,
  RENEW_DOCUMENT_KIND_TO_PROMPT_KEY,
  RENEW_REQUIRED_DOCUMENT_KINDS,
  renewAllEligible,
  assembleRenewConsultationNoteFromAi,
  assembleRenewPcpFromAi,
  buildRenewDapPromptPayload,
  buildRenewPcpPromptPayload,
  buildRenewPatientHandoutSource,
  renderRenewPatientHandout,
  plainRenewHandoutBody,
  translateRenewPatientHandoutBody,
  RENEW_PATIENT_HANDOUT_TITLE,
  HANDOUT_TRANSLATION_FALLBACK_MESSAGE,
  HANDOUT_TRANSLATION_REVIEW_MESSAGE,
  isSupportedHandoutLanguage,
  normalizeHandoutLanguage,
  renewalPlanFingerprint,
  newRenewVersionId,
  renewDurationOptions,
  SAFESCRIBE_MODULES,
  staleCommunicationOnClinicalChange,
  syncPlanItems,
  syncRenewCommunication,
  toPlanRows,
  unconfirmRenewalPlan,
  undoBulkDuration,
  validatePatientHandoutAgainstPlan,
  sanitizeProviderNotificationBody,
  validateGeneratedProviderCommunication,
  validateRenewDapNote,
  validateRenewPatientInfo,
  ageYearsFromDemographics,
  type RenewDecisionState,
  type RenewDocumentKind,
  type RenewDocumentGenerationContext,
  type RenewDurationId,
  type RenewDurationSource,
  type RenewGeneratedDocument,
  type RenewMedicationPlanItem,
  type RenewMedicationPlanRow,
  type RenewMedicationSafety,
  type RenewPayload,
  type RenewStep4View,
  type RenewalPatientInfo,
  type RenewCommunicationMethod,
  type RenewCommunicationPurpose,
  type RenewCommunicationRecipient,
} from '@safescript/shared';
import { RenewMonitoringSafetyService } from './renew-monitoring-safety.service';
import { GoogleHandoutTranslateClient } from './google-handout-translate.client';

const RENEW_DOC_PROMPT_KEYS = [
  AI_PROMPT_KEYS.RENEW_DOCUMENTATION_CONSULTATION_NOTE,
  AI_PROMPT_KEYS.RENEW_DOCUMENTATION_RENEWAL_SUMMARY,
  AI_PROMPT_KEYS.RENEW_DOCUMENTATION_PRESCRIBER_NOTIFICATION,
  AI_PROMPT_KEYS.RENEW_DOCUMENTATION_PATIENT_HANDOUT,
] as const;

function hashPromptContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

@Injectable()
export class RenewDecisionService {
  private readonly logger = new Logger(RenewDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoring: RenewMonitoringSafetyService,
    private readonly audit: AuditService,
    private readonly aiConfig: AiConfigService,
    private readonly aiEngine: AiEngineClient,
    private readonly handoutTranslate: GoogleHandoutTranslateClient,
  ) {}

  async getStep4(consultationId: string, user: RequestUser): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const view = await this.buildView(payload, consultation);
    const seeded: RenewPayload = { ...payload, renewalDecision: view.decision };
    const dbStep = view.decision.confirmed
      ? ConsultationStep.RENEW_DOCUMENTATION
      : ConsultationStep.RENEW_DECISION;
    const needsSeed =
      renewalPlanFingerprint(payload.renewalDecision.items) !==
      renewalPlanFingerprint(view.decision.items);
    if (
      needsSeed ||
      consultation.currentStep === ConsultationStep.RENEW_CLINICAL_ASSESSMENT
    ) {
      await this.persist(consultationId, seeded, 3, dbStep);
    }
    return view;
  }

  async patchPlan(
    consultationId: string,
    user: RequestUser,
    body: {
      medicationId: string;
      selected?: boolean;
      durationId?: RenewDurationId | null;
      customDurationDays?: number | null;
      customDurationText?: string | null;
      durationSource?: RenewDurationSource;
    },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const safety = current.rows.find((row) => row.medicationId === body.medicationId)?.safety;
    if (!safety) throw new BadRequestException('That medication is not part of this renewal plan.');
    const items = applyPlanPatch(
      current.decision.items,
      body.medicationId,
      {
        selected: body.selected,
        durationId: body.durationId,
        customDurationDays: body.customDurationDays,
        customDurationText: body.customDurationText,
        durationSource: body.durationSource,
      },
      safety,
    );
    const next = this.afterPlanEdit(current.decision, items);
    return this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      next.confirmed ? ConsultationStep.RENEW_DOCUMENTATION : ConsultationStep.RENEW_DECISION,
      undefined,
      current.rows,
    );
  }

  async renewAllEligible(consultationId: string, user: RequestUser): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const safetyById = this.safetyMap(current.rows);
    const items = renewAllEligible(current.decision.items, safetyById);
    const next = this.afterPlanEdit(current.decision, items);
    return this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      next.confirmed ? ConsultationStep.RENEW_DOCUMENTATION : ConsultationStep.RENEW_DECISION,
      undefined,
      current.rows,
    );
  }

  async applyDuration(
    consultationId: string,
    user: RequestUser,
    body: {
      durationId: RenewDurationId;
      customDurationDays?: number | null;
      overwriteManual?: boolean;
    },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const selected = current.decision.items.filter((row) => row.selected);
    if (selected.length < 1) {
      throw new BadRequestException('Select medications before applying a duration.');
    }
    if (body.durationId === 'custom') {
      const parsed = parseCustomDurationInput(body.customDurationDays);
      if (parsed.error || parsed.days == null) {
        throw new BadRequestException(parsed.error ?? 'Enter a valid number of days.');
      }
    }
    const applied = applyBulkDuration(current.decision.items, this.safetyMap(current.rows), {
      durationId: body.durationId,
      customDurationDays: body.customDurationDays ?? null,
      overwriteManual: body.overwriteManual === true,
    });
    const next = {
      ...this.afterPlanEdit(current.decision, applied.items),
      lastDurationBulk: applied.bulk,
      lastDurationBulkResult: applied.result,
    };
    return this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      next.confirmed ? ConsultationStep.RENEW_DOCUMENTATION : ConsultationStep.RENEW_DECISION,
      undefined,
      current.rows,
    );
  }

  async undoDuration(
    consultationId: string,
    user: RequestUser,
    bulkActionId: string,
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const bulk = current.decision.lastDurationBulk;
    if (!bulk || bulk.bulkActionId !== bulkActionId) {
      throw new BadRequestException('That bulk duration action can no longer be undone.');
    }
    const items = undoBulkDuration(current.decision.items, bulk);
    const next = {
      ...this.afterPlanEdit(current.decision, items),
      lastDurationBulk: null,
      lastDurationBulkResult: null,
    };
    return this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      next.confirmed ? ConsultationStep.RENEW_DOCUMENTATION : ConsultationStep.RENEW_DECISION,
      undefined,
      current.rows,
    );
  }

  async confirmPlan(consultationId: string, user: RequestUser): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const issues = planConfirmIssues(current.decision.items);
    if (issues.length) {
      throw new BadRequestException(
        confirmPlanIncompleteCopy(issues.filter((row) => row.medicationId).length) ||
          issues[0]?.message ||
          'Review remaining medications before confirming.',
      );
    }
    let decision = confirmRenewalPlan(current.decision, user.id);
    if (!decision.planVersionId) {
      decision = { ...decision, planVersionId: newRenewVersionId() };
    }
    const view = await this.persistAndView(
      consultationId,
      payload,
      decision,
      3,
      ConsultationStep.RENEW_DOCUMENTATION,
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'RENEW_PLAN_CONFIRMED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId,
        selectedCount: decision.items.filter((row) => row.selected).length,
        reviewedCount: decision.items.length,
      },
    });
    return view;
  }

  async unconfirmPlan(consultationId: string, user: RequestUser): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    const next = unconfirmRenewalPlan(current.decision, false);
    return this.persistAndView(consultationId, payload, next, 3, ConsultationStep.RENEW_DECISION);
  }

  async savePatientInfo(
    consultationId: string,
    user: RequestUser,
    body: {
      patientName?: string;
      dateOfBirth?: string;
      phn?: string | null;
      skipped?: boolean;
    },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before saving patient information.');
    }
    const skipped = body.skipped === true;
    const patientName = skipped ? '' : (body.patientName ?? '').trim();
    const dateOfBirth = skipped ? '' : (body.dateOfBirth ?? '').trim();
    const phn = skipped ? null : body.phn;
    const validation = validateRenewPatientInfo({
      patientName,
      dateOfBirth,
      phn,
      recordedAgeYears: this.recordedAgeYears(consultation),
      skipped,
    });
    if (!validation.valid) {
      throw new BadRequestException(
        validation.nameError ?? validation.dobError ?? validation.phnError ?? 'Enter valid patient information.',
      );
    }
    let decision = confirmRenewPatientInfo(
      current.decision,
      { patientName, dateOfBirth, phn, skipped },
      user.id,
    );
    const identityChanged =
      current.decision.patientInfo.skipped !== skipped ||
      current.decision.patientInfo.patientName.trim() !== patientName ||
      current.decision.patientInfo.dateOfBirth.trim() !== dateOfBirth;
    const rows = toPlanRows(
      payload.medicationList.items,
      decision.items,
      this.safetyMap(current.rows),
    );
    const documentContext = await this.buildDocumentContext(consultation, payload);
    let documents = await this.composeDocuments(
      consultation,
      { ...payload, renewalDecision: decision },
      rows,
      [...RENEW_DOCUMENT_KINDS],
      decision.documents,
      documentContext,
      { refineWithAi: false },
    );
    if (identityChanged) {
      documents = documents.map((doc) =>
        doc.kind === 'prescriber_notification' && (doc.status === 'generated' || doc.body.trim())
          ? { ...doc, status: 'stale' as const, reviewed: false, reviewedAt: null }
          : doc,
      );
    }
    decision = {
      ...decision,
      documents,
      communication: identityChanged
        ? staleCommunicationOnClinicalChange(decision.communication)
        : decision.communication,
      docsExpanded: true,
      pharmacistAttested: false,
      attestedAt: null,
    };
    const view = await this.persistAndView(
      consultationId,
      payload,
      decision,
      3,
      ConsultationStep.RENEW_DOCUMENTATION,
      this.patientInfoPersistence(consultation, decision.patientInfo),
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: skipped ? 'RENEW_PATIENT_INFO_SKIPPED' : 'RENEW_PATIENT_INFO_SAVED',
      module: 'CONSULTATIONS',
      newValue: { consultationId, generated: [...RENEW_DOCUMENT_KINDS], skipped },
    });
    return view;
  }

  async generateDocuments(
    consultationId: string,
    user: RequestUser,
    kinds?: RenewDocumentKind[],
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before generating documentation.');
    }
    if (!isRenewPatientInfoConfirmed(current.decision.patientInfo)) {
      throw new BadRequestException('Confirm patient information before generating documentation.');
    }
    const resolved = kinds?.length ? kinds : [...RENEW_DOCUMENT_KINDS];
    const rows = toPlanRows(
      payload.medicationList.items,
      current.decision.items,
      this.safetyMap(current.rows),
    );
    const documents = await this.composeDocuments(
      consultation,
      { ...payload, renewalDecision: current.decision },
      rows,
      resolved,
      current.decision.documents,
    );
    const next: RenewDecisionState = {
      ...current.decision,
      documents,
      communication: resolved.includes('prescriber_notification')
        ? applyDraftGenerated(
            syncRenewCommunication({ ...current.decision, documents }),
            current.decision.items.some((item) => item.selected),
          )
        : current.decision.communication,
      docsExpanded: true,
      pharmacistAttested: false,
      attestedAt: null,
      planFingerprint: renewalPlanFingerprint(current.decision.items),
    };
    const view = await this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      ConsultationStep.RENEW_DOCUMENTATION,
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'RENEW_DOCUMENTS_GENERATED',
      module: 'CONSULTATIONS',
      newValue: { consultationId, kinds: resolved },
    });
    return view;
  }

  /** Persist HTML/plain body and optional pharmacist review for a generated renew document. */
  async updateDocument(
    consultationId: string,
    user: RequestUser,
    kind: RenewDocumentKind,
    patch: { body: string; reviewed?: boolean },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before editing documentation.');
    }
    const body = kind === 'patient_handout' ? plainRenewHandoutBody(patch.body) : patch.body;
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Document content cannot be empty.');
    const currentDoc = current.decision.documents.find((doc) => doc.kind === kind);
    if (kind === 'patient_handout') {
      const language = currentDoc?.handoutLanguage || 'en';
      const checkBody =
        language !== 'en' && currentDoc?.englishBody?.trim()
          ? plainRenewHandoutBody(currentDoc.englishBody)
          : trimmed;
      const check = validatePatientHandoutAgainstPlan(checkBody, current.rows);
      if (!check.ok) throw new BadRequestException(check.reason ?? 'The handout cannot contradict the confirmed prescription.');
    }
    const now = new Date().toISOString();
    let bodyChanged = false;
    const documents: RenewGeneratedDocument[] = current.decision.documents.map((doc) => {
      if (doc.kind !== kind) return doc;
      bodyChanged = trimmed !== doc.body.trim();
      const markReviewed = patch.reviewed === true;
      const language = doc.handoutLanguage || 'en';
      return {
        ...doc,
        body,
        status: 'generated',
        edited: bodyChanged || doc.edited,
        generatedAt: doc.generatedAt ?? now,
        reviewed: markReviewed ? true : bodyChanged ? false : doc.reviewed,
        reviewedAt: markReviewed ? now : bodyChanged ? null : doc.reviewedAt,
        ...(kind === 'patient_handout'
          ? {
              englishBody:
                language === 'en' || !doc.englishBody
                  ? body
                  : plainRenewHandoutBody(doc.englishBody),
            }
          : {}),
      };
    });
    if (!documents.some((doc) => doc.kind === kind)) {
      throw new BadRequestException('Unknown document type.');
    }
    const next: RenewDecisionState = {
      ...current.decision,
      documents,
      pharmacistAttested: bodyChanged ? false : current.decision.pharmacistAttested,
      attestedAt: bodyChanged ? null : current.decision.attestedAt,
    };
    return this.persistAndView(consultationId, payload, next, 3, ConsultationStep.RENEW_DOCUMENTATION);
  }

  async translatePatientHandout(
    consultationId: string,
    user: RequestUser,
    targetLanguage: string,
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before translating the patient handout.');
    }
    const handout = current.decision.documents.find((doc) => doc.kind === 'patient_handout');
    if (!handout?.body.trim() || handout.status !== 'generated') {
      throw new BadRequestException('Generate the patient handout before changing language.');
    }
    if (!isSupportedHandoutLanguage(targetLanguage)) {
      throw new BadRequestException('That handout language is not supported');
    }
    const lang = normalizeHandoutLanguage(targetLanguage);
    const context = await this.buildDocumentContext(consultation, payload);
    const source = buildRenewPatientHandoutSource(payload, current.rows, context);
    const generatedEnglish = renderRenewPatientHandout(source);
    const englishBody = plainRenewHandoutBody(handout.englishBody || '') || generatedEnglish;
    let body = englishBody;
    let language = 'en';
    let translationStatus = 'ok';
    let translationMessage: string | null = null;
    let translationFallback = false;

    if (lang !== 'en') {
      if (!this.handoutTranslate.isConfigured()) {
        translationStatus = this.handoutTranslate.isEnabled() ? 'failed_fallback_en' : 'disabled';
        translationMessage = HANDOUT_TRANSLATION_FALLBACK_MESSAGE;
        translationFallback = true;
      } else {
        try {
          const result = await translateRenewPatientHandoutBody({
            englishBody,
            targetLanguage: lang,
            translateTexts: (texts, googleLang) => this.handoutTranslate.translateTexts(texts, googleLang),
            medicationNames: source.medicationsRenewed.map((row) => row.name),
            pharmacyName: source.pharmacy.name,
            pharmacyPhone: source.pharmacy.phone,
          });
          if (result.ok && !result.fallback) {
            body = result.body;
            language = result.language;
            translationStatus = 'ok';
            translationMessage = HANDOUT_TRANSLATION_REVIEW_MESSAGE;
          } else {
            translationStatus = 'failed_fallback_en';
            translationMessage = HANDOUT_TRANSLATION_FALLBACK_MESSAGE;
            translationFallback = true;
          }
        } catch (err) {
          this.logger.warn(
            `Renew handout translation failed for ${consultationId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          translationStatus = 'failed_fallback_en';
          translationMessage = HANDOUT_TRANSLATION_FALLBACK_MESSAGE;
          translationFallback = true;
        }
      }
    }

    const now = new Date().toISOString();
    const documents = current.decision.documents.map((doc) => {
      if (doc.kind !== 'patient_handout') return doc;
      return {
        ...doc,
        body,
        title: RENEW_PATIENT_HANDOUT_TITLE,
        englishBody,
        handoutLanguage: language,
        translationStatus,
        translationMessage,
        translationFallback,
        reviewed: false,
        reviewedAt: null,
        edited: false,
        generatedAt: doc.generatedAt ?? now,
        status: 'generated' as const,
      };
    });
    const next: RenewDecisionState = {
      ...current.decision,
      documents,
      pharmacistAttested: false,
      attestedAt: null,
    };
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'RENEW_HANDOUT_TRANSLATE',
      module: 'CONSULTATIONS',
      previousValue: { consultationId, language: handout.handoutLanguage ?? 'en' },
      newValue: {
        consultationId,
        language,
        requestedLanguage: lang,
        fallback: translationFallback,
        validationStatus: translationStatus,
      },
    });
    return this.persistAndView(consultationId, payload, next, 3, ConsultationStep.RENEW_DOCUMENTATION);
  }

  async attest(consultationId: string, user: RequestUser, attested: boolean): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (attested && !current.gate.requiredDocsReady) {
      throw new BadRequestException('Generate documentation before confirming professional judgment.');
    }
    if (attested && !current.gate.requiredDocsReviewed) {
      throw new BadRequestException(
        'Review the consultation note and renewal summary before confirming professional judgment.',
      );
    }
    const next: RenewDecisionState = {
      ...current.decision,
      pharmacistAttested: attested,
      attestedAt: attested ? new Date().toISOString() : null,
    };
    return this.persistAndView(consultationId, payload, next, 3, ConsultationStep.RENEW_DOCUMENTATION);
  }

  private afterPlanEdit(decision: RenewDecisionState, items: RenewMedicationPlanItem[]): RenewDecisionState {
    const fingerprint = renewalPlanFingerprint(items);
    const changed = decision.planFingerprint != null && fingerprint !== decision.planFingerprint;
    const stillValid = planConfirmIssues(items).length === 0;
    const keepConfirmed = decision.confirmed && stillValid;
    return {
      ...decision,
      items,
      confirmed: keepConfirmed,
      confirmedAt: keepConfirmed ? decision.confirmedAt : null,
      confirmedBy: keepConfirmed ? decision.confirmedBy : null,
      planVersionId: keepConfirmed
        ? changed
          ? newRenewVersionId()
          : decision.planVersionId
        : decision.planVersionId,
      planExpanded: true,
      pharmacistAttested: false,
      attestedAt: null,
      planFingerprint: fingerprint,
      documents: decision.confirmed || changed ? this.staleIfGenerated(decision.documents) : decision.documents,
      communication:
        decision.confirmed || changed
          ? staleCommunicationOnClinicalChange(decision.communication)
          : decision.communication,
    };
  }

  private staleIfGenerated(documents: RenewGeneratedDocument[]): RenewGeneratedDocument[] {
    return documents.map((doc) =>
      doc.status === 'generated' || doc.body.trim()
        ? { ...doc, status: 'stale' as const, reviewed: false, reviewedAt: null }
        : doc,
    );
  }

  private safetyMap(rows: RenewStep4View['rows']): Map<string, RenewMedicationSafety> {
    return new Map(rows.map((row) => [row.medicationId, row.safety]));
  }

  private async persistAndView(
    consultationId: string,
    payload: RenewPayload,
    renewalDecision: RenewDecisionState,
    stepIndex: number,
    currentStep: ConsultationStep,
    extras?: { documentation?: Prisma.InputJsonValue; demographics?: Prisma.InputJsonValue },
    rows?: RenewStep4View['rows'],
  ): Promise<RenewStep4View> {
    const decision = await this.refreshStaleRequiredDocs(
      consultationId,
      payload,
      {
        ...renewalDecision,
        communication: syncRenewCommunication(renewalDecision),
      },
      rows,
    );
    await this.persist(
      consultationId,
      { ...payload, renewalDecision: decision },
      stepIndex,
      currentStep,
      extras,
    );
    return this.buildView({ ...payload, renewalDecision: decision });
  }

  private async refreshStaleRequiredDocs(
    consultationId: string,
    payload: RenewPayload,
    decision: RenewDecisionState,
    rows?: RenewStep4View['rows'],
  ): Promise<RenewDecisionState> {
    const staleRequired = decision.documents.some(
      (doc) =>
        (doc.kind === 'consultation_note' || doc.kind === 'renewal_summary') && doc.status === 'stale',
    );
    if (!decision.confirmed || !isRenewPatientInfoConfirmed(decision.patientInfo) || !staleRequired) {
      return decision;
    }
    const consultation = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    const planRows =
      rows ??
      toPlanRows(
        payload.medicationList.items,
        decision.items,
        new Map(
          payload.medicationList.items.map((med) => [
            med.id,
            { tone: 'clear' as const, label: 'No concerns', note: null },
          ]),
        ),
      );
    return {
      ...decision,
      documents: consultation
        ? await this.composeDocuments(
            consultation,
            { ...payload, renewalDecision: decision },
            planRows,
            [...RENEW_REQUIRED_DOCUMENT_KINDS],
            decision.documents,
            undefined,
            { refineWithAi: false },
          )
        : generateRenewDocuments(
            { ...payload, renewalDecision: decision },
            planRows,
            [...RENEW_REQUIRED_DOCUMENT_KINDS],
            decision.documents,
          ),
    };
  }

  private async buildView(
    payload: RenewPayload,
    consultation?: {
      documentation?: unknown;
      demographics?: unknown;
    },
  ): Promise<RenewStep4View> {
    const step3 = await this.monitoring.resolveView(payload);
    const safetyById = new Map<string, RenewMedicationSafety>();
    for (const med of payload.medicationList.items) {
      safetyById.set(
        med.id,
        deriveMedicationSafety(
          med,
          step3.model.monitoring,
          step3.model.safetySummary.findings,
          payload.therapyReview,
        ),
      );
    }
    const items = syncPlanItems(
      payload.medicationList.items,
      payload.renewalDecision,
      safetyById,
      payload.renewalRequest.requestedDuration,
      payload.renewalRequest.customDurationDays ?? null,
      payload.renewalRequest.customDurationText ?? null,
    );
    const decision: RenewDecisionState = {
      ...payload.renewalDecision,
      items,
      patientInfo: this.prefillPatientInfo(payload.renewalDecision.patientInfo, consultation),
    };
    const synced: RenewDecisionState = {
      ...decision,
      communication: syncRenewCommunication(decision),
    };
    const rows = toPlanRows(payload.medicationList.items, items, safetyById);
    const therapyGate = evaluateTherapyReviewGate(
      payload.medicationList.items,
      payload.therapyReview,
      [],
    );
    return {
      rows,
      decision: synced,
      summary: buildStep4Summary(rows, payload.therapyReview, therapyGate),
      gate: evaluateRenewStep4Gate(synced),
      requestedDurationId: payload.renewalRequest.requestedDuration,
      requestedDurationLabel: formatRenewDuration(payload.renewalRequest),
      durationOptions: renewDurationOptions(),
      customDurationLimits: RENEW_CUSTOM_DURATION_LIMITS,
      recordedAgeYears: this.recordedAgeYears(consultation),
    };
  }

  private prefillPatientInfo(
    stored: RenewalPatientInfo,
    consultation?: { documentation?: unknown; demographics?: unknown },
  ): RenewalPatientInfo {
    if (stored.patientName.trim() || stored.dateOfBirth.trim() || stored.phn) return stored;
    const docs =
      consultation?.documentation && typeof consultation.documentation === 'object'
        ? (consultation.documentation as Record<string, unknown>)
        : {};
    const info =
      docs.patientInfo && typeof docs.patientInfo === 'object'
        ? (docs.patientInfo as Record<string, unknown>)
        : {};
    const demo =
      consultation?.demographics && typeof consultation.demographics === 'object'
        ? (consultation.demographics as Record<string, unknown>)
        : {};
    const name = String(info.name ?? info.patientName ?? '').trim();
    const dob = String(info.dateOfBirth ?? demo.dateOfBirth ?? '').trim();
    const phn = String(info.patientId ?? info.phn ?? demo.phn ?? demo.healthNumber ?? '').trim();
    if (!name && !dob && !phn) return stored;
    return {
      ...stored,
      patientName: name,
      dateOfBirth: dob,
      phn: phn || null,
      source: 'INTAKE',
    };
  }

  private recordedAgeYears(consultation?: { demographics?: unknown }): number | null {
    if (!consultation?.demographics || typeof consultation.demographics !== 'object') return null;
    const demo = consultation.demographics as {
      age?: string | number;
      ageUnit?: string;
      dateOfBirth?: string;
      dateOfBirthUnavailable?: boolean;
    };
    if (demo.dateOfBirth && !demo.dateOfBirthUnavailable) return null;
    return ageYearsFromDemographics(demo);
  }

  private patientInfoPersistence(
    consultation: { documentation?: unknown; demographics?: unknown },
    patientInfo: RenewalPatientInfo,
  ): { documentation: Prisma.InputJsonValue; demographics: Prisma.InputJsonValue } {
    const docs =
      consultation.documentation && typeof consultation.documentation === 'object'
        ? { ...(consultation.documentation as Record<string, unknown>) }
        : {};
    docs.patientInfo = {
      ...((docs.patientInfo && typeof docs.patientInfo === 'object'
        ? (docs.patientInfo as Record<string, unknown>)
        : {}) as Record<string, unknown>),
      name: patientInfo.patientName,
      dateOfBirth: patientInfo.dateOfBirth,
      patientId: patientInfo.phn ?? undefined,
      skipped: patientInfo.skipped === true,
    };
    const demographics =
      consultation.demographics && typeof consultation.demographics === 'object'
        ? { ...(consultation.demographics as Record<string, unknown>) }
        : {};
    if (!patientInfo.skipped && patientInfo.dateOfBirth.trim()) {
      demographics.dateOfBirth = patientInfo.dateOfBirth;
    }
    demographics.dateOfBirthUnavailable = false;
    return {
      documentation: JSON.parse(JSON.stringify(docs)) as Prisma.InputJsonValue,
      demographics: JSON.parse(JSON.stringify(demographics)) as Prisma.InputJsonValue,
    };
  }

  private async persist(
    consultationId: string,
    payload: RenewPayload,
    stepIndex: number,
    currentStep: ConsultationStep,
    extras?: { documentation?: Prisma.InputJsonValue; demographics?: Prisma.InputJsonValue },
  ) {
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        renewPayload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        stepIndex,
        currentStep,
        ...(extras?.documentation ? { documentation: extras.documentation } : {}),
        ...(extras?.demographics ? { demographics: extras.demographics } : {}),
      },
    });
  }

  private async buildDocumentContext(
    consultation: {
      pharmacistId: string;
      tenantId: string | null;
      demographics?: unknown;
      documentation?: unknown;
    },
    payload: RenewPayload,
  ): Promise<RenewDocumentGenerationContext> {
    const [pharmacist, tenant, step3, livePrompts] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: consultation.pharmacistId },
        select: { firstName: true, lastName: true },
      }),
      consultation.tenantId
        ? this.prisma.tenant.findUnique({
            where: { id: consultation.tenantId },
            select: { name: true, timezone: true, phone: true, faxNumber: true, address: true },
          })
        : Promise.resolve(null),
      this.monitoring.resolveView(payload),
      this.aiConfig.getLivePrompts([...RENEW_DOC_PROMPT_KEYS]),
    ]);
    const pharmacistName = [pharmacist?.firstName, pharmacist?.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');
    const systemPrompts: Partial<Record<RenewDocumentKind, string>> = {};
    const promptHashes: Partial<Record<RenewDocumentKind, string>> = {};
    for (const kind of Object.keys(RENEW_DOCUMENT_KIND_TO_PROMPT_KEY) as RenewDocumentKind[]) {
      const key = RENEW_DOCUMENT_KIND_TO_PROMPT_KEY[kind];
      const renewContent = livePrompts[key] ?? getDefaultPrompt(key)?.content ?? '';
      const content = renewContent || getDefaultPrompt(key)?.content || '';
      if (content) {
        systemPrompts[kind] = content;
        promptHashes[kind] = hashPromptContent(content);
      }
    }
    const patientAddress = this.patientAddressFromConsultation(consultation);
    return {
      encounter: {
        dateTimeIso: new Date().toISOString(),
        pharmacistName,
        pharmacistRole: 'Pharmacist',
        practiceSite: tenant?.name?.trim() || null,
        timeZone: tenant?.timezone ?? 'America/Edmonton',
        ageYears: this.recordedAgeYears(consultation),
        mode: null,
        prescribingBasis: 'ADAPTATION_RENEWAL_CONTINUITY_OF_CARE',
        jurisdiction: 'Alberta',
        phone: tenant?.phone?.trim() || null,
        fax: tenant?.faxNumber?.trim() || null,
        address: tenant?.address?.trim() || null,
      },
      patient: {
        address: patientAddress,
      },
      clinical: {
        patientContext: step3.model.patientContext,
        monitoring: [
          ...step3.model.monitoring,
          ...(step3.model.additionalMonitoring ?? []),
        ],
        safetyFindings: step3.model.safetySummary.findings,
        uncoveredMedications: step3.model.uncoveredMedications,
      },
      systemPrompts,
      promptHashes,
    };
  }

  private patientAddressFromConsultation(consultation: {
    documentation?: unknown;
  }): string | null {
    const docs =
      consultation.documentation && typeof consultation.documentation === 'object'
        ? (consultation.documentation as Record<string, unknown>)
        : {};
    const info =
      docs.patientInfo && typeof docs.patientInfo === 'object'
        ? (docs.patientInfo as Record<string, unknown>)
        : {};
    const direct = String(info.address ?? '').trim();
    if (direct) return direct;
    const lines =
      info.addressLines && typeof info.addressLines === 'object'
        ? (info.addressLines as Record<string, unknown>)
        : null;
    if (!lines) return null;
    const street = String(lines.street ?? '').trim();
    const unit = String(lines.unit ?? '').trim();
    const city = String(lines.city ?? '').trim();
    const province = String(lines.province ?? '').trim();
    const postal = String(lines.postalCode ?? '').trim();
    const cityLine = [city, province, postal].filter(Boolean).join(' ');
    const composed = [unit ? `Unit ${unit}` : null, street, cityLine].filter(Boolean).join(', ');
    return composed || null;
  }

  private async composeDocuments(
    consultation: {
      pharmacistId: string;
      tenantId: string | null;
      demographics?: unknown;
      documentation?: unknown;
    },
    payload: RenewPayload,
    rows: RenewMedicationPlanRow[],
    kinds: RenewDocumentKind[],
    existing: RenewGeneratedDocument[],
    context?: RenewDocumentGenerationContext,
    options?: { refineWithAi?: boolean },
  ): Promise<RenewGeneratedDocument[]> {
    const documentContext = context ?? (await this.buildDocumentContext(consultation, payload));
    const documents = generateRenewDocuments(
      payload,
      rows,
      kinds,
      existing,
      documentContext,
    );
    if (options?.refineWithAi === false) return documents;
    return this.refineDocumentsWithLivePrompts(
      payload,
      rows,
      kinds,
      documents,
      documentContext,
    );
  }

  /**
   * Draft consultation note and PCP communication with the same generate-documentation
   * pipeline as Prescribe. Prescription and patient handout stay Nest-rendered.
   * Nest drafts remain the fallback when AI is unavailable or the draft fails validation.
   */
  private async refineDocumentsWithLivePrompts(
    payload: RenewPayload,
    rows: RenewMedicationPlanRow[],
    kinds: RenewDocumentKind[],
    documents: RenewGeneratedDocument[],
    context: RenewDocumentGenerationContext,
  ): Promise<RenewGeneratedDocument[]> {
    if (!this.aiEngine.isAvailable) return documents;

    const wantsNote = kinds.includes('consultation_note');
    const wantsPcp = kinds.includes('prescriber_notification');
    if (!wantsNote && !wantsPcp) return documents;

    const requested = [
      wantsNote ? 'consultation_note' : null,
      wantsPcp ? 'prescriber_communication' : null,
    ].filter((key): key is string => Boolean(key));

    const dapPayload = buildRenewDapPayload(payload, rows, context);
    const renewSource = buildRenewDapPromptPayload(dapPayload);
    const renewPcpSource = buildRenewPcpPromptPayload(dapPayload, payload, rows, context);
    const documentPrompts = {
      consultation_note: context.systemPrompts?.consultation_note ?? '',
      prescriber_communication: context.systemPrompts?.prescriber_notification ?? '',
    };

    const startedAt = Date.now();
    const runGeneration = (stricter: boolean, timeoutMs: number) =>
      this.aiEngine.postJson<{ documents?: Record<string, unknown> }>(
        '/api/v1/consultations/generate-documentation',
        {
          consultation_data: {
            dap_payload: renewSource,
            renew_dap_source: renewSource,
            renew_pcp_source: renewPcpSource,
            pcp_payload: renewPcpSource,
          },
          document_prompts: documentPrompts,
          stricter_retry: stricter,
          requested_documents: requested,
        },
        timeoutMs,
      );

    try {
      let result = await runGeneration(false, 90_000);
      let noteFields = result?.documents?.consultation_note;
      let pcpFields = result?.documents?.prescriber_communication;

      const noteDraft = wantsNote ? assembleRenewConsultationNoteFromAi(noteFields) : null;
      const pcpDraft = wantsPcp ? assembleRenewPcpFromAi(pcpFields) : null;

      const retryKeys = [
        wantsNote && noteDraft && !noteDraft.ok ? 'consultation_note' : null,
        wantsPcp && pcpDraft && !pcpDraft.ok ? 'prescriber_communication' : null,
      ].filter((key): key is string => Boolean(key));

      const elapsed = Date.now() - startedAt;
      if (retryKeys.length && elapsed < 45_000) {
        const retry = await runGeneration(true, 50_000);
        if (retryKeys.includes('consultation_note')) {
          noteFields = retry?.documents?.consultation_note ?? noteFields;
        }
        if (retryKeys.includes('prescriber_communication')) {
          pcpFields = retry?.documents?.prescriber_communication ?? pcpFields;
        }
      } else if (retryKeys.length) {
        this.logger.warn(
          `renew.documentation.retry_skipped elapsedMs=${elapsed} keys=${retryKeys.join(',')}`,
        );
      }

      const note = wantsNote ? assembleRenewConsultationNoteFromAi(noteFields) : null;
      const letter = wantsPcp ? assembleRenewPcpFromAi(pcpFields) : null;

      return documents.map((doc) => {
        if (doc.kind === 'consultation_note' && wantsNote && note) {
          if (
            this.acceptRefinedRenewBody('consultation_note', note.body, payload, rows, context)
          ) {
            return { ...doc, body: note.body, generationSource: 'ai' as const };
          }
          this.logger.warn('renew.documentation.note_rejected — keeping Nest draft');
        }
        if (doc.kind === 'prescriber_notification' && wantsPcp && letter) {
          if (
            this.acceptRefinedRenewBody(
              'prescriber_notification',
              letter.body,
              payload,
              rows,
              context,
            )
          ) {
            return { ...doc, body: letter.body, generationSource: 'ai' as const };
          }
          this.logger.warn('renew.documentation.pcp_rejected — keeping Nest draft');
        }
        return doc;
      });
    } catch (err) {
      this.logger.warn(
        `renew.documentation.generate_failed — keeping Nest drafts: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return documents;
    }
  }

  private acceptRefinedRenewBody(
    kind: RenewDocumentKind,
    body: string,
    payload: RenewPayload,
    rows: RenewMedicationPlanRow[],
    context: RenewDocumentGenerationContext,
  ): boolean {
    if (kind === 'consultation_note') {
      const dap = buildRenewDapPayload(payload, rows, context);
      return validateRenewDapNote(body, dap).length === 0;
    }
    if (kind === 'prescriber_notification') {
      const letter = sanitizeProviderNotificationBody(body);
      const selectedNames = rows.filter((row) => row.selected).map((row) => row.displayName);
      return (
        validateGeneratedProviderCommunication({
          generatedText: letter,
          patientName: payload.renewalDecision.patientInfo.patientName,
          dateOfBirth: payload.renewalDecision.patientInfo.dateOfBirth,
          medicationNames: selectedNames,
        }).length === 0
      );
    }
    return true;
  }

  async saveCommunication(
    consultationId: string,
    user: RequestUser,
    body: {
      recipient?: RenewCommunicationRecipient | null;
      noAffectedProfessional?: boolean;
      purpose?: RenewCommunicationPurpose;
    },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before recording communication.');
    }
    let communication = syncRenewCommunication(current.decision);
    if (body.recipient !== undefined) {
      communication = {
        ...communication,
        recipient: body.recipient,
        noAffectedProfessional: body.recipient?.name?.trim()
          ? false
          : communication.noAffectedProfessional,
      };
    }
    if (body.purpose) {
      communication = { ...communication, purpose: body.purpose };
    }
    if (typeof body.noAffectedProfessional === 'boolean') {
      communication = confirmNoAffectedProfessional(communication, body.noAffectedProfessional);
    }
    const next: RenewDecisionState = { ...current.decision, communication };
    if (typeof body.noAffectedProfessional === 'boolean') {
      next.documents = await this.refreshConsultationNote(consultation, payload, next, current.rows);
    }
    const view = await this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      ConsultationStep.RENEW_DOCUMENTATION,
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'RENEW_COMMUNICATION_UPDATED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId,
        noAffectedProfessional: communication.noAffectedProfessional,
        recipientName: communication.recipient?.name ?? null,
      },
    });
    return view;
  }

  async markCommunicationComplete(
    consultationId: string,
    user: RequestUser,
    body: {
      method: RenewCommunicationMethod;
      communicatedAt: string;
      note?: string | null;
      phoneSummary?: string | null;
      purpose?: RenewCommunicationPurpose;
      recipient?: RenewCommunicationRecipient | null;
    },
  ): Promise<RenewStep4View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const current = await this.buildView(payload, consultation);
    if (!current.decision.confirmed) {
      throw new BadRequestException('Confirm the renewal plan before recording communication.');
    }
    const check = canMarkCommunicationComplete({
      documents: current.decision.documents,
      method: body.method,
      communicatedAt: body.communicatedAt,
      phoneSummary: body.phoneSummary,
      recipientName: body.recipient?.name ?? current.decision.communication.recipient?.name,
      status: current.decision.communication.status,
    });
    if (!check.ok) throw new BadRequestException(check.reason ?? 'Cannot mark communication complete.');
    const next: RenewDecisionState = {
      ...current.decision,
      communication: markRenewCommunicationComplete(current.decision.communication, {
        method: body.method,
        communicatedAt: body.communicatedAt,
        communicatedBy: user.id,
        note: body.note,
        phoneSummary: body.phoneSummary,
        purpose: body.purpose,
        recipient: body.recipient,
      }),
    };
    next.documents = await this.refreshConsultationNote(consultation, payload, next, current.rows);
    const view = await this.persistAndView(
      consultationId,
      payload,
      next,
      3,
      ConsultationStep.RENEW_DOCUMENTATION,
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'RENEW_COMMUNICATION_COMPLETED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId,
        method: body.method,
        communicatedAt: body.communicatedAt,
      },
    });
    return view;
  }

  private async refreshConsultationNote(
    consultation: { pharmacistId: string; tenantId: string | null; demographics?: unknown },
    payload: RenewPayload,
    decision: RenewDecisionState,
    rows: RenewStep4View['rows'],
  ): Promise<RenewGeneratedDocument[]> {
    const note = decision.documents.find((doc) => doc.kind === 'consultation_note');
    if (!note || (note.status !== 'generated' && !note.body.trim())) return decision.documents;
    return this.composeDocuments(
      consultation,
      { ...payload, renewalDecision: decision },
      toPlanRows(payload.medicationList.items, decision.items, this.safetyMap(rows)),
      ['consultation_note'],
      decision.documents,
      undefined,
      { refineWithAi: false },
    );
  }

  private async requireRenewConsultation(id: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.module !== SAFESCRIBE_MODULES.RENEW) {
      throw new BadRequestException('Renewal plan is only available on Renew consultations');
    }
    if (user.role === 'SUPER_ADMIN') return consultation;
    if (user.role === 'PHARMACIST_ADMIN' && user.tenantId && consultation.tenantId === user.tenantId) {
      return consultation;
    }
    if (consultation.pharmacistId === user.id) return consultation;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private assertPrerequisites(payload: RenewPayload) {
    if (!payload.medicationList.confirmed || payload.medicationList.items.length === 0) {
      throw new BadRequestException('Confirm the medication list in Step 1 before the renewal plan.');
    }
    if (!payload.monitoringSafety.completed) {
      throw new BadRequestException('Complete Monitoring & Safety before the renewal plan.');
    }
  }
}

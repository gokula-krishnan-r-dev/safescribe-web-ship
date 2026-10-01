import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConsultationStep, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { MedicationSafetyEvaluatorService } from '@/modules/medication-safety/medication-safety-evaluator.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { LabReportExtractorService } from './lab-report-extractor.service';
import { RenewStep3ResolverService } from './renew-step3-resolver.service';
import {
  RENEW_STARTER_MONITORING_INPUTS,
  RENEW_STARTER_MONITORING_RULES,
} from './renew-monitoring-library.data';
import {
  applyNoConcernAnswers,
  attachPatientInfoPriors,
  contextChoiceToAnswer,
  emptyContextAnswer,
  emptyMonitoringResult,
  evaluatePresentedMonitoringGate,
  formatMonitoringResult,
  isContextComplete,
  isIndicationResolved,
  matchExtractionToCode,
  medicationDisplayName,
  medicationShortName,
  monitoringItemRemovable,
  parseRenewPayload,
  patientInfoPriorsFromDemographics,
  requirementFingerprint,
  SAFESCRIBE_MODULES,
  therapyIndicationsReady,
  undoNoConcernAnswers,
  upsertMonitoringItemReview,
  validateMonitoringResultUnit,
  type ExtractedMonitoringCandidate,
  type MonitoringIndication,
  type MonitoringRemovalReasonId,
  type MonitoringReviewAction,
  type RemovedConditionalQuestion,
  type RemovedMonitoringItem,
  type RenewMedication,
  type RenewMonitoringExtraction,
  type RenewMonitoringInputDef,
  type RenewMonitoringRequirement,
  type RenewMonitoringResult,
  type RenewMonitoringSafetyState,
  type RenewPatientContextAnswer,
  type RenewPatientContextRequirement,
  type RenewPayload,
  type RenewSafetyFindingSummary,
  type RenewSafetySummary,
  type RenewStep3View,
  type ContextChoice,
  type ContextRemovalReasonId,
} from '@safescript/shared';
import { AuditService } from '@/modules/audit/audit.service';

@Injectable()
export class RenewMonitoringSafetyService {
  private readonly logger = new Logger(RenewMonitoringSafetyService.name);
  private libraryReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly labExtractor: LabReportExtractorService,
    private readonly safetyEvaluator: MedicationSafetyEvaluatorService,
    private readonly step3Resolver: RenewStep3ResolverService,
    private readonly audit: AuditService,
  ) {}

  async getStep3(consultationId: string, user: RequestUser): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    await this.ensureLibrary();
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const view = await this.buildView(payload, consultation.demographics);
    await this.persist(consultationId, payload, view.state, view.fingerprint);
    return view.model;
  }

  /** Shared monitoring/safety snapshot for later renew steps. */
  async resolveView(payload: RenewPayload) {
    await this.ensureLibrary();
    return this.buildView(payload);
  }

  async saveMonitoringResult(
    consultationId: string,
    user: RequestUser,
    inputCode: string,
    body: {
      numericValue?: number | null;
      secondaryNumericValue?: number | null;
      valueText?: string | null;
      unit?: string | null;
      observedDate?: string | null;
      sourceLabel?: string | null;
    },
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    await this.ensureLibrary();
    const defs = await this.listInputs();
    const def = defs.find((row) => row.code === inputCode);
    if (!def || def.inputType === 'PATIENT_CONTEXT') {
      throw new BadRequestException('That monitoring item is not part of this renewal.');
    }
    this.validateValue(def, body);
    const next = upsertResult(payload.monitoringSafety, {
      inputCode,
      status: 'AVAILABLE',
      value: {
        numericValue: body.numericValue ?? null,
        secondaryNumericValue: body.secondaryNumericValue ?? null,
        valueText: body.valueText?.trim() || null,
        unit: body.unit?.trim() || def.unit,
      },
      observedDate: body.observedDate?.trim() || null,
      sourceType: 'MANUAL',
      sourceLabel: body.sourceLabel?.trim() || null,
      note: null,
      pharmacistConfirmed: true,
    });
    return this.persistAndView(consultationId, payload, { ...next, monitoringConfirmed: false });
  }

  async markUnavailable(
    consultationId: string,
    user: RequestUser,
    inputCode: string,
    note?: string,
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const next = upsertResult(payload.monitoringSafety, {
      inputCode,
      status: 'UNAVAILABLE',
      value: null,
      observedDate: null,
      sourceType: null,
      sourceLabel: null,
      note: note?.trim() || null,
      pharmacistConfirmed: true,
    });
    return this.persistAndView(consultationId, payload, { ...next, monitoringConfirmed: false });
  }

  async saveMonitoringWorkspace(
    consultationId: string,
    user: RequestUser,
    body: {
      removedItems?: Array<{
        inputCode: string;
        reasonCode: MonitoringRemovalReasonId;
        reasonText?: string | null;
      }>;
      restoreInputCodes?: string[];
      extraInputCodes?: string[];
      confirmed?: boolean;
    },
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    await this.ensureLibrary();

    let state: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      results: [...payload.monitoringSafety.results],
      removedMonitoringItems: [...(payload.monitoringSafety.removedMonitoringItems ?? [])],
      extraMonitoringCodes: [...(payload.monitoringSafety.extraMonitoringCodes ?? [])],
      completed: false,
      completedAt: null,
      monitoringConfirmed: false,
    };

    const preview = await this.buildView({ ...payload, monitoringSafety: state });
    const activeRows = [...preview.model.monitoring, ...(preview.model.additionalMonitoring ?? [])];
    const defs = await this.listInputs();

    for (const extra of body.extraInputCodes ?? []) {
      const code = extra.trim().toUpperCase();
      if (!code) continue;
      const def = defs.find((row) => row.code.toUpperCase() === code);
      if (!def || def.inputType === 'PATIENT_CONTEXT') {
        throw new BadRequestException('Choose a governed monitoring item.');
      }
      if (!state.extraMonitoringCodes.includes(def.code)) {
        state.extraMonitoringCodes = [...state.extraMonitoringCodes, def.code];
      }
      state.removedMonitoringItems = state.removedMonitoringItems.filter((row) => row.inputCode !== def.code);
    }

    for (const removed of body.removedItems ?? []) {
      const row = activeRows.find((item) => item.inputCode === removed.inputCode);
      if (row?.removable === false) {
        throw new BadRequestException('That monitoring item cannot be removed from this review.');
      }
      if (removed.reasonCode === 'OTHER' && !removed.reasonText?.trim()) {
        throw new BadRequestException('Describe why this monitoring item is being removed.');
      }
      const record: RemovedMonitoringItem = {
        inputCode: removed.inputCode,
        reasonCode: removed.reasonCode,
        reasonText: removed.reasonText?.trim() || null,
        removedAt: new Date().toISOString(),
        removedByUserId: user.id,
      };
      state.removedMonitoringItems = [
        ...state.removedMonitoringItems.filter((item) => item.inputCode !== removed.inputCode),
        record,
      ];
    }

    if (body.restoreInputCodes?.length) {
      const restore = new Set(body.restoreInputCodes);
      state.removedMonitoringItems = state.removedMonitoringItems.filter((item) => !restore.has(item.inputCode));
    }

    if (body.confirmed) {
      const nextView = await this.buildView({ ...payload, monitoringSafety: state });
      const gate = nextView.model.gate;
      if (gate.pendingMonitoringCodes.length || gate.blockingReviewCodes.length) {
        throw new BadRequestException(
          'Disposition remaining monitoring items and document required reviews before continuing.',
        );
      }
      state.monitoringConfirmed = true;
    }

    return this.persistAndView(consultationId, payload, state);
  }

  async saveMonitoringReview(
    consultationId: string,
    user: RequestUser,
    inputCode: string,
    body: {
      action: MonitoringReviewAction;
      note?: string | null;
      otherText?: string | null;
      affectedMedicationIds?: string[];
      shorterDurationId?: string | null;
    },
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    await this.ensureLibrary();
    const defs = await this.listInputs();
    const def = defs.find((row) => row.code === inputCode);
    if (!def || def.inputType === 'PATIENT_CONTEXT') {
      throw new BadRequestException('That monitoring item is not part of this renewal.');
    }
    if (body.action === 'OTHER' && !body.otherText?.trim() && !body.note?.trim()) {
      throw new BadRequestException('Specify the other action.');
    }
    const next: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      itemReviews: upsertMonitoringItemReview(payload.monitoringSafety.itemReviews ?? [], {
        inputCode,
        action: body.action,
        note: body.note?.trim() || null,
        reviewedAt: new Date().toISOString(),
        otherText: body.otherText?.trim() || null,
        affectedMedicationIds: body.affectedMedicationIds?.filter(Boolean) ?? [],
        shorterDurationId: body.shorterDurationId?.trim() || null,
      }),
      completed: false,
      completedAt: null,
      monitoringConfirmed: false,
    };
    return this.persistAndView(consultationId, payload, next);
  }

  async saveContextAnswer(
    consultationId: string,
    user: RequestUser,
    inputCode: string,
    body: {
      status?: RenewPatientContextAnswer['status'];
      valueText?: string | null;
      numericValue?: number | null;
      note?: string | null;
      unableReasonCode?: string | null;
      unableReasonText?: string | null;
      followup?: RenewPatientContextAnswer['followup'];
      enteredUnit?: string | null;
      sourceDate?: string | null;
    },
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const existing = payload.monitoringSafety.contextAnswers.find((row) => row.inputCode === inputCode);
    const next: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      contextAnswers: upsertByCode(payload.monitoringSafety.contextAnswers, {
        inputCode,
        status: body.status ?? existing?.status ?? 'ANSWERED',
        valueText: body.valueText !== undefined ? body.valueText?.trim() || null : existing?.valueText ?? null,
        numericValue: body.numericValue !== undefined ? body.numericValue ?? null : existing?.numericValue ?? null,
        pharmacistConfirmed: true,
        source: 'MANUAL',
        bulkActionId: null,
        note: body.note !== undefined ? body.note?.trim() || null : existing?.note ?? null,
        unableReasonCode:
          body.unableReasonCode !== undefined
            ? body.unableReasonCode?.trim() || null
            : existing?.unableReasonCode ?? null,
        unableReasonText:
          body.unableReasonText !== undefined
            ? body.unableReasonText?.trim() || null
            : existing?.unableReasonText ?? null,
        followup: body.followup !== undefined ? body.followup : existing?.followup ?? null,
        enteredUnit:
          body.enteredUnit !== undefined ? body.enteredUnit?.trim() || null : existing?.enteredUnit ?? null,
        sourceDate: body.sourceDate !== undefined ? body.sourceDate : existing?.sourceDate ?? null,
      }),
      completed: false,
      completedAt: null,
      patientContextConfirmed: false,
    };
    return this.persistAndView(consultationId, payload, next);
  }

  async savePatientSpecificInformation(
    consultationId: string,
    user: RequestUser,
    body: {
      answers?: Array<{ questionRuleId: string; answer: 'YES' | 'NO' | 'UNKNOWN'; source?: 'MANUAL' | 'BULK_NO_CONCERNS' }>;
      removedQuestions?: Array<{
        questionRuleId: string;
        reasonCode: ContextRemovalReasonId;
        reasonText?: string | null;
      }>;
      restoreQuestionIds?: string[];
      additionalNote?: string | null;
      confirmed?: boolean;
      applyNoConcerns?: boolean;
      undoBulkActionId?: string;
      ackBulkConfirm?: boolean;
    },
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    await this.ensureLibrary();

    let state: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      contextAnswers: [...payload.monitoringSafety.contextAnswers],
      removedContextQuestions: [...(payload.monitoringSafety.removedContextQuestions ?? [])],
      completed: false,
      completedAt: null,
    };

    const preview = await this.buildView({ ...payload, monitoringSafety: state });
    const activeRows = preview.model.patientContext;

    if (body.applyNoConcerns) {
      if (!state.patientContextBulkAcked && !body.ackBulkConfirm) {
        throw new BadRequestException('Confirm applying no-concern responses before continuing.');
      }
      const bulkActionId = `bulk_${randomBytes(6).toString('hex')}`;
      const applied = applyNoConcernAnswers(activeRows, state.contextAnswers, bulkActionId);
      state = {
        ...state,
        contextAnswers: applied.next,
        lastContextBulkActionId: bulkActionId,
        patientContextBulkAcked: true,
        patientContextConfirmed: false,
      };
    }

    if (body.undoBulkActionId?.trim()) {
      const undoId = body.undoBulkActionId.trim();
      state = {
        ...state,
        contextAnswers: undoNoConcernAnswers(state.contextAnswers, undoId),
        lastContextBulkActionId: state.lastContextBulkActionId === undoId ? null : state.lastContextBulkActionId,
        patientContextConfirmed: false,
      };
    }

    for (const answer of body.answers ?? []) {
      const choice = answer.answer.toLowerCase() as ContextChoice;
      state.contextAnswers = upsertByCode(
        state.contextAnswers,
        contextChoiceToAnswer(answer.questionRuleId, choice, {
          source: answer.source === 'BULK_NO_CONCERNS' ? 'BULK_NO_CONCERNS' : 'MANUAL',
          bulkActionId: answer.source === 'BULK_NO_CONCERNS' ? state.lastContextBulkActionId : null,
        }),
      );
      state.patientContextConfirmed = false;
    }

    for (const removed of body.removedQuestions ?? []) {
      const row = activeRows.find((item) => item.inputCode === removed.questionRuleId);
      if (row?.removable === false) {
        throw new BadRequestException('That question cannot be removed from this review.');
      }
      if (removed.reasonCode === 'OTHER' && !removed.reasonText?.trim()) {
        throw new BadRequestException('Describe why this question is being removed.');
      }
      const record: RemovedConditionalQuestion = {
        questionRuleId: removed.questionRuleId,
        reasonCode: removed.reasonCode,
        reasonText: removed.reasonText?.trim() || null,
        removedAt: new Date().toISOString(),
        removedByUserId: user.id,
      };
      state.removedContextQuestions = [
        ...state.removedContextQuestions.filter((item) => item.questionRuleId !== removed.questionRuleId),
        record,
      ];
      state.contextAnswers = upsertByCode(state.contextAnswers, emptyContextAnswer(removed.questionRuleId));
      state.patientContextConfirmed = false;
      if (removed.reasonCode === 'RULE_APPEARS_INCORRECT') {
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId,
          action: 'RENEW_CONDITIONAL_RULE_FLAGGED',
          module: 'CONSULTATIONS',
          newValue: {
            questionRuleId: removed.questionRuleId,
            reason: 'RULE_APPEARS_INCORRECT',
          },
        });
      }
    }

    if (body.restoreQuestionIds?.length) {
      const restore = new Set(body.restoreQuestionIds);
      state.removedContextQuestions = state.removedContextQuestions.filter((item) => !restore.has(item.questionRuleId));
      for (const id of restore) {
        state.contextAnswers = upsertByCode(state.contextAnswers, emptyContextAnswer(id));
      }
      state.patientContextConfirmed = false;
    }

    if (body.additionalNote !== undefined) {
      const note = body.additionalNote?.trim() ?? '';
      if (note.length > 500) {
        throw new BadRequestException('Additional details must be 500 characters or fewer.');
      }
      state.contextAdditionalNote = note || null;
    }

    if (body.confirmed) {
      const nextView = await this.buildView({ ...payload, monitoringSafety: state });
      const incomplete = nextView.model.patientContext.filter((row) => !isContextComplete(row));
      if (incomplete.length) {
        throw new BadRequestException('Answer or remove remaining patient-specific questions before continuing.');
      }
      state.patientContextConfirmed = true;
    }

    return this.persistAndView(consultationId, payload, state);
  }

  async extractResults(
    consultationId: string,
    user: RequestUser,
    files: Express.Multer.File[],
    sourceType: 'PASTED_SCREENSHOT' | 'UPLOADED_DOCUMENT',
    note?: string,
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    await this.ensureLibrary();
    const defs = await this.listInputs();
    const view = await this.buildView(payload);
    const requested = view.model.monitoring.map((row) => ({
      code: row.inputCode,
      label: row.label,
      aliases: defs.find((d) => d.code === row.inputCode)?.aliases ?? [],
    }));
    const sourceLabel = sourceType === 'PASTED_SCREENSHOT' ? 'Pasted screenshot' : 'Uploaded document';

    try {
      const extracted = await this.labExtractor.extractMany(files, note);
      const candidates = mapExtractedCandidates(
        extracted.labValues,
        requested,
        extracted.reportDate,
        sourceLabel,
      );
      const record: RenewMonitoringExtraction = {
        id: `rext_${randomBytes(8).toString('hex')}`,
        sourceType,
        status: 'PENDING_REVIEW',
        candidates,
        extraDetectedCount: Math.max(0, extracted.labValues.length - candidates.length),
        createdAt: new Date().toISOString(),
      };
      const next: RenewMonitoringSafetyState = {
        ...payload.monitoringSafety,
        extractions: [
          ...payload.monitoringSafety.extractions.filter((row) => row.status !== 'PENDING_REVIEW'),
          record,
        ],
      };
      return this.persistAndView(consultationId, payload, next);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'We could not reliably extract monitoring results from this file. You can try another image or enter the result manually.';
      this.logger.warn(`Renew monitoring extraction failed for ${consultationId}: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async confirmExtraction(
    consultationId: string,
    user: RequestUser,
    extractionId: string,
    selectedCodes?: string[],
  ): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const extraction = payload.monitoringSafety.extractions.find((row) => row.id === extractionId);
    if (!extraction || extraction.status !== 'PENDING_REVIEW') {
      throw new NotFoundException('Extraction is no longer awaiting review.');
    }
    const allow = new Set(selectedCodes?.length ? selectedCodes : extraction.candidates.map((c) => c.inputCode));
    let results = payload.monitoringSafety.results;
    for (const candidate of extraction.candidates) {
      if (!allow.has(candidate.inputCode)) continue;
      if (candidate.numericValue == null && !candidate.valueText && candidate.secondaryNumericValue == null) {
        continue;
      }
      results = upsertByCode(results, {
        inputCode: candidate.inputCode,
        status: 'AVAILABLE',
        value: {
          numericValue: candidate.numericValue,
          secondaryNumericValue: candidate.secondaryNumericValue,
          valueText: candidate.valueText,
          unit: candidate.unit,
        },
        observedDate: candidate.observedDate,
        sourceType: extraction.sourceType === 'PASTED_SCREENSHOT' ? 'PASTED_SCREENSHOT' : 'UPLOADED_DOCUMENT',
        sourceLabel: candidate.sourceLabel,
        note: null,
        pharmacistConfirmed: true,
      });
    }
    const next: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      results,
      extractions: payload.monitoringSafety.extractions.map((row) =>
        row.id === extractionId ? { ...row, status: 'CONFIRMED' } : row,
      ),
      completed: false,
      completedAt: null,
    };
    return this.persistAndView(consultationId, payload, next);
  }

  async rejectExtraction(consultationId: string, user: RequestUser, extractionId: string): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    const payload = parseRenewPayload(consultation.renewPayload);
    const next: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      extractions: payload.monitoringSafety.extractions.map((row) =>
        row.id === extractionId ? { ...row, status: 'REJECTED' } : row,
      ),
    };
    return this.persistAndView(consultationId, payload, next);
  }

  async complete(consultationId: string, user: RequestUser): Promise<RenewStep3View> {
    const consultation = await this.requireRenewConsultation(consultationId, user);
    await this.ensureLibrary();
    const payload = parseRenewPayload(consultation.renewPayload);
    this.assertPrerequisites(payload);
    const view = await this.buildView(payload);
    if (!view.model.gate.ok) {
      throw new BadRequestException('Review remaining monitoring items before continuing.');
    }
    const next: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      completed: true,
      completedAt: new Date().toISOString(),
      requirementFingerprint: view.fingerprint,
    };
    await this.persist(consultationId, payload, next, view.fingerprint, 3, ConsultationStep.RENEW_DECISION);
    return (await this.buildView({ ...payload, monitoringSafety: next })).model;
  }

  async ensureLibrary() {
    if (this.libraryReady) return;
    const governed = await this.prisma.renewMonitoringInput.count({
      where: { sourceBatchId: { not: null } },
    });
    if (governed > 0) {
      this.libraryReady = true;
      return;
    }
    const count = await this.prisma.renewMonitoringInput.count();
    if (count === 0) await this.seedLibrary();
    else await this.upsertMissing();
    this.libraryReady = true;
  }

  private async persistAndView(
    consultationId: string,
    payload: RenewPayload,
    monitoringSafety: RenewMonitoringSafetyState,
  ): Promise<RenewStep3View> {
    const nextPayload = { ...payload, monitoringSafety };
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { demographics: true },
    });
    const view = await this.buildView(nextPayload, consultation?.demographics);
    await this.persist(consultationId, nextPayload, view.state, view.fingerprint);
    return view.model;
  }

  private async buildView(
    payload: RenewPayload,
    demographics?: unknown,
  ): Promise<{
    model: RenewStep3View;
    state: RenewMonitoringSafetyState;
    fingerprint: string;
  }> {
    const items = payload.medicationList.items;
    const mappings = payload.therapyReview.mappings.filter(isIndicationResolved);
    const conditionIds = [...new Set(mappings.map((row) => row.conditionId).filter((id): id is string => Boolean(id)))];
    const conditionRows = conditionIds.length
      ? await this.prisma.renewCondition.findMany({
          where: { id: { in: conditionIds } },
          select: { id: true, code: true, displayName: true },
        })
      : [];
    const indications: MonitoringIndication[] = [];
    const seenIndication = new Set<string>();
    for (const mapping of mappings) {
      const catalog = mapping.conditionId
        ? conditionRows.find((row) => row.id === mapping.conditionId)
        : null;
      const code = catalog?.code ?? null;
      const label = catalog?.displayName ?? mapping.customIndicationText?.trim() ?? null;
      if (!label) continue;
      const key = `${code ?? ''}:${label}`;
      if (seenIndication.has(key)) continue;
      seenIndication.add(key);
      indications.push({ code, label });
    }
    const indicationCodesByConditionId = new Map<string, string[]>();
    for (const row of conditionRows) {
      indicationCodesByConditionId.set(row.id, [row.code]);
    }
    if (conditionIds.length) {
      const aliases = await this.prisma.renewConditionAlias.findMany({
        where: { conditionId: { in: conditionIds }, active: true },
        select: { conditionId: true, alias: true, normalizedAlias: true },
      });
      for (const alias of aliases) {
        const current = indicationCodesByConditionId.get(alias.conditionId) ?? [];
        current.push(alias.alias, alias.normalizedAlias);
        indicationCodesByConditionId.set(alias.conditionId, current);
      }
    }

    const fingerprint = requirementFingerprint(
      items.map((med) => med.id).concat(mappings.map((row) => row.conditionId ?? '')),
    );
    const state: RenewMonitoringSafetyState = {
      ...payload.monitoringSafety,
      results: [...payload.monitoringSafety.results],
      contextAnswers: [...payload.monitoringSafety.contextAnswers],
      removedContextQuestions: [...(payload.monitoringSafety.removedContextQuestions ?? [])],
      removedMonitoringItems: [...(payload.monitoringSafety.removedMonitoringItems ?? [])],
      extraMonitoringCodes: [...(payload.monitoringSafety.extraMonitoringCodes ?? [])],
    };

    const resolved = await this.step3Resolver.resolve(items, mappings, state, indicationCodesByConditionId);
    const defs = await this.listInputs();
    const allMonitoring = await this.appendExtraMonitoring(resolved.monitoring, items, state, defs);
    const removedIds = new Set(state.removedContextQuestions.map((row) => row.questionRuleId));
    const priors = patientInfoPriorsFromDemographics(demographics);
    const allContext = attachPatientInfoPriors(resolved.context, priors);
    const visibleContext = allContext.filter((row) => row.visible && !removedIds.has(row.inputCode));
    this.promoteTriggeredConditionals(allMonitoring, visibleContext);
    const removedMonitoringIds = new Set(state.removedMonitoringItems.map((row) => row.inputCode));
    const removedMonitoringItems = state.removedMonitoringItems.map((row) => {
      const source = allMonitoring.find((item) => item.inputCode === row.inputCode);
      return {
        ...row,
        label: source?.label ?? row.inputCode,
        medicationNames: source?.medicationNames ?? [],
      };
    });
    const activeMonitoring = allMonitoring.filter((row) => !removedMonitoringIds.has(row.inputCode));
    const monitoring = activeMonitoring.filter((row) => (row.presentationTier ?? 'CORE') !== 'ADDITIONAL');
    const additionalMonitoring = activeMonitoring.filter((row) => row.presentationTier === 'ADDITIONAL');
    const removedContextQuestions = state.removedContextQuestions.map((row) => {
      const source = allContext.find((item) => item.inputCode === row.questionRuleId);
      return {
        ...row,
        label: source?.label ?? 'Removed question',
        medicationNames: source?.medicationNames ?? [],
      };
    });

    const safety = await this.evaluateSafety(items, payload, activeMonitoring, visibleContext);
    const workflowFindings = this.step3Resolver.workflowFindings(visibleContext);
    if (workflowFindings.length) {
      const extra: RenewSafetyFindingSummary[] = workflowFindings.map((finding) => ({
        key: finding.key,
        summary: finding.summary,
        detail: finding.detail,
        clinicalSeverity: finding.clinicalSeverity,
        recommendedAction: finding.recommendedAction,
        inputCode: finding.inputCode,
      }));
      safety.findings = dedupeFindings([...extra, ...safety.findings]);
      if (safety.findings.some((row) => row.clinicalSeverity === 'AVOID' || row.clinicalSeverity === 'REVIEW_REQUIRED')) {
        safety.status = 'review_required';
        safety.headline = `${safety.findings.length} item${safety.findings.length === 1 ? '' : 's'} need review`;
        safety.detail = safety.findings.map((row) => row.summary).join(' · ');
      }
    }
    for (const finding of safety.findings) {
      if (!finding.inputCode) continue;
      const idx = monitoring.findIndex((row) => row.inputCode === finding.inputCode);
      if (idx < 0) continue;
      const current = monitoring[idx]!;
      if (current.result.status === 'AVAILABLE' || current.result.status === 'CONCERNING') {
        const concerning: RenewMonitoringResult = { ...current.result, status: 'CONCERNING' };
        monitoring[idx] = { ...current, result: concerning };
        state.results = upsertByCode(state.results, concerning);
      }
    }

    const sections: RenewStep3View['sections'] = [];
    if (visibleContext.length) sections.push('PATIENT_CONTEXT');
    if (monitoring.length || additionalMonitoring.length) sections.push('MONITORING');
    sections.push('SAFETY_REVIEW');

    return {
      fingerprint,
      state: { ...state, requirementFingerprint: fingerprint },
      model: {
        patientContext: visibleContext,
        monitoring,
        safetySummary: safety,
        gate: (() => {
          const gate = evaluatePresentedMonitoringGate({
            monitoring,
            context: visibleContext,
            findings: safety.findings,
            acknowledgedFindingKeys: state.acknowledgedFindingKeys,
            itemReviews: state.itemReviews,
            indications,
          });
          const contextConfirmed = visibleContext.length === 0 || state.patientContextConfirmed;
          const monitoringOk = monitoring.length === 0 || state.monitoringConfirmed;
          return { ...gate, ok: gate.ok && contextConfirmed && monitoringOk };
        })(),
        sections,
        pendingExtraction: state.extractions.find((row) => row.status === 'PENDING_REVIEW') ?? null,
        itemReviews: state.itemReviews ?? [],
        indications,
        uncoveredMedications: [],
        usedPublishedConfig: resolved.usedPublishedConfig,
        removedContextQuestions,
        removedMonitoringItems,
        additionalMonitoring,
        otherResultOptions: otherResultChoices(defs, monitoring, additionalMonitoring),
        contextAdditionalNote: state.contextAdditionalNote ?? null,
        patientContextConfirmed: state.patientContextConfirmed,
        lastContextBulkActionId: state.lastContextBulkActionId ?? null,
        patientContextBulkAcked: state.patientContextBulkAcked,
        monitoringConfirmed: state.monitoringConfirmed,
      },
    };
  }

  private async evaluateSafety(
    items: RenewMedication[],
    payload: RenewPayload,
    monitoring: RenewMonitoringRequirement[],
    context: RenewPatientContextRequirement[],
  ): Promise<RenewSafetySummary> {
    const unavailableCount = monitoring.filter((row) => row.result.status === 'UNAVAILABLE').length;
    const labs = monitoring
      .filter((row) => {
        if (row.result.status !== 'AVAILABLE' && row.result.status !== 'CONCERNING') return false;
        const validation = validateMonitoringResultUnit({
          inputCode: row.inputCode,
          resultUnit: row.result.value?.unit ?? null,
          expectedUnit: row.unit,
          numericValue: row.result.value?.numericValue ?? null,
          secondaryNumericValue: row.result.value?.secondaryNumericValue ?? null,
        });
        // Spec: do not send incompatible results into clinical safety interpretation.
        return validation.compatible;
      })
      .map((row) => ({
        name: row.inputCode.replace(/_/g, ' '),
        value:
          row.valueShape === 'SYSTOLIC_DIASTOLIC'
            ? `${row.result.value?.numericValue ?? ''}/${row.result.value?.secondaryNumericValue ?? ''}`
            : String(row.result.value?.numericValue ?? row.result.value?.valueText ?? ''),
        unit: row.result.value?.unit?.trim() || row.unit || undefined,
        observedAt: row.result.observedDate ?? undefined,
      }));
    const pregnancy = context.find(
      (row) => row.inputCode === 'PREGNANCY_ONGOING' || row.inputCode === 'PREGNANCY_STATUS',
    );
    const gestational = context.find((row) => row.inputCode === 'GESTATIONAL_AGE');
    const age = context.find((row) => row.inputCode === 'AGE');
    const weight = context.find((row) => row.inputCode === 'WEIGHT');
    const pregnantText = pregnancy?.answer.valueText?.toLowerCase() ?? '';
    const isPregnant =
      pregnantText === 'yes' || pregnantText.includes('ongoing') || pregnantText.includes('pregnant');

    try {
      const evaluation = await this.safetyEvaluator.evaluate({
        patientContext: {
          allergies: [],
          age: age?.answer.numericValue ?? undefined,
          weightKg: weight?.answer.numericValue ?? undefined,
          pregnancy: pregnancy?.answer.valueText
            ? {
                status: isPregnant ? 'pregnant' : 'not_pregnant',
                trimester: gestational?.answer.numericValue
                  ? gestational.answer.numericValue <= 13
                    ? '1'
                    : gestational.answer.numericValue <= 27
                      ? '2'
                      : '3'
                  : undefined,
                gestationalAgeWeeks: gestational?.answer.numericValue ?? undefined,
              }
            : undefined,
          labs,
        },
        selectedMedications: items.map((med) => ({
          productName: medicationDisplayName(med),
          genericName: med.normalized.genericName ?? undefined,
        })),
      });

      const findings: RenewSafetyFindingSummary[] = evaluation.findings.map((finding) => ({
        key: `${finding.findingType}:${finding.ruleCode ?? finding.summary}`,
        summary: finding.summary,
        detail: finding.detail,
        clinicalSeverity: finding.clinicalSeverity,
        recommendedAction: finding.recommendedAction ?? null,
        inputCode: matchFindingToInput(finding.summary, finding.detail, monitoring),
      }));
      const review = findings.filter(
        (row) => row.clinicalSeverity === 'AVOID' || row.clinicalSeverity === 'REVIEW_REQUIRED',
      );
      if (review.length) {
        return {
          status: 'review_required',
          headline: `${review.length} item${review.length === 1 ? '' : 's'} need${review.length === 1 ? 's' : ''} review`,
          detail: review.map((row) => row.summary).join(' · '),
          findings: review,
          unavailableCount,
        };
      }
      if (evaluation.status === 'SERVICE_UNAVAILABLE') {
        return {
          status: 'unavailable',
          headline: 'Safety review is temporarily unavailable',
          detail: 'Proceed using pharmacist professional judgment.',
          findings: [],
          unavailableCount,
        };
      }
      return clearSafety(unavailableCount);
    } catch (error) {
      this.logger.warn(`Renew safety evaluation failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return {
        status: 'unavailable',
        headline: 'Safety review is temporarily unavailable',
        detail: 'Proceed using pharmacist professional judgment.',
        findings: [],
        unavailableCount,
      };
    }
  }

  private async appendExtraMonitoring(
    monitoring: RenewMonitoringRequirement[],
    items: RenewMedication[],
    state: RenewMonitoringSafetyState,
    defs: RenewMonitoringInputDef[],
  ): Promise<RenewMonitoringRequirement[]> {
    const names = items.map(medicationShortName);
    const ids = items.map((med) => med.id);
    const next = [...monitoring];
    for (const code of state.extraMonitoringCodes) {
      if (next.some((row) => row.inputCode === code)) {
        const idx = next.findIndex((row) => row.inputCode === code);
        if (idx >= 0) next[idx] = { ...next[idx]!, addedManually: true, presentationTier: 'CORE' };
        continue;
      }
      const def = defs.find((row) => row.code === code);
      if (!def || def.inputType === 'PATIENT_CONTEXT') continue;
      const saved = state.results.find((row) => row.inputCode === def.code) ?? emptyMonitoringResult(def.code);
      if (!state.results.some((row) => row.inputCode === def.code)) state.results.push(saved);
      const removal = monitoringItemRemovable({ requirement: 'RELEVANT', actionIfMissing: 'REVIEW' });
      next.push({
        inputCode: def.code,
        label: def.label,
        inputType: def.inputType as RenewMonitoringRequirement['inputType'],
        valueShape: def.valueShape,
        unit: def.unit,
        medicationIds: ids,
        medicationNames: names,
        result: saved,
        requirement: 'RELEVANT',
        allowDate: def.allowDate ?? true,
        allowNotAvailable: def.allowNotAvailable ?? true,
        normalRangeDisplay: def.normalRangeDisplay ?? null,
        presentationTier: 'CORE',
        removable: removal.removable,
        overrideRequiresReason: false,
        addedManually: true,
      });
    }
    return next;
  }

  private promoteTriggeredConditionals(
    monitoring: RenewMonitoringRequirement[],
    context: RenewPatientContextRequirement[],
  ) {
    const muscleReported = context.some((row) => {
      const blob = `${row.inputCode} ${row.label}`.toLowerCase();
      const yes = (row.answer.valueText ?? '').trim().toLowerCase() === 'yes';
      return yes && /muscle|myalg|ck|cramp/.test(blob);
    });
    if (!muscleReported) return;
    for (const row of monitoring) {
      if (row.inputCode === 'CK' || row.inputCode === 'CREATINE_KINASE') {
        row.presentationTier = 'CORE';
        row.addedBecause = 'Added because new muscle symptoms were reported.';
      }
    }
  }

  private validateValue(
    def: RenewMonitoringInputDef,
    body: { numericValue?: number | null; secondaryNumericValue?: number | null; observedDate?: string | null },
  ) {
    if (def.valueShape === 'SYSTOLIC_DIASTOLIC') {
      if (body.numericValue == null || body.secondaryNumericValue == null) {
        throw new BadRequestException('Enter both systolic and diastolic values.');
      }
    } else if (
      (def.valueShape === 'NUMERIC' || def.valueShape === 'NUMBER') &&
      body.numericValue == null
    ) {
      throw new BadRequestException(`Enter a ${def.label} value.`);
    }
    if (body.observedDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.observedDate)) {
      throw new BadRequestException('Use a date in YYYY-MM-DD format.');
    }
  }

  private async listInputs(): Promise<RenewMonitoringInputDef[]> {
    const rows = await this.prisma.renewMonitoringInput.findMany({
      where: { active: true },
      orderBy: [{ displayPriority: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toInputDef);
  }

  private async seedLibrary() {
    for (const input of RENEW_STARTER_MONITORING_INPUTS) await this.upsertInput(input);
    await this.upsertRules();
  }

  private async upsertMissing() {
    for (const input of RENEW_STARTER_MONITORING_INPUTS) {
      const existing = await this.prisma.renewMonitoringInput.findUnique({ where: { code: input.code } });
      if (!existing) await this.upsertInput(input);
    }
    await this.upsertRules();
  }

  private async upsertInput(input: (typeof RENEW_STARTER_MONITORING_INPUTS)[number]) {
    await this.prisma.renewMonitoringInput.upsert({
      where: { code: input.code },
      update: {
        label: input.label,
        inputType: input.inputType,
        valueShape: input.valueShape,
        unit: input.unit,
        aliases: input.aliases,
        displayPriority: input.displayPriority,
        uiComponent: input.uiComponent ?? undefined,
        active: true,
      },
      create: {
        code: input.code,
        label: input.label,
        inputType: input.inputType,
        valueShape: input.valueShape,
        unit: input.unit,
        aliases: input.aliases,
        displayPriority: input.displayPriority,
        uiComponent: input.uiComponent ?? undefined,
      },
    });
  }

  private async upsertRules() {
    const inputs = await this.prisma.renewMonitoringInput.findMany({ select: { id: true, code: true } });
    const byCode = new Map(inputs.map((row) => [row.code, row.id]));
    const existing = await this.prisma.renewMonitoringRule.findMany({
      select: { inputId: true, matchType: true, ingredientKey: true, conditionCode: true },
    });
    const seen = new Set(
      existing.map((row) => `${row.inputId}:${row.matchType}:${row.ingredientKey ?? ''}:${row.conditionCode ?? ''}`),
    );
    for (const rule of RENEW_STARTER_MONITORING_RULES) {
      const inputId = byCode.get(rule.inputCode);
      if (!inputId) continue;
      const key = `${inputId}:${rule.matchType}:${rule.ingredientKey ?? ''}:${rule.conditionCode ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await this.prisma.renewMonitoringRule.create({
        data: {
          inputId,
          matchType: rule.matchType,
          ingredientKey: rule.ingredientKey,
          conditionCode: rule.conditionCode,
          triggerSourceCode: rule.triggerSourceCode,
          triggerValue: rule.triggerValue,
        },
      });
    }
  }

  private async persist(
    consultationId: string,
    payload: RenewPayload,
    monitoringSafety: RenewMonitoringSafetyState,
    fingerprint: string,
    stepIndex?: number,
    currentStep?: ConsultationStep,
  ) {
    const next: RenewPayload = {
      ...payload,
      monitoringSafety: { ...monitoringSafety, requirementFingerprint: fingerprint },
    };
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        renewPayload: JSON.parse(JSON.stringify(next)) as Prisma.InputJsonValue,
        ...(stepIndex != null
          ? { stepIndex, currentStep: currentStep ?? ConsultationStep.RENEW_CLINICAL_ASSESSMENT }
          : {}),
      },
    });
  }

  private async requireRenewConsultation(id: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    if (consultation.module !== SAFESCRIBE_MODULES.RENEW) {
      throw new BadRequestException('Monitoring & Safety is only available on Renew consultations');
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
      throw new BadRequestException('Confirm the medication list in Step 1 before monitoring & safety.');
    }
    if (!therapyIndicationsReady(payload.medicationList.items, payload.therapyReview)) {
      throw new BadRequestException('Complete therapy review indications before monitoring & safety.');
    }
  }
}

function otherResultChoices(
  defs: RenewMonitoringInputDef[],
  core: RenewMonitoringRequirement[],
  additional: RenewMonitoringRequirement[],
): Array<{ inputCode: string; label: string; unit: string | null }> {
  const used = new Set([...core, ...additional].map((row) => row.inputCode));
  return defs
    .filter((row) => row.inputType !== 'PATIENT_CONTEXT' && !used.has(row.code))
    .map((row) => ({ inputCode: row.code, label: row.label, unit: row.unit }));
}

function toInputDef(row: {
  code: string;
  label: string;
  inputType: string;
  valueShape: string;
  unit: string | null;
  aliases: string[];
  displayPriority: number;
  uiComponent?: string | null;
  allowDate?: boolean;
  allowNotAvailable?: boolean;
  normalRangeDisplay?: string | null;
}): RenewMonitoringInputDef {
  return {
    code: row.code,
    label: row.label,
    inputType: row.inputType as RenewMonitoringInputDef['inputType'],
    valueShape: row.valueShape as RenewMonitoringInputDef['valueShape'],
    unit: row.unit,
    aliases: row.aliases,
    displayPriority: row.displayPriority,
    uiComponent: row.uiComponent,
    allowDate: row.allowDate,
    allowNotAvailable: row.allowNotAvailable,
    normalRangeDisplay: row.normalRangeDisplay,
  };
}

function upsertResult(state: RenewMonitoringSafetyState, result: RenewMonitoringResult): RenewMonitoringSafetyState {
  return {
    ...state,
    results: upsertByCode(state.results, result),
    itemReviews: (state.itemReviews ?? []).filter((row) => row.inputCode !== result.inputCode),
    completed: false,
    completedAt: null,
  };
}

function upsertByCode<T extends { inputCode: string }>(list: T[], next: T): T[] {
  return list.some((row) => row.inputCode === next.inputCode)
    ? list.map((row) => (row.inputCode === next.inputCode ? next : row))
    : [...list, next];
}

function mapExtractedCandidates(
  labValues: Array<{ test: string; value: string; unit?: string; observedDate?: string; confidence: number }>,
  requested: Array<{ code: string; label: string; aliases: string[] }>,
  reportDate?: string,
  sourceLabel = 'Uploaded results',
): ExtractedMonitoringCandidate[] {
  const out: ExtractedMonitoringCandidate[] = [];
  const used = new Set<string>();
  for (const lab of labValues) {
    const code = matchExtractionToCode(lab.test, requested);
    if (!code || used.has(code)) continue;
    used.add(code);
    const bp = parseBloodPressure(lab.value);
    out.push({
      inputCode: code,
      valueText: lab.value,
      numericValue: bp ? bp.systolic : parseNumeric(lab.value),
      secondaryNumericValue: bp?.diastolic ?? null,
      unit: lab.unit ?? (code === 'BP' ? 'mmHg' : null),
      observedDate: normalizeDate(lab.observedDate) ?? normalizeDate(reportDate),
      sourceLabel,
      confidence: lab.confidence > 1 ? lab.confidence / 100 : lab.confidence,
      evidenceText: `${lab.test} ${lab.value}`.trim(),
    });
  }
  return out;
}

function parseNumeric(value: string): number | null {
  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function parseBloodPressure(value: string): { systolic: number; diastolic: number } | null {
  const match = value.replace(/\s/g, '').match(/^(\d{2,3})\s*[\/]\s*(\d{2,3})/);
  if (!match) return null;
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

function normalizeDate(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function matchFindingToInput(
  summary: string,
  detail: string,
  monitoring: RenewMonitoringRequirement[],
): string | null {
  const blob = `${summary} ${detail}`.toLowerCase();
  for (const row of monitoring) {
    if (blob.includes(row.label.toLowerCase()) || blob.includes(row.inputCode.toLowerCase())) {
      return row.inputCode;
    }
  }
  return null;
}

function clearSafety(unavailableCount: number): RenewSafetySummary {
  return {
    status: 'clear',
    headline: unavailableCount
      ? 'No additional medication safety issues identified'
      : 'No additional medication safety issues identified',
    detail: unavailableCount
      ? 'Some monitoring information is unavailable. Proceed using pharmacist professional judgment.'
      : 'Proceed with pharmacist judgment.',
    findings: [],
    unavailableCount,
  };
}

function dedupeFindings(findings: RenewSafetyFindingSummary[]): RenewSafetyFindingSummary[] {
  const seen = new Set<string>();
  const out: RenewSafetyFindingSummary[] = [];
  for (const finding of findings) {
    const key = `${finding.inputCode ?? ''}:${finding.summary}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

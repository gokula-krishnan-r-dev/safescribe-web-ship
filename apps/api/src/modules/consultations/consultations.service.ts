import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import { TranscriptExtractorService } from './transcript-extractor.service';
import { LabReportExtractorService } from './lab-report-extractor.service';
import {
  ClinicalPhotoAnalyzerService,
  type ClinicalPhotoAnalysisResult,
} from './clinical-photo-analyzer.service';
import { MedicationSafetyService } from '@/modules/medication-safety/medication-safety.service';
import {
  containsIngredient,
  expandDrugTokens,
  findingsApplyToProduct,
  normalizeDrugKey as normalizeAllergyDrugKey,
  splitAllergyInputs,
} from '@/modules/medication-safety/utils/drug-name.util';
import { parseGestationalAgeWeeks } from '@/modules/medication-safety/utils/gestational-interval.util';
import { DocFormatService } from '@/modules/doc-format/doc-format.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import { TreatmentSafetyService } from '@/modules/terminology/treatment-safety.service';
import { ObjectStorageService } from '@/modules/storage/object-storage.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import type { Request, Response } from 'express';
import {
  CreateConsultationDto,
  SaveStepDto,
  UpdateTranscriptDto,
  SelectPathwayDto,
  ConsultationListQueryDto,
  SaveReferralOutcomeDto,
  CreateReferralLetterDto,
  DraftReferralReasonDto,
  UpdateReferralLetterDraftDto,
  ApproveReferralLetterDto,
  CompleteConsultationDto,
} from './dto/consultation.dto';
import { ConsultationDeletionService } from './consultation-deletion.service';
import { PathwayClinicalJudgementService } from './pathway-clinical-judgement.service';
import { GoogleHandoutTranslateClient } from './google-handout-translate.client';
import {
  handoutTranslationCacheKey,
  translateErrorSummary,
} from './google-handout-translate.util';
import { RedisService } from '@/redis/redis.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { RenewMedicationExtractorService } from './renew-medication-extractor.service';
import { RenewMedicationNormalizerService } from './renew-medication-normalizer.service';
import { mapSafetyEvalToMedication, pathwayDrugReference, patientContextVersionFrom, applyMappedSafetyToTreatment } from './treatment-safety-flags';
import {
  ConsultationMode,
  ConsultationStatus,
  ReferralLetterRecordStatus,
  ReferralOutcomeRecordStatus,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { extname } from 'path';
import {
  normalizePatientDemographics,
  isClinicalYes,
  isPatientPregnant,
  ageYearsFromDemographics,
  PREGNANCY_TREATMENT_CAUTION_MESSAGE,
  resolveTreatmentWarningReason,
  describeSafetyFindingSource,
  computeIntakeFingerprint,
  readIntakeAnalysisMeta,
  computeTreatmentPlanHash,
  readTreatmentPlanConfirmation,
  composeCounsellingSections,
  MAX_HOW_TO_USE_TREATMENTS,
  resolveGuidanceSection,
  selectFollowupsForCounselling,
  selectPathwayGuidanceForCounselling,
  isUsablePatientGuidanceText,
  buildActiveConsultationDisplayLabel,
  mapConsultationStepToWorkflowStage,
  emptyRenewPayload,
  emptyAdaptPayload,
  parseAdaptPayload,
  adaptStep1IndicationLabel,
  parseRenewPayload,
  isEmptyTherapyReview,
  isEmptyMonitoringSafety,
  isEmptyRenewalDecision,
  evaluateRenewStep4Gate,
  renewDisplayLabel,
  findRenewDuplicates,
  mergeExtractedDuplicates,
  prefillVerifiedFrom,
  SAFESCRIBE_MODULES,
  validateCounsellingOutput,
  counsellingPayloadMeta,
  PCP_CLOSING_SENTENCE,
  PCP_LETTER_TITLE,
  DAP_NOTE_TITLE,
  buildPcpSignatureBlock,
  repairPcpCommunicationFields,
  toLlmPcpPayload,
  repairPatientCareSummaryFields,
  repairDapNoteFields,
  toLlmDapPayload,
  validatePcpCommunication,
  validatePatientCareSummary,
  validateDapNote,
  buildCanonicalHandoutPayload,
  englishHandoutFieldsFromPayload,
  coercePatientHandoutLlmOutput,
  patientHandoutGenerationAllowed,
  cacheableHandoutTranslationFields,
  fieldsFromTranslatedHandout,
  hashCanonicalHandout,
  isReusableHandoutTranslation,
  isSupportedHandoutLanguage,
  normalizeHandoutLanguage,
  translateCanonicalHandout,
  type PcpCommunicationPayload,
  type PatientSummaryPayload,
  type DapPayload,
  type SafetyEngineSource,
  parseConsultationClinicalReferences,
  preferClinicalReferences,
  formatPathwayDocumentChromeFromEvidenceSnapshot,
  readClinicalAssessment,
  resolveDocumentationCitationLine,
  SAFETY_ALERT_LABEL,
  classifyTreatmentDuplicate,
  dropPharmacistAddedDuplicates,
  identityFromTreatmentRecord,
  isPharmacistAddedMedication,
  isStandardMedication,
  remapSelectedIndexes,
  SAFETY_EVAL_STATUSES,
  sanitizeTreatmentSafety,
  buildReferralLetterPayload,
  buildReferralLetterAiInput,
  resolveReferralLetterFromAi,
  parseAiReferralLetterSections,
  buildReferralLetterDocument,
  serializeReferralLetterDocument,
  parseReferralLetterDocument,
  patientIdentityComplete,
  senderIdentityComplete,
  referralLetterRenderedText,
  urgencyRank,
  buildPathwayRoutingRepresentation,
  isPathwayEnabledForProvince,
  matchLevelFromScore,
  provinceFromTimezone,
  rankPathwaysByRoutingMetadata,
  documentationLlmKeysToGenerate,
  documentationLlmRetryKeys,
  documentationDocumentHasContent,
  computeDocumentationSourceHash,
  REFERRAL_REASON_DRAFT_PROMPT,
  handlingMethodFromStorage,
  handlingMethodToStorage,
  handlingRecordIsComplete,
  parseIsoDateLocal,
  recordedAgeFromDemographics,
  patientSnapshotVersion,
} from '@safescript/shared';
import {
  applyAuthoritativeDob,
  applyMatchingDob,
  revertDocumentationDob,
  consultationDateOnly,
  demographicsAgeFields,
  evaluateStoredOptionalDob,
  isManualAgeIntake,
  markDocumentsStale,
  markTreatmentPlanStale,
  sanitizeDocumentationDob,
  unresolvedDocumentationDob,
  withDocumentationDob,
} from './optional-dob.util';
import {
  assertReferralLetterGate,
  assertReferralTriggersActive,
  buildDocumentationFromOutcome,
  buildServerTriggerSnapshot,
  fingerprintFromOutcomeFields,
  hashLetterContent,
  mapDbLetterStatusToApi,
  validateAndNormalizeReferralFields,
} from './referral-outcome.util';
import {
  buildReferralReasonDraftPackage,
  collectConfirmedFacts,
  fallbackReferralReasonDraft,
  resolveReferralReasonFromAi,
  toReferralReasonLlmPayload,
} from './referral-reason-draft.util';
import { buildCounsellingLlmPayload } from './counselling-payload.builder';
import { buildDapPayloadFromConsultation } from './dap-payload.builder';
import { buildPcpCommunicationPayloadFromConsultation } from './pcp-communication-payload.builder';
import { buildPatientSummaryPayloadFromConsultation } from './patient-summary-payload.builder';
import { treatmentPlanHasPrescription } from './document-completion.util';
import { isReusableBlankWorkspace } from './blank-workspace.util';

type AttachmentMeta = {
  id: string;
  fileName: string;
  /** Authenticated API path used by the web app to fetch the file */
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  storageKey?: string;
  storageProvider?: 'gcs' | 'local';
};

/** Common tokens ignored when matching pathways to a transcript */
const STOP_WORDS = new Set([
  'with', 'from', 'that', 'this', 'have', 'been', 'were', 'they', 'their', 'them',
  'patient', 'pathway', 'test', 'clinical', 'assessment', 'treatment', 'guideline',
  'prescribing', 'pharmacy', 'condition', 'symptoms', 'symptom', 'other', 'than',
  'also', 'into', 'over', 'under', 'about', 'after', 'before', 'year', 'years',
  'old', 'male', 'female', 'and', 'the', 'for', 'are',
]);

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private aiEngine: AiEngineClient,
    private transcriptExtractor: TranscriptExtractorService,
    private medicationSafety: MedicationSafetyService,
    private labReportExtractor: LabReportExtractorService,
    private clinicalPhotoAnalyzer: ClinicalPhotoAnalyzerService,
    private docFormats: DocFormatService,
    private aiConfig: AiConfigService,
    private treatmentSafety: TreatmentSafetyService,
    private objectStorage: ObjectStorageService,
    private consultationDeletion: ConsultationDeletionService,
    private handoutTranslate: GoogleHandoutTranslateClient,
    private redis: RedisService,
    private entitlements: EntitlementsService,
    private pathwayClinicalJudgement: PathwayClinicalJudgementService,
    private renewExtractor: RenewMedicationExtractorService,
    private renewNormalizer: RenewMedicationNormalizerService,
  ) {}

  // ── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateConsultationDto, user: RequestUser, req: Request) {
    const module =
      dto.module === SAFESCRIBE_MODULES.ADAPT
        ? SAFESCRIBE_MODULES.ADAPT
        : dto.module === SAFESCRIBE_MODULES.RENEW
          ? SAFESCRIBE_MODULES.RENEW
          : SAFESCRIBE_MODULES.PRESCRIBE;
    if (module === SAFESCRIBE_MODULES.RENEW) {
      await this.entitlements.ensureDefaultRenew(user.tenantId);
    }
    if (module === SAFESCRIBE_MODULES.ADAPT) {
      await this.entitlements.ensureDefaultAdapt(user.tenantId);
    }
    await this.entitlements.assertNewConsultationAllowed(user.tenantId, module);

    const prefix =
      module === SAFESCRIBE_MODULES.ADAPT
        ? 'AD'
        : module === SAFESCRIBE_MODULES.RENEW
          ? 'RN'
          : 'CS';
    const consultationRef = `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;

    const consultation = await this.prisma.consultation.create({
      data: {
        tenantId: user.tenantId ?? null,
        pharmacistId: user.id,
        consultationRef,
        status: ConsultationStatus.DRAFT,
        stepIndex: 0,
        currentStep:
          module === SAFESCRIBE_MODULES.ADAPT || module === SAFESCRIBE_MODULES.RENEW
            ? 'RENEW_MEDICATIONS'
            : 'PRESENTING_COMPLAINT',
        module,
        renewPayload:
          module === SAFESCRIBE_MODULES.ADAPT
            ? JSON.parse(JSON.stringify(emptyAdaptPayload()))
            : module === SAFESCRIBE_MODULES.RENEW
              ? JSON.parse(JSON.stringify(emptyRenewPayload()))
              : undefined,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CREATE',
      module: 'CONSULTATIONS',
      newValue: { consultationId: consultation.id, ref: consultationRef, clinicalModule: module },
      ...this.getClientInfo(req),
    });

    return consultation;
  }

  /**
   * Open a fresh Prescribe/Renew workspace after login.
   * Reuses only an unused blank draft (no complaint, pathway, or captured work)
   * so concurrent landing requests do not mint duplicates. In-progress consults
   * stay in Active Consultations and are never auto-resumed.
   */
  async ensureWorkspace(dto: CreateConsultationDto, user: RequestUser, req: Request) {
    const module =
      dto.module === SAFESCRIBE_MODULES.ADAPT
        ? SAFESCRIBE_MODULES.ADAPT
        : dto.module === SAFESCRIBE_MODULES.RENEW
          ? SAFESCRIBE_MODULES.RENEW
          : SAFESCRIBE_MODULES.PRESCRIBE;

    const existing = await this.findReusableBlankWorkspaceId(user, module);
    if (existing) return { id: existing, created: false, module };

    const lockKey = `consult:workspace:${user.id}:${module}`;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const locked = await this.redis.setNx(lockKey, user.id, 8);
      if (locked) {
        try {
          const raced = await this.findReusableBlankWorkspaceId(user, module);
          if (raced) return { id: raced, created: false, module };
          const created = await this.create({ ...dto, module }, user, req);
          return { id: created.id, created: true, module };
        } finally {
          await this.redis.del(lockKey);
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 75));
      const waited = await this.findReusableBlankWorkspaceId(user, module);
      if (waited) return { id: waited, created: false, module };
    }

    const lastChance = await this.findReusableBlankWorkspaceId(user, module);
    if (lastChance) return { id: lastChance, created: false, module };
    const created = await this.create({ ...dto, module }, user, req);
    return { id: created.id, created: true, module };
  }

  // ── List ─────────────────────────────────────────────────────────────────

  async list(query: ConsultationListQueryDto, user: RequestUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // Scope by tenant for non-super-admin
    if (user.tenantId) {
      where.tenantId = user.tenantId;
    }

    // Pharmacists only see their own consultations
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isAdmin = user.role === 'PHARMACIST_ADMIN';
    if (!isSuperAdmin && !isAdmin) {
      where.pharmacistId = user.id;
    }

    if (query.status) where.status = query.status;
    if (query.module) where.module = query.module;
    else where.module = SAFESCRIBE_MODULES.PRESCRIBE;
    if (query.search) {
      where.OR = [
        { consultationRef: { contains: query.search, mode: 'insensitive' } },
        { chiefComplaint: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.activeSince) {
      const since = new Date(query.activeSince);
      if (!Number.isNaN(since.getTime())) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          {
            OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }],
          },
        ];
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.consultation.count({ where }),
      this.prisma.consultation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          consultationRef: true,
          status: true,
          currentStep: true,
          stepIndex: true,
          chiefComplaint: true,
          createdAt: true,
          updatedAt: true,
          submittedAt: true,
          pharmacist: { select: { id: true, firstName: true, lastName: true } },
          pathway: { select: { id: true, name: true, condition: true } },
        },
      }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Minimal work-queue projection for Active Consultations sidebar.
   * Only unfinished consultations the caller may access — no clinical payloads.
   */
  async listActive(user: RequestUser, module: string = SAFESCRIBE_MODULES.PRESCRIBE) {
    const deletionDeadline = this.consultationDeletion.getDeletionDeadlineIso();

    const rows = await this.prisma.consultation.findMany({
      where: this.activeWorkspaceWhere(user, module),
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        currentStep: true,
        selectedPathwayId: true,
        module: true,
        renewPayload: true,
        pathway: { select: { name: true, condition: true } },
      },
    });

    const consultations = rows.map((row) => {
      const pathwayConfirmed = Boolean(row.selectedPathwayId && row.pathway);
      const isRenew = row.module === SAFESCRIBE_MODULES.RENEW;
      return {
        id: row.id,
        startedAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        displayLabel: isRenew
          ? renewDisplayLabel(parseRenewPayload(row.renewPayload))
          : buildActiveConsultationDisplayLabel({
              pathwayConfirmed,
              pathwayName: row.pathway?.name,
              pathwayCondition: row.pathway?.condition,
            }),
        pathwayConfirmed: isRenew ? Boolean(parseRenewPayload(row.renewPayload).medicationList.confirmed) : pathwayConfirmed,
        workflowStage: mapConsultationStepToWorkflowStage(row.currentStep),
        deletionDeadline,
        module: row.module,
      };
    });

    return { count: consultations.length, consultations };
  }

  // ── Get One ──────────────────────────────────────────────────────────────

  async findOne(id: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        pharmacist: { select: { id: true, firstName: true, lastName: true, email: true } },
        tenant: { select: { id: true, name: true, faxNumber: true, phone: true, address: true, timezone: true } },
        referralOutcome: true,
        clinicalJudgmentAssessment: {
          include: {
            redFlagChecks: {
              orderBy: { updatedAt: 'desc' },
              take: 3,
              include: {
                questions: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    canonicalLabel: true,
                    questionText: true,
                    answer: true,
                    answerNotes: true,
                  },
                },
                manualConcerns: {
                  select: {
                    concernText: true,
                    responseStatus: true,
                  },
                },
              },
            },
          },
        },
        treatmentRationale: { include: { alternatives: true } },
        cjWorkflowVersion: true,
        pathway: {
          include: {
            sections: { orderBy: { displayOrder: 'asc' } },
            questions: {
              orderBy: [{ displayOrder: 'asc' }],
              include: { section: true },
            },
            rules: { orderBy: { severity: 'asc' } },
            treatments: { orderBy: { displayOrder: 'asc' } },
            counsellings: {
              where: { archivedAt: null },
              orderBy: { displayOrder: 'asc' },
            },
            followups: { orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });

    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);
    const { clinicalJudgmentAssessment, clinicalJudgmentRedFlagReview } =
      this.mapClinicalJudgmentRedFlagReview(consultation.clinicalJudgmentAssessment);
    return {
      ...consultation,
      treatmentPlan: this.sanitizePersistedTreatmentPlan(
        consultation.treatmentPlan,
        consultation,
      ),
      clinicalJudgmentAssessment,
      clinicalJudgmentRedFlagReview,
      deletionDeadline: this.consultationDeletion.getDeletionDeadlineIso(),
    };
  }

  // ── Save Step ────────────────────────────────────────────────────────────

  async saveStep(id: string, dto: SaveStepDto, user: RequestUser, req?: Request) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }

    if (
      dto.currentStep === 'TREATMENT' &&
      consultation.consultationMode === 'CLINICAL_JUDGMENT'
    ) {
      await this.assertClinicalJudgmentTreatmentAccess(id);
    }

    const stepField = this.getStepField(dto.currentStep);
    const updateData: Record<string, unknown> = {
      stepIndex: Math.max(consultation.stepIndex, dto.stepIndex),
      // Never rewind resume position when the pharmacist saves an earlier step
      currentStep:
        dto.stepIndex >= (consultation.stepIndex ?? 0)
          ? dto.currentStep
          : consultation.currentStep,
    };

    let previousRenewConfirmed = false;
    if (consultation.module === SAFESCRIBE_MODULES.ADAPT && dto.data) {
      const adaptData = dto.data as Record<string, unknown>;
      const isDocsStep =
        dto.currentStep === 'DOCUMENTATION' ||
        dto.currentStep === 'DOCUMENTS_AND_COMPLETE';
      const looksLikeDocumentationPackage =
        adaptData.documents != null || adaptData.documentReviews != null;
      const looksLikeAdaptPayload =
        adaptData.step1 != null && typeof adaptData.step1 === 'object';

      // Persist Adapt clinical payload without clobbering from DOCUMENTATION packages.
      // Step 1 autosave sends AdaptPayload directly; Step 3 hydration nests `{ renewPayload }`.
      if (adaptData.renewPayload != null) {
        updateData.renewPayload = adaptData.renewPayload;
      } else if (!isDocsStep && !looksLikeDocumentationPackage && looksLikeAdaptPayload) {
        updateData.renewPayload = adaptData;
      }

      // Persist patient-assessment demographics (incl. labs/vitals) alongside Adapt payload
      if (adaptData.demographics && typeof adaptData.demographics === 'object') {
        const previous = (consultation.demographics ?? {}) as Record<string, unknown>;
        updateData.demographics = {
          ...previous,
          ...(adaptData.demographics as Record<string, unknown>),
        };
      }
      // Hydrate Prescribe-compatible columns so Step 6 documentation works for Adapt.
      if (adaptData.treatmentPlan && typeof adaptData.treatmentPlan === 'object') {
        updateData.treatmentPlan = this.sanitizeTreatmentPlanPayload(
          adaptData.treatmentPlan as Record<string, unknown>,
          {
            userId: user.id,
            tenantId: user.tenantId ?? consultation.tenantId,
            consultationId: id,
          },
        );
      }
      if (adaptData.counsellingNotes && typeof adaptData.counsellingNotes === 'object') {
        updateData.counsellingNotes = adaptData.counsellingNotes;
      }
      if (typeof adaptData.chiefComplaint === 'string') {
        updateData.chiefComplaint = adaptData.chiefComplaint;
      }
      if (
        isDocsStep &&
        adaptData.documentation &&
        typeof adaptData.documentation === 'object'
      ) {
        // Handled below via stepField path when data IS the package;
        // when nested under { documentation, renewPayload }, canonicalize here.
        const asOf = await this.consultationAsOfDate(consultation);
        const documentationPayload = this.retainClinicalReferences(
          sanitizeDocumentationDob(
            this.canonicalizeDocumentation(adaptData.documentation as Record<string, unknown>),
            (updateData.demographics as object) ?? consultation.demographics,
            asOf,
          ),
          consultation.documentation,
        );
        updateData.documentation = documentationPayload;
      }
    } else if (dto.currentStep.startsWith('RENEW_') && dto.data) {
      const incoming = parseRenewPayload(dto.data);
      const current = parseRenewPayload(consultation.renewPayload);
      previousRenewConfirmed = current.medicationList.confirmed;
      if (!('therapyReview' in dto.data) || isEmptyTherapyReview(incoming.therapyReview)) {
        incoming.therapyReview = current.therapyReview;
      }
      if (!('monitoringSafety' in dto.data) || isEmptyMonitoringSafety(incoming.monitoringSafety)) {
        incoming.monitoringSafety = current.monitoringSafety;
      }
      if (!('renewalDecision' in dto.data) || isEmptyRenewalDecision(incoming.renewalDecision)) {
        incoming.renewalDecision = current.renewalDecision;
      }
      updateData.renewPayload = JSON.parse(JSON.stringify(incoming));
    }

    let documentationPayload: Record<string, unknown> | undefined;
    if (stepField && dto.data) {
      if (
        dto.currentStep === 'DOCUMENTATION' ||
        dto.currentStep === 'DOCUMENTS_AND_COMPLETE'
      ) {
        // Adapt Step 4 uses DOCUMENTS_AND_COMPLETE with the same DocumentationPackage shape.
        const asOf = await this.consultationAsOfDate(consultation);
        documentationPayload = this.retainClinicalReferences(
          sanitizeDocumentationDob(
            this.canonicalizeDocumentation(dto.data),
            consultation.demographics,
            asOf,
          ),
          consultation.documentation,
        );
        updateData[stepField] = documentationPayload;
      } else if (dto.currentStep === 'DEMOGRAPHICS') {
        const previous = (consultation.demographics ?? {}) as Record<string, unknown>;
        const asOf = await this.consultationAsOfDate(consultation);
        const asOfDate = parseIsoDateLocal(asOf) ?? consultation.createdAt;
        const next = normalizePatientDemographics(dto.data, asOfDate);
        if (
          previous.patientConsentObtained === true &&
          next.patientConsentObtained == null
        ) {
          next.patientConsentObtained = true;
        }
        updateData[stepField] = next;
      } else if (dto.currentStep === 'PRESENTING_COMPLAINT') {
        // Intake fields are written to top-level columns below — never overwrite aiEntities
        // with the save payload (that previously corrupted extraction / blocked refresh).
      } else if (dto.currentStep === 'TREATMENT') {
        updateData[stepField] = this.sanitizeTreatmentPlanPayload(dto.data, {
          userId: user.id,
          tenantId: user.tenantId ?? consultation.tenantId,
          consultationId: id,
        });
      } else {
        updateData[stepField] = dto.data;
      }
    }

    // Extract commonly accessed fields to top-level
    if (dto.currentStep === 'PRESENTING_COMPLAINT' && dto.data) {
      if (dto.data.chiefComplaint !== undefined) {
        updateData.chiefComplaint = dto.data.chiefComplaint;
      }
      if (dto.data.transcript !== undefined) {
        updateData.transcript = dto.data.transcript;
      }
      // Only accept structured entities when explicitly provided by analyze flow
      if (dto.data.aiEntities && typeof dto.data.aiEntities === 'object') {
        updateData.aiEntities = dto.data.aiEntities;
      }
      if (typeof dto.data.patientConsentObtained === 'boolean') {
        const previous = (consultation.demographics ?? {}) as Record<string, unknown>;
        updateData.demographics = {
          ...previous,
          patientConsentObtained: dto.data.patientConsentObtained,
        };
      }
      if (dto.data.consultationIntake && typeof dto.data.consultationIntake === 'object') {
        const prevAnalysis = (consultation.aiAnalysis ?? {}) as Record<string, unknown>;
        updateData.aiAnalysis = {
          ...prevAnalysis,
          consultationIntake: dto.data.consultationIntake,
        };
      }
      if (dto.data.rawTranscript !== undefined) {
        updateData.rawTranscript = dto.data.rawTranscript;
      }
    }

    if (dto.currentStep === 'PATHWAY_SELECTION' && dto.data?.selectedPathwayId) {
      updateData.selectedPathwayId = dto.data.selectedPathwayId as string;
      updateData.aiPathwaySuggestions = dto.data.aiSuggestions ?? null;
      if (!consultation.selectedPathwayId) {
        await this.entitlements.assertNewConsultationAllowed(user.tenantId);
      }
    }

    if (consultation.status === ConsultationStatus.DRAFT) {
      updateData.status = ConsultationStatus.IN_PROGRESS;
    }

    const updated = await this.prisma.consultation.update({ where: { id }, data: updateData });

    if (
      dto.currentStep === 'PATHWAY_SELECTION' &&
      dto.data?.selectedPathwayId &&
      !consultation.selectedPathwayId
    ) {
      await this.entitlements.assertAndCountAssessment({
        tenantId: user.tenantId,
        userId: user.id,
        consultationId: id,
        alreadyStarted: false,
      });
    }

    if (
      dto.currentStep.startsWith('RENEW_') &&
      dto.data &&
      parseRenewPayload(dto.data).medicationList.confirmed &&
      !previousRenewConfirmed
    ) {
      await this.entitlements.assertAndCountAssessment({
        tenantId: user.tenantId,
        userId: user.id,
        consultationId: id,
        module: SAFESCRIBE_MODULES.RENEW,
        alreadyStarted: false,
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'RENEW_MEDICATIONS_CONFIRMED',
        module: 'CONSULTATIONS',
        newValue: {
          consultationId: id,
          medicationCount: parseRenewPayload(dto.data).medicationList.items.length,
        },
        ...(req ? this.getClientInfo(req) : {}),
      });
    }

    if (
      (dto.currentStep === 'DOCUMENTATION' ||
        dto.currentStep === 'DOCUMENTS_AND_COMPLETE') &&
      documentationPayload
    ) {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'DOCUMENTATION_SAVE',
        module: 'CONSULTATIONS',
        previousValue: {
          consultationId: id,
          revision: (consultation.documentation as { revision?: number } | null)?.revision ?? null,
        },
        newValue: {
          consultationId: id,
          revision: documentationPayload.revision ?? null,
          documentKeys: Object.keys(
            (documentationPayload.documents as Record<string, unknown> | undefined) ?? {},
          ),
        },
        ...(req ? this.getClientInfo(req) : {}),
      });
    }

    if (dto.currentStep === 'CLINICAL_QUESTIONS') {
      const snap = await this.pathwayClinicalJudgement.syncFromAnswers(id, user, req);
      return { ...updated, pathwayClinicalJudgement: snap.record };
    }

    return updated;
  }

  async validateOptionalDob(
    id: string,
    dto: { dob: string; expectedPatientSnapshotVersion?: number },
    user: RequestUser,
  ) {
    const ctx = await this.loadOptionalDobContext(id, user);
    this.assertOptionalDobSnapshotVersion(ctx.version, dto.expectedPatientSnapshotVersion);
    if (!isManualAgeIntake(ctx.demographics)) {
      throw new UnprocessableEntityException({
        code: 'OPTIONAL_DOB_NOT_APPLICABLE',
        message: 'Optional DOB is only available when intake used a manual age.',
      });
    }
    const result = evaluateStoredOptionalDob({
      dob: dto.dob,
      demographics: ctx.demographics,
      consultationDate: ctx.consultationDate,
    });
    return {
      ...result,
      patientSnapshotVersion: ctx.version,
    };
  }

  async confirmMatchingDob(
    id: string,
    dto: { dob: string; expectedPatientSnapshotVersion?: number },
    user: RequestUser,
    req?: Request,
  ) {
    const ctx = await this.loadOptionalDobContext(id, user);
    this.assertOptionalDobSnapshotVersion(ctx.version, dto.expectedPatientSnapshotVersion);
    if (!isManualAgeIntake(ctx.demographics)) {
      throw new UnprocessableEntityException({
        code: 'OPTIONAL_DOB_NOT_APPLICABLE',
        message: 'Optional DOB is only available when intake used a manual age.',
      });
    }
    const result = evaluateStoredOptionalDob({
      dob: dto.dob,
      demographics: ctx.demographics,
      consultationDate: ctx.consultationDate,
    });
    if (result.status !== 'MATCH' || !result.recordedAge || !result.dob) {
      return { ...result, patientSnapshotVersion: ctx.version };
    }

    const nextDemo = applyMatchingDob(
      { ...ctx.demographics },
      result.dob,
      result.recordedAge,
    );
    const nextDocs = withDocumentationDob(ctx.consultation.documentation, result.dob);
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        demographics: nextDemo as object,
        documentation: nextDocs as object,
      },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? ctx.consultation.tenantId ?? null,
      action: 'OPTIONAL_DOB_MATCHED',
      module: 'CONSULTATIONS',
      newValue: { consultationId: id },
      ...(req ? this.getClientInfo(req) : {}),
    });
    return {
      status: 'MATCH' as const,
      dob: result.dob,
      derivedAge: result.derivedAge,
      recordedAge: result.recordedAge,
      patientSnapshotVersion: patientSnapshotVersion(updated.updatedAt),
      demographics: updated.demographics,
    };
  }

  async resolveAgeDobConflict(
    id: string,
    dto: {
      resolution: 'USE_DOB_RECHECK_AGE' | 'KEEP_MANUAL_AGE_REMOVE_DOB';
      dob?: string;
      expectedPatientSnapshotVersion?: number;
    },
    user: RequestUser,
    req?: Request,
  ) {
    const ctx = await this.loadOptionalDobContext(id, user);
    this.assertOptionalDobSnapshotVersion(ctx.version, dto.expectedPatientSnapshotVersion);
    if (!isManualAgeIntake(ctx.demographics)) {
      throw new UnprocessableEntityException({
        code: 'OPTIONAL_DOB_NOT_APPLICABLE',
        message: 'Optional DOB is only available when intake used a manual age.',
      });
    }

    if (dto.resolution === 'KEEP_MANUAL_AGE_REMOVE_DOB') {
      const nextDemo = revertDocumentationDob({ ...ctx.demographics });
      const nextDocs = withDocumentationDob(ctx.consultation.documentation, null);
      const updated = await this.prisma.consultation.update({
        where: { id },
        data: {
          demographics: nextDemo as object,
          documentation: nextDocs as object,
        },
      });
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? ctx.consultation.tenantId ?? null,
        action: 'OPTIONAL_DOB_REMOVED',
        module: 'CONSULTATIONS',
        newValue: { consultationId: id },
        ...(req ? this.getClientInfo(req) : {}),
      });
      const recorded = recordedAgeFromDemographics(
        demographicsAgeFields(ctx.demographics),
        ctx.consultationDate,
      );
      return {
        status: 'REMOVED' as const,
        recordedAge: recorded,
        patientSnapshotVersion: patientSnapshotVersion(updated.updatedAt),
        demographics: updated.demographics,
      };
    }

    if (!dto.dob) {
      throw new BadRequestException('A date of birth is required to update the clinical age.');
    }
    const result = evaluateStoredOptionalDob({
      dob: dto.dob,
      demographics: ctx.demographics,
      consultationDate: ctx.consultationDate,
    });
    if (result.status === 'INVALID' || result.status === 'EDITING' || result.status === 'NOT_ENTERED') {
      throw new BadRequestException(result.message ?? 'Enter a valid date of birth.');
    }
    if (!result.derivedAge || !result.recordedAge || !result.dob) {
      throw new BadRequestException('Enter a valid date of birth.');
    }

    if (result.status === 'MATCH') {
      return this.confirmMatchingDob(id, { dob: result.dob, expectedPatientSnapshotVersion: ctx.version }, user, req);
    }

    const previousAge = result.recordedAge;
    const nextDemo = applyAuthoritativeDob(
      { ...(ctx.demographics as Record<string, unknown>) },
      result.dob,
      previousAge,
      ctx.consultationDate,
    );
    const nextDocs = markDocumentsStale(withDocumentationDob(ctx.consultation.documentation, result.dob));
    const nextPlan = markTreatmentPlanStale(ctx.consultation.treatmentPlan);
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        demographics: nextDemo as object,
        documentation: nextDocs as object,
        ...(nextPlan && typeof nextPlan === 'object' ? { treatmentPlan: nextPlan as object } : {}),
      },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? ctx.consultation.tenantId ?? null,
      action: 'DOB_ACCEPTED_AGE_UPDATED',
      module: 'CONSULTATIONS',
      newValue: { consultationId: id },
      ...(req ? this.getClientInfo(req) : {}),
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? ctx.consultation.tenantId ?? null,
      action: 'AGE_DEPENDENT_REVALIDATION_COMPLETED',
      module: 'CONSULTATIONS',
      newValue: { consultationId: id },
      ...(req ? this.getClientInfo(req) : {}),
    });

    return {
      status: 'REVIEW_REQUIRED' as const,
      patientSnapshotVersion: patientSnapshotVersion(updated.updatedAt),
      consultationVersion: patientSnapshotVersion(updated.updatedAt),
      previousAge: { value: previousAge.value, unit: previousAge.unit },
      resolvedAge: {
        value: result.derivedAge.value,
        unit: result.derivedAge.unit,
      },
      affectedItems: [
        { type: 'TREATMENT_ELIGIBILITY', label: 'Treatment eligibility', status: 'REVIEW_REQUIRED' },
        { type: 'SELECTED_TREATMENT', label: 'Selected treatment', status: 'REVIEW_REQUIRED' },
        { type: 'SAFETY_REVIEW', label: 'Safety review', status: 'REVIEW_REQUIRED' },
      ],
      documentStatus: 'STALE',
      demographics: updated.demographics,
      nextStep: 'PATIENT_ASSESSMENT',
    };
  }

  // ── Update Transcript ────────────────────────────────────────────────────

  async updateTranscript(id: string, dto: UpdateTranscriptDto, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    return this.prisma.consultation.update({
      where: { id },
      data: {
        transcript: dto.transcript,
        chiefComplaint: dto.chiefComplaint,
        aiEntities: dto.aiEntities as any,
        status: consultation.status === ConsultationStatus.DRAFT
          ? ConsultationStatus.IN_PROGRESS
          : undefined,
      },
    });
  }

  // ── Select Pathway ───────────────────────────────────────────────────────

  async selectPathway(id: string, dto: SelectPathwayDto, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    // Verify pathway is published
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: dto.pathwayId, status: 'PUBLISHED' },
    });
    if (!pathway) throw new BadRequestException('Pathway not found or not yet published');

    if (!consultation.selectedPathwayId && !consultation.consultationMode) {
      await this.entitlements.assertNewConsultationAllowed(user.tenantId);
    }

    const pathwayChanged =
      Boolean(consultation.selectedPathwayId) &&
      consultation.selectedPathwayId !== dto.pathwayId;

    const assessmentBegun =
      consultation.stepIndex > 1 ||
      Boolean(
        consultation.questionResponses &&
          typeof consultation.questionResponses === 'object' &&
          Object.keys(consultation.questionResponses as object).length > 0,
      ) ||
      Boolean(consultation.redFlags) ||
      Boolean(consultation.treatmentPlan);

    // Changing pathway after assessment starts: clear pathway-specific answers,
    // keep demographics / complaint / transcript for reuse.
    const data: Record<string, unknown> = {
      selectedPathwayId: dto.pathwayId,
      aiPathwaySuggestions: dto.aiSuggestions as any,
      consultationMode: 'GUIDED_PATHWAY',
      originMode: null,
      clinicalJudgmentWorkflowVersionId: null,
      stepIndex: Math.max(consultation.stepIndex, 1),
      currentStep: 'DEMOGRAPHICS',
    };

    if (pathwayChanged && assessmentBegun) {
      data.questionResponses = {};
      data.redFlags = null;
      data.eligibility = null;
      data.treatmentPlan = null;
      data.counsellingNotes = null;
      data.stepIndex = 1;
      data.currentStep = 'DEMOGRAPHICS';
    }

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: data as any,
    });

    await this.entitlements.assertAndCountAssessment({
      tenantId: user.tenantId,
      userId: user.id,
      consultationId: id,
      alreadyStarted: Boolean(consultation.selectedPathwayId || consultation.consultationMode),
    });

    return updated;
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async submit(id: string, user: RequestUser, req: Request) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is already completed');
    }

    if (!consultation.chiefComplaint && !consultation.transcript) {
      throw new BadRequestException('Please record the patient complaint before submitting');
    }

    if (consultation.consultationMode === 'DOCUMENTATION_REFERRAL') {
      // Referral-only sessions may complete documentation without a prescription
    } else if (consultation.consultationMode === 'CLINICAL_JUDGMENT') {
      const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
        where: { consultationId: id },
      });
      if (
        !assessment?.impressionConfirmedAt ||
        (assessment.readinessStatus !== 'CONFIRMED_READY' &&
          assessment.assessmentSufficient !== true)
      ) {
        throw new BadRequestException(
          'Clinical Judgment assessment and prescribing readiness must be complete before finalizing',
        );
      }
      const plan = (consultation.treatmentPlan ?? {}) as Record<string, unknown>;
      if (
        !String(plan.intendedIndication ?? plan.indication ?? '').trim() ||
        !String(plan.treatmentGoal ?? plan.goal ?? '').trim()
      ) {
        throw new BadRequestException(
          'Intended indication and treatment goal are required for Clinical Judgment',
        );
      }
      const rationale = await this.prisma.treatmentRationale.findUnique({
        where: { consultationId: id },
      });
      if (!rationale || rationale.status !== 'CONFIRMED') {
        throw new BadRequestException('Treatment rationale must be confirmed before finalizing');
      }
    }

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        status: ConsultationStatus.COMPLETED,
        submittedAt: new Date(),
        lockedAt: new Date(),
        stepIndex: 9,
        currentStep: 'REVIEW',
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'SUBMIT',
      module: 'CONSULTATIONS',
      newValue: { consultationId: id },
      ...this.getClientInfo(req),
    });

    return updated;
  }


  // ── Complete & Delete (privacy-critical) ─────────────────────────────────

  async completeConsultation(
    id: string,
    dto: CompleteConsultationDto,
    user: RequestUser,
    req: Request,
  ) {
    if (dto.documentationConfirmed !== true) {
      throw new BadRequestException(
        'Confirm that required documentation has been saved to the pharmacy record before completing.',
      );
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        pharmacistId: true,
        status: true,
        consultationRef: true,
        documentation: true,
        demographics: true,
        createdAt: true,
        treatmentPlan: true,
        consultationMode: true,
        module: true,
        renewPayload: true,
        tenant: { select: { timezone: true } },
      },
    });

    // Idempotent: already deleted or never existed
    if (!consultation) {
      return {
        status: 'already_completed' as const,
        consultationId: id,
      };
    }

    this.checkAccess(consultation as any, user);

    const asOf = consultationDateOnly(
      consultation.createdAt,
      consultation.tenant?.timezone,
    );
    const unresolvedDob = unresolvedDocumentationDob(
      consultation.documentation,
      consultation.demographics,
      asOf,
    );
    if (unresolvedDob) {
      throw new BadRequestException(unresolvedDob);
    }

    if (consultation.status === ConsultationStatus.COMPLETED) {
      // Legacy lock-and-retain completions: purge now so privacy model is consistent
      await this.consultationDeletion.deleteConsultationData(id);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'CONSULTATION_COMPLETED_DELETED',
        module: 'CONSULTATIONS',
        newValue: {
          consultationId: id,
          consultationRef: consultation.consultationRef,
          legacyCompleted: true,
          clientRequestId: dto.clientRequestId ?? null,
        },
        ...this.getClientInfo(req),
      });
      return {
        status: 'already_completed' as const,
        consultationId: id,
      };
    }

    if (
      consultation.status !== ConsultationStatus.DRAFT &&
      consultation.status !== ConsultationStatus.IN_PROGRESS
    ) {
      throw new BadRequestException('This consultation cannot be completed in its current state');
    }

    if (consultation.module === SAFESCRIBE_MODULES.RENEW) {
      this.assertRenewCompletion(consultation.renewPayload);
    } else {
      this.assertRequiredDocumentsReviewed(consultation.documentation, consultation.treatmentPlan);
    }

    let deleted = false;
    try {
      const result = await this.consultationDeletion.deleteConsultationData(id);
      deleted = result.deleted;
    } catch (err) {
      this.logger.error(
        `Complete & delete failed for ${id}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new BadRequestException(
        'Could not delete temporary consultation data. Please try again. If this keeps happening, contact support.',
      );
    }

    if (!deleted) {
      return {
        status: 'already_completed' as const,
        consultationId: id,
      };
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CONSULTATION_COMPLETED_DELETED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: id,
        consultationRef: consultation.consultationRef,
        clientRequestId: dto.clientRequestId ?? null,
      },
      ...this.getClientInfo(req),
    });

    return {
      status: 'completed' as const,
      consultationId: id,
    };
  }

  private assertRenewCompletion(renewPayload: unknown) {
    const payload = parseRenewPayload(renewPayload);
    const gate = evaluateRenewStep4Gate(payload.renewalDecision);
    if (!gate.canComplete) {
      throw new BadRequestException(
        gate.reason ?? 'Confirm the renewal plan, patient information, and required document review before completing.',
      );
    }
  }

  private assertRequiredDocumentsReviewed(documentation: unknown, treatmentPlan: unknown) {
    const doc = (documentation ?? {}) as {
      documentReviews?: Record<
        string,
        { status?: string; reviewedAt?: string | null; reviewedVersionId?: string | null }
      >;
      documents?: { prescription?: { medications?: unknown[] } | null };
    };
    const reviews = doc.documentReviews ?? {};

    const requiredIds = [
      'consultation_note',
      'prescriber_communication',
      'patient_care_summary',
    ];

    const rxMeds = doc.documents?.prescription?.medications;
    const hasRxContent = Array.isArray(rxMeds) && rxMeds.length > 0;
    const rxStatus = String(reviews.prescription?.status ?? '');
    const rxRequiredByTreatment = treatmentPlanHasPrescription(treatmentPlan);
    if (rxRequiredByTreatment || hasRxContent || rxStatus === 'REVIEWED') {
      requiredIds.push('prescription');
    }

    const incomplete = requiredIds.filter((id) => {
      const r = reviews[id];
      return !r || r.status !== 'REVIEWED';
    });

    if (incomplete.length) {
      const labels: Record<string, string> = {
        consultation_note: 'Pharmacist Consultation Note',
        prescriber_communication: 'Primary Care Provider Communication',
        patient_care_summary: 'Patient Care Summary',
        prescription: 'Prescription',
      };
      if (incomplete.includes('prescription') && rxRequiredByTreatment && rxStatus !== 'REVIEWED') {
        throw new BadRequestException(
          'Create and review the Prescription before completing this consultation.',
        );
      }
      const missing = incomplete.map((id) => labels[id] ?? id).join(', ');
      throw new BadRequestException(
        `Review all required documents before completing (${missing}).`,
      );
    }
  }

  // ── AI: Analyze Transcript ───────────────────────────────────────────────

  async analyzeTranscript(
    id: string,
    user: RequestUser,
    body?: { transcript?: string; chiefComplaint?: string },
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const transcript = (body?.transcript ?? consultation.transcript)?.trim();
    if (!transcript) throw new BadRequestException('Please add a conversation transcript to analyse');

    const chiefComplaintInput =
      body?.chiefComplaint !== undefined
        ? body.chiefComplaint
        : consultation.chiefComplaint;

    // Persist latest transcript before analysis
    if (body?.transcript || body?.chiefComplaint !== undefined) {
      await this.prisma.consultation.update({
        where: { id },
        data: {
          transcript,
          chiefComplaint: chiefComplaintInput ?? consultation.chiefComplaint,
        },
      });
    }

    let result: Record<string, unknown>;

    if (this.aiEngine.isAvailable) {
      try {
        result = (await this.callAiEngine('/api/v1/consultations/analyze-transcript', {
          transcript,
        })) as Record<string, unknown>;
      } catch (err) {
        this.logger.warn('AI engine analyze failed, using local extractor', err);
        result = this.transcriptExtractor.extract(transcript) as Record<string, unknown>;
      }
    } else {
      result = this.transcriptExtractor.extract(transcript) as Record<string, unknown>;
    }

    // Merge clinical photo findings so pathway selection can use images + transcript.
    // Replace prior transcript extraction (do not shallow-merge old medication/allergy arrays).
    const refreshed = await this.prisma.consultation.findUnique({ where: { id } });
    const existingAnalysis =
      ((refreshed?.aiAnalysis ?? consultation.aiAnalysis) as Record<string, unknown> | null) ??
      {};
    const photoCache = existingAnalysis.clinicalPhotos ?? null;

    if (refreshed) {
      const { entities } = await this.ensureClinicalPhotoAnalysis({
        ...refreshed,
        aiEntities: {
          ...result,
          // Keep prior imageFindings only until photo merge re-applies them
          imageFindings: (result as { imageFindings?: unknown }).imageFindings,
        },
        aiAnalysis: {
          ...existingAnalysis,
          clinicalPhotos: photoCache,
        },
      });
      result = entities;
    }

    const chiefComplaint =
      (result.chiefComplaint as string) ??
      chiefComplaintInput ??
      consultation.chiefComplaint ??
      null;

    const attachmentIds = this.readAttachments(refreshed?.attachments ?? consultation.attachments).map(
      (a) => a.id,
    );
    const intakeFingerprint = computeIntakeFingerprint({
      chiefComplaint,
      transcript,
      attachmentIds,
    });
    const previousMeta = readIntakeAnalysisMeta(existingAnalysis);
    let intakeChanged = false;
    if (previousMeta.intakeFingerprint) {
      intakeChanged = previousMeta.intakeFingerprint !== intakeFingerprint;
    } else if (this.assessmentHasBegun(consultation) && body?.transcript?.trim()) {
      // Legacy consultations (no stored fingerprint): explicit re-analyze after
      // assessment has begun must refresh AI-derived downstream fields.
      intakeChanged = true;
    }
    const shouldInvalidateDownstream =
      this.assessmentHasBegun(consultation) && intakeChanged;

    const nextAnalysis: Record<string, unknown> = {
      ...existingAnalysis,
      intakeFingerprint,
      analyzedAt: new Date().toISOString(),
      downstreamRefreshRequired: shouldInvalidateDownstream,
      intakeInvalidatedAt: shouldInvalidateDownstream
        ? new Date().toISOString()
        : previousMeta.intakeInvalidatedAt ?? null,
    };

    const updateData: Record<string, unknown> = {
      aiEntities: result,
      chiefComplaint,
      aiAnalysis: nextAnalysis,
    };

    if (shouldInvalidateDownstream) {
      // Same pattern as pathway change: clear derived clinical artifacts so Step 3
      // re-prefills from the new transcript. Preserve pharmacist manual answers.
      updateData.questionResponses = this.preserveManualQuestionResponses(
        consultation.questionResponses,
      );
      updateData.demographics = null;
      updateData.redFlags = null;
      updateData.eligibility = null;
      updateData.treatmentPlan = null;
      updateData.counsellingNotes = null;
    }

    await this.prisma.consultation.update({
      where: { id },
      data: updateData as any,
    });

    return {
      ...result,
      _meta: {
        intakeFingerprint,
        intakeChanged: shouldInvalidateDownstream,
        downstreamRefreshRequired: shouldInvalidateDownstream,
      },
    };
  }

  // ── AI: Recommend Pathways ───────────────────────────────────────────────

  async recommendPathways(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const consultationProvince = await this.resolveConsultationProvince(consultation, user);

    // Include global pathways (tenantId = null, created by Super Admin) AND
    // tenant-specific pathways. Never restrict to tenant only — pharmacists must
    // see all published guidelines regardless of who created them.
    const publishedRaw = await this.prisma.clinicalPathway.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(user.tenantId
          ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] }
          : {}),
      },
      select: {
        id: true,
        name: true,
        condition: true,
        category: true,
        province: true,
        provinceAvailability: true,
        description: true,
        aiSummary: true,
        routingAliases: true,
        routingPresentingComplaints: true,
        routingContextTerms: true,
        routingDescription: true,
        version: true,
      },
      orderBy: { name: 'asc' },
      take: 200,
    });

    const publishedPathways = publishedRaw.filter((p) =>
      isPathwayEnabledForProvince(p, consultationProvince),
    );

    const allPathways = publishedPathways.map((p) => ({
      id: p.id,
      name: p.name,
      condition: p.condition,
      category: p.category,
      province: p.province,
      provinceAvailability: p.provinceAvailability,
    }));

    // Analyse optional clinical photos (cold sore on lip, etc.) before ranking pathways
    const { entities, photoAnalysis } = await this.ensureClinicalPhotoAnalysis(consultation);
    const transcript =
      (consultation.transcript ?? '').trim() ||
      (consultation.chiefComplaint ?? '').trim() ||
      photoAnalysis?.summary ||
      '';

    const hasSignal =
      Boolean(transcript) ||
      Boolean(photoAnalysis?.suggestedPathwayHints?.length) ||
      Boolean(photoAnalysis?.suggestedConditions?.length);

    if (!hasSignal) {
      // No clinical signal — do not dump the full pathway catalogue into suggestions
      return {
        pathways: [],
        allPathways,
        imageFindings: photoAnalysis,
        consultationProvince,
        routingUnavailable: false,
      };
    }

    const routingLibrary = publishedPathways.map((p) => ({
      id: p.id,
      name: p.name,
      condition: p.condition,
      category: p.category,
      province: p.province,
      provinceAvailability: p.provinceAvailability,
      status: 'PUBLISHED',
      aliases: p.routingAliases,
      presenting_complaints: p.routingPresentingComplaints,
      body_context_terms: p.routingContextTerms,
      routing_description: p.routingDescription,
      routing_text: buildPathwayRoutingRepresentation(p),
      version: p.version,
    }));

    let enriched: Array<Record<string, unknown>> = [];
    let routingAiFailed = false;

    if (this.aiEngine.isAvailable) {
      try {
        const result = await this.callAiEngine('/api/v1/consultations/recommend-pathways', {
          transcript,
          entities,
          consultation_province: consultationProvince,
          available_pathways: routingLibrary,
        });
        const payload = result as Record<string, unknown>;
        const aiPathways =
          (payload?.pathways as Array<Record<string, unknown>>) ??
          ((payload?.candidates as Array<Record<string, unknown>>) ?? []).map((c) => ({
            id: c.pathway_id ?? c.id,
            name: c.pathway_name ?? c.name,
            confidence: Math.round(Number(c.match_score ?? c.confidence ?? 0) * (Number(c.match_score) <= 1 ? 100 : 1)),
            matchLevel: c.match_level ?? c.matchLevel,
            matchedSymptoms: c.matchedSymptoms,
            reasoning: c.reason ?? c.reasoning,
            priority: c.priority ?? 1,
          }));
        enriched = aiPathways
          .map((ap) => {
            const pw = publishedPathways.find((p) => p.id === ap.id);
            if (!pw) return null;
            const confidence = Number(ap.confidence ?? 0);
            return {
              ...pw,
              ...ap,
              confidence,
              matchLevel:
                (ap.matchLevel as string) ||
                matchLevelFromScore(confidence / 100),
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;
      } catch (err) {
        routingAiFailed = true;
        this.logger.warn('AI pathway recommend failed, using routing-metadata fallback', err);
      }
    } else {
      routingAiFailed = true;
    }

    if (!enriched.length) {
      enriched = this.rankPathwaysLocally(publishedPathways, transcript, entities, photoAnalysis);
    }

    // Keep only clinically related pathways (never the full DB list); max 3 suggestions
    enriched = this.filterRelatedPathways(enriched, transcript, entities, photoAnalysis).slice(0, 3);

    const routingAudit = {
      consultationId: id,
      consultationProvince,
      pathwayVersions: publishedPathways.map((p) => ({ id: p.id, version: p.version })),
      candidates: enriched.map((p) => ({
        pathwayId: p.id,
        confidence: p.confidence,
        matchLevel: p.matchLevel,
        reasoning: p.reasoning,
      })),
      routingAiFailed,
      at: new Date().toISOString(),
    };

    await this.prisma.consultation.update({
      where: { id },
      data: {
        aiPathwaySuggestions: enriched as any,
        aiEntities: entities as any,
        aiAnalysis: {
          ...(((consultation.aiAnalysis as Record<string, unknown> | null) ?? {}) as object),
          clinicalPhotos: photoAnalysis ?? null,
          pathwayRouting: routingAudit,
        } as any,
      },
    });

    return {
      pathways: enriched,
      allPathways,
      imageFindings: photoAnalysis,
      consultationProvince,
      routingUnavailable: routingAiFailed && !enriched.length,
    };
  }

  /** Resolve province for pathway availability filtering. */
  private async resolveConsultationProvince(
    consultation: {
      demographics?: unknown;
      documentation?: unknown;
      tenantId?: string | null;
    },
    user: RequestUser,
  ): Promise<string | null> {
    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const fromDemo = String(demo.province ?? demo.jurisdiction ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(fromDemo)) return fromDemo;

    const docs = (consultation.documentation ?? {}) as Record<string, unknown>;
    const patientInfo = (docs.patientInfo ?? docs.patient ?? {}) as Record<string, unknown>;
    const address = (patientInfo.addressLines ?? patientInfo.address ?? {}) as Record<
      string,
      unknown
    >;
    const fromAddr = String(address.province ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(fromAddr)) return fromAddr;

    const tenantId = consultation.tenantId ?? user.tenantId;
    if (!tenantId) return null;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return provinceFromTimezone(tenant?.timezone) ?? null;
  }

  /**
   * Analyse clinical photos when present / changed. Merges visual findings into
   * aiEntities so pathway matching, Q&A, and patient assessment can use them.
   */
  private async ensureClinicalPhotoAnalysis(consultation: {
    id: string;
    attachments: unknown;
    aiEntities: unknown;
    aiAnalysis: unknown;
    transcript?: string | null;
    chiefComplaint?: string | null;
  }): Promise<{
    entities: Record<string, unknown>;
    photoAnalysis: ClinicalPhotoAnalysisResult | null;
  }> {
    const attachments = this.readAttachments(consultation.attachments);
    const existingEntities = {
      ...(((consultation.aiEntities as Record<string, unknown> | null) ?? {}) as object),
    } as Record<string, unknown>;
    const existingAnalysis =
      ((consultation.aiAnalysis as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const cached = existingAnalysis.clinicalPhotos as ClinicalPhotoAnalysisResult | undefined;

    if (!attachments.length) {
      return { entities: existingEntities, photoAnalysis: null };
    }

    if (!this.clinicalPhotoAnalyzer.isAvailable) {
      return { entities: existingEntities, photoAnalysis: cached ?? null };
    }

    const hash = this.clinicalPhotoAnalyzer.contentHash(attachments);
    if (cached?.contentHash === hash && cached.attachmentIds?.length) {
      return {
        entities: this.mergePhotoFindingsIntoEntities(existingEntities, cached),
        photoAnalysis: cached,
      };
    }

    const photoAnalysis = await this.clinicalPhotoAnalyzer.analyzePhotos(attachments);
    if (!photoAnalysis) {
      return { entities: existingEntities, photoAnalysis: cached ?? null };
    }

    const entities = this.mergePhotoFindingsIntoEntities(existingEntities, photoAnalysis);

    await this.prisma.consultation.update({
      where: { id: consultation.id },
      data: {
        aiEntities: entities as any,
        aiAnalysis: {
          ...existingAnalysis,
          clinicalPhotos: photoAnalysis,
        } as any,
      },
    });

    return { entities, photoAnalysis };
  }

  private mergePhotoFindingsIntoEntities(
    entities: Record<string, unknown>,
    photo: ClinicalPhotoAnalysisResult,
  ): Record<string, unknown> {
    const next = { ...entities };
    next.imageFindings = photo;

    if (!next.chiefComplaint && photo.summary) {
      next.chiefComplaint = photo.summary;
    }

    const existingSymptoms = Array.isArray(next.symptoms)
      ? ([...next.symptoms] as Array<Record<string, unknown>>)
      : [];
    const seen = new Set(
      existingSymptoms
        .map((s) => String(s.symptom ?? '').toLowerCase().trim())
        .filter(Boolean),
    );

    for (const condition of photo.suggestedConditions) {
      const key = condition.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      existingSymptoms.push({
        symptom: condition,
        confidence: photo.overallConfidence || 80,
        source: 'clinical_photo',
      });
    }
    for (const finding of photo.visibleFindings) {
      const key = finding.finding.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      existingSymptoms.push({
        symptom: finding.finding,
        confidence: finding.confidence,
        source: 'clinical_photo',
      });
    }
    if (existingSymptoms.length) next.symptoms = existingSymptoms;

    const hints = [
      ...(Array.isArray(next.riskFactors) ? (next.riskFactors as string[]) : []),
      ...photo.suggestedPathwayHints,
    ];
    next.riskFactors = [...new Set(hints.map((h) => String(h).trim()).filter(Boolean))];

    return next;
  }

  /** Keyword / routing-metadata ranking when the AI engine is unavailable. */
  private rankPathwaysLocally(
    publishedPathways: Array<{
      id: string;
      name: string;
      condition: string | null;
      category: string | null;
      province: string | null;
      provinceAvailability?: string | null;
      description?: string | null;
      aiSummary?: string | null;
      routingAliases?: string[];
      routingPresentingComplaints?: string[];
      routingContextTerms?: string[];
      routingDescription?: string | null;
    }>,
    transcript: string,
    entities: Record<string, unknown>,
    photo: ClinicalPhotoAnalysisResult | null,
  ): Array<Record<string, unknown>> {
    const haystack = [
      transcript,
      photo?.summary ?? '',
      ...(photo?.suggestedConditions ?? []),
      ...(photo?.suggestedPathwayHints ?? []),
      ...((Array.isArray(entities.symptoms)
        ? entities.symptoms.map((s: any) => String(s?.symptom ?? ''))
        : []) as string[]),
      String(entities.chiefComplaint ?? ''),
    ]
      .join(' ')
      .toLowerCase();

    const ranked = rankPathwaysByRoutingMetadata(publishedPathways, haystack, {
      maxResults: 3,
      minScore: 0.35,
    });

    if (ranked.length) {
      return ranked.map((r, idx) => {
        const p = publishedPathways.find((x) => x.id === r.pathwayId)!;
        return {
          ...p,
          confidence: Math.round(r.score * 100),
          matchLevel: r.matchLevel,
          matchedSymptoms: r.matchedTerms,
          reasoning: r.reason,
          priority: idx + 1,
        };
      });
    }

    // Legacy name-token fallback when no routing metadata is configured yet
    const scored: Array<Record<string, unknown>> = [];

    for (const p of publishedPathways) {
      const label = `${p.name} ${p.condition ?? ''} ${p.category ?? ''}`.toLowerCase();
      let score = 0;
      const matched: string[] = [];
      const tokens = label
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3)
        .slice(0, 12);
      for (const token of tokens) {
        if (haystack.includes(token)) {
          score += 12;
          matched.push(token);
        }
      }
      if (
        /cold.?sore|herpes|labialis|lip\b|oral herpes/.test(haystack) &&
        /cold.?sore|herpes|labialis|oral|lip/.test(label)
      ) {
        score += 30;
        matched.push('clinical photo / cold sore match');
      }
      if (score < 12 || matched.length === 0) continue;

      const confidence = Math.min(96, 50 + score);
      scored.push({
        ...p,
        confidence,
        matchLevel: matchLevelFromScore(confidence / 100),
        matchedSymptoms: matched.slice(0, 5),
        reasoning: photo?.summary
          ? `Matched from consultation notes and clinical photo: ${photo.summary}`
          : 'Matched from consultation notes',
        priority: 1,
      });
    }

    return scored.sort((a, b) => (b.confidence as number) - (a.confidence as number)).slice(0, 3);
  }

  /**
   * Drop unrelated pathways from AI/local ranking so “Other pathways considered”
   * never lists the full published catalogue.
   */
  private filterRelatedPathways(
    pathways: Array<Record<string, unknown>>,
    transcript: string,
    entities: Record<string, unknown>,
    photo: ClinicalPhotoAnalysisResult | null,
  ): Array<Record<string, unknown>> {
    const RELATED_MIN = 55;
    const haystack = [
      transcript,
      photo?.summary ?? '',
      ...(photo?.suggestedConditions ?? []),
      ...(photo?.suggestedPathwayHints ?? []),
      ...((Array.isArray(entities.symptoms)
        ? entities.symptoms.map((s: any) => String(s?.symptom ?? ''))
        : []) as string[]),
      String(entities.chiefComplaint ?? ''),
    ]
      .join(' ')
      .toLowerCase();

    const clinicalTokens = new Set(
      haystack
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3)
        .filter((t) => !STOP_WORDS.has(t)),
    );

    const filtered = pathways
      .map((p) => {
        const confidence = Number(p.confidence ?? 0);
        const matched = Array.isArray(p.matchedSymptoms)
          ? (p.matchedSymptoms as string[]).join(' ')
          : '';
        const label =
          `${p.name ?? ''} ${p.condition ?? ''} ${p.category ?? ''} ${matched} ${p.reasoning ?? ''} ${(p.routingAliases as string[] | undefined)?.join(' ') ?? ''} ${(p.routingPresentingComplaints as string[] | undefined)?.join(' ') ?? ''}`.toLowerCase();
        const labelTokens = label
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
        const overlap = labelTokens.filter((t) => clinicalTokens.has(t) || haystack.includes(t));
        const relatedByText = overlap.length > 0 || matched.length > 0;
        const relatedByScore = confidence >= RELATED_MIN;
        return { p, confidence, relatedByText, relatedByScore, overlap };
      })
      .filter(({ relatedByText, relatedByScore, confidence }) => {
        // Must be both reasonably confident AND text-related when we have clinical signal
        if (clinicalTokens.size === 0) return relatedByScore;
        return relatedByScore && relatedByText;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map(({ p }) => p);

    // Always keep the top AI hit if everything was filtered out but AI returned something strong
    if (!filtered.length && pathways.length) {
      const top = [...pathways].sort(
        (a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0),
      )[0];
      if (top && Number(top.confidence ?? 0) >= RELATED_MIN) return [top];
    }

    return filtered;
  }


  // ── AI: Answer Questions ─────────────────────────────────────────────────

  async answerQuestions(
    id: string,
    user: RequestUser,
    body?: { forceRefresh?: boolean },
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (!consultation.selectedPathwayId) {
      throw new BadRequestException('Please choose a pathway first');
    }

    const pathway = await this.prisma.clinicalPathway.findUnique({
      where: { id: consultation.selectedPathwayId },
      include: { questions: { orderBy: { displayOrder: 'asc' } } },
    });

    if (!pathway?.questions?.length) return { answers: [] };

    const questions = pathway.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      section: q.sectionId,
    }));

    const transcript = consultation.transcript ?? '';
    const entities = (consultation.aiEntities ?? {}) as Record<string, unknown>;
    const intakeMeta = readIntakeAnalysisMeta(consultation.aiAnalysis);
    const forceRefresh =
      body?.forceRefresh === true || intakeMeta.downstreamRefreshRequired === true;

    let answers: Array<Record<string, unknown>> = [];

    if (this.aiEngine.isAvailable && transcript) {
      try {
        const result = (await this.callAiEngine('/api/v1/consultations/answer-questions', {
          transcript,
          entities,
          questions,
        })) as { answers?: Array<Record<string, unknown>> };
        answers = result.answers ?? [];
      } catch (err) {
        this.logger.warn('AI answer-questions failed, using local heuristics', err);
      }
    }

    // Merge local heuristic answers for gaps
    const localAnswers = this.transcriptExtractor.answerQuestions(
      transcript,
      entities,
      questions,
    );
    const answeredIds = new Set(answers.map((a) => a.id as string));
    for (const la of localAnswers) {
      if (!answeredIds.has(la.id)) answers.push(la);
    }

    // Build questionResponses map and persist — never overwrite manual pharmacist answers
    const existing = (consultation.questionResponses ?? {}) as Record<
      string,
      { source?: string; aiAnswered?: boolean; answer?: unknown; answerText?: string }
    >;
    const responses: Record<string, unknown> = forceRefresh
      ? this.preserveManualQuestionResponses(consultation.questionResponses)
      : { ...existing };

    for (const q of pathway.questions) {
      const current = (responses[q.id] ?? existing[q.id]) as
        | { source?: string; aiAnswered?: boolean; answer?: unknown; answerText?: string }
        | undefined;
      const existingAnswer = String(current?.answerText ?? current?.answer ?? '').trim();
      if (current?.source === 'manual') continue;
      if (!forceRefresh && existingAnswer && current?.aiAnswered === false) continue;
      if (!forceRefresh && existingAnswer && current?.aiAnswered === true) continue;

      const a = answers.find((x) => x.id === q.id);
      if (!a || ((a.confidence as number) ?? 0) < 60) continue;
      const answerText = (a.answerText as string) ?? String(a.answer ?? '');
      if (!String(answerText).trim()) continue;

      responses[q.id] = {
        questionId: q.id,
        question: q.question,
        answer: answerText,
        answerText,
        confidence: a.confidence,
        source: a.source ?? 'transcript',
        aiAnswered: true,
      };
    }

    const existingAnalysis =
      ((consultation.aiAnalysis as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
    const nextAnalysis = forceRefresh
      ? {
          ...existingAnalysis,
          downstreamRefreshRequired: false,
          intakeInvalidatedAt: null,
        }
      : existingAnalysis;

    if (Object.keys(responses).length > 0 || forceRefresh) {
      await this.prisma.consultation.update({
        where: { id },
        data: {
          questionResponses: responses as any,
          ...(forceRefresh ? { aiAnalysis: nextAnalysis as any } : {}),
        },
      });
    }

    return { answers, refreshed: forceRefresh };
  }

  // ── Clinical Safety Review (pathway red-flag checklist — no AI) ───────────

  async screenRedFlags(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const pathway = consultation.selectedPathwayId
      ? await this.prisma.clinicalPathway.findUnique({
          where: { id: consultation.selectedPathwayId },
          select: { redFlags: true, name: true, condition: true },
        })
      : null;

    const pathwayFlags = this.mapPathwayRedFlags(pathway?.redFlags);
    const allergyFlags = await this.buildAllergyRedFlags(consultation);
    // Allergy engine is deterministic (not generative AI). Keep as advisory only —
    // the pharmacist checklist is exclusively the pathway-authored list.
    const result = {
      hasRedFlags: false,
      overallRisk: allergyFlags.length > 0 ? 'medium' : 'low',
      redFlags: pathwayFlags,
      pathwayRedFlags: pathwayFlags,
      summary:
        pathwayFlags.length > 0
          ? `${pathwayFlags.length} pathway safety question(s) from ${pathway?.name ?? pathway?.condition ?? 'selected pathway'}.`
          : 'This pathway has no red-flag checklist configured.',
      allergyRuleMatches: allergyFlags,
      source: 'pathway',
    };

    // Do not overwrite pharmacist answers if they already completed screening
    const existing = (consultation.redFlags ?? null) as {
      acknowledgments?: unknown[];
      screeningAnswers?: Record<string, unknown>;
    } | null;
    if (!existing?.acknowledgments?.length && !existing?.screeningAnswers) {
      await this.prisma.consultation.update({
        where: { id },
        data: { redFlags: result as any },
      });
    }

    return result;
  }

  async checkConsultationAllergies(
    id: string,
    user: RequestUser,
    medications: string[],
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const patientAllergies = this.extractPatientAllergies(consultation);
    const patientContext = this.buildSafetyPatientContext(consultation, patientAllergies);
    const evaluation = await this.medicationSafety.evaluate(
      {
        consultationId: id,
        patientContext,
        selectedMedications: medications.map((m) => ({ productName: m })),
      },
      user,
      consultation.tenantId,
    );

    const matches = evaluation.findings.map((f) => ({
      blocked: f.clinicalSeverity === 'CRITICAL' || f.clinicalSeverity === 'HIGH',
      patientAllergy: patientAllergies[0] ?? '',
      prescribedDrug: medications[0] ?? '',
      matchedDrugClass: f.relationshipType ?? '',
      parentClass: '',
      therapeuticGroup: '',
      risk: f.clinicalSeverity,
      reason: f.detail,
      matchType: f.matchType ?? 'ingredient',
      severity: f.clinicalSeverity === 'CRITICAL' ? ('CRITICAL' as const) : ('CRITICAL' as const),
    }));

    return {
      blocked: evaluation.status === 'COMPLETE_WITH_FINDINGS' && matches.length > 0,
      matches,
      patientAllergies,
      evaluation,
    };
  }

  async extractLabValues(id: string, user: RequestUser, file: Express.Multer.File) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    try {
      const result = await this.labReportExtractor.extract(file);
      const formattedText = this.labReportExtractor.formatAsText(result.labValues);

      return {
        ...result,
        formattedText,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read the lab report';
      this.logger.warn(`Lab extraction failed for consultation ${id}: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async extractRenewMedications(
    id: string,
    user: RequestUser,
    files: Express.Multer.File[],
    sourceType: 'screenshot' | 'pharmacy_document' = 'pharmacy_document',
    note?: string,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    if (
      consultation.module !== SAFESCRIBE_MODULES.RENEW &&
      consultation.module !== SAFESCRIBE_MODULES.ADAPT
    ) {
      throw new BadRequestException('Medication import is only available on Renew and Adapt consultations');
    }

    try {
      const extracted = await this.renewExtractor.extractMany(files, sourceType, note);
      const medications = mergeExtractedDuplicates(
        await this.renewNormalizer.normalizeMany(extracted.medications),
      );
      const duplicates = findRenewDuplicates(medications);
      const verifiedFrom = prefillVerifiedFrom(extracted.sourceSystem, extracted.documentType);

      return {
        medications,
        sourceSystem: extracted.sourceSystem,
        documentType: extracted.documentType,
        imageQuality: extracted.imageQuality,
        warnings: extracted.warnings,
        cached: extracted.cached,
        duplicates,
        suggestedVerifiedFrom: verifiedFrom,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not read medications from this file';
      this.logger.warn(`Renew medication extraction failed for consultation ${id}: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async parseLabText(id: string, user: RequestUser, text: string) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    try {
      const result = await this.labReportExtractor.extractFromText(text);
      const formattedText = this.labReportExtractor.formatAsText(result.labValues);

      return {
        ...result,
        formattedText,
        source: 'text' as const,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not parse lab text';
      this.logger.warn(`Lab text parse failed for consultation ${id}: ${message}`);
      throw new BadRequestException(message);
    }
  }

  // ── AI: Assess Eligibility ───────────────────────────────────────────────

  async assessEligibility(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (!this.aiEngine.isAvailable) {
      return { eligible: true, confidence: 70, overallAssessment: 'ELIGIBLE', criteria: [] };
    }

    const treatments = consultation.selectedPathwayId
      ? await this.prisma.clinicalTreatment.findMany({
          where: { pathwayId: consultation.selectedPathwayId },
          take: 10,
        })
      : [];

    const result = await this.callAiEngine('/api/v1/consultations/assess-eligibility', {
      entities: consultation.aiEntities ?? {},
      demographics: consultation.demographics ?? {},
      red_flags: consultation.redFlags ?? {},
      pathway_treatments: treatments,
    });

    await this.prisma.consultation.update({ where: { id }, data: { eligibility: result as any } });
    return result;
  }

  // ── Treatment Options (approved pathway catalog — no AI) ─────────────────

  async recommendTreatment(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    // Consultation only surfaces pharmacist-approved, active pathway options
    const treatments = consultation.selectedPathwayId
      ? await this.prisma.clinicalTreatment.findMany({
          where: {
            pathwayId: consultation.selectedPathwayId,
            isActive: true,
            archivedAt: null,
            approved: true,
          },
          orderBy: [{ displayOrder: 'asc' }],
        })
      : [];

    const pathwayMeta = consultation.selectedPathwayId
      ? await this.prisma.clinicalPathway.findUnique({
          where: { id: consultation.selectedPathwayId },
          select: {
            id: true,
            name: true,
            ageMin: true,
            ageMax: true,
            primaryDocumentationReferenceId: true,
            secondaryDocumentationReferenceId: true,
            libraryReferences: {
              where: { status: { not: 'archived' } },
              select: {
                id: true,
                citationTitle: true,
                organization: true,
              },
            },
          },
        })
      : null;

    const patientPregnant = isPatientPregnant(
      (consultation.demographics ?? {}) as {
        pregnancyAnswer?: string;
        pregnancyStatus?: string;
      },
    );

    const catalog = treatments
      .filter((t) => t.medicationName?.trim())
      // Non-drug measures belong in Patient Guidance (self-care), not treatment selection.
      .filter((t) => String(t.category) !== 'NON_DRUG')
      .map((t, index) =>
        this.pathwayTreatmentToRecommendation(t, index, {
          patientPregnant,
          pathwayPrimaryDocumentationReferenceId:
            pathwayMeta?.primaryDocumentationReferenceId ?? null,
          pathwaySecondaryDocumentationReferenceId:
            pathwayMeta?.secondaryDocumentationReferenceId ?? null,
          libraryReferences: pathwayMeta?.libraryReferences ?? [],
        }),
      );

    const patientAllergies = this.extractPatientAllergies(consultation);
    const patientHasRecordedAllergies = patientAllergies.length > 0;
    const existingPlan = (consultation.treatmentPlan ?? {}) as Record<string, unknown>;
    const existingTreatments = (
      Array.isArray(existingPlan.recommendedTreatments)
        ? existingPlan.recommendedTreatments
        : []
    ) as Array<Record<string, unknown>>;

    const drugTreatments = catalog.filter((t) => {
      const cat = String(t.category ?? 'PRESCRIPTION');
      return cat === 'PRESCRIPTION' || cat === 'OTC' || cat === 'SUPPLEMENT';
    });
    const evalMeds = this.dedupeEvalMedications([
      ...drugTreatments.map((t) => ({
        productName: String(t.medicationName ?? ''),
        genericName: String(t.genericName ?? '') || undefined,
        route: t.route ? String(t.route) : undefined,
      })),
      ...existingTreatments
        .filter((t) => {
          const cat = String(t.category ?? 'PRESCRIPTION');
          return cat === 'PRESCRIPTION' || cat === 'OTC' || cat === 'SUPPLEMENT';
        })
        .map((t) => ({
          productName: String(t.medicationName ?? ''),
          genericName: t.genericName ? String(t.genericName) : undefined,
          route: t.route ? String(t.route) : undefined,
        })),
    ]);
    const patientContext = this.buildSafetyPatientContext(consultation, patientAllergies);
    const safetyEval = await this.medicationSafety.evaluate(
      {
        consultationId: id,
        patientContext,
        selectedMedications: evalMeds,
      },
      user,
      consultation.tenantId,
    );

    const knowledgeRelease =
      (safetyEval as { knowledgeRelease?: string | null }).knowledgeRelease ?? null;
    const engineVersion =
      (safetyEval as { engineVersion?: string | null }).engineVersion ?? null;

    const allergyMatches: Array<{
      blocked: boolean;
      patientAllergy: string;
      prescribedDrug: string;
      matchedDrugClass: string;
      parentClass: string;
      therapeuticGroup: string;
      risk: string;
      reason: string;
      matchType: string;
      severity: string;
      findingType: string;
      safetySource?: SafetyEngineSource;
    }> = [];

    const withAllergyFlags: Array<Record<string, unknown>> = catalog.map((t) => {
      const medName = String(t.medicationName ?? '');
      const genericName = String(t.genericName ?? '');
      const flags = mapSafetyEvalToMedication({
        medicationName: medName,
        genericName,
        findings: safetyEval.findings,
        patientAllergies,
        knowledgeRelease,
        engineVersion,
      });

      if (flags.allergyWarning) {
        allergyMatches.push({
          blocked: true,
          patientAllergy: flags.allergyWarning.patientAllergy,
          prescribedDrug: flags.allergyWarning.prescribedDrug,
          matchedDrugClass: flags.allergyWarning.matchedDrugClass,
          parentClass: flags.allergyWarning.parentClass,
          therapeuticGroup: flags.allergyWarning.therapeuticGroup,
          risk: flags.allergyWarning.risk,
          reason: flags.allergyWarning.reason,
          matchType: flags.allergyWarning.matchType,
          severity: flags.allergyWarning.severity,
          findingType: 'allergy',
          safetySource: flags.allergyWarning.safetySource,
        });
      }

      const pathwayInteractions = ((t.interactions as string[] | undefined) ?? []).filter(Boolean);

      const mapped = {
        ...t,
        allergyBlocked: flags.allergyBlocked,
        allergyWarning: flags.allergyWarning,
        renalWarning: flags.renalWarning,
        hepaticWarning: flags.hepaticWarning,
        pregnancyWarning: flags.pregnancyWarning ?? (t as { pregnancyWarning?: unknown }).pregnancyWarning,
        interactions: flags.interactions,
        interactionSafetySources: flags.interactionSafetySources,
        safetySources: flags.safetySources,
        safetyReviewItems: flags.safetyReviewItems,
        safetyStatus: flags.status,
        safetyTier: flags.safetyTier,
        drugReference: pathwayDrugReference({
          interactions: pathwayInteractions,
          renal: (t as { renalAdjustmentReason?: string }).renalAdjustmentReason,
          hepatic: (t as { hepaticAdjustmentReason?: string }).hepaticAdjustmentReason,
          monitoring: (t as { monitoringReason?: string }).monitoringReason,
          pregnancy: (t as { pregnancyReason?: string }).pregnancyReason,
        }),
        safetyEngineMeta: flags.safetyEngineMeta,
        aiPreferred: false,
        confidence: flags.allergyBlocked
          ? 40
          : flags.safetyTier === 'PREFERRED'
            ? t.recommendationLevel === 'FIRST_LINE'
              ? 90
              : 75
            : 55,
      };
      return sanitizeTreatmentSafety(mapped, { patientHasRecordedAllergies });
    });

    // Pathway age gate (Overview ageMin/ageMax) — adult regimens ineligible under pathway min age.
    const demographics = (consultation.demographics ?? {}) as {
      age?: string | number;
      ageUnit?: string;
      dateOfBirth?: string;
      dateOfBirthUnavailable?: boolean;
    };
    const patientAgeYears = ageYearsFromDemographics(demographics);
    const pathwayAgeMin =
      pathwayMeta?.ageMin ??
      (pathwayMeta?.name && /cold\s*sore|herpes\s*labialis/i.test(pathwayMeta.name)
        ? 12
        : null);
    const pathwayAgeMax = pathwayMeta?.ageMax ?? null;

    this.applyPathwayAgeGate(withAllergyFlags, {
      patientAgeYears,
      pathwayAgeMin,
      pathwayAgeMax,
    });

    // Safe options first, then category → recommendation level → displayOrder
    withAllergyFlags.sort((a, b) => {
      const blockDiff = Number(a.allergyBlocked) - Number(b.allergyBlocked);
      if (blockDiff !== 0) return blockDiff;
      const catRank: Record<string, number> = {
        PRESCRIPTION: 0,
        OTC: 1,
        SUPPLEMENT: 2,
        NON_DRUG: 3,
      };
      const levelRank: Record<string, number> = {
        FIRST_LINE: 0,
        SECOND_LINE: 1,
        ALTERNATIVE: 2,
        ADJUNCTIVE: 3,
        SUPPORTIVE_CARE: 4,
        SPECIALIST: 5,
      };
      const cr = (catRank[String(a.category)] ?? 9) - (catRank[String(b.category)] ?? 9);
      if (cr !== 0) return cr;
      const lr =
        (levelRank[String(a.recommendationLevel)] ?? 9) -
        (levelRank[String(b.recommendationLevel)] ?? 9);
      if (lr !== 0) return lr;
      return Number(a.priority ?? 0) - Number(b.priority ?? 0);
    });

    const ordered: Array<Record<string, unknown>> = withAllergyFlags.map((t, i) => ({
      ...t,
      priority: i + 1,
    }));
    const preferred =
      ordered.find(
        (t) => !t.allergyBlocked && String(t.recommendationLevel) === 'FIRST_LINE',
      ) ??
      ordered.find((t) => !t.allergyBlocked) ??
      null;

    const blockedCount = ordered.filter((t) => t.allergyBlocked).length;
    const summary =
      ordered.length === 0
        ? 'No approved treatment options on this pathway. Approve options in pathway Treatment Options first.'
        : preferred
          ? `Approved pathway option: ${String(preferred.medicationName)}${
              preferred.dose ? ` · ${String(preferred.dose)}` : ''
            }.${
              blockedCount
                ? ` ${blockedCount} option(s) flagged for patient allergy — review or remove.`
                : ''
            }`
          : blockedCount === ordered.length
            ? `All ${ordered.length} approved option(s) conflict with the patient allergy profile. Remove flagged medicines or add a safe alternative.`
            : `Pathway offers ${ordered.length} approved option(s). Select the appropriate regimen.`;

    // Preserve pharmacist selection / counselling — refresh safety on the saved rows.
    const pharmacistOwned =
      existingPlan.confirmStatus === 'CONFIRMED' ||
      existingPlan.confirmStatus === 'STALE' ||
      (Array.isArray(existingPlan.selectedIndexes) &&
        (existingPlan.selectedIndexes as unknown[]).length > 0) ||
      (Array.isArray(existingPlan.selectedItemsSnapshot) &&
        (existingPlan.selectedItemsSnapshot as unknown[]).length > 0) ||
      existingTreatments.length > 0;

    if (pharmacistOwned) {
      const refreshed = existingTreatments.map((row) =>
        this.refreshPersistedTreatmentSafety(row, {
          findings: safetyEval.findings,
          patientAllergies,
          knowledgeRelease,
          engineVersion,
          patientPregnant,
        }),
      );
      this.applyPathwayAgeGate(refreshed, {
        patientAgeYears,
        pathwayAgeMin,
        pathwayAgeMax,
      });
      const result = {
        ...existingPlan,
        recommendedTreatments: refreshed,
        summary:
          typeof existingPlan.summary === 'string' && existingPlan.summary.trim()
            ? existingPlan.summary
            : summary,
        allergyWarnings: allergyMatches,
        optionCount: ordered.length,
        approvedOnly: true,
        source: existingPlan.source ?? 'pathway',
      };
      await this.prisma.consultation.update({
        where: { id },
        data: { treatmentPlan: result as any },
      });
      return result;
    }

    const existingSelectedIndex =
      typeof existingPlan.selectedIndex === 'number'
        ? (existingPlan.selectedIndex as number)
        : -1;
    const existingSelectedIndexes = Array.isArray(existingPlan.selectedIndexes)
      ? (existingPlan.selectedIndexes as number[])
      : undefined;

    const result = {
      recommendedTreatments: ordered,
      summary,
      allergyWarnings: allergyMatches,
      selectedIndex: existingSelectedIndex,
      ...(existingSelectedIndexes?.length
        ? { selectedIndexes: existingSelectedIndexes }
        : {}),
      ...(existingPlan.counsellingPoints
        ? { counsellingPoints: existingPlan.counsellingPoints }
        : {}),
      ...(existingPlan.followUpPoints
        ? { followUpPoints: existingPlan.followUpPoints }
        : {}),
      optionCount: ordered.length,
      approvedOnly: true,
      source: 'pathway',
    };

    await this.prisma.consultation.update({ where: { id }, data: { treatmentPlan: result as any } });
    return result;
  }

  private pathwayTreatmentToRecommendation(
    t: {
      id: string;
      medicationName: string;
      genericName: string | null;
      brandName: string | null;
      strength: string | null;
      category: string;
      recommendationLevel: string;
      dose: string | null;
      route: string | null;
      frequency: string | null;
      duration: string | null;
      quantity: string | null;
      maxDose: string | null;
      directions: string | null;
      interactions: string[];
      monitoring: string | null;
      renalAdjustment: string | null;
      hepaticAdjustment: string | null;
      pregnancyNotes: string | null;
      pregnancyReason: string | null;
      renalAdjustmentReason: string | null;
      renalDosingBasis?: string | null;
      renalDosingRules?: unknown;
      hepaticAdjustmentReason: string | null;
      monitoringReason: string | null;
      guidelineReference?: string | null;
      documentationReferenceId?: string | null;
      evidenceRefIds?: string[];
      approved: boolean;
      isAiGenerated: boolean;
      displayOrder: number;
      eligibility: string | null;
      clinicalIndication: string | null;
      clinicalNotes: string | null;
      counsellingNotes: string | null;
      followUpAdvice: string | null;
      metadata: unknown;
    },
    index: number,
    opts?: {
      patientPregnant?: boolean;
      pathwayPrimaryDocumentationReferenceId?: string | null;
      pathwaySecondaryDocumentationReferenceId?: string | null;
      libraryReferences?: Array<{
        id: string;
        citationTitle: string;
        organization: string | null;
      }>;
    },
  ): Record<string, unknown> {
    const pregnancyCaution = isClinicalYes(t.pregnancyNotes);
    const renalAdjustmentRequired = isClinicalYes(t.renalAdjustment);
    const hepaticAdjustmentRequired = isClinicalYes(t.hepaticAdjustment);
    const monitoringRequired = isClinicalYes(t.monitoring);

    const pregnancyReason = resolveTreatmentWarningReason(
      'pregnancy',
      t.pregnancyNotes,
      t.pregnancyReason,
    );
    const renalReason = resolveTreatmentWarningReason(
      'renal',
      t.renalAdjustment,
      t.renalAdjustmentReason,
    );
    const hepaticReason = resolveTreatmentWarningReason(
      'hepatic',
      t.hepaticAdjustment,
      t.hepaticAdjustmentReason,
    );
    const monitoringReason = resolveTreatmentWarningReason(
      'monitoring',
      t.monitoring,
      t.monitoringReason,
    );

    const pregnancyWarningActive = Boolean(opts?.patientPregnant && pregnancyCaution);

    const regimens = this.extractPathwayRegimens(t);
    const regimenLines = this.extractRegimenLines(t);
    const primary = regimens[0];
    const doseAmount = primary?.dose?.trim() || undefined;
    const doseUnit = primary?.unit?.trim() || undefined;
    const composedDose =
      (doseAmount && doseUnit && doseUnit !== 'other'
        ? `${doseAmount} ${doseUnit}`
        : doseAmount) ||
      t.dose?.trim() ||
      undefined;

    const meta =
      t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
        ? (t.metadata as Record<string, unknown>)
        : null;
    const productForm =
      (typeof meta?.productForm === 'string' ? meta.productForm.trim() : '') ||
      (primary && 'productForm' in primary
        ? String((primary as { productForm?: string }).productForm ?? '').trim()
        : '');

    return {
      pathwayTreatmentId: t.id,
      medicationName: t.medicationName,
      genericName: t.genericName ?? undefined,
      brandName: t.brandName ?? undefined,
      strength: t.strength?.trim() || undefined,
      productForm: productForm || undefined,
      category: t.category,
      recommendationLevel: t.recommendationLevel,
      dose: composedDose,
      doseAmount: doseAmount || this.splitDoseAmount(t.dose),
      doseUnit: doseUnit || this.splitDoseUnit(t.dose),
      route: primary?.route || t.route || undefined,
      frequency: primary?.frequency || t.frequency || undefined,
      duration: primary?.duration || t.duration || undefined,
      quantity: t.quantity?.trim() || undefined,
      maxDose: t.maxDose?.trim() || undefined,
      instructions: t.directions?.trim() || undefined,
      eligibility: t.eligibility?.trim() || undefined,
      clinicalIndication: t.clinicalIndication ?? undefined,
      clinicalNotes: t.clinicalNotes ?? undefined,
      counsellingNotes: t.counsellingNotes ?? undefined,
      followUpAdvice: t.followUpAdvice ?? undefined,
      reasoning:
        t.clinicalNotes?.trim() ||
        t.clinicalIndication?.trim() ||
        t.counsellingNotes?.trim() ||
        undefined,
      interactions: t.interactions ?? [],
      monitoring: monitoringRequired ? 'Yes' : t.monitoring ?? undefined,
      regimens: regimens.length > 0 ? regimens : undefined,
      selectedRegimenId: primary?.id,
      pregnancyCaution,
      renalAdjustmentRequired,
      hepaticAdjustmentRequired,
      monitoringRequired,
      pregnancyReason: pregnancyReason ?? undefined,
      renalAdjustmentReason: renalReason ?? undefined,
      renalDosingBasis:
        t.renalDosingBasis === 'CrCl' || t.renalDosingBasis === 'eGFR'
          ? t.renalDosingBasis
          : undefined,
      renalDosingRules: Array.isArray(t.renalDosingRules) ? t.renalDosingRules : undefined,
      guidelineReference:
        resolveDocumentationCitationLine(
          opts?.libraryReferences ?? [],
          t.documentationReferenceId,
          opts?.pathwayPrimaryDocumentationReferenceId,
          opts?.pathwaySecondaryDocumentationReferenceId,
        ) ||
        t.guidelineReference?.trim() ||
        undefined,
      documentationReferenceId: t.documentationReferenceId ?? undefined,
      evidenceRefIds: t.evidenceRefIds?.length ? t.evidenceRefIds : undefined,
      hepaticAdjustmentReason: hepaticReason ?? undefined,
      monitoringReason: monitoringReason ?? undefined,
      // Patient-specific renal/hepatic/monitoring come from the Safety Engine only.
      // Pathway Yes flags are Drug reference, not matched alerts (WR-02).
      pregnancyWarning: pregnancyWarningActive
        ? {
            active: true,
            message: pregnancyReason || PREGNANCY_TREATMENT_CAUTION_MESSAGE,
          }
        : undefined,
      approved: t.approved,
      confidence: t.approved || t.recommendationLevel === 'FIRST_LINE' ? 90 : 75,
      priority: index + 1,
      source: 'pathway',
      aiPreferred: false,
      prn: Boolean(regimenLines?.[0]?.prn),
      regimenLines,
    };
  }

  private extractPathwayRegimens(t: {
    dose: string | null;
    route: string | null;
    frequency: string | null;
    duration: string | null;
    metadata: unknown;
  }): Array<{
    id: string;
    label: string;
    dose: string;
    unit: string;
    frequency: string;
    route: string;
    duration: string;
  }> {
    const meta =
      t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
        ? (t.metadata as Record<string, unknown>)
        : null;
    const raw = Array.isArray(meta?.regimens) ? meta.regimens : [];
    const fromMeta = raw
      .map((item, i) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const r = item as Record<string, unknown>;
        const dose = String(r.dose ?? '').trim();
        const unit = String(r.administrationUnit ?? r.unit ?? '').trim();
        const frequency = String(r.frequency ?? '').trim();
        const route = String(r.route ?? '').trim();
        const durationValue = String(r.durationValue ?? '').trim();
        const durationUnit = String(r.durationUnit ?? '').trim();
        const duration =
          String(r.duration ?? '').trim() ||
          (durationValue
            ? durationUnit
              ? `${durationValue} ${durationUnit.toLowerCase()}`
              : durationValue
            : '');
        const productForm = String(r.productForm ?? '').trim();
        if (!dose && !frequency && !route && !duration) return null;
        return {
          id: String(r.id ?? `regimen-${i + 1}`),
          label: String(r.label ?? (i === 0 ? 'Standard' : `Regimen ${i + 1}`)).trim() ||
            (i === 0 ? 'Standard' : `Regimen ${i + 1}`),
          dose,
          unit,
          frequency,
          route,
          duration,
          productForm: productForm || undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (fromMeta.length > 0) return fromMeta;

    if (t.dose || t.frequency || t.route || t.duration) {
      const split = this.parseDoseParts(t.dose);
      return [
        {
          id: 'regimen-primary',
          label: 'Standard',
          dose: split.dose,
          unit: split.unit,
          frequency: t.frequency?.trim() || '',
          route: t.route?.trim() || '',
          duration: t.duration?.trim() || '',
        },
      ];
    }
    return [];
  }

  private extractRegimenLines(t: { metadata: unknown }):
    | Array<{
        clientId: string;
        sequence: number;
        doseFrom: string;
        doseTo: string | null;
        form: string;
        frequency: string;
        prn: boolean;
        durationValue: string | null;
        durationUnit: 'DAY' | 'WEEK' | 'MONTH' | null;
      }>
    | undefined {
    const meta =
      t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
        ? (t.metadata as Record<string, unknown>)
        : null;
    const raw = Array.isArray(meta?.regimenLines) ? meta.regimenLines : [];
    const lines = raw
      .map((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const row = item as Record<string, unknown>;
        const doseFrom = String(row.doseFrom ?? '').trim();
        const form = String(row.form ?? '').trim();
        const frequency = String(row.frequency ?? '').trim();
        if (!doseFrom && !form && !frequency) return null;
        const durationUnitRaw = String(row.durationUnit ?? '')
          .trim()
          .toUpperCase();
        const durationUnit: 'DAY' | 'WEEK' | 'MONTH' | null =
          durationUnitRaw === 'WEEK' || durationUnitRaw === 'WEEKS'
            ? 'WEEK'
            : durationUnitRaw === 'MONTH' || durationUnitRaw === 'MONTHS'
              ? 'MONTH'
              : durationUnitRaw === 'DAY' || durationUnitRaw === 'DAYS'
                ? 'DAY'
                : null;
        const doseToRaw = row.doseTo == null ? '' : String(row.doseTo).trim();
        return {
          clientId: String(row.clientId ?? `line-${index + 1}`),
          sequence: Number(row.sequence) || index + 1,
          doseFrom,
          doseTo: doseToRaw || null,
          form,
          frequency,
          prn: Boolean(row.prn) || /prn|as needed/i.test(frequency),
          durationValue:
            row.durationValue == null || String(row.durationValue).trim() === ''
              ? null
              : String(row.durationValue).trim(),
          durationUnit,
        };
      })
      .filter((line): line is NonNullable<typeof line> => Boolean(line));
    return lines.length ? lines : undefined;
  }

  private parseDoseParts(raw?: string | null): { dose: string; unit: string } {
    const value = raw?.trim() ?? '';
    if (!value) return { dose: '', unit: '' };
    const known = [
      'mg/kg/day',
      'mg/kg/dose',
      'mg/kg',
      'mcg',
      'mg',
      'mL',
      'IU',
      'units',
      'application',
      'g',
      '%',
    ];
    for (const unit of known) {
      if (value.toLowerCase().endsWith(unit.toLowerCase())) {
        return {
          dose: value.slice(0, value.length - unit.length).trim(),
          unit,
        };
      }
    }
    return { dose: value, unit: 'other' };
  }

  private splitDoseAmount(raw?: string | null): string | undefined {
    const dose = this.parseDoseParts(raw).dose.trim();
    return dose || undefined;
  }

  private splitDoseUnit(raw?: string | null): string | undefined {
    if (!raw?.trim()) return undefined;
    return this.parseDoseParts(raw).unit;
  }

  /** Split brand/generic/compound names into lookup tokens (e.g. "Novamoxin (amoxicillin)"). */
  private expandMedicationTokens(...values: string[]): string[] {
    return expandDrugTokens(...values);
  }

  private normalizeDrugKey(value: string): string {
    return normalizeAllergyDrugKey(value);
  }

  /** Attribute a Safety Engine finding only to the medication it implicated. */
  private findingAppliesToMedication(
    finding: { implicatedProductName?: string; detail?: string; summary?: string },
    medicationName: string,
    genericName?: string,
  ): boolean {
    const implicated = finding.implicatedProductName?.trim();
    if (implicated) {
      return findingsApplyToProduct(implicated, medicationName, genericName);
    }
    return false;
  }

  private matchAllergyForTreatment(
    treatment: Record<string, unknown>,
    matches: Array<{
      patientAllergy: string;
      prescribedDrug: string;
      matchedDrugClass: string;
      parentClass: string;
      therapeuticGroup: string;
      matchType: string;
      risk: string;
      reason: string;
      severity: string;
      blocked: boolean;
      safetySource?: SafetyEngineSource;
    }>,
    patientAllergies: string[],
  ) {
    const medName = String(treatment.medicationName ?? '');
    const genericName = String(treatment.genericName ?? '');
    const brandName = String(treatment.brandName ?? '');

    const fromRules = matches.find((m) =>
      findingsApplyToProduct(m.prescribedDrug || '', medName, genericName) ||
      (brandName ? findingsApplyToProduct(m.prescribedDrug || '', brandName) : false),
    );
    if (fromRules) return fromRules;

    // Fallback: allergen appears as an ingredient in the treatment name
    for (const allergy of splitAllergyInputs(patientAllergies)) {
      const hit = [medName, genericName, brandName]
        .filter(Boolean)
        .some((name) => containsIngredient(name, allergy));
      if (!hit) continue;
      const reason =
        'The pathway medication contains a documented patient allergen (ingredient / combination product).';
      return {
        blocked: true,
        patientAllergy: allergy,
        prescribedDrug: String(treatment.medicationName ?? allergy),
        matchedDrugClass: allergy,
        parentClass: '',
        therapeuticGroup: '',
        matchType: 'ingredient' as const,
        risk: 'Allergy',
        reason,
        severity: 'CRITICAL' as const,
        safetySource: describeSafetyFindingSource({
          findingType: 'allergy',
          matchType: 'exact_ingredient',
          clinicalSeverity: 'CRITICAL',
          detail: reason,
        }),
      };
    }

    return null;
  }

  private mapPathwayRedFlags(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];
    const mapped: Array<Record<string, unknown>> = [];
    raw.forEach((item, index) => {
      const f = item as Record<string, unknown>;
      const title = String(f.title ?? f.flag ?? '').trim();
      if (!title) return;
      const severity = String(f.severity ?? 'WARNING').toUpperCase();
      const description = f.description != null ? String(f.description) : '';
      const action =
        f.action != null
          ? String(f.action)
          : f.recommendedAction != null
            ? String(f.recommendedAction)
            : 'Refer the patient for medical assessment.';
      const question = f.question != null ? String(f.question).trim() : '';
      const whyItMatters = f.whyItMatters != null ? String(f.whyItMatters).trim() : '';
      mapped.push({
        flag: title,
        severity,
        question: question || description,
        description: question || description,
        whyItMatters: whyItMatters || undefined,
        reasoning: whyItMatters || description || 'Pathway-configured safety criterion.',
        recommendedAction: action.trim() || 'Refer the patient for medical assessment.',
        requiresImmediateAction: severity === 'CRITICAL' || severity === 'EMERGENCY',
        required: f.required !== false,
        evidenceRefIds: Array.isArray(f.evidenceRefIds)
          ? f.evidenceRefIds.map((id) => String(id)).filter(Boolean)
          : [],
        pathwayRedFlagId: String(f.id ?? `pathway-rf-${index}`),
        source: 'pathway',
      });
    });
    return mapped;
  }

  // ── Treatment safety profile (label + patient CDS) ───────────────────────

  async getTreatmentSafety(
    id: string,
    user: RequestUser,
    opts: { medicationName: string; genericName?: string },
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const medicationName = opts.medicationName?.trim();
    if (!medicationName) {
      throw new BadRequestException('medicationName is required');
    }

    const demographics = (consultation.demographics ?? {}) as {
      pregnancyStatus?: string;
      allergies?: string;
      currentMedications?: string;
      medicationEntries?: Array<{ name?: string; brandName?: string; genericName?: string }>;
      labValues?: string;
    };

    const pathwayTreatment = consultation.selectedPathwayId
      ? await this.prisma.clinicalTreatment.findFirst({
          where: {
            pathwayId: consultation.selectedPathwayId,
            OR: [
              { medicationName: { contains: medicationName, mode: 'insensitive' } },
              ...(opts.genericName
                ? [{ genericName: { contains: opts.genericName, mode: 'insensitive' as const } }]
                : []),
            ],
          },
        })
      : null;

    const patientAllergies = this.extractPatientAllergies(consultation);
    const patientContext = this.buildSafetyPatientContext(consultation, patientAllergies);

    const currentMeds = [
      ...(demographics.medicationEntries ?? []).flatMap((m) =>
        [m.name, m.brandName, m.genericName].filter((x): x is string => Boolean(x?.trim())),
      ),
      ...(demographics.currentMedications
        ? demographics.currentMedications.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
        : []),
    ];

    const pathwayMeta = consultation.selectedPathwayId
      ? await this.prisma.clinicalPathway.findUnique({
          where: { id: consultation.selectedPathwayId },
          select: { name: true, condition: true },
        })
      : null;

    const safetyEval = await this.medicationSafety.evaluate(
      {
        consultationId: id,
        patientContext: {
          ...patientContext,
          conditions: pathwayMeta?.condition ? [pathwayMeta.condition] : undefined,
        },
        selectedMedications: [
          { productName: medicationName, genericName: opts.genericName },
        ],
      },
      user,
      consultation.tenantId,
    );

    const allergyMatches = safetyEval.findings.map((f) => ({
      patientAllergy: patientAllergies[0] ?? '',
      prescribedDrug: medicationName,
      matchedDrugClass: f.relationshipType,
      reason: f.detail,
      risk: f.clinicalSeverity,
    }));

    const profile = await this.treatmentSafety.buildProfile({
      medicationName,
      genericName: opts.genericName || pathwayTreatment?.genericName || null,
      pathway: pathwayTreatment
        ? {
            medicationName: pathwayTreatment.medicationName,
            genericName: pathwayTreatment.genericName,
            dose: pathwayTreatment.dose,
            route: pathwayTreatment.route,
            frequency: pathwayTreatment.frequency,
            duration: pathwayTreatment.duration,
            warnings: pathwayTreatment.warnings ?? [],
            interactions: pathwayTreatment.interactions ?? [],
            pregnancyNotes: pathwayTreatment.pregnancyNotes,
            pregnancyReason: pathwayTreatment.pregnancyReason,
            renalAdjustment: pathwayTreatment.renalAdjustment,
            renalAdjustmentReason: pathwayTreatment.renalAdjustmentReason,
            hepaticAdjustment: pathwayTreatment.hepaticAdjustment,
            hepaticAdjustmentReason: pathwayTreatment.hepaticAdjustmentReason,
            monitoring: pathwayTreatment.monitoring,
            monitoringReason: pathwayTreatment.monitoringReason,
            counsellingNotes: pathwayTreatment.counsellingNotes,
          }
        : {
            medicationName,
            genericName: opts.genericName,
          },
      patient: {
        pregnancyStatus: demographics.pregnancyStatus,
        allergiesText: demographics.allergies,
        allergyNames: patientAllergies,
        currentMedications: currentMeds,
        labValuesText: demographics.labValues,
        conditionName: pathwayMeta?.condition ?? pathwayMeta?.name ?? null,
      },
      allergyMatches,
      // Safety Engine findings are the sole patient-specific caution source
      safetyEngineOnly: true,
    });

    const engineAlerts = safetyEval.findings.map((f) => ({
      ruleId: f.ruleCode ?? `safety.${f.matchType ?? 'finding'}`,
      severity: (f.clinicalSeverity === 'CRITICAL' || f.clinicalSeverity === 'HIGH'
        ? f.clinicalSeverity
        : f.clinicalSeverity === 'MODERATE'
          ? 'MODERATE'
          : 'INFO') as 'CRITICAL' | 'HIGH' | 'MODERATE' | 'INFO',
      title: f.summary,
      explanation: f.detail,
      clinicianAction: f.recommendedAction,
      source: 'SafeScribe CDS' as const,
      sourceKind: 'PATIENT_CDS' as const,
      clinicalCategory: (f.findingType === 'renal_lab'
        ? 'LAB'
        : f.findingType === 'renal_band'
          ? 'RENAL'
          : f.findingType === 'drug_interaction'
            ? 'INTERACTION'
            : f.findingType === 'drug_disease'
              ? 'INTERACTION'
              : f.findingType === 'pregnancy' || f.findingType === 'lactation'
                ? 'PREGNANCY'
                : f.findingType === 'allergy' || f.findingType === 'cross_reactivity'
                  ? 'ALLERGY'
                  : 'INTERACTION') as 'LAB' | 'ALLERGY' | 'INTERACTION' | 'PREGNANCY' | 'RENAL',
      evidenceSource: safetyEval.knowledgeRelease
        ? `${SAFETY_ALERT_LABEL} · ${safetyEval.knowledgeRelease}`
        : SAFETY_ALERT_LABEL,
      evidenceVersion: safetyEval.engineVersion,
    }));

    return {
      ...profile,
      patientAlerts: engineAlerts,
      safetyEvaluation: {
        evaluationId: safetyEval.evaluationId,
        status: safetyEval.status,
        knowledgeRelease: safetyEval.knowledgeRelease,
        terminologyReleaseId: (safetyEval as { terminologyReleaseId?: string | null }).terminologyReleaseId ?? null,
        terminologyVersion: (safetyEval as { terminologyVersion?: string | null }).terminologyVersion ?? null,
        engineVersion: safetyEval.engineVersion,
        mappingWarnings: safetyEval.mappingWarnings,
        findings: safetyEval.findings,
        suppressedFindings: safetyEval.suppressedFindings,
      },
    };
  }

  // ── Treatment plan confirmation (counselling gate) ───────────────────────

  /**
   * Pharmacist confirms the selected treatment plan. Creates an immutable
   * snapshot (stored on treatmentPlan JSON) that counselling generation must
   * use. Selection changes after this mark the plan STALE until re-confirmed.
   */
  async confirmTreatmentPlan(
    id: string,
    user: RequestUser,
    body: {
      selectedIndexes: number[];
      selectedTreatments: Array<Record<string, unknown>>;
      expectedPlanVersion?: number;
      idempotencyKey?: string;
    },
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (consultation.consultationMode === 'CLINICAL_JUDGMENT') {
      await this.assertClinicalJudgmentTreatmentAccess(id);
    }

    if (
      consultation.status === ConsultationStatus.COMPLETED ||
      consultation.status === ConsultationStatus.CANCELLED
    ) {
      throw new BadRequestException('This consultation is locked and cannot be confirmed');
    }

    const existingPlan =
      ((consultation.treatmentPlan as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
    const existingConfirm = readTreatmentPlanConfirmation(existingPlan);
    const currentVersion =
      typeof existingPlan.planVersion === 'number' ? existingPlan.planVersion : 0;

    if (
      body.expectedPlanVersion != null &&
      body.expectedPlanVersion !== currentVersion &&
      existingConfirm.status === 'CONFIRMED'
    ) {
      throw new BadRequestException({
        message: 'Treatment plan changed in another session. Refresh and confirm again.',
        code: 'PLAN_VERSION_CONFLICT',
      });
    }

    // Idempotent replay
    if (
      body.idempotencyKey &&
      existingConfirm.confirmation?.idempotencyKey === body.idempotencyKey &&
      existingConfirm.status === 'CONFIRMED'
    ) {
      return {
        confirmationId: existingConfirm.confirmation.confirmationId,
        planVersion: existingConfirm.confirmation.planVersion,
        planHash: existingConfirm.confirmation.planHash,
        confirmedAt: existingConfirm.confirmation.confirmedAt,
        counsellingStatus: 'READY' as const,
        consultation,
      };
    }

    const patientAllergies = this.extractPatientAllergies(consultation);
    const selected = (body.selectedTreatments ?? [])
      .filter((t) => String(t.medicationName ?? t.genericName ?? '').trim().length > 0)
      .map((t) =>
        sanitizeTreatmentSafety(
          { ...t },
          { patientHasRecordedAllergies: patientAllergies.length > 0 },
        ),
      );
    if (!selected.length) {
      throw new BadRequestException('Select at least one treatment before confirming');
    }

    // Block unresolved allergy conflicts
    for (const t of selected) {
      const allergyBlocked = t.allergyBlocked === true;
      const override = t.clinicalOverride as
        | { acknowledgedRisk?: boolean; reason?: string }
        | undefined;
      if (
        allergyBlocked &&
        !(override?.acknowledgedRisk && String(override.reason ?? '').trim())
      ) {
        throw new BadRequestException(
          'Document a clinical override for allergy-blocked treatments, or remove them',
        );
      }
    }

    this.assertNoBlockingTreatmentDuplicates(selected, existingPlan);
    await this.assertPathwayDuplicates(consultation.selectedPathwayId, selected);

    await this.assertSelectedTreatmentsSafety(id, user, consultation, selected);

    // Basic regimen completeness for medications
    for (const t of selected) {
      const category = String(t.category ?? 'PRESCRIPTION');
      if (category === 'NON_DRUG') continue;
      const dose = String(t.dose ?? t.doseAmount ?? '').trim();
      const frequency = String(t.frequency ?? '').trim();
      if (!dose || !frequency) {
        const name = String(t.genericName ?? t.medicationName ?? 'treatment');
        throw new BadRequestException(
          `Complete the dose and frequency for ${name}`,
        );
      }
    }

    const planHash = computeTreatmentPlanHash(selected);
    const confirmationId = randomUUID();
    const confirmedAt = new Date().toISOString();
    const planVersion = currentVersion + 1;
    const selectedIndexes = Array.isArray(body.selectedIndexes)
      ? body.selectedIndexes.filter((i) => Number.isInteger(i) && i >= 0)
      : [];
    const selectedNames = selected.map((t) =>
      String(t.genericName ?? t.medicationName ?? 'Treatment').trim(),
    );

    const existingList = Array.isArray(existingPlan.recommendedTreatments)
      ? ([...existingPlan.recommendedTreatments] as Record<string, unknown>[])
      : [];
    let recommendedTreatments = existingList;
    if (!recommendedTreatments.length) {
      recommendedTreatments = selected;
    } else {
      for (let i = 0; i < selected.length; i++) {
        const idx = selectedIndexes[i];
        if (typeof idx === 'number' && idx >= 0 && idx < recommendedTreatments.length) {
          recommendedTreatments[idx] = selected[i];
        } else if (selected[i]) {
          recommendedTreatments.push(selected[i]);
        }
      }
    }

    const nextPlan = {
      ...existingPlan,
      recommendedTreatments,
      selectedIndexes,
      selectedIndex: selectedIndexes[0] ?? 0,
      summary:
        typeof existingPlan.summary === 'string' ? existingPlan.summary : '',
      planVersion,
      confirmStatus: 'CONFIRMED',
      confirmation: {
        confirmationId,
        confirmedAt,
        planVersion,
        planHash,
        selectedIndexes,
        selectedNames,
        idempotencyKey: body.idempotencyKey ?? null,
        confirmedBy: user.id,
      },
      selectedItemsSnapshot: selected,
    };

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        treatmentPlan: nextPlan as any,
        stepIndex: Math.max(consultation.stepIndex, 6),
        currentStep: 'TREATMENT',
        status:
          consultation.status === ConsultationStatus.DRAFT
            ? ConsultationStatus.IN_PROGRESS
            : consultation.status,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'TREATMENT_PLAN_CONFIRMED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: id,
        confirmationId,
        planVersion,
        planHash,
        selectedCount: selected.length,
      },
    });

    return {
      confirmationId,
      planVersion,
      planHash,
      confirmedAt,
      counsellingStatus: 'QUEUED' as const,
      consultation: updated,
    };
  }

  /** Mark a confirmed plan stale after the pharmacist edits the selection. */
  async invalidateTreatmentPlanConfirmation(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const existingPlan =
      ((consultation.treatmentPlan as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >;
    const existingConfirm = readTreatmentPlanConfirmation(existingPlan);
    if (existingConfirm.status !== 'CONFIRMED') {
      return consultation;
    }
    const nextPlan = {
      ...existingPlan,
      confirmStatus: 'STALE',
      planVersion:
        (typeof existingPlan.planVersion === 'number'
          ? existingPlan.planVersion
          : 0) + 1,
    };
    return this.prisma.consultation.update({
      where: { id },
      data: { treatmentPlan: nextPlan as any },
    });
  }

  // ── AI: Generate Counselling ─────────────────────────────────────────────

  async generateCounselling(
    id: string,
    user: RequestUser,
    body?: {
      treatmentPlan?: Record<string, unknown>;
      selectedTreatments?: unknown[];
      confirmationId?: string;
      /** ai = fast-model LLM draft (preferred after confirm). fast = pathway compose only. */
      mode?: 'fast' | 'ai';
      /** Client-built draft for instant persist (fast mode only). */
      draft?: Record<string, unknown>;
    },
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const storedConfirm = readTreatmentPlanConfirmation(consultation.treatmentPlan);
    // Prefer confirmed snapshot when a confirmation id is supplied or plan is confirmed
    const useConfirmed =
      Boolean(body?.confirmationId) || storedConfirm.status === 'CONFIRMED';
    if (body?.confirmationId && storedConfirm.confirmation) {
      if (storedConfirm.confirmation.confirmationId !== body.confirmationId) {
        throw new BadRequestException(
          'Confirmation does not match the current treatment plan. Confirm again.',
        );
      }
    }

    // Default to AI after confirmation; keep fast for explicit pathway-only persist
    const mode = body?.mode === 'fast' ? 'fast' : 'ai';

    if (mode === 'ai' && !useConfirmed) {
      throw new BadRequestException(
        'Confirm the treatment plan before generating counselling',
      );
    }

    // ── Fast path: persist client draft or pathway compose (no LLM) ────────
    if (mode === 'fast') {
      const extras = await this.loadPathwayCounsellingSources(
        consultation.selectedPathwayId,
      );
      const result =
        body?.draft && typeof body.draft === 'object'
          ? this.applyCounsellingLifecycle({
              ...body.draft,
              // Preserve AI provenance when the client persists a reviewed AI plan.
              source:
                body.draft.source === 'ai' || body.draft.generationMode === 'ai'
                  ? 'ai'
                  : (body.draft.source ?? 'pathway'),
              generationMode:
                body.draft.generationMode === 'ai' || body.draft.source === 'ai'
                  ? 'ai'
                  : 'fast',
              generatedAt: new Date().toISOString(),
            })
          : this.applyCounsellingLifecycle(
              this.buildFastCounsellingDraft(consultation, body, extras),
            );

      await this.prisma.consultation.update({
        where: { id },
        data: { counsellingNotes: result as object },
      });
      return result;
    }

    if (!this.aiEngine.isAvailable) {
      return this.composeCounsellingFallback(consultation, body, 'AI_ENGINE_URL not configured');
    }

    const engineReady = await this.aiEngine.pingHealthy();
    if (!engineReady) {
      return this.composeCounsellingFallback(
        consultation,
        body,
        this.aiEngine.lastHealthDetail ?? 'Assist engine is not reachable',
      );
    }

    const [sources, cj] = await Promise.all([
      this.loadPathwayCounsellingSources(consultation.selectedPathwayId),
      this.prisma.clinicalJudgmentAssessment.findUnique({
        where: { consultationId: id },
        select: { workingDiagnosisText: true },
      }),
    ]);
    const { counselling, followups, pathwayMeta } = sources;

    const snapshotItems =
      useConfirmed &&
      consultation.treatmentPlan &&
      typeof consultation.treatmentPlan === 'object' &&
      Array.isArray(
        (consultation.treatmentPlan as { selectedItemsSnapshot?: unknown[] })
          .selectedItemsSnapshot,
      )
        ? ((consultation.treatmentPlan as { selectedItemsSnapshot: unknown[] })
            .selectedItemsSnapshot as unknown[])
        : null;

    const treatmentPlan = {
      ...((consultation.treatmentPlan as Record<string, unknown> | null) ?? {}),
      ...(body?.treatmentPlan ?? {}),
      ...(snapshotItems
        ? { recommendations: snapshotItems }
        : body?.selectedTreatments
          ? { recommendations: body.selectedTreatments }
          : {}),
    };

    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const selectedTreatments =
      snapshotItems ??
      body?.selectedTreatments ??
      (treatmentPlan as { recommendations?: unknown[] }).recommendations ??
      [];

    const llmPayload = buildCounsellingLlmPayload({
      assessment:
        pathwayMeta?.condition?.trim() ||
        pathwayMeta?.name?.trim() ||
        cj?.workingDiagnosisText?.trim() ||
        consultation.chiefComplaint?.trim() ||
        '',
      demographics: demo,
      redFlags: consultation.redFlags,
      selectedTreatments: Array.isArray(selectedTreatments) ? selectedTreatments : [],
      conditionRows: counselling.map((c) => ({
        category: c.category,
        point: c.point,
        detail: c.detail,
        approved: c.approved,
        outputSection: 'outputSection' in c ? c.outputSection : null,
      })),
      followups: followups.map((f) => ({
        timeframe: f.timeframe,
        condition: f.condition,
        action: f.action,
        urgency: f.urgency,
      })),
    });

    const payloadMeta = counsellingPayloadMeta(llmPayload);
    this.logger.log(
      `counselling payload consultation=${id} treatments=${payloadMeta.selected_treatments} approved=${JSON.stringify(payloadMeta.approved_counselling)}`,
    );

    if (!llmPayload.selected_treatments.length) {
      throw new BadRequestException(
        'Confirm at least one treatment before generating counselling',
      );
    }

    const callEngine = (stricter = false) =>
      this.callAiEngine('/api/v1/consultations/generate-counselling', {
        patient_context: llmPayload.patient_context,
        selected_treatments: llmPayload.selected_treatments,
        approved_counselling: llmPayload.approved_counselling,
        stricter_retry: stricter,
      });

    let result: unknown;
    try {
      result = await callEngine(false);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Counselling generation failed';
      this.logger.warn(`generateCounselling soft-fail: ${reason}`);
      return this.composeCounsellingFallback(consultation, body, reason, sources);
    }

    let validated = validateCounsellingOutput(result, llmPayload);
    if (validated.medicationFallbackUsed) {
      this.logger.warn(
        `generateCounselling medication validation failed (${validated.reason}) — retrying once`,
      );
      try {
        result = await callEngine(true);
        validated = validateCounsellingOutput(result, llmPayload);
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Counselling retry failed';
        this.logger.warn(`generateCounselling retry failed: ${reason}`);
      }
    }

    const sections = validated.sections;
    const composedFill = this.buildFastCounsellingDraft(consultation, body, sources);
    const PATHWAY_CARD_KEYS = new Set(['EXPECTED_RESPONSE', 'SELF_CARE', 'FOLLOW_UP']);
    for (const section of sections) {
      const fallback = composedFill.sections.find(
        (row) => row.section_key === section.section_key,
      );
      if (PATHWAY_CARD_KEYS.has(section.section_key) && fallback?.bullets.length) {
        section.bullets = fallback.bullets;
        continue;
      }
      if (section.bullets.length) continue;
      if (fallback?.bullets.length) {
        section.bullets = fallback.bullets;
      }
    }
    const hasMed =
      sections.find((s) => s.section_key === 'MEDICATION_USE')?.bullets.length ?? 0;
    if (!hasMed) {
      this.logger.warn('generateCounselling: no medication bullets — using regimen compose');
      return this.composeCounsellingFallback(consultation, body, undefined, sources);
    }

    const enriched = {
      sections: sections.map((s) => ({
        ...s,
        category:
          s.section_key === 'MEDICATION_USE'
            ? 'How to use your medicine'
            : s.section_key === 'EXPECTED_RESPONSE'
              ? 'What to expect'
              : s.section_key === 'SELF_CARE'
                ? 'Self-care & non-drug measures'
                : 'Follow-up & when to seek care',
        points: s.bullets.map((point, i) => ({ point, important: i === 0 })),
      })),
      source: 'ai',
      generationMode: 'ai',
      generatedAt: new Date().toISOString(),
      counselling_status: 'review_required',
      ai_draft: sections,
      confirmed_counselling: null,
      schemaVersion: '1.1',
      promptVersion: 'counselling-cards-v1',
      payloadMeta,
      validation: {
        medicationFallbackUsed: validated.medicationFallbackUsed,
        droppedUnapproved: validated.droppedUnapproved,
        reason: validated.reason ?? null,
      },
    };

    await this.prisma.consultation.update({
      where: { id },
      data: { counsellingNotes: enriched as object },
    });
    return enriched;
  }

  private counsellingHasBullets(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') return false;
    const sections = (payload as { sections?: unknown }).sections;
    if (!Array.isArray(sections)) return false;
    return sections.some((section) => {
      if (!section || typeof section !== 'object') return false;
      const row = section as { bullets?: unknown; points?: unknown; items?: unknown };
      const lists = [row.bullets, row.points, row.items];
      return lists.some(
        (list) =>
          Array.isArray(list) &&
          list.some((item) => {
            if (typeof item === 'string') return item.trim().length > 0;
            if (item && typeof item === 'object') {
              const text = String(
                (item as { point?: unknown; text?: unknown }).point ??
                  (item as { text?: unknown }).text ??
                  '',
              ).trim();
              return text.length > 0;
            }
            return false;
          }),
      );
    });
  }

  private normalizeAiCounsellingResult(result: unknown): Record<string, unknown> {
    if (!result || typeof result !== 'object') return { sections: [] };
    return result as Record<string, unknown>;
  }

  private applyCounsellingLifecycle(
    draft: Record<string, unknown>,
  ): Record<string, unknown> {
    const plan = (draft.plan ?? null) as { status?: string; sections?: unknown } | null;
    const reviewed =
      String(draft.counselling_status ?? '') === 'confirmed' ||
      plan?.status === 'REVIEWED';
    return {
      ...draft,
      counselling_status: reviewed ? 'confirmed' : 'review_required',
      confirmed_counselling: reviewed
        ? (draft.confirmed_counselling ?? plan?.sections ?? draft.sections ?? null)
        : null,
    };
  }

  private async loadPathwayCounsellingSources(pathwayId: string | null) {
    if (!pathwayId) {
      return {
        counselling: [] as Array<{
          id: string;
          category: string;
          point: string;
          detail: string | null;
          approved: boolean;
          outputSection?: string | null;
          archivedAt?: Date | null;
        }>,
        followups: [] as Array<{
          timeframe: string | null;
          condition: string | null;
          action: string | null;
          urgency: string | null;
        }>,
        pathwayMeta: null as { name: string | null; condition: string | null } | null,
      };
    }
    const [counsellingRows, followupRows, pathwayMeta] = await Promise.all([
      this.prisma.clinicalCounselling.findMany({
        where: { pathwayId, archivedAt: null },
        orderBy: { displayOrder: 'asc' },
        take: 48,
      }),
      this.prisma.clinicalFollowup.findMany({
        where: { pathwayId },
        orderBy: { displayOrder: 'asc' },
        take: 24,
      }),
      this.prisma.clinicalPathway.findUnique({
        where: { id: pathwayId },
        select: { name: true, condition: true },
      }),
    ]);
    const counselling = selectPathwayGuidanceForCounselling(counsellingRows);
    const hasFollowUpGuidance = counselling.some(
      (c) => resolveGuidanceSection(c.outputSection, c.category) === 'follow_up',
    );
    const followups = hasFollowUpGuidance
      ? []
      : selectFollowupsForCounselling(followupRows);
    if (!counselling.length && counsellingRows.length) {
      this.logger.warn(
        `counselling using no usable pathway points pathway=${pathwayId} drafted=${counsellingRows.length}`,
      );
    }
    return { counselling, followups, pathwayMeta };
  }

  private async composeCounsellingFallback(
    consultation: Awaited<ReturnType<ConsultationsService['findOrThrow']>>,
    body?: {
      selectedTreatments?: unknown[];
      treatmentPlan?: Record<string, unknown>;
    },
    reason?: string,
    extras?: Awaited<ReturnType<ConsultationsService['loadPathwayCounsellingSources']>>,
  ) {
    const sources =
      extras ??
      (await this.loadPathwayCounsellingSources(consultation.selectedPathwayId));
    const composed = this.buildFastCounsellingDraft(consultation, body, sources);
    const result = this.applyCounsellingLifecycle({
      ...composed,
      source: 'regimen',
      generationMode: 'composed',
      generatedAt: new Date().toISOString(),
      ...(reason ? { reason } : {}),
    });
    await this.prisma.consultation.update({
      where: { id: consultation.id },
      data: { counsellingNotes: result as object },
    });
    return result;
  }

  /**
   * Instant counselling draft from approved pathway points + selected regimen.
   * Related condition/treatment counselling is classified into all four cards.
   */
  private buildFastCounsellingDraft(
    consultation: {
      chiefComplaint?: string | null;
      selectedPathwayId?: string | null;
      demographics?: unknown;
      pathway?: {
        name?: string | null;
        condition?: string | null;
        counsellings?: Array<{
          id: string;
          category: string;
          point: string;
          detail: string | null;
          approved: boolean;
          outputSection?: string | null;
          archivedAt?: Date | string | null;
        }>;
      } | null;
      treatmentPlan?: unknown;
    },
    body?: {
      selectedTreatments?: unknown[];
      treatmentPlan?: Record<string, unknown>;
    },
    extras?: Awaited<ReturnType<ConsultationsService['loadPathwayCounsellingSources']>>,
  ) {
    const counsellingRowsRaw = (
      extras?.counselling?.length
        ? extras.counselling
        : (consultation.pathway?.counsellings ?? [])
    ).filter((c) => c.point?.trim() || c.detail?.trim());
    const counsellingRows = selectPathwayGuidanceForCounselling(counsellingRowsRaw);

    const storedPlan =
      consultation.treatmentPlan && typeof consultation.treatmentPlan === 'object'
        ? (consultation.treatmentPlan as {
            selectedItemsSnapshot?: unknown[];
            recommendations?: unknown[];
          })
        : null;

    const selected = (
      Array.isArray(body?.selectedTreatments)
        ? body!.selectedTreatments
        : Array.isArray(body?.treatmentPlan?.recommendations)
          ? (body!.treatmentPlan!.recommendations as unknown[])
          : Array.isArray(storedPlan?.selectedItemsSnapshot)
            ? storedPlan!.selectedItemsSnapshot
            : Array.isArray(storedPlan?.recommendations)
              ? storedPlan!.recommendations
              : []
    ) as Array<Record<string, unknown>>;

    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const ageYears = ageYearsFromDemographics({
      age: demo.age as string | number | undefined,
      ageUnit: demo.ageUnit as string | undefined,
      dateOfBirth: demo.dateOfBirth as string | undefined,
      dateOfBirthUnavailable: demo.dateOfBirthUnavailable === true,
    });
    const pediatric = ageYears != null && ageYears < 18;

    const hasFollowUpGuidance = counsellingRows.some(
      (r) =>
        resolveGuidanceSection(
          'outputSection' in r ? r.outputSection : null,
          r.category,
        ) === 'follow_up',
    );
    const followupRows = hasFollowUpGuidance
      ? []
      : (extras?.followups ?? []).map((f, i) => ({
          id: `fu-${i}`,
          category: 'follow_up',
          point: [f.action, f.condition, f.timeframe].filter(Boolean).join(' — '),
          detail: null as string | null,
        }));

    const treatmentFollowUp = selected.flatMap((t, i) => {
      const fu = String(t.followUpAdvice ?? '').trim();
      return isUsablePatientGuidanceText(fu)
        ? [{ id: `t-fu-${i}`, category: 'follow_up', point: fu, detail: null }]
        : [];
    });

    const composed = composeCounsellingSections({
      conditionName:
        extras?.pathwayMeta?.condition?.trim() ||
        extras?.pathwayMeta?.name?.trim() ||
        consultation.pathway?.condition?.trim() ||
        consultation.pathway?.name?.trim() ||
        consultation.chiefComplaint?.trim() ||
        'your symptoms',
      pediatric,
      treatments: selected.slice(0, MAX_HOW_TO_USE_TREATMENTS).map((t, i) => ({
        id: String(t.pathwayTreatmentId ?? t.medicationName ?? `t-${i}`),
        displayName: String(
          t.displayName || t.genericName || t.medicationName || 'treatment',
        ).trim(),
        category: String(t.category ?? 'PRESCRIPTION'),
        dose: t.dose != null ? String(t.dose) : null,
        route: t.route != null ? String(t.route) : null,
        frequency: t.frequency != null ? String(t.frequency) : null,
        duration: t.duration != null ? String(t.duration) : null,
        instructions:
          t.instructions != null
            ? String(t.instructions)
            : t.counsellingNotes != null
              ? String(t.counsellingNotes)
              : null,
        patientDirections:
          t.patientDirections != null
            ? String(t.patientDirections)
            : t.patient_directions != null
              ? String(t.patient_directions)
              : t.instructions != null
                ? String(t.instructions)
                : null,
      })),
      pathwayRows: [
        ...counsellingRows.map((r) => ({
          id: r.id,
          category: r.category,
          point: r.point,
          detail: r.detail,
          outputSection: 'outputSection' in r ? r.outputSection : null,
          archivedAt: 'archivedAt' in r ? r.archivedAt : null,
        })),
        ...followupRows,
        ...treatmentFollowUp,
      ],
    });

    const sectionMeta: Array<{
      key: keyof typeof composed;
      section_key: string;
      category: string;
    }> = [
      {
        key: 'howToUse',
        section_key: 'MEDICATION_USE',
        category: 'How to use your medicine',
      },
      {
        key: 'whatToExpect',
        section_key: 'EXPECTED_RESPONSE',
        category: 'What to expect',
      },
      {
        key: 'selfCare',
        section_key: 'SELF_CARE',
        category: 'Self-care & non-drug measures',
      },
      {
        key: 'followUp',
        section_key: 'FOLLOW_UP',
        category: 'Follow-up & when to seek care',
      },
    ];

    const sections = sectionMeta.map((meta) => {
      const bullets = composed[meta.key];
      return {
        section_key: meta.section_key,
        category: meta.category,
        bullets,
        points: bullets.map((point, i) => ({
          point,
          important: i === 0,
        })),
      };
    });

    return {
      sections,
      keyMessages: composed.howToUse.slice(0, 3),
      source: 'pathway',
      generationMode: 'fast',
      generatedAt: new Date().toISOString(),
      schemaVersion: '1.1',
      counselling_status: 'review_required',
      ai_draft: sections,
      confirmed_counselling: null,
    };
  }

  // ── AI: Generate Documentation ───────────────────────────────────────────

  async generateDocumentation(
    id: string,
    user: RequestUser,
    req?: Request,
    dto: {
      requestedDocumentTypes?: string[];
      force?: boolean;
    } = {},
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const documentFormats = await this.docFormats.getGenerationInstructions();

    const [pharmacist, pathway, assessment, rationale, referralOutcome, tenant] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: consultation.pharmacistId },
          select: { firstName: true, lastName: true },
        }),
        consultation.selectedPathwayId
          ? this.prisma.clinicalPathway.findUnique({
              where: { id: consultation.selectedPathwayId },
              select: {
                name: true,
                condition: true,
                version: true,
                lastClinicalReview: true,
                clinicallyReviewedAt: true,
                primaryDocumentationReferenceId: true,
                secondaryDocumentationReferenceId: true,
                libraryReferences: {
                  where: { status: { not: 'archived' } },
                  select: {
                    id: true,
                    citationTitle: true,
                    publicationYear: true,
                    edition: true,
                  },
                },
                differentials: true,
                questions: {
                  orderBy: [{ displayOrder: 'asc' }],
                  select: {
                    id: true,
                    question: true,
                    description: true,
                    section: { select: { name: true, displayName: true } },
                  },
                },
              },
            })
          : Promise.resolve(null),
        this.prisma.clinicalJudgmentAssessment.findUnique({
          where: { consultationId: id },
          include: {
            redFlagChecks: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              include: {
                questions: {
                  orderBy: { sequence: 'asc' },
                  select: {
                    canonicalLabel: true,
                    questionText: true,
                    answer: true,
                    answerNotes: true,
                  },
                },
                manualConcerns: {
                  select: { concernText: true, responseStatus: true },
                },
              },
            },
          },
        }),
        this.prisma.treatmentRationale.findUnique({
          where: { consultationId: id },
          include: { alternatives: true },
        }),
        this.prisma.consultationReferralOutcome.findUnique({
          where: { consultationId: id },
          select: {
            documentationText: true,
            actionTaken: true,
            letterExternalSendConfirmed: true,
            completedAt: true,
            status: true,
          },
        }),
        consultation.tenantId
          ? this.prisma.tenant.findUnique({
              where: { id: consultation.tenantId },
              select: { name: true, faxNumber: true, phone: true, address: true, timezone: true },
            })
          : Promise.resolve(null),
      ]);

    const pathwaySummary = pathway
      ? { name: pathway.name, condition: pathway.condition }
      : null;

    const pcpPayload = buildPcpCommunicationPayloadFromConsultation(consultation, {
      pharmacist,
      pathway: pathwaySummary,
      clinicalJudgmentAssessment: assessment
        ? {
            workingDiagnosisText: assessment.workingDiagnosisText,
            diagnosticCertainty: assessment.diagnosticCertainty,
            assessmentSummary: assessment.assessmentSummary,
            assessmentSufficient: assessment.assessmentSufficient,
          }
        : null,
      treatmentRationale: rationale
        ? {
            status: rationale.status,
            selectionRationale: rationale.selectionRationale,
            reasonForPrescribing: rationale.reasonForPrescribing,
          }
        : null,
      referralOutcome: referralOutcome
        ? {
            documentationText: referralOutcome.documentationText,
            actionTaken: referralOutcome.actionTaken,
            referralSendConfirmed: referralOutcome.letterExternalSendConfirmed,
            action_completed:
              referralOutcome.status === 'COMPLETED' ||
              Boolean(referralOutcome.completedAt) ||
              referralOutcome.letterExternalSendConfirmed === true,
          }
        : null,
    });

    const patientSummaryPayload = buildPatientSummaryPayloadFromConsultation(
      consultation,
      {
        pathway: pathwaySummary,
        clinicalJudgmentAssessment: assessment
          ? {
              workingDiagnosisText: assessment.workingDiagnosisText,
              diagnosticCertainty: assessment.diagnosticCertainty,
              assessmentSummary: assessment.assessmentSummary,
            }
          : null,
        pharmacyName: tenant?.name ?? null,
        pharmacyPhone: tenant?.phone ?? null,
        pharmacyAddress: tenant?.address ?? null,
      },
    );

    const adaptPayload =
      consultation.module === SAFESCRIBE_MODULES.ADAPT
        ? parseAdaptPayload(consultation.renewPayload)
        : null;
    const adaptIndication =
      adaptPayload != null
        ? adaptStep1IndicationLabel(adaptPayload.step1?.indication) ||
          adaptPayload.step1?.adaptationReason?.label ||
          null
        : null;
    const adaptRationale =
      adaptPayload?.step3B?.clinicalRationale?.trim() ||
      adaptPayload?.step3A?.rationaleDraft?.trim() ||
      null;

    const dapPayload = buildDapPayloadFromConsultation({
      chiefComplaint: consultation.chiefComplaint || adaptIndication,
      demographics: consultation.demographics,
      questionResponses: consultation.questionResponses,
      redFlags: consultation.redFlags,
      eligibility: consultation.eligibility,
      treatmentPlan: consultation.treatmentPlan,
      counsellingNotes: consultation.counsellingNotes,
      documentation: consultation.documentation,
      consultationMode: consultation.consultationMode,
      // Reuse the same confirmed follow-up plan as the PCP communication.
      // DAP generation must not lose it while building its own payload.
      followUpPlan: pcpPayload.pcp_follow_up_plan,
      followUpRequired: pcpPayload.follow_up_required,
      presentingConcern: pcpPayload.presenting_concern || adaptIndication,
      pathway: pathway
        ? {
            name: pathway.name,
            condition: pathway.condition,
            questions: pathway.questions,
            differentials: Array.isArray(pathway.differentials)
              ? (pathway.differentials as Array<{
                  name?: string | null;
                  condition?: string | null;
                }>)
              : [],
          }
        : adaptIndication
          ? {
              name: 'Prescription Adaptation',
              condition: adaptIndication,
              questions: [],
              differentials: [],
            }
          : null,
      clinicalJudgmentAssessment: assessment
        ? {
            workingDiagnosisText: assessment.workingDiagnosisText,
            diagnosticCertainty: assessment.diagnosticCertainty,
            assessmentSummary: assessment.assessmentSummary,
            assessmentSufficient: assessment.assessmentSufficient,
            unresolvedRedFlags: assessment.unresolvedRedFlags,
            redFlagChecks: assessment.redFlagChecks,
          }
        : adaptRationale
          ? {
              workingDiagnosisText: adaptIndication || 'Prescription adaptation',
              diagnosticCertainty: null,
              assessmentSummary: adaptRationale,
              assessmentSufficient: true,
              unresolvedRedFlags: false,
              redFlagChecks: [],
            }
          : null,
      treatmentRationale: rationale
        ? {
            status: rationale.status,
            selectionRationale: rationale.selectionRationale,
            reasonForPrescribing: rationale.reasonForPrescribing,
            alternatives: rationale.alternatives,
          }
        : adaptRationale
          ? {
              status: 'CONFIRMED',
              selectionRationale: adaptRationale,
              reasonForPrescribing: adaptRationale,
              alternatives: [],
            }
          : null,
      referralOutcome: referralOutcome
        ? {
            documentationText: referralOutcome.documentationText,
            actionTaken: referralOutcome.actionTaken,
            action_completed:
              referralOutcome.status === 'COMPLETED' ||
              Boolean(referralOutcome.completedAt) ||
              referralOutcome.letterExternalSendConfirmed === true,
            status: referralOutcome.status,
            completedAt: referralOutcome.completedAt,
            letterExternalSendConfirmed: referralOutcome.letterExternalSendConfirmed,
          }
        : null,
    });

    const prescriptionPayload = {
      selected_treatments: dapPayload.selected_treatments,
      assessment: dapPayload.assessment,
      presenting_concern: dapPayload.presenting_concern,
    };

    const consultationData: Record<string, unknown> = {
      dap_payload: toLlmDapPayload(dapPayload),
      pcp_payload: toLlmPcpPayload(pcpPayload),
      patient_summary_payload: patientSummaryPayload,
      prescription_payload: prescriptionPayload,
      source_hash: computeDocumentationSourceHash({
        treatments: dapPayload.selected_treatments,
        assessment: dapPayload.assessment.condition,
        counselling: dapPayload.confirmed_counselling,
        referralCompleted: dapPayload.referral.action_completed,
        consentObtained: dapPayload.consent_obtained === true,
      }),
    };

    const sourceHash = String(consultationData.source_hash ?? '');
    const llmKeys = documentationLlmKeysToGenerate({
      requestedDocumentTypes: dto.requestedDocumentTypes,
      force: dto.force === true,
      sourceHash,
      existingDocumentation: consultation.documentation,
    });

    const startedAt = Date.now();
    const livePrompts = await this.aiConfig.getLivePrompts([
      AI_PROMPT_KEYS.DOCUMENTATION_CONSULTATION_NOTE,
      AI_PROMPT_KEYS.DOCUMENTATION_PRESCRIBER_COMMUNICATION,
    ]);
    const documentPrompts = {
      consultation_note:
        livePrompts[AI_PROMPT_KEYS.DOCUMENTATION_CONSULTATION_NOTE] ?? '',
      prescriber_communication:
        livePrompts[AI_PROMPT_KEYS.DOCUMENTATION_PRESCRIBER_COMMUNICATION] ?? '',
    };

    const asOf = consultationDateOnly(consultation.createdAt, tenant?.timezone);
    const existingCanonical = sanitizeDocumentationDob(
      this.canonicalizeDocumentation(
        (consultation.documentation && typeof consultation.documentation === 'object'
          ? (consultation.documentation as Record<string, unknown>)
          : {}) as Record<string, unknown>,
      ),
      consultation.demographics,
      asOf,
    );

    const runGeneration = (stricter: boolean, keys: string[]) =>
      this.aiEngine.postJson(
        '/api/v1/consultations/generate-documentation',
        {
          consultation_data: consultationData,
          document_formats: documentFormats,
          document_prompts: documentPrompts,
          stricter_retry: stricter,
          requested_documents: keys,
        },
        // Prefer a bounded wait so Documents can fall back to Nest drafts.
        stricter ? 50_000 : 90_000,
      );

    let canonical = existingCanonical;
    let retryCount = 0;
    const reused = llmKeys.length === 0;

    if (llmKeys.length > 0 && !this.aiEngine.isAvailable) {
      this.logger.warn(
        `documentation.generate consultationId=${id} skipped_llm=ai_unavailable`,
      );
    } else if (llmKeys.length > 0) {
      try {
        const result = await runGeneration(false, llmKeys);
        canonical = this.mergeGeneratedDocumentation(
          existingCanonical,
          this.canonicalizeDocumentation(result as Record<string, unknown>),
          llmKeys,
        );

        const rawPcp = (
          canonical.documents as
            | { prescriber_communication?: Record<string, string> }
            | undefined
        )?.prescriber_communication;
        const rawDap = (
          canonical.documents as
            | { consultation_note?: Record<string, string> }
            | undefined
        )?.consultation_note;
        const dapPass = llmKeys.includes('consultation_note')
          ? rawDap
            ? validateDapNote(rawDap, dapPayload)
            : { ok: false, medicationFailed: true, unsupportedFacts: true }
          : { ok: true, medicationFailed: false, unsupportedFacts: false };
        const pcpPass = llmKeys.includes('prescriber_communication')
          ? rawPcp
            ? validatePcpCommunication(rawPcp, pcpPayload)
            : { ok: true, unsupportedClinical: false }
          : { ok: true, unsupportedClinical: false };

        const retryKeys = documentationLlmRetryKeys({
          requested: llmKeys,
          consultationNoteNeedsRetry:
            !dapPass.ok && (dapPass.medicationFailed || dapPass.unsupportedFacts),
          prescriberCommunicationNeedsRetry:
            !pcpPass.ok && pcpPass.unsupportedClinical,
        });

        if (retryKeys.length > 0) {
          const elapsed = Date.now() - startedAt;
          if (elapsed < 45_000) {
            retryCount = retryKeys.length;
            try {
              const retryResult = await runGeneration(true, retryKeys);
              canonical = this.mergeGeneratedDocumentation(
                canonical,
                this.canonicalizeDocumentation(retryResult as Record<string, unknown>),
                retryKeys,
              );
            } catch (retryErr) {
              this.logger.warn(
                `documentation.generate consultationId=${id} retry_failed: ${
                  retryErr instanceof Error ? retryErr.message : retryErr
                }`,
              );
            }
          } else {
            this.logger.warn(
              `documentation.generate consultationId=${id} retry_skipped elapsedMs=${elapsed} keys=${retryKeys.join(',')}`,
            );
          }
        }
      } catch (err) {
        this.logger.warn(
          `documentation.generate consultationId=${id} llm_failed — using Nest drafts: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }

      // Repair DAP Plan after LLM (or Nest draft fallback): treatments, narrative, follow-up.
      if (llmKeys.includes('consultation_note')) {
        canonical = this.applyDapPostGeneration(canonical, dapPayload, {
          aiAnalysis: consultation.aiAnalysis,
          pathwayLabel: pathwaySummary?.condition || pathwaySummary?.name || null,
          pathwayVersion: pathway?.version != null ? `v${pathway.version}` : null,
          primaryReference: this.pathwayDocumentationCitation(
            pathway?.libraryReferences,
            pathway?.primaryDocumentationReferenceId,
          ),
          secondaryReference: this.pathwayDocumentationCitation(
            pathway?.libraryReferences,
            pathway?.secondaryDocumentationReferenceId,
          ),
          lastReviewed:
            pathway?.lastClinicalReview?.toISOString() ??
            pathway?.clinicallyReviewedAt?.toISOString() ??
            null,
        });
      }
      if (llmKeys.includes('prescriber_communication')) {
        canonical = this.applyPcpPostGeneration(canonical, pcpPayload, {
          pharmacyName: tenant?.name ?? null,
          pharmacyFax: tenant?.faxNumber ?? null,
          dateOfBirth:
            (consultation.demographics as { dateOfBirth?: string } | null)
              ?.dateOfBirth ?? null,
        });
      }
    }

    const existingHandout = (
      canonical.documents as { patient_care_summary?: unknown } | undefined
    )?.patient_care_summary;
    if (
      !reused ||
      !documentationDocumentHasContent(existingHandout, 'patient_care_summary')
    ) {
      canonical = this.applyPatientHandoutPostGeneration(
        canonical,
        patientSummaryPayload,
      );
    }
    canonical = { ...canonical, sourceHash };

    const latestRow = await this.prisma.consultation.findUnique({
      where: { id },
      select: { documentation: true },
    });
    canonical = this.retainClinicalReferences(
      canonical as Record<string, unknown>,
      latestRow?.documentation ?? consultation.documentation,
    ) as typeof canonical;
    canonical = sanitizeDocumentationDob(
      canonical as Record<string, unknown>,
      consultation.demographics,
      asOf,
    ) as typeof canonical;

    const storedHash =
      typeof (consultation.documentation as { sourceHash?: string } | null)
        ?.sourceHash === 'string'
        ? (consultation.documentation as { sourceHash?: string }).sourceHash
        : undefined;
    if (!(reused && storedHash === sourceHash)) {
      await this.prisma.consultation.update({
        where: { id },
        data: { documentation: canonical as any },
      });
    }

    this.logger.log(
      `documentation.generate consultationId=${id} reused=${reused} llmKeys=${llmKeys.join(',') || 'none'} retries=${retryCount} durationMs=${Date.now() - startedAt}`,
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DOCUMENTATION_GENERATE',
      module: 'CONSULTATIONS',
      previousValue: {
        consultationId: id,
        hadDocumentation: Boolean(consultation.documentation),
      },
      newValue: {
        consultationId: id,
        revision: canonical.revision ?? 1,
        documentKeys: Object.keys(
          (canonical.documents as Record<string, unknown> | undefined) ?? {},
        ),
        reused,
        llmKeys,
        retries: retryCount,
      },
      ...(req ? this.getClientInfo(req) : {}),
    });

    return canonical;
  }

  /**
   * Translate the pharmacist-confirmed Patient Care Summary.
   * Server loads confirmed source — the client only sends target_language.
   */
  async translatePatientHandout(
    id: string,
    targetLanguage: string,
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const lang = normalizeHandoutLanguage(targetLanguage);
    if (!isSupportedHandoutLanguage(targetLanguage)) {
      throw new BadRequestException('That handout language is not supported');
    }

    const [pathway, assessment, tenant] = await Promise.all([
      consultation.selectedPathwayId
        ? this.prisma.clinicalPathway.findUnique({
            where: { id: consultation.selectedPathwayId },
            select: { name: true, condition: true },
          })
        : Promise.resolve(null),
      this.prisma.clinicalJudgmentAssessment.findUnique({
        where: { consultationId: id },
        select: {
          workingDiagnosisText: true,
          diagnosticCertainty: true,
          assessmentSummary: true,
        },
      }),
      consultation.tenantId
        ? this.prisma.tenant.findUnique({
            where: { id: consultation.tenantId },
            select: { name: true, faxNumber: true, phone: true, address: true },
          })
        : Promise.resolve(null),
    ]);

    const summary = buildPatientSummaryPayloadFromConsultation(consultation, {
      pathway,
      clinicalJudgmentAssessment: assessment
        ? {
            workingDiagnosisText: assessment.workingDiagnosisText,
            diagnosticCertainty: assessment.diagnosticCertainty,
            assessmentSummary: assessment.assessmentSummary,
          }
        : null,
      selectedLanguage: lang,
      pharmacyName: tenant?.name ?? null,
      pharmacyPhone: tenant?.phone ?? null,
      pharmacyAddress: tenant?.address ?? null,
    });
    const canonical = buildCanonicalHandoutPayload(summary, lang);
    const sourceHash = hashCanonicalHandout(canonical);

    const existingDocs = (consultation.documentation ?? {}) as {
      documents?: { patient_care_summary?: Record<string, string> };
      patient_care_summary?: Record<string, string>;
    };
    const previous =
      existingDocs.documents?.patient_care_summary ??
      existingDocs.patient_care_summary ??
      {};

    let fields: Record<string, string>;
    let validationStatus = 'ok';
    let retried = false;
    let fallback = false;
    let cacheSource: 'stored' | 'redis' | 'google' | 'none' = 'none';

    if (lang === 'en') {
      fields = englishHandoutFieldsFromPayload(summary, 'en');
    } else if (isReusableHandoutTranslation(previous, lang, sourceHash)) {
      fields = previous;
      validationStatus = previous.translationValidationStatus || 'ok';
      fallback = previous.translationFallback === 'true';
      cacheSource = 'stored';
    } else if (!this.handoutTranslate.isConfigured()) {
      fields = {
        ...englishHandoutFieldsFromPayload(summary, 'en'),
        translationValidationStatus: this.handoutTranslate.isEnabled()
          ? 'failed_fallback_en'
          : 'disabled',
        translationRequiresReview: 'true',
        translationFallback: 'true',
        translationMessage: 'Translation requires pharmacist review',
        requestedHandoutLanguage: lang,
      };
      validationStatus = fields.translationValidationStatus;
      fallback = true;
    } else {
      const cached = await this.readHandoutTranslationCache(sourceHash, lang);
      if (cached) {
        fields = cached.fields;
        validationStatus = cached.validationStatus;
        fallback = cached.fallback;
        cacheSource = 'redis';
      } else {
        try {
          const result = await translateCanonicalHandout(
            canonical,
            lang,
            (texts, googleLang) =>
              this.handoutTranslate.translateTexts(texts, googleLang),
          );
          retried = result.retried;
          fields = fieldsFromTranslatedHandout(result.payload, summary, {
            sourceHash,
            provider: 'google-cloud-translation',
            model: this.handoutTranslate.modelId(),
            validation: result.validation,
          });
          const glossaryVersion = this.handoutTranslate.glossaryVersion();
          if (glossaryVersion) {
            fields.translationGlossaryVersion = glossaryVersion;
          }
          validationStatus = result.validation.status;
          fallback = result.validation.status !== 'ok';
          cacheSource = 'google';
          await this.writeHandoutTranslationCache(sourceHash, lang, {
            fields,
            validationStatus,
            fallback,
          });
        } catch (err) {
          this.logger.warn(
            `Handout translation failed for consultation ${id} ${translateErrorSummary(err)}`,
          );
          fields = {
            ...englishHandoutFieldsFromPayload(summary, 'en'),
            translationProvider: 'google-cloud-translation',
            translationModel: this.handoutTranslate.modelId(),
            translationValidationStatus: 'failed_fallback_en',
            translationRequiresReview: 'true',
            translationFallback: 'true',
            translationMessage: 'Translation requires pharmacist review',
            requestedHandoutLanguage: lang,
          };
          validationStatus = 'failed_fallback_en';
          fallback = true;
        }
      }
    }

    if (cacheSource !== 'stored') {
      const documentation = {
        ...(typeof consultation.documentation === 'object' && consultation.documentation
          ? (consultation.documentation as Record<string, unknown>)
          : {}),
      };
      const documents = {
        ...((documentation.documents as Record<string, unknown> | undefined) ?? {}),
        patient_care_summary: {
          ...previous,
          ...fields,
          documentHtml: '',
        },
      };
      documentation.documents = documents;

      await this.prisma.consultation.update({
        where: { id },
        data: { documentation: documentation as any },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'HANDOUT_TRANSLATE',
      module: 'CONSULTATIONS',
      previousValue: {
        consultationId: id,
        language: previous.handoutLanguage ?? 'en',
        sourceHash: previous.handoutSourceHash ?? null,
      },
      newValue: {
        consultationId: id,
        language: fields.handoutLanguage,
        requestedLanguage: lang,
        sourceHash,
        provider: fields.translationProvider || null,
        model: fields.translationModel || null,
        glossaryVersion: fields.translationGlossaryVersion || null,
        validationStatus,
        fallback,
        retried,
        cache: cacheSource,
      },
      ...(req ? this.getClientInfo(req) : {}),
    });

    return {
      fields,
      translation: {
        language: fields.handoutLanguage,
        requestedLanguage: lang,
        sourceHash,
        validationStatus,
        requiresReview: fields.translationRequiresReview !== 'false',
        fallback,
        stale: fields.translationStale === 'true',
        message: fields.translationMessage || null,
        provider: fields.translationProvider || null,
        model: fields.translationModel || null,
      },
    };
  }

  private handoutTranslationCacheTtlSeconds(ok: boolean): number {
    const raw = Number(process.env.TRANSLATION_CACHE_TTL_SECONDS || 604800);
    const okTtl = Number.isFinite(raw) && raw > 0 ? raw : 604800;
    return ok ? okTtl : 120;
  }

  private async readHandoutTranslationCache(
    sourceHash: string,
    language: string,
  ): Promise<{
    fields: Record<string, string>;
    validationStatus: string;
    fallback: boolean;
  } | null> {
    try {
      const raw = await this.redis.get(
        handoutTranslationCacheKey(
          sourceHash,
          language,
          this.handoutTranslate.modelId(),
        ),
      );
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        v?: number;
        fields?: Record<string, string>;
        validationStatus?: string;
        fallback?: boolean;
      };
      if (parsed.v !== 1 || !parsed.fields) return null;
      if (parsed.fallback === true || parsed.validationStatus !== 'ok') {
        return null;
      }
      return {
        fields: parsed.fields,
        validationStatus: parsed.validationStatus || 'ok',
        fallback: false,
      };
    } catch {
      this.logger.warn('Handout translation cache read skipped');
      return null;
    }
  }

  private async writeHandoutTranslationCache(
    sourceHash: string,
    language: string,
    payload: {
      fields: Record<string, string>;
      validationStatus: string;
      fallback: boolean;
    },
  ): Promise<void> {
    try {
      const ok = payload.validationStatus === 'ok' && !payload.fallback;
      if (!ok) return;
      await this.redis.set(
        handoutTranslationCacheKey(
          sourceHash,
          language,
          this.handoutTranslate.modelId(),
        ),
        JSON.stringify({
          v: 1,
          fields: cacheableHandoutTranslationFields(payload.fields),
          validationStatus: payload.validationStatus,
          fallback: payload.fallback,
        }),
        this.handoutTranslationCacheTtlSeconds(ok),
      );
    } catch {
      this.logger.warn('Handout translation cache write skipped');
    }
  }

  // ── Attachments (optional clinical photos, max 5) ─────────────────────────

  private static readonly MAX_ATTACHMENTS = 5;
  private static readonly ATTACHMENT_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ]);

  async uploadAttachments(id: string, user: RequestUser, files: Express.Multer.File[]) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }

    if (!files?.length) {
      throw new BadRequestException('Please select at least one image');
    }

    const existing = this.readAttachments(consultation.attachments);

    if (existing.length + files.length > ConsultationsService.MAX_ATTACHMENTS) {
      throw new BadRequestException(
        `You can attach up to ${ConsultationsService.MAX_ATTACHMENTS} photos. Currently ${existing.length} attached.`,
      );
    }

    const tenantSegment = consultation.tenantId || 'platform';
    const added: AttachmentMeta[] = [];

    for (const file of files) {
      if (!file.buffer?.length) {
        throw new BadRequestException(`File "${file.originalname}" appears to be empty`);
      }
      const mime = (file.mimetype || '').toLowerCase();
      if (!ConsultationsService.ATTACHMENT_MIME.has(mime)) {
        throw new BadRequestException(
          `"${file.originalname}" is not a supported image. Use JPG, PNG, or WebP.`,
        );
      }

      const attachmentId = randomUUID();
      const ext =
        extname(file.originalname).toLowerCase() ||
        (mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg');
      const objectKey = `consultations/${tenantSegment}/${id}/${attachmentId}${ext}`;

      const stored = await this.objectStorage.upload({
        buffer: file.buffer,
        contentType: mime,
        objectKey,
      });

      added.push({
        id: attachmentId,
        fileName: file.originalname,
        fileUrl: `/consultations/${id}/attachments/${attachmentId}/file`,
        mimeType: mime,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
        storageKey: stored.storageKey,
        storageProvider: stored.provider,
      });
    }

    const attachments = [...existing, ...added];
    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { attachments },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CREATE',
      module: 'CONSULTATION_ATTACHMENTS',
      newValue: {
        consultationId: id,
        count: added.length,
        provider: this.objectStorage.activeProvider,
        ids: added.map((a) => a.id),
      },
    });

    return { attachments: this.readAttachments(updated.attachments), added };
  }

  async deleteAttachment(id: string, attachmentId: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }

    const existing = this.readAttachments(consultation.attachments);
    const target = existing.find((a) => a.id === attachmentId);
    if (!target) throw new NotFoundException('Attachment not found');

    const next = existing.filter((a) => a.id !== attachmentId);
    const storageKey =
      target.storageKey ||
      target.fileUrl.replace(/^\/uploads\//, '').replace(/^\/?uploads\//, '');

    if (storageKey && !storageKey.includes('/attachments/')) {
      await this.objectStorage.delete(storageKey, target.storageProvider);
    }

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: { attachments: next },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DELETE',
      module: 'CONSULTATION_ATTACHMENTS',
      previousValue: { consultationId: id, attachmentId, fileName: target.fileName },
    });

    return { attachments: this.readAttachments(updated.attachments) };
  }

  /**
   * Stream a clinical photo through the authenticated API (GCS or local disk).
   * Supports legacy `/uploads/...` attachments that predate storageKey metadata.
   */
  async streamAttachment(
    id: string,
    attachmentId: string,
    user: RequestUser,
    res: Response,
  ): Promise<void> {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const target = this.readAttachments(consultation.attachments).find((a) => a.id === attachmentId);
    if (!target) throw new NotFoundException('Attachment not found');

    const storageKey =
      target.storageKey ||
      (target.fileUrl.startsWith('/uploads/')
        ? target.fileUrl.replace(/^\/uploads\//, '')
        : '');

    if (!storageKey) {
      throw new NotFoundException('Attachment file is missing storage metadata');
    }

    try {
      const { stream, contentType, contentLength } = await this.objectStorage.open(
        storageKey,
        target.mimeType,
        target.storageProvider,
      );
      res.setHeader('Content-Type', contentType || target.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(target.fileName)}"`);
      if (contentLength != null) res.setHeader('Content-Length', String(contentLength));
      stream.on('error', (err) => {
        this.logger.error(`Stream error for attachment ${attachmentId}: ${err.message}`);
        if (!res.headersSent) res.status(404).end();
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      this.logger.warn(`Could not open attachment ${attachmentId}: ${(err as Error).message}`);
      throw new NotFoundException('Attachment file not found');
    }
  }

  private readAttachments(raw: unknown): AttachmentMeta[] {
    if (!Array.isArray(raw)) return [];
    return raw as AttachmentMeta[];
  }

  // ── Referral Outcome ─────────────────────────────────────────────────────

  private letterApiPayload(outcome: {
    id: string;
    sourceRevision: number;
    sourceFingerprint: string | null;
    letterStatus: ReferralLetterRecordStatus | string;
    letterApprovedAt: Date | null;
    letterApprovedById: string | null;
    letterApprovedSourceRevision: number | null;
    referralLetterDraft: string | null;
  }) {
    return {
      referralOutcomeId: outcome.id,
      sourceRevision: outcome.sourceRevision,
      sourceFingerprint: outcome.sourceFingerprint,
      letterStatus: mapDbLetterStatusToApi(String(outcome.letterStatus)),
      letterApprovedAt: outcome.letterApprovedAt?.toISOString() ?? null,
      letterApprovedById: outcome.letterApprovedById,
      letterApprovedSourceRevision: outcome.letterApprovedSourceRevision,
      letterDraft: outcome.referralLetterDraft,
      referralSent: false,
    };
  }

  private throwReferralConflict(code: string, message: string) {
    throw new ConflictException({ code, message });
  }

  async draftReferralReason(
    id: string,
    dto: DraftReferralReasonDto,
    user: RequestUser,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        referralOutcome: true,
        pathway: {
          select: { id: true, name: true, condition: true, version: true, redFlags: true },
        },
        clinicalJudgmentAssessment: {
          select: {
            assessmentSummary: true,
            workingDiagnosisText: true,
            diagnosticCertainty: true,
          },
        },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'This consultation is already completed',
      );
    }

    const requestId = String(dto.requestId ?? '').trim() || randomUUID();
    const redFlagsPayload =
      dto.redFlagsData && typeof dto.redFlagsData === 'object'
        ? dto.redFlagsData
        : ((consultation.redFlags ?? null) as Record<string, unknown> | null);

    const snapshot = buildServerTriggerSnapshot(
      redFlagsPayload,
      consultation.pathway?.redFlags,
    );
    const triggers = [...snapshot.triggers].sort(
      (a, b) => urgencyRank(b.urgencyCode) - urgencyRank(a.urgencyCode),
    );

    const entities =
      consultation.aiEntities && typeof consultation.aiEntities === 'object'
        ? (consultation.aiEntities as Record<string, unknown>)
        : {};
    const demographics =
      consultation.demographics && typeof consultation.demographics === 'object'
        ? (consultation.demographics as Record<string, unknown>)
        : {};

    const pkg = buildReferralReasonDraftPackage({
      consultationId: id,
      sourceRevision:
        dto.sourceRevision ?? consultation.referralOutcome?.sourceRevision ?? 1,
      requestId,
      pathwayId: consultation.selectedPathwayId,
      pathwayName: consultation.pathway?.name,
      pathwayCondition: consultation.pathway?.condition,
      pathwayVersion: consultation.pathway?.version,
      presentingConcern: consultation.chiefComplaint,
      destination: dto.destination,
      destinationOtherText: dto.destinationOtherText,
      urgencyCode: snapshot.urgencyCode,
      urgencyDisplay: snapshot.urgencyDisplay,
      triggers,
      redFlags: redFlagsPayload,
      demographics,
      reviewedNarrative:
        consultation.clinicalJudgmentAssessment?.assessmentSummary ??
        consultation.clinicalJudgmentAssessment?.workingDiagnosisText ??
        null,
      confirmedFacts: collectConfirmedFacts({
        conditions: entities.conditions,
        allergies: entities.allergies,
        medications: entities.medications,
        demographics,
        symptoms: entities.symptoms,
        questionResponses: consultation.questionResponses,
        treatmentsTried: entities.treatmentsTried ?? entities.treatmentTried,
      }),
    });

    const extra = {
      consultationId: id,
      referralId: consultation.referralOutcome?.id ?? null,
      requestId,
    };

    if (!pkg.selectedReferralReasons.length) {
      return fallbackReferralReasonDraft(pkg, extra);
    }

    try {
      const livePrompt = await this.aiConfig.getLivePrompt(
        AI_PROMPT_KEYS.DOCUMENTATION_REFERRAL_REASON,
        REFERRAL_REASON_DRAFT_PROMPT,
      );
      const systemPrompt =
        /approvedLeadSentence|insufficientContext/.test(livePrompt)
          ? livePrompt
          : REFERRAL_REASON_DRAFT_PROMPT;
      const llmPayload = toReferralReasonLlmPayload(pkg);

      const requestDraft = async () =>
        this.aiEngine.postJson<Record<string, unknown>>(
          '/api/v1/consultations/generate-referral-reason',
          {
            draft_payload: llmPayload,
            system_prompt: systemPrompt,
          },
          15_000,
        );

      let result = await requestDraft();
      let resolved = resolveReferralReasonFromAi(result, pkg);
      if (!resolved.ok) {
        this.logger.warn(
          `Referral reason AI draft failed quality check (${resolved.code}); retrying once`,
        );
        result = await requestDraft();
        resolved = resolveReferralReasonFromAi(result, pkg);
      }
      if (resolved.ok) {
        return {
          draftReason: resolved.draftReason,
          origin: 'AI_DRAFT' as const,
          needsManualReason: false,
          approvedRequestSentence: pkg.approvedRequestSentence,
          usedReferralReasonIds: resolved.usedReferralReasonIds,
          usedFactIds: resolved.usedFactIds,
          sourceRevision: pkg.sourceRevision,
          requestId,
          promptVersion: pkg.promptVersion,
          consultationId: id,
          referralId: extra.referralId,
          insufficientContext: resolved.insufficientContext,
        };
      }
      this.logger.warn(
        `Referral reason AI draft failed quality check (${resolved.code}); using template`,
      );
    } catch (err) {
      this.logger.warn(
        `Referral reason AI draft unavailable; using template. ${
          err instanceof Error ? err.message : err
        }`,
      );
    }

    return fallbackReferralReasonDraft(pkg, extra);
  }

  async saveReferralOutcome(
    id: string,
    dto: SaveReferralOutcomeDto,
    user: RequestUser,
    req: Request,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        referralOutcome: true,
        pathway: { select: { id: true, name: true, condition: true, version: true, redFlags: true } },
        pharmacist: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    // Idempotent replay of a prior successful completion
    if (
      consultation.referralOutcome?.status === ReferralOutcomeRecordStatus.COMPLETED &&
      consultation.referralOutcome.clientRequestId === dto.clientRequestId
    ) {
      return {
        consultationId: id,
        status: 'completed' as const,
        consultationOutcome: 'referred' as const,
        displayOutcome: consultation.referralOutcome.derivedOutcomeCode ?? 'Referral advice provided',
        completedAt: consultation.referralOutcome.completedAt?.toISOString() ?? null,
        documentationText: consultation.referralOutcome.documentationText,
        referralOutcome: consultation.referralOutcome,
        ...this.letterApiPayload(consultation.referralOutcome),
      };
    }

    if (consultation.status === ConsultationStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'This consultation is already completed and cannot accept a new referral outcome',
      );
    }

    if (consultation.referralOutcome?.status === ReferralOutcomeRecordStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'A completed referral outcome already exists for this consultation',
      );
    }

    if (!consultation.selectedPathwayId || consultation.selectedPathwayId !== dto.pathwayId) {
      throw new BadRequestException('Pathway does not match the active consultation pathway');
    }

    const pathwayVersion = consultation.pathway?.version ?? dto.pathwayVersion;
    if (dto.pathwayVersion !== pathwayVersion) {
      throw new BadRequestException(
        'Pathway version is stale. Refresh the consultation and try again.',
      );
    }

    // Persist latest red-flag answers before validating triggers
    let redFlagsPayload = (consultation.redFlags ?? null) as Record<string, unknown> | null;
    if (dto.redFlagsData && typeof dto.redFlagsData === 'object') {
      redFlagsPayload = {
        ...dto.redFlagsData,
        referralSelected: true,
        source: 'pathway',
      };
    }

    const { triggers, urgencyCode, urgencyDisplay } = buildServerTriggerSnapshot(
      redFlagsPayload,
      consultation.pathway?.redFlags,
    );

    try {
      assertReferralTriggersActive(triggers);
    } catch {
      throw new BadRequestException(
        'No active referral triggers found. Complete Safety screening referral selections first.',
      );
    }

    const normalized = validateAndNormalizeReferralFields({
      destination: dto.destination,
      destinationOtherText: dto.destinationOtherText,
      reasonForReferral: dto.reasonForReferral,
      actionTaken: dto.actionTaken,
      patientResponse: dto.patientResponse,
      additionalNote: dto.additionalNote,
      handoff: dto.handoff,
    });

    if (!normalized.ok) {
      throw new BadRequestException({
        message: 'Referral outcome validation failed',
        errors: normalized.errors,
      });
    }

    const fingerprint = fingerprintFromOutcomeFields({
      pathwayId: dto.pathwayId,
      pathwayVersion,
      urgencyCode,
      triggers,
      destination: normalized.destination,
      destinationOtherText: normalized.destinationOtherText,
      reasonForReferral: normalized.reasonForReferral,
      actionTaken: normalized.actionTaken,
      patientResponse: normalized.patientResponse,
      additionalNote: normalized.additionalNote,
      providerFacility: normalized.handoff?.providerFacility,
      contactMethod: normalized.handoff?.contactMethod,
      contactMethodOtherText: normalized.handoff?.contactMethodOtherText,
      confirmationReceived: normalized.handoff?.confirmationReceived,
      handoffAt: normalized.handoff?.handoffAt,
      presentingConcern: consultation.chiefComplaint,
    });

    const existing = consultation.referralOutcome;
    let sourceRevision = existing?.sourceRevision ?? 1;
    let letterStatus =
      (existing?.letterStatus as ReferralLetterRecordStatus | undefined) ??
      ReferralLetterRecordStatus.NOT_CREATED;
    let letterApprovedAt = existing?.letterApprovedAt ?? null;
    let letterApprovedById = existing?.letterApprovedById ?? null;
    let letterApprovedSourceRevision = existing?.letterApprovedSourceRevision ?? null;

    if (!existing) {
      sourceRevision = 1;
    } else if (existing.sourceFingerprint && existing.sourceFingerprint !== fingerprint) {
      sourceRevision = existing.sourceRevision + 1;
      if (
        letterStatus === ReferralLetterRecordStatus.APPROVED ||
        letterStatus === ReferralLetterRecordStatus.DRAFT
      ) {
        letterStatus = ReferralLetterRecordStatus.STALE;
        if (letterStatus === ReferralLetterRecordStatus.STALE) {
          // keep prior approval audit fields for history; UI treats as stale
        }
      }
    } else if (!existing.sourceFingerprint) {
      sourceRevision = existing.sourceRevision || 1;
    }

    // If fingerprint changed after approval, clear "current approved" match
    if (
      existing?.sourceFingerprint &&
      existing.sourceFingerprint !== fingerprint &&
      (existing.letterStatus === ReferralLetterRecordStatus.APPROVED ||
        existing.letterStatus === ReferralLetterRecordStatus.DRAFT ||
        existing.letterStatus === ReferralLetterRecordStatus.STALE)
    ) {
      letterStatus = ReferralLetterRecordStatus.STALE;
    }

    const now = new Date();
    const complete = Boolean(dto.completeConsultation);
    const nextContactMethod = dto.handlingMethod
      ? handlingMethodToStorage(dto.handlingMethod)
      : existing?.contactMethod ?? normalized.handoff?.contactMethod ?? null;
    const nextContactDetail =
      dto.handlingDetail !== undefined
        ? String(dto.handlingDetail ?? '').trim() || null
        : existing?.contactMethodOtherText ?? normalized.handoff?.contactMethodOtherText ?? null;

    if (complete) {
      try {
        assertReferralLetterGate({
          actionTaken: normalized.actionTaken,
          letterStatus,
          sourceRevision,
          letterApprovedSourceRevision,
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'LETTER_NOT_APPROVED';
        if (code === 'LETTER_STALE') {
          this.throwReferralConflict(
            'LETTER_STALE',
            'Referral details changed — update the letter before completing.',
          );
        }
        if (code === 'REFERRAL_SEND_NOT_CONFIRMED') {
          this.throwReferralConflict(
            'REFERRAL_SEND_NOT_CONFIRMED',
            'Confirm the referral was sent (or record confirmation received) before completing.',
          );
        }
        this.throwReferralConflict(
          'LETTER_NOT_APPROVED',
          'Create and approve the referral letter before completing.',
        );
      }
      const handling = handlingMethodFromStorage(nextContactMethod, {
        faxConfirmed: existing?.letterExternalSendConfirmed,
      });
      if (!handlingRecordIsComplete(handling, nextContactDetail)) {
        this.throwReferralConflict(
          'HANDLING_METHOD_MISSING',
          'Record how the referral was handled.',
        );
      }
    }

    const docs = buildDocumentationFromOutcome({
      urgencyDisplay,
      triggers,
      destination: normalized.destination,
      destinationOtherText: normalized.destinationOtherText,
      reasonForReferral: normalized.reasonForReferral,
      actionTaken: normalized.actionTaken,
      patientResponse: normalized.patientResponse,
      additionalNote: normalized.additionalNote,
      letterApproved:
        letterStatus === ReferralLetterRecordStatus.APPROVED ||
        letterStatus === ReferralLetterRecordStatus.FINALIZED ||
        (complete &&
          letterApprovedSourceRevision != null &&
          letterApprovedSourceRevision === sourceRevision),
      handoff: normalized.handoff,
    });

    const outcomeData = {
      pathwayId: dto.pathwayId,
      pathwayVersion,
      urgencyCode,
      urgencyDisplaySnapshot: urgencyDisplay,
      triggerSnapshot: triggers as any,
      destination: normalized.destination,
      destinationOtherText: normalized.destinationOtherText,
      reasonForReferral: normalized.reasonForReferral,
      actionTaken: normalized.actionTaken,
      patientResponse: normalized.patientResponse,
      additionalNote: normalized.additionalNote,
      providerId: normalized.handoff?.providerId ?? null,
      providerFacilitySnapshot: normalized.handoff?.providerFacility ?? null,
      contactMethod: nextContactMethod,
      contactMethodOtherText: nextContactDetail,
      confirmationReceived: normalized.handoff?.confirmationReceived ?? null,
      handoffAt: normalized.handoff?.handoffAt ?? null,
      status: complete
        ? ReferralOutcomeRecordStatus.COMPLETED
        : ReferralOutcomeRecordStatus.DRAFT,
      derivedOutcomeCode: docs.derivedCode,
      documentationText: docs.documentationText,
      sourceRevision,
      sourceFingerprint: fingerprint,
      letterStatus: complete ? ReferralLetterRecordStatus.FINALIZED : letterStatus,
      letterApprovedAt,
      letterApprovedById,
      letterApprovedSourceRevision,
      clientRequestId: dto.clientRequestId,
      completedById: complete ? user.id : null,
      completedAt: complete ? now : null,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      if (redFlagsPayload) {
        await tx.consultation.update({
          where: { id },
          data: { redFlags: redFlagsPayload as any },
        });
      }

      const referralOutcome = consultation.referralOutcome
        ? await tx.consultationReferralOutcome.update({
            where: { id: consultation.referralOutcome.id },
            data: outcomeData,
          })
        : await tx.consultationReferralOutcome.create({
            data: {
              consultationId: id,
              ...outcomeData,
            },
          });

      if (
        existing?.sourceFingerprint &&
        existing.sourceFingerprint !== fingerprint &&
        existing.letterStatus === ReferralLetterRecordStatus.APPROVED
      ) {
        await tx.consultationAuditLog.create({
          data: {
            consultationId: id,
            userId: user.id,
            action: 'REFERRAL_LETTER_MARKED_STALE',
            step: 'RED_FLAGS',
            metadata: {
              referralOutcomeId: referralOutcome.id,
              previousRevision: existing.sourceRevision,
              sourceRevision,
            },
          },
        });
      }

      if (complete) {
        await tx.consultation.update({
          where: { id },
          data: {
            status: ConsultationStatus.COMPLETED,
            submittedAt: now,
            lockedAt: now,
            currentStep: 'RED_FLAGS',
            stepIndex: Math.max(consultation.stepIndex, 4),
            redFlags: {
              ...(redFlagsPayload ?? {}),
              referralSelected: true,
              referralCompleted: true,
              referralOutcomeId: referralOutcome.id,
            } as any,
          },
        });

        await tx.consultationAuditLog.create({
          data: {
            consultationId: id,
            userId: user.id,
            action: 'REFERRAL_OUTCOME_COMPLETED',
            step: 'RED_FLAGS',
            metadata: {
              referralOutcomeId: referralOutcome.id,
              derivedOutcomeCode: docs.derivedCode,
              urgencyCode,
              destination: normalized.destination,
              actionTaken: normalized.actionTaken,
              patientResponse: normalized.patientResponse,
              triggerCount: triggers.length,
              clientRequestId: dto.clientRequestId,
              sourceRevision,
              letterStatus: ReferralLetterRecordStatus.FINALIZED,
            },
          },
        });
      } else {
        await tx.consultationAuditLog.create({
          data: {
            consultationId: id,
            userId: user.id,
            action: 'REFERRAL_OUTCOME_DRAFT_SAVED',
            step: 'RED_FLAGS',
            metadata: {
              referralOutcomeId: referralOutcome.id,
              clientRequestId: dto.clientRequestId,
              sourceRevision,
              letterStatus,
            },
          },
        });
      }

      return referralOutcome;
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: complete ? 'REFERRAL_COMPLETE' : 'REFERRAL_DRAFT',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: id,
        referralOutcomeId: result.id,
        derivedOutcomeCode: docs.derivedCode,
        complete,
        sourceRevision,
        letterStatus: result.letterStatus,
      },
      ...this.getClientInfo(req),
    });

    return {
      consultationId: id,
      status: complete ? ('completed' as const) : ('draft' as const),
      consultationOutcome: complete ? ('referred' as const) : ('in_progress' as const),
      displayOutcome: docs.displayOutcome,
      completedAt: complete ? now.toISOString() : null,
      documentationText: docs.documentationText,
      referralOutcome: result,
      ...this.letterApiPayload(result),
    };
  }

  async createReferralLetter(
    id: string,
    dto: CreateReferralLetterDto,
    user: RequestUser,
    req: Request,
  ) {
    // Optionally persist a draft first so letter uses latest selections
    if (dto.outcomeDraft) {
      await this.saveReferralOutcome(
        id,
        { ...dto.outcomeDraft, completeConsultation: false },
        user,
        req,
      );
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        referralOutcome: { include: { letterVersions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
        pathway: { select: { id: true, name: true, condition: true, version: true, redFlags: true } },
        pharmacist: { select: { id: true, firstName: true, lastName: true } },
        tenant: {
          select: {
            name: true,
            faxNumber: true,
            phone: true,
            address: true,
            timezone: true,
            pharmacyLicenseNumber: true,
          },
        },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'This consultation is already completed',
      );
    }

    const outcome = consultation.referralOutcome;
    if (!outcome || !String(outcome.reasonForReferral ?? '').trim()) {
      throw new BadRequestException(
        'Save referral destination and reason before creating a letter',
      );
    }

    if (
      dto.expectedSourceRevision != null &&
      dto.expectedSourceRevision !== outcome.sourceRevision
    ) {
      this.throwReferralConflict(
        'REFERRAL_SOURCE_CHANGED',
        'Referral details changed. Refresh and create the letter again.',
      );
    }

    // Idempotent replay
    if (
      dto.clientRequestId &&
      outcome.letterClientRequestId === dto.clientRequestId &&
      outcome.referralLetterDraft &&
      (outcome.letterStatus === ReferralLetterRecordStatus.DRAFT ||
        outcome.letterStatus === ReferralLetterRecordStatus.APPROVED ||
        outcome.letterStatus === ReferralLetterRecordStatus.STALE)
    ) {
      return {
        ...this.letterApiPayload(outcome),
        consultationCompleted: false,
        versionNumber: outcome.letterVersions?.[0]?.versionNumber ?? null,
      };
    }

    const demographics = (consultation.demographics ?? {}) as Record<string, unknown>;
    const patientName = [demographics.firstName, demographics.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() || String(demographics.fullName ?? demographics.patientName ?? '').trim();
    const patientHealthNumber = String(
      demographics.phn ?? demographics.healthNumber ?? demographics.personalHealthNumber ?? '',
    ).trim();

    const triggers = Array.isArray(outcome.triggerSnapshot)
      ? (outcome.triggerSnapshot as unknown as ReturnType<
          typeof buildServerTriggerSnapshot
        >['triggers'])
      : buildServerTriggerSnapshot(consultation.redFlags, consultation.pathway?.redFlags).triggers;

    const entities =
      consultation.aiEntities && typeof consultation.aiEntities === 'object'
        ? (consultation.aiEntities as Record<string, unknown>)
        : {};

    const letterPayload = buildReferralLetterPayload({
      patientName: patientName || undefined,
      patientAge: demographics.age != null ? String(demographics.age) : undefined,
      patientSex: demographics.sex != null ? String(demographics.sex) : undefined,
      patientDob:
        String(demographics.dateOfBirth ?? demographics.dob ?? '').trim() || undefined,
      consultationRef: consultation.consultationRef ?? id,
      pathwayName: consultation.pathway?.name ?? 'Clinical pathway',
      pathwayCondition: consultation.pathway?.condition ?? '',
      urgencyDisplay: outcome.urgencyDisplaySnapshot,
      urgencyCode: outcome.urgencyCode as 'IMMEDIATE_REFERRAL' | 'SAME_DAY_REFERRAL' | 'FOLLOW_UP_REFERRAL',
      triggers,
      destination: outcome.destination as any,
      destinationOtherText: outcome.destinationOtherText,
      reasonForReferral: outcome.reasonForReferral,
      actionTaken: outcome.actionTaken as any,
      patientResponse: outcome.patientResponse as any,
      additionalNote: outcome.additionalNote,
      chiefComplaint: consultation.chiefComplaint,
      pharmacistName: [consultation.pharmacist.firstName, consultation.pharmacist.lastName]
        .filter(Boolean)
        .join(' '),
      pharmacyName: consultation.tenant?.name,
      pharmacyAddress: consultation.tenant?.address,
      pharmacyFax: consultation.tenant?.faxNumber,
      pharmacyPhone: consultation.tenant?.phone,
      pharmacyLicense: consultation.tenant?.pharmacyLicenseNumber,
      patientHealthNumber: patientHealthNumber || undefined,
      patientHealthNumberNotAvailable:
        demographics.phnNotAvailable === true ||
        demographics.healthNumberNotAvailable === true,
      timeZone: consultation.tenant?.timezone,
      confirmedFacts: collectConfirmedFacts({
        conditions: entities.conditions,
        allergies: entities.allergies,
        medications: entities.medications,
        demographics,
        symptoms: entities.symptoms,
        questionResponses: consultation.questionResponses,
        treatmentsTried: entities.treatmentsTried ?? entities.treatmentTried,
      }).map((f) => ({
        id: f.id,
        renderedText: f.renderedText,
        category: f.category,
        assertion: f.assertion,
      })),
    });
    const letter = await this.draftReferralLetter(letterPayload);

    const nextVersion =
      ((outcome.letterVersions?.[0]?.versionNumber as number | undefined) ?? 0) + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.consultationReferralOutcome.update({
        where: { id: outcome.id },
        data: {
          referralLetterDraft: letter,
          letterStatus: ReferralLetterRecordStatus.DRAFT,
          letterClientRequestId: dto.clientRequestId ?? outcome.letterClientRequestId,
          // Creating a new draft after approval invalidates prior approval for this revision
          letterApprovedAt: null,
          letterApprovedById: null,
          letterApprovedSourceRevision: null,
        },
      });

      await tx.consultationReferralLetterVersion.create({
        data: {
          letterOutcomeId: outcome.id,
          versionNumber: nextVersion,
          sourceRevision: outcome.sourceRevision,
          status: 'draft',
          content: letter,
          renderedText: referralLetterRenderedText(letter),
          contentHash: hashLetterContent(letter),
          factsSnapshot: {
            destination: outcome.destination,
            reasonForReferral: outcome.reasonForReferral,
            actionTaken: outcome.actionTaken,
            patientResponse: outcome.patientResponse,
            urgencyCode: outcome.urgencyCode,
            triggers,
          } as any,
          clientRequestId: dto.clientRequestId ?? null,
          createdById: user.id,
        },
      });

      await tx.consultationAuditLog.create({
        data: {
          consultationId: id,
          userId: user.id,
          action: 'REFERRAL_LETTER_GENERATED',
          step: 'RED_FLAGS',
          metadata: {
            referralOutcomeId: outcome.id,
            sourceRevision: outcome.sourceRevision,
            versionNumber: nextVersion,
            clientRequestId: dto.clientRequestId ?? null,
          },
        },
      });

      return row;
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'REFERRAL_LETTER_DRAFT',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: id,
        referralOutcomeId: outcome.id,
        sourceRevision: outcome.sourceRevision,
        versionNumber: nextVersion,
      },
      ...this.getClientInfo(req),
    });

    return {
      ...this.letterApiPayload(updated),
      consultationCompleted: false,
      versionNumber: nextVersion,
    };
  }

  async updateReferralLetterDraft(
    id: string,
    dto: UpdateReferralLetterDraftDto,
    user: RequestUser,
    req: Request,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { referralOutcome: true },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    const outcome = consultation.referralOutcome;
    if (!outcome) {
      throw new BadRequestException(
        'Create a referral letter draft before saving edits',
      );
    }

    if (outcome.status === ReferralOutcomeRecordStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'This consultation is already completed',
      );
    }

    const letterDraft = String(dto.letterDraft ?? '').trim();
    if (!letterDraft) {
      throw new BadRequestException('Letter draft cannot be empty');
    }

    // Edits after approval require re-approval
    const nextStatus =
      outcome.letterStatus === ReferralLetterRecordStatus.APPROVED ||
      outcome.letterStatus === ReferralLetterRecordStatus.STALE
        ? ReferralLetterRecordStatus.DRAFT
        : outcome.letterStatus === ReferralLetterRecordStatus.NOT_CREATED
          ? ReferralLetterRecordStatus.DRAFT
          : outcome.letterStatus;

    const revertingApproval = nextStatus === ReferralLetterRecordStatus.DRAFT;
    const updated = await this.prisma.consultationReferralOutcome.update({
      where: { id: outcome.id },
      data: {
        referralLetterDraft: letterDraft,
        letterStatus: nextStatus,
        letterApprovedAt: revertingApproval ? null : outcome.letterApprovedAt,
        letterApprovedById: revertingApproval ? null : outcome.letterApprovedById,
        letterApprovedSourceRevision: revertingApproval
          ? null
          : outcome.letterApprovedSourceRevision,
        // New working version is not recorded as delivered. Historical fax
        // confirmation stays on letterExternalSendConfirmed.
        contactMethod: revertingApproval ? null : outcome.contactMethod,
        contactMethodOtherText: revertingApproval ? null : outcome.contactMethodOtherText,
      },
    });

    await this.prisma.consultationAuditLog.create({
      data: {
        consultationId: id,
        userId: user.id,
        action: 'REFERRAL_LETTER_EDITED',
        step: 'RED_FLAGS',
        metadata: {
          referralOutcomeId: outcome.id,
          length: letterDraft.length,
          sourceRevision: outcome.sourceRevision,
        },
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'REFERRAL_LETTER_DRAFT_UPDATE',
      module: 'CONSULTATIONS',
      newValue: { consultationId: id, referralOutcomeId: outcome.id },
      ...this.getClientInfo(req),
    });

    return {
      ...this.letterApiPayload(updated),
      consultationCompleted: false,
    };
  }

  async approveReferralLetter(
    id: string,
    dto: ApproveReferralLetterDto,
    user: RequestUser,
    req: Request,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: {
        referralOutcome: {
          include: { letterVersions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
        },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    if (consultation.status === ConsultationStatus.COMPLETED) {
      this.throwReferralConflict(
        'CONSULTATION_ALREADY_COMPLETED',
        'This consultation is already completed',
      );
    }

    const outcome = consultation.referralOutcome;
    if (!outcome?.referralLetterDraft) {
      throw new BadRequestException('Create a referral letter before approving');
    }

    if (
      dto.expectedSourceRevision != null &&
      dto.expectedSourceRevision !== outcome.sourceRevision
    ) {
      this.throwReferralConflict(
        'REFERRAL_SOURCE_CHANGED',
        'Referral details changed — update the letter before approving.',
      );
    }

    // Idempotent approve
    if (
      outcome.letterStatus === ReferralLetterRecordStatus.APPROVED &&
      outcome.letterApprovedSourceRevision === outcome.sourceRevision &&
      outcome.letterClientRequestId === dto.clientRequestId
    ) {
      return {
        ...this.letterApiPayload(outcome),
        consultationCompleted: false,
        versionNumber: outcome.letterVersions?.[0]?.versionNumber ?? null,
      };
    }

    const letterDraft = String(dto.letterDraft ?? outcome.referralLetterDraft).trim();
    if (!letterDraft) {
      throw new BadRequestException('Letter content cannot be empty');
    }
    const document = parseReferralLetterDocument(letterDraft);
    if (document && !patientIdentityComplete(document.patient)) {
      throw new UnprocessableEntityException({
        code: 'PATIENT_IDENTITY_INCOMPLETE',
        message: 'Add required patient details to approve',
      });
    }
    if (document && !senderIdentityComplete(document.pharmacist)) {
      throw new UnprocessableEntityException({
        code: 'SENDER_IDENTITY_INCOMPLETE',
        message: 'Pharmacist or pharmacy details are missing from the verified profile',
      });
    }

    const now = new Date();
    const nextVersion =
      ((outcome.letterVersions?.[0]?.versionNumber as number | undefined) ?? 0) + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.consultationReferralOutcome.update({
        where: { id: outcome.id },
        data: {
          referralLetterDraft: letterDraft,
          letterStatus: ReferralLetterRecordStatus.APPROVED,
          letterApprovedAt: now,
          letterApprovedById: user.id,
          letterApprovedSourceRevision: outcome.sourceRevision,
          letterClientRequestId: dto.clientRequestId,
          letterExternalSendConfirmed:
            dto.externalSendConfirmed === true
              ? true
              : outcome.letterExternalSendConfirmed,
        },
      });

      await tx.consultationReferralLetterVersion.create({
        data: {
          letterOutcomeId: outcome.id,
          versionNumber: nextVersion,
          sourceRevision: outcome.sourceRevision,
          status: 'approved',
          content: letterDraft,
          renderedText: referralLetterRenderedText(letterDraft),
          contentHash: hashLetterContent(letterDraft),
          factsSnapshot: {
            approvedAt: now.toISOString(),
            sourceRevision: outcome.sourceRevision,
          } as any,
          clientRequestId: dto.clientRequestId,
          createdById: user.id,
        },
      });

      await tx.consultationAuditLog.create({
        data: {
          consultationId: id,
          userId: user.id,
          action: 'REFERRAL_LETTER_APPROVED',
          step: 'RED_FLAGS',
          metadata: {
            referralOutcomeId: outcome.id,
            sourceRevision: outcome.sourceRevision,
            versionNumber: nextVersion,
            clientRequestId: dto.clientRequestId,
          },
        },
      });

      return row;
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'REFERRAL_LETTER_APPROVED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: id,
        referralOutcomeId: outcome.id,
        sourceRevision: outcome.sourceRevision,
        versionNumber: nextVersion,
      },
      ...this.getClientInfo(req),
    });

    return {
      ...this.letterApiPayload(updated),
      consultationCompleted: false,
      versionNumber: nextVersion,
    };
  }


  // ── Private Helpers ──────────────────────────────────────────────────────

  /** CJ Treatment gate — readiness Yes + current red-flag clear required. */
  private async assertClinicalJudgmentTreatmentAccess(consultationId: string) {
    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId },
    });
    if (
      !assessment ||
      assessment.readinessStatus !== 'CONFIRMED_READY' ||
      assessment.assessmentSufficient !== true ||
      !assessment.readinessConfirmedAt
    ) {
      throw new ForbiddenException({
        code: 'PRESCRIBING_READINESS_NOT_CONFIRMED',
        message: 'Confirm prescribing readiness before selecting treatment',
        nextRoute: 'prescribing-readiness',
      });
    }

    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { redFlags: true },
    });
    const rf = (consultation?.redFlags ?? null) as {
      referralSelected?: boolean;
      allAcknowledged?: boolean;
      hasRedFlags?: boolean;
    } | null;
    if (rf?.referralSelected) {
      throw new ForbiddenException({
        code: 'BLOCKING_REFERRAL_RULE',
        message: 'Referral selected — treatment is blocked',
        nextRoute: 'referral',
      });
    }
    if (rf && rf.hasRedFlags === true && rf.allAcknowledged !== true) {
      throw new ForbiddenException({
        code: 'RED_FLAG_REVIEW_NOT_CLEAR',
        message: 'Complete red-flag review before treatment',
        nextRoute: 'red-flags',
      });
    }
  }

  private mapClinicalJudgmentRedFlagReview(
    assessment:
      | {
          redFlagCheckId?: string | null;
          redFlagChecks?: Array<{
            id: string;
            status: string;
            finalDecision?: string | null;
            otherUnresolvedConcern?: boolean | null;
            otherConcernDetails?: string | null;
            questions: Array<{
              canonicalLabel: string;
              questionText: string;
              answer: string | null;
              answerNotes?: string | null;
            }>;
            manualConcerns: Array<{
              concernText: string;
              responseStatus: string;
            }>;
          }>;
          [key: string]: unknown;
        }
      | null
      | undefined,
  ) {
    if (!assessment) {
      return {
        clinicalJudgmentAssessment: null,
        clinicalJudgmentRedFlagReview: null,
      };
    }
    const { redFlagChecks, ...rest } = assessment;
    const checks = redFlagChecks ?? [];
    const preferred =
      checks.find((c) => c.id === assessment.redFlagCheckId) ?? checks[0] ?? null;
    return {
      clinicalJudgmentAssessment: rest,
      clinicalJudgmentRedFlagReview: preferred
        ? {
            checkId: preferred.id,
            status: preferred.status,
            finalDecision: preferred.finalDecision ?? null,
            otherUnresolvedConcern: preferred.otherUnresolvedConcern ?? null,
            otherConcernDetails: preferred.otherConcernDetails ?? null,
            questions: preferred.questions.map((q) => ({
              canonicalLabel: q.canonicalLabel,
              question: q.questionText,
              answer: q.answer,
              answerNotes: q.answerNotes ?? null,
            })),
            manualConcerns: preferred.manualConcerns.map((m) => ({
              concernText: m.concernText,
              responseStatus: m.responseStatus,
            })),
          }
        : null,
    };
  }

  private async findOrThrow(id: string) {
    const c = await this.prisma.consultation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Consultation not found');
    return c;
  }

  private activeWorkspaceWhere(user: RequestUser, module: string) {
    const where: Record<string, unknown> = {
      status: { in: [ConsultationStatus.DRAFT, ConsultationStatus.IN_PROGRESS] },
      module,
    };
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isAdmin = user.role === 'PHARMACIST_ADMIN';
    if (isSuperAdmin) {
      return where;
    }
    if (isAdmin) {
      if (user.tenantId) where.tenantId = user.tenantId;
      return where;
    }
    // Pharmacist queue is ownership-based so GET-by-id and the sidebar stay in sync,
    // including legacy rows whose tenantId is null.
    where.pharmacistId = user.id;
    return where;
  }

  private async findReusableBlankWorkspaceId(
    user: RequestUser,
    module: string,
  ): Promise<string | null> {
    const intakeStep =
      module === SAFESCRIBE_MODULES.ADAPT || module === SAFESCRIBE_MODULES.RENEW
        ? 'RENEW_MEDICATIONS'
        : 'PRESENTING_COMPLAINT';
    const rows = await this.prisma.consultation.findMany({
      where: {
        ...this.activeWorkspaceWhere(user, module),
        status: ConsultationStatus.DRAFT,
        currentStep: intakeStep,
        stepIndex: 0,
        selectedPathwayId: null,
        consultationMode: null,
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        status: true,
        currentStep: true,
        stepIndex: true,
        chiefComplaint: true,
        transcript: true,
        selectedPathwayId: true,
        consultationMode: true,
        module: true,
        renewPayload: true,
      },
    });
    for (const row of rows) {
      const reusable = isReusableBlankWorkspace({
        status: row.status,
        currentStep: row.currentStep,
        stepIndex: row.stepIndex,
        chiefComplaint: row.chiefComplaint,
        transcript: row.transcript,
        selectedPathwayId: row.selectedPathwayId,
        consultationMode: row.consultationMode,
        module: row.module,
        renewMedicationCount: parseRenewPayload(row.renewPayload).medicationList.items.length,
      });
      if (reusable) return row.id;
    }
    return null;
  }

  private checkAccess(consultation: { tenantId: string | null; pharmacistId: string }, user: RequestUser) {
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isAdmin = user.role === 'PHARMACIST_ADMIN';
    if (isSuperAdmin) return;
    if (isAdmin && user.tenantId && consultation.tenantId === user.tenantId) return;
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private async consultationAsOfDate(consultation: {
    createdAt: Date;
    tenantId: string | null;
  }): Promise<string> {
    let tz: string | null = null;
    if (consultation.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: consultation.tenantId },
        select: { timezone: true },
      });
      tz = tenant?.timezone ?? null;
    }
    return consultationDateOnly(consultation.createdAt, tz);
  }

  private async loadOptionalDobContext(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    const consultationDate = await this.consultationAsOfDate(consultation);
    return {
      consultation,
      demographics: (consultation.demographics ?? {}) as Record<string, unknown>,
      consultationDate,
      version: patientSnapshotVersion(consultation.updatedAt),
    };
  }

  private assertOptionalDobSnapshotVersion(current: number, expected?: number) {
    if (expected == null) return;
    if (expected !== current) {
      throw new ConflictException({
        code: 'PATIENT_SNAPSHOT_VERSION_CONFLICT',
        message: 'Patient information changed. Refreshing the recorded age…',
        patientSnapshotVersion: current,
      });
    }
  }

  private getStepField(step: string): string | null {
    const map: Record<string, string> = {
      // PRESENTING_COMPLAINT intentionally omitted — intake uses top-level columns
      PATHWAY_SELECTION: 'aiPathwaySuggestions',
      DEMOGRAPHICS: 'demographics',
      CLINICAL_QUESTIONS: 'questionResponses',
      RED_FLAGS: 'redFlags',
      ELIGIBILITY: 'eligibility',
      TREATMENT: 'treatmentPlan',
      COUNSELLING: 'counsellingNotes',
      DOCUMENTATION: 'documentation',
      DOCUMENTS_AND_COMPLETE: 'documentation',
    };
    return map[step] ?? null;
  }

  /** Drop pharmacist-added copies of guided options before persisting a treatment plan. */
  private sanitizeTreatmentPlanPayload(
    data: Record<string, unknown>,
    meta: { userId: string; tenantId: string | null; consultationId: string },
  ): Record<string, unknown> {
    const list = Array.isArray(data.recommendedTreatments)
      ? (data.recommendedTreatments as Record<string, unknown>[])
      : [];
    if (!list.length) return data;
    const { kept, dropped, indexMap } = dropPharmacistAddedDuplicates(list);
    if (!dropped.length) return data;
    const selectedIndexes = Array.isArray(data.selectedIndexes)
      ? remapSelectedIndexes(
          (data.selectedIndexes as unknown[]).map((i) => Number(i)),
          indexMap,
        )
      : undefined;
    const selectedTreatments = Array.isArray(data.selectedTreatments)
      ? (data.selectedTreatments as Record<string, unknown>[]).filter((row) => {
          const identity = identityFromTreatmentRecord(row);
          return !dropped.some((item) => {
            const other = identityFromTreatmentRecord(item);
            return classifyTreatmentDuplicate(identity, {
              pathwayOptions: [],
              planTreatments: [other],
            }).blocking;
          });
        })
      : data.selectedTreatments;
    void this.audit.log({
      userId: meta.userId,
      tenantId: meta.tenantId,
      action: 'TREATMENT_DUPLICATE_STRIPPED',
      module: 'CONSULTATIONS',
      newValue: {
        consultationId: meta.consultationId,
        droppedCount: dropped.length,
      },
    });
    return {
      ...data,
      recommendedTreatments: kept,
      ...(selectedIndexes ? { selectedIndexes } : {}),
      selectedTreatments,
    };
  }

  private assertNoBlockingTreatmentDuplicates(
    selected: Array<Record<string, unknown>>,
    existingPlan: Record<string, unknown>,
  ) {
    const catalog = Array.isArray(existingPlan.recommendedTreatments)
      ? (existingPlan.recommendedTreatments as Record<string, unknown>[])
      : selected;
    const pathwayOptions = catalog
      .map(identityFromTreatmentRecord)
      .filter((item) => Boolean(item.pathwayTreatmentId?.trim()) || item.source === 'pathway');

    for (let i = 0; i < selected.length; i++) {
      const identity = identityFromTreatmentRecord(selected[i]);
      if (!isStandardMedication(identity) || !isPharmacistAddedMedication(identity)) continue;
      const otherSelected = selected
        .filter((_, j) => j !== i)
        .map(identityFromTreatmentRecord)
        .filter(isPharmacistAddedMedication);
      const duplicate = classifyTreatmentDuplicate(identity, {
        pathwayOptions,
        planTreatments: otherSelected,
      });
      if (!duplicate.blocking) continue;
      throw new ConflictException({
        code: 'DUPLICATE_TREATMENT',
        matchType: duplicate.matchType,
        existingPathwayOptionId: duplicate.existingPathwayOptionId,
        existingTreatmentInstanceId: duplicate.existingTreatmentInstanceId,
        existingDisplayName: duplicate.existingDisplayName ?? identity.medicationName,
        existingSafetyStatus: duplicate.existingSafetyStatus,
        message: duplicate.existingPathwayOptionId
          ? `${duplicate.existingDisplayName ?? 'This medication'} is already included in this pathway.`
          : 'This medication has already been added. Review or update the existing treatment instead of adding another copy.',
      });
    }
  }

  private async assertPathwayDuplicates(
    selectedPathwayId: string | null | undefined,
    selected: Array<Record<string, unknown>>,
  ) {
    if (!selectedPathwayId) return;
    const rows = await this.prisma.clinicalTreatment.findMany({
      where: {
        pathwayId: selectedPathwayId,
        isActive: true,
        archivedAt: null,
        approved: true,
      },
      select: { id: true, medicationName: true, genericName: true, route: true },
    });
    const pathwayOptions = rows
      .filter((row) => row.medicationName?.trim())
      .map((row) => ({
        medicationName: row.medicationName,
        genericName: row.genericName ?? undefined,
        route: row.route ?? undefined,
        pathwayTreatmentId: row.id,
        source: 'pathway' as const,
        treatmentKind: 'MEDICATION',
      }));
    for (const row of selected) {
      const identity = identityFromTreatmentRecord(row);
      if (!isStandardMedication(identity) || !isPharmacistAddedMedication(identity)) continue;
      const duplicate = classifyTreatmentDuplicate(identity, {
        pathwayOptions,
        planTreatments: [],
      });
      if (!duplicate.blocking) continue;
      throw new ConflictException({
        code: 'DUPLICATE_TREATMENT',
        matchType: duplicate.matchType,
        existingPathwayOptionId: duplicate.existingPathwayOptionId,
        existingDisplayName: duplicate.existingDisplayName ?? identity.medicationName,
        existingSafetyStatus: duplicate.existingSafetyStatus,
        message: `${duplicate.existingDisplayName ?? 'This medication'} is already included in this pathway.`,
      });
    }
  }

  private async assertSelectedTreatmentsSafety(
    consultationId: string,
    user: RequestUser,
    consultation: { demographics?: unknown; aiEntities?: unknown; tenantId: string | null; updatedAt?: Date },
    selected: Array<Record<string, unknown>>,
  ) {
    const pharmacistAdded = selected.filter((row) => {
      const identity = identityFromTreatmentRecord(row);
      return isStandardMedication(identity) && isPharmacistAddedMedication(identity);
    });
    if (!pharmacistAdded.length) return;

    const inputs = this.patientSafetyInputs(consultation);
    let safetyEval;
    try {
      safetyEval = await this.medicationSafety.evaluate(
        {
          consultationId,
          patientContext: inputs.patientContext,
          selectedMedications: pharmacistAdded.map((row) => ({
            productName: String(row.medicationName ?? ''),
            genericName: row.genericName ? String(row.genericName) : undefined,
          })),
        },
        user,
        consultation.tenantId,
      );
    } catch (err) {
      this.logger.warn(
        `Confirm safety re-evaluation failed for ${consultationId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw new HttpException(
        {
          code: 'SAFETY_UNAVAILABLE',
          message: 'Safety checks could not be completed. Try again before adding this treatment.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (safetyEval.status === SAFETY_EVAL_STATUSES.SERVICE_UNAVAILABLE) {
      throw new HttpException(
        {
          code: 'SAFETY_UNAVAILABLE',
          message: 'Safety checks could not be completed. Try again before adding this treatment.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    for (const row of pharmacistAdded) {
      const name = String(row.medicationName ?? '');
      const genericName = row.genericName ? String(row.genericName) : undefined;
      const flags = mapSafetyEvalToMedication({
        medicationName: name,
        genericName,
        findings: safetyEval.findings,
        patientAllergies: inputs.allergies,
      });
      const override = row.clinicalOverride as
        | { acknowledgedRisk?: boolean; reason?: string }
        | undefined;
      const hasOverride =
        Boolean(override?.acknowledgedRisk && String(override.reason ?? '').trim());
      if (flags.allergyBlocked && !hasOverride) {
        throw new UnprocessableEntityException({
          code: 'TREATMENT_SAFETY_BLOCKED',
          evaluationId: safetyEval.evaluationId,
          status: 'AVOID',
          message:
            flags.allergyWarning?.reason ??
            'This treatment is not suitable for this patient under current safety rules.',
        });
      }
      if (!row.safetyEvaluationId) {
        row.safetyEvaluationId = safetyEval.evaluationId;
        row.safetyStatus = flags.status;
        row.patientContextVersion = inputs.patientContextVersion;
        row.safetyEvaluatedAt = new Date().toISOString();
        row.allergyBlocked = flags.allergyBlocked;
        if (flags.allergyWarning) row.allergyWarning = flags.allergyWarning;
      }
    }
  }

  /** True once the pharmacist has progressed past pathway confirmation / assessment. */
  private assessmentHasBegun(consultation: {
    stepIndex: number;
    questionResponses: unknown;
    redFlags: unknown;
    treatmentPlan: unknown;
    demographics: unknown;
  }): boolean {
    if (consultation.stepIndex > 1) return true;
    if (
      consultation.questionResponses &&
      typeof consultation.questionResponses === 'object' &&
      Object.keys(consultation.questionResponses as object).length > 0
    ) {
      return true;
    }
    if (consultation.redFlags) return true;
    if (consultation.treatmentPlan) return true;
    if (
      consultation.demographics &&
      typeof consultation.demographics === 'object' &&
      Object.keys(consultation.demographics as object).length > 0
    ) {
      return true;
    }
    return false;
  }

  /** Keep only pharmacist-authored answers when refreshing AI assessment fills. */
  private preserveManualQuestionResponses(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const row = value as { source?: string };
      if (row.source === 'manual') out[id] = value;
    }
    return out;
  }

  private async callAiEngine(path: string, body: unknown): Promise<unknown> {
    return this.aiEngine.postJson(path, body);
  }

  /**
   * Draft the referral letter with the live Super Admin Document Session prompt.
   * Falls back to the deterministic template when AI is unavailable or the
   * draft is missing required referral facts.
   */
  private async draftReferralLetter(
    payload: ReturnType<typeof buildReferralLetterPayload>,
  ): Promise<string> {
    let extras = null as ReturnType<typeof parseAiReferralLetterSections>;
    try {
      const result = await this.aiEngine.postJson<Record<string, unknown>>(
        '/api/v1/consultations/generate-referral-letter',
        {
          referral_payload: buildReferralLetterAiInput(payload),
          system_prompt: await this.aiConfig.getLivePrompt(
            AI_PROMPT_KEYS.DOCUMENTATION_REFERRAL_LETTER,
          ),
        },
        25_000,
      );
      if (resolveReferralLetterFromAi(result, payload)) {
        extras = parseAiReferralLetterSections(result, payload);
      } else {
        this.logger.warn(
          'Referral letter draft failed validation; using deterministic letter',
        );
      }
    } catch (err) {
      this.logger.warn(
        `Referral letter AI draft unavailable; using deterministic letter. ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
    return serializeReferralLetterDocument(buildReferralLetterDocument(payload, extras));
  }

  private getClientInfo(req: Request) {
    return {
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
    };
  }

  /**
   * Insert exact confirmed treatment lines into P, stamp pathway citations, and
   * strip unconfirmed actions / leaked IDs after the LLM draft.
   */
  private applyDapPostGeneration(
    canonical: Record<string, unknown>,
    payload: DapPayload,
    chrome?: {
      aiAnalysis?: unknown;
      pathwayLabel?: string | null;
      pathwayVersion?: string | null;
      primaryReference?: {
        citationTitle: string;
        publicationYear?: number | null;
        edition?: string | null;
      } | null;
      secondaryReference?: {
        citationTitle: string;
        publicationYear?: number | null;
        edition?: string | null;
      } | null;
      lastReviewed?: string | null;
    },
  ): Record<string, unknown> {
    const documents = {
      ...((canonical.documents as Record<string, unknown> | undefined) ?? {}),
    };
    const raw = documents.consultation_note;
    const fields: Record<string, string> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string') fields[key] = value;
      }
    }
    const repaired = repairDapNoteFields(fields, payload);
    this.logger.debug(
      `DAP AI output status consultationId planLength=${(fields.plan ?? '').trim().length} ` +
        `hasData=${Boolean(fields.data?.trim())} hasAssessment=${Boolean(fields.assessment?.trim())} ` +
        `hasPlan=${Boolean(fields.plan?.trim())} ` +
        `repairedPlanLength=${(repaired.fields.plan ?? '').trim().length} ` +
        `followUpRequired=${payload.follow_up_plan?.pharmacist_confirmed === true} ` +
        `followUpIncomplete=${Boolean(payload.follow_up_incomplete)} ` +
        `aiPlanRendered=${Boolean(repaired.fields.plan?.trim())} ` +
        `validationOk=${repaired.validation.ok}`,
    );
    const snapshot = readClinicalAssessment(chrome?.aiAnalysis)?.evidenceSnapshot;
    const pathwayChrome = formatPathwayDocumentChromeFromEvidenceSnapshot(snapshot, {
      pathwayLabel: chrome?.pathwayLabel,
      pathwayVersion: chrome?.pathwayVersion,
      primary: chrome?.primaryReference,
      secondary: chrome?.secondaryReference,
      lastReviewed: chrome?.lastReviewed,
    });
    documents.consultation_note = {
      ...fields,
      ...repaired.fields,
      documentTitle: DAP_NOTE_TITLE,
      // Drop stale HTML so the UI rebuilds P — Plan from repaired fields
      // (treatments + counselling narrative + pharmacist follow-up).
      documentHtml: '',
      ...(pathwayChrome ? { clinicalReferences: pathwayChrome } : {}),
      ...(repaired.validation.ok
        ? {}
        : {
            dapRequiresPharmacistReview: 'true',
            dapValidationReasons: repaired.validation.reasons.join('; '),
          }),
      ...(payload.follow_up_incomplete ? { dapFollowUpIncomplete: 'true' } : {}),
    };
    return { ...canonical, documents };
  }

  private pathwayDocumentationCitation(
    refs:
      | Array<{
          id: string;
          citationTitle: string;
          publicationYear?: number | null;
          edition?: string | null;
        }>
      | undefined,
    id?: string | null,
  ): {
    citationTitle: string;
    publicationYear?: number | null;
    edition?: string | null;
  } | null {
    if (!id || !refs?.length) return null;
    const ref = refs.find((row) => row.id === id);
    if (!ref?.citationTitle.trim()) return null;
    return {
      citationTitle: ref.citationTitle,
      publicationYear: ref.publicationYear ?? null,
      edition: ref.edition ?? null,
    };
  }

  /**
   * Force deterministic Treatment lines and drop invented follow-up after the
   * LLM draft. Medication validation failures replace Treatment; remaining
   * unsupported content is flagged for pharmacist review.
   */
  private applyPcpPostGeneration(
    canonical: Record<string, unknown>,
    payload: PcpCommunicationPayload,
    pharmacy?: {
      pharmacyName?: string | null;
      pharmacyFax?: string | null;
      dateOfBirth?: string | null;
    },
  ): Record<string, unknown> {
    const documents = {
      ...((canonical.documents as Record<string, unknown> | undefined) ?? {}),
    };
    const raw = documents.prescriber_communication;
    const fields: Record<string, string> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string') fields[key] = value;
      }
    }
    const repaired = repairPcpCommunicationFields(fields, payload, {
      dateOfBirth: pharmacy?.dateOfBirth,
      pharmacyName: pharmacy?.pharmacyName,
      pharmacyFax: pharmacy?.pharmacyFax,
    });
    documents.prescriber_communication = {
      ...fields,
      ...repaired.fields,
      documentTitle: PCP_LETTER_TITLE,
      closingSentence: PCP_CLOSING_SENTENCE,
      signatureBlock: buildPcpSignatureBlock({
        pharmacistDisplayName: payload.pharmacist.display_name,
        credentials: payload.pharmacist.credentials || 'RPh',
        pharmacyName: pharmacy?.pharmacyName,
        pharmacyFax: pharmacy?.pharmacyFax,
      }),
      ...(repaired.validation.ok
        ? {}
        : {
            pcpRequiresPharmacistReview: 'true',
          }),
      ...(payload.follow_up_incomplete
        ? { pcpFollowUpIncomplete: 'true' }
        : {}),
    };
    return { ...canonical, documents };
  }

  private applyPatientHandoutPostGeneration(
    canonical: Record<string, unknown>,
    payload: PatientSummaryPayload,
  ): Record<string, unknown> {
    const documents = {
      ...((canonical.documents as Record<string, unknown> | undefined) ?? {}),
    };
    const raw = documents.patient_care_summary;
    const fields = coercePatientHandoutLlmOutput(
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {},
    );
    const english = englishHandoutFieldsFromPayload(payload, 'en');
    const allowed = patientHandoutGenerationAllowed(payload);
    const repaired = allowed
      ? repairPatientCareSummaryFields(fields, payload)
      : { fields: english, validation: { ok: true, reasons: [], medicationFailed: false, counsellingFailed: false } };
    const previousLang = normalizeHandoutLanguage(fields.handoutLanguage);
    const stale = previousLang !== 'en';
    documents.patient_care_summary = {
      ...english,
      ...repaired.fields,
      documentTitle: english.documentTitle,
      treatment: english.treatment,
      questionsContact: english.questionsContact,
      diagnosis: english.diagnosis,
      handoutStatus: allowed ? 'draft_generated' : payload.status,
      handoutLanguage: 'en',
      handoutSourceHash: english.handoutSourceHash,
      requestedHandoutLanguage: previousLang,
      translationStale: stale ? 'true' : 'false',
      translationRequiresReview: stale ? 'true' : 'false',
      translationMessage: stale
        ? 'The English source changed. Refresh the translation.'
        : '',
      ...(repaired.validation.ok
        ? {}
        : {
            handoutRequiresPharmacistReview: 'true',
            handoutValidationReasons: repaired.validation.reasons.join('; '),
          }),
    };
    return { ...canonical, documents };
  }

  /**
   * Keep already-ready documents when only a subset is regenerated.
   * Empty LLM output does not wipe a previously usable document.
   */
  private mergeGeneratedDocumentation(
    existing: Record<string, unknown>,
    generated: Record<string, unknown>,
    generatedKeys: readonly string[],
  ): Record<string, unknown> {
    const existingDocs =
      (existing.documents as Record<string, unknown> | undefined) ?? {};
    const generatedDocs =
      (generated.documents as Record<string, unknown> | undefined) ?? {};
    const documents: Record<string, unknown> = { ...existingDocs };
    for (const key of generatedKeys) {
      const next = generatedDocs[key];
      if (documentationDocumentHasContent(next, key)) {
        documents[key] = next;
      } else if (!documentationDocumentHasContent(documents[key], key)) {
        documents[key] = next ?? {};
      }
    }
    return {
      ...existing,
      ...generated,
      documents,
    };
  }

  /**
   * Documentation generate and save can overlap. Never let an empty
   * clinicalReferences payload erase a selection the pharmacist already stored.
   */
  private retainClinicalReferences(
    incoming: Record<string, unknown>,
    stored: unknown,
  ): Record<string, unknown> {
    const merged = preferClinicalReferences(
      parseConsultationClinicalReferences(incoming.clinicalReferences),
      parseConsultationClinicalReferences(
        (stored as { clinicalReferences?: unknown } | null | undefined)
          ?.clinicalReferences,
      ),
    );
    if (!merged) return incoming;
    return { ...incoming, clinicalReferences: merged };
  }

  /** Normalize Prescribe docs to the three canonical keys only. */
  private canonicalizeDocumentation(raw: Record<string, unknown>): Record<string, unknown> {
    const docs = (raw.documents as Record<string, unknown> | undefined) ?? {};
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = docs[k];
        if (v && typeof v === 'object') return v as Record<string, unknown>;
      }
      return undefined;
    };

    const documents: Record<string, unknown> = {};
    const note = pick('consultation_note', 'dapNote');
    const comm = pick('prescriber_communication', 'physicianLetter');
    const care = pick('patient_care_summary', 'patientHandout');
    const rx = pick('prescription');
    if (note) documents.consultation_note = note;
    if (comm) documents.prescriber_communication = comm;
    if (care) documents.patient_care_summary = coercePatientHandoutLlmOutput(care);
    if (rx) documents.prescription = rx;

    return {
      ...raw,
      version: 3,
      revision: typeof raw.revision === 'number' ? raw.revision : 1,
      documents,
    };
  }

  private extractPatientAllergies(consultation: {
    demographics?: unknown;
    aiEntities?: unknown;
  }): string[] {
    const allergies = new Set<string>();
    const demographics = (consultation.demographics ?? {}) as {
      allergies?: string;
      allergyEntries?: Array<{
        drug?: string;
        allergen?: string;
        label?: string;
        genericName?: string;
      }>;
    };
    const entities = (consultation.aiEntities ?? {}) as {
      allergies?: Array<{ allergen?: string }>;
    };

    if (demographics.allergies?.trim()) {
      for (const drug of splitAllergyInputs([demographics.allergies.trim()])) {
        allergies.add(drug);
      }
    }

    for (const entry of demographics.allergyEntries ?? []) {
      const drug = (entry.drug ?? entry.allergen ?? entry.label ?? entry.genericName ?? '').trim();
      if (drug) {
        for (const part of splitAllergyInputs([drug])) allergies.add(part);
      }
    }

    for (const allergy of entities.allergies ?? []) {
      if (allergy.allergen?.trim()) {
        for (const part of splitAllergyInputs([allergy.allergen.trim()])) {
          allergies.add(part);
        }
      }
    }

    return Array.from(allergies);
  }

  private dedupeEvalMedications(
    meds: Array<{ productName: string; genericName?: string; route?: string }>,
  ): Array<{ productName: string; genericName?: string; route?: string }> {
    const seen = new Set<string>();
    const out: Array<{ productName: string; genericName?: string; route?: string }> = [];
    for (const med of meds) {
      const name = med.productName.trim();
      if (!name) continue;
      const key = `${name.toLowerCase()}|${(med.genericName ?? '').toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ productName: name, genericName: med.genericName, route: med.route });
    }
    return out;
  }

  private sanitizePersistedTreatmentPlan(
    plan: unknown,
    consultation: { demographics?: unknown; aiEntities?: unknown },
  ): unknown {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
    const record = plan as Record<string, unknown>;
    const rows = record.recommendedTreatments;
    if (!Array.isArray(rows)) return plan;
    const patientHasRecordedAllergies =
      this.extractPatientAllergies(consultation).length > 0;
    return {
      ...record,
      recommendedTreatments: rows.map((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
          ? sanitizeTreatmentSafety(
              { ...(row as Record<string, unknown>) },
              { patientHasRecordedAllergies },
            )
          : row,
      ),
    };
  }

  private refreshPersistedTreatmentSafety(
    row: Record<string, unknown>,
    opts: {
      findings: Array<{
        findingType: string;
        detail: string;
        summary: string;
        clinicalSeverity: string;
        recommendedAction: string;
        implicatedProductName?: string;
        matchType?: string;
        ruleCode?: string;
        relationshipType?: string;
        overrideAllowed: boolean;
        overrideReasonRequired: boolean;
      }>;
      patientAllergies: string[];
      knowledgeRelease?: string | null;
      engineVersion?: string | null;
      patientPregnant: boolean;
    },
  ): Record<string, unknown> {
    const flags = mapSafetyEvalToMedication({
      medicationName: String(row.medicationName ?? ''),
      genericName: row.genericName ? String(row.genericName) : undefined,
      findings: opts.findings as Parameters<typeof mapSafetyEvalToMedication>[0]['findings'],
      patientAllergies: opts.patientAllergies,
      knowledgeRelease: opts.knowledgeRelease,
      engineVersion: opts.engineVersion,
    });
    const savedRef = (row.drugReference ?? {}) as {
      interactions?: string[];
      renal?: string;
      hepatic?: string;
      monitoring?: string;
      pregnancy?: string;
    };
    const drugReference = pathwayDrugReference({
      interactions: savedRef.interactions ?? [],
      renal: savedRef.renal || String(row.renalAdjustmentReason ?? ''),
      hepatic: savedRef.hepatic || String(row.hepaticAdjustmentReason ?? ''),
      monitoring: savedRef.monitoring || String(row.monitoringReason ?? ''),
      pregnancy: savedRef.pregnancy || String(row.pregnancyReason ?? ''),
    });
    const pathwayPregnancy =
      opts.patientPregnant && row.pregnancyCaution
        ? (row.pregnancyWarning as typeof flags.pregnancyWarning)
        : undefined;
    return applyMappedSafetyToTreatment(
      row,
      { ...flags, pregnancyWarning: flags.pregnancyWarning ?? pathwayPregnancy },
      drugReference,
      opts.patientAllergies.length > 0,
    );
  }

  private applyPathwayAgeGate(
    rows: Array<Record<string, unknown>>,
    opts: {
      patientAgeYears: number | null | undefined;
      pathwayAgeMin: number | null;
      pathwayAgeMax: number | null;
    },
  ) {
    if (opts.patientAgeYears == null) return;
    if (opts.pathwayAgeMin == null && opts.pathwayAgeMax == null) return;
    const underMin =
      opts.pathwayAgeMin != null && opts.patientAgeYears < opts.pathwayAgeMin;
    const overMax =
      opts.pathwayAgeMax != null && opts.patientAgeYears > opts.pathwayAgeMax;
    if (!underMin && !overMax) return;

    for (const t of rows) {
      const cat = String(t.category ?? 'PRESCRIPTION');
      const level = String(t.recommendationLevel ?? '');
      if (cat === 'NON_DRUG' || level === 'SUPPORTIVE_CARE') continue;
      const ageSource = describeSafetyFindingSource({
        findingType: 'age_gate',
        matchType: 'age_gate',
        clinicalSeverity: 'CRITICAL',
        detail: underMin
          ? `Patient age ${opts.patientAgeYears} is below the pathway minimum age of ${opts.pathwayAgeMin}.`
          : `Patient age ${opts.patientAgeYears} is above the pathway maximum age of ${opts.pathwayAgeMax}.`,
      });
      t.allergyBlocked = true;
      t.allergyWarning = {
        patientAllergy: underMin
          ? `Age under ${opts.pathwayAgeMin} years`
          : `Age over ${opts.pathwayAgeMax} years`,
        prescribedDrug: String(t.medicationName ?? ''),
        matchedDrugClass: 'AGE_ELIGIBILITY',
        parentClass: '',
        therapeuticGroup: '',
        matchType: 'age_gate',
        risk: 'HIGH',
        reason: underMin
          ? `Patient age ${opts.patientAgeYears} is below the pathway minimum age of ${opts.pathwayAgeMin}. Adult regimens on this pathway are not eligible.`
          : `Patient age ${opts.patientAgeYears} is above the pathway maximum age of ${opts.pathwayAgeMax}. This pathway regimen is not eligible.`,
        severity: 'CRITICAL',
        safetySource: ageSource,
      };
      const existingSources = Array.isArray(t.safetySources)
        ? (t.safetySources as SafetyEngineSource[])
        : [];
      t.safetySources = [ageSource, ...existingSources];
      t.confidence = 35;
    }
  }

  /**
   * Shared patient-context snapshot for source-agnostic safety evaluation.
   * Used by pathway recommendTreatment and pharmacist-added candidate evaluation.
   */
  patientSafetyInputs(consultation: {
    demographics?: unknown;
    aiEntities?: unknown;
    updatedAt?: Date;
  }) {
    const allergies = this.extractPatientAllergies(consultation);
    return {
      allergies,
      patientContext: this.buildSafetyPatientContext(consultation, allergies),
      patientContextVersion: patientContextVersionFrom(consultation, allergies),
    };
  }

  private buildSafetyPatientContext(
    consultation: { demographics?: unknown; aiEntities?: unknown },
    patientAllergies: string[],
    currentMedications: Array<{ productName: string; genericName?: string }> = [],
  ) {
    const demographics = (consultation.demographics ?? {}) as {
      labValues?: string;
      pregnancyStatus?: string;
      breastfeedingStatus?: string;
      gestationalAgeWeeks?: string | number;
      gestationalAge?: string | number;
      age?: string | number;
      weight?: string | number;
      medicalConditions?: string;
      labEntries?: Array<{ name?: string; value?: string; unit?: string; observedAt?: string }>;
      medicationEntries?: Array<{
        name?: string;
        label?: string;
        brandName?: string;
        genericName?: string;
        status?: string;
      }>;
      currentMedications?: string;
    };
    const entities = (consultation.aiEntities ?? {}) as {
      labValues?: Array<{ test?: string; value?: string; unit?: string }>;
    };

    const structuredLabs = [
      ...(demographics.labEntries ?? []).map((l) => ({
        name: l.name ?? '',
        value: l.value,
        unit: l.unit,
        observedAt: l.observedAt,
      })),
    ].filter((l) => l.name.trim());

    const aiLabs = (entities.labValues ?? [])
      .filter((l) => l.test?.trim() && l.value?.trim())
      .map((l) => ({
        test: l.test!,
        value: l.value!,
        unit: l.unit,
      }));

    const medsFromEntries = (demographics.medicationEntries ?? []).flatMap((m) => {
      const names = [m.name, m.label, m.brandName, m.genericName].filter(
        (x): x is string => Boolean(x?.trim()),
      );
      return names.map((name) => ({
        productName: name,
        genericName: m.genericName ?? undefined,
        status: m.status,
      }));
    });
    const medsFromText = (demographics.currentMedications ?? '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ productName: name }));
    const concurrentMedications = [...currentMedications, ...medsFromEntries, ...medsFromText];
    const dedupedMeds = concurrentMedications.filter(
      (med, idx, arr) =>
        arr.findIndex((m) => m.productName.toLowerCase() === med.productName.toLowerCase()) === idx,
    );

    const conditions = (demographics.medicalConditions ?? '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^none$|^n\/a$|^no known/i.test(s));
    const ageNum =
      demographics.age == null || demographics.age === ''
        ? undefined
        : Number(String(demographics.age).replace(/[^\d.]/g, ''));
    const weightNum =
      demographics.weight == null || demographics.weight === ''
        ? undefined
        : Number(String(demographics.weight).replace(/[^\d.]/g, ''));

    return {
      age: Number.isFinite(ageNum) ? ageNum : undefined,
      weightKg: Number.isFinite(weightNum) ? weightNum : undefined,
      allergies: patientAllergies.map((substance) => ({
        substance,
        clinicalStatus: 'active' as const,
      })),
      conditions: conditions.length ? conditions : undefined,
      pregnancy: demographics.pregnancyStatus
        ? {
            status: demographics.pregnancyStatus,
            gestationalAgeWeeks:
              parseGestationalAgeWeeks(demographics.gestationalAgeWeeks) ??
              parseGestationalAgeWeeks(demographics.gestationalAge) ??
              parseGestationalAgeWeeks(demographics.pregnancyStatus),
          }
        : undefined,
      breastfeeding: demographics.breastfeedingStatus,
      currentMedications: dedupedMeds,
      labs: structuredLabs,
      labValuesText: demographics.labValues,
      aiLabs: aiLabs.length ? aiLabs : undefined,
    };
  }

  private async buildAllergyRedFlags(consultation: {
    id?: string;
    tenantId?: string | null;
    demographics?: unknown;
    aiEntities?: unknown;
    treatmentPlan?: unknown;
  }) {
    const patientAllergies = this.extractPatientAllergies(consultation);
    if (!patientAllergies.length) return [];

    const flags: Array<Record<string, unknown>> = [];

    for (const allergy of patientAllergies) {
      flags.push({
        flag: `Known patient allergy: ${allergy}`,
        severity: 'CRITICAL',
        description: `Patient has a documented allergy to ${allergy}.`,
        reasoning: 'Recorded in patient demographics or extracted entities.',
        recommendedAction: `Review allergy history and avoid related medications.`,
        requiresImmediateAction: true,
        source: 'safety-engine',
      });
    }

    const treatmentPlan = (consultation.treatmentPlan ?? {}) as {
      recommendedTreatments?: Array<{ medicationName?: string; genericName?: string }>;
    };
    const medications = (treatmentPlan.recommendedTreatments ?? [])
      .flatMap((t) => [t.medicationName, t.genericName])
      .filter((name): name is string => Boolean(name?.trim()));

    if (medications.length && consultation.id) {
      const patientContext = this.buildSafetyPatientContext(consultation, patientAllergies);
      const evaluation = await this.medicationSafety.evaluate(
        {
          consultationId: consultation.id,
          patientContext,
          selectedMedications: medications.map((m) => ({ productName: m })),
        },
        undefined,
        consultation.tenantId,
      );

      for (const finding of evaluation.findings) {
        flags.push({
          flag: finding.summary,
          severity: finding.clinicalSeverity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
          description: finding.detail,
          reasoning: finding.recommendedAction,
          recommendedAction: finding.recommendedAction,
          requiresImmediateAction: finding.clinicalSeverity === 'CRITICAL',
          source: 'safety-engine',
          ruleCode: finding.ruleCode,
        });
      }
    }

    return flags;
  }

}

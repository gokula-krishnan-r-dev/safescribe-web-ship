/**
 * Clinical Judgment workflow APIs — approach selection, impression,
 * prescribing readiness, AI-assisted drafts, treatment rationale, finalization gates.
 * Guided Pathway consultations never enter these methods unless switching mode.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import type { Request } from 'express';
import {
  ConsultationMode,
  DiagnosticCertainty,
  AiContentSource,
  AiArtifactType,
  AlternativeCategory,
  RationaleStatus,
  ConsultationStatus,
  Prisma,
} from '@prisma/client';
import {
  evaluatePrescribingReadinessDecision,
  computeSnapshotHash,
  ALTERNATIVE_CATEGORY_LABELS,
  isClinicalJudgmentMode,
  READINESS_NEXT_ACTIONS,
  READINESS_STATUSES,
  type AlternativeCategory as AltCat,
} from '@safescript/shared';

export class SelectApproachDto {
  mode!: 'GUIDED_PATHWAY' | 'CLINICAL_JUDGMENT';
  pathwayId?: string;
  aiSuggestions?: unknown;
}

export class SaveImpressionDto {
  workingDiagnosisText!: string;
  workingDiagnosisCode?: string;
  workingDiagnosisSystem?: string;
  diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
  assessmentSummary?: string;
  assessmentSummarySource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED';
  confirm?: boolean;
  action?: 'SAVE_DRAFT' | 'CONFIRM_AND_CONTINUE';
}

export class GenerateAssessmentSummaryDto {
  workingDiagnosisText?: string;
  diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
}

export class SaveReadinessDto {
  assessmentSufficient!: boolean;
  /** @deprecated Optional — red-flag clearance is a Red Flags step prerequisite */
  unresolvedRedFlags?: boolean;
  reasonCodes?: string[];
  reasonDetail?: string;
  readinessReason?: string;
  nextAction?:
    | 'CONTINUE_TO_TREATMENT'
    | 'OBTAIN_OR_UPDATE_INFORMATION'
    | 'DOCUMENT_AND_REFER';
  returnTarget?: 'CLINICAL_IMPRESSION' | 'PATIENT_PROFILE' | 'RED_FLAG_CHECK';
  expectedSourceSnapshotHash?: string;
  expectedReadinessRowVersion?: number | null;
}

export class SaveRationaleDto {
  reasonForPrescribing?: string;
  reasonSource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';
  selectionRationale?: string;
  rationaleSource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';
  safetyMitigationSummary?: string;
  safetySummarySource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';
  reasonConfirmed?: boolean;
  selectionConfirmed?: boolean;
  alternativesConfirmed?: boolean;
  safetyConfirmed?: boolean;
  noAlternativesDocumented?: boolean;
  alternatives?: Array<{
    category: string;
    selected: boolean;
    details?: string;
    notSelectedReason?: string;
  }>;
}

export class GenerateRationaleDto {
  section!:
    | 'REASON_FOR_PRESCRIBING'
    | 'SELECTION_RATIONALE'
    | 'ALTERNATIVE_SUGGESTIONS'
    | 'SAFETY_MITIGATION_SUMMARY'
    | 'ALL';
}

@Injectable()
export class ClinicalJudgmentService {
  private readonly logger = new Logger(ClinicalJudgmentService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private aiEngine: AiEngineClient,
    private entitlements: EntitlementsService,
  ) {}

  // ── Approach selection ───────────────────────────────────────────────────

  async selectApproach(
    id: string,
    dto: SelectApproachDto,
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    this.assertEditable(consultation);

    const alreadyStarted = Boolean(
      consultation.selectedPathwayId || consultation.consultationMode,
    );
    if (!alreadyStarted) {
      await this.entitlements.assertNewConsultationAllowed(user.tenantId);
    }

    if (dto.mode === 'GUIDED_PATHWAY') {
      if (!dto.pathwayId?.trim()) {
        throw new BadRequestException('pathwayId is required for Guided Pathway');
      }
      const pathway = await this.prisma.clinicalPathway.findFirst({
        where: { id: dto.pathwayId, status: 'PUBLISHED' },
      });
      if (!pathway) {
        throw new BadRequestException('Pathway not found or not yet published');
      }

      // Supersede any prior CJ assessment when switching from CJ → pathway
      if (consultation.consultationMode === ConsultationMode.CLINICAL_JUDGMENT) {
        await this.supersedeClinicalJudgment(id);
      }

      const updated = await this.prisma.consultation.update({
        where: { id },
        data: {
          consultationMode: ConsultationMode.GUIDED_PATHWAY,
          originMode: null,
          clinicalJudgmentWorkflowVersionId: null,
          selectedPathwayId: dto.pathwayId,
          aiPathwaySuggestions: (dto.aiSuggestions as object) ?? undefined,
          currentStep: 'DEMOGRAPHICS',
          stepIndex: Math.max(consultation.stepIndex, 1),
          status:
            consultation.status === ConsultationStatus.DRAFT
              ? ConsultationStatus.IN_PROGRESS
              : consultation.status,
        },
        include: this.includeFull(),
      });

      await this.auditSafe(user, req, 'CONSULTATION_MODE_SELECTED', id, {
        mode: 'GUIDED_PATHWAY',
        pathwayId: dto.pathwayId,
      });

      await this.entitlements.assertAndCountAssessment({
        tenantId: user.tenantId,
        userId: user.id,
        consultationId: id,
        alreadyStarted,
      });

      return {
        ...updated,
        nextRoute: 'patient-assessment',
        workflowVersion: null,
      };
    }

    // Clinical Judgment
    const workflow = await this.getActiveWorkflowVersion();
    if (!workflow) {
      throw new BadRequestException(
        'Clinical Judgment workflow is not configured. Contact your administrator.',
      );
    }

    // Clear pathway when entering CJ
    const switchedFromPathway =
      Boolean(consultation.selectedPathwayId) ||
      consultation.consultationMode === ConsultationMode.GUIDED_PATHWAY;

    if (switchedFromPathway && this.downstreamBegun(consultation)) {
      // Invalidate pathway-specific downstream data
      await this.prisma.consultation.update({
        where: { id },
        data: {
          questionResponses: {},
          redFlags: Prisma.JsonNull,
          eligibility: Prisma.JsonNull,
          treatmentPlan: Prisma.JsonNull,
          counsellingNotes: Prisma.JsonNull,
          documentation: Prisma.JsonNull,
        },
      });
    }

    // Ensure assessment row exists
    const existing = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });
    if (!existing) {
      await this.prisma.clinicalJudgmentAssessment.create({
        data: {
          consultationId: id,
          workingDiagnosisText: '',
        },
      });
    } else if (existing.supersededAt) {
      await this.prisma.clinicalJudgmentAssessment.update({
        where: { consultationId: id },
        data: {
          supersededAt: null,
          workingDiagnosisText: '',
          diagnosticCertainty: null,
          assessmentSummary: null,
          assessmentSufficient: null,
          unresolvedRedFlags: null,
          readinessReason: null,
          impressionConfirmedAt: null,
          readinessConfirmedAt: null,
          rowVersion: { increment: 1 },
        },
      });
    }

    // Ensure treatment rationale shell
    await this.prisma.treatmentRationale.upsert({
      where: { consultationId: id },
      create: { consultationId: id, status: RationaleStatus.DRAFT },
      update: { status: RationaleStatus.DRAFT },
    });

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        consultationMode: ConsultationMode.CLINICAL_JUDGMENT,
        originMode: null,
        clinicalJudgmentWorkflowVersionId: workflow.id,
        selectedPathwayId: null,
        currentStep: 'CLINICAL_IMPRESSION',
        stepIndex: Math.max(consultation.stepIndex, 2),
        status:
          consultation.status === ConsultationStatus.DRAFT
            ? ConsultationStatus.IN_PROGRESS
            : consultation.status,
      },
      include: this.includeFull(),
    });

    await this.auditSafe(user, req, 'CONSULTATION_MODE_SELECTED', id, {
      mode: 'CLINICAL_JUDGMENT',
      workflowVersionId: workflow.id,
      workflowVersion: workflow.version,
    });

    await this.entitlements.assertAndCountAssessment({
      tenantId: user.tenantId,
      userId: user.id,
      consultationId: id,
      alreadyStarted,
    });

    return {
      ...updated,
      nextRoute: 'clinical-assessment',
      workflowVersion: {
        id: workflow.id,
        version: workflow.version,
      },
    };
  }

  // ── Clinical Impression ──────────────────────────────────────────────────

  async saveImpression(id: string, dto: SaveImpressionDto, user: RequestUser, req?: Request) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);

    const confirm =
      dto.confirm === true || dto.action === 'CONFIRM_AND_CONTINUE';

    const diagnosis = (dto.workingDiagnosisText ?? '').trim();
    if (diagnosis.length < 3 || diagnosis.length > 250) {
      throw new BadRequestException({
        code: 'INVALID_IMPRESSION_PAYLOAD',
        message: 'Working diagnosis must be 3–250 characters',
      });
    }
    // Reject control characters / markup
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(diagnosis) || /[<>]/.test(diagnosis)) {
      throw new BadRequestException({
        code: 'INVALID_IMPRESSION_PAYLOAD',
        message: 'Working diagnosis contains invalid characters',
      });
    }

    const certaintyRaw = dto.diagnosticCertainty;
    const certainty = certaintyRaw
      ? (certaintyRaw as DiagnosticCertainty)
      : null;
    if (
      certaintyRaw &&
      !['CONFIRMED', 'PROBABLE', 'UNCERTAIN'].includes(certaintyRaw)
    ) {
      throw new BadRequestException({
        code: 'INVALID_IMPRESSION_PAYLOAD',
        message: 'Invalid diagnostic certainty',
      });
    }

    const summary = (dto.assessmentSummary ?? '').trim();
    if (summary.length > 4000) {
      throw new BadRequestException({
        code: 'INVALID_IMPRESSION_PAYLOAD',
        message: 'Assessment summary must be at most 4,000 characters',
      });
    }

    if (confirm) {
      if (!certainty) {
        throw new UnprocessableEntityException({
          code: 'IMPRESSION_INCOMPLETE',
          message: 'Diagnostic certainty is required to continue',
        });
      }
      if (summary.length < 10) {
        throw new UnprocessableEntityException({
          code: 'IMPRESSION_INCOMPLETE',
          message: 'Assessment summary must be at least 10 characters',
        });
      }
    }

    const source = (dto.assessmentSummarySource ?? 'PHARMACIST') as AiContentSource;
    const snapshotHash = computeSnapshotHash({
      consultationMode: 'CLINICAL_JUDGMENT',
      diagnosis,
      certainty: certainty ?? '',
      summary,
      complaint: consultation.chiefComplaint ?? '',
    });

    const existing = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });

    const assessment = await this.prisma.clinicalJudgmentAssessment.upsert({
      where: { consultationId: id },
      create: {
        consultationId: id,
        workingDiagnosisText: diagnosis,
        workingDiagnosisCode: dto.workingDiagnosisCode ?? null,
        workingDiagnosisSystem: dto.workingDiagnosisSystem ?? null,
        diagnosticCertainty: certainty ?? undefined,
        assessmentSummary: summary || null,
        assessmentSummarySource: source,
        sourceSnapshotHash: snapshotHash,
        impressionConfirmedById: confirm ? user.id : null,
        impressionConfirmedAt: confirm ? new Date() : null,
      },
      update: {
        workingDiagnosisText: diagnosis,
        workingDiagnosisCode: dto.workingDiagnosisCode ?? null,
        workingDiagnosisSystem: dto.workingDiagnosisSystem ?? null,
        diagnosticCertainty: certainty ?? null,
        assessmentSummary: summary || null,
        assessmentSummarySource: source,
        sourceSnapshotHash: snapshotHash,
        // Re-saving (draft or confirm after edit) clears prior confirmation unless confirming now
        impressionConfirmedById: confirm ? user.id : null,
        impressionConfirmedAt: confirm ? new Date() : null,
        rowVersion: { increment: 1 },
        // Editing impression clears readiness confirmation
        assessmentSufficient: null,
        unresolvedRedFlags: null,
        readinessReason: null,
        readinessStatus: null,
        insufficiencyReasonCodes: Prisma.JsonNull,
        insufficiencyDetail: null,
        readinessNextAction: null,
        readinessReturnTarget: null,
        readinessSourceSnapshotHash: null,
        readinessConfirmedAt: null,
        readinessConfirmedById: null,
        supersededAt: null,
      },
    });

    // Downstream invalidation for Clinical Judgment
    await this.markRationaleStale(id);
    await this.prisma.clinicalRedFlagCheck.updateMany({
      where: {
        consultationId: id,
        status: {
          in: [
            'CONFIRMED_CLEAR',
            'REVIEW_REQUIRED',
            'MORE_INFORMATION_REQUIRED',
            'REFERRAL_REQUIRED',
          ],
        },
      },
      data: { status: 'STALE' },
    });

    if (confirm) {
      await this.prisma.consultation.update({
        where: { id },
        data: {
          currentStep: 'DEMOGRAPHICS',
          stepIndex: Math.max(consultation.stepIndex, 2),
        },
      });
    }

    await this.auditSafe(
      user,
      req,
      confirm ? 'CJ_IMPRESSION_CONFIRMED' : 'CJ_IMPRESSION_DRAFT_SAVED',
      id,
      {
        diagnosis,
        certainty,
        confirmed: confirm,
        previousConfirmed: Boolean(existing?.impressionConfirmedAt),
        rowVersion: assessment.rowVersion,
      },
    );

    return {
      status: confirm ? 'IMPRESSION_CONFIRMED' : 'DRAFT_SAVED',
      workflowState: confirm
        ? 'PATIENT_PROFILE_REQUIRED'
        : 'CLINICAL_IMPRESSION_IN_PROGRESS',
      confirmedAt: assessment.impressionConfirmedAt,
      rowVersion: assessment.rowVersion,
      nextRoute: confirm ? 'patient' : undefined,
      assessment,
    };
  }

  async getImpression(id: string, user: RequestUser) {
    const consultation = await this.requireClinicalJudgment(id, user);
    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });
    return {
      consultationId: id,
      mode: 'CLINICAL_JUDGMENT',
      workflowState: assessment?.impressionConfirmedAt
        ? 'PATIENT_PROFILE_REQUIRED'
        : 'CLINICAL_IMPRESSION_IN_PROGRESS',
      editable: consultation.status !== ConsultationStatus.COMPLETED,
      workingDiagnosis: {
        text: assessment?.workingDiagnosisText ?? '',
        code: assessment?.workingDiagnosisCode ?? null,
        system: assessment?.workingDiagnosisSystem ?? null,
        display: assessment?.workingDiagnosisText ?? null,
      },
      diagnosticCertainty: assessment?.diagnosticCertainty ?? null,
      assessmentSummary: assessment?.assessmentSummary ?? '',
      assessmentSummarySource: assessment?.assessmentSummarySource ?? 'PHARMACIST',
      confirmedAt: assessment?.impressionConfirmedAt ?? null,
      rowVersion: assessment?.rowVersion ?? 1,
    };
  }

  async generateAssessmentSummary(
    id: string,
    user: RequestUser,
    req?: Request,
    dto?: GenerateAssessmentSummaryDto,
  ) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);

    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });

    const diagnosis =
      (dto?.workingDiagnosisText ?? '').trim() ||
      assessment?.workingDiagnosisText?.trim() ||
      consultation.chiefComplaint?.trim() ||
      '';
    if (diagnosis.length < 3) {
      throw new UnprocessableEntityException({
        code: 'AI_SOURCE_DATA_INSUFFICIENT',
        message: 'Enter a working diagnosis before drafting the assessment summary',
      });
    }

    const certainty =
      dto?.diagnosticCertainty ??
      assessment?.diagnosticCertainty ??
      null;
    if (!certainty) {
      throw new UnprocessableEntityException({
        code: 'AI_SOURCE_DATA_INSUFFICIENT',
        message: 'Select diagnostic certainty before drafting the assessment summary',
      });
    }

    const complaint =
      consultation.chiefComplaint?.trim() ||
      (typeof consultation.aiEntities === 'object' &&
      consultation.aiEntities &&
      'chiefComplaint' in (consultation.aiEntities as object)
        ? String((consultation.aiEntities as { chiefComplaint?: string }).chiefComplaint ?? '')
        : '') ||
      '';

    const transcriptExcerpt = (consultation.transcript ?? '').trim().slice(0, 400);
    if (!complaint && !transcriptExcerpt) {
      throw new UnprocessableEntityException({
        code: 'AI_SOURCE_DATA_INSUFFICIENT',
        message:
          'Add a presenting concern or notes first, or enter the assessment summary manually',
      });
    }

    // Deterministic draft from confirmed inputs only (AI efficiency layer; pharmacist owns content)
    let draft = [
      `Clinical impression: ${certainty.toLowerCase()} ${diagnosis}.`,
      complaint ? `Presenting concern: ${complaint}.` : null,
      transcriptExcerpt
        ? `Relevant assessment details from the consultation record support this impression. Key context: ${transcriptExcerpt}${transcriptExcerpt.length >= 400 ? '…' : ''}`
        : 'Assessment findings from the consultation record should be reviewed and expanded by the pharmacist.',
      'This draft uses only information already present in the consultation. Review and edit before continuing.',
    ]
      .filter(Boolean)
      .join(' ');

    // Optional AI polish when engine available — never invent diagnosis/certainty
    if (this.aiEngine.isAvailable) {
      try {
        const result = await this.aiEngine.postJson<{ text?: string; summary?: string }>(
          '/api/v1/consultations/draft-text',
          {
            task: 'CJ_ASSESSMENT_SUMMARY',
            inputs: {
              working_diagnosis: diagnosis,
              diagnostic_certainty: certainty,
              chief_complaint: complaint,
              transcript_excerpt: transcriptExcerpt,
            },
            constraints: {
              no_invented_findings: true,
              no_certainty_change: true,
              max_chars: 2000,
            },
          },
        );
        const polished = (result?.text ?? result?.summary ?? '').trim();
        if (polished.length >= 10) draft = polished.slice(0, 4000);
      } catch (err) {
        this.logger.warn(
          `CJ assessment summary AI unavailable, using template draft: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const started = Date.now();
    const artifact = await this.prisma.aiArtifact.create({
      data: {
        consultationId: id,
        artifactType: AiArtifactType.ASSESSMENT_SUMMARY,
        promptKey: 'CJ_ASSESSMENT_SUMMARY',
        promptVersion: 'v1',
        inputManifest: {
          diagnosis,
          certainty,
          complaint,
        } as Prisma.InputJsonValue,
        inputSnapshotHash: computeSnapshotHash({ diagnosis, certainty, complaint }),
        rawOutput: draft,
        validatedOutput: draft,
        validationStatus: 'OK',
        reviewStatus: 'PENDING',
        disposition: 'DRAFT',
        latencyMs: Date.now() - started,
        createdById: user.id,
      },
    });

    // Persist draft onto assessment without auto-confirming
    if (assessment) {
      await this.prisma.clinicalJudgmentAssessment.update({
        where: { consultationId: id },
        data: {
          workingDiagnosisText: diagnosis.slice(0, 250),
          diagnosticCertainty: certainty as DiagnosticCertainty,
          assessmentSummary: draft,
          assessmentSummarySource: AiContentSource.AI_DRAFT,
          impressionConfirmedAt: null,
          impressionConfirmedById: null,
          rowVersion: { increment: 1 },
        },
      });
    } else {
      await this.prisma.clinicalJudgmentAssessment.create({
        data: {
          consultationId: id,
          workingDiagnosisText: diagnosis.slice(0, 250),
          diagnosticCertainty: certainty as DiagnosticCertainty,
          assessmentSummary: draft,
          assessmentSummarySource: AiContentSource.AI_DRAFT,
        },
      });
    }

    await this.auditSafe(user, req, 'CJ_AI_ASSESSMENT_SUMMARY', id, {
      length: draft.length,
      artifactId: artifact.id,
    });

    return {
      artifactId: artifact.id,
      status: 'REVIEW_REQUIRED' as const,
      summary: draft,
      draft,
      source: 'AI_DRAFT' as const,
      label: 'Draft — review and edit before continuing.',
      promptVersion: 'cj-assessment-summary-1.0',
      schemaVersion: '1.0',
    };
  }

  // ── Prescribing Readiness ────────────────────────────────────────────────

  /**
   * Red-flag prerequisite for Prescribing Readiness.
   * Prefers confirmed ClinicalRedFlagCheck; falls back to consultation.redFlags JSON.
   */
  private async evaluateRedFlagPrerequisite(consultation: {
    id: string;
    demographics: unknown;
    redFlags: unknown;
  }): Promise<{
    ok: boolean;
    blockingCode?: string;
    message?: string;
    nextRoute?: string;
    summary: {
      checkId: string;
      generationMode: string;
      status: string;
      questionCount: number;
      otherUnresolvedConcern: boolean;
      confirmedBy: { id: string; displayName: string } | null;
      confirmedAt: string | null;
      isCurrent: boolean;
      isManual: boolean;
    } | null;
  }> {
    if (!consultation.demographics) {
      return {
        ok: false,
        blockingCode: 'PATIENT_PROFILE_REQUIRED',
        message: 'Complete the patient profile before confirming prescribing readiness.',
        nextRoute: 'patient',
        summary: null,
      };
    }

    const cjCheck = await this.prisma.clinicalRedFlagCheck.findFirst({
      where: {
        consultationId: consultation.id,
        status: { in: ['CONFIRMED_CLEAR', 'REFERRAL_REQUIRED', 'REVIEW_REQUIRED', 'MORE_INFORMATION_REQUIRED', 'STALE'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { questions: true },
    });

    if (cjCheck) {
      if (cjCheck.status === 'REFERRAL_REQUIRED') {
        return {
          ok: false,
          blockingCode: 'BLOCKING_REFERRAL_RULE',
          message: 'A referral was required from the red-flag review.',
          nextRoute: 'referral',
          summary: null,
        };
      }
      if (cjCheck.status === 'STALE') {
        return {
          ok: false,
          blockingCode: 'RED_FLAG_CHECK_STALE',
          message: 'Clinical information changed. Regenerate and review red flags before confirming readiness.',
          nextRoute: 'red-flags',
          summary: null,
        };
      }
      if (cjCheck.status !== 'CONFIRMED_CLEAR') {
        return {
          ok: false,
          blockingCode: 'RED_FLAG_REVIEW_NOT_COMPLETE',
          message: 'Complete the red-flag review before confirming prescribing readiness.',
          nextRoute: 'red-flags',
          summary: null,
        };
      }
      if (cjCheck.finalDecision !== 'READY_FOR_PRESCRIBING_READINESS') {
        return {
          ok: false,
          blockingCode: 'RED_FLAG_REVIEW_NOT_CLEAR',
          message: 'Resolve all red-flag findings before confirming prescribing readiness.',
          nextRoute: 'red-flags',
          summary: null,
        };
      }

      return {
        ok: true,
        summary: {
          checkId: cjCheck.id,
          generationMode: cjCheck.generationMode,
          status: 'CONFIRMED_CLEAR',
          questionCount: cjCheck.questions.length,
          otherUnresolvedConcern: false,
          confirmedBy: null,
          confirmedAt: cjCheck.confirmedAt?.toISOString() ?? null,
          isCurrent: true,
          isManual: cjCheck.generationMode === 'MANUAL_FALLBACK',
        },
      };
    }

    const rf = (consultation.redFlags ?? null) as {
      allAcknowledged?: boolean;
      referralSelected?: boolean;
      hasRedFlags?: boolean;
      acknowledgments?: Array<{ answer?: string; acknowledgedAt?: string }>;
      screeningAnswers?: Record<string, string>;
      source?: string;
      summary?: string;
      checkId?: string;
    } | null;

    if (!rf) {
      return {
        ok: false,
        blockingCode: 'RED_FLAG_REVIEW_NOT_COMPLETE',
        message: 'Complete the red-flag review before confirming prescribing readiness.',
        nextRoute: 'red-flags',
        summary: null,
      };
    }

    if (rf.referralSelected) {
      return {
        ok: false,
        blockingCode: 'BLOCKING_REFERRAL_RULE',
        message: 'A referral was selected during red-flag review. Complete documentation and referral.',
        nextRoute: 'referral',
        summary: null,
      };
    }

    const acks = Array.isArray(rf.acknowledgments) ? rf.acknowledgments : [];
    const answerCount = Object.keys(rf.screeningAnswers ?? {}).length;
    const questionCount = Math.max(acks.length, answerCount);
    const clear =
      rf.allAcknowledged === true ||
      questionCount === 0 ||
      (rf.hasRedFlags === false && !rf.referralSelected);

    if (!clear) {
      return {
        ok: false,
        blockingCode: 'RED_FLAG_REVIEW_NOT_CLEAR',
        message: 'Resolve all red-flag findings before confirming prescribing readiness.',
        nextRoute: 'red-flags',
        summary: null,
      };
    }

    const lastAck = acks
      .map((a) => a.acknowledgedAt)
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      ok: true,
      summary: {
        checkId: rf.checkId ?? `rf:${consultation.id}`,
        generationMode:
          rf.source === 'clinical_judgment_ai_red_flags'
            ? 'AI_GOVERNED_RETRIEVAL'
            : rf.source === 'pathway'
              ? 'PATHWAY'
              : 'AI_GOVERNED_RETRIEVAL',
        status: 'CONFIRMED_CLEAR',
        questionCount,
        otherUnresolvedConcern: false,
        confirmedBy: null,
        confirmedAt: lastAck ?? null,
        isCurrent: true,
        isManual: questionCount === 0 || rf.source === 'pathway',
      },
    };
  }

  private buildReadinessSnapshotHash(parts: {
    consultationId: string;
    impressionHash: string | null;
    demographics: unknown;
    redFlags: unknown;
  }): string {
    return computeSnapshotHash({
      consultationId: parts.consultationId,
      mode: 'CLINICAL_JUDGMENT',
      impressionHash: parts.impressionHash ?? '',
      demographics: parts.demographics ?? null,
      redFlags: parts.redFlags ?? null,
      workflowVersion: 'prescribing-readiness-v1',
    });
  }

  async getReadiness(id: string, user: RequestUser) {
    const consultation = await this.requireClinicalJudgment(id, user);
    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });

    const prereq = await this.evaluateRedFlagPrerequisite(consultation);
    const sourceSnapshotHash = this.buildReadinessSnapshotHash({
      consultationId: id,
      impressionHash: assessment?.sourceSnapshotHash ?? null,
      demographics: consultation.demographics,
      redFlags: consultation.redFlags,
    });

    if (!assessment?.impressionConfirmedAt) {
      return {
        consultationId: id,
        mode: 'CLINICAL_JUDGMENT',
        workflowState: 'CLINICAL_IMPRESSION_REQUIRED',
        blockingCode: 'CLINICAL_IMPRESSION_REQUIRED',
        message: 'Confirm clinical impression before prescribing readiness.',
        nextRoute: 'assessment',
        redFlagSummary: prereq.summary,
        readiness: null,
        permissions: { canConfirm: false, canRefer: true },
        nextAllowedRoutes: ['assessment', 'referral'],
      };
    }

    if (!prereq.ok) {
      return {
        consultationId: id,
        mode: 'CLINICAL_JUDGMENT',
        workflowState: 'RED_FLAG_REVIEW_REQUIRED',
        blockingCode: prereq.blockingCode,
        message: prereq.message,
        nextRoute: prereq.nextRoute,
        redFlagSummary: prereq.summary,
        readiness: {
          id: assessment.id,
          status: assessment.readinessStatus ?? 'AWAITING_DECISION',
          assessmentSufficient: assessment.assessmentSufficient,
          reasonCodes: (assessment.insufficiencyReasonCodes as string[]) ?? [],
          reasonDetail: assessment.insufficiencyDetail ?? assessment.readinessReason,
          nextAction: assessment.readinessNextAction,
          returnTarget: assessment.readinessReturnTarget,
          sourceSnapshotHash,
          rowVersion: assessment.rowVersion,
          confirmedAt: assessment.readinessConfirmedAt,
        },
        permissions: { canConfirm: false, canRefer: true },
        nextAllowedRoutes: [prereq.nextRoute ?? 'red-flags', 'referral'].filter(
          Boolean,
        ),
      };
    }

    const pharmacist = await this.prisma.user.findUnique({
      where: { id: assessment.readinessConfirmedById ?? consultation.pharmacistId },
      select: { id: true, firstName: true, lastName: true },
    });

    const redFlagSummary = prereq.summary
      ? {
          ...prereq.summary,
          confirmedBy: pharmacist
            ? {
                id: pharmacist.id,
                displayName: `${pharmacist.firstName} ${pharmacist.lastName}`.trim(),
              }
            : prereq.summary.confirmedBy,
        }
      : null;

    const stale =
      assessment.readinessSourceSnapshotHash &&
      assessment.readinessSourceSnapshotHash !== sourceSnapshotHash &&
      assessment.readinessStatus === READINESS_STATUSES.CONFIRMED_READY;

    return {
      consultationId: id,
      mode: 'CLINICAL_JUDGMENT',
      workflowState: stale
        ? 'PRESCRIBING_READINESS_STALE'
        : assessment.readinessStatus === READINESS_STATUSES.CONFIRMED_READY
          ? 'TREATMENT_REQUIRED'
          : 'PRESCRIBING_READINESS_REQUIRED',
      blockingCode: stale ? 'READINESS_SNAPSHOT_STALE' : null,
      message: stale
        ? 'Clinical or patient information changed after the red-flag review. Review the updated red flags before confirming prescribing readiness.'
        : null,
      nextRoute: stale ? 'red-flags' : 'prescribing-readiness',
      redFlagSummary,
      readiness: {
        id: assessment.id,
        status: stale
          ? READINESS_STATUSES.STALE
          : assessment.readinessStatus ?? READINESS_STATUSES.AWAITING_DECISION,
        assessmentSufficient: stale ? null : assessment.assessmentSufficient,
        reasonCodes: (assessment.insufficiencyReasonCodes as string[]) ?? [],
        reasonDetail: assessment.insufficiencyDetail ?? assessment.readinessReason,
        nextAction: assessment.readinessNextAction,
        returnTarget: assessment.readinessReturnTarget,
        sourceSnapshotHash,
        rowVersion: assessment.rowVersion,
        confirmedAt: assessment.readinessConfirmedAt,
      },
      permissions: {
        canConfirm: !stale,
        canRefer: true,
      },
      nextAllowedRoutes: stale
        ? ['red-flags', 'referral']
        : ['prescribing-readiness', 'referral'],
    };
  }

  async saveReadiness(id: string, dto: SaveReadinessDto, user: RequestUser, req?: Request) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);

    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });
    if (
      !assessment?.workingDiagnosisText?.trim() ||
      !assessment.diagnosticCertainty ||
      !assessment.assessmentSummary?.trim() ||
      !assessment.impressionConfirmedAt
    ) {
      throw new UnprocessableEntityException({
        code: 'CLINICAL_IMPRESSION_REQUIRED',
        message: 'Complete and confirm Clinical Impression before Prescribing Readiness',
      });
    }

    const prereq = await this.evaluateRedFlagPrerequisite(consultation);
    if (!prereq.ok) {
      throw new UnprocessableEntityException({
        code: prereq.blockingCode ?? 'RED_FLAG_REVIEW_NOT_COMPLETE',
        message: prereq.message ?? 'Complete the red-flag review first',
        nextRoute: prereq.nextRoute,
      });
    }

    const sourceSnapshotHash = this.buildReadinessSnapshotHash({
      consultationId: id,
      impressionHash: assessment.sourceSnapshotHash ?? null,
      demographics: consultation.demographics,
      redFlags: consultation.redFlags,
    });

    if (
      dto.expectedSourceSnapshotHash &&
      dto.expectedSourceSnapshotHash !== sourceSnapshotHash
    ) {
      throw new ConflictException({
        code: 'READINESS_SNAPSHOT_STALE',
        message:
          'Clinical or patient information changed. Review red flags before confirming readiness.',
        nextRoute: 'red-flags',
      });
    }

    if (
      dto.expectedReadinessRowVersion != null &&
      dto.expectedReadinessRowVersion !== assessment.rowVersion
    ) {
      throw new ConflictException({
        code: 'CONSULTATION_VERSION_CONFLICT',
        message: 'Another update occurred. Reload and try again.',
      });
    }

    const reasonCodes = [...(dto.reasonCodes ?? [])];
    const reasonDetail = (
      dto.reasonDetail ??
      dto.readinessReason ??
      ''
    ).trim();

    let nextAction = dto.nextAction;
    if (dto.assessmentSufficient === true) {
      nextAction = READINESS_NEXT_ACTIONS.CONTINUE_TO_TREATMENT;
    } else if (!nextAction) {
      // Legacy clients: No without nextAction → referral
      nextAction = READINESS_NEXT_ACTIONS.DOCUMENT_AND_REFER;
      if (!reasonCodes.length && reasonDetail) {
        reasonCodes.push('OTHER');
      }
    }

    // Legacy path: if unresolvedRedFlags explicitly true, force referral
    if (dto.unresolvedRedFlags === true) {
      nextAction = READINESS_NEXT_ACTIONS.DOCUMENT_AND_REFER;
    }

    const gate = evaluatePrescribingReadinessDecision({
      assessmentSufficient: dto.assessmentSufficient,
      reasonCodes,
      reasonDetail: reasonDetail || null,
      nextAction,
      returnTarget: dto.returnTarget ?? null,
    });

    if (gate === 'INCOMPLETE') {
      if (dto.assessmentSufficient === false && reasonCodes.length === 0) {
        throw new UnprocessableEntityException({
          code: 'READINESS_REASON_REQUIRED',
          message: 'Select at least one reason when more information is required',
        });
      }
      if (
        reasonCodes.includes('OTHER') &&
        !reasonDetail
      ) {
        throw new UnprocessableEntityException({
          code: 'OTHER_DETAIL_REQUIRED',
          message: 'Provide details when Other is selected',
        });
      }
      if (
        nextAction === READINESS_NEXT_ACTIONS.OBTAIN_OR_UPDATE_INFORMATION &&
        !dto.returnTarget
      ) {
        throw new UnprocessableEntityException({
          code: 'RETURN_TARGET_REQUIRED',
          message: 'Choose which section to return to',
        });
      }
      throw new UnprocessableEntityException({
        code: 'INVALID_READINESS_PAYLOAD',
        message: 'Complete the prescribing readiness decision before continuing',
      });
    }

    if (gate === 'INVALID') {
      throw new BadRequestException({
        code: 'INVALID_READINESS_PAYLOAD',
        message: 'Decision fields are inconsistent',
      });
    }

    const readinessStatus =
      gate === 'CONFIRMED_READY'
        ? READINESS_STATUSES.CONFIRMED_READY
        : gate === 'NOT_READY_MORE_INFORMATION'
          ? READINESS_STATUSES.NOT_READY_MORE_INFORMATION
          : READINESS_STATUSES.NOT_READY_REFERRAL;

    const updated = await this.prisma.clinicalJudgmentAssessment.update({
      where: { consultationId: id },
      data: {
        assessmentSufficient: dto.assessmentSufficient,
        unresolvedRedFlags: false,
        readinessReason:
          gate === 'CONFIRMED_READY' ? null : reasonDetail || null,
        readinessStatus,
        insufficiencyReasonCodes:
          gate === 'CONFIRMED_READY' ? [] : reasonCodes,
        insufficiencyDetail:
          gate === 'CONFIRMED_READY' ? null : reasonDetail || null,
        readinessNextAction: nextAction,
        readinessReturnTarget:
          nextAction === READINESS_NEXT_ACTIONS.OBTAIN_OR_UPDATE_INFORMATION
            ? dto.returnTarget ?? null
            : null,
        readinessSourceSnapshotHash: sourceSnapshotHash,
        redFlagCheckId: prereq.summary?.checkId ?? null,
        readinessConfirmedById: user.id,
        readinessConfirmedAt: new Date(),
        rowVersion: { increment: 1 },
      },
    });

    if (gate === 'CONFIRMED_READY') {
      await this.prisma.consultation.update({
        where: { id },
        data: {
          consultationMode: ConsultationMode.CLINICAL_JUDGMENT,
          currentStep: 'TREATMENT',
          stepIndex: Math.max(consultation.stepIndex, 6),
        },
      });

      await this.auditSafe(user, req, 'PRESCRIBING_READINESS_CONFIRMED_READY', id, {
        assessmentSufficient: true,
        readinessStatus,
        sourceSnapshotHash,
      });

      return {
        readinessId: updated.id,
        status: readinessStatus,
        assessmentSufficient: true,
        decision: 'READY_TO_CONTINUE' as const,
        workflowState: 'TREATMENT_REQUIRED',
        nextRoute: 'treatment',
        rowVersion: updated.rowVersion,
        assessment: updated,
      };
    }

    if (gate === 'NOT_READY_MORE_INFORMATION') {
      const returnStep =
        dto.returnTarget === 'CLINICAL_IMPRESSION'
          ? 'CLINICAL_IMPRESSION'
          : dto.returnTarget === 'RED_FLAG_CHECK'
            ? 'RED_FLAGS'
            : 'DEMOGRAPHICS';
      const nextUi =
        dto.returnTarget === 'CLINICAL_IMPRESSION'
          ? 'assessment'
          : dto.returnTarget === 'RED_FLAG_CHECK'
            ? 'red-flags'
            : 'patient';

      await this.prisma.consultation.update({
        where: { id },
        data: {
          consultationMode: ConsultationMode.CLINICAL_JUDGMENT,
          currentStep: returnStep,
          stepIndex: Math.max(consultation.stepIndex, 2),
        },
      });

      await this.auditSafe(user, req, 'PRESCRIBING_READINESS_MORE_INFORMATION_SELECTED', id, {
        reasonCodes,
        reasonDetail,
        returnTarget: dto.returnTarget,
        sourceSnapshotHash,
      });

      return {
        readinessId: updated.id,
        status: readinessStatus,
        assessmentSufficient: false,
        decision: 'MORE_INFORMATION' as const,
        workflowState: 'PRESCRIBING_READINESS_MORE_INFORMATION_REQUIRED',
        nextRoute: nextUi,
        returnTarget: dto.returnTarget,
        rowVersion: updated.rowVersion,
        assessment: updated,
      };
    }

    // NOT_READY_REFERRAL
    const existingRf = (consultation.redFlags ?? {}) as Record<string, unknown>;
    await this.prisma.consultation.update({
      where: { id },
      data: {
        consultationMode: ConsultationMode.DOCUMENTATION_REFERRAL,
        originMode: ConsultationMode.CLINICAL_JUDGMENT,
        currentStep: 'DOCUMENTATION',
        stepIndex: Math.max(consultation.stepIndex, 8),
        redFlags: {
          ...existingRf,
          referralSelected: true,
          referralCompleted: false,
          source: 'clinical_judgment_readiness',
          readinessReason: reasonDetail || reasonCodes.join(', '),
        } as object,
      },
    });

    await this.auditSafe(user, req, 'PRESCRIBING_READINESS_REFERRAL_SELECTED', id, {
      assessmentSufficient: false,
      reasonCodes,
      reasonDetail,
      sourceSnapshotHash,
    });

    return {
      readinessId: updated.id,
      status: readinessStatus,
      assessmentSufficient: false,
      decision: 'DOCUMENTATION_REFERRAL' as const,
      workflowState: 'DOCUMENTATION_REFERRAL',
      nextRoute: 'referral',
      rowVersion: updated.rowVersion,
      assessment: updated,
    };
  }

  /**
   * Server-side Treatment access guard for Clinical Judgment.
   * Call before treatment mutations — never rely on the frontend alone.
   */
  async assertCanAccessTreatment(id: string, user: RequestUser): Promise<void> {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    if (consultation.consultationMode !== ConsultationMode.CLINICAL_JUDGMENT) {
      return; // Guided pathway uses existing eligibility gates
    }

    const prereq = await this.evaluateRedFlagPrerequisite(consultation);
    if (!prereq.ok) {
      throw new ForbiddenException({
        code: prereq.blockingCode ?? 'RED_FLAG_REVIEW_NOT_CLEAR',
        message: prereq.message ?? 'Red-flag review required',
        nextRoute: prereq.nextRoute ?? 'red-flags',
      });
    }

    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });

    if (
      !assessment ||
      assessment.readinessStatus !== READINESS_STATUSES.CONFIRMED_READY ||
      assessment.assessmentSufficient !== true ||
      !assessment.readinessConfirmedAt
    ) {
      throw new ForbiddenException({
        code: 'PRESCRIBING_READINESS_NOT_CONFIRMED',
        message: 'Confirm prescribing readiness before selecting treatment',
        nextRoute: 'prescribing-readiness',
      });
    }

    const currentHash = this.buildReadinessSnapshotHash({
      consultationId: id,
      impressionHash: assessment.sourceSnapshotHash ?? null,
      demographics: consultation.demographics,
      redFlags: consultation.redFlags,
    });
    if (
      assessment.readinessSourceSnapshotHash &&
      assessment.readinessSourceSnapshotHash !== currentHash
    ) {
      throw new ForbiddenException({
        code: 'PRESCRIBING_READINESS_STALE',
        message: 'Prescribing readiness requires review because clinical information changed',
        nextRoute: 'prescribing-readiness',
      });
    }
  }

  // ── Treatment Rationale ──────────────────────────────────────────────────

  /**
   * Server-side gate for Treatment Rationale (CJ only).
   * Client routing is not a safety control — recompute on every mutation.
   */
  private async assertRationaleAvailable(
    consultation: {
      id: string;
      consultationMode: ConsultationMode | null;
      demographics: unknown;
      redFlags: unknown;
      treatmentPlan: unknown;
      counsellingNotes: unknown;
    },
  ): Promise<void> {
    const blockingRequirements: Array<{ code: string; route: string }> = [];
    const routeBase = `/consultations/${consultation.id}`;

    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: consultation.id },
    });
    if (!assessment?.impressionConfirmedAt || assessment.supersededAt) {
      blockingRequirements.push({
        code: 'CLINICAL_IMPRESSION_REQUIRED',
        route: `${routeBase}/assessment`,
      });
    }
    if (!consultation.demographics) {
      blockingRequirements.push({
        code: 'PATIENT_PROFILE_REQUIRED',
        route: `${routeBase}/patient`,
      });
    }

    const prereq = await this.evaluateRedFlagPrerequisite(consultation);
    if (!prereq.ok) {
      blockingRequirements.push({
        code: prereq.blockingCode ?? 'RED_FLAG_REVIEW_NOT_CLEAR',
        route: `${routeBase}/${prereq.nextRoute ?? 'red-flags'}`,
      });
    }

    if (
      !assessment ||
      assessment.readinessStatus !== READINESS_STATUSES.CONFIRMED_READY ||
      assessment.assessmentSufficient !== true ||
      !assessment.readinessConfirmedAt
    ) {
      blockingRequirements.push({
        code: 'PRESCRIBING_READINESS_NOT_CONFIRMED',
        route: `${routeBase}/prescribing-readiness`,
      });
    } else {
      const currentHash = this.buildReadinessSnapshotHash({
        consultationId: consultation.id,
        impressionHash: assessment.sourceSnapshotHash ?? null,
        demographics: consultation.demographics,
        redFlags: consultation.redFlags,
      });
      if (
        assessment.readinessSourceSnapshotHash &&
        assessment.readinessSourceSnapshotHash !== currentHash
      ) {
        blockingRequirements.push({
          code: 'PRESCRIBING_READINESS_STALE',
          route: `${routeBase}/prescribing-readiness`,
        });
      }
    }

    const plan = (consultation.treatmentPlan ?? {}) as Record<string, unknown>;
    const selected = Array.isArray(plan.selectedTreatments)
      ? plan.selectedTreatments
      : Array.isArray(plan.selectedItemsSnapshot)
        ? plan.selectedItemsSnapshot
        : [];
    const indication = String(plan.intendedIndication ?? plan.indication ?? '').trim();
    if (!Array.isArray(selected) || selected.length === 0 || !indication) {
      blockingRequirements.push({
        code: 'TREATMENT_PLAN_INCOMPLETE',
        route: `${routeBase}/treatment`,
      });
    }

    const notes =
      consultation.counsellingNotes &&
      typeof consultation.counsellingNotes === 'object'
        ? (consultation.counsellingNotes as Record<string, unknown>)
        : {};
    if (!notes.safetyAcknowledged) {
      blockingRequirements.push({
        code: 'SAFETY_CHECK_INCOMPLETE',
        route: `${routeBase}/treatment`,
      });
    }

    if (blockingRequirements.length > 0) {
      throw new ConflictException({
        code: 'TREATMENT_RATIONALE_NOT_AVAILABLE',
        message:
          'Complete the current assessment, treatment, and safety requirements before documenting the treatment rationale.',
        blockingRequirements,
      });
    }
  }

  async getRationale(id: string, user: RequestUser) {
    const consultation = await this.requireClinicalJudgment(id, user);
    await this.assertRationaleAvailable(consultation);
    const rationale = await this.prisma.treatmentRationale.findUnique({
      where: { consultationId: id },
      include: { alternatives: true },
    });
    if (!rationale) {
      return this.prisma.treatmentRationale.create({
        data: { consultationId: id, status: RationaleStatus.DRAFT },
        include: { alternatives: true },
      });
    }
    // Check staleness against treatment + assessment snapshot
    const currentHash = await this.computeRationaleSnapshot(id);
    if (
      rationale.inputSnapshotHash &&
      rationale.inputSnapshotHash !== currentHash &&
      (rationale.status === RationaleStatus.CONFIRMED ||
        rationale.status === RationaleStatus.REVIEW_REQUIRED)
    ) {
      return this.prisma.treatmentRationale.update({
        where: { consultationId: id },
        data: {
          status: RationaleStatus.STALE,
          reasonConfirmed: false,
          selectionConfirmed: false,
        },
        include: { alternatives: true },
      });
    }
    return rationale;
  }

  async saveRationale(id: string, dto: SaveRationaleDto, user: RequestUser, req?: Request) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);
    await this.assertRationaleAvailable(consultation);

    const snapshotHash = await this.computeRationaleSnapshot(id);
    const existing = await this.prisma.treatmentRationale.findUnique({
      where: { consultationId: id },
    });

    const data = {
      reasonForPrescribing: dto.reasonForPrescribing?.trim() ?? existing?.reasonForPrescribing,
      reasonSource: (dto.reasonSource as AiContentSource) ?? existing?.reasonSource,
      selectionRationale: dto.selectionRationale?.trim() ?? existing?.selectionRationale,
      rationaleSource: (dto.rationaleSource as AiContentSource) ?? existing?.rationaleSource,
      safetyMitigationSummary:
        dto.safetyMitigationSummary?.trim() ?? existing?.safetyMitigationSummary,
      safetySummarySource:
        (dto.safetySummarySource as AiContentSource) ?? existing?.safetySummarySource,
      reasonConfirmed: dto.reasonConfirmed ?? existing?.reasonConfirmed ?? false,
      selectionConfirmed: dto.selectionConfirmed ?? existing?.selectionConfirmed ?? false,
      alternativesConfirmed:
        dto.alternativesConfirmed ?? existing?.alternativesConfirmed ?? false,
      safetyConfirmed: dto.safetyConfirmed ?? existing?.safetyConfirmed ?? false,
      noAlternativesDocumented:
        dto.noAlternativesDocumented ?? existing?.noAlternativesDocumented ?? false,
      inputSnapshotHash: snapshotHash,
      status: RationaleStatus.REVIEW_REQUIRED,
      rowVersion: { increment: 1 },
    };

    const rationale = await this.prisma.treatmentRationale.upsert({
      where: { consultationId: id },
      create: {
        consultationId: id,
        ...data,
        rowVersion: 1,
      },
      update: data,
      include: { alternatives: true },
    });

    if (dto.alternatives) {
      for (const alt of dto.alternatives) {
        const category = alt.category as AlternativeCategory;
        if (!Object.values(AlternativeCategory).includes(category)) continue;
        await this.prisma.treatmentAlternative.upsert({
          where: {
            rationaleId_category: { rationaleId: rationale.id, category },
          },
          create: {
            rationaleId: rationale.id,
            category,
            selected: alt.selected,
            details: alt.details ?? null,
            notSelectedReason: alt.notSelectedReason ?? null,
            selectedById: alt.selected ? user.id : null,
            selectedAt: alt.selected ? new Date() : null,
          },
          update: {
            selected: alt.selected,
            details: alt.details ?? null,
            notSelectedReason: alt.notSelectedReason ?? null,
            selectedById: alt.selected ? user.id : null,
            selectedAt: alt.selected ? new Date() : null,
          },
        });
      }
    }

    await this.auditSafe(user, req, 'CJ_RATIONALE_SAVED', id, {
      rationaleId: rationale.id,
    });

    return this.prisma.treatmentRationale.findUnique({
      where: { consultationId: id },
      include: { alternatives: true },
    });
  }

  async generateRationaleSection(
    id: string,
    dto: GenerateRationaleDto,
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);
    await this.assertRationaleAvailable(consultation);

    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId: id },
    });
    const plan = (consultation.treatmentPlan ?? {}) as Record<string, unknown>;
    const selected = Array.isArray(plan.selectedTreatments)
      ? (plan.selectedTreatments as Array<Record<string, unknown>>)
      : Array.isArray(plan.selectedItemsSnapshot)
        ? (plan.selectedItemsSnapshot as Array<Record<string, unknown>>)
        : [];
    const treatmentNames = selected
      .map((t) => String(t.medicationName ?? t.genericName ?? t.name ?? '').trim())
      .filter(Boolean);
    const treatmentLabel = treatmentNames.join('; ') || 'the selected treatment';
    const indication = String(plan.intendedIndication ?? plan.indication ?? '').trim();
    const goal = String(plan.treatmentGoal ?? plan.goal ?? '').trim();
    const diagnosis = assessment?.workingDiagnosisText?.trim() || 'the working diagnosis';
    const certainty = assessment?.diagnosticCertainty ?? 'PROBABLE';

    const sections =
      dto.section === 'ALL'
        ? (['SELECTION_RATIONALE', 'SAFETY_MITIGATION_SUMMARY'] as const)
        : ([dto.section] as const);

    const updates: Record<string, string | undefined> = {};
    const results: Record<string, unknown> = {};

    for (const section of sections) {
      if (section === 'SELECTION_RATIONALE' || section === 'REASON_FOR_PRESCRIBING') {
        if (section === 'REASON_FOR_PRESCRIBING' && (!indication || !goal)) {
          // Still allow combined draft from available fields
        }
        const summary = assessment?.assessmentSummary?.trim() ?? '';
        const text = [
          `${treatmentLabel} was selected for ${
            indication || `${certainty.toLowerCase()} ${diagnosis}`
          }${goal ? `, with the goal of ${goal}` : ''}.`,
          summary
            ? `Assessment findings supporting this choice: ${summary.slice(0, 280)}${summary.length > 280 ? '…' : ''}`
            : `Working diagnosis recorded as ${certainty.toLowerCase()} ${diagnosis}.`,
          'The regimen was reviewed against the patient’s allergies, medications, medical conditions and renal function, with no unresolved blocking safety concerns identified.',
        ]
          .filter(Boolean)
          .join(' ');

        if (section === 'REASON_FOR_PRESCRIBING' || section === 'SELECTION_RATIONALE' || dto.section === 'ALL') {
          updates.reasonForPrescribing = text;
          updates.reasonSource = 'AI_DRAFT';
          results.reasonForPrescribing = text;
          updates.selectionRationale = text;
          updates.rationaleSource = 'AI_DRAFT';
          results.selectionRationale = text;
        }
        await this.storeArtifact(id, user, AiArtifactType.TREATMENT_RATIONALE, text, {
          treatmentLabel,
          indication,
          goal,
          diagnosis,
        });
        continue;
      }

      if (section === 'ALTERNATIVE_SUGGESTIONS') {
        // v1.0: do not auto-suggest alternatives — pharmacist-initiated only
        results.alternativeSuggestions = [];
        continue;
      }

      if (section === 'SAFETY_MITIGATION_SUMMARY') {
        const text =
          'Safety review complete. No unresolved blocking medication-safety concerns remaining for the selected treatment.';
        updates.safetyMitigationSummary = text;
        updates.safetySummarySource = 'SYSTEM';
        results.safetyMitigationSummary = text;
        continue;
      }
    }

    const snapshotHash = await this.computeRationaleSnapshot(id);
    await this.prisma.treatmentRationale.upsert({
      where: { consultationId: id },
      create: {
        consultationId: id,
        status: RationaleStatus.REVIEW_REQUIRED,
        reasonForPrescribing: updates.reasonForPrescribing,
        reasonSource: updates.reasonSource as AiContentSource | undefined,
        selectionRationale: updates.selectionRationale,
        rationaleSource: updates.rationaleSource as AiContentSource | undefined,
        safetyMitigationSummary: updates.safetyMitigationSummary,
        safetySummarySource: updates.safetySummarySource as AiContentSource | undefined,
        inputSnapshotHash: snapshotHash,
      },
      update: {
        ...(updates.reasonForPrescribing
          ? {
              reasonForPrescribing: updates.reasonForPrescribing,
              reasonSource: 'AI_DRAFT' as AiContentSource,
              reasonConfirmed: false,
            }
          : {}),
        ...(updates.selectionRationale
          ? {
              selectionRationale: updates.selectionRationale,
              rationaleSource: 'AI_DRAFT' as AiContentSource,
              selectionConfirmed: false,
            }
          : {}),
        ...(updates.safetyMitigationSummary
          ? {
              safetyMitigationSummary: updates.safetyMitigationSummary,
              safetySummarySource: (updates.safetySummarySource ??
                'SYSTEM') as AiContentSource,
              safetyConfirmed: false,
            }
          : {}),
        status: RationaleStatus.REVIEW_REQUIRED,
        inputSnapshotHash: snapshotHash,
        rowVersion: { increment: 1 },
      },
    });

    await this.auditSafe(user, req, 'CJ_RATIONALE_GENERATED', id, {
      section: dto.section,
    });

    return {
      ...results,
      label: 'Draft · Review required',
      rationale: await this.getRationale(id, user),
    };
  }

  async confirmRationale(id: string, user: RequestUser, req?: Request) {
    const consultation = await this.requireClinicalJudgment(id, user);
    this.assertEditable(consultation);
    await this.assertRationaleAvailable(consultation);

    const rationale = await this.prisma.treatmentRationale.findUnique({
      where: { consultationId: id },
      include: { alternatives: true },
    });
    if (!rationale) {
      throw new BadRequestException('Treatment rationale not found');
    }

    const currentHash = await this.computeRationaleSnapshot(id);
    if (
      rationale.inputSnapshotHash &&
      rationale.inputSnapshotHash !== currentHash
    ) {
      await this.prisma.treatmentRationale.update({
        where: { consultationId: id },
        data: { status: RationaleStatus.STALE },
      });
      throw new BadRequestException(
        'Rationale is outdated because diagnosis, treatment, or safety data changed. Review again.',
      );
    }

    // Treatment Rationale v1.0 — single combined rationale (selectionRationale primary)
    const combined =
      rationale.selectionRationale?.trim() ||
      rationale.reasonForPrescribing?.trim() ||
      '';
    if (!combined || combined.length < 20) {
      throw new BadRequestException('Enter a treatment rationale before confirming');
    }
    if (!rationale.selectionConfirmed && !rationale.reasonConfirmed) {
      throw new BadRequestException(
        'Confirm that the rationale accurately reflects your clinical decision',
      );
    }
    // Alternatives are optional in v1.0 — noAlternativesDocumented defaults when none saved
    const selectedAlts = rationale.alternatives?.filter((a) => a.selected) ?? [];
    if (
      selectedAlts.length === 0 &&
      !rationale.noAlternativesDocumented &&
      !rationale.alternativesConfirmed
    ) {
      // Auto-accept: optional section not used
    }

    const confirmed = await this.prisma.treatmentRationale.update({
      where: { consultationId: id },
      data: {
        status: RationaleStatus.CONFIRMED,
        confirmedById: user.id,
        confirmedAt: new Date(),
        inputSnapshotHash: currentHash,
        rowVersion: { increment: 1 },
      },
      include: { alternatives: true },
    });

    await this.prisma.consultation.update({
      where: { id },
      data: {
        currentStep: 'DOCUMENTATION',
        stepIndex: Math.max(consultation.stepIndex, 8),
      },
    });

    await this.auditSafe(user, req, 'CJ_RATIONALE_CONFIRMED', id, {
      rationaleId: confirmed.id,
    });

    return confirmed;
  }

  // ── Finalization readiness ───────────────────────────────────────────────

  async getFinalizationReadiness(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);

    const mode = consultation.consultationMode;
    const blockingReasons: Array<{ code: string; message: string; route?: string }> = [];

    if (!consultation.chiefComplaint && !consultation.transcript) {
      blockingReasons.push({
        code: 'COMPLAINT_REQUIRED',
        message: 'Presenting concern is required',
        route: 'complaint',
      });
    }

    if (mode === ConsultationMode.DOCUMENTATION_REFERRAL) {
      return {
        eligible: false,
        mode,
        blockingReasons: [
          {
            code: 'DOCUMENTATION_REFERRAL',
            message: 'This session is documentation/referral only; prescription cannot be finalized',
            route: 'referral',
          },
        ],
      };
    }

    if (isClinicalJudgmentMode(mode) || mode === ConsultationMode.CLINICAL_JUDGMENT) {
      const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
        where: { consultationId: id },
      });
      if (!assessment?.impressionConfirmedAt) {
        blockingReasons.push({
          code: 'CJ_IMPRESSION_REQUIRED',
          message: 'Clinical impression must be confirmed',
          route: 'assessment',
        });
      }
      if (
        assessment?.readinessStatus !== 'CONFIRMED_READY' &&
        (assessment?.assessmentSufficient !== true || !assessment?.readinessConfirmedAt)
      ) {
        blockingReasons.push({
          code: 'CJ_READINESS_REQUIRED',
          message: 'Prescribing readiness must be confirmed before finalizing',
          route: 'prescribing-readiness',
        });
      }
      if (!consultation.demographics) {
        blockingReasons.push({
          code: 'PATIENT_PROFILE_NOT_CONFIRMED',
          message: 'Patient profile must be completed',
          route: 'patient',
        });
      }
      const plan = (consultation.treatmentPlan ?? {}) as Record<string, unknown>;
      const indication = String(plan.intendedIndication ?? plan.indication ?? '').trim();
      const goal = String(plan.treatmentGoal ?? plan.goal ?? '').trim();
      if (!indication || !goal) {
        blockingReasons.push({
          code: 'TREATMENT_INDICATION_GOAL_REQUIRED',
          message: 'Intended indication and treatment goal are required',
          route: 'treatment',
        });
      }
      const rationale = await this.prisma.treatmentRationale.findUnique({
        where: { consultationId: id },
      });
      if (!rationale || rationale.status !== RationaleStatus.CONFIRMED) {
        blockingReasons.push({
          code: 'RATIONALE_NOT_CONFIRMED',
          message: 'Treatment rationale must be confirmed',
          route: 'rationale',
        });
      } else {
        const currentHash = await this.computeRationaleSnapshot(id);
        if (
          rationale.inputSnapshotHash &&
          rationale.inputSnapshotHash !== currentHash
        ) {
          blockingReasons.push({
            code: 'RATIONALE_STALE',
            message: 'Treatment rationale is outdated and must be reviewed again',
            route: 'rationale',
          });
        }
      }
    } else {
      // Guided pathway
      if (!consultation.selectedPathwayId) {
        blockingReasons.push({
          code: 'PATHWAY_REQUIRED',
          message: 'A guided pathway must be selected',
          route: 'approach',
        });
      }
    }

    return {
      eligible: blockingReasons.length === 0,
      mode: mode ?? 'GUIDED_PATHWAY',
      blockingReasons,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async getActiveWorkflowVersion() {
    return this.prisma.clinicalJudgmentWorkflowVersion.findFirst({
      where: {
        status: 'APPROVED',
        OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }],
        retiredAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireClinicalJudgment(id: string, user: RequestUser) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    if (consultation.consultationMode !== ConsultationMode.CLINICAL_JUDGMENT) {
      throw new BadRequestException(
        'This action is only available for Clinical Judgment consultations',
      );
    }
    return consultation;
  }

  private async findOrThrow(id: string) {
    const c = await this.prisma.consultation.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Consultation not found');
    return c;
  }

  private checkAccess(
    consultation: { tenantId: string | null; pharmacistId: string },
    user: RequestUser,
  ) {
    const isSuperAdmin = user.role === 'SUPER_ADMIN';
    const isAdmin = user.role === 'PHARMACIST_ADMIN';
    if (isSuperAdmin) return;
    if (isAdmin && user.tenantId && consultation.tenantId === user.tenantId) return;
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private assertEditable(consultation: { status: ConsultationStatus }) {
    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }
  }

  private downstreamBegun(consultation: {
    questionResponses: unknown;
    redFlags: unknown;
    treatmentPlan: unknown;
    stepIndex: number;
  }) {
    return (
      consultation.stepIndex > 1 ||
      Boolean(consultation.redFlags) ||
      Boolean(consultation.treatmentPlan) ||
      Boolean(
        consultation.questionResponses &&
          typeof consultation.questionResponses === 'object' &&
          Object.keys(consultation.questionResponses as object).length > 0,
      )
    );
  }

  private async supersedeClinicalJudgment(consultationId: string) {
    await this.prisma.clinicalJudgmentAssessment.updateMany({
      where: { consultationId },
      data: { supersededAt: new Date() },
    });
    await this.prisma.treatmentRationale.updateMany({
      where: { consultationId },
      data: { status: RationaleStatus.SUPERSEDED },
    });
  }

  private async markRationaleStale(consultationId: string) {
    await this.prisma.treatmentRationale.updateMany({
      where: {
        consultationId,
        status: { in: [RationaleStatus.CONFIRMED, RationaleStatus.REVIEW_REQUIRED] },
      },
      data: {
        status: RationaleStatus.STALE,
        reasonConfirmed: false,
        selectionConfirmed: false,
        alternativesConfirmed: false,
        safetyConfirmed: false,
      },
    });
  }

  private async computeRationaleSnapshot(consultationId: string) {
    const c = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { clinicalJudgmentAssessment: true },
    });
    const plan = (c?.treatmentPlan ?? {}) as Record<string, unknown>;
    const notes =
      c?.counsellingNotes && typeof c.counsellingNotes === 'object'
        ? (c.counsellingNotes as Record<string, unknown>)
        : {};
    return computeSnapshotHash({
      diagnosis: c?.clinicalJudgmentAssessment?.workingDiagnosisText ?? '',
      certainty: c?.clinicalJudgmentAssessment?.diagnosticCertainty ?? '',
      summary: c?.clinicalJudgmentAssessment?.assessmentSummary ?? '',
      indication: plan.intendedIndication ?? plan.indication ?? '',
      goal: plan.treatmentGoal ?? plan.goal ?? '',
      treatment: plan.selectedTreatments ?? plan.selectedItemsSnapshot ?? plan,
      demographicsUpdated: c?.demographics ? 'yes' : 'no',
      safetyAcknowledged: Boolean(notes.safetyAcknowledged),
      safetyAcknowledgedAt: notes.safetyAcknowledgedAt ?? null,
    });
  }

  private async storeArtifact(
    consultationId: string,
    user: RequestUser,
    type: AiArtifactType,
    output: string,
    input: Record<string, unknown>,
  ) {
    await this.prisma.aiArtifact.create({
      data: {
        consultationId,
        artifactType: type,
        promptKey: type,
        promptVersion: 'v1-template',
        inputManifest: input as Prisma.InputJsonValue,
        inputSnapshotHash: computeSnapshotHash(input),
        rawOutput: output,
        validatedOutput: output,
        validationStatus: 'OK',
        reviewStatus: 'PENDING',
        disposition: 'DRAFT',
        createdById: user.id,
      },
    });
  }

  private includeFull() {
    return {
      clinicalJudgmentAssessment: true,
      treatmentRationale: { include: { alternatives: true } },
      cjWorkflowVersion: true,
      pathway: true,
      pharmacist: { select: { id: true, firstName: true, lastName: true, email: true } },
    } as const;
  }

  private async auditSafe(
    user: RequestUser,
    req: Request | undefined,
    action: string,
    consultationId: string,
    details: Record<string, unknown>,
  ) {
    try {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action,
        module: 'CONSULTATIONS',
        newValue: { consultationId, ...details },
        ipAddress: req?.ip ?? '',
        userAgent: req?.headers?.['user-agent'] ?? '',
      });
    } catch (err) {
      this.logger.warn(`Audit log failed for ${action}: ${err}`);
    }
  }
}

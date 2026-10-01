import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConsultationStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import type { Request } from 'express';
import {
  computeSourceAnswerRevision,
  confirmBlockedReason,
  classifyPathwayQuestionSection,
  evaluatePathwayAssessment,
  orderedAnswerPairs,
  type PathwayClinicalJudgementRecord,
  type PathwayDiagnosticCertainty,
} from '@safescript/shared';
import type {
  ConfirmPathwayClinicalJudgementDto,
  SavePathwayClinicalJudgementDraftDto,
} from './dto/consultation.dto';

type QuestionRow = {
  id: string;
  question: string;
  section?: { name?: string | null } | null;
  sectionId?: string | null;
};

@Injectable()
export class PathwayClinicalJudgementService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private aiEngine: AiEngineClient,
  ) {}

  async getEvaluation(consultationId: string, user: RequestUser) {
    const loaded = await this.load(consultationId, user);
    return this.snapshot(loaded);
  }

  async saveDraft(
    consultationId: string,
    dto: SavePathwayClinicalJudgementDraftDto,
    user: RequestUser,
    req?: Request,
  ) {
    const loaded = await this.load(consultationId, user);
    this.assertEditable(loaded.consultation);
    const now = new Date().toISOString();
    const next: PathwayClinicalJudgementRecord = {
      ...loaded.record,
      workingDiagnosisDisplay:
        dto.workingDiagnosisDisplay?.trim() || loaded.record.workingDiagnosisDisplay,
      workingDiagnosisConceptId:
        dto.workingDiagnosisConceptId?.trim() || loaded.record.workingDiagnosisConceptId,
      diagnosticCertainty: dto.diagnosticCertainty ?? loaded.record.diagnosticCertainty,
      rationaleDraft:
        dto.rationaleDraft !== undefined ? dto.rationaleDraft : loaded.record.rationaleDraft,
      uiState: dto.uiState ?? loaded.record.uiState,
      status:
        loaded.evaluation.clinicalJudgementRequired
          ? loaded.record.status === 'CONFIRMED' || loaded.record.status === 'STALE'
            ? loaded.record.status
            : loaded.record.status === 'NOT_REQUIRED'
              ? 'DRAFT'
              : dto.uiState === 'form' && loaded.record.status === 'REQUIRED'
                ? 'DRAFT'
                : loaded.record.status
          : 'NOT_REQUIRED',
      updatedAt: now,
    };
    if (dto.rationaleDraft?.trim() && next.draftSource == null) {
      next.draftSource = 'PHARMACIST';
    }
    await this.persist(consultationId, next);
    return this.snapshot({ ...loaded, record: next });
  }

  async draftRationale(consultationId: string, user: RequestUser, req?: Request) {
    const loaded = await this.load(consultationId, user);
    this.assertEditable(loaded.consultation);
    if (!loaded.evaluation.clinicalJudgementRequired) {
      throw new BadRequestException('Clinical judgement is not required for the current answers.');
    }

    await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_AI_DRAFT_REQUESTED', consultationId, {
      pathwayId: loaded.record.pathwayId,
    });

    const diagnosisLabel =
      loaded.record.workingDiagnosisDisplay ||
      loaded.consultation.pathway?.condition ||
      loaded.consultation.pathway?.name ||
      'the selected condition';
    const complaint = (loaded.consultation.chiefComplaint ?? '').trim();
    const diagnosisLines = this.answerLines(loaded.diagnosisIds, loaded.questions, loaded.responses);
    const eligibilityLines = this.answerLines(
      loaded.eligibilityIds,
      loaded.questions,
      loaded.responses,
    );

    let draft = [
      `Working diagnosis remains ${diagnosisLabel}.`,
      complaint ? `Presenting concern: ${complaint}.` : null,
      diagnosisLines.length
        ? `Diagnosis confirmation responses: ${diagnosisLines.join('; ')}.`
        : null,
      eligibilityLines.length
        ? `Treatment eligibility responses: ${eligibilityLines.join('; ')}.`
        : null,
      'The guided questions did not include a supporting Yes. The pharmacist is documenting why continuing with this pathway remains appropriate based on the assessment already captured.',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, 1000);

    if (this.aiEngine.isAvailable) {
      try {
        const result = await this.aiEngine.postJson<{ text?: string; summary?: string }>(
          '/api/v1/consultations/draft-text',
          {
            task: 'PATHWAY_CLINICAL_JUDGEMENT_RATIONALE',
            inputs: {
              working_diagnosis: diagnosisLabel,
              chief_complaint: complaint,
              diagnosis_answers: diagnosisLines,
              eligibility_answers: eligibilityLines,
            },
            constraints: {
              do_not_invent_findings: true,
              do_not_claim_criteria_were_met: true,
              do_not_decide_to_proceed: true,
              max_chars: 1000,
            },
          },
        );
        const polished = (result.text ?? result.summary ?? '').trim();
        if (polished) draft = polished.slice(0, 1000);
        await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_AI_DRAFT_GENERATED', consultationId, {
          length: draft.length,
        });
      } catch {
        await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_AI_DRAFT_FAILED', consultationId, {
          code: 'ai_unavailable',
        });
      }
    }

    const now = new Date().toISOString();
    const mixed =
      loaded.record.rationaleDraft.trim() &&
      loaded.record.rationaleDraft.trim() !== draft
        ? 'MIXED'
        : 'AI_ASSISTED';
    const next: PathwayClinicalJudgementRecord = {
      ...loaded.record,
      rationaleDraft: draft,
      draftSource: mixed,
      uiState: 'form',
      status: 'DRAFT',
      updatedAt: now,
    };
    await this.persist(consultationId, next);
    return { ...this.snapshot({ ...loaded, record: next }), draft };
  }

  async confirm(
    consultationId: string,
    dto: ConfirmPathwayClinicalJudgementDto,
    user: RequestUser,
    req?: Request,
  ) {
    const loaded = await this.load(consultationId, user);
    this.assertEditable(loaded.consultation);
    if (!loaded.evaluation.clinicalJudgementRequired) {
      throw new BadRequestException('Clinical judgement is not required for the current answers.');
    }
    if (dto.sourceAnswerRevision !== loaded.revision) {
      throw new ConflictException({
        statusCode: 409,
        error: 'PATHWAY_ANSWER_REVISION_CONFLICT',
        message: 'Assessment answers changed. Review the updated responses before confirming.',
        evaluation: loaded.evaluation,
        sourceAnswerRevision: loaded.revision,
      });
    }
    if (dto.workingDiagnosisConceptId && dto.workingDiagnosisConceptId !== loaded.record.pathwayId) {
      throw new BadRequestException(
        'Working diagnosis no longer matches the active pathway. Switch pathway or continue with standalone clinical judgement.',
      );
    }
    const blocked = confirmBlockedReason({
      workingDiagnosisDisplay: dto.workingDiagnosisDisplay,
      diagnosticCertainty: dto.diagnosticCertainty,
      rationale: dto.rationaleApproved,
    });
    if (blocked) throw new BadRequestException(blocked);

    const now = new Date().toISOString();
    const next: PathwayClinicalJudgementRecord = {
      ...loaded.record,
      status: 'CONFIRMED',
      reason: loaded.evaluation.clinicalJudgementReason,
      workingDiagnosisDisplay: dto.workingDiagnosisDisplay.trim(),
      workingDiagnosisConceptId: dto.workingDiagnosisConceptId?.trim() || loaded.record.pathwayId,
      diagnosticCertainty: dto.diagnosticCertainty,
      rationaleDraft: dto.rationaleApproved.trim(),
      rationaleApproved: dto.rationaleApproved.trim(),
      draftSource: loaded.record.draftSource ?? 'PHARMACIST',
      sourceAnswerRevision: loaded.revision,
      confirmedByUserId: user.id,
      confirmedAt: now,
      noTreatmentInitiated: false,
      uiState: 'documented',
      updatedAt: now,
    };
    await this.persist(consultationId, next);
    await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_CONFIRMED', consultationId, {
      reason: next.reason,
      certainty: next.diagnosticCertainty,
      revision: next.sourceAnswerRevision,
    });
    return this.snapshot({ ...loaded, record: next, evaluation: {
      ...loaded.evaluation,
      canProceedToSafetyScreening: true,
    } });
  }

  async documentWithoutTreatment(consultationId: string, user: RequestUser, req?: Request) {
    const loaded = await this.load(consultationId, user);
    this.assertEditable(loaded.consultation);
    if (!loaded.evaluation.clinicalJudgementRequired) {
      throw new BadRequestException('Clinical judgement is not required for the current answers.');
    }
    const now = new Date().toISOString();
    const next: PathwayClinicalJudgementRecord = {
      ...loaded.record,
      status: loaded.record.status === 'CONFIRMED' ? 'CONFIRMED' : 'REQUIRED',
      reason: loaded.evaluation.clinicalJudgementReason,
      noTreatmentInitiated: true,
      uiState: 'prompt',
      updatedAt: now,
    };
    const documentation = {
      ...((loaded.consultation.documentation as Record<string, unknown> | null) ?? {}),
      consultationOutcome: 'NO_TREATMENT_INITIATED',
    };
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        pathwayClinicalJudgement: next as unknown as Prisma.InputJsonValue,
        documentation: documentation as Prisma.InputJsonValue,
        currentStep: 'DOCUMENTATION',
      },
    });
    await this.auditSafe(user, req, 'NO_TREATMENT_SELECTED', consultationId, {
      reason: next.reason,
    });
    return {
      ...this.snapshot({ ...loaded, record: next }),
      nextStep: 'DOCUMENTATION' as const,
    };
  }

  async syncFromAnswers(consultationId: string, user: RequestUser, req?: Request) {
    const loaded = await this.load(consultationId, user);
    const next = this.applyAnswerSync(loaded.record, loaded.evaluation, loaded.revision);
    if (JSON.stringify(next) !== JSON.stringify(loaded.record)) {
      await this.persist(consultationId, next);
      if (next.status === 'REQUIRED' && loaded.record.status !== 'REQUIRED') {
        await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_REQUIRED', consultationId, {
          reason: next.reason,
        });
      }
      if (next.status === 'STALE' && loaded.record.status === 'CONFIRMED') {
        await this.auditSafe(user, req, 'CLINICAL_JUDGEMENT_MARKED_STALE', consultationId, {
          revision: loaded.revision,
        });
      }
    }
    return this.snapshot({ ...loaded, record: next });
  }

  private applyAnswerSync(
    record: PathwayClinicalJudgementRecord,
    evaluation: ReturnType<typeof evaluatePathwayAssessment>['evaluation'],
    revision: string,
  ): PathwayClinicalJudgementRecord {
    const now = new Date().toISOString();
    if (!evaluation.clinicalJudgementRequired) {
      return {
        ...record,
        status: 'NOT_REQUIRED',
        reason: null,
        uiState: record.uiState === 'form' ? 'prompt' : record.uiState,
        updatedAt: now,
      };
    }
    if (record.status === 'CONFIRMED' && record.sourceAnswerRevision !== revision) {
      return {
        ...record,
        status: 'STALE',
        reason: evaluation.clinicalJudgementReason,
        uiState: 'prompt',
        updatedAt: now,
      };
    }
    if (record.status === 'NOT_REQUIRED' || record.status === 'CONFIRMED') {
      return {
        ...record,
        status: record.status === 'CONFIRMED' ? 'CONFIRMED' : 'REQUIRED',
        reason: evaluation.clinicalJudgementReason,
        updatedAt: now,
      };
    }
    return {
      ...record,
      status: record.status === 'STALE' ? 'STALE' : record.status === 'DRAFT' ? 'DRAFT' : 'REQUIRED',
      reason: evaluation.clinicalJudgementReason,
      updatedAt: now,
    };
  }

  private async load(consultationId: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        pathway: {
          include: {
            questions: { include: { section: true }, orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);

    const questions = (consultation.pathway?.questions ?? []) as QuestionRow[];
    const diagnosisIds: string[] = [];
    const eligibilityIds: string[] = [];
    for (const q of questions) {
      const kind = classifyPathwayQuestionSection(q.section?.name);
      if (kind === 'TREATMENT_ELIGIBILITY') eligibilityIds.push(q.id);
      else if (kind === 'DIAGNOSIS_CONFIRMATION') diagnosisIds.push(q.id);
    }

    const responses = (consultation.questionResponses ?? {}) as Record<
      string,
      { answer?: unknown; answerText?: unknown }
    >;
    const existing = this.parseRecord(consultation.pathwayClinicalJudgement, consultation);
    const { evaluation, diagnosisAnswers, eligibilityAnswers, diagnosisConfig, eligibilityConfig } =
      evaluatePathwayAssessment({
        diagnosisQuestionIds: diagnosisIds,
        eligibilityQuestionIds: eligibilityIds,
        responses,
        judgementStatus: existing.status,
      });
    const revision = computeSourceAnswerRevision({
      pathwayId: consultation.selectedPathwayId ?? '',
      pathwayVersion: String(consultation.pathway?.version ?? ''),
      diagnosisAnswers: orderedAnswerPairs(diagnosisConfig.questionIds, diagnosisAnswers),
      eligibilityAnswers: orderedAnswerPairs(eligibilityConfig.questionIds, eligibilityAnswers),
    });
    const record = this.applyAnswerSync(existing, evaluation, revision);
    return {
      consultation,
      questions,
      responses,
      diagnosisIds,
      eligibilityIds,
      evaluation,
      revision,
      record,
    };
  }

  private parseRecord(
    raw: unknown,
    consultation: {
      id: string;
      selectedPathwayId: string | null;
      pathway?: { version?: number | null; condition?: string | null; name?: string | null } | null;
    },
  ): PathwayClinicalJudgementRecord {
    const now = new Date().toISOString();
    const fallback: PathwayClinicalJudgementRecord = {
      id: randomUUID(),
      consultationId: consultation.id,
      pathwayId: consultation.selectedPathwayId ?? '',
      pathwayVersion: String(consultation.pathway?.version ?? ''),
      status: 'NOT_REQUIRED',
      reason: null,
      workingDiagnosisConceptId: consultation.selectedPathwayId,
      workingDiagnosisDisplay:
        consultation.pathway?.condition?.trim() || consultation.pathway?.name?.trim() || null,
      diagnosticCertainty: null,
      rationaleDraft: '',
      rationaleApproved: null,
      draftSource: null,
      sourceAnswerRevision: null,
      confirmedByUserId: null,
      confirmedAt: null,
      noTreatmentInitiated: false,
      uiState: 'prompt',
      createdAt: now,
      updatedAt: now,
    };
    if (!raw || typeof raw !== 'object') return fallback;
    const row = raw as Partial<PathwayClinicalJudgementRecord>;
    return {
      ...fallback,
      ...row,
      id: row.id || fallback.id,
      consultationId: consultation.id,
      pathwayId: consultation.selectedPathwayId ?? fallback.pathwayId,
      pathwayVersion: String(consultation.pathway?.version ?? fallback.pathwayVersion),
      workingDiagnosisDisplay:
        row.workingDiagnosisDisplay?.trim() || fallback.workingDiagnosisDisplay,
      workingDiagnosisConceptId:
        row.workingDiagnosisConceptId ?? fallback.workingDiagnosisConceptId,
      diagnosticCertainty: this.asCertainty(row.diagnosticCertainty),
      rationaleDraft: row.rationaleDraft ?? '',
      noTreatmentInitiated: Boolean(row.noTreatmentInitiated),
      uiState: row.uiState === 'form' || row.uiState === 'documented' ? row.uiState : 'prompt',
    };
  }

  private asCertainty(value: unknown): PathwayDiagnosticCertainty | null {
    return value === 'CONFIRMED' || value === 'PROBABLE' || value === 'UNCERTAIN' ? value : null;
  }

  private snapshot(loaded: {
    record: PathwayClinicalJudgementRecord;
    evaluation: ReturnType<typeof evaluatePathwayAssessment>['evaluation'];
    revision: string;
  }) {
    return {
      record: loaded.record,
      evaluation: loaded.evaluation,
      sourceAnswerRevision: loaded.revision,
    };
  }

  private answerLines(
    ids: string[],
    questions: QuestionRow[],
    responses: Record<string, { answer?: unknown; answerText?: unknown }>,
  ): string[] {
    const byId = new Map(questions.map((q) => [q.id, q]));
    return ids.map((id) => {
      const q = byId.get(id);
      const raw = String(responses[id]?.answerText ?? responses[id]?.answer ?? '').trim() || 'Unanswered';
      return `${q?.question ?? id}: ${raw}`;
    });
  }

  private async persist(consultationId: string, record: PathwayClinicalJudgementRecord) {
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: { pathwayClinicalJudgement: record as unknown as Prisma.InputJsonValue },
    });
  }

  private assertEditable(consultation: { status: ConsultationStatus }) {
    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }
  }

  private checkAccess(
    consultation: { tenantId: string | null; pharmacistId: string },
    user: RequestUser,
  ) {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role === 'PHARMACIST_ADMIN' && user.tenantId && consultation.tenantId === user.tenantId) {
      return;
    }
    if (consultation.pharmacistId === user.id) return;
    throw new ForbiddenException('You do not have access to this consultation');
  }

  private async auditSafe(
    user: RequestUser,
    req: Request | undefined,
    action: string,
    consultationId: string,
    metadata: Record<string, unknown>,
  ) {
    const client = req ? getClientInfo(req) : {};
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action,
      module: 'CONSULTATIONS',
      metadata: { consultationId, ...metadata },
      ...client,
    });
  }
}

export type { PathwayClinicalJudgementRecord };

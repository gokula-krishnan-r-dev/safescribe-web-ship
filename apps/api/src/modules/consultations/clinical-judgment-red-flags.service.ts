/**
 * Clinical Judgment AI Red-Flag Check — generation, answers, confirmation.
 * Guided Pathway consultations must not use this service.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import type { Request } from 'express';
import { ConsultationMode, ConsultationStatus, Prisma } from '@prisma/client';
import {
  computeSnapshotHash,
  deriveCjRedFlagCheckDecision,
  mergeCjRedFlagAnswers,
  unansweredCjRedFlagQuestionIds,
  selectRelevantCjRedFlagCandidates,
  fallbackCjRedFlagCandidates,
  normalizeCjRedFlagAnswer,
  CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
  selectLatestLabValues,
  type CjRedFlagAnswer,
  type RetrievedRedFlagCandidate,
} from '@safescript/shared';

const CURRENT_STATUSES = [
  'GENERATING',
  'REVIEW_REQUIRED',
  'MORE_INFORMATION_REQUIRED',
  'CONFIRMED_CLEAR',
  'REFERRAL_REQUIRED',
  'GENERATION_FAILED',
] as const;

type GeneratedQuestion = {
  candidateId: string;
  question: string;
  whyItMatters: string;
  priorityRank: number;
  selectionReasonCode: string;
  severity: string;
  referralAction: string;
  ruleId: string | null;
  sourceReferences: RetrievedRedFlagCandidate['sourceReferences'];
  canonicalLabel: string;
};

@Injectable()
export class ClinicalJudgmentRedFlagsService {
  private readonly logger = new Logger(ClinicalJudgmentRedFlagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiEngine: AiEngineClient,
  ) {}

  async getCurrent(consultationId: string, user: RequestUser) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    const assessment = await this.requireConfirmedImpression(consultationId);
    const check = await this.findCurrentCheck(consultationId);

    const sourceSnapshotHash = this.buildSourceSnapshotHash(consultation, assessment);
    const workingDiagnosis = assessment.workingDiagnosisText;
    const certainty = assessment.diagnosticCertainty ?? 'PROBABLE';

    if (!check) {
      return {
        checkId: null,
        status: 'GENERATION_REQUIRED',
        sourceSnapshotHash,
        questions: [],
        manualConcerns: [],
        otherUnresolvedConcern: null,
        otherConcernDetails: null,
        rowVersion: null,
        isCurrent: true,
        workingDiagnosis: `${this.titleCase(certainty)} ${workingDiagnosis}`,
        generationMode: null,
        permissions: { canGenerate: true, canConfirm: false, canRefer: true },
      };
    }

    const stale = check.sourceSnapshotHash !== sourceSnapshotHash &&
      check.status !== 'SUPERSEDED' &&
      check.status !== 'STALE';

    if (stale && CURRENT_STATUSES.includes(check.status as (typeof CURRENT_STATUSES)[number])) {
      await this.prisma.clinicalRedFlagCheck.update({
        where: { id: check.id },
        data: { status: 'STALE' },
      });
    }

    const questions = await this.prisma.clinicalRedFlagQuestion.findMany({
      where: { redFlagCheckId: check.id },
      orderBy: { sequence: 'asc' },
    });
    const usableQuestions = questions.filter((q) => q.questionText.trim().length > 0);
    const manualConcerns = await this.prisma.clinicalRedFlagManualConcern.findMany({
      where: { redFlagCheckId: check.id },
      orderBy: { createdAt: 'asc' },
    });

    const effectiveStatus = stale ? 'STALE' : check.status;
    const emptyNeedsGeneration =
      usableQuestions.length === 0 &&
      (effectiveStatus === 'REVIEW_REQUIRED' ||
        effectiveStatus === 'GENERATION_FAILED' ||
        effectiveStatus === 'MORE_INFORMATION_REQUIRED' ||
        effectiveStatus === 'GENERATING');
    const status = emptyNeedsGeneration ? 'GENERATION_REQUIRED' : effectiveStatus;

    return {
      checkId: check.id,
      status,
      sourceSnapshotHash,
      storedSourceSnapshotHash: check.sourceSnapshotHash,
      generationMode: check.generationMode,
      questions: usableQuestions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        candidateId: q.candidateId,
        question: q.questionText,
        whyItMatters: q.whyItMatters,
        severity: q.severity,
        referralAction: q.referralAction,
        answer: normalizeCjRedFlagAnswer(q.answer),
        sourceReferences: q.sourceReferences,
        selectionReasonCode: q.selectionReasonCode,
      })),
      manualConcerns: manualConcerns.map((m) => ({
        id: m.id,
        concernText: m.concernText,
        whyItMatters: m.whyItMatters,
        responseStatus: m.responseStatus,
        referralAction: m.referralAction,
      })),
      otherUnresolvedConcern: check.otherUnresolvedConcern,
      otherConcernDetails: check.otherConcernDetails,
      finalDecision: check.finalDecision,
      rowVersion: check.rowVersion,
      isCurrent: !stale,
      workingDiagnosis: `${this.titleCase(certainty)} ${workingDiagnosis}`,
      confirmedAt: check.confirmedAt,
      permissions: {
        canGenerate: status !== 'CONFIRMED_CLEAR',
        canConfirm:
          !stale &&
          !emptyNeedsGeneration &&
          (effectiveStatus === 'REVIEW_REQUIRED' ||
            effectiveStatus === 'MORE_INFORMATION_REQUIRED'),
        canRefer: true,
      },
    };
  }

  async generate(
    consultationId: string,
    body: {
      reason?: string;
      reasonDetail?: string | null;
      expectedConsultationRowVersion?: number;
      forceManualFallback?: boolean;
    },
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    this.assertEditable(consultation);
    if (!consultation.demographics) {
      throw new UnprocessableEntityException({
        code: 'PATIENT_PROFILE_REQUIRED',
        message: 'Confirm the patient profile before generating red-flag questions',
      });
    }

    const assessment = await this.requireConfirmedImpression(consultationId);
    const sourceSnapshotHash = this.buildSourceSnapshotHash(consultation, assessment);
    const patientSnapshotId = `demo:${consultationId}:${sourceSnapshotHash.slice(-12)}`;

    const clinicalText = [
      consultation.chiefComplaint ?? '',
      assessment.workingDiagnosisText,
      assessment.assessmentSummary ?? '',
      this.demographicsText(consultation.demographics),
    ].join(' ');

    const candidates = selectRelevantCjRedFlagCandidates(clinicalText, 12);
    const inputManifest = this.buildInputManifest(consultation, assessment);

    // Supersede any current check
    const previous = await this.findCurrentCheck(consultationId);
    if (previous) {
      await this.prisma.clinicalRedFlagCheck.update({
        where: { id: previous.id },
        data: { status: 'SUPERSEDED' },
      });
    }

    let generationMode: 'AI_GOVERNED_RETRIEVAL' | 'MANUAL_FALLBACK' = 'AI_GOVERNED_RETRIEVAL';
    let questions: GeneratedQuestion[] = [];
    let model: string | null = null;
    let validationResult: Record<string, unknown> = { ok: true };

    if (body.forceManualFallback || !this.aiEngine.isAvailable) {
      generationMode = 'MANUAL_FALLBACK';
      questions = this.toGeneratedQuestions(fallbackCjRedFlagCandidates(candidates, 3));
      validationResult = { ok: true, mode: 'manual_fallback' };
    } else {
      try {
        const aiResult = await this.aiEngine.postJson<{
          status?: string;
          questions?: Array<Record<string, unknown>>;
          missingFields?: string[];
          warnings?: string[];
        }>('/api/v1/consultations/cj-red-flags', {
          schemaVersion: 'cj-red-flag-input-1.0',
          consultationContext: inputManifest.consultationContext,
          approvedCandidates: candidates.map((c) => ({
            candidateId: c.candidateId,
            canonicalLabel: c.canonicalLabel,
            criterion: c.criterion,
            questionTemplate: c.questionTemplate,
            whyItMatters: c.whyItMatters,
            severity: c.severity,
            referralAction: c.referralAction,
            ruleId: c.ruleId,
            sourceReferences: c.sourceReferences,
          })),
        });

        const validated = this.validateAiOutput(aiResult, candidates);
        if (validated.questions.length === 0) {
          generationMode = 'MANUAL_FALLBACK';
          questions = this.toGeneratedQuestions(fallbackCjRedFlagCandidates(candidates, 3));
          validationResult = {
            ok: true,
            mode: 'fallback_after_validation',
            warnings: validated.errors,
          };
        } else {
          questions = validated.questions;
          model = 'cj-red-flag-engine';
          validationResult = { ok: true, warnings: aiResult.warnings ?? [] };
        }
      } catch (err) {
        this.logger.warn(
          `CJ red-flag AI unavailable, using deterministic fallback: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        generationMode = 'MANUAL_FALLBACK';
        questions = this.toGeneratedQuestions(fallbackCjRedFlagCandidates(candidates, 3));
        validationResult = { ok: true, mode: 'ai_unavailable_fallback' };
      }
    }

    questions = this.ensureUsableQuestions(questions, candidates);

    const check = await this.prisma.clinicalRedFlagCheck.create({
      data: {
        tenantId: consultation.tenantId,
        consultationId,
        clinicalJudgmentAssessmentId: assessment.id,
        patientProfileSnapshotId: patientSnapshotId,
        status: 'REVIEW_REQUIRED',
        generationMode,
        sourceSnapshotHash,
        evidenceCollectionVersion: CJ_RED_FLAG_EVIDENCE_COLLECTION_VERSION,
        deterministicRuleSetVersion: 'cj-rules-v1',
        promptKey: generationMode === 'AI_GOVERNED_RETRIEVAL' ? 'CJ_RED_FLAG_GENERATION' : null,
        promptVersion: generationMode === 'AI_GOVERNED_RETRIEVAL' ? '1.0' : null,
        model,
        inputManifest: inputManifest as object,
        candidateManifest: candidates as object,
        validationResult: validationResult as object,
        regenerationReason: body.reason ?? 'INITIAL',
        regenerationReasonDetail: body.reasonDetail ?? null,
        questions: {
          create: questions.map((q, idx) => ({
            sequence: idx + 1,
            candidateId: q.candidateId,
            canonicalLabel: q.canonicalLabel,
            questionText: q.question.slice(0, 180),
            whyItMatters: q.whyItMatters.slice(0, 240),
            severity: q.severity,
            referralAction: q.referralAction,
            ruleId: q.ruleId,
            sourceReferences: q.sourceReferences as object,
            selectionReasonCode: q.selectionReasonCode,
          })),
        },
      },
      include: { questions: { orderBy: { sequence: 'asc' } } },
    });

    if (previous) {
      await this.prisma.clinicalRedFlagCheck.update({
        where: { id: previous.id },
        data: { supersededById: check.id },
      });
    }

    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: { currentStep: 'RED_FLAGS', stepIndex: Math.max(consultation.stepIndex, 4) },
    });

    // Clear readiness when regenerating
    await this.prisma.clinicalJudgmentAssessment.update({
      where: { consultationId },
      data: {
        unresolvedRedFlags: null,
        assessmentSufficient: null,
        readinessStatus: null,
        readinessConfirmedAt: null,
        readinessConfirmedById: null,
        redFlagCheckId: null,
      },
    });

    await this.auditSafe(user, req, 'CJ_RED_FLAG_GENERATED', consultationId, {
      checkId: check.id,
      generationMode,
      questionCount: check.questions.length,
      reason: body.reason ?? 'INITIAL',
    });

    return {
      checkId: check.id,
      status: check.status,
      questionCount: check.questions.length,
      generationMode,
      questions: check.questions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        question: q.questionText,
        whyItMatters: q.whyItMatters,
        answer: q.answer,
        sourceReferences: q.sourceReferences,
      })),
      sourceSnapshotHash,
      rowVersion: check.rowVersion,
    };
  }

  async saveAnswer(
    consultationId: string,
    checkId: string,
    questionId: string,
    body: { answer: CjRedFlagAnswer; answerNotes?: string | null; expectedCheckRowVersion?: number },
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    this.assertEditable(consultation);
    await this.requireEditableCheck(consultationId, checkId);

    if (!['NO', 'YES'].includes(body.answer)) {
      throw new BadRequestException('Invalid answer');
    }

    const question = await this.prisma.clinicalRedFlagQuestion.findFirst({
      where: { id: questionId, redFlagCheckId: checkId },
    });
    if (!question) throw new NotFoundException('Question not found');

    // Answer clicks must not bump rowVersion — pharmacists answer several
    // questions quickly, and optimistic concurrency on each click dropped saves.
    await this.prisma.clinicalRedFlagQuestion.update({
      where: { id: questionId },
      data: {
        answer: body.answer,
        answerNotes: body.answerNotes?.trim() || null,
        answeredById: user.id,
        answeredAt: new Date(),
      },
    });

    await this.prisma.clinicalRedFlagCheck.update({
      where: { id: checkId },
      data: { status: 'REVIEW_REQUIRED' },
    });

    await this.auditSafe(user, req, 'CJ_RED_FLAG_ANSWER_SAVED', consultationId, {
      checkId,
      questionId,
      answer: body.answer,
    });

    return this.getCurrent(consultationId, user);
  }

  async saveAttestation(
    consultationId: string,
    checkId: string,
    body: {
      otherUnresolvedConcern: boolean;
      otherConcernDetails?: string | null;
      expectedCheckRowVersion?: number;
    },
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    this.assertEditable(consultation);
    await this.requireEditableCheck(consultationId, checkId);

    if (body.otherUnresolvedConcern && !(body.otherConcernDetails ?? '').trim()) {
      throw new UnprocessableEntityException({
        code: 'OTHER_CONCERN_DETAIL_REQUIRED',
        message: 'Describe the unresolved concern',
      });
    }

    await this.prisma.clinicalRedFlagCheck.update({
      where: { id: checkId },
      data: {
        otherUnresolvedConcern: body.otherUnresolvedConcern,
        otherConcernDetails: body.otherUnresolvedConcern
          ? (body.otherConcernDetails ?? '').trim()
          : null,
      },
    });

    await this.auditSafe(user, req, 'CJ_RED_FLAG_ATTESTATION_SAVED', consultationId, {
      checkId,
      otherUnresolvedConcern: body.otherUnresolvedConcern,
    });

    return this.getCurrent(consultationId, user);
  }

  async addConcern(
    consultationId: string,
    checkId: string,
    body: {
      concernText: string;
      whyItMatters?: string | null;
      responseStatus?: string;
      referralAction?: string | null;
    },
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    this.assertEditable(consultation);
    await this.requireEditableCheck(consultationId, checkId);

    const text = (body.concernText ?? '').trim();
    if (text.length < 3) {
      throw new BadRequestException('Concern text is required');
    }

    const concern = await this.prisma.clinicalRedFlagManualConcern.create({
      data: {
        redFlagCheckId: checkId,
        concernText: text.slice(0, 2000),
        whyItMatters: body.whyItMatters?.trim() || null,
        responseStatus: body.responseStatus ?? 'UNRESOLVED',
        referralAction: body.referralAction ?? 'PROMPT_ASSESSMENT',
        createdById: user.id,
      },
    });

    await this.auditSafe(user, req, 'CJ_RED_FLAG_CONCERN_ADDED', consultationId, {
      checkId,
      concernId: concern.id,
    });

    return this.getCurrent(consultationId, user);
  }

  async confirm(
    consultationId: string,
    checkId: string,
    body: {
      otherUnresolvedConcern: boolean;
      otherConcernDetails?: string | null;
      expectedCheckRowVersion?: number;
      expectedSourceSnapshotHash?: string;
      answers?: Array<{ questionId: string; answer: CjRedFlagAnswer }>;
    },
    user: RequestUser,
    req?: Request,
  ) {
    const consultation = await this.requireClinicalJudgment(consultationId, user);
    this.assertEditable(consultation);
    const assessment = await this.requireConfirmedImpression(consultationId);
    const check = await this.requireEditableCheck(consultationId, checkId);

    const sourceSnapshotHash = this.buildSourceSnapshotHash(consultation, assessment);
    if (check.sourceSnapshotHash !== sourceSnapshotHash) {
      throw new ConflictException({
        code: 'RED_FLAG_CHECK_STALE',
        message:
          'Clinical or patient information changed. Regenerate red-flag questions before confirming.',
        nextRoute: 'red-flags',
      });
    }
    if (
      body.expectedSourceSnapshotHash &&
      body.expectedSourceSnapshotHash !== sourceSnapshotHash
    ) {
      throw new ConflictException({
        code: 'RED_FLAG_CHECK_STALE',
        message: 'Source snapshot changed. Regenerate red-flag questions.',
      });
    }
    // Confirm payload is the source of truth. Skip rowVersion when answers are
    // included so a stale cache after sequential clicks cannot block continue.
    if (
      !(body.answers && body.answers.length > 0) &&
      body.expectedCheckRowVersion != null &&
      body.expectedCheckRowVersion !== check.rowVersion
    ) {
      throw new ConflictException({
        code: 'CHECK_VERSION_CONFLICT',
        message: 'Red-flag check was updated elsewhere. Reload and try again.',
      });
    }

    const storedQuestions = await this.prisma.clinicalRedFlagQuestion.findMany({
      where: { redFlagCheckId: checkId },
      orderBy: { sequence: 'asc' },
    });
    const usableStored = storedQuestions.filter((q) => q.questionText.trim().length > 0);
    if (usableStored.length === 0) {
      throw new UnprocessableEntityException({
        code: 'RED_FLAG_QUESTIONS_REQUIRED',
        message: 'Generate at least one red-flag question before confirming',
      });
    }
    const questions = mergeCjRedFlagAnswers(
      usableStored.map((q) => ({
        ...q,
        answer: normalizeCjRedFlagAnswer(q.answer),
      })),
      body.answers,
    );
    const manualConcerns = await this.prisma.clinicalRedFlagManualConcern.findMany({
      where: { redFlagCheckId: checkId },
    });

    const answeredAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const q of questions) {
        const previous = storedQuestions.find((s) => s.id === q.id);
        if (q.answer == null || q.answer === previous?.answer) continue;
        await tx.clinicalRedFlagQuestion.update({
          where: { id: q.id },
          data: {
            answer: q.answer,
            answeredById: user.id,
            answeredAt,
          },
        });
      }
      await tx.clinicalRedFlagCheck.update({
        where: { id: checkId },
        data: {
          otherUnresolvedConcern: body.otherUnresolvedConcern,
          otherConcernDetails: body.otherUnresolvedConcern
            ? (body.otherConcernDetails ?? '').trim() || null
            : null,
        },
      });
    });

    const decision = deriveCjRedFlagCheckDecision({
      questions,
      otherUnresolvedConcern: body.otherUnresolvedConcern,
      unresolvedManualConcerns: manualConcerns.some(
        (m) => m.responseStatus === 'UNRESOLVED',
      ),
    });

    if (decision === 'INCOMPLETE') {
      const unanswered = unansweredCjRedFlagQuestionIds(questions);
      throw new UnprocessableEntityException({
        code: 'RED_FLAG_CHECK_INCOMPLETE',
        message: 'Answer all questions and the final attestation before continuing',
        unansweredQuestionIds: unanswered,
      });
    }

    if (decision === 'MORE_INFORMATION_REQUIRED') {
      await this.prisma.clinicalRedFlagCheck.update({
        where: { id: checkId },
        data: {
          status: 'MORE_INFORMATION_REQUIRED',
          finalDecision: decision,
          rowVersion: { increment: 1 },
        },
      });
      await this.prisma.clinicalJudgmentAssessment.update({
        where: { consultationId },
        data: { unresolvedRedFlags: null, redFlagCheckId: checkId },
      });
      return {
        decision,
        workflowState: 'RED_FLAG_MORE_INFORMATION_REQUIRED',
        blockingQuestions: unansweredCjRedFlagQuestionIds(questions),
        nextRoute: 'red-flags',
      };
    }

    if (decision === 'DOCUMENTATION_REFERRAL') {
      const highest = this.highestReferralAction(questions);
      await this.prisma.clinicalRedFlagCheck.update({
        where: { id: checkId },
        data: {
          status: 'REFERRAL_REQUIRED',
          finalDecision: decision,
          confirmedById: user.id,
          confirmedAt: new Date(),
          rowVersion: { increment: 1 },
        },
      });
      await this.prisma.clinicalJudgmentAssessment.update({
        where: { consultationId },
        data: {
          unresolvedRedFlags: true,
          redFlagCheckId: checkId,
          assessmentSufficient: null,
          readinessStatus: null,
        },
      });

      const existingRf = (consultation.redFlags ?? {}) as Record<string, unknown>;
      await this.prisma.consultation.update({
        where: { id: consultationId },
        data: {
          consultationMode: ConsultationMode.DOCUMENTATION_REFERRAL,
          originMode: ConsultationMode.CLINICAL_JUDGMENT,
          currentStep: 'DOCUMENTATION',
          stepIndex: Math.max(consultation.stepIndex, 8),
          redFlags: {
            ...existingRf,
            referralSelected: true,
            referralCompleted: false,
            source: 'clinical_judgment_ai_red_flags',
            checkId,
            referralAction: highest,
          } as object,
        },
      });

      await this.auditSafe(user, req, 'CJ_RED_FLAG_REFERRAL', consultationId, {
        checkId,
        referralAction: highest,
      });

      return {
        decision,
        workflowState: 'DOCUMENTATION_REFERRAL',
        referralAction: highest,
        nextRoute: 'referral',
      };
    }

    // READY_FOR_PRESCRIBING_READINESS
    await this.prisma.clinicalRedFlagCheck.update({
      where: { id: checkId },
      data: {
        status: 'CONFIRMED_CLEAR',
        finalDecision: decision,
        confirmedById: user.id,
        confirmedAt: new Date(),
        rowVersion: { increment: 1 },
      },
    });
    await this.prisma.clinicalJudgmentAssessment.update({
      where: { consultationId },
      data: {
        unresolvedRedFlags: false,
        redFlagCheckId: checkId,
      },
    });
    await this.prisma.consultation.update({
      where: { id: consultationId },
      data: {
        currentStep: 'PRESCRIBING_READINESS',
        stepIndex: Math.max(consultation.stepIndex, 5),
        redFlags: {
          hasRedFlags: false,
          overallRisk: 'low',
          redFlags: [],
          summary: 'Red-flag review confirmed clear',
          allAcknowledged: true,
          referralSelected: false,
          source: 'clinical_judgment_ai_red_flags',
          checkId,
          acknowledgments: questions.map((q, i) => ({
            flagIndex: i,
            flagId: q.candidateId,
            flag: q.questionText,
            answer: 'no',
            action: 'clear',
            acknowledgedAt: new Date().toISOString(),
          })),
        } as object,
      },
    });

    await this.auditSafe(user, req, 'CJ_RED_FLAG_CONFIRMED_CLEAR', consultationId, {
      checkId,
      questionCount: questions.length,
    });

    return {
      decision,
      workflowState: 'PRESCRIBING_READINESS_REQUIRED',
      nextRoute: 'prescribing-readiness',
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private toGeneratedQuestions(
    candidates: RetrievedRedFlagCandidate[],
  ): GeneratedQuestion[] {
    return candidates.map((c, idx) => ({
      candidateId: c.candidateId,
      question: c.questionTemplate,
      whyItMatters: c.whyItMatters,
      priorityRank: idx + 1,
      selectionReasonCode: 'DISPOSITION_CHANGING',
      severity: c.severity,
      referralAction: c.referralAction,
      ruleId: c.ruleId,
      sourceReferences: c.sourceReferences,
      canonicalLabel: c.canonicalLabel,
    }));
  }

  private ensureUsableQuestions(
    questions: GeneratedQuestion[],
    candidates: RetrievedRedFlagCandidate[],
  ): GeneratedQuestion[] {
    const usable = questions.filter(
      (q) => q.question.trim().length > 0 && q.whyItMatters.trim().length > 0,
    );
    if (usable.length > 0) return usable.slice(0, 3);
    const fallback = this.toGeneratedQuestions(fallbackCjRedFlagCandidates(candidates, 3)).filter(
      (q) => q.question.trim().length > 0,
    );
    if (fallback.length === 0) {
      throw new InternalServerErrorException(
        'Could not generate red-flag questions. Try again.',
      );
    }
    return fallback;
  }

  private validateAiOutput(
    raw: {
      status?: string;
      questions?: Array<Record<string, unknown>>;
    },
    candidates: RetrievedRedFlagCandidate[],
  ): { ok: boolean; questions: GeneratedQuestion[]; errors: string[] } {
    const errors: string[] = [];
    const byId = new Map(candidates.map((c) => [c.candidateId, c]));
    const list = Array.isArray(raw.questions) ? raw.questions : [];
    if (list.length > 3) errors.push('too_many_questions');

    const seen = new Set<string>();
    const out: GeneratedQuestion[] = [];
    for (let i = 0; i < Math.min(list.length, 3); i++) {
      const q = list[i];
      const candidateId = String(q.candidateId ?? '');
      const candidate = byId.get(candidateId);
      if (!candidate) {
        errors.push(`unknown_candidate:${candidateId}`);
        continue;
      }
      if (seen.has(candidateId)) {
        errors.push(`duplicate:${candidateId}`);
        continue;
      }
      seen.add(candidateId);
      const question =
        String(q.question ?? '').trim() || candidate.questionTemplate.trim();
      const why =
        String(q.whyItMatters ?? '').trim() || candidate.whyItMatters.trim();
      if (!question || !why) {
        errors.push(`missing_fields:${candidateId}`);
        continue;
      }
      out.push({
        candidateId,
        question,
        whyItMatters: why,
        priorityRank: i + 1,
        selectionReasonCode: String(q.selectionReasonCode ?? 'DISPOSITION_CHANGING'),
        severity: candidate.severity,
        referralAction: candidate.referralAction,
        ruleId: candidate.ruleId,
        sourceReferences: candidate.sourceReferences,
        canonicalLabel: candidate.canonicalLabel,
      });
    }

    return { ok: errors.length === 0 && out.length > 0, questions: out, errors };
  }

  private highestReferralAction(
    questions: Array<{ answer: string | null; referralAction: string }>,
  ): string {
    const rank: Record<string, number> = {
      EMERGENCY: 0,
      URGENT_SAME_DAY: 1,
      PROMPT_ASSESSMENT: 2,
      ROUTINE_REFERRAL: 3,
      OBTAIN_MORE_INFORMATION: 4,
    };
    const yes = questions.filter((q) => q.answer === 'YES');
    if (!yes.length) return 'PROMPT_ASSESSMENT';
    return [...yes].sort(
      (a, b) => (rank[a.referralAction] ?? 9) - (rank[b.referralAction] ?? 9),
    )[0].referralAction;
  }

  private buildSourceSnapshotHash(
    consultation: {
      id: string;
      chiefComplaint: string | null;
      demographics: unknown;
    },
    assessment: {
      workingDiagnosisText: string;
      diagnosticCertainty: string | null;
      assessmentSummary: string | null;
      sourceSnapshotHash: string | null;
    },
  ): string {
    return computeSnapshotHash({
      consultationId: consultation.id,
      chiefComplaint: consultation.chiefComplaint ?? '',
      diagnosis: assessment.workingDiagnosisText,
      certainty: assessment.diagnosticCertainty ?? '',
      summary: assessment.assessmentSummary ?? '',
      impressionHash: assessment.sourceSnapshotHash ?? '',
      demographics: consultation.demographics ?? null,
      workflow: 'cj-red-flag-v1',
    });
  }

  private buildInputManifest(
    consultation: {
      chiefComplaint: string | null;
      demographics: unknown;
    },
    assessment: {
      workingDiagnosisText: string;
      diagnosticCertainty: string | null;
      assessmentSummary: string | null;
    },
  ) {
    const demo = (consultation.demographics ?? {}) as Record<string, unknown>;
    const ageYears = Number(demo.age ?? demo.ageYears ?? 0) || 0;
    return {
      consultationContext: {
        jurisdiction: String(demo.province ?? demo.jurisdiction ?? 'AB'),
        presentingConcern: consultation.chiefComplaint ?? '',
        workingDiagnosis: assessment.workingDiagnosisText,
        diagnosticCertainty: assessment.diagnosticCertainty ?? 'PROBABLE',
        assessmentSummary: assessment.assessmentSummary ?? '',
        relevantFindings: [],
        ageYears,
        sexClinical: demo.sex ?? demo.sexAtBirth ?? null,
        pregnancyStatus: demo.pregnancyStatus ?? demo.pregnancyAnswer ?? null,
        lactationStatus: demo.breastfeedingStatus ?? demo.breastfeedingAnswer ?? null,
        weightKg: demo.weightKg ?? demo.weight ?? null,
        allergies: demo.allergies ?? demo.allergyEntries ?? [],
        medications: demo.currentMedications ?? demo.medicationEntries ?? [],
        medicalConditions: demo.medicalConditions ?? [],
        renal: demo.renalFunction ?? null,
        hepatic: demo.hepaticFunction ?? null,
        labs: selectLatestLabValues(
          Array.isArray(demo.extractedLabValues)
            ? (demo.extractedLabValues as Array<{ test: string; value: string; unit?: string }>)
            : [],
        ),
        vitals: [],
        previouslyConfirmedFacts: [],
        unresolvedInformation: [],
      },
    };
  }

  private demographicsText(demographics: unknown): string {
    if (!demographics || typeof demographics !== 'object') return '';
    const d = demographics as Record<string, unknown>;
    return [
      d.pregnancyStatus,
      d.medicalConditions,
      d.allergies,
      d.currentMedications,
    ]
      .filter(Boolean)
      .map(String)
      .join(' ');
  }

  private titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  private async findCurrentCheck(consultationId: string) {
    return this.prisma.clinicalRedFlagCheck.findFirst({
      where: {
        consultationId,
        status: { in: [...CURRENT_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async requireEditableCheck(consultationId: string, checkId: string) {
    const check = await this.prisma.clinicalRedFlagCheck.findFirst({
      where: { id: checkId, consultationId },
    });
    if (!check) throw new NotFoundException('Red-flag check not found');
    if (
      check.status === 'SUPERSEDED' ||
      check.status === 'STALE' ||
      check.status === 'CONFIRMED_CLEAR' ||
      check.status === 'REFERRAL_REQUIRED'
    ) {
      throw new BadRequestException('This red-flag check can no longer be edited');
    }
    return check;
  }

  private async requireConfirmedImpression(consultationId: string) {
    const assessment = await this.prisma.clinicalJudgmentAssessment.findUnique({
      where: { consultationId },
    });
    if (!assessment?.impressionConfirmedAt) {
      throw new UnprocessableEntityException({
        code: 'CLINICAL_IMPRESSION_REQUIRED',
        message: 'Confirm clinical impression before red-flag review',
      });
    }
    return assessment;
  }

  private async requireClinicalJudgment(id: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
    this.checkAccess(consultation, user);
    if (consultation.consultationMode !== ConsultationMode.CLINICAL_JUDGMENT) {
      throw new BadRequestException(
        'Red-Flag Check is only available for Clinical Judgment consultations',
      );
    }
    return consultation;
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

  private assertEditable(consultation: { status: ConsultationStatus }) {
    if (consultation.status === ConsultationStatus.COMPLETED) {
      throw new BadRequestException('This consultation is completed and cannot be edited');
    }
  }

  private async auditSafe(
    user: RequestUser,
    req: Request | undefined,
    action: string,
    consultationId: string,
    newValue: Record<string, unknown>,
  ) {
    try {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action,
        module: 'CONSULTATIONS',
        newValue: { consultationId, ...newValue },
        ipAddress: req?.ip ?? '',
        userAgent: req?.headers?.['user-agent'] ?? '',
      });
    } catch (err) {
      this.logger.warn(`Audit failed for ${action}: ${err}`);
    }
  }
}

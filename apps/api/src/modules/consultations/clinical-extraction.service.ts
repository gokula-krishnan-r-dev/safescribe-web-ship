import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsultationStatus } from '@prisma/client';
import OpenAI from 'openai';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import {
  carryForwardFromExtraction,
  clinicallyFilterPresentingConcern,
  CLINICAL_EXTRACTION_PROMPT,
  CLINICAL_EXTRACTION_REPAIR_PROMPT,
  extractClinicalNoteLocal,
  hashConsultationNote,
  mergeConsultationIntake,
  parseSpeakerTurns,
  readConsultationIntake,
  renderConsultationNote,
  resolveRewrittenConsultationNote,
  sanitizeClinicalExtraction,
  sanitizeStructuredClinicalExtraction,
  structuredExtractionHasContent,
  structuredToClinicalResult,
  type ConsultationIntakePayload,
  type IntakeCaptureMode,
  type StructuredClinicalExtraction,
} from '@safescript/shared';

export { CLINICAL_EXTRACTION_PROMPT } from '@safescript/shared';

@Injectable()
export class ClinicalExtractionService {
  private readonly logger = new Logger(ClinicalExtractionService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY') || '';
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async extract(
    id: string,
    user: RequestUser,
    body: {
      transcript?: string;
      presentingConcern?: string;
      captureMode?: IntakeCaptureMode;
      rewriteNote?: boolean;
    },
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    this.assertEditable(consultation);

    const transcript = (body.transcript ?? consultation.transcript ?? '').trim();
    const presentingConcern = (body.presentingConcern ?? consultation.chiefComplaint ?? '').trim();
    const captureMode = body.captureMode ?? 'conversation';
    const rewriteNote = body.rewriteNote !== false && captureMode !== 'type';

    if (!transcript && !presentingConcern) {
      throw new BadRequestException(
        'Add a presenting concern or consultation notes before extracting.',
      );
    }

    await this.auditSafe(user, req, 'CLINICAL_EXTRACTION_STARTED', id, { captureMode });

    const filteredPharmacistConcern = clinicallyFilterPresentingConcern(presentingConcern);
    const localResult = extractClinicalNoteLocal(transcript || presentingConcern, {
      presentingConcern: filteredPharmacistConcern || undefined,
      mode: captureMode,
    });
    let result = localResult;
    let structured: StructuredClinicalExtraction | null = null;
    let usedModel = 'local';

    if (this.openai && transcript) {
      try {
        const llmParsed = await this.extractWithLlm({
          transcript,
          presentingConcern: filteredPharmacistConcern || presentingConcern,
          captureMode,
        });
        const structuredCandidate = sanitizeStructuredClinicalExtraction(llmParsed);
        if (structuredCandidate && structuredExtractionHasContent(structuredCandidate)) {
          structured = structuredCandidate;
          result = structuredToClinicalResult(structuredCandidate);
          usedModel = this.resolveModel();
        } else {
          const legacy = sanitizeClinicalExtraction(llmParsed);
          // Never copy unfiltered pharmacist text into the note when the model omitted a summary.
          if (!legacy.presentingConcern?.text && filteredPharmacistConcern) {
            legacy.presentingConcern = { text: filteredPharmacistConcern };
          }
          const llmHasContent =
            Boolean(legacy.presentingConcern?.text) ||
            legacy.relevantClinicalInformation.length > 0;
          if (llmHasContent) {
            result = legacy;
            usedModel = this.resolveModel();
          } else {
            this.logger.warn(
              'Clinical extraction LLM returned empty content; using local extractor',
            );
          }
        }
      } catch (err) {
        this.logger.warn('Clinical extraction LLM failed; using local extractor', err);
        await this.auditSafe(user, req, 'CLINICAL_EXTRACTION_FAILED', id, {
          fallback: 'local',
        });
      }
    }

    // Prefer clinically filtered pharmacist concern only when extraction has no summary.
    if (!result.presentingConcern?.text && filteredPharmacistConcern) {
      result = {
        ...result,
        presentingConcern: { text: filteredPharmacistConcern },
      };
    }

    const rendered = renderConsultationNote(result);
    const previous = readConsultationIntake(consultation.aiAnalysis);
    const nextNote = resolveRewrittenConsultationNote({
      rewriteNote,
      sourceTranscript: transcript,
      renderedPlainText: rendered.plainText,
      itemCount: rendered.items.length,
      previousNote: consultation.transcript,
    });
    const resolvedConcern =
      rendered.presentingConcern || filteredPharmacistConcern || presentingConcern;
    const noteHash = hashConsultationNote({
      presentingConcern: resolvedConcern,
      noteBody: nextNote,
      items: rendered.items,
    });
    const turns =
      captureMode === 'conversation' ? parseSpeakerTurns(transcript) : previous.temporaryTranscriptTurns;
    const intake: ConsultationIntakePayload = {
      ...previous,
      captureMode,
      noteReviewStatus: nextNote.trim() ? 'review_required' : 'draft',
      approvedAt: undefined,
      approvedBy: undefined,
      approvedNoteHash: undefined,
      structuredNote: {
        presentingConcern: resolvedConcern || undefined,
        relevantClinicalInformation: rendered.items,
      },
      carryForwardCandidates: carryForwardFromExtraction(result),
      hasTemporaryTranscript:
        (captureMode === 'conversation' || captureMode === 'dictation') && Boolean(transcript),
      temporaryTranscriptTurns: captureMode === 'conversation' ? turns : undefined,
      transcriptDeletedAt: null,
      extractionStatus: result.extractionStatus,
      lastExtractedAt: new Date().toISOString(),
      ...(structured
        ? {
            // Short QA labels only — never detailed non-clinical conversation.
            excludedNonclinical: structured.excluded_nonclinical.slice(0, 12),
          }
        : {}),
    };

    const updated = await this.prisma.consultation.update({
      where: { id },
      data: {
        transcript: rewriteNote ? nextNote : consultation.transcript,
        chiefComplaint: resolvedConcern || consultation.chiefComplaint,
        rawTranscript:
          captureMode === 'type'
            ? consultation.rawTranscript
            : transcript || consultation.rawTranscript,
        aiAnalysis: mergeConsultationIntake(consultation.aiAnalysis, intake) as object,
      },
    });

    await this.auditSafe(user, req, 'CLINICAL_EXTRACTION_COMPLETED', id, {
      captureMode,
      usedModel,
      extractionStatus: result.extractionStatus,
    });
    await this.auditSafe(user, req, 'CONSULTATION_NOTE_GENERATED', id, {
      noteHash,
      rewriteNote,
    });

    return {
      extraction: result,
      rendered,
      intake,
      transcript: updated.transcript,
      sourceTranscript: transcript,
      chiefComplaint: updated.chiefComplaint,
      hasTemporaryTranscript: intake.hasTemporaryTranscript,
    };
  }

  async approve(
    id: string,
    user: RequestUser,
    body: {
      presentingConcern?: string;
      transcript?: string;
      captureMode?: IntakeCaptureMode;
    },
    req?: Request,
  ) {
    const consultation = await this.findOrThrow(id);
    this.checkAccess(consultation, user);
    this.assertEditable(consultation);

    const presentingConcern = (
      body.presentingConcern ??
      consultation.chiefComplaint ??
      ''
    ).trim();
    const transcript = (body.transcript ?? consultation.transcript ?? '').trim();
    if (!presentingConcern && !transcript) {
      throw new BadRequestException(
        'Review a consultation note before approving.',
      );
    }

    const previous = readConsultationIntake(consultation.aiAnalysis);
    const items = previous.structuredNote?.relevantClinicalInformation ?? [];
    const noteHash = hashConsultationNote({
      presentingConcern,
      noteBody: transcript,
      items,
    });
    const hadTemporaryTranscript =
      previous.hasTemporaryTranscript || Boolean(consultation.rawTranscript);
    const now = new Date().toISOString();

    const intake: ConsultationIntakePayload = {
      ...previous,
      captureMode: body.captureMode ?? previous.captureMode,
      noteReviewStatus: 'approved',
      approvedAt: now,
      approvedBy: user.id,
      approvedNoteHash: noteHash,
      structuredNote: {
        presentingConcern: presentingConcern || previous.structuredNote?.presentingConcern,
        relevantClinicalInformation: items,
      },
      hasTemporaryTranscript: false,
      temporaryTranscriptTurns: undefined,
      transcriptDeletedAt: hadTemporaryTranscript ? now : previous.transcriptDeletedAt ?? null,
    };

    const existingEntities =
      consultation.aiEntities && typeof consultation.aiEntities === 'object'
        ? (consultation.aiEntities as Record<string, unknown>)
        : {};
    const carry = intake.carryForwardCandidates ?? [];

    await this.prisma.consultation.update({
      where: { id },
      data: {
        transcript,
        chiefComplaint: presentingConcern || consultation.chiefComplaint,
        rawTranscript: null,
        aiAnalysis: mergeConsultationIntake(consultation.aiAnalysis, intake) as object,
        aiEntities: {
          ...existingEntities,
          chiefComplaint: presentingConcern || existingEntities.chiefComplaint,
          allergies: carry
            .filter((c) => c.type === 'allergy')
            .map((c) => ({ allergen: c.displayText, confidence: 80 })),
          medications: carry
            .filter((c) => c.type === 'medication')
            .map((c) => ({ name: c.displayText, confidence: 80 })),
          conditions: carry
            .filter((c) => c.type === 'condition')
            .map((c) => ({ condition: c.displayText, confidence: 80 })),
        } as object,
      },
    });

    if (hadTemporaryTranscript) {
      await this.auditSafe(user, req, 'TEMP_TRANSCRIPT_DELETION_STARTED', id, {});
      await this.auditSafe(user, req, 'TEMP_TRANSCRIPT_DELETED', id, {});
    }
    await this.auditSafe(user, req, 'CONSULTATION_NOTE_APPROVED', id, {
      noteHash,
      approvedAt: now,
    });

    return {
      intake,
      transcriptDeleted: hadTemporaryTranscript,
      approvedAt: now,
      approvedBy: user.id,
    };
  }

  private resolveModel(): string {
    return this.aiConfig.getSettings().openaiModel || 'gpt-4.1-mini';
  }

  private resolvePrompt(): string {
    return this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.CLINICAL_NOTE_EXTRACTION,
      CLINICAL_EXTRACTION_PROMPT,
    );
  }

  private buildExtractionUserMessage(input: {
    transcript: string;
    presentingConcern: string;
    captureMode: IntakeCaptureMode;
  }): string {
    return [
      input.captureMode === 'dictation'
        ? 'This is intentional pharmacist dictation. Remove filler/repetition but do not aggressively drop clinical phrasing. Extract structured clinical facts only — do not summarize the transcript or write a consultation note.'
        : 'This is a pharmacist–patient conversation. Extract structured clinical facts only — do not summarize the transcript or write a consultation note.',
      input.presentingConcern
        ? `Optional pharmacist-entered presenting concern:\n${input.presentingConcern}`
        : '',
      `Consultation transcript:\n${input.transcript.slice(0, 14000)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /**
   * Call the LLM for structured clinical extraction. Retry once with a repair prompt
   * when the first response is not valid JSON / schema.
   */
  private async extractWithLlm(input: {
    transcript: string;
    presentingConcern: string;
    captureMode: IntakeCaptureMode;
  }): Promise<unknown> {
    if (!this.openai) {
      throw new Error('Language model client is not configured');
    }

    const model = this.resolveModel();
    const system = this.resolvePrompt();
    const userContent = this.buildExtractionUserMessage(input);

    const first = await this.openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 2500,
    });

    const firstRaw = first.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(firstRaw) as unknown;
      const structured = sanitizeStructuredClinicalExtraction(parsed);
      if (structured) return parsed;
      // Accept legacy schema payloads via sanitizeClinicalExtraction downstream.
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through to repair
    }

    const repair = await this.openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
        { role: 'assistant', content: firstRaw },
        { role: 'user', content: CLINICAL_EXTRACTION_REPAIR_PROMPT },
      ],
      max_completion_tokens: 2500,
    });

    return JSON.parse(repair.choices[0]?.message?.content || '{}') as unknown;
  }

  private async findOrThrow(id: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id } });
    if (!consultation) throw new NotFoundException('Consultation not found');
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
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId,
        action,
        module: 'consultations',
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        metadata: { consultationId, ...metadata },
      });
    } catch (err) {
      this.logger.warn(`Audit ${action} failed`, err);
    }
  }
}

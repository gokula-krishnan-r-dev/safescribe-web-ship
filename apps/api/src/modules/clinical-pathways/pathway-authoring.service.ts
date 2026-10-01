/**
 * Staged Clinical Pathway Authoring Pipeline
 *
 * Upload → Classify + Overlap → Admin Document Review
 *   → Concept Extraction + Normalization → Pathway Generation
 *   → Clinical Admin Review → Publish
 *
 * Clinical concepts are persisted so regeneration can skip PDF re-reads.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PathwayStatus,
  PathwayPipelineStage,
  DocumentRole,
  ClinicalDocumentType,
  ClinicalConceptCategory,
  QuestionStatus,
  Prisma,
} from '@prisma/client';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { DocumentExtractorService } from './document-extractor.service';
import { AiEngineClient, type ClinicalConceptDto } from './ai-engine.client';
import { AiPipelineService, type ExtractedKnowledge } from './ai-pipeline.service';
import { AuditService } from '@/modules/audit/audit.service';
import { MAX_CLINICAL_CONCEPTS, selectTopConcepts } from './concept-priority';
import { Request } from 'express';
import { RequestUser } from '@/common/decorators/auth.decorator';
import {
  parseRenalDosingRulesJson,
  resolveGuidanceSection,
  resolveGuidanceType,
  detectLegacyTwoSectionImport,
  parsePresentationReviewState,
} from '@safescript/shared';
import {
  normalizeQuestionType,
  normalizeRuleAction,
  normalizeRuleOperator,
  normalizeRuleSeverity,
  normalizeMedicationName,
  normalizeTreatmentCategory,
  normalizeStringArray,
  normalizeCounsellingPoint,
  normalizeRedFlagAction,
  normalizeFollowupItem,
  normalizeSectionName,
  normalizeQuestionText,
  normalizeRecommendationLevel,
} from './normalize-extracted';
import { parseQuestionScript, type ScriptImportSection } from './script-import.parser';
import {
  type ChatGptImportTarget,
  parseConceptsScript,
  parseCounsellingScript,
  parseDifferentialsScript,
  parseOverviewScript,
  parseRedFlagsScript,
  parseRulesScript,
  parseTreatmentsScript,
} from './chatgpt-import.parser';

const VALID_DOC_TYPES = new Set(Object.values(ClinicalDocumentType));
const VALID_ROLES = new Set(Object.values(DocumentRole));
const VALID_CONCEPT_CATEGORIES = new Set(Object.values(ClinicalConceptCategory));

@Injectable()
export class PathwayAuthoringService {
  private readonly logger = new Logger(PathwayAuthoringService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private aiPipeline: AiPipelineService,
    private extractor: DocumentExtractorService,
    private aiEngine: AiEngineClient,
    private config: ConfigService,
  ) {}

  private getClientInfo(req: Request) {
    return {
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
  }

  // ─── Step 1–3: Upload → parse → classify → overlap → pause ────────────────

  async processUploadedDocuments(
    pathwayId: string,
    files: Express.Multer.File[],
    user: RequestUser,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    const uploadsDir = this.config.get('UPLOAD_DIR', './uploads');
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

    const documents: { id: string; buffer: Buffer; file: Express.Multer.File }[] = [];

    for (const file of files) {
      if (!file.buffer?.length) {
        throw new BadRequestException(`File "${file.originalname}" appears to be empty`);
      }

      const ext = extname(file.originalname) || '.bin';
      const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      const storedPath = join(uploadsDir, storedName);
      writeFileSync(storedPath, file.buffer);

      const document = await this.prisma.clinicalDocument.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          fileName: file.originalname,
          fileUrl: `/uploads/${storedName}`,
          fileSize: file.size,
          mimeType: file.mimetype || 'application/octet-stream',
          processingStatus: 'PROCESSING',
        },
      });

      documents.push({ id: document.id, buffer: file.buffer, file });
    }

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        status: PathwayStatus.AI_PROCESSING,
        pipelineStage: PathwayPipelineStage.CLASSIFYING,
        clinicallyReviewedAt: null,
        clinicallyReviewedById: null,
      },
    });

    const docIds = documents.map((d) => d.id);
    this.runClassificationPipeline(pathwayId, documents, user).catch((error) =>
      this.logger.error(`Classification pipeline failed for pathway: ${pathwayId}`, error),
    );

    return {
      documents: docIds.map((id) => ({ documentId: id, status: 'PROCESSING' })),
      status: 'PROCESSING',
      pipelineStage: PathwayPipelineStage.CLASSIFYING,
    };
  }

  /** Re-run classification on existing stored documents (full reparse). */
  async reclassifyExistingDocuments(pathwayId: string, user: RequestUser) {
    await this.findPathwayOrThrow(pathwayId, user);

    const storedDocs = await this.prisma.clinicalDocument.findMany({
      where: { pathwayId },
      orderBy: { uploadedAt: 'asc' },
    });

    if (!storedDocs.length) {
      throw new BadRequestException('Please upload a document first');
    }

    const documents = storedDocs.map((document) => {
      const buffer = this.readStoredDocumentBuffer(document.fileUrl);
      if (!buffer?.length) {
        throw new BadRequestException(
          `Stored file for "${document.fileName}" is missing. Please re-upload the document.`,
        );
      }
      return {
        id: document.id,
        buffer,
        file: {
          originalname: document.fileName,
          mimetype: document.mimeType,
        } as Express.Multer.File,
      };
    });

    await this.prisma.clinicalDocument.updateMany({
      where: { pathwayId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null,
        roleConfirmed: false,
        role: null,
        aiSuggestedRole: null,
        processedAt: null,
      },
    });

    await this.prisma.clinicalDocumentChunk.deleteMany({
      where: { documentId: { in: storedDocs.map((d) => d.id) } },
    });
    await this.prisma.clinicalDocumentOverlap.deleteMany({ where: { pathwayId } });
    await this.prisma.clinicalConceptSource.deleteMany({
      where: { concept: { pathwayId } },
    });
    await this.prisma.clinicalConcept.deleteMany({ where: { pathwayId } });
    await this.clearAiPathwayContent(pathwayId);

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        status: PathwayStatus.AI_PROCESSING,
        pipelineStage: PathwayPipelineStage.CLASSIFYING,
        clinicallyReviewedAt: null,
        clinicallyReviewedById: null,
      },
    });

    this.runClassificationPipeline(pathwayId, documents, user).catch((error) =>
      this.logger.error(`Reclassification failed for pathway: ${pathwayId}`, error),
    );

    return {
      status: 'PROCESSING',
      pipelineStage: PathwayPipelineStage.CLASSIFYING,
      message: 'Re-classifying documents for admin review.',
    };
  }

  private async runClassificationPipeline(
    pathwayId: string,
    documents: { id: string; buffer: Buffer; file: Express.Multer.File }[],
    _user: RequestUser,
  ) {
    const pathway = await this.prisma.clinicalPathway.findUnique({ where: { id: pathwayId } });
    if (!pathway) return;

    const usePython = this.aiEngine.isAvailable;
    this.logger.log(
      `Classification pipeline: ${pathwayId} (${documents.length} docs) — ${usePython ? 'Python' : 'Node fallback'}`,
    );

    const parsed = await Promise.allSettled(
      documents.map(async (doc) => {
        try {
          let text: string;
          let pageCount: number;

          if (usePython) {
            const result = await this.aiEngine.parse(
              doc.buffer,
              doc.file.originalname,
              doc.file.mimetype,
            );
            text = result.text;
            pageCount = result.page_count;
          } else {
            const result = await this.extractor.extract(
              doc.buffer,
              doc.file.mimetype,
              doc.file.originalname,
            );
            text = result.text;
            pageCount = result.pageCount;
          }

          await this.prisma.clinicalDocument.update({
            where: { id: doc.id },
            data: { extractedText: text, pageCount },
          });

          const chunks = this.aiPipeline.chunkText(text);
          await this.prisma.clinicalDocumentChunk.deleteMany({ where: { documentId: doc.id } });
          await this.prisma.clinicalDocumentChunk.createMany({
            data: chunks.map((content, index) => ({
              documentId: doc.id,
              chunkIndex: index,
              content,
              tokenCount: Math.ceil(content.length / 4),
            })),
          });

          // Classify
          let classification: Awaited<ReturnType<AiEngineClient['classifyDocument']>>;
          if (usePython) {
            classification = await this.aiEngine.classifyDocument(
              text,
              doc.file.originalname,
              pathway.condition,
            );
          } else {
            classification = this.fallbackClassify(doc.file.originalname, text);
          }

          const documentType = VALID_DOC_TYPES.has(
            classification.documentType as ClinicalDocumentType,
          )
            ? (classification.documentType as ClinicalDocumentType)
            : ClinicalDocumentType.OTHER;

          const suggestedRole = VALID_ROLES.has(classification.suggestedRole as DocumentRole)
            ? (classification.suggestedRole as DocumentRole)
            : DocumentRole.SUPPORTING;

          await this.prisma.clinicalDocument.update({
            where: { id: doc.id },
            data: {
              documentType,
              aiSuggestedRole: suggestedRole,
              role: suggestedRole,
              roleConfirmed: false,
              authority: classification.authority,
              publicationYear: classification.publicationYear,
              evidenceLevel: classification.evidenceLevel,
              documentFamily: classification.documentFamily,
              purpose: classification.purpose ?? [],
              classificationConfidence: classification.confidence,
              classificationMeta: {
                rationale: classification.rationale,
                condition: classification.condition,
              } as Prisma.InputJsonValue,
              processingStatus: 'CLASSIFIED',
              processedAt: new Date(),
            },
          });

          return {
            id: doc.id,
            fileName: doc.file.originalname,
            documentType,
            suggestedRole,
            authority: classification.authority,
            text,
          };
        } catch (err) {
          await this.prisma.clinicalDocument.update({
            where: { id: doc.id },
            data: {
              processingStatus: 'FAILED',
              processingError: (err as Error).message,
            },
          });
          throw err;
        }
      }),
    );

    const successful = parsed.filter(
      (r): r is PromiseFulfilledResult<{
        id: string;
        fileName: string;
        documentType: ClinicalDocumentType;
        suggestedRole: DocumentRole;
        authority: string | null;
        text: string;
      }> => r.status === 'fulfilled',
    );

    if (!successful.length) {
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          pipelineStage: PathwayPipelineStage.IDLE,
        },
      });
      return;
    }

    // Overlap analysis
    try {
      await this.prisma.clinicalDocumentOverlap.deleteMany({ where: { pathwayId } });

      const overlapDocs = successful.map((r) => ({
        id: r.value.id,
        fileName: r.value.fileName,
        documentType: r.value.documentType,
        suggestedRole: r.value.suggestedRole,
        authority: r.value.authority,
        textExcerpt: r.value.text.slice(0, 2500),
      }));

      let overlaps: Array<{
        sourceDocumentId: string;
        targetDocumentId: string;
        overlapPercent: number;
        recommendedRole: DocumentRole;
        rationale: string;
      }> = [];

      if (successful.length >= 2) {
        if (usePython) {
          const result = await this.aiEngine.analyzeOverlap(pathway.condition, overlapDocs);
          overlaps = (result.overlaps || []).map((o) => ({
            sourceDocumentId: o.sourceDocumentId,
            targetDocumentId: o.targetDocumentId,
            overlapPercent: o.overlapPercent,
            recommendedRole: VALID_ROLES.has(o.recommendedRole as DocumentRole)
              ? (o.recommendedRole as DocumentRole)
              : DocumentRole.SUPPORTING,
            rationale: o.rationale,
          }));
        } else {
          overlaps = this.fallbackOverlap(successful.map((r) => r.value));
        }

        // Apply overlap recommendations to target docs (if not confirmed yet)
        for (const o of overlaps) {
          if (!o.targetDocumentId) continue;
          await this.prisma.clinicalDocument.updateMany({
            where: { id: o.targetDocumentId, pathwayId, roleConfirmed: false },
            data: {
              aiSuggestedRole: o.recommendedRole,
              role: o.recommendedRole,
            },
          });
        }

        if (overlaps.length) {
          await this.prisma.clinicalDocumentOverlap.createMany({
            data: overlaps
              .filter((o) => o.sourceDocumentId && o.targetDocumentId)
              .map((o) => ({
                pathwayId,
                sourceDocumentId: o.sourceDocumentId,
                targetDocumentId: o.targetDocumentId,
                overlapPercent: o.overlapPercent,
                recommendedRole: o.recommendedRole,
                rationale: o.rationale || '',
              })),
            skipDuplicates: true,
          });
        }
      }

      // Ensure exactly one PRIMARY suggestion when possible
      const docs = await this.prisma.clinicalDocument.findMany({
        where: { pathwayId, processingStatus: 'CLASSIFIED' },
      });
      const primaries = docs.filter((d) => d.role === DocumentRole.PRIMARY);
      if (primaries.length === 0 && docs.length > 0) {
        await this.prisma.clinicalDocument.update({
          where: { id: docs[0].id },
          data: {
            role: DocumentRole.PRIMARY,
            aiSuggestedRole: DocumentRole.PRIMARY,
          },
        });
      } else if (primaries.length > 1) {
        for (const extra of primaries.slice(1)) {
          await this.prisma.clinicalDocument.update({
            where: { id: extra.id },
            data: {
              role: DocumentRole.SUPPORTING,
              aiSuggestedRole: DocumentRole.SUPPORTING,
            },
          });
        }
      }

      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          pipelineStage: PathwayPipelineStage.DOCUMENT_REVIEW,
          processingLog: {
            stage: 'DOCUMENT_REVIEW',
            at: new Date().toISOString(),
            documentsClassified: successful.length,
            overlaps: overlaps.length,
          } as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`Classification complete for pathway ${pathwayId} — awaiting document review`);
    } catch (error) {
      this.logger.error(`Overlap analysis failed for ${pathwayId}`, error);
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          pipelineStage: PathwayPipelineStage.DOCUMENT_REVIEW,
        },
      });
    }
  }

  // ─── Step 4: Admin confirms document roles ────────────────────────────────

  async confirmDocumentRoles(
    pathwayId: string,
    roles: Array<{ documentId: string; role: DocumentRole }>,
    user: RequestUser,
    req: Request,
    options?: { startExtraction?: boolean },
  ) {
    const pathway = await this.findPathwayOrThrow(pathwayId, user);

    if (
      pathway.pipelineStage !== PathwayPipelineStage.DOCUMENT_REVIEW &&
      pathway.pipelineStage !== PathwayPipelineStage.CONCEPTS_READY &&
      pathway.pipelineStage !== PathwayPipelineStage.CLINICAL_REVIEW
    ) {
      throw new BadRequestException(
        'Document roles can only be confirmed during document review (or before re-extraction).',
      );
    }

    if (!roles.length) {
      throw new BadRequestException('Provide at least one document role assignment.');
    }

    const primaryCount = roles.filter((r) => r.role === DocumentRole.PRIMARY).length;
    if (primaryCount < 1) {
      throw new BadRequestException('Select at least one Primary document for extraction.');
    }

    for (const assignment of roles) {
      const doc = await this.prisma.clinicalDocument.findFirst({
        where: { id: assignment.documentId, pathwayId },
      });
      if (!doc) {
        throw new NotFoundException(`Document ${assignment.documentId} not found on this pathway`);
      }
      await this.prisma.clinicalDocument.update({
        where: { id: assignment.documentId },
        data: {
          role: assignment.role,
          roleConfirmed: true,
        },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CONFIRM_DOCUMENT_ROLES',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, roles },
      ...this.getClientInfo(req),
    });

    if (options?.startExtraction !== false) {
      return this.startConceptExtraction(pathwayId, user, req);
    }

    return this.prisma.clinicalPathway.findUnique({
      where: { id: pathwayId },
      include: { documents: true, documentOverlaps: true },
    });
  }

  // ─── Steps 5–7: Concepts → generate pathway ───────────────────────────────

  async startConceptExtraction(pathwayId: string, user: RequestUser, req: Request) {
    const pathway = await this.findPathwayOrThrow(pathwayId, user);

    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before regenerating content.');
    }

    const docs = await this.prisma.clinicalDocument.findMany({
      where: {
        pathwayId,
        role: { in: [DocumentRole.PRIMARY, DocumentRole.SUPPORTING] },
        extractedText: { not: null },
      },
    });

    if (!docs.length) {
      throw new BadRequestException(
        'No Primary/Supporting documents with extracted text. Confirm document roles first.',
      );
    }

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        status: PathwayStatus.AI_PROCESSING,
        pipelineStage: PathwayPipelineStage.EXTRACTING_CONCEPTS,
        clinicallyReviewedAt: null,
        clinicallyReviewedById: null,
      },
    });

    this.runConceptAndGeneratePipeline(pathwayId, user).catch((error) =>
      this.logger.error(`Concept/generation pipeline failed for ${pathwayId}`, error),
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'START_CONCEPT_EXTRACTION',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, documents: docs.length },
      ...this.getClientInfo(req),
    });

    return {
      status: 'PROCESSING',
      pipelineStage: PathwayPipelineStage.EXTRACTING_CONCEPTS,
      message: 'Extracting and normalizing clinical concepts. You will review them before generating the pathway.',
    };
  }

  /** Regenerate pathway entities from stored concepts (no PDF re-read). */
  async regenerateFromConcepts(
    pathwayId: string,
    user: RequestUser,
    req: Request,
    limits?: Record<string, number>,
  ) {
    const pathway = await this.findPathwayOrThrow(pathwayId, user);

    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before regenerating it.');
    }

    if (pathway.status === PathwayStatus.AI_PROCESSING) {
      // Allow recovery if concepts already exist (stuck mid-pipeline)
      const conceptCount = await this.prisma.clinicalConcept.count({ where: { pathwayId } });
      if (!conceptCount) {
        throw new BadRequestException('Please wait for the current step to finish.');
      }
    }

    const conceptCount = await this.prisma.clinicalConcept.count({ where: { pathwayId } });
    if (!conceptCount) {
      throw new BadRequestException(
        'No stored clinical concepts. Run concept extraction from documents first.',
      );
    }

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        status: PathwayStatus.AI_PROCESSING,
        pipelineStage: PathwayPipelineStage.GENERATING,
        clinicallyReviewedAt: null,
        clinicallyReviewedById: null,
      },
    });

    this.runGenerateFromStoredConcepts(pathwayId, user, limits).catch((error) =>
      this.logger.error(`Regenerate-from-concepts failed for ${pathwayId}`, error),
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'REGENERATE_FROM_CONCEPTS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, conceptCount, limits },
      ...this.getClientInfo(req),
    });

    return {
      status: 'PROCESSING',
      pipelineStage: PathwayPipelineStage.GENERATING,
      message: 'Generating pathway from stored clinical concepts.',
    };
  }

  private async runConceptAndGeneratePipeline(pathwayId: string, user: RequestUser) {
    const pathway = await this.prisma.clinicalPathway.findUnique({ where: { id: pathwayId } });
    if (!pathway) return;

    const usePython = this.aiEngine.isAvailable;
    const docs = await this.prisma.clinicalDocument.findMany({
      where: {
        pathwayId,
        role: { in: [DocumentRole.PRIMARY, DocumentRole.SUPPORTING] },
        extractedText: { not: null },
      },
    });

    try {
      let concepts: ClinicalConceptDto[] = [];

      if (usePython) {
        const result = await this.aiEngine.extractConcepts(
          pathway.name,
          pathway.condition,
          docs.map((d) => ({
            id: d.id,
            fileName: d.fileName,
            role: d.role,
            text: d.extractedText!,
          })),
        );
        concepts = result.concepts;
      } else {
        // Node fallback: run existing extract on combined primary/supporting text,
        // then map questions/flags into coarse concepts.
        const combined = docs.map((d) => d.extractedText!).join('\n\n---\n\n');
        const knowledge = await this.aiPipeline.analyzeDocument(
          combined,
          pathway.name,
          pathway.condition,
        );
        concepts = this.knowledgeToConcepts(knowledge, docs[0]?.id);
      }

      await this.persistConcepts(pathwayId, user.tenantId ?? null, concepts);

      // Pause for admin concept review — do not auto-generate.
      // User continues via "Generate pathway" → regenerateFromConcepts.
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          pipelineStage: PathwayPipelineStage.CONCEPTS_READY,
          processingLog: {
            stage: 'CONCEPTS_READY',
            at: new Date().toISOString(),
            conceptCount: concepts.length,
            next: 'Review concepts, then generate the pathway.',
          } as Prisma.InputJsonValue,
        },
      });

      await this.prisma.clinicalDocument.updateMany({
        where: {
          pathwayId,
          role: { in: [DocumentRole.PRIMARY, DocumentRole.SUPPORTING] },
        },
        data: { processingStatus: 'COMPLETED', processedAt: new Date(), processingError: null },
      });

      this.logger.log(
        `Concepts ready for pathway ${pathwayId} (${concepts.length}) — awaiting generate`,
      );
    } catch (error) {
      const message = (error as Error)?.message || String(error);
      this.logger.error(`Concept extraction failed for ${pathwayId}: ${message}`, error);
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          // Stay on concepts stage so admin can retry extract without re-classifying.
          pipelineStage: PathwayPipelineStage.DOCUMENT_REVIEW,
          processingLog: {
            stage: 'CONCEPT_EXTRACT_FAILED',
            at: new Date().toISOString(),
            error: message,
            hint: /timed out|aborted/i.test(message)
              ? 'Extraction timed out. Retry concept extraction — parallel chunking should finish faster.'
              : 'Retry concept extraction from Document Review.',
          } as Prisma.InputJsonValue,
        },
      });
      for (const d of docs) {
        await this.prisma.clinicalDocument.update({
          where: { id: d.id },
          data: {
            processingStatus: 'FAILED',
            processingError: message.slice(0, 500),
          },
        });
      }
    }
  }

  private async runGenerateFromStoredConcepts(
    pathwayId: string,
    user: RequestUser,
    limits?: Record<string, number>,
  ) {
    const pathway = await this.prisma.clinicalPathway.findUnique({ where: { id: pathwayId } });
    if (!pathway) return;

    const stored = await this.prisma.clinicalConcept.findMany({
      where: { pathwayId },
      include: { sources: true },
      orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
    });

    const concepts: ClinicalConceptDto[] = stored.map((c) => ({
      category: c.category,
      label: c.label,
      description: c.description,
      importance: c.importance,
      metadata: (c.metadata as Record<string, unknown>) ?? {},
      confidence: c.confidence ?? undefined,
      aliases: c.aliases,
      sources: c.sources.map((s) => ({
        documentId: s.documentId,
        sourceExcerpt: s.sourceExcerpt,
        sourcePage: s.sourcePage,
      })),
    }));

    try {
      let knowledge: ExtractedKnowledge;

      if (this.aiEngine.isAvailable) {
        const result = await this.aiEngine.generateFromConcepts(
          pathway.name,
          pathway.condition,
          concepts,
          limits,
        );
        knowledge = result.knowledge;
      } else {
        // Fallback: re-extract from stored document text (legacy path)
        const docs = await this.prisma.clinicalDocument.findMany({
          where: {
            pathwayId,
            role: { in: [DocumentRole.PRIMARY, DocumentRole.SUPPORTING] },
            extractedText: { not: null },
          },
        });
        const combined = docs.map((d) => d.extractedText!).join('\n\n---\n\n');
        knowledge = await this.aiPipeline.analyzeDocument(
          combined,
          pathway.name,
          pathway.condition,
        );
        knowledge.summary = await this.aiPipeline.generateSummary(
          pathway.name,
          pathway.condition,
          knowledge,
        );
      }

      // Document-grounded safety net: fill RF/DDx/education/rules from stored concepts
      // when the model returns questions/treatments but omits these arrays.
      knowledge = this.backfillKnowledgeFromConcepts(knowledge, concepts, limits);

      await this.clearAiPathwayContent(pathwayId);
      await this.persistExtractedKnowledge(pathwayId, knowledge, user);

      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.UNPUBLISHED,
          pipelineStage: PathwayPipelineStage.CLINICAL_REVIEW,
          aiSummary: knowledge.summary,
          clinicallyReviewedAt: null,
          clinicallyReviewedById: null,
        },
      });

      await this.prisma.clinicalDocument.updateMany({
        where: {
          pathwayId,
          role: { in: [DocumentRole.PRIMARY, DocumentRole.SUPPORTING] },
        },
        data: { processingStatus: 'COMPLETED', processedAt: new Date(), processingError: null },
      });

      this.logger.log(`Pathway generation complete for ${pathwayId} — awaiting clinical review`);
    } catch (error) {
      this.logger.error(`Pathway generation failed for ${pathwayId}`, error);
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          status: PathwayStatus.DRAFT,
          pipelineStage: PathwayPipelineStage.CONCEPTS_READY,
          processingLog: {
            stage: 'CONCEPTS_READY',
            at: new Date().toISOString(),
            error: (error as Error)?.message?.slice(0, 500) ?? 'Generation failed',
            next: 'Review concepts and click Generate pathway again.',
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  // ─── Step 8: Clinical admin approval ──────────────────────────────────────

  async approveClinicalReview(pathwayId: string, user: RequestUser, req: Request) {
    const pathway = await this.findPathwayOrThrow(pathwayId, user);

    if (
      pathway.pipelineStage !== PathwayPipelineStage.CLINICAL_REVIEW &&
      pathway.pipelineStage !== PathwayPipelineStage.COMPLETE
    ) {
      throw new BadRequestException(
        'Complete pathway generation before clinical approval.',
      );
    }

    const updated = await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        clinicallyReviewedAt: new Date(),
        clinicallyReviewedById: user.id,
        pipelineStage: PathwayPipelineStage.COMPLETE,
        lastClinicalReview: new Date(),
        status:
          pathway.status === PathwayStatus.PUBLISHED
            ? PathwayStatus.PUBLISHED
            : PathwayStatus.UNPUBLISHED,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CLINICAL_REVIEW_APPROVE',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, reviewedAt: updated.clinicallyReviewedAt },
      ...this.getClientInfo(req),
    });

    return updated;
  }

  assertReadyToPublish(pathway: {
    clinicallyReviewedAt: Date | null;
    pipelineStage: PathwayPipelineStage;
    status: PathwayStatus;
  }) {
    if (!pathway.clinicallyReviewedAt) {
      throw new BadRequestException(
        'Complete Clinical Admin Review & Approval before publishing. No generated pathway should go live without pharmacist review.',
      );
    }
    if (
      pathway.pipelineStage !== PathwayPipelineStage.COMPLETE &&
      pathway.pipelineStage !== PathwayPipelineStage.CLINICAL_REVIEW
    ) {
      // Allow publish if clinically reviewed even if stage drifted
      if (!pathway.clinicallyReviewedAt) {
        throw new BadRequestException('Pathway is not ready to publish.');
      }
    }
  }

  // ─── Concept CRUD helpers ─────────────────────────────────────────────────

  async updateConcept(
    pathwayId: string,
    conceptId: string,
    data: {
      label?: string;
      description?: string | null;
      category?: ClinicalConceptCategory;
      importance?: string | null;
      approved?: boolean;
      metadata?: Record<string, unknown>;
    },
    user: RequestUser,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalConcept.findFirst({
      where: { id: conceptId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Concept not found');

    return this.prisma.clinicalConcept.update({
      where: { id: conceptId },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.importance !== undefined ? { importance: data.importance } : {}),
        ...(data.approved !== undefined ? { approved: data.approved } : {}),
        ...(data.metadata !== undefined
          ? { metadata: data.metadata as Prisma.InputJsonValue }
          : {}),
      },
      include: { sources: { include: { document: { select: { id: true, fileName: true } } } } },
    });
  }

  async deleteConcept(pathwayId: string, conceptId: string, user: RequestUser) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalConcept.findFirst({
      where: { id: conceptId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Concept not found');
    await this.prisma.clinicalConcept.delete({ where: { id: conceptId } });
  }

  async mergeConcepts(
    pathwayId: string,
    targetConceptId: string,
    sourceConceptIds: string[],
    user: RequestUser,
    canonicalLabel?: string,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const target = await this.prisma.clinicalConcept.findFirst({
      where: { id: targetConceptId, pathwayId },
      include: { sources: true },
    });
    if (!target) throw new NotFoundException('Target concept not found');

    const sources = await this.prisma.clinicalConcept.findMany({
      where: { pathwayId, id: { in: sourceConceptIds.filter((id) => id !== targetConceptId) } },
      include: { sources: true },
    });

    const aliases = new Set([...target.aliases, target.label]);
    for (const s of sources) {
      aliases.add(s.label);
      s.aliases.forEach((a) => aliases.add(a));
      for (const src of s.sources) {
        await this.prisma.clinicalConceptSource.upsert({
          where: {
            conceptId_documentId: { conceptId: target.id, documentId: src.documentId },
          },
          create: {
            conceptId: target.id,
            documentId: src.documentId,
            sourceExcerpt: src.sourceExcerpt,
            sourcePage: src.sourcePage,
          },
          update: {},
        });
      }
    }

    await this.prisma.clinicalConcept.deleteMany({
      where: { id: { in: sources.map((s) => s.id) } },
    });

    return this.prisma.clinicalConcept.update({
      where: { id: target.id },
      data: {
        label: canonicalLabel?.trim() || target.label,
        aliases: [...aliases].slice(0, 40),
      },
      include: { sources: { include: { document: { select: { id: true, fileName: true } } } } },
    });
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async persistConcepts(
    pathwayId: string,
    tenantId: string | null,
    concepts: ClinicalConceptDto[],
  ) {
    await this.prisma.clinicalConceptSource.deleteMany({
      where: { concept: { pathwayId } },
    });
    await this.prisma.clinicalConcept.deleteMany({ where: { pathwayId } });

    const validDocIds = new Set(
      (
        await this.prisma.clinicalDocument.findMany({
          where: { pathwayId },
          select: { id: true },
        })
      ).map((d) => d.id),
    );

    // Keep a focused shortlist — long concept dumps hurt review UX and pathway quality.
    const curated = selectTopConcepts(concepts, MAX_CLINICAL_CONCEPTS);

    let order = 0;
    for (const c of curated) {
      const category = VALID_CONCEPT_CATEGORIES.has(c.category as ClinicalConceptCategory)
        ? (c.category as ClinicalConceptCategory)
        : ClinicalConceptCategory.OTHER;

      const created = await this.prisma.clinicalConcept.create({
        data: {
          pathwayId,
          tenantId,
          category,
          label: c.label,
          description: c.description ?? null,
          metadata: (c.metadata ?? {}) as Prisma.InputJsonValue,
          importance: c.importance ?? 'MEDIUM',
          confidence: c.confidence ?? null,
          aliases: c.aliases ?? [c.label],
          isAiGenerated: true,
          approved: false,
          displayOrder: order++,
        },
      });

      const seen = new Set<string>();
      for (const src of c.sources || []) {
        if (!src.documentId || !validDocIds.has(src.documentId) || seen.has(src.documentId)) {
          continue;
        }
        seen.add(src.documentId);
        await this.prisma.clinicalConceptSource.create({
          data: {
            conceptId: created.id,
            documentId: src.documentId,
            sourceExcerpt: src.sourceExcerpt ?? null,
            sourcePage: src.sourcePage ?? null,
          },
        });
      }
    }
  }

  /**
   * Prune an oversized concept list down to the most important shortlist (max 20).
   * Used when older pathways still have 50–100+ concepts from unbounded extraction.
   */
  async curateConcepts(pathwayId: string, user: RequestUser) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalConcept.findMany({
      where: { pathwayId },
      include: { sources: true },
    });
    if (existing.length <= MAX_CLINICAL_CONCEPTS) {
      return {
        kept: existing.length,
        removed: 0,
        max: MAX_CLINICAL_CONCEPTS,
      };
    }

    const keep = selectTopConcepts(
      existing.map((c) => ({
        id: c.id,
        category: c.category,
        label: c.label,
        importance: c.importance,
        confidence: c.confidence,
      })),
      MAX_CLINICAL_CONCEPTS,
    );
    const keepIds = new Set(keep.map((c) => c.id));
    const removeIds = existing.filter((c) => !keepIds.has(c.id)).map((c) => c.id);

    if (removeIds.length) {
      await this.prisma.clinicalConcept.deleteMany({
        where: { pathwayId, id: { in: removeIds } },
      });
    }

    // Re-number display order for the kept shortlist
    let order = 0;
    for (const c of keep) {
      await this.prisma.clinicalConcept.update({
        where: { id: c.id },
        data: { displayOrder: order++ },
      });
    }

    return {
      kept: keep.length,
      removed: removeIds.length,
      max: MAX_CLINICAL_CONCEPTS,
    };
  }

  async persistExtractedKnowledge(
    pathwayId: string,
    knowledge: ExtractedKnowledge,
    user: RequestUser,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Guarantee canonical sections even if the model returns none / bad names
      const sectionDefs = [
        {
          name: 'diagnosisConfirmation',
          displayName: 'Diagnosis Confirmation',
          description: 'Questions that confirm the clinical diagnosis',
          order: 0,
        },
        {
          name: 'additionalAssessment',
          displayName: 'Custom Assessment',
          description: 'Context-specific assessment (severity, pregnancy, etc.)',
          order: 1,
        },
        {
          name: 'treatmentEligibility',
          displayName: 'Treatment Eligibility',
          description: 'Criteria that determine which treatments are appropriate',
          order: 2,
        },
      ];

      const sectionMap = new Map<string, string>();
      for (const section of sectionDefs) {
        const created = await tx.clinicalSection.create({
          data: {
            pathwayId,
            name: section.name,
            displayName: section.displayName,
            description: section.description,
            displayOrder: section.order,
            isAiGenerated: true,
          },
        });
        sectionMap.set(section.name, created.id);
      }

      // Merge any extra AI section names into canonical buckets
      for (const section of knowledge.sections || []) {
        const canonical = normalizeSectionName(section?.name);
        if (!sectionMap.has(canonical) && section?.name) {
          sectionMap.set(section.name, sectionMap.get(canonical)!);
        }
      }

      const questionMap = new Map<string, string>();
      let qOrder = 0;
      for (const q of knowledge.questions || []) {
        const questionText = normalizeQuestionText(q);
        if (!questionText) {
          this.logger.warn(`Skipping question without text during persist for ${pathwayId}`);
          continue;
        }
        const sectionKey = normalizeSectionName((q as any)?.section);
        const sectionId = sectionMap.get(sectionKey) || sectionMap.get('diagnosisConfirmation') || null;
        const confidence = Number.isFinite(Number((q as any)?.confidence))
          ? Number((q as any).confidence)
          : 75;
        const status =
          confidence < 85 ? QuestionStatus.NEEDS_REVIEW : QuestionStatus.AI_GENERATED;

        const created = await tx.clinicalQuestion.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            sectionId,
            question: questionText,
            description: (q as any)?.description || null,
            helpText: (q as any)?.helpText || null,
            type: normalizeQuestionType((q as any)?.type),
            required: (q as any)?.required !== false,
            displayOrder: qOrder++,
            options: (q as any)?.options ? (q as any).options : undefined,
            sourcePage: (q as any)?.sourcePage || null,
            sourceReference: (q as any)?.sourceReference || null,
            confidence,
            status,
            createdBy: 'AI',
            approved: false,
          },
        });
        questionMap.set(questionText.toLowerCase().trim(), created.id);
      }

      for (const rule of knowledge.rules || []) {
        if (!rule?.condition || !rule?.message) continue;
        const questionId =
          questionMap.get(String(rule.questionRef ?? '').toLowerCase().trim()) || null;
        await tx.clinicalRule.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            questionId,
            condition: String(rule.condition),
            operator: normalizeRuleOperator(rule.operator),
            value:
              rule.value != null && String(rule.value).trim() !== ''
                ? String(rule.value)
                : 'true',
            action: normalizeRuleAction(rule.action),
            severity: normalizeRuleSeverity(rule.severity),
            message: String(rule.message),
            details: rule.details || null,
            isAiGenerated: true,
            approved: false,
          },
        });
      }

      let tOrder = 0;
      for (const t of knowledge.treatments || []) {
        const medicationName = normalizeMedicationName(t);
        if (!medicationName) {
          this.logger.warn(
            `Skipping treatment without medicationName during persist for ${pathwayId}: ${JSON.stringify(t)?.slice(0, 200)}`,
          );
          continue;
        }
        const raw = t as unknown as Record<string, unknown>;
        await tx.clinicalTreatment.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            category: normalizeTreatmentCategory(raw.category ?? raw.type),
            recommendationLevel: normalizeRecommendationLevel(
              raw.recommendationLevel ?? raw.priority ?? raw.line,
            ),
            medicationName,
            genericName: (raw.genericName as string) || (raw.generic_name as string) || null,
            brandName: (raw.brandName as string) || (raw.brand_name as string) || null,
            strength: (raw.strength as string) || null,
            dose: (raw.dose as string) || (raw.dosing as string) || null,
            route: (raw.route as string) || null,
            frequency: (raw.frequency as string) || null,
            duration: (raw.duration as string) || null,
            quantity: (raw.quantity as string) || null,
            maxDose: (raw.maxDose as string) || (raw.max_dose as string) || null,
            eligibility: (raw.eligibility as string) || null,
            clinicalIndication:
              (raw.clinicalIndication as string) || (raw.indication as string) || null,
            clinicalNotes: (raw.clinicalNotes as string) || (raw.notes as string) || null,
            guidelineReference:
              (raw.guidelineReference as string) || (raw.sourceReference as string) || null,
            evidenceStrength: (raw.evidenceStrength as string) || null,
            renalAdjustment: (raw.renalAdjustment as string) || null,
            renalAdjustmentReason: (raw.renalAdjustmentReason as string) || null,
            renalSourceBasis: (raw.renalSourceBasis as string) || null,
            renalDosingBasis: (raw.renalDosingBasis as string) || null,
            renalDosingRules: (() => {
              const parsed = parseRenalDosingRulesJson(raw.renalDosingRules);
              return (parsed.ok ? parsed.rules : []) as unknown as Prisma.InputJsonValue;
            })(),
            hepaticAdjustment: (raw.hepaticAdjustment as string) || null,
            hepaticAdjustmentReason: (raw.hepaticAdjustmentReason as string) || null,
            pregnancyNotes: (raw.pregnancyNotes as string) || null,
            pregnancyReason: (raw.pregnancyReason as string) || null,
            breastfeedingNotes: (raw.breastfeedingNotes as string) || null,
            counsellingNotes: (raw.counsellingNotes as string) || null,
            followUpAdvice: (raw.followUpAdvice as string) || null,
            warnings: normalizeStringArray(raw.warnings),
            interactions: normalizeStringArray(raw.interactions),
            monitoring: (raw.monitoring as string) || null,
            monitoringReason: (raw.monitoringReason as string) || null,
            isAiGenerated: true,
            approved: false,
            isActive: true,
            displayOrder: tOrder++,
          },
        });
      }

      let cOrder = 0;
      for (const c of knowledge.counselling || []) {
        const normalized = normalizeCounsellingPoint(c);
        if (!normalized) {
          this.logger.warn(`Skipping counselling item without point for ${pathwayId}`);
          continue;
        }
        await tx.clinicalCounselling.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            category: normalized.category,
            point: normalized.point,
            detail: normalized.detail,
            outputSection: resolveGuidanceSection(null, normalized.category),
            guidanceType: resolveGuidanceType(
              null,
              resolveGuidanceSection(null, normalized.category),
              normalized.category,
            ),
            priority: 'alternative',
            isAiGenerated: true,
            approved: false,
            displayOrder: cOrder++,
          },
        });
      }

      let fOrder = 0;
      for (const f of knowledge.followup || []) {
        const normalized = normalizeFollowupItem(f);
        if (!normalized) {
          this.logger.warn(`Skipping follow-up item without action for ${pathwayId}`);
          continue;
        }
        await tx.clinicalFollowup.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            timeframe: normalized.timeframe,
            condition: normalized.condition,
            action: normalized.action,
            urgency: normalized.urgency,
            isAiGenerated: true,
            approved: false,
            displayOrder: fOrder++,
          },
        });
      }

      const current = await tx.clinicalPathway.findUnique({
        where: { id: pathwayId },
        select: { redFlags: true, differentials: true },
      });
      const manualRedFlags = ((current?.redFlags as any[]) ?? []).filter((r) => r?.source === 'USER');
      const manualDifferentials = ((current?.differentials as any[]) ?? []).filter(
        (d) => d?.source === 'USER',
      );

      const aiRedFlags = (knowledge.redFlags ?? [])
        .filter((rf) => rf?.title || (rf as any)?.name)
        .map((rf) => ({
          id: randomUUID(),
          title: rf.title || (rf as any).name,
          description: rf.description ?? null,
          severity: ['WARNING', 'CRITICAL', 'EMERGENCY'].includes(rf.severity)
            ? rf.severity
            : 'CRITICAL',
          action: normalizeRedFlagAction(rf.action ?? rf.description) ?? null,
          source: 'AI' as const,
        }));

      const aiDifferentials = (knowledge.differentials ?? [])
        .filter((d) => d?.condition || (d as any)?.name)
        .map((d) => ({
          id: randomUUID(),
          condition: d.condition || (d as any).name,
          question: d.question ?? null,
          whyItMatters: d.whyItMatters ?? null,
          suggestedPathway: d.suggestedPathway ?? null,
          keySymptoms: d.keySymptoms ?? null,
          distinguishingFeatures: d.distinguishingFeatures ?? null,
          recommendedAction: d.recommendedAction ?? null,
          likelihood:
            d.likelihood && ['COMMON', 'LESS_COMMON', 'RARE'].includes(d.likelihood)
              ? d.likelihood
              : null,
          required: true,
          approved: false,
          evidenceRefIds: [],
          source: 'AI' as const,
        }));

      await tx.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          redFlags: [...manualRedFlags, ...aiRedFlags],
          differentials: [...manualDifferentials, ...aiDifferentials],
        },
      });
    });
  }

  /**
   * Resolve pasted ChatGPT text or a Word/text file upload into plain script text.
   */
  async resolveImportScriptText(opts: {
    text?: string;
    fileBase64?: string;
    fileName?: string;
  }): Promise<string> {
    if (opts.fileBase64?.trim()) {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(opts.fileBase64.trim().replace(/\s+/g, ''), 'base64');
      } catch {
        throw new BadRequestException('The uploaded file could not be read.');
      }
      if (!buffer.length) {
        throw new BadRequestException('The uploaded file is empty.');
      }
      if (buffer.length > 2_000_000) {
        throw new BadRequestException('File is too large (max 2 MB).');
      }
      const name = (opts.fileName || 'script.txt').trim() || 'script.txt';
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const mime =
        ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'doc'
            ? 'application/msword'
            : ext === 'pdf'
              ? 'application/pdf'
              : 'text/plain';
      try {
        const extracted = await this.extractor.extract(buffer, mime, name);
        const text = extracted.text?.trim() ?? '';
        if (text.length < 8) {
          throw new BadRequestException(
            'Could not extract readable text from that file. Paste the content instead.',
          );
        }
        if (text.length > 200_000) {
          throw new BadRequestException('Script is too large (max ~200k characters).');
        }
        return text;
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException(
          err instanceof Error ? err.message : 'Could not extract text from that file.',
        );
      }
    }

    const text = opts.text?.trim() ?? '';
    if (text.length < 8) {
      throw new BadRequestException('Paste or upload a ChatGPT / Word script first.');
    }
    if (text.length > 200_000) {
      throw new BadRequestException('Script is too large (max ~200k characters).');
    }
    return text;
  }

  /**
   * Import assessment questions from a ChatGPT / admin script (paste or .txt/.md/.docx).
   * Uses a deterministic parser first; falls back to AI structuring when needed.
   */
  async importQuestionsFromScript(
    pathwayId: string,
    opts: {
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace_section';
      sections?: ScriptImportSection[];
      useAiFallback?: boolean;
    },
    user: RequestUser,
  ) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');
    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before importing questions.');
    }
    if (pathway.status === PathwayStatus.AI_PROCESSING) {
      throw new BadRequestException('Please wait for processing to finish.');
    }
    if (pathway.status === PathwayStatus.ARCHIVED) {
      throw new BadRequestException('Archived pathways cannot be edited.');
    }

    const text = await this.resolveImportScriptText(opts);

    const allowedSections: ScriptImportSection[] = opts.sections?.length
      ? opts.sections
      : ['diagnosisConfirmation', 'additionalAssessment', 'treatmentEligibility'];

    let parsed = parseQuestionScript(text);
    let parseSource = parsed?.source ?? 'none';

    // AI fallback when deterministic parse finds little structure
    if ((!parsed || parsed.questions.length < 1) && opts.useAiFallback !== false) {
      this.logger.log(`Script import: AI fallback structuring for pathway ${pathwayId}`);
      const knowledge = await this.aiPipeline.analyzeDocument(
        text.slice(0, 80_000),
        pathway.name,
        pathway.condition,
      );
      const questions = (knowledge.questions || []).map((q) => ({
        ...q,
        section: normalizeSectionName(q.section) as ScriptImportSection,
        sourceReference: q.sourceReference || 'chatgpt-script-import-ai',
        clinicalReason: q.clinicalReason || 'Structured from ChatGPT script',
      }));
      if (questions.length) {
        parsed = { questions, source: 'markdown' };
        parseSource = 'ai';
      }
    }

    if (!parsed?.questions.length) {
      throw new BadRequestException(
        'Could not find Presentation Review questions in this script. Paste ChatGPT content under ## Presentation Review (legacy Diagnosis Confirmation / Treatment Eligibility headings are still accepted), or JSON with a "questions" array.',
      );
    }

    const filtered = parsed.questions.filter((q) =>
      allowedSections.includes(normalizeSectionName(q.section) as ScriptImportSection),
    );
    if (!filtered.length) {
      throw new BadRequestException(
        'No questions matched Presentation Review. Check that the script uses ## Presentation Review (or legacy Diagnosis Confirmation / Treatment Eligibility headings).',
      );
    }

    const mode = opts.mode ?? 'merge';
    const sectionDefs: Array<{
      name: ScriptImportSection;
      displayName: string;
      description: string;
      order: number;
    }> = [
      {
        name: 'diagnosisConfirmation',
        displayName: 'Diagnosis Confirmation',
        description: 'Questions that confirm the clinical diagnosis',
        order: 0,
      },
      {
        name: 'additionalAssessment',
        displayName: 'Custom Assessment',
        description: 'Context-specific assessment (severity, pregnancy, etc.)',
        order: 1,
      },
      {
        name: 'treatmentEligibility',
        displayName: 'Treatment Eligibility',
        description: 'Criteria that determine which treatments are appropriate',
        order: 2,
      },
    ];

    const created = await this.prisma.$transaction(async (tx) => {
      const sectionMap = new Map<string, string>();

      for (const def of sectionDefs) {
        if (!allowedSections.includes(def.name)) continue;
        let section = await tx.clinicalSection.findFirst({
          where: { pathwayId, name: def.name },
        });
        if (!section) {
          section = await tx.clinicalSection.create({
            data: {
              pathwayId,
              name: def.name,
              displayName: def.displayName,
              description: def.description,
              displayOrder: def.order,
              isAiGenerated: false,
            },
          });
        }
        sectionMap.set(def.name, section.id);

        if (mode === 'replace_section') {
          await tx.clinicalQuestion.deleteMany({
            where: { pathwayId, sectionId: section.id },
          });
        }
      }

      // Existing questions for dedupe (merge mode)
      const existing = await tx.clinicalQuestion.findMany({
        where: { pathwayId },
        select: { question: true },
      });
      const existingKeys = new Set(
        existing.map((q) => q.question.toLowerCase().trim().replace(/\s+/g, ' ')),
      );

      let maxOrder =
        (
          await tx.clinicalQuestion.aggregate({
            where: { pathwayId },
            _max: { displayOrder: true },
          })
        )._max.displayOrder ?? -1;

      let imported = 0;
      let skipped = 0;
      const bySection: Record<string, number> = {};

      for (const q of filtered) {
        const questionText = normalizeQuestionText(q);
        if (!questionText) {
          skipped += 1;
          continue;
        }
        const key = questionText.toLowerCase().trim().replace(/\s+/g, ' ');
        if (mode === 'merge' && existingKeys.has(key)) {
          skipped += 1;
          continue;
        }

        const sectionKey = normalizeSectionName(q.section) as ScriptImportSection;
        const sectionId = sectionMap.get(sectionKey) || sectionMap.get('diagnosisConfirmation');
        if (!sectionId) {
          skipped += 1;
          continue;
        }

        maxOrder += 1;
        await tx.clinicalQuestion.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            sectionId,
            question: questionText,
            description: q.description || null,
            helpText: q.helpText || null,
            type: normalizeQuestionType(q.type),
            required: q.required !== false,
            displayOrder: maxOrder,
            options: q.options ? (q.options as Prisma.InputJsonValue) : undefined,
            sourceReference: q.sourceReference || 'chatgpt-script-import',
            confidence: Number.isFinite(q.confidence) ? q.confidence : null,
            status: QuestionStatus.NEEDS_REVIEW,
            createdBy: 'USER',
            approved: false,
          },
        });
        existingKeys.add(key);
        imported += 1;
        bySection[sectionKey] = (bySection[sectionKey] ?? 0) + 1;
      }

      return { imported, skipped, bySection };
    });

    const duplicateReviewNeeded =
      Boolean(parsed.legacyTwoSectionImport) || detectLegacyTwoSectionImport(text);

    if (duplicateReviewNeeded) {
      const current = parsePresentationReviewState(pathway.presentationReview);
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          presentationReview: {
            ...current,
            duplicateReviewNeeded: true,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      ...created,
      parseSource,
      totalParsed: filtered.length,
      mode,
      duplicateReviewNeeded,
    };
  }

  /**
   * Unified ChatGPT script import for every pathway authoring tab.
   */
  async importFromChatGpt(
    pathwayId: string,
    opts: {
      target: ChatGptImportTarget;
      text?: string;
      fileBase64?: string;
      fileName?: string;
      mode?: 'merge' | 'replace';
      sections?: ScriptImportSection[];
      useAiFallback?: boolean;
    },
    user: RequestUser,
  ) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');
    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before importing.');
    }
    if (pathway.status === PathwayStatus.AI_PROCESSING) {
      throw new BadRequestException('Please wait for processing to finish.');
    }
    if (pathway.status === PathwayStatus.ARCHIVED) {
      throw new BadRequestException('Archived pathways cannot be edited.');
    }

    const text = await this.resolveImportScriptText(opts);

    const mode = opts.mode ?? 'merge';
    const target = opts.target;

    if (target === 'assessment') {
      const result = await this.importQuestionsFromScript(
        pathwayId,
        {
          text,
          mode: mode === 'replace' ? 'replace_section' : 'merge',
          sections: opts.sections,
          useAiFallback: opts.useAiFallback,
        },
        user,
      );
      return { target, ...result };
    }

    if (target === 'overview') {
      const parsed = parseOverviewScript(text);
      if (!parsed.description && !parsed.notes && parsed.ageMin == null && parsed.ageMax == null) {
        throw new BadRequestException(
          'Could not find Overview fields. Use ## Description and ## Notes headings.',
        );
      }
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: {
          ...(parsed.description
            ? {
                description:
                  mode === 'replace'
                    ? parsed.description
                    : [pathway.description, parsed.description].filter(Boolean).join('\n\n'),
              }
            : {}),
          ...(parsed.notes
            ? {
                notes:
                  mode === 'replace'
                    ? parsed.notes
                    : [pathway.notes, parsed.notes].filter(Boolean).join('\n\n'),
              }
            : {}),
          ...(parsed.ageMin != null ? { ageMin: parsed.ageMin } : {}),
          ...(parsed.ageMax != null ? { ageMax: parsed.ageMax } : {}),
        },
      });
      return {
        target,
        imported: 1,
        skipped: 0,
        parseSource: 'markdown',
        mode,
      };
    }

    if (target === 'concepts') {
      const concepts = parseConceptsScript(text);
      if (!concepts.length) {
        throw new BadRequestException(
          'No concepts found. Use ## SYMPTOM / ## RED_FLAG / ## DRUG style headings with bullets.',
        );
      }
      if (mode === 'replace') {
        await this.prisma.clinicalConcept.deleteMany({ where: { pathwayId } });
      }
      const existing = await this.prisma.clinicalConcept.findMany({
        where: { pathwayId },
        select: { label: true, category: true, importance: true, confidence: true },
      });
      const existingKeys = new Set(existing.map((c) => c.label.toLowerCase().trim()));
      let imported = 0;
      let skipped = 0;
      let order =
        (
          await this.prisma.clinicalConcept.aggregate({
            where: { pathwayId },
            _max: { displayOrder: true },
          })
        )._max.displayOrder ?? -1;

      // Prefer the most important imported concepts; never blow past the shortlist cap.
      const room = Math.max(0, MAX_CLINICAL_CONCEPTS - (mode === 'replace' ? 0 : existing.length));
      const rankedImport = selectTopConcepts(
        concepts.map((c) => ({
          ...c,
          importance: c.category === 'RED_FLAG' || c.category === 'ELIGIBILITY' ? 'HIGH' : 'MEDIUM',
          confidence: 85,
        })),
        Math.max(room, mode === 'replace' ? MAX_CLINICAL_CONCEPTS : room),
      );

      if (mode === 'merge' && room === 0) {
        throw new BadRequestException(
          `This pathway already has ${MAX_CLINICAL_CONCEPTS} concepts (the maximum). Remove some, or import with Replace.`,
        );
      }

      for (const c of rankedImport) {
        const key = c.label.toLowerCase().trim();
        if (mode === 'merge' && existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        if (mode === 'merge' && imported >= room) {
          skipped += 1;
          continue;
        }
        order += 1;
        await this.prisma.clinicalConcept.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            category: c.category as any,
            label: c.label,
            description: c.description ?? null,
            importance: c.importance ?? 'MEDIUM',
            isAiGenerated: false,
            approved: false,
            confidence: 85,
            displayOrder: order,
            metadata: { source: 'chatgpt-import' } as Prisma.InputJsonValue,
          },
        });
        existingKeys.add(key);
        imported += 1;
      }
      return {
        target,
        imported,
        skipped,
        parseSource: 'markdown',
        mode,
        maxConcepts: MAX_CLINICAL_CONCEPTS,
      };
    }

    if (target === 'red-flags') {
      const parsed = parseRedFlagsScript(text);
      if (!parsed.length) {
        throw new BadRequestException(
          'No red flags found. Use "## Red Flag" blocks with Title / Severity / Question / Action.',
        );
      }
      const current = ((pathway as { redFlags?: unknown }).redFlags as any[]) ?? [];
      const manual = current.filter((r) => r?.source === 'USER' || !r?.source);
      const next =
        mode === 'replace'
          ? parsed
          : [
              ...manual,
              ...parsed.filter(
                (p) =>
                  !manual.some(
                    (m) =>
                      String(m.title ?? '')
                        .toLowerCase()
                        .trim() === p.title.toLowerCase().trim(),
                  ),
              ),
            ];
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: { redFlags: next as Prisma.InputJsonValue },
      });
      return {
        target,
        imported: parsed.length,
        skipped: Math.max(0, parsed.length - (next.length - (mode === 'replace' ? 0 : manual.length))),
        parseSource: 'markdown',
        mode,
      };
    }

    if (target === 'differentials') {
      const parsed = parseDifferentialsScript(text);
      if (!parsed.length) {
        throw new BadRequestException(
          'No differentials found. Use "## Differential" blocks with Condition: …',
        );
      }
      const current = ((pathway as { differentials?: unknown }).differentials as any[]) ?? [];
      const manual = current.filter((d) => d?.source === 'USER' || !d?.source);
      const next =
        mode === 'replace'
          ? parsed
          : [
              ...manual,
              ...parsed.filter(
                (p) =>
                  !manual.some(
                    (m) =>
                      String(m.condition ?? '')
                        .toLowerCase()
                        .trim() === String(p.condition).toLowerCase().trim(),
                  ),
              ),
            ];
      await this.prisma.clinicalPathway.update({
        where: { id: pathwayId },
        data: { differentials: next as Prisma.InputJsonValue },
      });
      return { target, imported: parsed.length, skipped: 0, parseSource: 'markdown', mode };
    }

    if (target === 'rules') {
      const parsed = parseRulesScript(text);
      if (!parsed.length) {
        throw new BadRequestException(
          'No rules found. Use "## Rule" blocks with Condition / Action / Message.',
        );
      }
      if (mode === 'replace') {
        await this.prisma.clinicalRule.deleteMany({ where: { pathwayId } });
      }
      let imported = 0;
      for (const rule of parsed) {
        await this.prisma.clinicalRule.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            condition: rule.condition,
            operator: rule.operator,
            value: rule.value,
            action: rule.action,
            severity: rule.severity,
            message: rule.message,
            details: rule.details,
            isAiGenerated: false,
            approved: false,
          },
        });
        imported += 1;
      }
      return { target, imported, skipped: 0, parseSource: 'markdown', mode };
    }

    if (target === 'treatments') {
      const parsed = parseTreatmentsScript(text);
      if (!parsed.length) {
        throw new BadRequestException(
          'No treatments found. Use "## Treatment" blocks with Medication: …',
        );
      }
      if (mode === 'replace') {
        // Replace authoring imports only — never remove library-linked pathway treatments.
        await this.prisma.clinicalTreatment.deleteMany({
          where: {
            pathwayId,
            NOT: { libraryLinkStatus: 'LINKED' },
          },
        });
      }
      const existing = await this.prisma.clinicalTreatment.findMany({
        where: { pathwayId, archivedAt: null },
        select: { medicationName: true },
      });
      const existingKeys = new Set(
        existing.map((t) => t.medicationName.toLowerCase().trim()),
      );
      let order =
        (
          await this.prisma.clinicalTreatment.aggregate({
            where: { pathwayId },
            _max: { displayOrder: true },
          })
        )._max.displayOrder ?? -1;
      let imported = 0;
      let skipped = 0;
      for (const t of parsed) {
        const name = t.medicationName;
        const key = name.toLowerCase().trim();
        if (mode === 'merge' && existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        order += 1;
        await this.prisma.clinicalTreatment.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            medicationName: name,
            genericName: t.genericName,
            brandName: t.brandName,
            category: t.category as any,
            recommendationLevel: t.recommendationLevel as any,
            strength: t.strength,
            dose: t.dose,
            route: t.route,
            frequency: t.frequency,
            duration: t.duration,
            quantity: t.quantity,
            directions: t.directions,
            clinicalIndication: t.clinicalIndication,
            clinicalNotes: t.clinicalNotes,
            guidelineReference: t.guidelineReference,
            evidenceStrength: t.evidenceStrength,
            provinceAvailability: t.provinceAvailability || 'ALL',
            eligibility: t.eligibility,
            ageRestriction: t.ageRestriction,
            pregnancyNotes: t.pregnancyNotes,
            pregnancyReason: t.pregnancyReason,
            breastfeedingNotes: t.breastfeedingNotes,
            renalAdjustment: t.renalAdjustment,
            renalAdjustmentReason: t.renalAdjustmentReason,
            renalSourceBasis: t.renalSourceBasis,
            renalDosingBasis: t.renalDosingBasis,
            renalDosingRules: t.renalDosingRules as unknown as Prisma.InputJsonValue,
            hepaticAdjustment: t.hepaticAdjustment,
            hepaticAdjustmentReason: t.hepaticAdjustmentReason,
            monitoring: t.monitoring,
            monitoringReason: t.monitoringReason,
            counsellingNotes: t.counsellingNotes,
            followUpAdvice: t.followUpAdvice,
            warnings: t.warnings,
            interactions: t.interactions,
            metadata: t.metadata as Prisma.InputJsonValue,
            libraryLinkStatus: 'MANUAL',
            isAiGenerated: true,
            approved: false,
            isActive: true,
            displayOrder: order,
          },
        });
        existingKeys.add(key);
        imported += 1;
      }
      return { target, imported, skipped, parseSource: 'markdown', mode };
    }

    if (target === 'counselling') {
      const parsed = parseCounsellingScript(text);
      if (!parsed.length) {
        throw new BadRequestException(
          'No counselling points found. Use category headings with bullet lists.',
        );
      }
      if (mode === 'replace') {
        await this.prisma.clinicalCounselling.deleteMany({ where: { pathwayId } });
      }
      const existing = await this.prisma.clinicalCounselling.findMany({
        where: { pathwayId },
        select: { point: true },
      });
      const existingKeys = new Set(existing.map((c) => c.point.toLowerCase().trim()));
      let order =
        (
          await this.prisma.clinicalCounselling.aggregate({
            where: { pathwayId },
            _max: { displayOrder: true },
          })
        )._max.displayOrder ?? -1;
      let imported = 0;
      let skipped = 0;
      for (const c of parsed) {
        const key = c.point.toLowerCase().trim();
        if (mode === 'merge' && existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        order += 1;
        await this.prisma.clinicalCounselling.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            category: c.category,
            point: c.point,
            detail: c.detail ?? null,
            outputSection:
              c.outputSection ?? resolveGuidanceSection(null, c.category),
            guidanceType: resolveGuidanceType(
              null,
              c.outputSection ?? resolveGuidanceSection(null, c.category),
              c.category,
            ),
            priority: 'alternative',
            isAiGenerated: false,
            approved: false,
            displayOrder: order,
          },
        });
        existingKeys.add(key);
        imported += 1;
      }
      return { target, imported, skipped, parseSource: 'markdown', mode };
    }

    throw new BadRequestException(`Unsupported import target: ${target}`);
  }

  private async clearAiPathwayContent(pathwayId: string) {
    await this.prisma.$transaction([
      this.prisma.clinicalQuestion.deleteMany({ where: { pathwayId, createdBy: 'AI' } }),
      this.prisma.clinicalRule.deleteMany({ where: { pathwayId, isAiGenerated: true } }),
      this.prisma.clinicalTreatment.deleteMany({ where: { pathwayId, isAiGenerated: true } }),
      this.prisma.clinicalCounselling.deleteMany({ where: { pathwayId, isAiGenerated: true } }),
      this.prisma.clinicalFollowup.deleteMany({ where: { pathwayId, isAiGenerated: true } }),
      this.prisma.clinicalSection.deleteMany({ where: { pathwayId, isAiGenerated: true } }),
    ]);
  }

  // ─── Fallbacks (no Python engine) ─────────────────────────────────────────

  private fallbackClassify(fileName: string, text: string) {
    const lower = `${fileName} ${text.slice(0, 2000)}`.toLowerCase();
    let documentType: ClinicalDocumentType = ClinicalDocumentType.OTHER;
    let suggestedRole: DocumentRole = DocumentRole.SUPPORTING;

    if (/algorithm|flowchart/.test(lower)) {
      documentType = ClinicalDocumentType.CLINICAL_ALGORITHM;
      suggestedRole = DocumentRole.REFERENCE_ONLY;
    } else if (/handout|patient info|patient education/.test(lower)) {
      documentType = ClinicalDocumentType.PATIENT_HANDOUT;
      suggestedRole = DocumentRole.REFERENCE_ONLY;
    } else if (/assessment form|par form|intake/.test(lower)) {
      documentType = ClinicalDocumentType.ASSESSMENT_FORM;
      suggestedRole = DocumentRole.REFERENCE_ONLY;
    } else if (/monograph|product monograph/.test(lower)) {
      documentType = ClinicalDocumentType.DRUG_MONOGRAPH;
      suggestedRole = DocumentRole.SUPPORTING;
    } else if (/guideline|cps|medsask|protocol/.test(lower)) {
      documentType = ClinicalDocumentType.CLINICAL_GUIDELINE;
      suggestedRole = DocumentRole.PRIMARY;
    }

    return {
      condition: '',
      documentType,
      authority: null,
      publicationYear: null,
      evidenceLevel: suggestedRole === DocumentRole.PRIMARY ? 'Primary' : 'Supporting',
      documentFamily: null,
      purpose: ['Diagnosis', 'Treatment'] as string[],
      suggestedRole,
      confidence: 55,
      rationale: 'Heuristic classification (assist engine unavailable).',
    };
  }

  private fallbackOverlap(
    docs: Array<{ id: string; suggestedRole: DocumentRole; fileName: string }>,
  ) {
    const primary =
      docs.find((d) => d.suggestedRole === DocumentRole.PRIMARY)?.id ?? docs[0].id;
    return docs
      .filter((d) => d.id !== primary)
      .map((d) => ({
        sourceDocumentId: primary,
        targetDocumentId: d.id,
        overlapPercent: 60,
        recommendedRole: d.suggestedRole,
        rationale: `Heuristic overlap vs primary document (${docs.find((x) => x.id === primary)?.fileName}).`,
      }));
  }

  /**
   * Fill empty RF / DDx / counselling / rules from document-derived concepts.
   * Concepts are already grounded in source docs — never invents new clinical facts.
   */
  private backfillKnowledgeFromConcepts(
    knowledge: ExtractedKnowledge,
    concepts: ClinicalConceptDto[],
    limits?: Record<string, number>,
  ): ExtractedKnowledge {
    const maxRf = limits?.redFlags ?? 8;
    const maxDdx = limits?.differentials ?? 8;
    const maxEdu = limits?.counselling ?? 10;
    const maxRules = limits?.rules ?? 12;

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const byCat = (cat: string) =>
      concepts
        .filter((c) => String(c.category).toUpperCase() === cat)
        .sort((a, b) => {
          const rank = (v?: string | null) =>
            v === 'HIGH' ? 0 : v === 'LOW' ? 2 : 1;
          return rank(a.importance) - rank(b.importance);
        });

    const redFlags = [...(knowledge.redFlags ?? [])];
    const seenRf = new Set(redFlags.map((r) => norm(r.title || '')));
    for (const c of byCat('RED_FLAG')) {
      if (redFlags.length >= maxRf) break;
      const label = c.label?.trim();
      if (!label || seenRf.has(norm(label))) continue;
      redFlags.push({
        title: label,
        description: c.description ?? label,
        severity:
          String((c.metadata as any)?.severity || '').toUpperCase() === 'EMERGENCY'
            ? 'EMERGENCY'
            : String((c.metadata as any)?.severity || '').toUpperCase() === 'WARNING'
              ? 'WARNING'
              : 'CRITICAL',
        action: normalizeRedFlagAction((c.metadata as any)?.action ?? c.description) ?? undefined,
        sourceReference: c.sources?.[0]?.sourceExcerpt ?? label,
      });
      seenRf.add(norm(label));
    }

    const differentials = [...(knowledge.differentials ?? [])];
    const seenDdx = new Set(differentials.map((d) => norm(d.condition || '')));
    for (const c of byCat('DIFFERENTIAL')) {
      if (differentials.length >= maxDdx) break;
      const label = c.label?.trim();
      if (!label || seenDdx.has(norm(label))) continue;
      differentials.push({
        condition: label,
        question: `Does the presentation suggest ${label}?`,
        whyItMatters: c.description ?? `Rule out ${label} before treating under this pathway.`,
        keySymptoms: c.description ?? undefined,
        recommendedAction:
          'Do not treat under this pathway; refer or redirect as indicated.',
        likelihood: 'LESS_COMMON',
      });
      seenDdx.add(norm(label));
    }

    const counselling = [...(knowledge.counselling ?? [])];
    const seenEdu = new Set(counselling.map((x) => norm(x.point || '')));
    for (const c of byCat('COUNSELLING')) {
      if (counselling.length >= maxEdu) break;
      const label = c.label?.trim();
      if (!label || seenEdu.has(norm(label))) continue;
      const normalized = normalizeCounsellingPoint({
        category: (c.metadata as any)?.category,
        point: label,
        detail: c.description,
      });
      if (!normalized) continue;
      counselling.push({
        category: normalized.category,
        point: normalized.point,
        detail: normalized.detail ?? undefined,
      });
      seenEdu.add(norm(label));
    }

    const rules = [...(knowledge.rules ?? [])];
    const questions = [...(knowledge.questions ?? [])];
    const seenRule = new Set(rules.map((r) => norm(r.message || r.condition || '')));

    for (const c of [...byCat('RED_FLAG'), ...byCat('ELIGIBILITY')]) {
      if (rules.length >= maxRules) break;
      const label = c.label?.trim();
      if (!label) continue;
      const msg = (c.description || label).trim();
      if (seenRule.has(norm(msg)) || seenRule.has(norm(label))) continue;

      let qText: string | undefined =
        questions.find((q) => norm(q.sourceReference || '') === norm(label))?.question ||
        questions.find((q) => norm(q.question).includes(norm(label)))?.question;

      if (!qText) {
        qText = `Is the following present: ${label}?`;
        questions.push({
          section:
            String(c.category).toUpperCase() === 'ELIGIBILITY'
              ? 'treatmentEligibility'
              : 'additionalAssessment',
          question: qText,
          description: c.description || '',
          helpText: '',
          type: 'YES_NO',
          required: true,
          sourceReference: label,
          confidence: c.confidence ?? 80,
          clinicalReason: c.description || label,
        });
      }

      const isElig = String(c.category).toUpperCase() === 'ELIGIBILITY';
      const exclude = /exclu|contra|not eligible|do not/i.test(`${label} ${msg}`);
      rules.push({
        questionRef: qText,
        condition: label,
        operator: 'yes',
        value: 'true',
        action: (isElig && exclude
          ? 'CONTRAINDICATED'
          : isElig
            ? 'SHOW_WARNING'
            : 'URGENT_REFERRAL') as any,
        severity: (isElig && exclude
          ? 'STOP'
          : c.importance === 'HIGH'
            ? 'CRITICAL'
            : 'WARNING') as any,
        message:
          msg !== label
            ? msg
            : `${label} — refer / do not prescribe under this pathway.`,
        details: c.sources?.[0]?.sourceExcerpt ?? msg,
      });
      seenRule.add(norm(msg));
      seenRule.add(norm(label));
    }

    this.logger.log(
      `Concept backfill → RF=${redFlags.length} DDx=${differentials.length} ` +
        `Edu=${counselling.length} Rules=${rules.length} Q=${questions.length}`,
    );

    return {
      ...knowledge,
      questions,
      rules,
      counselling,
      redFlags,
      differentials,
    };
  }

  private knowledgeToConcepts(
    knowledge: ExtractedKnowledge,
    fallbackDocId?: string,
  ): ClinicalConceptDto[] {
    const concepts: ClinicalConceptDto[] = [];
    const src = fallbackDocId
      ? [{ documentId: fallbackDocId, sourceExcerpt: null, sourcePage: null }]
      : [];

    for (const q of knowledge.questions || []) {
      concepts.push({
        category: 'DIAGNOSIS',
        label: q.question,
        description: q.description,
        importance: 'MEDIUM',
        confidence: q.confidence,
        aliases: [q.question],
        sources: src,
      });
    }
    for (const rf of knowledge.redFlags || []) {
      concepts.push({
        category: 'RED_FLAG',
        label: rf.title,
        description: rf.description,
        importance: 'HIGH',
        metadata: { severity: rf.severity, action: rf.action },
        aliases: [rf.title],
        sources: src,
      });
    }
    for (const d of knowledge.differentials || []) {
      concepts.push({
        category: 'DIFFERENTIAL',
        label: d.condition,
        description: d.distinguishingFeatures ?? d.keySymptoms,
        importance: 'MEDIUM',
        aliases: [d.condition],
        sources: src,
      });
    }
    for (const t of knowledge.treatments || []) {
      concepts.push({
        category: 'TREATMENT',
        label: t.medicationName,
        description: [t.dose, t.frequency, t.duration].filter(Boolean).join(' '),
        importance: 'HIGH',
        metadata: { dose: t.dose, route: t.route },
        aliases: [t.medicationName, t.genericName].filter(Boolean) as string[],
        sources: src,
      });
    }
    for (const c of knowledge.counselling || []) {
      concepts.push({
        category: 'COUNSELLING',
        label: c.point,
        description: c.detail,
        importance: 'MEDIUM',
        aliases: [c.point],
        sources: src,
      });
    }
    return concepts;
  }

  readStoredDocumentBuffer(fileUrl: string): Buffer | null {
    const uploadsDir = this.config.get('UPLOAD_DIR', './uploads');
    const name = basename(fileUrl.replace(/^\/uploads\//, ''));
    if (!name || name === '.' || name === '..') return null;

    const candidates = [
      join(uploadsDir, name),
      fileUrl.startsWith('/') ? fileUrl : join(uploadsDir, fileUrl),
    ];
    for (const path of candidates) {
      if (path && existsSync(path)) {
        return readFileSync(path);
      }
    }
    return null;
  }

  private async findPathwayOrThrow(id: string, user: RequestUser) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');
    return pathway;
  }

  private assertPathwayEditable(pathway: { status: PathwayStatus }) {
    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before editing it.');
    }
    if (pathway.status === PathwayStatus.AI_PROCESSING) {
      throw new BadRequestException('Please wait for processing to finish.');
    }
    if (pathway.status === PathwayStatus.ARCHIVED) {
      throw new BadRequestException('Archived pathways cannot be edited.');
    }
  }

  private async findEditablePathwayOrThrow(id: string, user: RequestUser) {
    const pathway = await this.findPathwayOrThrow(id, user);
    this.assertPathwayEditable(pathway);
    return pathway;
  }
}

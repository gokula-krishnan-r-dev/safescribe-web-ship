import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PathwayStatus, Prisma, QuestionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { PathwayAuthoringService } from './pathway-authoring.service';
import { TreatmentExcelImportParser } from './treatment-excel-import.parser';
import {
  CreatePathwayDto,
  UpdatePathwayDto,
  UpdatePathwayStatusDto,
  PublishPathwayDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateRuleDto,
  UpdateRuleDto,
  CreateTreatmentDto,
  UpdateTreatmentSectionEvidenceDto,
  CreateCounsellingDto,
  UpdateCounsellingDto,
  ListPathwaysQueryDto,
  RegenerateDto,
  ImportQuestionScriptDto,
  ImportChatGptScriptDto,
  UpdateRedFlagsDto,
  UpdateDifferentialsDto,
  ConfirmDocumentRolesDto,
  UpdateConceptDto,
  MergeConceptsDto,
  RegenerateFromConceptsDto,
  CreateEvidenceReferenceDto,
  LinkEvidenceFromLibraryDto,
  UpdateEvidenceReferenceDto,
  UpdatePresentationReviewSectionDto,
  ReplaceEvidenceMappingsDto,
  UpdatePathwayGovernanceDto,
  CreatePathwayReviewerDto,
  LinkReviewerFromLibraryDto,
  UpdatePathwayReviewerDto,
  PreviewReferencesImportDto,
  CommitReferencesImportDto,
  PreviewPresentationReviewImportDto,
  CommitPresentationReviewImportDto,
  PreviewRedFlagsImportDto,
  CommitRedFlagsImportDto,
  PreviewDifferentialsImportDto,
  CommitDifferentialsImportDto,
  PreviewTreatmentsImportDto,
  CommitTreatmentsImportDto,
} from './dto/clinical-pathways.dto';
import { Request } from 'express';
import { RequestUser } from '@/common/decorators/auth.decorator';
import {
  GUIDANCE_SECTION_META,
  isTypeCompatible,
  normalizeClinicalYesNo,
  normalizePathwayRouting,
  mergeRoutingSuggestions,
  parseRenalDosingRulesJson,
  resolveGuidanceSection,
  resolveGuidanceType,
  resolveGuidancePriority,
  validateRenalDosingRules,
  parsePresentationReviewState,
  parsePathwayGovernance,
  parseVisibilityRule,
  uniqueIdList,
  shouldRevokeVerificationOnEdit,
  computePublishingReadiness,
  REVIEWED_AREAS,
  evidenceRefIdsFromJsonItems,
  type GuidanceOutputSection,
} from '@safescript/shared';
import { AiConfigService } from '@/modules/ai-config/ai-config.service';
import { ReferenceLibraryService } from '@/modules/reference-library/reference-library.service';
import { ReviewerLibraryService } from '@/modules/reviewer-library/reviewer-library.service';
import { AI_PROMPT_KEYS } from '@/modules/ai-config/ai-config.defaults';
import OpenAI from 'openai';
import {
  findMatchingReference,
  importStatusForItem,
  parseReferenceLibraryMarkdown,
  type ParsedReferenceImportItem,
} from './references-import.parser';
import {
  normalizeQuestionKey,
  parsePresentationReviewImport,
  questionOverlapScore,
} from './presentation-review-import.parser';
import {
  normalizeRedFlagKey,
  parseRedFlagsImport,
  redFlagOverlapScore,
} from './red-flags-import.parser';
import {
  differentialOverlapScore,
  normalizeDifferentialKey,
  parseDifferentialsImport,
} from './differentials-import.parser';
import {
  normalizeTreatmentImportKey,
  parseTreatmentsImport,
} from './treatments-import.parser';
import { normalizeQuestionType } from './normalize-extracted';

@Injectable()
export class ClinicalPathwaysService {
  private readonly logger = new Logger(ClinicalPathwaysService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private config: ConfigService,
    private authoring: PathwayAuthoringService,
    private treatmentImportParser: TreatmentExcelImportParser,
    private aiConfig: AiConfigService,
    private referenceLibrary: ReferenceLibraryService,
    private reviewerLibrary: ReviewerLibraryService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private getClientInfo(req: Request) {
    return {
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
  }

  // ─── Pathways ────────────────────────────────────────────────────────────────

  async listPathways(query: ListPathwaysQueryDto, user: RequestUser) {
    const { search, status, province, category, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    const where: any = {
      deletedAt: null,
      // Super Admin (no tenantId) sees all pathways; tenant-scoped users see only their own
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { condition: { contains: search, mode: 'insensitive' } },
        { province: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      if (status === PathwayStatus.UNPUBLISHED) {
        where.status = {
          in: [
            PathwayStatus.DRAFT,
            PathwayStatus.AI_PROCESSING,
            PathwayStatus.AI_GENERATED,
            PathwayStatus.UNPUBLISHED,
          ],
        };
      } else {
        where.status = status;
      }
    }
    if (province) where.province = { contains: province, mode: 'insensitive' };
    if (category) where.category = { contains: category, mode: 'insensitive' };

    const allowedSortFields = ['name', 'createdAt', 'updatedAt', 'status', 'condition', 'province'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const [total, items] = await Promise.all([
      this.prisma.clinicalPathway.count({ where }),
      this.prisma.clinicalPathway.findMany({
        where,
        orderBy: { [safeSortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { questions: true, rules: true, treatments: true } },
          documents: { select: { id: true, fileName: true, processingStatus: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPathway(id: string, user: RequestUser) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        documents: { orderBy: { uploadedAt: 'asc' } },
        documentOverlaps: {
          include: {
            sourceDocument: { select: { id: true, fileName: true } },
            targetDocument: { select: { id: true, fileName: true } },
          },
        },
        concepts: {
          orderBy: [{ category: 'asc' }, { displayOrder: 'asc' }],
          include: {
            sources: {
              include: { document: { select: { id: true, fileName: true, role: true } } },
            },
          },
        },
        sections: { orderBy: { displayOrder: 'asc' } },
        questions: {
          orderBy: { displayOrder: 'asc' },
          include: { section: true, rules: true },
        },
        rules: { orderBy: { createdAt: 'asc' } },
        treatments: {
          orderBy: [{ category: 'asc' }, { recommendationLevel: 'asc' }, { displayOrder: 'asc' }],
          include: {
            treatmentLibraryItem: {
              select: {
                id: true,
                displayName: true,
                approvedVersionNumber: true,
                currentApprovedVersionId: true,
                isRetired: true,
                matchStatus: true,
                productFormDisplay: true,
                routeDisplay: true,
                regimenLabel: true,
              },
            },
          },
        },
        counsellings: { orderBy: { displayOrder: 'asc' } },
        followups: { orderBy: { displayOrder: 'asc' } },
        versions: { orderBy: { version: 'desc' }, take: 12 },
        publications: { orderBy: { publishedAt: 'desc' }, take: 3 },
        libraryReferences: { orderBy: { createdAt: 'asc' } },
        evidenceMappings: { orderBy: { createdAt: 'asc' } },
        reviewers: { orderBy: { reviewDate: 'desc' } },
        _count: {
          select: {
            questions: true,
            rules: true,
            treatments: true,
            counsellings: true,
            concepts: true,
          },
        },
      },
    });

    if (!pathway) throw new NotFoundException('Pathway not found');
    return {
      ...pathway,
      governance: parsePathwayGovernance(
        pathway.governance,
        pathway.primaryDocumentationReferenceId,
        pathway.secondaryDocumentationReferenceId,
      ),
      presentationReview: parsePresentationReviewState(pathway.presentationReview),
    };
  }

  async createPathway(dto: CreatePathwayDto, user: RequestUser, req: Request) {
    const pathway = await this.prisma.clinicalPathway.create({
      data: {
        ...dto,
        tenantId: user.tenantId ?? null,
        createdById: user.id,
        status: PathwayStatus.DRAFT,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CREATE',
      module: 'CLINICAL_PATHWAYS',
      newValue: pathway,
      ...this.getClientInfo(req),
    });

    return pathway;
  }

  async updatePathway(id: string, dto: UpdatePathwayDto, user: RequestUser, req: Request) {
    const existing = await this.findPathwayOrThrow(id, user);

    if (existing.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before editing it.');
    }

    const {
      lastClinicalReview,
      assessmentSectionsEnabled,
      customAssessment,
      routingAliases,
      routingPresentingComplaints,
      routingContextTerms,
      routingDescription,
      ...rest
    } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (lastClinicalReview !== undefined) {
      data.lastClinicalReview = lastClinicalReview ? new Date(lastClinicalReview) : null;
    }
    if (assessmentSectionsEnabled !== undefined) {
      data.assessmentSectionsEnabled = assessmentSectionsEnabled;
    }

    const routingTouched =
      routingAliases !== undefined ||
      routingPresentingComplaints !== undefined ||
      routingContextTerms !== undefined ||
      routingDescription !== undefined;

    if (routingTouched) {
      const normalized = normalizePathwayRouting({
        aliases: routingAliases ?? existing.routingAliases ?? [],
        presentingComplaints:
          routingPresentingComplaints ?? existing.routingPresentingComplaints ?? [],
        contextTerms: routingContextTerms ?? existing.routingContextTerms ?? [],
        description:
          routingDescription !== undefined
            ? routingDescription ?? ''
            : existing.routingDescription ?? '',
      });
      data.routingAliases = normalized.aliases;
      data.routingPresentingComplaints = normalized.presentingComplaints;
      data.routingContextTerms = normalized.contextTerms;
      data.routingDescription = normalized.description || null;
      data.routingMetadataUpdatedAt = new Date();
      data.routingMetadataUpdatedById = user.id;
    }

    const updated = await this.prisma.clinicalPathway.update({
      where: { id },
      data,
    });

    const customEnabled = assessmentSectionsEnabled?.additionalAssessment === true
      || (assessmentSectionsEnabled === undefined &&
        (existing.assessmentSectionsEnabled as { additionalAssessment?: boolean } | null)?.additionalAssessment === true);

    if (customEnabled || customAssessment) {
      const displayName =
        customAssessment?.displayName?.trim() ||
        ClinicalPathwaysService.ASSESSMENT_SECTIONS.additionalAssessment.displayName;
      const visibility =
        customAssessment?.visibility === undefined
          ? undefined
          : customAssessment.visibility;

      await this.upsertCustomAssessmentSection(id, {
        displayName,
        ...(visibility !== undefined ? { visibility } : {}),
        enabled: customEnabled !== false,
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE',
      module: 'CLINICAL_PATHWAYS',
      previousValue: existing,
      newValue: updated,
      ...this.getClientInfo(req),
    });

    return this.getPathway(id, user);
  }

  /**
   * AI-assisted draft of pathway matching terms. Never auto-publishes —
   * returns merged suggestions for admin review in the Overview UI.
   */
  async generateRoutingSuggestions(id: string, user: RequestUser, req: Request) {
    const pathway = await this.findPathwayOrThrow(id, user);

    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before editing routing metadata.');
    }

    if (!this.openai) {
      throw new BadRequestException(
        'Suggestions are temporarily unavailable. Add matching terms manually.',
      );
    }

    const concepts = await this.prisma.clinicalConcept.findMany({
      where: { pathwayId: id, approved: true },
      select: { label: true, category: true, aliases: true },
      take: 40,
      orderBy: { displayOrder: 'asc' },
    });

    const excerpts = await this.prisma.clinicalDocument.findMany({
      where: {
        pathwayId: id,
        roleConfirmed: true,
        role: { in: ['PRIMARY', 'SUPPORTING'] },
        extractedText: { not: null },
      },
      select: { fileName: true, extractedText: true },
      take: 3,
    });

    const existing = normalizePathwayRouting({
      aliases: pathway.routingAliases,
      presentingComplaints: pathway.routingPresentingComplaints,
      contextTerms: pathway.routingContextTerms,
      description: pathway.routingDescription ?? '',
    });

    const systemPrompt = this.aiConfig.getPrompt(
      AI_PROMPT_KEYS.PATHWAY_MATCHING_METADATA,
      'Generate pathway matching metadata as JSON only.',
    );
    const settings = this.aiConfig.getSettings();
    const model = settings.openaiFastModel || settings.openaiModel;

    const userPayload = {
      condition: pathway.condition,
      clinical_pathway_name: pathway.name,
      clinical_summary: pathway.aiSummary,
      description: pathway.description,
      concepts: concepts.map((c) => ({
        label: c.label,
        category: c.category,
        aliases: c.aliases,
      })),
      guideline_excerpts: excerpts.map((d) => ({
        fileName: d.fileName,
        excerpt: (d.extractedText ?? '').slice(0, 2500),
      })),
      existing_routing: existing,
    };

    let parsed: Record<string, unknown> = {};
    try {
      const response = await this.openai.chat.completions.create({
        model,
        max_completion_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Generate pathway matching metadata for this pathway.\n\n${JSON.stringify(userPayload)}`,
          },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? '{}';
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`generateRoutingSuggestions failed for ${id}`, err);
      throw new BadRequestException(
        'Could not generate suggested terms. Try again or enter terms manually.',
      );
    }

    const suggested = normalizePathwayRouting({
      aliases: (parsed.aliases as string[]) ?? [],
      presentingComplaints: (parsed.presenting_complaints as string[]) ?? [],
      contextTerms: (parsed.body_context_terms as string[]) ?? [],
      description: (parsed.routing_description as string) ?? '',
    });

    const merged = mergeRoutingSuggestions(existing, suggested);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'GENERATE_ROUTING_SUGGESTIONS',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId: id,
        suggestedCount:
          merged.aliases.length +
          merged.presentingComplaints.length +
          merged.contextTerms.length,
        newSuggestionKeys: merged.suggestedKeys ?? [],
      },
      ...this.getClientInfo(req),
    });

    return {
      aliases: merged.aliases,
      presentingComplaints: merged.presentingComplaints,
      contextTerms: merged.contextTerms,
      description: merged.description,
      suggestedKeys: merged.suggestedKeys ?? [],
      // Also expose snake_case for clients that follow the AI schema
      presenting_complaints: merged.presentingComplaints,
      body_context_terms: merged.contextTerms,
      routing_description: merged.description,
    };
  }

  async updateStatus(id: string, dto: UpdatePathwayStatusDto, user: RequestUser, req: Request) {
    const existing = await this.findPathwayOrThrow(id, user);
    this.validateStatusTransition(existing.status, dto.status);

    const updateData: any = { status: dto.status };

    if (dto.status === PathwayStatus.PUBLISHED) updateData.publishedAt = new Date();
    if (dto.status === PathwayStatus.UNPUBLISHED) {
      await this.prisma.clinicalPublication.updateMany({
        where: { pathwayId: id, isActive: true },
        data: { isActive: false },
      });
    }

    const updated = await this.prisma.clinicalPathway.update({
      where: { id },
      data: updateData,
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: `STATUS_CHANGE_${dto.status}`,
      module: 'CLINICAL_PATHWAYS',
      previousValue: { status: existing.status },
      newValue: { status: dto.status, reason: dto.reason },
      ...this.getClientInfo(req),
    });

    return updated;
  }

  async publishPathway(id: string, dto: PublishPathwayDto, user: RequestUser, req: Request) {
    const pathway = await this.findPathwayOrThrow(id, user);

    if (pathway.status === PathwayStatus.AI_PROCESSING) {
      throw new BadRequestException('Please wait for processing to finish before publishing');
    }

    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('This pathway is already published');
    }

    this.authoring.assertReadyToPublish(pathway);

    // Take snapshot
    const snapshot = await this.getPathwaySnapshot(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalPathway.update({
        where: { id },
        data: {
          status: PathwayStatus.PUBLISHED,
          publishedAt: new Date(),
          version: { increment: 1 },
        },
      });

      await tx.clinicalVersion.create({
        data: {
          pathwayId: id,
          version: pathway.version + 1,
          snapshot: snapshot ?? {},
          publishedAt: new Date(),
          publishedById: user.id,
          notes: dto.notes,
        },
      });

      await tx.clinicalPublication.updateMany({
        where: { pathwayId: id, isActive: true },
        data: { isActive: false },
      });

      await tx.clinicalPublication.create({
        data: {
          pathwayId: id,
          version: pathway.version + 1,
          publishedById: user.id,
          isActive: true,
          notes: dto.notes,
        },
      });
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'PUBLISH',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId: id, version: pathway.version + 1 },
      ...this.getClientInfo(req),
    });

    return this.getPathway(id, user);
  }

  async deletePathway(id: string, user: RequestUser, req: Request) {
    const existing = await this.findPathwayOrThrow(id, user);

    if (existing.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before deleting it.');
    }

    await this.prisma.clinicalPathway.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DELETE',
      module: 'CLINICAL_PATHWAYS',
      previousValue: existing,
      ...this.getClientInfo(req),
    });
  }

  // ─── Document Upload & AI Processing ─────────────────────────────────────────

  /** Single-file convenience (kept for backwards compat) */
  async processUploadedDocument(pathwayId: string, file: Express.Multer.File, user: RequestUser) {
    return this.processUploadedDocuments(pathwayId, [file], user);
  }

  async processUploadedDocuments(
    pathwayId: string,
    files: Express.Multer.File[],
    user: RequestUser,
  ) {
    return this.authoring.processUploadedDocuments(pathwayId, files, user);
  }

  async confirmDocumentRoles(
    pathwayId: string,
    dto: ConfirmDocumentRolesDto,
    user: RequestUser,
    req: Request,
  ) {
    return this.authoring.confirmDocumentRoles(
      pathwayId,
      dto.roles.map((r) => ({ documentId: r.documentId, role: r.role })),
      user,
      req,
      { startExtraction: dto.startExtraction !== false },
    );
  }

  async startConceptExtraction(pathwayId: string, user: RequestUser, req: Request) {
    return this.authoring.startConceptExtraction(pathwayId, user, req);
  }

  async regenerateFromConcepts(
    pathwayId: string,
    dto: RegenerateFromConceptsDto,
    user: RequestUser,
    req: Request,
  ) {
    return this.authoring.regenerateFromConcepts(pathwayId, user, req, dto.limits);
  }

  async approveClinicalReview(pathwayId: string, user: RequestUser, req: Request) {
    return this.authoring.approveClinicalReview(pathwayId, user, req);
  }

  async updateConcept(
    pathwayId: string,
    conceptId: string,
    dto: UpdateConceptDto,
    user: RequestUser,
    req: Request,
  ) {
    const updated = await this.authoring.updateConcept(pathwayId, conceptId, dto, user);
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE_CONCEPT',
      module: 'CLINICAL_PATHWAYS',
      newValue: updated,
      ...this.getClientInfo(req),
    });
    return updated;
  }

  async deleteConcept(pathwayId: string, conceptId: string, user: RequestUser, req: Request) {
    await this.authoring.deleteConcept(pathwayId, conceptId, user);
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DELETE_CONCEPT',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { pathwayId, conceptId },
      ...this.getClientInfo(req),
    });
  }

  async curateConcepts(pathwayId: string, user: RequestUser, req: Request) {
    const result = await this.authoring.curateConcepts(pathwayId, user);
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'CURATE_CONCEPTS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, ...result },
      ...this.getClientInfo(req),
    });
    return result;
  }

  async mergeConcepts(
    pathwayId: string,
    dto: MergeConceptsDto,
    user: RequestUser,
    req: Request,
  ) {
    const merged = await this.authoring.mergeConcepts(
      pathwayId,
      dto.targetConceptId,
      dto.sourceConceptIds,
      user,
      dto.canonicalLabel,
    );
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'MERGE_CONCEPTS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, ...dto },
      ...this.getClientInfo(req),
    });
    return merged;
  }

  async regeneratePathway(id: string, dto: RegenerateDto, user: RequestUser, req: Request) {
    const pathway = await this.findPathwayOrThrow(id, user);

    if (pathway.status === PathwayStatus.PUBLISHED) {
      throw new BadRequestException('Unpublish this pathway before regenerating it.');
    }

    // Prefer regenerating from stored concepts when available (no PDF re-read).
    const conceptCount = await this.prisma.clinicalConcept.count({ where: { pathwayId: id } });
    if (conceptCount > 0 && !dto.reparseDocuments) {
      return this.authoring.regenerateFromConcepts(id, user, req);
    }

    const result = await this.authoring.reclassifyExistingDocuments(id, user);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'REGENERATE',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId: id, instructions: dto.instructions, reparseDocuments: true },
      ...this.getClientInfo(req),
    });

    return result;
  }

  async importQuestionScript(
    id: string,
    dto: ImportQuestionScriptDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(id, user);

    const result = await this.authoring.importQuestionsFromScript(
      id,
      {
        text: dto.text,
        fileBase64: dto.fileBase64,
        fileName: dto.fileName,
        mode: dto.mode,
        sections: dto.sections,
        useAiFallback: dto.useAiFallback,
      },
      user,
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'IMPORT',
      module: 'CLINICAL_QUESTIONS',
      newValue: { pathwayId: id, ...result },
      ...this.getClientInfo(req),
    });

    return result;
  }

  async importChatGptScript(
    id: string,
    dto: ImportChatGptScriptDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(id, user);

    if (dto.target === 'references') {
      const text =
        dto.text?.trim() ||
        (dto.fileBase64
          ? Buffer.from(dto.fileBase64, 'base64').toString('utf8')
          : '');
      if (!text || text.length < 8) {
        throw new BadRequestException('Paste or upload a ChatGPT Reference Library response.');
      }
      const result = await this.importReferencesFromChatGpt(
        id,
        text,
        user,
        req,
        dto.mode === 'replace' ? 'replace' : 'merge',
      );
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'reference_chatgpt_import_completed',
        module: 'PATHWAY_EVIDENCE_REFERENCES',
        newValue: { pathwayId: id, ...result },
        ...this.getClientInfo(req),
      });
      return result;
    }

    if (dto.target === 'assessment') {
      return this.commitPresentationReviewImport(
        id,
        {
          text: dto.text,
          fileBase64: dto.fileBase64,
          fileName: dto.fileName,
          mode: dto.mode === 'replace' ? 'replace' : 'merge',
          confirmedReplace: true,
        },
        user,
        req,
      );
    }

    if (dto.target === 'red-flags') {
      return this.commitRedFlagsImport(
        id,
        {
          text: dto.text,
          fileBase64: dto.fileBase64,
          fileName: dto.fileName,
          mode: dto.mode === 'replace' ? 'replace' : 'merge',
          confirmedReplace: true,
        },
        user,
        req,
      );
    }

    if (dto.target === 'differentials') {
      return this.commitDifferentialsImport(
        id,
        {
          text: dto.text,
          fileBase64: dto.fileBase64,
          fileName: dto.fileName,
          mode: dto.mode === 'replace' ? 'replace' : 'merge',
          confirmedReplace: true,
        },
        user,
        req,
      );
    }

    if (dto.target === 'treatments') {
      return this.commitTreatmentsImport(
        id,
        {
          text: dto.text,
          fileBase64: dto.fileBase64,
          fileName: dto.fileName,
          mode: dto.mode === 'replace' ? 'replace' : 'merge',
          confirmedReplace: true,
        },
        user,
        req,
      );
    }

    const result = await this.authoring.importFromChatGpt(
      id,
      {
        target: dto.target,
        text: dto.text,
        fileBase64: dto.fileBase64,
        fileName: dto.fileName,
        mode: dto.mode,
        sections: dto.sections,
        useAiFallback: dto.useAiFallback,
      },
      user,
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'IMPORT',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId: id, ...result },
      ...this.getClientInfo(req),
    });

    return result;
  }

  // ─── Questions ────────────────────────────────────────────────────────────────

  async createQuestion(pathwayId: string, dto: CreateQuestionDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    const { sectionName, sectionId, visibilityRule, evidenceRefIds, ...rest } = dto;
    let resolvedSectionId = sectionId;

    const resolvedSectionName = sectionName || 'diagnosisConfirmation';
    if (resolvedSectionName || !resolvedSectionId) {
      const section = await this.ensureAssessmentSection(pathwayId, resolvedSectionName);
      resolvedSectionId = section.id;
    }

    const linkedIds = await this.assertLibraryReferenceIds(pathwayId, uniqueIdList(evidenceRefIds));

    const question = await this.prisma.clinicalQuestion.create({
      data: {
        pathwayId,
        tenantId: user.tenantId ?? null,
        ...rest,
        sectionId: resolvedSectionId,
        evidenceRefIds: linkedIds,
        visibilityRule: visibilityRule
          ? (parseVisibilityRule(visibilityRule) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        createdBy: 'USER',
        status: QuestionStatus.APPROVED,
        approved: true,
        approvedAt: new Date(),
      },
      include: { section: true },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'presentation_review_question_created',
      module: 'CLINICAL_QUESTIONS',
      newValue: question,
      ...this.getClientInfo(req),
    });

    return question;
  }

  async updateQuestion(pathwayId: string, questionId: string, dto: UpdateQuestionDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalQuestion.findFirst({
      where: { id: questionId, pathwayId, ...(user.tenantId ? { tenantId: user.tenantId } : {}) },
    });

    if (!existing) throw new NotFoundException('Question not found in this pathway');

    const { sectionName, visibilityRule, evidenceRefIds, ...rest } = dto;
    const updateData: Record<string, unknown> = { ...rest };
    if (sectionName) {
      const section = await this.ensureAssessmentSection(pathwayId, sectionName);
      updateData.sectionId = section.id;
    }
    if (evidenceRefIds) {
      updateData.evidenceRefIds = await this.assertLibraryReferenceIds(pathwayId, uniqueIdList(evidenceRefIds));
    }
    if (visibilityRule !== undefined) {
      const parsed = parseVisibilityRule(visibilityRule);
      updateData.visibilityRule = parsed ? (parsed as Prisma.InputJsonValue) : Prisma.JsonNull;
    }
    const contentChanged = this.questionContentChanged(existing, {
      ...updateData,
      sectionName,
    });
    if (contentChanged) {
      updateData.status = QuestionStatus.NEEDS_REVIEW;
      updateData.approved = false;
      updateData.approvedAt = null;
    } else if (dto.approved === true) {
      updateData.approvedAt = new Date();
    }

    const updated = await this.prisma.clinicalQuestion.update({
      where: { id: questionId },
      data: updateData,
      include: { section: true },
    });

    if (evidenceRefIds) {
      await this.syncQuestionEvidenceMappings(
        pathwayId,
        questionId,
        updated.evidenceRefIds,
        user.id,
      );
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: contentChanged
        ? 'presentation_review_question_marked_needs_review'
        : dto.approved === true
          ? 'presentation_review_question_approved'
          : 'presentation_review_question_updated',
      module: 'CLINICAL_QUESTIONS',
      previousValue: existing,
      newValue: updated,
      ...this.getClientInfo(req),
    });

    return updated;
  }

  async deleteQuestion(pathwayId: string, questionId: string, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalQuestion.findFirst({
      where: { id: questionId, pathwayId },
    });

    if (!existing) throw new NotFoundException('Question not found in this pathway');

    await this.prisma.clinicalQuestion.delete({ where: { id: questionId } });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DELETE',
      module: 'CLINICAL_QUESTIONS',
      previousValue: existing,
      ...this.getClientInfo(req),
    });
  }

  async approveAllQuestions(pathwayId: string, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    await this.prisma.clinicalQuestion.updateMany({
      where: { pathwayId, status: { not: QuestionStatus.REJECTED } },
      data: { approved: true, status: QuestionStatus.APPROVED, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_APPROVE_QUESTIONS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId },
      ...this.getClientInfo(req),
    });

    return { message: 'All questions approved' };
  }

  async reorderQuestions(pathwayId: string, orderedIds: string[], user: RequestUser) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!orderedIds.length) return { ok: true };

    const existing = await this.prisma.clinicalQuestion.findMany({
      where: { pathwayId, id: { in: orderedIds } },
      select: { id: true },
    });
    if (existing.length !== orderedIds.length) {
      throw new BadRequestException('One or more question IDs are invalid for this pathway');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.clinicalQuestion.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  async bulkApproveQuestions(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one question');

    const result = await this.prisma.clinicalQuestion.updateMany({
      where: {
        pathwayId,
        id: { in: ids },
        status: { not: QuestionStatus.REJECTED },
      },
      data: { approved: true, status: QuestionStatus.APPROVED, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_APPROVE_QUESTIONS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, ids, count: result.count },
      ...this.getClientInfo(req),
    });

    return { message: `${result.count} question(s) approved`, count: result.count };
  }

  async bulkDeleteQuestions(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one question');

    const existing = await this.prisma.clinicalQuestion.findMany({
      where: { pathwayId, id: { in: ids } },
      select: { id: true, question: true },
    });
    if (!existing.length) throw new NotFoundException('No matching questions found');

    await this.prisma.clinicalQuestion.deleteMany({
      where: { pathwayId, id: { in: existing.map((q) => q.id) } },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_DELETE_QUESTIONS',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { pathwayId, questions: existing },
      ...this.getClientInfo(req),
    });

    return { message: `${existing.length} question(s) removed`, count: existing.length };
  }

  // ─── Red Flags ──────────────────────────────────────────────────────────────

  async updateRedFlags(id: string, dto: UpdateRedFlagsDto, user: RequestUser, req: Request) {
    const existing = await this.findEditablePathwayOrThrow(id, user);
    const previousItems = asJsonItemMap((existing as { redFlags?: unknown }).redFlags);
    const previousById = evidenceRefIdsFromJsonItems((existing as { redFlags?: unknown }).redFlags);

    const pendingIds = uniqueIdList([
      ...dto.redFlags.flatMap((f) => f.evidenceRefIds ?? []),
      ...(dto.sectionEvidenceRefIds ?? []),
    ]);
    if (pendingIds.length) {
      await this.assertLibraryReferenceIds(id, pendingIds);
    }

    const redFlags = dto.redFlags.map((f) => {
      const itemId = f.id || randomUUID();
      const previous = previousItems.get(itemId);
      const question =
        f.question !== undefined
          ? f.question.trim() || (f.description ?? '').trim() || null
          : ((typeof previous?.question === 'string' && previous.question.trim()) ||
              (typeof previous?.description === 'string' && previous.description.trim()) ||
              (f.description ?? '').trim() ||
              null);
      const description = (f.description ?? '').trim() || question;
      const evidenceRefIds =
        f.evidenceRefIds !== undefined ? uniqueIdList(f.evidenceRefIds) : previousById.get(itemId) ?? [];
      const next = {
        ...(previous ?? {}),
        id: itemId,
        title: f.title,
        description,
        question,
        whyItMatters:
          f.whyItMatters !== undefined
            ? f.whyItMatters.trim() || null
            : typeof previous?.whyItMatters === 'string'
              ? previous.whyItMatters.trim() || null
              : null,
        actionNote:
          f.actionNote !== undefined
            ? f.actionNote.trim() || null
            : typeof previous?.actionNote === 'string'
              ? previous.actionNote.trim() || null
              : null,
        severity: f.severity,
        action: f.action ?? (typeof previous?.action === 'string' ? previous.action : null),
        required: f.required !== undefined ? f.required !== false : previous?.required !== false,
        source: 'USER' as const,
        evidenceRefIds,
      };
      const approved = redFlagContentChanged(previous, next) ? false : previous?.approved === true;
      return { ...next, approved };
    });

    const updated = await this.prisma.clinicalPathway.update({
      where: { id },
      data: { redFlags },
    });

    await this.syncRedFlagEvidenceMappings(
      id,
      redFlags.map((f) => ({ id: f.id, evidenceRefIds: uniqueIdList(f.evidenceRefIds) })),
      dto.sectionEvidenceRefIds !== undefined
        ? uniqueIdList(dto.sectionEvidenceRefIds)
        : undefined,
      user.id,
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE_RED_FLAGS',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { redFlags: (existing as any).redFlags ?? [] },
      newValue: { redFlags, sectionEvidenceRefIds: dto.sectionEvidenceRefIds },
      ...this.getClientInfo(req),
    });

    return updated;
  }

  // ─── Differential Diagnoses ───────────────────────────────────────────────────

  async updateDifferentials(id: string, dto: UpdateDifferentialsDto, user: RequestUser, req: Request) {
    const existing = await this.findEditablePathwayOrThrow(id, user);
    const previousItems = asJsonItemMap((existing as { differentials?: unknown }).differentials);
    const previousById = evidenceRefIdsFromJsonItems(
      (existing as { differentials?: unknown }).differentials,
    );

    const pendingIds = uniqueIdList([
      ...dto.differentials.flatMap((d) => d.evidenceRefIds ?? []),
      ...(dto.sectionEvidenceRefIds ?? []),
    ]);
    if (pendingIds.length) {
      await this.assertLibraryReferenceIds(id, pendingIds);
    }

    const differentials = dto.differentials.map((d) => {
      const itemId = d.id || randomUUID();
      const previous = previousItems.get(itemId);
      const evidenceRefIds =
        d.evidenceRefIds !== undefined
          ? uniqueIdList(d.evidenceRefIds)
          : previousById.get(itemId) ?? [];
      const next = {
        ...(previous ?? {}),
        id: itemId,
        condition: d.condition,
        question: jsonTextOrPrevious(d.question, previous?.question),
        whyItMatters: jsonTextOrPrevious(d.whyItMatters, previous?.whyItMatters),
        suggestedPathway: jsonTextOrPrevious(d.suggestedPathway, previous?.suggestedPathway),
        distinguishingFeatures: jsonTextOrPrevious(
          d.distinguishingFeatures,
          previous?.distinguishingFeatures,
        ),
        keySymptoms: jsonTextOrPrevious(d.keySymptoms, previous?.keySymptoms),
        recommendedAction: jsonTextOrPrevious(d.recommendedAction, previous?.recommendedAction),
        likelihood:
          d.likelihood ??
          (typeof previous?.likelihood === 'string' ? previous.likelihood : null),
        required: d.required !== undefined ? d.required !== false : previous?.required !== false,
        source: 'USER' as const,
        evidenceRefIds,
      };
      const approved = differentialContentChanged(previous, next)
        ? false
        : previous?.approved === true;
      return { ...next, approved };
    });

    const updated = await this.prisma.clinicalPathway.update({
      where: { id },
      data: { differentials },
    });

    await this.syncDifferentialEvidenceMappings(
      id,
      differentials.map((d) => ({ id: d.id, evidenceRefIds: uniqueIdList(d.evidenceRefIds) })),
      dto.sectionEvidenceRefIds !== undefined
        ? uniqueIdList(dto.sectionEvidenceRefIds)
        : undefined,
      user.id,
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'UPDATE_DIFFERENTIALS',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { differentials: (existing as any).differentials ?? [] },
      newValue: { differentials },
      ...this.getClientInfo(req),
    });

    return updated;
  }

  // ─── Rules ────────────────────────────────────────────────────────────────────

  async createRule(pathwayId: string, dto: CreateRuleDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    return this.prisma.clinicalRule.create({
      data: {
        pathwayId,
        tenantId: user.tenantId ?? null,
        ...dto,
        isAiGenerated: false,
        approved: true,
      },
    });
  }

  async updateRule(pathwayId: string, ruleId: string, dto: UpdateRuleDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalRule.findFirst({ where: { id: ruleId, pathwayId } });
    if (!existing) throw new NotFoundException('Rule not found in this pathway');

    return this.prisma.clinicalRule.update({ where: { id: ruleId }, data: dto });
  }

  async deleteRule(pathwayId: string, ruleId: string, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalRule.findFirst({ where: { id: ruleId, pathwayId } });
    if (!existing) throw new NotFoundException('Rule not found in this pathway');

    await this.prisma.clinicalRule.delete({ where: { id: ruleId } });
  }

  // ─── Treatments ───────────────────────────────────────────────────────────────

  async createTreatment(pathwayId: string, dto: CreateTreatmentDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    const category = dto.category ?? 'PRESCRIPTION';
    const maxOrder = await this.prisma.clinicalTreatment.aggregate({
      where: { pathwayId, category },
      _max: { displayOrder: true },
    });

    const normalized = this.normalizeTreatmentWarningFields(dto);
    const { metadata, sourceSnapshot: _ignoredSnapshot, pathwayOverrides, ...rest } = dto;
    const {
      treatmentLibraryItemId: requestedItemId,
      treatmentLibraryVersionId: _versionId,
      sourceVersionNumber: _versionNumber,
      sourcePayloadHash: _hash,
      libraryLinkStatus: _link,
      evidenceRefIds,
      documentationReferenceId,
      ...safeRest
    } = rest;
    const linkedEvidence = evidenceRefIds
      ? await this.assertLibraryReferenceIds(pathwayId, uniqueIdList(evidenceRefIds))
      : [];
    const librarySnapshot =
      requestedItemId && dto.libraryLinkStatus !== 'DETACHED'
        ? await this.resolveApprovedLibrarySnapshot(requestedItemId, pathwayId)
        : null;
    const linked = Boolean(librarySnapshot);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalTreatment.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          ...safeRest,
          ...normalized,
          category,
          displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
          isAiGenerated: false,
          approved: dto.approved ?? false,
          isActive: dto.isActive ?? true,
          evidenceRefIds: linkedEvidence,
          documentationReferenceId: documentationReferenceId?.trim() || null,
          libraryLinkStatus: linked ? 'LINKED' : (dto.libraryLinkStatus ?? 'MANUAL'),
          ...(librarySnapshot
            ? {
                treatmentLibraryItemId: librarySnapshot.treatmentLibraryItemId,
                treatmentLibraryVersionId: librarySnapshot.treatmentLibraryVersionId,
                sourceVersionNumber: librarySnapshot.sourceVersionNumber,
                sourcePayloadHash: librarySnapshot.sourcePayloadHash,
                sourceSnapshot: librarySnapshot.sourceSnapshot,
              }
            : {}),
          pathwayOverrides:
            pathwayOverrides === undefined
              ? undefined
              : (pathwayOverrides as Prisma.InputJsonValue),
          metadata:
            metadata === undefined
              ? undefined
              : (metadata as Prisma.InputJsonValue),
        } as Prisma.ClinicalTreatmentUncheckedCreateInput,
      });
      if (linked && librarySnapshot) {
        await tx.treatmentLibraryItem.updateMany({
          where: { id: librarySnapshot.treatmentLibraryItemId },
          data: { pathwayUsageCount: { increment: 1 } },
        });
      }
      return row;
    });

    if (linked && librarySnapshot) {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'TREATMENT_LIBRARY_TREATMENT_ADDED_TO_PATHWAY',
        module: 'CLINICAL_PATHWAYS',
        newValue: {
          pathwayId,
          treatmentId: created.id,
          treatmentLibraryItemId: librarySnapshot.treatmentLibraryItemId,
          treatmentLibraryVersionId: librarySnapshot.treatmentLibraryVersionId,
        },
        ...this.getClientInfo(req),
      });
    }

    await this.syncOneTreatmentEvidenceMappings(pathwayId, created.id, linkedEvidence, user.id);

    return created;
  }

  async updateTreatment(
    pathwayId: string,
    treatmentId: string,
    dto: Partial<CreateTreatmentDto>,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalTreatment.findFirst({
      where: { id: treatmentId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Treatment not found in this pathway');

    const normalized = this.normalizeTreatmentWarningFields(dto);
    const {
      metadata,
      sourceSnapshot: _ignoredSnapshot,
      pathwayOverrides,
      treatmentLibraryItemId: requestedItemId,
      treatmentLibraryVersionId: _versionId,
      sourceVersionNumber: _versionNumber,
      sourcePayloadHash: _hash,
      libraryLinkStatus,
      evidenceRefIds,
      documentationReferenceId,
      ...rest
    } = dto;

    const linkedEvidence =
      evidenceRefIds !== undefined
        ? await this.assertLibraryReferenceIds(pathwayId, uniqueIdList(evidenceRefIds))
        : undefined;
    const revokeApproval =
      existing.approved &&
      dto.approved !== true &&
      treatmentMaterialChanged(existing, { ...dto, evidenceRefIds: linkedEvidence });

    const wasLinked = existing.libraryLinkStatus === 'LINKED' && Boolean(existing.treatmentLibraryItemId);
    const detach = libraryLinkStatus === 'DETACHED' || libraryLinkStatus === 'MANUAL';
    const nextSnapshot =
      !detach && requestedItemId
        ? await this.resolveApprovedLibrarySnapshot(requestedItemId, pathwayId, treatmentId)
        : null;
    const nextItemId = nextSnapshot?.treatmentLibraryItemId ?? null;
    const previousItemId = existing.treatmentLibraryItemId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.clinicalTreatment.update({
        where: { id: treatmentId },
        data: {
          ...rest,
          ...normalized,
          ...(linkedEvidence !== undefined ? { evidenceRefIds: linkedEvidence } : {}),
          ...(documentationReferenceId !== undefined
            ? { documentationReferenceId: documentationReferenceId?.trim() || null }
            : {}),
          ...(revokeApproval ? { approved: false } : {}),
          ...(metadata !== undefined
            ? { metadata: metadata as Prisma.InputJsonValue }
            : {}),
          ...(pathwayOverrides !== undefined
            ? { pathwayOverrides: pathwayOverrides as Prisma.InputJsonValue }
            : {}),
          ...(detach
            ? { libraryLinkStatus }
            : nextSnapshot
              ? {
                  libraryLinkStatus: 'LINKED',
                  treatmentLibraryItemId: nextSnapshot.treatmentLibraryItemId,
                  treatmentLibraryVersionId: nextSnapshot.treatmentLibraryVersionId,
                  sourceVersionNumber: nextSnapshot.sourceVersionNumber,
                  sourcePayloadHash: nextSnapshot.sourcePayloadHash,
                  sourceSnapshot: nextSnapshot.sourceSnapshot,
                }
              : {}),
        } as Prisma.ClinicalTreatmentUncheckedUpdateInput,
      });

      if (wasLinked && previousItemId && (detach || (nextItemId && nextItemId !== previousItemId))) {
        await tx.treatmentLibraryItem.updateMany({
          where: { id: previousItemId, pathwayUsageCount: { gt: 0 } },
          data: { pathwayUsageCount: { decrement: 1 } },
        });
      }
      if (nextSnapshot && (!wasLinked || previousItemId !== nextItemId)) {
        await tx.treatmentLibraryItem.updateMany({
          where: { id: nextSnapshot.treatmentLibraryItemId },
          data: { pathwayUsageCount: { increment: 1 } },
        });
      }
      return row;
    });

    if (detach && wasLinked) {
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'TREATMENT_LIBRARY_LINK_REMOVED',
        module: 'CLINICAL_PATHWAYS',
        previousValue: {
          pathwayId,
          treatmentId,
          treatmentLibraryItemId: previousItemId ?? undefined,
        },
        ...this.getClientInfo(req),
      });
    }

    if (linkedEvidence !== undefined) {
      await this.syncOneTreatmentEvidenceMappings(pathwayId, treatmentId, linkedEvidence, user.id);
    }

    return updated;
  }

  async updateTreatmentSectionEvidence(
    pathwayId: string,
    dto: UpdateTreatmentSectionEvidenceDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const linkedIds = await this.assertLibraryReferenceIds(
      pathwayId,
      uniqueIdList(dto.evidenceRefIds ?? []),
    );
    await this.syncTreatmentSectionEvidenceMappings(pathwayId, linkedIds, user.id);
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'TREATMENT_SECTION_EVIDENCE_UPDATED',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, evidenceRefIds: linkedIds },
      ...this.getClientInfo(req),
    });
    return { evidenceRefIds: linkedIds };
  }

  private async resolveApprovedLibrarySnapshot(
    itemId: string,
    pathwayId: string,
    currentTreatmentId?: string,
  ) {
    const item = await this.prisma.treatmentLibraryItem.findUnique({ where: { id: itemId } });
    if (!item || item.isRetired) {
      throw new ConflictException('The selected Treatment Library item is retired or unavailable.');
    }
    if (item.listStatus !== 'APPROVED' || !item.currentApprovedVersionId) {
      throw new ConflictException('The selected Treatment Library item is not an approved reusable version.');
    }
    if (
      (item.category === 'PRESCRIPTION' || item.category === 'OTC') &&
      item.matchStatus !== 'MATCHED'
    ) {
      throw new BadRequestException(
        'This library treatment cannot be added until CCDD/DPD matching is complete.',
      );
    }
    const version = await this.prisma.treatmentLibraryVersion.findUnique({
      where: { id: item.currentApprovedVersionId },
    });
    if (!version || version.status !== 'APPROVED') {
      throw new ConflictException('The approved library version is no longer available.');
    }
    const duplicate = await this.prisma.clinicalTreatment.findFirst({
      where: {
        pathwayId,
        archivedAt: null,
        treatmentLibraryItemId: item.id,
        libraryLinkStatus: 'LINKED',
        ...(currentTreatmentId ? { id: { not: currentTreatmentId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('This library treatment is already on the pathway.');
    }
    return {
      treatmentLibraryItemId: item.id,
      treatmentLibraryVersionId: version.id,
      sourceVersionNumber: version.versionNumber,
      sourcePayloadHash: version.payloadHash,
      sourceSnapshot: version.payload as Prisma.InputJsonValue,
    };
  }

  getTreatmentImportTemplate(): Buffer {
    return this.treatmentImportParser.buildTemplate();
  }

  async previewTreatmentImport(
    pathwayId: string,
    file: Express.Multer.File,
    user: RequestUser,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const result = this.treatmentImportParser.validate(file.buffer, file.originalname);
    return {
      valid: result.valid,
      errors: result.errors,
      preview: result.preview,
      rowCount: result.rows.length,
    };
  }

  async importTreatmentsFromExcel(
    pathwayId: string,
    file: Express.Multer.File,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    const result = this.treatmentImportParser.validate(file.buffer, file.originalname);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Treatment import has validation errors',
        errors: result.errors,
      });
    }

    const maxOrder = await this.prisma.clinicalTreatment.aggregate({
      where: { pathwayId },
      _max: { displayOrder: true },
    });
    let order = (maxOrder._max.displayOrder ?? -1) + 1;

    const created = await this.prisma.$transaction(
      result.rows.map((row) =>
        this.prisma.clinicalTreatment.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            medicationName: row.medicationName,
            genericName: row.genericName,
            brandName: row.brandName,
            category: row.category as never,
            recommendationLevel: row.recommendationLevel as never,
            strength: row.strength,
            dose: row.dose,
            route: row.route,
            frequency: row.frequency,
            duration: row.duration,
            quantity: row.quantity,
            directions: row.directions,
            clinicalIndication: row.clinicalIndication,
            eligibility: row.eligibility,
            provinceAvailability: row.provinceAvailability,
            pregnancyNotes: row.pregnancyNotes,
            pregnancyReason: row.pregnancyReason,
            renalAdjustment: row.renalAdjustment,
            renalAdjustmentReason: row.renalAdjustmentReason,
            hepaticAdjustment: row.hepaticAdjustment,
            hepaticAdjustmentReason: row.hepaticAdjustmentReason,
            monitoring: row.monitoring,
            monitoringReason: row.monitoringReason,
            counsellingNotes: row.counsellingNotes,
            followUpAdvice: row.followUpAdvice,
            warnings: row.warnings,
            isAiGenerated: false,
            approved: false,
            isActive: true,
            displayOrder: order++,
            metadata: { source: 'excel-import' } as Prisma.InputJsonValue,
          },
        }),
      ),
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'IMPORT_TREATMENTS_EXCEL',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, count: created.length, fileName: file.originalname },
      ...this.getClientInfo(req),
    });

    return {
      created: created.length,
      treatments: created.map((t) => ({ id: t.id, medicationName: t.medicationName })),
    };
  }

  /** Normalize Yes/No flags and clear orphaned reasons when flag is No/empty. */
  private normalizeTreatmentWarningFields(
    dto: Partial<CreateTreatmentDto>,
  ): Partial<CreateTreatmentDto> {
    const out: Partial<CreateTreatmentDto> = {};

    const apply = (
      flagKey: 'pregnancyNotes' | 'renalAdjustment' | 'hepaticAdjustment' | 'monitoring',
      reasonKey:
        | 'pregnancyReason'
        | 'renalAdjustmentReason'
        | 'hepaticAdjustmentReason'
        | 'monitoringReason',
    ) => {
      if (!(flagKey in dto) && !(reasonKey in dto)) return;

      if (flagKey in dto) {
        const flag = normalizeClinicalYesNo(dto[flagKey] as string | null | undefined) || null;
        (out as Record<string, unknown>)[flagKey] = flag;
        if (flag !== 'Yes') {
          (out as Record<string, unknown>)[reasonKey] = null;
          if (flagKey === 'renalAdjustment') {
            (out as Record<string, unknown>).renalSourceBasis = 'NONE';
            (out as Record<string, unknown>).renalDosingBasis = 'NONE';
            (out as Record<string, unknown>).renalDosingRules = [];
          }
          return;
        }
      }

      if (reasonKey in dto) {
        const reason = (dto[reasonKey] as string | undefined | null)?.trim();
        (out as Record<string, unknown>)[reasonKey] = reason || null;
      }
    };

    apply('pregnancyNotes', 'pregnancyReason');
    apply('renalAdjustment', 'renalAdjustmentReason');
    apply('hepaticAdjustment', 'hepaticAdjustmentReason');
    apply('monitoring', 'monitoringReason');

    if ('renalDosingBasis' in dto || 'renalDosingRules' in dto || 'renalSourceBasis' in dto) {
      const flag =
        ('renalAdjustment' in dto
          ? normalizeClinicalYesNo(dto.renalAdjustment)
          : undefined) ??
        (out.renalAdjustment as string | undefined);
      if (flag === 'No') {
        out.renalSourceBasis = 'NONE';
        out.renalDosingBasis = 'NONE';
        out.renalDosingRules = [];
      } else {
        if ('renalSourceBasis' in dto) {
          out.renalSourceBasis = dto.renalSourceBasis ?? null;
        }
        if ('renalDosingBasis' in dto) {
          out.renalDosingBasis = dto.renalDosingBasis ?? null;
        }
        if ('renalDosingRules' in dto) {
          const parsed = parseRenalDosingRulesJson(dto.renalDosingRules ?? []);
          if (!parsed.ok) {
            throw new BadRequestException(parsed.error);
          }
          const issues = validateRenalDosingRules(parsed.rules);
          if (issues.length) {
            throw new BadRequestException(issues[0]?.message ?? 'Invalid renal dosing rules');
          }
          if (parsed.rules.length > 0 && (out.renalDosingBasis ?? dto.renalDosingBasis) === 'NONE') {
            throw new BadRequestException(
              'Renal dosing basis is required when structured renal rules are present',
            );
          }
          out.renalDosingRules = parsed.rules as unknown as CreateTreatmentDto['renalDosingRules'];
        }
      }
    }

    return out;
  }

  async reorderTreatments(
    pathwayId: string,
    orderedIds: string[],
    user: RequestUser,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!orderedIds.length) return { ok: true };

    const existing = await this.prisma.clinicalTreatment.findMany({
      where: { pathwayId, id: { in: orderedIds } },
      select: { id: true },
    });
    if (existing.length !== orderedIds.length) {
      throw new BadRequestException('One or more treatment IDs are invalid for this pathway');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.clinicalTreatment.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  async bulkApproveTreatments(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one treatment');

    const result = await this.prisma.clinicalTreatment.updateMany({
      where: { pathwayId, id: { in: ids } },
      data: { approved: true },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_APPROVE_TREATMENTS',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, ids, count: result.count },
      ...this.getClientInfo(req),
    });

    return { message: `${result.count} treatment(s) approved`, count: result.count };
  }

  async bulkDeleteTreatments(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one treatment');

    const existing = await this.prisma.clinicalTreatment.findMany({
      where: { pathwayId, id: { in: ids } },
      select: { id: true, medicationName: true },
    });
    if (!existing.length) throw new NotFoundException('No matching treatments found');

    const treatmentIds = existing.map((t) => t.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'treatment_options',
          mappingType: 'treatment',
          targetId: { in: treatmentIds },
        },
      });
      await tx.clinicalTreatment.deleteMany({
        where: { pathwayId, id: { in: treatmentIds } },
      });
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_DELETE_TREATMENTS',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { pathwayId, treatments: existing },
      ...this.getClientInfo(req),
    });

    return { message: `${existing.length} treatment(s) removed`, count: existing.length };
  }

  async archiveTreatment(pathwayId: string, treatmentId: string, user: RequestUser, archive = true) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalTreatment.findFirst({ where: { id: treatmentId, pathwayId } });
    if (!existing) throw new NotFoundException('Treatment not found in this pathway');

    return this.prisma.clinicalTreatment.update({
      where: { id: treatmentId },
      data: {
        isActive: !archive,
        archivedAt: archive ? new Date() : null,
      },
    });
  }

  async deleteTreatment(pathwayId: string, treatmentId: string, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalTreatment.findFirst({ where: { id: treatmentId, pathwayId } });
    if (!existing) throw new NotFoundException('Treatment not found in this pathway');

    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'treatment_options',
          mappingType: 'treatment',
          targetId: treatmentId,
        },
      });
      await tx.clinicalTreatment.delete({ where: { id: treatmentId } });
      if (existing.treatmentLibraryItemId && existing.libraryLinkStatus === 'LINKED') {
        await tx.treatmentLibraryItem.updateMany({
          where: { id: existing.treatmentLibraryItemId, pathwayUsageCount: { gt: 0 } },
          data: { pathwayUsageCount: { decrement: 1 } },
        });
      }
    });
  }

  // ─── Counselling ──────────────────────────────────────────────────────────────

  async createCounselling(pathwayId: string, dto: CreateCounsellingDto, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    const outputSection = resolveGuidanceSection(dto.outputSection, dto.category);
    const guidanceType = resolveGuidanceType(dto.guidanceType, outputSection, dto.category);
    if (!isTypeCompatible(outputSection, guidanceType)) {
      throw new BadRequestException('Guidance type is not valid for the selected output section');
    }
    const detail = (dto.detail ?? '').trim();
    if (detail.length < 10) {
      throw new BadRequestException('Patient wording must be at least 10 characters');
    }
    const maxOrder = await this.prisma.clinicalCounselling.aggregate({
      where: { pathwayId, outputSection, archivedAt: null },
      _max: { displayOrder: true },
    });

    const created = await this.prisma.clinicalCounselling.create({
      data: {
        pathwayId,
        tenantId: user.tenantId ?? null,
        category: dto.category?.trim() || GUIDANCE_SECTION_META[outputSection].categoryLegacy,
        point: dto.point.trim(),
        detail,
        descriptor: dto.descriptor?.trim() || null,
        outputSection,
        guidanceType,
        priority: resolveGuidancePriority(dto.priority),
        displayOrder: dto.displayOrder ?? (maxOrder._max.displayOrder ?? -1) + 1,
        legacySource: dto.legacySource?.trim() || null,
        legacyId: dto.legacyId?.trim() || null,
        isAiGenerated: false,
        approved: dto.approved !== false,
      },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'GUIDANCE_ITEM_CREATED',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, itemId: created.id, outputSection },
      ...this.getClientInfo(req),
    });
    return created;
  }

  async updateCounselling(
    pathwayId: string,
    itemId: string,
    dto: UpdateCounsellingDto,
    user: RequestUser,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalCounselling.findFirst({
      where: { id: itemId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Counselling item not found in this pathway');
    if (dto.itemVersion != null && dto.itemVersion !== existing.itemVersion) {
      throw new ConflictException(
        'This guidance item was updated elsewhere. Review the latest version before saving.',
      );
    }

    const outputSection = resolveGuidanceSection(
      dto.outputSection ?? existing.outputSection,
      dto.outputSection ? undefined : existing.category,
    );
    const guidanceType = resolveGuidanceType(
      dto.guidanceType ?? existing.guidanceType,
      outputSection,
      existing.category,
    );
    if (!isTypeCompatible(outputSection, guidanceType)) {
      throw new BadRequestException('Guidance type is not valid for the selected output section');
    }
    if (dto.detail != null && dto.detail.trim().length < 10) {
      throw new BadRequestException('Patient wording must be at least 10 characters');
    }

    return this.prisma.clinicalCounselling.update({
      where: { id: itemId },
      data: {
        point: dto.point?.trim() ?? existing.point,
        detail: dto.detail != null ? dto.detail.trim() : existing.detail,
        descriptor: dto.descriptor !== undefined ? dto.descriptor.trim() || null : existing.descriptor,
        outputSection,
        guidanceType,
        priority: dto.priority ? resolveGuidancePriority(dto.priority) : existing.priority,
        category: GUIDANCE_SECTION_META[outputSection].categoryLegacy,
        approved: dto.approved ?? existing.approved,
        itemVersion: { increment: 1 },
      },
    });
  }

  async deleteCounselling(pathwayId: string, itemId: string, user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalCounselling.findFirst({ where: { id: itemId, pathwayId } });
    if (!existing) throw new NotFoundException('Counselling item not found in this pathway');

    if (existing.approved) {
      await this.prisma.clinicalCounselling.update({
        where: { id: itemId },
        data: { archivedAt: new Date(), itemVersion: { increment: 1 } },
      });
      return;
    }
    await this.prisma.clinicalCounselling.delete({ where: { id: itemId } });
  }

  async restoreCounselling(pathwayId: string, itemId: string, user: RequestUser) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalCounselling.findFirst({ where: { id: itemId, pathwayId } });
    if (!existing) throw new NotFoundException('Counselling item not found in this pathway');
    return this.prisma.clinicalCounselling.update({
      where: { id: itemId },
      data: { archivedAt: null, itemVersion: { increment: 1 } },
    });
  }

  async reorderCounselling(
    pathwayId: string,
    orderedIds: string[],
    user: RequestUser,
    outputSection?: GuidanceOutputSection,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!orderedIds.length) return { ok: true };

    const existing = await this.prisma.clinicalCounselling.findMany({
      where: { pathwayId, id: { in: orderedIds } },
      select: { id: true, outputSection: true, category: true },
    });
    if (existing.length !== orderedIds.length) {
      throw new BadRequestException('One or more counselling IDs are invalid for this pathway');
    }
    if (outputSection) {
      const mismatch = existing.some(
        (row) => resolveGuidanceSection(row.outputSection, row.category) !== outputSection,
      );
      if (mismatch) {
        throw new BadRequestException('Reorder IDs must belong to the same output section');
      }
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.clinicalCounselling.update({
          where: { id },
          data: { displayOrder: index },
        }),
      ),
    );
    return { ok: true };
  }

  async bulkApproveCounselling(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one guidance item');

    const result = await this.prisma.clinicalCounselling.updateMany({
      where: { pathwayId, id: { in: ids }, archivedAt: null },
      data: { approved: true },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_APPROVE_COUNSELLING',
      module: 'CLINICAL_PATHWAYS',
      newValue: { pathwayId, ids, count: result.count },
      ...this.getClientInfo(req),
    });

    return { message: `${result.count} guidance item(s) approved`, count: result.count };
  }

  async bulkDeleteCounselling(pathwayId: string, ids: string[], user: RequestUser, req: Request) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    if (!ids.length) throw new BadRequestException('Select at least one guidance item');

    const existing = await this.prisma.clinicalCounselling.findMany({
      where: { pathwayId, id: { in: ids } },
      select: { id: true, point: true, approved: true, archivedAt: true },
    });
    if (!existing.length) throw new NotFoundException('No matching guidance items found');

    const toArchive = existing.filter((row) => row.approved && !row.archivedAt);
    const toDelete = existing.filter((row) => !row.approved || row.archivedAt);

    if (toArchive.length) {
      await this.prisma.clinicalCounselling.updateMany({
        where: { pathwayId, id: { in: toArchive.map((row) => row.id) } },
        data: { archivedAt: new Date() },
      });
    }
    if (toDelete.length) {
      await this.prisma.clinicalCounselling.deleteMany({
        where: { pathwayId, id: { in: toDelete.map((row) => row.id) } },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'BULK_DELETE_COUNSELLING',
      module: 'CLINICAL_PATHWAYS',
      previousValue: { pathwayId, items: existing },
      ...this.getClientInfo(req),
    });

    return {
      message: `${existing.length} guidance item(s) removed`,
      count: existing.length,
      archived: toArchive.length,
      deleted: toDelete.length,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private static readonly ASSESSMENT_SECTIONS: Record<
    string,
    { displayName: string; description: string; order: number }
  > = {
    diagnosisConfirmation: {
      displayName: 'Diagnosis Confirmation',
      description: 'Questions that confirm the clinical diagnosis',
      order: 0,
    },
    additionalAssessment: {
      displayName: 'Custom Assessment',
      description: 'Optional context-specific questions (admin-named, with optional visibility rules)',
      order: 1,
    },
    treatmentEligibility: {
      displayName: 'Treatment Eligibility',
      description: 'Criteria that determine which treatments are appropriate',
      order: 2,
    },
  };

  /** Upsert a canonical Assessment ClinicalSection for the pathway */
  private async ensureAssessmentSection(pathwayId: string, sectionName: string) {
    const meta = ClinicalPathwaysService.ASSESSMENT_SECTIONS[sectionName];
    if (!meta) {
      throw new BadRequestException(
        `Unknown assessment section "${sectionName}". Use diagnosisConfirmation, additionalAssessment, or treatmentEligibility.`,
      );
    }

    const existing = await this.prisma.clinicalSection.findFirst({
      where: { pathwayId, name: sectionName },
    });
    if (existing) return existing;

    return this.prisma.clinicalSection.create({
      data: {
        pathwayId,
        name: sectionName,
        displayName: meta.displayName,
        description: meta.description,
        displayOrder: meta.order,
        isAiGenerated: false,
      },
    });
  }

  private async upsertCustomAssessmentSection(
    pathwayId: string,
    opts: {
      displayName: string;
      visibility?: unknown;
      enabled: boolean;
    },
  ) {
    if (!opts.enabled) return;

    const existing = await this.prisma.clinicalSection.findFirst({
      where: { pathwayId, name: 'additionalAssessment' },
    });

    const meta = ClinicalPathwaysService.ASSESSMENT_SECTIONS.additionalAssessment;
    const visibilityValue =
      opts.visibility === undefined
        ? undefined
        : opts.visibility === null
          ? Prisma.DbNull
          : (opts.visibility as Prisma.InputJsonValue);

    const data: Prisma.ClinicalSectionUpdateInput = {
      displayName: opts.displayName || meta.displayName,
      description: meta.description,
      displayOrder: meta.order,
      ...(visibilityValue !== undefined ? { visibility: visibilityValue } : {}),
      isAiGenerated: false,
    };

    if (existing) {
      await this.prisma.clinicalSection.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    await this.prisma.clinicalSection.create({
      data: {
        pathwayId,
        name: 'additionalAssessment',
        displayName: opts.displayName || meta.displayName,
        description: meta.description,
        displayOrder: meta.order,
        visibility: visibilityValue === undefined ? Prisma.DbNull : visibilityValue,
        isAiGenerated: false,
      },
    });
  }

  private async findPathwayOrThrow(id: string, user: RequestUser) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: {
        id,
        deletedAt: null,
        // Tenant-scoped users can only access their own pathways
        ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      },
    });

    if (!pathway) throw new NotFoundException('Pathway not found');
    return pathway;
  }

  /** Block content mutations while a pathway is live, processing, or archived. */
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

  private validateStatusTransition(current: PathwayStatus, next: PathwayStatus) {
    if (current === PathwayStatus.AI_PROCESSING) {
      throw new BadRequestException('Please wait for processing to finish before changing status');
    }

    if (next === PathwayStatus.PUBLISHED) {
      if (current === PathwayStatus.PUBLISHED) {
        throw new BadRequestException('This pathway is already published');
      }
      return;
    }

    if (next === PathwayStatus.UNPUBLISHED) {
      if (current !== PathwayStatus.PUBLISHED) {
        throw new BadRequestException('Only published pathways can be unpublished');
      }
      return;
    }

    if (next === PathwayStatus.ARCHIVED) {
      if (current === PathwayStatus.PUBLISHED) {
        throw new BadRequestException('Unpublish this pathway before archiving it');
      }
      return;
    }

    throw new BadRequestException(`Cannot change status from ${current} to ${next}`);
  }

  private async getPathwaySnapshot(id: string) {
    const pathway = await this.prisma.clinicalPathway.findUnique({
      where: { id },
      include: {
        sections: true,
        questions: true,
        rules: true,
        treatments: true,
        counsellings: true,
        followups: true,
      },
    });
    return pathway;
  }

  async getStats(user: RequestUser) {
    const where = {
      deletedAt: null,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    };

    const [total, byStatus] = await Promise.all([
      this.prisma.clinicalPathway.count({ where }),
      this.prisma.clinicalPathway.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
    ]);

    const statusCounts = Object.fromEntries(
      byStatus.map((b) => [b.status, b._count]),
    );

    return { total, byStatus: statusCounts };
  }

  async getPresentationReview(pathwayId: string, user: RequestUser) {
    const pathway = await this.getPathway(pathwayId, user);
    const sectionState = parsePresentationReviewState(pathway.presentationReview);
    const library = pathway.libraryReferences ?? [];
    const libraryById = new Map(library.map((ref) => [ref.id, ref]));
    const questions = [...(pathway.questions ?? [])].sort(
      (a, b) => a.displayOrder - b.displayOrder,
    );

    const reviewerUser = pathway.clinicallyReviewedById
      ? await this.prisma.user.findUnique({
          where: { id: pathway.clinicallyReviewedById },
          select: { firstName: true, lastName: true },
        })
      : null;

    const lastReviewed = pathway.lastClinicalReview ?? pathway.clinicallyReviewedAt;
    const internalCompleted = Boolean(lastReviewed);
    const independentDocs = (pathway.documents ?? []).filter(
      (doc) =>
        String(doc.role ?? '').toUpperCase() === 'REFERENCE_ONLY' &&
        /independent|peer.?review/i.test(`${doc.authority ?? ''} ${doc.fileName}`),
    );

    return {
      section: {
        title: 'Presentation Review',
        evidenceRefs: sectionState.sectionEvidenceRefIds
          .map((id) => libraryById.get(id))
          .filter(Boolean),
        governance: {
          internalReview: {
            status: internalCompleted ? 'completed' : lastReviewed ? 'pending' : 'not_started',
            reviewBody: null,
            reviewers: reviewerUser
              ? [
                  {
                    fullName: `${reviewerUser.firstName} ${reviewerUser.lastName}`.trim(),
                    credentials: null,
                    reviewedAt: lastReviewed,
                  },
                ]
              : [],
            reviewDate: lastReviewed,
          },
          externalPeerReview: {
            status: independentDocs.length ? 'completed' : 'not_started',
            reviewers: independentDocs
              .map((doc) => ({
                fullName: (doc.authority || '').trim(),
                credentials: null,
                reviewedAt: doc.processedAt ?? doc.uploadedAt,
              }))
              .filter((row) => row.fullName),
            reviewDate: independentDocs[0]?.processedAt ?? independentDocs[0]?.uploadedAt ?? null,
          },
        },
      },
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.question,
        whyItMatters: q.description,
        pharmacistTip: q.helpText,
        required: q.required,
        visibilityRule: parseVisibilityRule(q.visibilityRule),
        evidenceRefs: uniqueIdList(q.evidenceRefIds)
          .map((id) => libraryById.get(id))
          .filter(Boolean),
      })),
      libraryReferences: library,
      versionHistory: (pathway.versions ?? []).map((version) => ({
        version: `v${version.version}`,
        effectiveDate: version.publishedAt,
        changeSummary: version.notes?.trim() || (version.version === pathway.version ? 'Current version' : 'Published pathway version'),
      })),
    };
  }

  async updatePresentationReviewSection(
    pathwayId: string,
    dto: UpdatePresentationReviewSectionDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: { presentationReview: true },
    });
    if (!existing) throw new NotFoundException('Pathway not found');

    const current = parsePresentationReviewState(existing.presentationReview);
    const nextIds = dto.sectionEvidenceRefIds
      ? await this.assertLibraryReferenceIds(pathwayId, uniqueIdList(dto.sectionEvidenceRefIds))
      : current.sectionEvidenceRefIds;

    const updated = await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        presentationReview: {
          ...current,
          sectionEvidenceRefIds: nextIds,
        } as Prisma.InputJsonValue,
      },
      select: { id: true, presentationReview: true },
    });

    await this.syncSectionEvidenceMappings(pathwayId, nextIds, user.id);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'presentation_review_section_reference_linked',
      module: 'CLINICAL_PATHWAYS',
      previousValue: current,
      newValue: parsePresentationReviewState(updated.presentationReview),
      ...this.getClientInfo(req),
    });

    return parsePresentationReviewState(updated.presentationReview);
  }

  async createEvidenceReference(
    pathwayId: string,
    dto: CreateEvidenceReferenceDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const status = dto.status ?? 'needs_review';
    const master = await this.referenceLibrary.upsertFromCitation(
      {
        citationTitle: dto.citationTitle,
        organization: dto.organization,
        edition: dto.edition,
        publicationYear: dto.publicationYear,
        url: dto.url,
        doi: dto.doi,
        documentType: dto.documentType,
        jurisdiction: dto.jurisdiction,
        referenceType: dto.referenceType,
        status,
        verifiedBy: dto.verifiedBy,
        verificationDate: dto.verificationDate,
        importSource: 'manual',
        clinicalUseTags: dto.clinicalUseTags,
        suggestedSections: dto.suggestedSections,
        documentationCandidate: dto.documentationCandidate,
        verificationRequired: dto.verificationRequired,
        notes: dto.notes,
      },
      user,
    );

    const existingLink = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { pathwayId, libraryItemId: master.id },
    });
    if (existingLink) {
      throw new ConflictException('This master reference is already linked to this pathway.');
    }
    if (master.isRetired) {
      throw new ConflictException(
        'This citation exists in the master library but is retired. Restore it from Reference Library first.',
      );
    }

    const created = await this.prisma.pathwayEvidenceReference.create({
      data: {
        pathwayId,
        tenantId: user.tenantId ?? null,
        libraryItemId: master.id,
        citationTitle: dto.citationTitle.trim(),
        organization: dto.organization.trim(),
        edition: dto.edition?.trim() || null,
        publicationYear: dto.publicationYear ?? null,
        url: dto.url?.trim() || null,
        doi: dto.doi?.trim() || null,
        documentType: dto.documentType.trim(),
        jurisdiction: dto.jurisdiction.trim(),
        referenceType: dto.referenceType?.trim() || 'source',
        status,
        verifiedBy: status === 'verified' ? dto.verifiedBy?.trim() || null : null,
        verificationDate:
          status === 'verified'
            ? dto.verificationDate
              ? new Date(dto.verificationDate)
              : new Date()
            : null,
        importSource: 'manual',
        clinicalUseTags: dto.clinicalUseTags ?? [],
        documentationCandidate: Boolean(dto.documentationCandidate),
        verificationRequired: Boolean(dto.verificationRequired),
        notes: dto.notes?.trim()?.slice(0, 500) || null,
        createdById: user.id,
      },
    });
    await this.referenceLibrary.recountUsage(master.id);

    if (dto.suggestedSections?.length) {
      await this.prisma.pathwayEvidenceMapping.createMany({
        data: dto.suggestedSections.map((section) => ({
          pathwayId,
          referenceId: created.id,
          section,
          mappingType: 'section',
          targetId: '',
          suggested: false,
          createdById: user.id,
        })),
        skipDuplicates: true,
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_created',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      newValue: created,
      ...this.getClientInfo(req),
    });

    return created;
  }

  async linkEvidenceFromLibrary(
    pathwayId: string,
    dto: LinkEvidenceFromLibraryDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const master = await this.prisma.evidenceReferenceLibraryItem.findUnique({
      where: { id: dto.libraryItemId },
    });
    if (!master) throw new NotFoundException('Master reference not found');
    if (master.isRetired) {
      throw new ConflictException('This master reference is retired and cannot be linked.');
    }

    const existing = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { pathwayId, libraryItemId: master.id },
    });
    if (existing) return existing;

    const created = await this.prisma.pathwayEvidenceReference.create({
      data: {
        pathwayId,
        tenantId: user.tenantId ?? null,
        libraryItemId: master.id,
        ...this.referenceLibrary.snapshot(master),
        importSource: 'library',
        createdById: user.id,
      },
    });
    await this.referenceLibrary.recountUsage(master.id);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_linked_from_library',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      newValue: created,
      ...this.getClientInfo(req),
    });

    return created;
  }

  async duplicateEvidenceReference(
    pathwayId: string,
    referenceId: string,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { id: referenceId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Reference not found in this pathway');

    const created = await this.prisma.pathwayEvidenceReference.create({
      data: {
        pathwayId,
        tenantId: existing.tenantId,
        citationTitle: `${existing.citationTitle} (copy)`,
        organization: existing.organization,
        edition: existing.edition,
        publicationYear: existing.publicationYear,
        url: existing.url,
        doi: existing.doi,
        documentType: existing.documentType,
        jurisdiction: existing.jurisdiction,
        referenceType: existing.referenceType,
        status: 'needs_review',
        verifiedBy: null,
        verificationDate: null,
        importSource: 'manual',
        createdById: user.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_created',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      newValue: { ...created, duplicatedFrom: referenceId },
      ...this.getClientInfo(req),
    });

    return created;
  }

  async updateEvidenceReference(
    pathwayId: string,
    referenceId: string,
    dto: UpdateEvidenceReferenceDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { id: referenceId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Reference not found in this pathway');

    const revoke = shouldRevokeVerificationOnEdit(existing, {
      citationTitle: dto.citationTitle,
      organization: dto.organization,
      edition: dto.edition,
      publicationYear: dto.publicationYear,
      url: dto.url,
      doi: dto.doi,
      documentType: dto.documentType,
      jurisdiction: dto.jurisdiction,
    });

    let nextStatus = dto.status ?? existing.status;
    if (revoke && nextStatus === 'verified') nextStatus = 'needs_review';

    const updated = await this.prisma.pathwayEvidenceReference.update({
      where: { id: referenceId },
      data: {
        ...(dto.citationTitle !== undefined ? { citationTitle: dto.citationTitle.trim() } : {}),
        ...(dto.organization !== undefined ? { organization: dto.organization?.trim() || null } : {}),
        ...(dto.edition !== undefined ? { edition: dto.edition?.trim() || null } : {}),
        ...(dto.publicationYear !== undefined ? { publicationYear: dto.publicationYear } : {}),
        ...(dto.url !== undefined ? { url: dto.url?.trim() || null } : {}),
        ...(dto.doi !== undefined ? { doi: dto.doi?.trim() || null } : {}),
        ...(dto.documentType !== undefined ? { documentType: dto.documentType?.trim() || null } : {}),
        ...(dto.jurisdiction !== undefined ? { jurisdiction: dto.jurisdiction?.trim() || null } : {}),
        ...(dto.referenceType !== undefined ? { referenceType: dto.referenceType.trim() } : {}),
        ...(dto.clinicalUseTags !== undefined ? { clinicalUseTags: dto.clinicalUseTags } : {}),
        ...(dto.documentationCandidate !== undefined
          ? { documentationCandidate: dto.documentationCandidate }
          : {}),
        ...(dto.verificationRequired !== undefined
          ? { verificationRequired: dto.verificationRequired }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim()?.slice(0, 500) || null } : {}),
        status: nextStatus,
        verifiedBy:
          nextStatus === 'verified'
            ? dto.verifiedBy !== undefined
              ? dto.verifiedBy?.trim() || null
              : existing.verifiedBy
            : revoke
              ? null
              : dto.verifiedBy !== undefined
                ? dto.verifiedBy?.trim() || null
                : existing.verifiedBy,
        verificationDate:
          nextStatus === 'verified'
            ? dto.verificationDate
              ? new Date(dto.verificationDate)
              : existing.verificationDate ?? new Date()
            : revoke
              ? null
              : dto.verificationDate !== undefined
                ? dto.verificationDate
                  ? new Date(dto.verificationDate)
                  : null
                : existing.verificationDate,
      },
    });

    if (dto.suggestedSections !== undefined) {
      await this.prisma.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, referenceId, mappingType: 'section', targetId: '' },
      });
      if (dto.suggestedSections.length) {
        await this.prisma.pathwayEvidenceMapping.createMany({
          data: dto.suggestedSections.map((section) => ({
            pathwayId,
            referenceId,
            section,
            mappingType: 'section',
            targetId: '',
            suggested: false,
            createdById: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: nextStatus === 'verified' && existing.status !== 'verified' ? 'reference_verified' : 'reference_updated',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      previousValue: existing,
      newValue: updated,
      ...this.getClientInfo(req),
    });

    return updated;
  }

  async archiveEvidenceReference(
    pathwayId: string,
    referenceId: string,
    user: RequestUser,
    req: Request,
  ) {
    return this.updateEvidenceReference(
      pathwayId,
      referenceId,
      { status: 'archived' },
      user,
      req,
    );
  }

  async deleteEvidenceReference(
    pathwayId: string,
    referenceId: string,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { id: referenceId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Reference not found in this pathway');

    await this.prisma.$transaction(async (tx) => {
      await this.unlinkReferenceFromContent(tx, pathwayId, referenceId);
      await tx.pathwayEvidenceMapping.deleteMany({ where: { pathwayId, referenceId } });
      const pathway = await tx.clinicalPathway.findFirst({
        where: { id: pathwayId },
        select: {
          primaryDocumentationReferenceId: true,
          secondaryDocumentationReferenceId: true,
          presentationReview: true,
        },
      });
      if (
        pathway?.primaryDocumentationReferenceId === referenceId ||
        pathway?.secondaryDocumentationReferenceId === referenceId
      ) {
        await tx.clinicalPathway.update({
          where: { id: pathwayId },
          data: {
            ...(pathway.primaryDocumentationReferenceId === referenceId
              ? { primaryDocumentationReferenceId: null }
              : {}),
            ...(pathway.secondaryDocumentationReferenceId === referenceId
              ? { secondaryDocumentationReferenceId: null }
              : {}),
          },
        });
      }
      const section = parsePresentationReviewState(pathway?.presentationReview);
      if (section.sectionEvidenceRefIds.includes(referenceId)) {
        await tx.clinicalPathway.update({
          where: { id: pathwayId },
          data: {
            presentationReview: {
              sectionEvidenceRefIds: section.sectionEvidenceRefIds.filter((id) => id !== referenceId),
            } as Prisma.InputJsonValue,
          },
        });
      }
      await tx.pathwayEvidenceReference.delete({ where: { id: referenceId } });
    });

    if (existing.libraryItemId) {
      await this.referenceLibrary.recountUsage(existing.libraryItemId);
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_deleted',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      previousValue: existing,
      ...this.getClientInfo(req),
    });
  }

  async replaceEvidenceMappings(
    pathwayId: string,
    referenceId: string,
    dto: ReplaceEvidenceMappingsDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const reference = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { id: referenceId, pathwayId },
    });
    if (!reference) throw new NotFoundException('Reference not found in this pathway');

    const normalized = dto.mappings.map((m) => ({
      section: m.section,
      mappingType: m.mappingType,
      targetId: m.targetId?.trim() || '',
      suggested: Boolean(m.suggested),
    }));

    await this.validateMappingTargets(pathwayId, normalized);

    const previous = await this.prisma.pathwayEvidenceMapping.findMany({
      where: { pathwayId, referenceId },
    });

    await this.prisma.$transaction(async (tx) => {
      const expanded = await this.expandSectionWideToItems(tx, pathwayId, normalized);
      // De-dupe after expansion (section + items).
      const seen = new Set<string>();
      const rows = expanded.filter((m) => {
        const key = `${m.section}::${m.mappingType}::${m.targetId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await tx.pathwayEvidenceMapping.deleteMany({ where: { pathwayId, referenceId } });
      if (rows.length) {
        await tx.pathwayEvidenceMapping.createMany({
          data: rows.map((m) => ({
            pathwayId,
            referenceId,
            section: m.section,
            mappingType: m.mappingType,
            targetId: m.targetId,
            suggested: Boolean(
              normalized.find(
                (n) =>
                  n.section === m.section &&
                  n.mappingType === m.mappingType &&
                  n.targetId === m.targetId,
              )?.suggested,
            ),
            createdById: user.id,
          })),
        });
      }
      await this.syncContentEvidenceFromMappings(tx, pathwayId, referenceId, rows, previous);
    });

    const mappings = await this.prisma.pathwayEvidenceMapping.findMany({
      where: { pathwayId, referenceId },
      orderBy: { createdAt: 'asc' },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_mapping_created',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      previousValue: { items: previous },
      newValue: { items: mappings },
      ...this.getClientInfo(req),
    });

    return mappings;
  }

  async updatePathwayGovernance(
    pathwayId: string,
    dto: UpdatePathwayGovernanceDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: {
        governance: true,
        primaryDocumentationReferenceId: true,
        secondaryDocumentationReferenceId: true,
        lastClinicalReview: true,
      },
    });
    if (!existing) throw new NotFoundException('Pathway not found');

    const current = parsePathwayGovernance(
      existing.governance,
      existing.primaryDocumentationReferenceId,
      existing.secondaryDocumentationReferenceId,
    );

    if (dto.primaryDocumentationReferenceId) {
      await this.assertVerifiedDocumentationRef(
        pathwayId,
        dto.primaryDocumentationReferenceId,
        'Primary',
      );
    }
    if (dto.secondaryDocumentationReferenceId) {
      await this.assertVerifiedDocumentationRef(
        pathwayId,
        dto.secondaryDocumentationReferenceId,
        'Secondary',
      );
    }

    let nextPrimary =
      dto.primaryDocumentationReferenceId !== undefined
        ? dto.primaryDocumentationReferenceId
        : current.primaryDocumentationReferenceId;
    let nextSecondary =
      dto.secondaryDocumentationReferenceId !== undefined
        ? dto.secondaryDocumentationReferenceId
        : current.secondaryDocumentationReferenceId;

    if (
      dto.primaryDocumentationReferenceId &&
      dto.primaryDocumentationReferenceId === nextSecondary
    ) {
      nextSecondary = null;
    }
    if (
      dto.secondaryDocumentationReferenceId &&
      dto.secondaryDocumentationReferenceId === nextPrimary
    ) {
      nextPrimary = null;
    }
    if (nextPrimary && nextSecondary && nextPrimary === nextSecondary) {
      throw new BadRequestException(
        'Primary and secondary documentation references must be different.',
      );
    }

    const next = {
      internalReviewStatus: dto.internalReviewStatus ?? current.internalReviewStatus,
      externalPeerReviewStatus:
        dto.externalPeerReviewStatus ?? current.externalPeerReviewStatus,
      lastReviewedAt:
        dto.lastReviewedAt !== undefined ? dto.lastReviewedAt : current.lastReviewedAt,
      nextReviewDueAt:
        dto.nextReviewDueAt !== undefined ? dto.nextReviewDueAt : current.nextReviewDueAt,
      primaryDocumentationReferenceId: nextPrimary,
      secondaryDocumentationReferenceId: nextSecondary,
    };

    const updated = await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        primaryDocumentationReferenceId: next.primaryDocumentationReferenceId,
        secondaryDocumentationReferenceId: next.secondaryDocumentationReferenceId,
        governance: {
          internalReviewStatus: next.internalReviewStatus,
          externalPeerReviewStatus: next.externalPeerReviewStatus,
          lastReviewedAt: next.lastReviewedAt,
          nextReviewDueAt: next.nextReviewDueAt,
        } as Prisma.InputJsonValue,
        ...(next.lastReviewedAt
          ? { lastClinicalReview: new Date(next.lastReviewedAt) }
          : {}),
      },
      select: {
        id: true,
        governance: true,
        primaryDocumentationReferenceId: true,
        secondaryDocumentationReferenceId: true,
        lastClinicalReview: true,
      },
    });

    const changedPrimary =
      dto.primaryDocumentationReferenceId !== undefined &&
      dto.primaryDocumentationReferenceId !== current.primaryDocumentationReferenceId;
    const changedSecondary =
      dto.secondaryDocumentationReferenceId !== undefined &&
      dto.secondaryDocumentationReferenceId !== current.secondaryDocumentationReferenceId;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: changedPrimary
        ? 'primary_documentation_reference_changed'
        : changedSecondary
          ? 'secondary_documentation_reference_changed'
          : 'governance_status_updated',
      module: 'PATHWAY_GOVERNANCE',
      previousValue: current,
      newValue: parsePathwayGovernance(
        updated.governance,
        updated.primaryDocumentationReferenceId,
        updated.secondaryDocumentationReferenceId,
      ),
      ...this.getClientInfo(req),
    });

    return parsePathwayGovernance(
      updated.governance,
      updated.primaryDocumentationReferenceId,
      updated.secondaryDocumentationReferenceId,
    );
  }

  private async assertVerifiedDocumentationRef(
    pathwayId: string,
    referenceId: string,
    label: 'Primary' | 'Secondary',
  ) {
    await this.assertLibraryReferenceIds(pathwayId, [referenceId]);
    const verified = await this.prisma.pathwayEvidenceReference.findFirst({
      where: { id: referenceId, pathwayId, status: 'verified' },
      select: { id: true },
    });
    if (!verified) {
      throw new BadRequestException(
        `${label} documentation reference must be a verified library citation.`,
      );
    }
  }

  async getPublishingReadiness(pathwayId: string, user: RequestUser) {
    await this.findPathwayOrThrow(pathwayId, user);
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      include: {
        libraryReferences: { select: { status: true } },
        questions: { select: { approved: true, evidenceRefIds: true, status: true } },
        treatments: {
          where: { isActive: true, archivedAt: null },
          select: { approved: true, evidenceRefIds: true },
        },
        counsellings: {
          where: { archivedAt: null },
          select: { approved: true, evidenceRefIds: true },
        },
        evidenceMappings: true,
      },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');

    const governance = parsePathwayGovernance(
      pathway.governance,
      pathway.primaryDocumentationReferenceId,
      pathway.secondaryDocumentationReferenceId,
    );
    const redFlagIds = evidenceRefIdsFromJsonItems(pathway.redFlags);
    const differentialIds = evidenceRefIdsFromJsonItems(pathway.differentials);

    const redFlagsMissingEvidence = [...redFlagIds.values()].filter((ids) => ids.length === 0)
      .length;
    // If JSON items have no ids map entries, count array length without evidence
    const redFlagArray = Array.isArray(pathway.redFlags) ? pathway.redFlags : [];
    const redFlagsMissing =
      redFlagArray.length > 0
        ? redFlagArray.filter((item) => {
            if (!item || typeof item !== 'object') return true;
            const ids = uniqueIdList(
              (item as Record<string, unknown>).evidenceRefIds ??
                (item as Record<string, unknown>).referenceIds,
            );
            return ids.length === 0;
          }).length
        : 0;

    return computePublishingReadiness({
      references: pathway.libraryReferences,
      governance,
      requireExternalPeerReview: false,
      presentationApproved:
        pathway.questions.length === 0 || pathway.questions.every((q) => q.approved),
      differentialApproved:
        differentialIds.size === 0 ||
        [...differentialIds.keys()].every((id) => {
          const item = (Array.isArray(pathway.differentials) ? pathway.differentials : []).find(
            (d) => d && typeof d === 'object' && (d as { id?: string }).id === id,
          ) as { approved?: boolean } | undefined;
          return item?.approved !== false;
        }),
      redFlagsApproved: true,
      treatmentsApproved:
        pathway.treatments.length === 0 || pathway.treatments.every((t) => t.approved),
      guidanceApproved:
        pathway.counsellings.length === 0 || pathway.counsellings.every((c) => c.approved),
      treatmentsMissingEvidence: pathway.treatments.filter((t) => t.evidenceRefIds.length === 0)
        .length,
      redFlagsMissingEvidence: redFlagsMissing || redFlagsMissingEvidence,
    });
  }

  async createPathwayReviewer(
    pathwayId: string,
    dto: CreatePathwayReviewerDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const areas = this.normalizeReviewedAreas(dto.reviewedAreas);
    if (!areas.length) {
      throw new BadRequestException('Select at least one reviewed area.');
    }
    if (dto.reviewerType === 'external' && !dto.organization?.trim()) {
      throw new BadRequestException('Organization is required for external peer reviewers.');
    }

    const master = await this.reviewerLibrary.upsertFromReviewer(
      {
        reviewerType: dto.reviewerType,
        name: dto.name,
        credentials: dto.credentials,
        organization: dto.organization,
        role: dto.role,
      },
      user,
    );
    if (master.isRetired) {
      throw new ConflictException(
        'This reviewer exists in the master library but is retired. Restore them from Reviewer Library first.',
      );
    }
    const existingLink = await this.prisma.pathwayReviewer.findFirst({
      where: {
        pathwayId,
        libraryReviewerId: master.id,
        reviewerType: dto.reviewerType,
      },
    });
    if (existingLink) {
      throw new ConflictException('This master reviewer is already linked in this review type.');
    }

    const created = await this.prisma.pathwayReviewer.create({
      data: {
        pathwayId,
        libraryReviewerId: master.id,
        reviewerType: dto.reviewerType,
        name: dto.name.trim(),
        credentials: dto.credentials.trim(),
        organization: dto.organization?.trim() || null,
        role: dto.role.trim(),
        reviewedAreas: areas,
        reviewDate: new Date(dto.reviewDate),
        notes: dto.notes?.trim() || null,
      },
    });
    await this.reviewerLibrary.recountUsage(master.id);

    await this.refreshGovernanceFromReviewers(pathwayId);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        dto.reviewerType === 'external' ? 'external_reviewer_added' : 'internal_reviewer_added',
      module: 'PATHWAY_GOVERNANCE',
      newValue: created,
      ...this.getClientInfo(req),
    });

    return created;
  }

  async linkReviewerFromLibrary(
    pathwayId: string,
    dto: LinkReviewerFromLibraryDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const areas = this.normalizeReviewedAreas(dto.reviewedAreas);
    if (!areas.length) {
      throw new BadRequestException('Select at least one reviewed area.');
    }
    const master = await this.prisma.reviewerLibraryItem.findUnique({
      where: { id: dto.libraryReviewerId },
    });
    if (!master) throw new NotFoundException('Master reviewer not found');
    if (master.isRetired) {
      throw new ConflictException('This master reviewer is retired and cannot be linked.');
    }
    if (dto.reviewerType === 'external' && !master.organization?.trim()) {
      throw new BadRequestException(
        'Organization is required for external peer reviewers. Update the master reviewer first.',
      );
    }

    const existing = await this.prisma.pathwayReviewer.findFirst({
      where: {
        pathwayId,
        libraryReviewerId: master.id,
        reviewerType: dto.reviewerType,
      },
    });
    if (existing) return existing;

    const created = await this.prisma.pathwayReviewer.create({
      data: {
        pathwayId,
        libraryReviewerId: master.id,
        reviewerType: dto.reviewerType,
        name: master.name,
        credentials: master.credentials,
        organization: master.organization,
        role: master.role,
        reviewedAreas: areas,
        reviewDate: new Date(dto.reviewDate),
        notes: dto.notes?.trim() || null,
      },
    });
    await this.reviewerLibrary.recountUsage(master.id);
    await this.refreshGovernanceFromReviewers(pathwayId);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        dto.reviewerType === 'external'
          ? 'external_reviewer_linked_from_library'
          : 'internal_reviewer_linked_from_library',
      module: 'PATHWAY_GOVERNANCE',
      newValue: created,
      ...this.getClientInfo(req),
    });

    return created;
  }

  async updatePathwayReviewer(
    pathwayId: string,
    reviewerId: string,
    dto: UpdatePathwayReviewerDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.pathwayReviewer.findFirst({
      where: { id: reviewerId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Reviewer not found');

    const reviewerType = dto.reviewerType ?? existing.reviewerType;
    const organization =
      dto.organization !== undefined ? dto.organization?.trim() || null : existing.organization;
    if (reviewerType === 'external' && !organization) {
      throw new BadRequestException('Organization is required for external peer reviewers.');
    }

    const updated = await this.prisma.pathwayReviewer.update({
      where: { id: reviewerId },
      data: {
        ...(dto.reviewerType !== undefined ? { reviewerType: dto.reviewerType } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.credentials !== undefined ? { credentials: dto.credentials.trim() } : {}),
        ...(dto.organization !== undefined ? { organization } : {}),
        ...(dto.role !== undefined ? { role: dto.role.trim() } : {}),
        ...(dto.reviewedAreas !== undefined
          ? { reviewedAreas: this.normalizeReviewedAreas(dto.reviewedAreas) }
          : {}),
        ...(dto.reviewDate !== undefined ? { reviewDate: new Date(dto.reviewDate) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });

    await this.refreshGovernanceFromReviewers(pathwayId);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        updated.reviewerType === 'external'
          ? 'external_reviewer_updated'
          : 'internal_reviewer_updated',
      module: 'PATHWAY_GOVERNANCE',
      previousValue: existing,
      newValue: updated,
      ...this.getClientInfo(req),
    });

    return updated;
  }

  async deletePathwayReviewer(
    pathwayId: string,
    reviewerId: string,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const existing = await this.prisma.pathwayReviewer.findFirst({
      where: { id: reviewerId, pathwayId },
    });
    if (!existing) throw new NotFoundException('Reviewer not found');

    await this.prisma.pathwayReviewer.delete({ where: { id: reviewerId } });
    if (existing.libraryReviewerId) {
      await this.reviewerLibrary.recountUsage(existing.libraryReviewerId);
    }
    await this.refreshGovernanceFromReviewers(pathwayId);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        existing.reviewerType === 'external'
          ? 'external_reviewer_removed'
          : 'internal_reviewer_removed',
      module: 'PATHWAY_GOVERNANCE',
      previousValue: existing,
      ...this.getClientInfo(req),
    });
  }

  async previewPresentationReviewImport(
    pathwayId: string,
    dto: PreviewPresentationReviewImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parsePresentationReviewImport(text);
    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const existingQuestions = await this.prisma.clinicalQuestion.findMany({
      where: { pathwayId },
      include: { section: true },
    });
    const prQuestions = existingQuestions.filter((q) =>
      isPresentationReviewSection(q.section?.name),
    );
    const approvedCount = prQuestions.filter(
      (q) => q.approved || q.status === QuestionStatus.APPROVED,
    ).length;

    const referenceRows = parsed.references.map((item) => {
      const match = findMatchingReference(item, existingRefs);
      const defaultAction = match ? ('use_existing' as const) : ('create_new' as const);
      return {
        importKey: item.importKey,
        citationTitle: item.citationTitle,
        organization: item.organization,
        documentType: item.documentType,
        yearEdition: item.yearEdition,
        jurisdiction: item.jurisdiction,
        url: item.url,
        doi: item.doi,
        verificationRequired: item.verificationRequired,
        statusAfterImport: importStatusForItem(item),
        warnings: item.warnings,
        blockingErrors: item.blockingErrors,
        match: match
          ? {
              existingReferenceId: match.id,
              confidence: match.confidence,
              existingStatus: match.status ?? null,
              label:
                match.confidence === 'exact'
                  ? 'Existing reference found'
                  : 'Possible existing reference found',
            }
          : null,
        defaultAction,
      };
    });

    const questionRows = parsed.questions.map((q) => {
      const existingHit = prQuestions.find(
        (row) => normalizeQuestionKey(row.question) === normalizeQuestionKey(q.questionText),
      );
      const overlap = !existingHit
        ? prQuestions
            .map((row) => ({
              id: row.id,
              question: row.question,
              score: questionOverlapScore(row.question, q.questionText),
            }))
            .filter((row) => row.score >= 0.45)
            .sort((a, b) => b.score - a.score)[0]
        : null;
      const importedOverlap = parsed.questions.find(
        (other) =>
          other.importKey !== q.importKey &&
          questionOverlapScore(other.questionText, q.questionText) >= 0.55,
      );
      const warnings = [...q.warnings];
      if (existingHit) warnings.push('Exact duplicate of an existing question (will be skipped on merge)');
      if (overlap) warnings.push('Possible overlap with an existing question');
      if (importedOverlap) warnings.push('Possible overlap with another imported question');
      return {
        importKey: q.importKey,
        questionText: q.questionText,
        answerType: q.answerType,
        required: q.required,
        expectedAnswer: q.expectedAnswer,
        whyItMatters: q.whyItMatters,
        pharmacistTip: q.pharmacistTip,
        conditionalDisplayDraft: q.conditionalDisplayDraft,
        importedReferenceIds: q.importedReferenceIds,
        needsRuleReview: q.needsRuleReview,
        answerTypeNeedsReview: q.answerTypeNeedsReview,
        exactDuplicate: Boolean(existingHit),
        possibleOverlap: Boolean(overlap || importedOverlap),
        warnings,
        blockingErrors: q.blockingErrors,
      };
    });

    const questionsWithRefs = questionRows.filter((q) => q.importedReferenceIds.length > 0).length;
    const matchedRefs = referenceRows.filter((r) => r.match).length;
    const newRefs = referenceRows.filter((r) => !r.match).length;
    const verificationRequired = referenceRows.filter((r) => r.verificationRequired).length;
    const issueCount =
      parsed.blockingErrors.length +
      parsed.warnings.length +
      questionRows.filter((q) => q.warnings.length || q.possibleOverlap).length;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'presentation_review_import_parsed',
      module: 'CLINICAL_QUESTIONS',
      newValue: {
        pathwayId,
        questions: parsed.questions.length,
        references: parsed.references.length,
        blocking: parsed.blockingErrors.length,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'assessment' as const,
      ok: parsed.blockingErrors.length === 0 && parsed.questions.length > 0,
      error: parsed.blockingErrors[0] ?? null,
      format: parsed.format,
      legacyTwoSectionImport: parsed.legacyTwoSectionImport,
      approvedQuestionCount: approvedCount,
      existingQuestionCount: prQuestions.length,
      blockingErrors: parsed.blockingErrors,
      warnings: parsed.warnings,
      summary: {
        questions: parsed.questions.length,
        questionsWithReferences: questionsWithRefs,
        sectionEvidence: parsed.sectionEvidenceIds.length,
        references: parsed.references.length,
        matchedExisting: matchedRefs,
        newSources: newRefs,
        verificationRequired,
        issueCount,
      },
      questions: questionRows,
      sectionEvidenceIds: parsed.sectionEvidenceIds,
      references: referenceRows,
    };
  }

  async commitPresentationReviewImport(
    pathwayId: string,
    dto: CommitPresentationReviewImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parsePresentationReviewImport(text);
    const mode = dto.mode === 'replace' ? 'replace' : 'merge';

    if (!parsed.questions.length) {
      throw new BadRequestException(
        parsed.blockingErrors[0] ||
          'Could not find Presentation Review questions. Paste structured ChatGPT output instead.',
      );
    }
    if (parsed.blockingErrors.length) {
      throw new BadRequestException(parsed.blockingErrors[0]);
    }

    const existingQuestions = await this.prisma.clinicalQuestion.findMany({
      where: { pathwayId },
      include: { section: true },
    });
    const prQuestions = existingQuestions.filter((q) =>
      isPresentationReviewSection(q.section?.name),
    );
    if (mode === 'replace' && prQuestions.length > 0 && dto.confirmedReplace !== true) {
      throw new BadRequestException(
        'Replace current Presentation Review? Existing questions and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.',
      );
    }

    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const decisionByKey = new Map(
      (dto.decisions ?? []).map((d) => [d.importKey.toUpperCase(), d] as const),
    );
    const skipQuestions = new Set((dto.skipQuestionKeys ?? []).map((k) => k.toUpperCase()));

    const importKeyToRefId = new Map<string, string>();
    const currentRefs = [...existingRefs];

    for (const item of parsed.references) {
      const decision = decisionByKey.get(item.importKey.toUpperCase());
      const match = findMatchingReference(item, currentRefs);
      const action = decision?.action ?? (match ? 'use_existing' : 'create_new');
      if (action === 'skip') continue;

      if (action === 'use_existing') {
        const refId = decision?.existingReferenceId || match?.id;
        if (!refId) {
          throw new BadRequestException(
            `${item.importKey}: Use existing selected but no matching reference was found.`,
          );
        }
        importKeyToRefId.set(item.importKey.toUpperCase(), refId);
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'presentation_review_import_reference_matched',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
        continue;
      }

      const createdRef = await this.prisma.pathwayEvidenceReference.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          citationTitle: item.citationTitle,
          organization: item.organization || null,
          edition: item.edition,
          publicationYear: item.publicationYear,
          url: item.url,
          doi: item.doi,
          documentType: item.documentType,
          jurisdiction: item.jurisdiction,
          status: importStatusForItem(item),
          importSource: 'chatgpt',
          verifiedBy: null,
          verificationDate: null,
          createdById: user.id,
        },
      });
      currentRefs.push(createdRef);
      importKeyToRefId.set(item.importKey.toUpperCase(), createdRef.id);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'presentation_review_import_reference_created',
        module: 'PATHWAY_EVIDENCE_REFERENCES',
        newValue: { pathwayId, referenceId: createdRef.id, importKey: item.importKey },
        ...this.getClientInfo(req),
      });
    }

    const section = await this.ensureAssessmentSection(pathwayId, 'diagnosisConfirmation');
    const existingKeys = new Set(
      prQuestions.map((q) => normalizeQuestionKey(q.question)),
    );

    if (mode === 'replace') {
      const ids = prQuestions.map((q) => q.id);
      if (ids.length) {
        await this.prisma.clinicalQuestion.deleteMany({
          where: { pathwayId, id: { in: ids } },
        });
      }
      await this.prisma.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'presentation_review' },
      });
      existingKeys.clear();
    }

    let maxOrder =
      (
        await this.prisma.clinicalQuestion.aggregate({
          where: { pathwayId },
          _max: { displayOrder: true },
        })
      )._max.displayOrder ?? -1;

    let imported = 0;
    let skipped = 0;
    const createdQuestionIds: string[] = [];

    for (const q of parsed.questions) {
      if (skipQuestions.has(q.importKey.toUpperCase())) {
        skipped += 1;
        continue;
      }
      const key = normalizeQuestionKey(q.questionText);
      if (mode === 'merge' && existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const linkedIds = uniqueIdList(
        q.importedReferenceIds.map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '').filter(Boolean),
      );
      maxOrder += 1;
      const created = await this.prisma.clinicalQuestion.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          sectionId: section.id,
          question: q.questionText,
          description: q.whyItMatters || null,
          helpText: q.pharmacistTip || null,
          type: q.answerTypeNeedsReview
            ? normalizeQuestionType(q.answerType)
            : normalizeQuestionType('YES_NO'),
          required: q.required,
          displayOrder: maxOrder,
          evidenceRefIds: linkedIds,
          visibilityRule: q.conditionalDisplayDraft
            ? ({
                sourceField: 'import.needs_rule_review',
                operator: 'eq',
                value: true,
                label: q.conditionalDisplayDraft,
              } as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          validation: {
            expectedAnswer: q.expectedAnswer,
            needsRuleReview: q.needsRuleReview,
            importSource: 'chatgpt',
          } as Prisma.InputJsonValue,
          sourceReference: 'chatgpt-script-import',
          confidence: null,
          status: QuestionStatus.NEEDS_REVIEW,
          createdBy: 'USER',
          approved: false,
        },
      });
      createdQuestionIds.push(created.id);
      if (linkedIds.length) {
        await this.syncQuestionEvidenceMappings(pathwayId, created.id, linkedIds, user.id);
      }
      existingKeys.add(key);
      imported += 1;
    }

    const sectionRefIds = uniqueIdList(
      parsed.sectionEvidenceIds
        .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
        .filter(Boolean),
    );
    const currentState = parsePresentationReviewState(
      (
        await this.prisma.clinicalPathway.findFirst({
          where: { id: pathwayId },
          select: { presentationReview: true },
        })
      )?.presentationReview,
    );
    const nextSectionIds =
      mode === 'replace'
        ? sectionRefIds
        : uniqueIdList([...currentState.sectionEvidenceRefIds, ...sectionRefIds]);
    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        presentationReview: {
          sectionEvidenceRefIds: nextSectionIds,
          duplicateReviewNeeded:
            parsed.legacyTwoSectionImport || currentState.duplicateReviewNeeded === true,
        } as Prisma.InputJsonValue,
      },
    });
    if (nextSectionIds.length) {
      await this.syncSectionEvidenceMappings(pathwayId, nextSectionIds, user.id);
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        mode === 'replace'
          ? 'presentation_review_import_replaced_existing'
          : 'presentation_review_import_completed',
      module: 'CLINICAL_QUESTIONS',
      newValue: {
        pathwayId,
        imported,
        skipped,
        references: parsed.references.length,
        questionIds: createdQuestionIds,
        mode,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'assessment' as const,
      imported,
      skipped,
      created: imported,
      matched: parsed.references.filter((r) => importKeyToRefId.has(r.importKey)).length,
      parseSource: parsed.format,
      mode,
      duplicateReviewNeeded: parsed.legacyTwoSectionImport,
      message: `Imported ${imported} Presentation Review question${imported === 1 ? '' : 's'} as Needs review.`,
    };
  }

  async previewRedFlagsImport(
    pathwayId: string,
    dto: PreviewRedFlagsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseRedFlagsImport(text);
    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: { redFlags: true },
    });
    const existingFlags = asJsonItemList((pathway as { redFlags?: unknown } | null)?.redFlags);

    const referenceRows = parsed.references.map((item) => {
      const match = findMatchingReference(item, existingRefs);
      const defaultAction = match ? ('use_existing' as const) : ('create_new' as const);
      return {
        importKey: item.importKey,
        citationTitle: item.citationTitle,
        organization: item.organization,
        documentType: item.documentType,
        yearEdition: item.yearEdition,
        jurisdiction: item.jurisdiction,
        url: item.url,
        doi: item.doi,
        verificationRequired: item.verificationRequired,
        statusAfterImport: importStatusForItem(item),
        warnings: item.warnings,
        blockingErrors: item.blockingErrors,
        match: match
          ? {
              existingReferenceId: match.id,
              confidence: match.confidence,
              existingStatus: match.status ?? null,
              label:
                match.confidence === 'exact'
                  ? 'Existing reference found'
                  : 'Possible existing reference found',
            }
          : null,
        defaultAction,
      };
    });

    const flagRows = parsed.flags.map((flag) => {
      const existingHit = existingFlags.find(
        (row) =>
          normalizeRedFlagKey(String(row.title ?? ''), String(row.question ?? row.description ?? '')) ===
          normalizeRedFlagKey(flag.title, flag.question),
      );
      const overlap = !existingHit
        ? existingFlags
            .map((row) => ({
              title: String(row.title ?? ''),
              score: redFlagOverlapScore(
                { title: String(row.title ?? ''), question: String(row.question ?? row.description ?? '') },
                { title: flag.title, question: flag.question },
              ),
            }))
            .filter((row) => row.score >= 0.45)
            .sort((a, b) => b.score - a.score)[0]
        : null;
      const importedOverlap = parsed.flags.find(
        (other) =>
          other.importKey !== flag.importKey &&
          redFlagOverlapScore(
            { title: other.title, question: other.question },
            { title: flag.title, question: flag.question },
          ) >= 0.55,
      );
      const warnings = [...flag.warnings];
      if (existingHit) warnings.push('Exact duplicate of an existing red flag (will be skipped on merge)');
      if (overlap) warnings.push('Possible overlap with an existing red flag');
      if (importedOverlap) warnings.push('Possible overlap with another imported red flag');
      return {
        importKey: flag.importKey,
        title: flag.title,
        question: flag.question,
        severity: flag.severity,
        whyItMatters: flag.whyItMatters,
        recommendedAction: flag.recommendedAction,
        actionNote: flag.actionNote,
        required: flag.required,
        importedReferenceIds: flag.importedReferenceIds,
        exactDuplicate: Boolean(existingHit),
        possibleOverlap: Boolean(overlap || importedOverlap),
        warnings,
        blockingErrors: flag.blockingErrors,
      };
    });

    const withRefs = flagRows.filter((f) => f.importedReferenceIds.length > 0).length;
    const matchedRefs = referenceRows.filter((r) => r.match).length;
    const newRefs = referenceRows.filter((r) => !r.match).length;
    const verificationRequired = referenceRows.filter((r) => r.verificationRequired).length;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'red_flags_import_parsed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        flags: parsed.flags.length,
        references: parsed.references.length,
        blocking: parsed.blockingErrors.length,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'red-flags' as const,
      ok: parsed.blockingErrors.length === 0 && parsed.flags.length > 0,
      error: parsed.blockingErrors[0] ?? null,
      format: parsed.format,
      existingFlagCount: existingFlags.length,
      approvedFlagCount: existingFlags.filter((f) => f.approved === true).length,
      blockingErrors: parsed.blockingErrors,
      warnings: parsed.warnings,
      summary: {
        flags: parsed.flags.length,
        flagsWithReferences: withRefs,
        sectionEvidence: parsed.sectionEvidenceIds.length,
        references: parsed.references.length,
        matchedExisting: matchedRefs,
        newSources: newRefs,
        verificationRequired,
        issueCount: parsed.blockingErrors.length + parsed.warnings.length,
      },
      flags: flagRows,
      sectionEvidenceIds: parsed.sectionEvidenceIds,
      references: referenceRows,
    };
  }

  async commitRedFlagsImport(
    pathwayId: string,
    dto: CommitRedFlagsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseRedFlagsImport(text);
    const mode = dto.mode === 'replace' ? 'replace' : 'merge';

    if (!parsed.flags.length) {
      throw new BadRequestException(
        parsed.blockingErrors[0] ||
          'Could not find red flags. Paste structured ChatGPT output instead.',
      );
    }
    if (parsed.blockingErrors.length) {
      throw new BadRequestException(parsed.blockingErrors[0]);
    }

    const existing = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: { redFlags: true },
    });
    const existingFlags = asJsonItemList(existing?.redFlags);
    if (mode === 'replace' && existingFlags.length > 0 && dto.confirmedReplace !== true) {
      throw new BadRequestException(
        'Replace current Red Flags? Existing red flags and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.',
      );
    }

    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const decisionByKey = new Map(
      (dto.decisions ?? []).map((d) => [d.importKey.toUpperCase(), d] as const),
    );
    const skipFlags = new Set((dto.skipFlagKeys ?? []).map((k) => k.toUpperCase()));

    const importKeyToRefId = new Map<string, string>();
    const currentRefs = [...existingRefs];

    for (const item of parsed.references) {
      const decision = decisionByKey.get(item.importKey.toUpperCase());
      const match = findMatchingReference(item, currentRefs);
      const action = decision?.action ?? (match ? 'use_existing' : 'create_new');
      if (action === 'skip') continue;

      if (action === 'use_existing') {
        const refId = decision?.existingReferenceId || match?.id;
        if (!refId) {
          throw new BadRequestException(
            `${item.importKey}: Use existing selected but no matching reference was found.`,
          );
        }
        importKeyToRefId.set(item.importKey.toUpperCase(), refId);
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'red_flags_import_reference_matched',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
        continue;
      }

      const createdRef = await this.prisma.pathwayEvidenceReference.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          citationTitle: item.citationTitle,
          organization: item.organization || null,
          edition: item.edition,
          publicationYear: item.publicationYear,
          url: item.url,
          doi: item.doi,
          documentType: item.documentType,
          jurisdiction: item.jurisdiction,
          status: importStatusForItem(item),
          importSource: 'chatgpt',
          verifiedBy: null,
          verificationDate: null,
          createdById: user.id,
        },
      });
      currentRefs.push(createdRef);
      importKeyToRefId.set(item.importKey.toUpperCase(), createdRef.id);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'red_flags_import_reference_created',
        module: 'PATHWAY_EVIDENCE_REFERENCES',
        newValue: { pathwayId, referenceId: createdRef.id, importKey: item.importKey },
        ...this.getClientInfo(req),
      });
    }

    const existingKeys = new Set(
      existingFlags.map((f) =>
        normalizeRedFlagKey(String(f.title ?? ''), String(f.question ?? f.description ?? '')),
      ),
    );

    const nextFlags: Array<Record<string, unknown>> =
      mode === 'replace' ? [] : existingFlags.map((f) => ({ ...f }));

    if (mode === 'replace') {
      await this.prisma.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'red_flags' },
      });
      existingKeys.clear();
    }

    let imported = 0;
    let skipped = 0;

    for (const flag of parsed.flags) {
      if (skipFlags.has(flag.importKey.toUpperCase())) {
        skipped += 1;
        continue;
      }
      const key = normalizeRedFlagKey(flag.title, flag.question);
      if (mode === 'merge' && existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const linkedIds = uniqueIdList(
        flag.importedReferenceIds
          .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
          .filter(Boolean),
      );
      nextFlags.push({
        id: randomUUID(),
        title: flag.title,
        question: flag.question,
        description: flag.question,
        whyItMatters: flag.whyItMatters || null,
        actionNote: flag.actionNote || null,
        severity: flag.severity ?? 'WARNING',
        action: flag.recommendedAction,
        required: flag.required !== false,
        approved: false,
        source: 'USER',
        evidenceRefIds: linkedIds,
      });
      existingKeys.add(key);
      imported += 1;
    }

    const currentSectionIds = uniqueIdList(
      (
        await this.prisma.pathwayEvidenceMapping.findMany({
          where: { pathwayId, section: 'red_flags', mappingType: 'section' },
          select: { referenceId: true },
        })
      ).map((m) => m.referenceId),
    );
    const importedSectionIds = uniqueIdList(
      parsed.sectionEvidenceIds
        .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
        .filter(Boolean),
    );
    const nextSectionIds =
      mode === 'replace'
        ? importedSectionIds
        : uniqueIdList([...currentSectionIds, ...importedSectionIds]);

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: { redFlags: nextFlags as Prisma.InputJsonValue },
    });

    await this.syncRedFlagEvidenceMappings(
      pathwayId,
      nextFlags.map((f) => ({
        id: String(f.id),
        evidenceRefIds: uniqueIdList(f.evidenceRefIds),
      })),
      nextSectionIds,
      user.id,
      { suggested: true },
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        mode === 'replace' ? 'red_flags_import_replaced_existing' : 'red_flags_import_completed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        imported,
        skipped,
        references: parsed.references.length,
        mode,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'red-flags' as const,
      imported,
      skipped,
      created: imported,
      matched: parsed.references.filter((r) => importKeyToRefId.has(r.importKey.toUpperCase())).length,
      parseSource: parsed.format,
      mode,
      message: `Imported ${imported} red flag${imported === 1 ? '' : 's'} as Needs review.`,
    };
  }

  async previewDifferentialsImport(
    pathwayId: string,
    dto: PreviewDifferentialsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseDifferentialsImport(text);
    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: { differentials: true },
    });
    const existingItems = asJsonItemList((pathway as { differentials?: unknown } | null)?.differentials);

    const referenceRows = parsed.references.map((item) => {
      const match = findMatchingReference(item, existingRefs);
      const defaultAction = match ? ('use_existing' as const) : ('create_new' as const);
      return {
        importKey: item.importKey,
        citationTitle: item.citationTitle,
        organization: item.organization,
        documentType: item.documentType,
        yearEdition: item.yearEdition,
        jurisdiction: item.jurisdiction,
        url: item.url,
        doi: item.doi,
        verificationRequired: item.verificationRequired,
        statusAfterImport: importStatusForItem(item),
        warnings: item.warnings,
        blockingErrors: item.blockingErrors,
        match: match
          ? {
              existingReferenceId: match.id,
              confidence: match.confidence,
              existingStatus: match.status ?? null,
              label:
                match.confidence === 'exact'
                  ? 'Existing reference found'
                  : 'Possible existing reference found',
            }
          : null,
        defaultAction,
      };
    });

    const itemRows = parsed.items.map((item) => {
      const existingHit = existingItems.find(
        (row) =>
          normalizeDifferentialKey(String(row.condition ?? ''), String(row.question ?? '')) ===
          normalizeDifferentialKey(item.condition, item.screeningQuestion),
      );
      const overlap = !existingHit
        ? existingItems
            .map((row) => ({
              condition: String(row.condition ?? ''),
              score: differentialOverlapScore(
                {
                  condition: String(row.condition ?? ''),
                  screeningQuestion: String(row.question ?? ''),
                },
                { condition: item.condition, screeningQuestion: item.screeningQuestion },
              ),
            }))
            .filter((row) => row.score >= 0.45)
            .sort((a, b) => b.score - a.score)[0]
        : null;
      const importedOverlap = parsed.items.find(
        (other) =>
          other.importKey !== item.importKey &&
          differentialOverlapScore(
            { condition: other.condition, screeningQuestion: other.screeningQuestion },
            { condition: item.condition, screeningQuestion: item.screeningQuestion },
          ) >= 0.55,
      );
      const warnings = [...item.warnings];
      if (existingHit) {
        warnings.push('Exact duplicate of an existing differential (will be skipped on merge)');
      }
      if (overlap) warnings.push('Possible overlap with an existing differential');
      if (importedOverlap) warnings.push('Possible overlap with another imported differential');
      return {
        importKey: item.importKey,
        condition: item.condition,
        likelihood: item.likelihood,
        screeningQuestion: item.screeningQuestion,
        whyItMatters: item.whyItMatters,
        positiveResult: item.positiveResult,
        keySymptoms: item.keySymptoms,
        howToDistinguish: item.howToDistinguish,
        suggestedNextStep: item.suggestedNextStep,
        required: item.required,
        importedReferenceIds: item.importedReferenceIds,
        exactDuplicate: Boolean(existingHit),
        possibleOverlap: Boolean(overlap || importedOverlap),
        warnings,
        blockingErrors: item.blockingErrors,
      };
    });

    const withRefs = itemRows.filter((row) => row.importedReferenceIds.length > 0).length;
    const matchedRefs = referenceRows.filter((r) => r.match).length;
    const newRefs = referenceRows.filter((r) => !r.match).length;
    const verificationRequired = referenceRows.filter((r) => r.verificationRequired).length;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'differential_import_parsed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        items: parsed.items.length,
        references: parsed.references.length,
        blocking: parsed.blockingErrors.length,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'differentials' as const,
      ok: parsed.blockingErrors.length === 0 && parsed.items.length > 0,
      error: parsed.blockingErrors[0] ?? null,
      format: parsed.format,
      existingItemCount: existingItems.length,
      approvedItemCount: existingItems.filter((row) => row.approved === true).length,
      blockingErrors: parsed.blockingErrors,
      warnings: parsed.warnings,
      summary: {
        items: parsed.items.length,
        itemsWithReferences: withRefs,
        sectionEvidence: parsed.sectionEvidenceIds.length,
        references: parsed.references.length,
        matchedExisting: matchedRefs,
        newSources: newRefs,
        verificationRequired,
        issueCount: parsed.blockingErrors.length + parsed.warnings.length,
      },
      items: itemRows,
      sectionEvidenceIds: parsed.sectionEvidenceIds,
      references: referenceRows,
    };
  }

  async commitDifferentialsImport(
    pathwayId: string,
    dto: CommitDifferentialsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseDifferentialsImport(text);
    const mode = dto.mode === 'replace' ? 'replace' : 'merge';

    if (!parsed.items.length) {
      throw new BadRequestException(
        parsed.blockingErrors[0] ||
          'Could not find differentials. Paste structured ChatGPT output instead.',
      );
    }
    if (parsed.blockingErrors.length) {
      throw new BadRequestException(parsed.blockingErrors[0]);
    }

    const existing = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      select: { differentials: true },
    });
    const existingItems = asJsonItemList(existing?.differentials);
    if (mode === 'replace' && existingItems.length > 0 && dto.confirmedReplace !== true) {
      throw new BadRequestException(
        'Replace current Differential Review? Existing conditions and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.',
      );
    }

    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const decisionByKey = new Map(
      (dto.decisions ?? []).map((d) => [d.importKey.toUpperCase(), d] as const),
    );
    const skipItems = new Set((dto.skipDifferentialKeys ?? []).map((k) => k.toUpperCase()));

    const importKeyToRefId = new Map<string, string>();
    const currentRefs = [...existingRefs];

    for (const item of parsed.references) {
      const decision = decisionByKey.get(item.importKey.toUpperCase());
      const match = findMatchingReference(item, currentRefs);
      const action = decision?.action ?? (match ? 'use_existing' : 'create_new');
      if (action === 'skip') continue;

      if (action === 'use_existing') {
        const refId = decision?.existingReferenceId || match?.id;
        if (!refId) {
          throw new BadRequestException(
            `${item.importKey}: Use existing selected but no matching reference was found.`,
          );
        }
        importKeyToRefId.set(item.importKey.toUpperCase(), refId);
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'differential_import_reference_matched',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
        continue;
      }

      const createdRef = await this.prisma.pathwayEvidenceReference.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          citationTitle: item.citationTitle,
          organization: item.organization || null,
          edition: item.edition,
          publicationYear: item.publicationYear,
          url: item.url,
          doi: item.doi,
          documentType: item.documentType,
          jurisdiction: item.jurisdiction,
          status: importStatusForItem(item),
          importSource: 'chatgpt',
          verifiedBy: null,
          verificationDate: null,
          createdById: user.id,
        },
      });
      currentRefs.push(createdRef);
      importKeyToRefId.set(item.importKey.toUpperCase(), createdRef.id);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'differential_import_reference_created',
        module: 'PATHWAY_EVIDENCE_REFERENCES',
        newValue: { pathwayId, referenceId: createdRef.id, importKey: item.importKey },
        ...this.getClientInfo(req),
      });
    }

    const existingKeys = new Set(
      existingItems.map((row) =>
        normalizeDifferentialKey(String(row.condition ?? ''), String(row.question ?? '')),
      ),
    );

    const nextItems: Array<Record<string, unknown>> =
      mode === 'replace' ? [] : existingItems.map((row) => ({ ...row }));

    if (mode === 'replace') {
      await this.prisma.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'differential_review' },
      });
      existingKeys.clear();
    }

    let imported = 0;
    let skipped = 0;

    for (const item of parsed.items) {
      if (skipItems.has(item.importKey.toUpperCase())) {
        skipped += 1;
        continue;
      }
      const key = normalizeDifferentialKey(item.condition, item.screeningQuestion);
      if (mode === 'merge' && existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const linkedIds = uniqueIdList(
        item.importedReferenceIds
          .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
          .filter(Boolean),
      );
      nextItems.push({
        id: randomUUID(),
        condition: item.condition,
        question: item.screeningQuestion || null,
        whyItMatters: item.whyItMatters || null,
        suggestedPathway: item.positiveResult || null,
        keySymptoms: item.keySymptoms || null,
        distinguishingFeatures: item.howToDistinguish || null,
        recommendedAction: item.suggestedNextStep || null,
        likelihood: item.likelihood,
        required: item.required !== false,
        approved: false,
        source: 'USER',
        evidenceRefIds: linkedIds,
      });
      existingKeys.add(key);
      imported += 1;
    }

    const currentSectionIds = uniqueIdList(
      (
        await this.prisma.pathwayEvidenceMapping.findMany({
          where: { pathwayId, section: 'differential_review', mappingType: 'section' },
          select: { referenceId: true },
        })
      ).map((m) => m.referenceId),
    );
    const importedSectionIds = uniqueIdList(
      parsed.sectionEvidenceIds
        .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
        .filter(Boolean),
    );
    const nextSectionIds =
      mode === 'replace'
        ? importedSectionIds
        : uniqueIdList([...currentSectionIds, ...importedSectionIds]);

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: { differentials: nextItems as Prisma.InputJsonValue },
    });

    await this.syncDifferentialEvidenceMappings(
      pathwayId,
      nextItems.map((row) => ({
        id: String(row.id),
        evidenceRefIds: uniqueIdList(row.evidenceRefIds),
      })),
      nextSectionIds,
      user.id,
      { suggested: true },
    );

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        mode === 'replace'
          ? 'differential_import_replaced_existing'
          : 'differential_import_completed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        imported,
        skipped,
        references: parsed.references.length,
        mode,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'differentials' as const,
      imported,
      skipped,
      created: imported,
      matched: parsed.references.filter((r) => importKeyToRefId.has(r.importKey.toUpperCase()))
        .length,
      parseSource: parsed.format,
      mode,
      message: `Imported ${imported} differential${imported === 1 ? '' : 's'} as Needs review.`,
    };
  }

  async previewTreatmentsImport(
    pathwayId: string,
    dto: PreviewTreatmentsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseTreatmentsImport(text);
    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const existingTreatments = await this.prisma.clinicalTreatment.findMany({
      where: { pathwayId, archivedAt: null },
      select: {
        id: true,
        medicationName: true,
        approved: true,
        libraryLinkStatus: true,
      },
    });

    const referenceRows = parsed.references.map((item) => {
      const match = findMatchingReference(item, existingRefs);
      const defaultAction = match ? ('use_existing' as const) : ('create_new' as const);
      return {
        importKey: item.importKey,
        citationTitle: item.citationTitle,
        organization: item.organization,
        documentType: item.documentType,
        yearEdition: item.yearEdition,
        jurisdiction: item.jurisdiction,
        url: item.url,
        doi: item.doi,
        verificationRequired: item.verificationRequired,
        statusAfterImport: importStatusForItem(item),
        warnings: item.warnings,
        blockingErrors: item.blockingErrors,
        match: match
          ? {
              existingReferenceId: match.id,
              confidence: match.confidence,
              existingStatus: match.status ?? null,
              label:
                match.confidence === 'exact'
                  ? 'Existing reference found'
                  : 'Possible existing reference found',
            }
          : null,
        defaultAction,
      };
    });

    const itemRows = parsed.items.map((item) => {
      const key = normalizeTreatmentImportKey(item.medicationName);
      const existingHit = existingTreatments.find(
        (row) => normalizeTreatmentImportKey(row.medicationName) === key,
      );
      const warnings = [...item.importWarnings];
      if (existingHit) {
        warnings.push('Exact duplicate of an existing treatment (will be skipped on merge)');
      }
      return {
        importKey: item.importKey,
        medicationName: item.medicationName,
        category: item.category,
        recommendationLevel: item.recommendationLevel,
        whyThisOption: item.whyThisOption,
        importedReferenceIds: item.importedReferenceIds,
        documentationReferenceImportId: item.documentationReferenceImportId,
        renalSourceBasis: item.renalSourceBasis,
        renalDosingBasis: item.renalDosingBasis,
        renalEgfrMappingStatus: item.renalEgfrMappingStatus,
        renalMappingReviewRequired: item.renalMappingReviewRequired,
        structuredRenalRuleCount: item.renalDosingRules.length,
        exactDuplicate: Boolean(existingHit),
        warnings,
        blockingErrors: item.blockingErrors,
      };
    });

    const withRefs = itemRows.filter((row) => row.importedReferenceIds.length > 0).length;
    const matchedRefs = referenceRows.filter((r) => r.match).length;
    const newRefs = referenceRows.filter((r) => !r.match).length;
    const verificationRequired = referenceRows.filter((r) => r.verificationRequired).length;
    const structuredEgfr = itemRows.filter((row) => row.structuredRenalRuleCount > 0).length;
    const renalMappingReview = itemRows.filter((row) => row.renalMappingReviewRequired).length;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'treatment_import_parsed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        items: parsed.items.length,
        references: parsed.references.length,
        blocking: parsed.blockingErrors.length,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    const replaceable = existingTreatments.filter((row) => row.libraryLinkStatus !== 'LINKED');

    return {
      target: 'treatments' as const,
      ok: parsed.blockingErrors.length === 0 && parsed.items.length > 0,
      error: parsed.blockingErrors[0] ?? null,
      format: parsed.format,
      existingItemCount: replaceable.length,
      approvedItemCount: replaceable.filter((row) => row.approved).length,
      libraryLinkedCount: existingTreatments.filter((row) => row.libraryLinkStatus === 'LINKED')
        .length,
      blockingErrors: parsed.blockingErrors,
      warnings: parsed.warnings,
      summary: {
        items: parsed.items.length,
        itemsWithReferences: withRefs,
        sectionEvidence: parsed.sectionEvidenceIds.length,
        references: parsed.references.length,
        matchedExisting: matchedRefs,
        newSources: newRefs,
        verificationRequired,
        structuredEgfrRules: structuredEgfr,
        renalMappingReview,
        issueCount: parsed.blockingErrors.length + parsed.warnings.length,
      },
      items: itemRows,
      sectionEvidenceIds: parsed.sectionEvidenceIds,
      references: referenceRows,
    };
  }

  async commitTreatmentsImport(
    pathwayId: string,
    dto: CommitTreatmentsImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.authoring.resolveImportScriptText(dto);
    const parsed = parseTreatmentsImport(text);
    const mode = dto.mode === 'replace' ? 'replace' : 'merge';

    if (!parsed.items.length) {
      throw new BadRequestException(
        parsed.blockingErrors[0] ||
          'Could not find treatments. Paste structured ChatGPT output instead.',
      );
    }
    if (parsed.blockingErrors.length) {
      throw new BadRequestException(parsed.blockingErrors[0]);
    }

    const existingTreatments = await this.prisma.clinicalTreatment.findMany({
      where: { pathwayId, archivedAt: null },
      select: {
        id: true,
        medicationName: true,
        approved: true,
        libraryLinkStatus: true,
      },
    });
    const replaceable = existingTreatments.filter((row) => row.libraryLinkStatus !== 'LINKED');
    if (mode === 'replace' && replaceable.length > 0 && dto.confirmedReplace !== true) {
      throw new BadRequestException(
        'Replace current Treatment Options? Existing draft treatments and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted. Library-linked treatments are kept.',
      );
    }

    const existingRefs = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });
    const decisionByKey = new Map(
      (dto.decisions ?? []).map((d) => [d.importKey.toUpperCase(), d] as const),
    );
    const skipItems = new Set((dto.skipTreatmentKeys ?? []).map((k) => k.toUpperCase()));

    const importKeyToRefId = new Map<string, string>();
    const currentRefs = [...existingRefs];

    for (const item of parsed.references) {
      const decision = decisionByKey.get(item.importKey.toUpperCase());
      const match = findMatchingReference(item, currentRefs);
      const action = decision?.action ?? (match ? 'use_existing' : 'create_new');
      if (action === 'skip') continue;

      if (action === 'use_existing') {
        const refId = decision?.existingReferenceId || match?.id;
        if (!refId) {
          throw new BadRequestException(
            `${item.importKey}: Use existing selected but no matching reference was found.`,
          );
        }
        importKeyToRefId.set(item.importKey.toUpperCase(), refId);
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'treatment_import_reference_matched',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
        continue;
      }

      const createdRef = await this.prisma.pathwayEvidenceReference.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          citationTitle: item.citationTitle,
          organization: item.organization || null,
          edition: item.edition,
          publicationYear: item.publicationYear,
          url: item.url,
          doi: item.doi,
          documentType: item.documentType,
          jurisdiction: item.jurisdiction,
          status: importStatusForItem(item),
          importSource: 'chatgpt',
          verifiedBy: null,
          verificationDate: null,
          createdById: user.id,
        },
      });
      currentRefs.push(createdRef);
      importKeyToRefId.set(item.importKey.toUpperCase(), createdRef.id);
      await this.audit.log({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: 'treatment_import_reference_created',
        module: 'PATHWAY_EVIDENCE_REFERENCES',
        newValue: { pathwayId, referenceId: createdRef.id, importKey: item.importKey },
        ...this.getClientInfo(req),
      });
    }

    if (mode === 'replace' && replaceable.length) {
      const ids = replaceable.map((row) => row.id);
      await this.prisma.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'treatment_options',
          mappingType: 'treatment',
          targetId: { in: ids },
        },
      });
      await this.prisma.clinicalTreatment.deleteMany({
        where: { pathwayId, id: { in: ids } },
      });
    }

    const remaining = await this.prisma.clinicalTreatment.findMany({
      where: { pathwayId, archivedAt: null },
      select: { medicationName: true },
    });
    const existingKeys = new Set(
      remaining.map((row) => normalizeTreatmentImportKey(row.medicationName)),
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

    for (const item of parsed.items) {
      if (skipItems.has(item.importKey.toUpperCase())) {
        skipped += 1;
        continue;
      }
      const key = normalizeTreatmentImportKey(item.medicationName);
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      const linkedIds = uniqueIdList(
        item.importedReferenceIds
          .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
          .filter(Boolean),
      );
      const documentationReferenceId = item.documentationReferenceImportId
        ? importKeyToRefId.get(item.documentationReferenceImportId.toUpperCase()) ?? null
        : null;

      order += 1;
      const created = await this.prisma.clinicalTreatment.create({
        data: {
          pathwayId,
          tenantId: user.tenantId ?? null,
          medicationName: item.medicationName,
          genericName: item.genericName,
          brandName: item.brandName,
          category: item.category as any,
          recommendationLevel: item.recommendationLevel as any,
          strength: item.strength,
          dose: item.dose,
          route: item.route,
          frequency: item.frequency,
          duration: item.duration,
          quantity: item.quantity,
          directions: item.directions,
          clinicalIndication: item.clinicalIndication,
          clinicalNotes: item.whyThisOption || item.clinicalNotes,
          guidelineReference: item.guidelineReference,
          evidenceStrength: item.evidenceStrength,
          provinceAvailability: item.provinceAvailability || 'ALL',
          eligibility: item.eligibility,
          ageRestriction: item.ageRestriction,
          pregnancyNotes: item.pregnancyNotes,
          pregnancyReason: item.pregnancyReason,
          breastfeedingNotes: item.breastfeedingNotes,
          renalAdjustment: item.renalAdjustment,
          renalAdjustmentReason: item.renalAdjustmentReason,
          renalSourceBasis: item.renalSourceBasis,
          renalDosingBasis: item.renalDosingBasis,
          renalDosingRules: item.renalDosingRules as unknown as Prisma.InputJsonValue,
          hepaticAdjustment: item.hepaticAdjustment,
          hepaticAdjustmentReason: item.hepaticAdjustmentReason,
          monitoring: item.monitoring,
          monitoringReason: item.monitoringReason,
          counsellingNotes: item.counsellingNotes,
          followUpAdvice: item.followUpAdvice,
          warnings: item.warnings,
          interactions: item.interactions,
          evidenceRefIds: linkedIds,
          documentationReferenceId,
          metadata: {
            ...item.metadata,
            renalEgfrMappingStatus: item.renalEgfrMappingStatus,
            renalMappingReviewRequired: item.renalMappingReviewRequired,
          } as Prisma.InputJsonValue,
          libraryLinkStatus: 'MANUAL',
          isAiGenerated: true,
          approved: false,
          isActive: true,
          displayOrder: order,
        },
      });
      await this.syncOneTreatmentEvidenceMappings(pathwayId, created.id, linkedIds, user.id);
      existingKeys.add(key);
      imported += 1;
    }

    const currentSectionIds = uniqueIdList(
      (
        await this.prisma.pathwayEvidenceMapping.findMany({
          where: { pathwayId, section: 'treatment_options', mappingType: 'section' },
          select: { referenceId: true },
        })
      ).map((m) => m.referenceId),
    );
    const importedSectionIds = uniqueIdList(
      parsed.sectionEvidenceIds
        .map((id) => importKeyToRefId.get(id.toUpperCase()) ?? '')
        .filter(Boolean),
    );
    const nextSectionIds =
      mode === 'replace'
        ? importedSectionIds
        : uniqueIdList([...currentSectionIds, ...importedSectionIds]);
    await this.syncTreatmentSectionEvidenceMappings(pathwayId, nextSectionIds, user.id);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action:
        mode === 'replace'
          ? 'treatment_import_replaced_existing'
          : 'treatment_import_completed',
      module: 'CLINICAL_PATHWAYS',
      newValue: {
        pathwayId,
        imported,
        skipped,
        references: parsed.references.length,
        mode,
        format: parsed.format,
      },
      ...this.getClientInfo(req),
    });

    return {
      target: 'treatments' as const,
      imported,
      skipped,
      created: imported,
      matched: parsed.references.filter((r) => importKeyToRefId.has(r.importKey.toUpperCase()))
        .length,
      parseSource: parsed.format,
      mode,
      message: `Imported ${imported} treatment${imported === 1 ? '' : 's'} as Needs review.`,
    };
  }

  /** Used by ChatGPT import target=references — preview before commit */
  async previewReferencesImport(
    pathwayId: string,
    dto: PreviewReferencesImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.resolveReferencesImportText(dto);
    const parsed = parseReferenceLibraryMarkdown(text);

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: parsed.ok
        ? 'reference_chatgpt_parse_completed'
        : 'reference_chatgpt_parse_failed',
      module: 'PATHWAY_EVIDENCE_REFERENCES',
      newValue: {
        pathwayId,
        found: parsed.summary.found,
        blocking: parsed.summary.blocking,
        error: parsed.error ?? null,
      },
      ...this.getClientInfo(req),
    });

    if (parsed.error && !parsed.items.length) {
      throw new BadRequestException(parsed.error);
    }

    const existing = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });

    const rows = parsed.items.map((item) => {
      const match = findMatchingReference(item, existing);
      if (match) {
        // audit duplicate detection is aggregated in summary
      }
      const defaultAction =
        match?.confidence === 'exact'
          ? ('use_existing' as const)
          : match
            ? ('use_existing' as const)
            : ('create_new' as const);
      return {
        importKey: item.importKey,
        citationTitle: item.citationTitle,
        organization: item.organization,
        documentType: item.documentType,
        documentTypeRaw: item.documentTypeRaw,
        yearEdition: item.yearEdition,
        jurisdiction: item.jurisdiction,
        url: item.url,
        doi: item.doi,
        suggestedSections: item.suggestedSections,
        documentationReferenceCandidate: item.documentationReferenceCandidate,
        verificationRequired: item.verificationRequired,
        statusAfterImport: importStatusForItem(item),
        unknownSections: item.unknownSections,
        warnings: item.warnings,
        blockingErrors: item.blockingErrors,
        clinicalUseTags: item.clinicalUseTags,
        applicablePathways: item.applicablePathways,
        notes: item.notes,
        match: match
          ? {
              existingReferenceId: match.id,
              confidence: match.confidence,
              existingStatus: match.status ?? null,
              label:
                match.confidence === 'exact'
                  ? 'Existing reference found'
                  : 'Possible duplicate',
            }
          : null,
        defaultAction,
      };
    });

    const exactMatches = rows.filter((r) => r.match?.confidence === 'exact').length;
    const possibleMatches = rows.filter((r) => r.match?.confidence === 'possible').length;

    return {
      target: 'references' as const,
      ok: parsed.ok,
      error: parsed.error ?? null,
      reviewerGovernanceIgnored: parsed.reviewerGovernanceIgnored,
      summary: {
        ...parsed.summary,
        existingMatches: exactMatches + possibleMatches,
        exactMatches,
        possibleMatches,
        newReferences: rows.filter((r) => !r.match).length,
      },
      rows,
    };
  }

  async commitReferencesImport(
    pathwayId: string,
    dto: CommitReferencesImportDto,
    user: RequestUser,
    req: Request,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);
    const text = await this.resolveReferencesImportText(dto);
    const parsed = parseReferenceLibraryMarkdown(text);
    if (!parsed.items.length) {
      throw new BadRequestException(
        parsed.error ||
          'Unable to parse reference library. Please use the required ChatGPT output format.',
      );
    }

    const decisionByKey = new Map(
      dto.decisions.map((d) => [d.importKey.toUpperCase(), d] as const),
    );
    const itemsWithDecisions = parsed.items.map((item) => {
      const decision = decisionByKey.get(item.importKey.toUpperCase());
      return { item, decision };
    });

    const blocked = itemsWithDecisions.filter(
      ({ item, decision }) =>
        decision?.action !== 'skip' && item.blockingErrors.length > 0,
    );
    if (blocked.length) {
      throw new BadRequestException(
        `Fix ${blocked.length} blocking error${blocked.length === 1 ? '' : 's'} before importing.`,
      );
    }

    return this.importReferencesFromChatGpt(
      pathwayId,
      parsed.items,
      user,
      req,
      dto.mode === 'replace' ? 'replace' : 'merge',
      decisionByKey,
      parsed.reviewerGovernanceIgnored,
    );
  }

  /** Used by ChatGPT import target=references (legacy direct import + commit path) */
  async importReferencesFromChatGpt(
    pathwayId: string,
    itemsOrText: string | ParsedReferenceImportItem[],
    user: RequestUser,
    req: Request,
    mode: 'merge' | 'replace' = 'merge',
    decisions?: Map<
      string,
      { importKey: string; action: 'use_existing' | 'create_new' | 'skip'; existingReferenceId?: string }
    >,
    reviewerGovernanceIgnored = false,
  ) {
    await this.findEditablePathwayOrThrow(pathwayId, user);

    let items: ParsedReferenceImportItem[];
    if (typeof itemsOrText === 'string') {
      const parsed = parseReferenceLibraryMarkdown(itemsOrText);
      if (!parsed.items.length) {
        throw new BadRequestException(
          parsed.error ||
            'Unable to parse reference library. Please use the required ChatGPT output format.',
        );
      }
      if (parsed.summary.blocking > 0) {
        throw new BadRequestException(
          `Fix ${parsed.summary.blocking} blocking error${parsed.summary.blocking === 1 ? '' : 's'} before importing.`,
        );
      }
      items = parsed.items;
      reviewerGovernanceIgnored = parsed.reviewerGovernanceIgnored;
    } else {
      items = itemsOrText;
    }

    const existing = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId },
    });

    if (mode === 'replace') {
      const previousLibraryIds = [
        ...new Set(
          existing
            .map((row) => row.libraryItemId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      await this.prisma.pathwayEvidenceMapping.deleteMany({ where: { pathwayId } });
      await this.prisma.pathwayEvidenceReference.deleteMany({ where: { pathwayId } });
      await Promise.all(previousLibraryIds.map((id) => this.referenceLibrary.recountUsage(id)));
    }

    const current = mode === 'replace' ? [] : [...existing];
    let created = 0;
    let matched = 0;
    let skipped = 0;
    let mappingsSuggested = 0;
    const unknownSections: string[] = [];

    for (const item of items) {
      for (const u of item.unknownSections) unknownSections.push(u);

      const decision = decisions?.get(item.importKey.toUpperCase());
      const match = findMatchingReference(item, current);
      const action =
        decision?.action ??
        (match ? 'use_existing' : 'create_new');

      if (action === 'skip') {
        skipped += 1;
        continue;
      }

      if (item.blockingErrors.length) {
        throw new BadRequestException(
          `${item.importKey}: ${item.blockingErrors.join('; ')}`,
        );
      }

      let refId: string | null = null;

      if (action === 'use_existing') {
        refId =
          decision?.existingReferenceId ||
          match?.id ||
          null;
        if (!refId) {
          throw new BadRequestException(
            `${item.importKey}: Use existing selected but no matching reference was found.`,
          );
        }
        // Never overwrite verified metadata from ChatGPT
        matched += 1;
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'reference_chatgpt_existing_reference_reused',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
      } else {
        const master = await this.referenceLibrary.upsertFromCitation(
          {
            citationTitle: item.citationTitle,
            organization: item.organization,
            edition: item.edition,
            publicationYear: item.publicationYear,
            url: item.url,
            doi: item.doi,
            documentType: item.documentType,
            jurisdiction: item.jurisdiction,
            status: importStatusForItem(item),
            importSource: 'chatgpt',
            clinicalUseTags: item.clinicalUseTags,
            suggestedSections: item.suggestedSections,
            documentationCandidate: item.documentationReferenceCandidate,
            verificationRequired: item.verificationRequired,
            notes: item.notes,
          },
          user,
        );
        const existingLink =
          !master.isRetired
            ? current.find((row) => row.libraryItemId === master.id)
            : null;
        if (existingLink) {
          refId = existingLink.id;
          matched += 1;
        } else {
          const createdRef = await this.prisma.pathwayEvidenceReference.create({
            data: {
              pathwayId,
              tenantId: user.tenantId ?? null,
              libraryItemId: master.isRetired ? null : master.id,
              citationTitle: item.citationTitle,
              organization: item.organization,
              edition: item.edition,
              publicationYear: item.publicationYear,
              url: item.url,
              doi: item.doi,
              documentType: item.documentType,
              jurisdiction: item.jurisdiction,
              status: importStatusForItem(item),
              importSource: 'chatgpt',
              clinicalUseTags: item.clinicalUseTags,
              documentationCandidate: item.documentationReferenceCandidate,
              verificationRequired: item.verificationRequired,
              notes: item.notes,
              verifiedBy: null,
              verificationDate: null,
              createdById: user.id,
            },
          });
          current.push(createdRef);
          created += 1;
          refId = createdRef.id;
          if (!master.isRetired) {
            await this.referenceLibrary.recountUsage(master.id);
          }
        }
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'reference_chatgpt_reference_created',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: { pathwayId, referenceId: refId, importKey: item.importKey },
          ...this.getClientInfo(req),
        });
      }

      if (refId && item.suggestedSections.length) {
        const mappingData = item.suggestedSections.map((section) => ({
          pathwayId,
          referenceId: refId!,
          section,
          mappingType: 'section' as const,
          targetId: '',
          suggested: true,
          createdById: user.id,
        }));
        const result = await this.prisma.pathwayEvidenceMapping.createMany({
          data: mappingData,
          skipDuplicates: true,
        });
        mappingsSuggested += result.count;
        await this.audit.log({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: 'reference_chatgpt_mapping_suggested',
          module: 'PATHWAY_EVIDENCE_REFERENCES',
          newValue: {
            pathwayId,
            referenceId: refId,
            sections: item.suggestedSections,
            documentationReferenceCandidate: item.documentationReferenceCandidate,
          },
          ...this.getClientInfo(req),
        });
      }
    }

    // Never set primaryDocumentationReferenceId or governance from ChatGPT
    const messageParts = [
      `Imported ${created} new reference${created === 1 ? '' : 's'}`,
      `${matched} existing reused`,
      skipped ? `${skipped} skipped` : null,
      'All imports require review before verification.',
      reviewerGovernanceIgnored
        ? 'Reviewer/governance information was ignored. Reviewer records must be entered manually.'
        : null,
    ].filter(Boolean);

    return {
      target: 'references' as const,
      imported: created + matched,
      created,
      matched,
      skipped,
      mappingsSuggested,
      unknownSections: [...new Set(unknownSections)],
      reviewerGovernanceIgnored,
      message: messageParts.join(' '),
    };
  }

  private async resolveReferencesImportText(dto: {
    text?: string;
    fileBase64?: string;
    fileName?: string;
  }): Promise<string> {
    if (dto.text?.trim()) return dto.text.trim();
    if (dto.fileBase64) {
      // Plain text / markdown base64. Word files are handled by authoring resolve elsewhere;
      // for references we currently accept UTF-8 text payloads from the modal.
      const decoded = Buffer.from(dto.fileBase64, 'base64').toString('utf8').trim();
      if (decoded.length >= 8) return decoded;
    }
    throw new BadRequestException('Paste or upload a ChatGPT Reference Library response.');
  }

  private normalizeReviewedAreas(areas: string[]): string[] {
    const allowed = new Set<string>(REVIEWED_AREAS);
    return [...new Set(areas.map((a) => a.trim()).filter((a) => allowed.has(a)))];
  }

  private async refreshGovernanceFromReviewers(pathwayId: string) {
    const reviewers = await this.prisma.pathwayReviewer.findMany({ where: { pathwayId } });
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId },
      select: {
        governance: true,
        primaryDocumentationReferenceId: true,
        secondaryDocumentationReferenceId: true,
      },
    });
    if (!pathway) return;
    const current = parsePathwayGovernance(
      pathway.governance,
      pathway.primaryDocumentationReferenceId,
      pathway.secondaryDocumentationReferenceId,
    );
    const hasInternal = reviewers.some((r) => r.reviewerType === 'internal');
    const hasExternal = reviewers.some((r) => r.reviewerType === 'external');
    const latest = reviewers
      .map((r) => r.reviewDate)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const next = {
      ...current,
      internalReviewStatus: hasInternal
        ? ('completed' as const)
        : current.internalReviewStatus === 'completed'
          ? ('pending' as const)
          : current.internalReviewStatus,
      externalPeerReviewStatus: hasExternal
        ? ('completed' as const)
        : current.externalPeerReviewStatus === 'completed'
          ? ('pending' as const)
          : current.externalPeerReviewStatus,
      lastReviewedAt: latest?.toISOString() ?? current.lastReviewedAt,
    };

    await this.prisma.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        governance: {
          internalReviewStatus: next.internalReviewStatus,
          externalPeerReviewStatus: next.externalPeerReviewStatus,
          lastReviewedAt: next.lastReviewedAt,
          nextReviewDueAt: next.nextReviewDueAt,
        } as Prisma.InputJsonValue,
        ...(latest ? { lastClinicalReview: latest } : {}),
      },
    });
  }

  private async validateMappingTargets(
    pathwayId: string,
    mappings: Array<{ section: string; mappingType: string; targetId: string }>,
  ) {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId },
      select: {
        questions: { select: { id: true } },
        treatments: { select: { id: true } },
        counsellings: { select: { id: true } },
        redFlags: true,
        differentials: true,
      },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');

    const questionIds = new Set(pathway.questions.map((q) => q.id));
    const treatmentIds = new Set(pathway.treatments.map((t) => t.id));
    const guidanceIds = new Set(pathway.counsellings.map((c) => c.id));
    const redFlagIds = new Set(
      (Array.isArray(pathway.redFlags) ? pathway.redFlags : [])
        .map((r) => (r && typeof r === 'object' ? (r as { id?: string }).id : null))
        .filter(Boolean) as string[],
    );
    const differentialIds = new Set(
      (Array.isArray(pathway.differentials) ? pathway.differentials : [])
        .map((r) => (r && typeof r === 'object' ? (r as { id?: string }).id : null))
        .filter(Boolean) as string[],
    );

    for (const mapping of mappings) {
      if (mapping.mappingType === 'section') continue;
      if (!mapping.targetId) {
        throw new BadRequestException('Item mappings require a targetId.');
      }
      const ok =
        (mapping.mappingType === 'question' && questionIds.has(mapping.targetId)) ||
        (mapping.mappingType === 'treatment' && treatmentIds.has(mapping.targetId)) ||
        (mapping.mappingType === 'guidance' && guidanceIds.has(mapping.targetId)) ||
        (mapping.mappingType === 'red_flag' && redFlagIds.has(mapping.targetId)) ||
        (mapping.mappingType === 'differential' && differentialIds.has(mapping.targetId));
      if (!ok) {
        throw new BadRequestException(
          `Invalid mapping target ${mapping.targetId} for ${mapping.mappingType}.`,
        );
      }
    }
  }

  /**
   * Expand section-wide mappings into explicit item mappings for every current
   * item in that section. Keeps item-level Why? evidence in sync with "Apply to all".
   */
  private async expandSectionWideToItems(
    tx: Prisma.TransactionClient,
    pathwayId: string,
    mappings: Array<{ section: string; mappingType: string; targetId: string }>,
  ): Promise<Array<{ section: string; mappingType: string; targetId: string }>> {
    const expanded = [...mappings];
    const has = (section: string, mappingType: string, targetId: string) =>
      expanded.some(
        (m) =>
          m.section === section &&
          m.mappingType === mappingType &&
          m.targetId === targetId,
      );
    const wants = (section: string) =>
      mappings.some((m) => m.section === section && m.mappingType === 'section');

    if (wants('presentation_review')) {
      const questions = await tx.clinicalQuestion.findMany({
        where: { pathwayId },
        select: { id: true },
      });
      for (const q of questions) {
        if (!has('presentation_review', 'question', q.id)) {
          expanded.push({
            section: 'presentation_review',
            mappingType: 'question',
            targetId: q.id,
          });
        }
      }
    }

    if (wants('treatment_options')) {
      const treatments = await tx.clinicalTreatment.findMany({
        where: { pathwayId, isActive: true, archivedAt: null },
        select: { id: true },
      });
      for (const t of treatments) {
        if (!has('treatment_options', 'treatment', t.id)) {
          expanded.push({
            section: 'treatment_options',
            mappingType: 'treatment',
            targetId: t.id,
          });
        }
      }
    }

    if (wants('patient_guidance')) {
      const rows = await tx.clinicalCounselling.findMany({
        where: { pathwayId, archivedAt: null },
        select: { id: true },
      });
      for (const row of rows) {
        if (!has('patient_guidance', 'guidance', row.id)) {
          expanded.push({
            section: 'patient_guidance',
            mappingType: 'guidance',
            targetId: row.id,
          });
        }
      }
    }

    if (wants('red_flags') || wants('differential_review')) {
      const pathway = await tx.clinicalPathway.findFirst({
        where: { id: pathwayId },
        select: { redFlags: true, differentials: true },
      });
      if (wants('red_flags') && Array.isArray(pathway?.redFlags)) {
        for (const raw of pathway!.redFlags as unknown[]) {
          const id =
            raw && typeof raw === 'object'
              ? (raw as { id?: string }).id
              : null;
          if (id && !has('red_flags', 'red_flag', id)) {
            expanded.push({
              section: 'red_flags',
              mappingType: 'red_flag',
              targetId: id,
            });
          }
        }
      }
      if (wants('differential_review') && Array.isArray(pathway?.differentials)) {
        for (const raw of pathway!.differentials as unknown[]) {
          const id =
            raw && typeof raw === 'object'
              ? (raw as { id?: string }).id
              : null;
          if (id && !has('differential_review', 'differential', id)) {
            expanded.push({
              section: 'differential_review',
              mappingType: 'differential',
              targetId: id,
            });
          }
        }
      }
    }

    return expanded;
  }

  private async syncContentEvidenceFromMappings(
    tx: Prisma.TransactionClient,
    pathwayId: string,
    referenceId: string,
    nextInput: Array<{ section: string; mappingType: string; targetId: string }>,
    previous: Array<{ section: string; mappingType: string; targetId: string }>,
  ) {
    const next = await this.expandSectionWideToItems(tx, pathwayId, nextInput);

    const prevTargets = new Set(
      previous.filter((m) => m.targetId).map((m) => `${m.mappingType}:${m.targetId}`),
    );
    const nextTargets = new Set(
      next.filter((m) => m.targetId).map((m) => `${m.mappingType}:${m.targetId}`),
    );
    const prevHadSection = (section: string) =>
      previous.some((m) => m.section === section && m.mappingType === 'section');
    const nextHasSection = (section: string) =>
      next.some((m) => m.section === section && m.mappingType === 'section');

    // Presentation section-wide — merge into existing JSON (do not wipe other keys).
    const pathwayRow = await tx.clinicalPathway.findFirst({
      where: { id: pathwayId },
      select: { presentationReview: true },
    });
    const section = parsePresentationReviewState(pathwayRow?.presentationReview);
    const wantsPresentationSection = nextHasSection('presentation_review');
    let sectionIds = section.sectionEvidenceRefIds.filter((id) => id !== referenceId);
    if (wantsPresentationSection) sectionIds = [...sectionIds, referenceId];
    const priorPresentation =
      pathwayRow?.presentationReview &&
      typeof pathwayRow.presentationReview === 'object' &&
      !Array.isArray(pathwayRow.presentationReview)
        ? (pathwayRow.presentationReview as Record<string, unknown>)
        : {};
    await tx.clinicalPathway.update({
      where: { id: pathwayId },
      data: {
        presentationReview: {
          ...priorPresentation,
          sectionEvidenceRefIds: uniqueIdList(sectionIds),
        } as Prisma.InputJsonValue,
      },
    });

    // Questions — when section-wide toggles, touch every question so unlinks resolve.
    const allQuestionIds =
      wantsPresentationSection || prevHadSection('presentation_review')
        ? (
            await tx.clinicalQuestion.findMany({
              where: { pathwayId },
              select: { id: true },
            })
          ).map((q) => q.id)
        : [];
    const questionIds = [
      ...new Set([
        ...allQuestionIds,
        ...[...prevTargets, ...nextTargets]
          .filter((k) => k.startsWith('question:'))
          .map((k) => k.slice('question:'.length)),
      ]),
    ];
    for (const questionId of questionIds) {
      const question = await tx.clinicalQuestion.findFirst({
        where: { id: questionId, pathwayId },
        select: { id: true, evidenceRefIds: true, approved: true },
      });
      if (!question) continue;
      const linked = next.some(
        (m) => m.mappingType === 'question' && m.targetId === questionId,
      );
      const wasLinked =
        previous.some(
          (m) => m.mappingType === 'question' && m.targetId === questionId,
        ) || prevHadSection('presentation_review');
      let ids = question.evidenceRefIds.filter((id) => id !== referenceId);
      if (linked) ids = [...ids, referenceId];
      const changed = linked !== wasLinked;
      await tx.clinicalQuestion.update({
        where: { id: questionId },
        data: {
          evidenceRefIds: uniqueIdList(ids),
          ...(changed
            ? { approved: false, status: QuestionStatus.NEEDS_REVIEW, approvedAt: null }
            : {}),
        },
      });
    }

    // Treatments
    const allTreatmentIds =
      nextHasSection('treatment_options') || prevHadSection('treatment_options')
        ? (
            await tx.clinicalTreatment.findMany({
              where: { pathwayId, isActive: true, archivedAt: null },
              select: { id: true },
            })
          ).map((t) => t.id)
        : [];
    const treatmentIds = [
      ...new Set([
        ...allTreatmentIds,
        ...[...prevTargets, ...nextTargets]
          .filter((k) => k.startsWith('treatment:'))
          .map((k) => k.slice('treatment:'.length)),
      ]),
    ];
    for (const treatmentId of treatmentIds) {
      const treatment = await tx.clinicalTreatment.findFirst({
        where: { id: treatmentId, pathwayId },
        select: { id: true, evidenceRefIds: true },
      });
      if (!treatment) continue;
      const linked = next.some(
        (m) => m.mappingType === 'treatment' && m.targetId === treatmentId,
      );
      const wasLinked =
        previous.some(
          (m) => m.mappingType === 'treatment' && m.targetId === treatmentId,
        ) || prevHadSection('treatment_options');
      let ids = treatment.evidenceRefIds.filter((id) => id !== referenceId);
      if (linked) ids = [...ids, referenceId];
      await tx.clinicalTreatment.update({
        where: { id: treatmentId },
        data: {
          evidenceRefIds: uniqueIdList(ids),
          ...(linked !== wasLinked ? { approved: false } : {}),
        },
      });
    }

    // Guidance
    const allGuidanceIds =
      nextHasSection('patient_guidance') || prevHadSection('patient_guidance')
        ? (
            await tx.clinicalCounselling.findMany({
              where: { pathwayId, archivedAt: null },
              select: { id: true },
            })
          ).map((c) => c.id)
        : [];
    const guidanceIds = [
      ...new Set([
        ...allGuidanceIds,
        ...[...prevTargets, ...nextTargets]
          .filter((k) => k.startsWith('guidance:'))
          .map((k) => k.slice('guidance:'.length)),
      ]),
    ];
    for (const guidanceId of guidanceIds) {
      const item = await tx.clinicalCounselling.findFirst({
        where: { id: guidanceId, pathwayId },
        select: { id: true, evidenceRefIds: true },
      });
      if (!item) continue;
      const linked = next.some(
        (m) => m.mappingType === 'guidance' && m.targetId === guidanceId,
      );
      const wasLinked =
        previous.some(
          (m) => m.mappingType === 'guidance' && m.targetId === guidanceId,
        ) || prevHadSection('patient_guidance');
      let ids = item.evidenceRefIds.filter((id) => id !== referenceId);
      if (linked) ids = [...ids, referenceId];
      await tx.clinicalCounselling.update({
        where: { id: guidanceId },
        data: {
          evidenceRefIds: uniqueIdList(ids),
          ...(linked !== wasLinked ? { approved: false } : {}),
        },
      });
    }

    // Red flags / differentials JSON
    await this.syncJsonItemEvidence(
      tx,
      pathwayId,
      'redFlags',
      'red_flag',
      referenceId,
      next,
      previous,
      prevHadSection('red_flags'),
    );
    await this.syncJsonItemEvidence(
      tx,
      pathwayId,
      'differentials',
      'differential',
      referenceId,
      next,
      previous,
      prevHadSection('differential_review'),
    );
  }

  private async syncJsonItemEvidence(
    tx: Prisma.TransactionClient,
    pathwayId: string,
    field: 'redFlags' | 'differentials',
    mappingType: 'red_flag' | 'differential',
    referenceId: string,
    next: Array<{ mappingType: string; targetId: string }>,
    previous: Array<{ mappingType: string; targetId: string }>,
    previousHadSectionWide = false,
  ) {
    const pathway = await tx.clinicalPathway.findFirst({
      where: { id: pathwayId },
      select: { [field]: true },
    });
    const items = Array.isArray(pathway?.[field]) ? [...(pathway![field] as unknown[])] : null;
    if (!items) return;

    let changed = false;
    const updated = items.map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const item = { ...(raw as Record<string, unknown>) };
      const id = typeof item.id === 'string' ? item.id : null;
      if (!id) return item;
      const linked = next.some((m) => m.mappingType === mappingType && m.targetId === id);
      const wasLinked =
        previous.some((m) => m.mappingType === mappingType && m.targetId === id) ||
        previousHadSectionWide;
      const currentIds = uniqueIdList(item.evidenceRefIds ?? item.referenceIds);
      let ids = currentIds.filter((x) => x !== referenceId);
      if (linked) ids = [...ids, referenceId];
      if (ids.join('|') !== currentIds.join('|') || linked !== wasLinked) {
        changed = true;
        item.evidenceRefIds = ids;
        if (linked !== wasLinked) item.approved = false;
      }
      return item;
    });

    if (changed) {
      await tx.clinicalPathway.update({
        where: { id: pathwayId },
        data: { [field]: updated as Prisma.InputJsonValue },
      });
    }
  }

  private async unlinkReferenceFromContent(
    tx: Prisma.TransactionClient,
    pathwayId: string,
    referenceId: string,
  ) {
    const questions = await tx.clinicalQuestion.findMany({
      where: { pathwayId, evidenceRefIds: { has: referenceId } },
      select: { id: true, evidenceRefIds: true },
    });
    for (const question of questions) {
      await tx.clinicalQuestion.update({
        where: { id: question.id },
        data: {
          evidenceRefIds: question.evidenceRefIds.filter((id) => id !== referenceId),
          status: QuestionStatus.NEEDS_REVIEW,
          approved: false,
          approvedAt: null,
        },
      });
    }

    const treatments = await tx.clinicalTreatment.findMany({
      where: { pathwayId, evidenceRefIds: { has: referenceId } },
      select: { id: true, evidenceRefIds: true, documentationReferenceId: true },
    });
    for (const treatment of treatments) {
      await tx.clinicalTreatment.update({
        where: { id: treatment.id },
        data: {
          evidenceRefIds: treatment.evidenceRefIds.filter((id) => id !== referenceId),
          documentationReferenceId:
            treatment.documentationReferenceId === referenceId
              ? null
              : treatment.documentationReferenceId,
          approved: false,
        },
      });
    }

    const guidance = await tx.clinicalCounselling.findMany({
      where: { pathwayId, evidenceRefIds: { has: referenceId } },
      select: { id: true, evidenceRefIds: true },
    });
    for (const item of guidance) {
      await tx.clinicalCounselling.update({
        where: { id: item.id },
        data: {
          evidenceRefIds: item.evidenceRefIds.filter((id) => id !== referenceId),
          approved: false,
        },
      });
    }

    for (const field of ['redFlags', 'differentials'] as const) {
      const pathway = await tx.clinicalPathway.findFirst({
        where: { id: pathwayId },
        select: { [field]: true },
      });
      const items = Array.isArray(pathway?.[field]) ? (pathway![field] as unknown[]) : null;
      if (!items) continue;
      const updated = items.map((raw) => {
        if (!raw || typeof raw !== 'object') return raw;
        const item = { ...(raw as Record<string, unknown>) };
        const ids = uniqueIdList(item.evidenceRefIds ?? item.referenceIds).filter(
          (id) => id !== referenceId,
        );
        item.evidenceRefIds = ids;
        return item;
      });
      await tx.clinicalPathway.update({
        where: { id: pathwayId },
        data: { [field]: updated as Prisma.InputJsonValue },
      });
    }
  }

  private async assertLibraryReferenceIds(pathwayId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const found = await this.prisma.pathwayEvidenceReference.findMany({
      where: { pathwayId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException(
        'One or more references are not in this pathway’s References & Governance library.',
      );
    }
    return ids;
  }

  private async syncQuestionEvidenceMappings(
    pathwayId: string,
    questionId: string,
    referenceIds: string[],
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'presentation_review',
          mappingType: 'question',
          targetId: questionId,
        },
      });
      if (referenceIds.length) {
        await tx.pathwayEvidenceMapping.createMany({
          data: referenceIds.map((referenceId) => ({
            pathwayId,
            referenceId,
            section: 'presentation_review',
            mappingType: 'question',
            targetId: questionId,
            createdById: userId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async syncRedFlagEvidenceMappings(
    pathwayId: string,
    flags: Array<{ id: string; evidenceRefIds: string[] }>,
    sectionEvidenceRefIds: string[] | undefined,
    userId: string,
    options?: { suggested?: boolean },
  ) {
    const suggested = options?.suggested === true;
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'red_flags', mappingType: 'red_flag' },
      });
      const itemRows = flags.flatMap((flag) =>
        flag.evidenceRefIds.map((referenceId) => ({
          pathwayId,
          referenceId,
          section: 'red_flags',
          mappingType: 'red_flag',
          targetId: flag.id,
          suggested,
          createdById: userId,
        })),
      );
      if (itemRows.length) {
        await tx.pathwayEvidenceMapping.createMany({ data: itemRows, skipDuplicates: true });
      }
      if (sectionEvidenceRefIds) {
        await tx.pathwayEvidenceMapping.deleteMany({
          where: { pathwayId, section: 'red_flags', mappingType: 'section' },
        });
        if (sectionEvidenceRefIds.length) {
          await tx.pathwayEvidenceMapping.createMany({
            data: sectionEvidenceRefIds.map((referenceId) => ({
              pathwayId,
              referenceId,
              section: 'red_flags',
              mappingType: 'section',
              targetId: '',
              suggested,
              createdById: userId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
  }

  private async syncDifferentialEvidenceMappings(
    pathwayId: string,
    items: Array<{ id: string; evidenceRefIds: string[] }>,
    sectionEvidenceRefIds: string[] | undefined,
    userId: string,
    options?: { suggested?: boolean },
  ) {
    const suggested = options?.suggested === true;
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'differential_review', mappingType: 'differential' },
      });
      const itemRows = items.flatMap((item) =>
        item.evidenceRefIds.map((referenceId) => ({
          pathwayId,
          referenceId,
          section: 'differential_review',
          mappingType: 'differential',
          targetId: item.id,
          suggested,
          createdById: userId,
        })),
      );
      if (itemRows.length) {
        await tx.pathwayEvidenceMapping.createMany({ data: itemRows, skipDuplicates: true });
      }
      if (sectionEvidenceRefIds) {
        await tx.pathwayEvidenceMapping.deleteMany({
          where: { pathwayId, section: 'differential_review', mappingType: 'section' },
        });
        if (sectionEvidenceRefIds.length) {
          await tx.pathwayEvidenceMapping.createMany({
            data: sectionEvidenceRefIds.map((referenceId) => ({
              pathwayId,
              referenceId,
              section: 'differential_review',
              mappingType: 'section',
              targetId: '',
              suggested,
              createdById: userId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
  }

  private async syncOneTreatmentEvidenceMappings(
    pathwayId: string,
    treatmentId: string,
    referenceIds: string[],
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'treatment_options',
          mappingType: 'treatment',
          targetId: treatmentId,
        },
      });
      if (referenceIds.length) {
        await tx.pathwayEvidenceMapping.createMany({
          data: referenceIds.map((referenceId) => ({
            pathwayId,
            referenceId,
            section: 'treatment_options',
            mappingType: 'treatment',
            targetId: treatmentId,
            createdById: userId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async syncTreatmentSectionEvidenceMappings(
    pathwayId: string,
    referenceIds: string[],
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: { pathwayId, section: 'treatment_options', mappingType: 'section' },
      });
      if (referenceIds.length) {
        await tx.pathwayEvidenceMapping.createMany({
          data: referenceIds.map((referenceId) => ({
            pathwayId,
            referenceId,
            section: 'treatment_options',
            mappingType: 'section',
            targetId: '',
            createdById: userId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async syncSectionEvidenceMappings(
    pathwayId: string,
    referenceIds: string[],
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.pathwayEvidenceMapping.deleteMany({
        where: {
          pathwayId,
          section: 'presentation_review',
          mappingType: 'section',
          targetId: '',
        },
      });
      if (referenceIds.length) {
        await tx.pathwayEvidenceMapping.createMany({
          data: referenceIds.map((referenceId) => ({
            pathwayId,
            referenceId,
            section: 'presentation_review',
            mappingType: 'section',
            targetId: '',
            createdById: userId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  private questionContentChanged(
    existing: {
      question: string;
      description: string | null;
      helpText: string | null;
      required: boolean;
      type: string;
      evidenceRefIds: string[];
      visibilityRule: Prisma.JsonValue | null;
    },
    next: Record<string, unknown>,
  ): boolean {
    if (typeof next.question === 'string' && next.question !== existing.question) return true;
    if (next.description !== undefined && (next.description || null) !== existing.description) return true;
    if (next.helpText !== undefined && (next.helpText || null) !== existing.helpText) return true;
    if (typeof next.required === 'boolean' && next.required !== existing.required) return true;
    if (typeof next.type === 'string' && next.type !== existing.type) return true;
    if (Array.isArray(next.evidenceRefIds)) {
      const current = [...existing.evidenceRefIds].sort().join('|');
      const incoming = [...(next.evidenceRefIds as string[])].sort().join('|');
      if (current !== incoming) return true;
    }
    if (next.visibilityRule !== undefined) {
      const current = JSON.stringify(existing.visibilityRule ?? null);
      const incoming = JSON.stringify(next.visibilityRule ?? null);
      if (current !== incoming) return true;
    }
    return false;
  }
}

function isPresentationReviewSection(name: string | null | undefined): boolean {
  return !name || name === 'diagnosisConfirmation' || name === 'treatmentEligibility';
}

function asJsonItemList(value: unknown): Array<Record<string, unknown> & { id?: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> & { id?: string } =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
}

function asJsonItemMap(value: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !rec.id) continue;
    map.set(rec.id, rec);
  }
  return map;
}

function redFlagContentChanged(
  previous: Record<string, unknown> | undefined,
  next: {
    title: string;
    question: string | null;
    description: string | null;
    severity: string;
    whyItMatters: string | null;
    action: string | null;
    actionNote: string | null;
    required: boolean;
    evidenceRefIds: string[];
  },
): boolean {
  if (!previous) return true;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  if (text(previous.title) !== next.title) return true;
  const previousQuestion = text(previous.question) || text(previous.description);
  if (previousQuestion !== (next.question ?? '')) return true;
  if (String(previous.severity ?? '') !== next.severity) return true;
  if (text(previous.whyItMatters) !== (next.whyItMatters ?? '')) return true;
  if (text(previous.action) !== (next.action ?? '')) return true;
  if (text(previous.actionNote) !== (next.actionNote ?? '')) return true;
  if ((previous.required !== false) !== next.required) return true;
  const prevIds = uniqueIdList(previous.evidenceRefIds).slice().sort().join('|');
  const nextIds = next.evidenceRefIds.slice().sort().join('|');
  return prevIds !== nextIds;
}

function jsonTextOrPrevious(value: unknown, previous: unknown): string | null {
  if (value !== undefined) {
    if (value === null) return null;
    return String(value).trim() || null;
  }
  return typeof previous === 'string' ? previous.trim() || null : null;
}

function differentialContentChanged(
  previous: Record<string, unknown> | undefined,
  next: {
    condition: string;
    question: string | null;
    whyItMatters: string | null;
    suggestedPathway: string | null;
    distinguishingFeatures: string | null;
    keySymptoms: string | null;
    recommendedAction: string | null;
    likelihood: string | null;
    required: boolean;
    evidenceRefIds: string[];
  },
): boolean {
  if (!previous) return true;
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  if (text(previous.condition) !== next.condition) return true;
  if (text(previous.question) !== (next.question ?? '')) return true;
  if (text(previous.whyItMatters) !== (next.whyItMatters ?? '')) return true;
  if (text(previous.suggestedPathway) !== (next.suggestedPathway ?? '')) return true;
  if (text(previous.distinguishingFeatures) !== (next.distinguishingFeatures ?? '')) return true;
  if (text(previous.keySymptoms) !== (next.keySymptoms ?? '')) return true;
  if (text(previous.recommendedAction) !== (next.recommendedAction ?? '')) return true;
  if (String(previous.likelihood ?? '') !== String(next.likelihood ?? '')) return true;
  if ((previous.required !== false) !== next.required) return true;
  const prevIds = uniqueIdList(previous.evidenceRefIds).slice().sort().join('|');
  const nextIds = next.evidenceRefIds.slice().sort().join('|');
  return prevIds !== nextIds;
}

function treatmentMaterialChanged(
  existing: {
    medicationName: string;
    genericName: string | null;
    strength: string | null;
    dose: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    recommendationLevel: string;
    clinicalNotes: string | null;
    documentationReferenceId: string | null;
    evidenceRefIds: string[];
  },
  next: {
    medicationName?: string;
    genericName?: string | null;
    strength?: string | null;
    dose?: string | null;
    frequency?: string | null;
    duration?: string | null;
    route?: string | null;
    recommendationLevel?: string;
    clinicalNotes?: string | null;
    documentationReferenceId?: string | null;
    evidenceRefIds?: string[];
  },
): boolean {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const fields = [
    'medicationName',
    'genericName',
    'strength',
    'dose',
    'frequency',
    'duration',
    'route',
    'recommendationLevel',
    'clinicalNotes',
    'documentationReferenceId',
  ] as const;
  for (const field of fields) {
    if (next[field] === undefined) continue;
    if (text(existing[field]) !== text(next[field])) return true;
  }
  if (next.evidenceRefIds !== undefined) {
    const prevIds = uniqueIdList(existing.evidenceRefIds).slice().sort().join('|');
    const nextIds = uniqueIdList(next.evidenceRefIds).slice().sort().join('|');
    if (prevIds !== nextIds) return true;
  }
  return false;
}

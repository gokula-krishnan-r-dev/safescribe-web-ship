import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import { AuditService } from '@/modules/audit/audit.service';
import { MedicationSafetyEvaluatorService } from '@/modules/medication-safety/medication-safety-evaluator.service';
import { PrismaService } from '@/prisma/prisma.service';
import { matchPathwayCondition } from './pathway-qa.match';
import {
  expandUniqueVariants,
  parsePathwayQaWorkbook,
  workbookPreview,
} from './pathway-qa.parser';
import { executeUniqueVariants, summarizeResults } from './pathway-qa.runner';
import type {
  PathwayQaParsedWorkbook,
  PathwayQaPathwaySnapshot,
} from './pathway-qa.types';

const PREVIEW_CACHE_MAX = 40;
const previewCache = new Map<
  string,
  { at: number; parsed: PathwayQaParsedWorkbook; fileName: string; byteSize: number; sha256: string }
>();

@Injectable()
export class PathwayQaService {
  private readonly logger = new Logger(PathwayQaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evaluator: MedicationSafetyEvaluatorService,
  ) {}

  previewUpload(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload an Excel workbook to continue.');
    }
    const { parsed, sha256 } = parsePathwayQaWorkbook(file.buffer, file.originalname || 'workbook.xlsx');
    this.rememberPreview(sha256, parsed, file.originalname || 'workbook.xlsx', file.buffer.byteLength);
    return {
      sha256,
      fileName: file.originalname || 'workbook.xlsx',
      byteSize: file.buffer.byteLength,
      preview: workbookPreview(parsed),
    };
  }

  async saveWorkbook(file: Express.Multer.File, user: RequestUser, req?: Request) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload an Excel workbook to continue.');
    }
    const { parsed, sha256 } = parsePathwayQaWorkbook(file.buffer, file.originalname || 'workbook.xlsx');
    this.rememberPreview(sha256, parsed, file.originalname || 'workbook.xlsx', file.buffer.byteLength);

    const existing = await this.prisma.pathwayQaWorkbook.findFirst({
      where: { sha256, uploadedById: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const workbook = existing
      ? await this.prisma.pathwayQaWorkbook.update({
          where: { id: existing.id },
          data: {
            fileName: file.originalname || existing.fileName,
            parsed: parsed as unknown as Prisma.InputJsonValue,
            sheetNames: parsed.sheetNames,
            caseCount: parsed.cases.length,
            conditionCount: new Set(parsed.cases.map((item) => item.condition)).size,
            permutationCount: parsed.permutations.length,
            byteSize: file.buffer.byteLength,
          },
        })
      : await this.prisma.pathwayQaWorkbook.create({
          data: {
            fileName: file.originalname || 'workbook.xlsx',
            sha256,
            byteSize: file.buffer.byteLength,
            sheetNames: parsed.sheetNames,
            caseCount: parsed.cases.length,
            conditionCount: new Set(parsed.cases.map((item) => item.condition)).size,
            permutationCount: parsed.permutations.length,
            parsed: parsed as unknown as Prisma.InputJsonValue,
            uploadedById: user.id,
          },
        });

    const client = req ? getClientInfo(req) : { ipAddress: undefined, userAgent: undefined };
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: existing ? 'PATHWAY_QA_WORKBOOK_UPDATED' : 'PATHWAY_QA_WORKBOOK_UPLOADED',
      module: 'pathway-qa',
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      newValue: {
        workbookId: workbook.id,
        fileName: workbook.fileName,
        sha256,
        caseCount: workbook.caseCount,
      },
    });

    return {
      ...this.serializeWorkbook(workbook),
      preview: workbookPreview(parsed),
    };
  }

  async listWorkbooks() {
    const rows = await this.prisma.pathwayQaWorkbook.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        uploadedBy: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { runs: true } },
      },
    });
    return rows.map((row) => ({
      ...this.serializeWorkbook(row),
      uploadedBy: `${row.uploadedBy.firstName} ${row.uploadedBy.lastName}`.trim(),
      runCount: row._count.runs,
    }));
  }

  async listRuns(query: { pathwayId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 20));
    const where = query.pathwayId ? { pathwayId: query.pathwayId } : {};
    const [total, rows] = await Promise.all([
      this.prisma.pathwayQaRun.count({ where }),
      this.prisma.pathwayQaRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          workbook: { select: { id: true, fileName: true, caseCount: true, conditionCount: true } },
          pathway: { select: { id: true, name: true, condition: true, status: true, version: true } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => this.serializeRunListItem(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getRun(id: string) {
    const row = await this.prisma.pathwayQaRun.findUnique({
      where: { id },
      include: {
        workbook: { select: { id: true, fileName: true, caseCount: true, conditionCount: true, permutationCount: true } },
        pathway: { select: { id: true, name: true, condition: true, status: true, version: true } },
        createdBy: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    if (!row) throw new NotFoundException('Test run not found');
    return this.serializeRunDetail(row);
  }

  async latestForPathway(pathwayId: string) {
    const row = await this.prisma.pathwayQaRun.findFirst({
      where: { pathwayId },
      orderBy: { createdAt: 'desc' },
      include: {
        workbook: { select: { id: true, fileName: true, caseCount: true, conditionCount: true } },
        pathway: { select: { id: true, name: true, condition: true, status: true, version: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return row ? this.serializeRunListItem(row) : null;
  }

  async run(opts: {
    pathwayId: string;
    workbookId?: string;
    file?: Express.Multer.File;
    user: RequestUser;
    req?: Request;
  }) {
    const pathway = await this.loadPathway(opts.pathwayId);
    const workbook = await this.resolveWorkbook(opts);
    const parsed = workbook.parsed as unknown as PathwayQaParsedWorkbook;
    const match = matchPathwayCondition(pathway.name, pathway.condition, parsed.cases);

    const run = await this.prisma.pathwayQaRun.create({
      data: {
        workbookId: workbook.id,
        pathwayId: pathway.id,
        status: 'RUNNING',
        matchedCondition: match.condition,
        matchScore: match.score || null,
        matchSuggestions: match.suggestions as unknown as Prisma.InputJsonValue,
        createdById: opts.user.id,
      },
    });

    const started = Date.now();
    try {
      if (!match.condition) {
        const summary = summarizeResults([]);
        const finished = await this.prisma.pathwayQaRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            errorMessage: `No workbook condition matched “${pathway.condition || pathway.name}”. Closest: ${
              match.suggestions[0]?.condition ?? 'none'
            }.`,
            summary: { ...summary, total: 0 } as unknown as Prisma.InputJsonValue,
            results: [] as unknown as Prisma.InputJsonValue,
            durationMs: Date.now() - started,
            finishedAt: new Date(),
          },
        });
        await this.auditRun(opts.user, opts.req, finished.id, pathway.id, 'PATHWAY_QA_RUN_FAILED', {
          reason: 'NO_CONDITION_MATCH',
          suggestions: match.suggestions,
        });
        return this.getRun(finished.id);
      }

      const cases = parsed.cases.filter((item) => item.condition === match.condition);
      const variants = cases.flatMap((item) => expandUniqueVariants(item));
      const results = await executeUniqueVariants({
        variants,
        pathway,
        evaluator: this.evaluator,
      });
      const summary = summarizeResults(results);
      const finished = await this.prisma.pathwayQaRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          summary: summary as unknown as Prisma.InputJsonValue,
          results: results as unknown as Prisma.InputJsonValue,
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        },
      });
      await this.auditRun(opts.user, opts.req, finished.id, pathway.id, 'PATHWAY_QA_RUN_COMPLETED', {
        matchedCondition: match.condition,
        summary,
      });
      return this.getRun(finished.id);
    } catch (err) {
      this.logger.error(`Pathway QA run ${run.id} failed`, err instanceof Error ? err.stack : String(err));
      await this.prisma.pathwayQaRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - started,
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  }

  private rememberPreview(
    sha256: string,
    parsed: PathwayQaParsedWorkbook,
    fileName: string,
    byteSize: number,
  ) {
    if (previewCache.size >= PREVIEW_CACHE_MAX) {
      const first = previewCache.keys().next().value;
      if (first) previewCache.delete(first);
    }
    previewCache.set(sha256, { at: Date.now(), parsed, fileName, byteSize, sha256 });
  }

  private async resolveWorkbook(opts: {
    workbookId?: string;
    file?: Express.Multer.File;
    user: RequestUser;
    req?: Request;
  }) {
    if (opts.file?.buffer?.length) {
      const saved = await this.saveWorkbook(opts.file, opts.user, opts.req);
      return this.prisma.pathwayQaWorkbook.findUniqueOrThrow({ where: { id: saved.id } });
    }
    if (opts.workbookId) {
      const row = await this.prisma.pathwayQaWorkbook.findUnique({ where: { id: opts.workbookId } });
      if (!row) throw new NotFoundException('Uploaded workbook not found');
      return row;
    }
    const latest = await this.prisma.pathwayQaWorkbook.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      throw new BadRequestException('Upload the 48-pathway Excel workbook first, then run tests.');
    }
    return latest;
  }

  private async loadPathway(pathwayId: string): Promise<PathwayQaPathwaySnapshot> {
    const pathway = await this.prisma.clinicalPathway.findFirst({
      where: { id: pathwayId, deletedAt: null },
      include: {
        questions: { select: { question: true, section: { select: { displayName: true, name: true } } } },
        rules: { select: { action: true, severity: true, message: true, condition: true } },
        treatments: {
          where: { archivedAt: null },
          select: {
            medicationName: true,
            genericName: true,
            brandName: true,
            dose: true,
            route: true,
            frequency: true,
            duration: true,
            recommendationLevel: true,
            eligibility: true,
            clinicalNotes: true,
            followUpAdvice: true,
            isActive: true,
            category: true,
          },
        },
        _count: { select: { counsellings: true, followups: true } },
      },
    });
    if (!pathway) throw new NotFoundException('Pathway not found');

    const redFlags = Array.isArray(pathway.redFlags)
      ? (pathway.redFlags as Array<{ title?: string; description?: string; severity?: string; action?: string }>)
      : [];
    const differentials = Array.isArray(pathway.differentials)
      ? (pathway.differentials as Array<{ condition?: string; recommendedAction?: string }>)
      : [];

    return {
      id: pathway.id,
      name: pathway.name,
      condition: pathway.condition,
      status: pathway.status,
      version: pathway.version,
      province: pathway.province,
      pharmacistPrescribingEligible: pathway.pharmacistPrescribingEligible,
      ageMin: pathway.ageMin,
      ageMax: pathway.ageMax,
      requiresFollowUp: pathway.requiresFollowUp,
      requiresLabResults: pathway.requiresLabResults,
      redFlags: redFlags
        .filter((flag) => flag?.title)
        .map((flag) => ({
          title: flag.title!,
          description: flag.description ?? null,
          severity: flag.severity ?? null,
          action: flag.action ?? null,
        })),
      differentials: differentials
        .filter((item) => item?.condition)
        .map((item) => ({
          condition: item.condition!,
          recommendedAction: item.recommendedAction ?? null,
        })),
      questions: pathway.questions.map((q) => ({
        question: q.question,
        section: q.section?.displayName || q.section?.name || null,
      })),
      rules: pathway.rules.map((rule) => ({
        action: rule.action,
        severity: rule.severity,
        message: rule.message,
        condition: rule.condition,
      })),
      treatments: pathway.treatments,
      counsellingCount: pathway._count.counsellings,
      followupCount: pathway._count.followups,
    };
  }

  private serializeWorkbook(row: {
    id: string;
    fileName: string;
    sha256: string;
    byteSize: number;
    sheetNames: string[];
    caseCount: number;
    conditionCount: number;
    permutationCount: number;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      fileName: row.fileName,
      sha256: row.sha256,
      byteSize: row.byteSize,
      sheetNames: row.sheetNames,
      caseCount: row.caseCount,
      conditionCount: row.conditionCount,
      permutationCount: row.permutationCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeRunListItem(row: {
    id: string;
    status: string;
    matchedCondition: string | null;
    matchScore: number | null;
    matchSuggestions: Prisma.JsonValue;
    summary: Prisma.JsonValue;
    errorMessage: string | null;
    durationMs: number | null;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    workbook: { id: string; fileName: string; caseCount: number; conditionCount?: number };
    pathway: { id: string; name: string; condition: string; status: string; version: number };
    createdBy: { firstName: string; lastName: string };
  }) {
    return {
      id: row.id,
      status: row.status,
      matchedCondition: row.matchedCondition,
      matchScore: row.matchScore,
      matchSuggestions: row.matchSuggestions,
      summary: row.summary,
      errorMessage: row.errorMessage,
      durationMs: row.durationMs,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      workbook: row.workbook,
      pathway: row.pathway,
      createdBy: `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim(),
    };
  }

  private serializeRunDetail(
    row: Parameters<PathwayQaService['serializeRunListItem']>[0] & {
      results: Prisma.JsonValue;
      createdBy: { firstName: string; lastName: string; email?: string };
      workbook: { permutationCount?: number };
    },
  ) {
    return {
      ...this.serializeRunListItem(row),
      results: row.results,
    };
  }

  private async auditRun(
    user: RequestUser,
    req: Request | undefined,
    runId: string,
    pathwayId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    const client = req ? getClientInfo(req) : { ipAddress: undefined, userAgent: undefined };
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action,
      module: 'pathway-qa',
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      newValue: { runId, pathwayId },
      metadata,
    });
  }
}

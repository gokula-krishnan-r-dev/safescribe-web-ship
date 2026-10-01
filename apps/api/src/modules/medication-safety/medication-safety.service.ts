import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SafetyClinicalSeverity,
  SafetyMatchType,
  SafetyRuleStatus,
  SafetyRuleType,
  SafetySelectorType,
} from '@prisma/client';
import { MedicationSafetyEvaluateRequest } from '@safescript/shared';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { Request } from 'express';
import { MedicationSafetyEvaluatorService } from './medication-safety-evaluator.service';
import {
  MedicationSafetyImportParser,
  type ParsedImportData,
} from './medication-safety-import.parser';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import { parseBrandList, parseRiskTags } from './utils/class-index.util';
import { normalizeDrugKey } from './utils/drug-name.util';
import {
  SAFETY_MATCH_TYPES,
  normalizeSafetyMatchType,
  type ImportBatchCommitResponse,
  type ImportBatchFileResult,
  type ImportBatchPreviewResponse,
  type ImportCommitCounts,
  type ImportValidationError,
} from './medication-safety.types';

interface CreateRuleInput {
  code: string;
  ruleType: string;
  jurisdiction?: string;
  summary: string;
  detail: string;
  clinicalSeverity: string;
  recommendedAction: string;
  overrideAllowed?: boolean;
  overrideReasonRequired?: boolean;
  matchType?: string | null;
  relationshipType?: string | null;
  changeSummary?: string;
  evidenceSource?: string | null;
  evidenceSection?: string | null;
  participants: Array<{
    participantKey: string;
    selectorType: string;
    conceptText: string;
    conceptCode?: string;
  }>;
  labDetail?: {
    drugIngredient: string;
    observationKey: string;
    observationDisplay?: string | null;
    loincCode?: string | null;
    comparator: string;
    thresholdLow?: number | null;
    thresholdHigh?: number | null;
    expectedUnit?: string | null;
    maxAgeDays?: number;
    missingLabAction?: string;
  };
  ddiDetail?: {
    drugA: string;
    drugB: string;
    interactionSeverity: string;
    actionRequired: string;
  };
  pregnancyDetail?: {
    drugName: string;
    pregnancyCategory: string;
    trimester?: string;
    clinicalNote?: string | null;
    actionRequired: string;
  };
  lactationDetail?: {
    drugName: string;
    lactationRisk: string;
    bandSeverity: string;
    clinicalNote?: string | null;
    actionRequired: string;
  };
  renalDetail?: {
    drugName: string;
    egfrMin: number;
    egfrMax: number;
    bandSeverity: string;
    clinicalNote?: string | null;
    actionRequired: string;
  };
}

function emptyImportCounts(): ImportCommitCounts {
  return {
    rulesCreated: 0,
    labRulesCreated: 0,
    ddiRulesCreated: 0,
    pregnancyRulesCreated: 0,
    lactationRulesCreated: 0,
    renalRulesCreated: 0,
    ingredientsCreated: 0,
    classesCreated: 0,
    taxonomyClassesCreated: 0,
    catalogDrugsCreated: 0,
  };
}

function addImportCounts(target: ImportCommitCounts, source: ImportCommitCounts) {
  target.rulesCreated += source.rulesCreated;
  target.labRulesCreated += source.labRulesCreated;
  target.ddiRulesCreated += source.ddiRulesCreated;
  target.pregnancyRulesCreated += source.pregnancyRulesCreated;
  target.lactationRulesCreated += source.lactationRulesCreated;
  target.renalRulesCreated += source.renalRulesCreated;
  target.ingredientsCreated += source.ingredientsCreated;
  target.classesCreated += source.classesCreated;
  target.taxonomyClassesCreated += source.taxonomyClassesCreated;
  target.catalogDrugsCreated += source.catalogDrugsCreated;
}

function pickImportCounts(source: ImportCommitCounts): ImportCommitCounts {
  return {
    rulesCreated: source.rulesCreated,
    labRulesCreated: source.labRulesCreated,
    ddiRulesCreated: source.ddiRulesCreated,
    pregnancyRulesCreated: source.pregnancyRulesCreated,
    lactationRulesCreated: source.lactationRulesCreated,
    renalRulesCreated: source.renalRulesCreated,
    ingredientsCreated: source.ingredientsCreated,
    classesCreated: source.classesCreated,
    taxonomyClassesCreated: source.taxonomyClassesCreated,
    catalogDrugsCreated: source.catalogDrugsCreated,
  };
}

@Injectable()
export class MedicationSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evaluator: MedicationSafetyEvaluatorService,
    private readonly importParser: MedicationSafetyImportParser,
    private readonly cache: MedicationSafetyCacheService,
  ) {}

  async listRules(query: {
    page?: number;
    limit?: number;
    search?: string;
    ruleType?: string;
    status?: string;
    jurisdiction?: string;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.SafetyKnowledgeRuleWhereInput = {
      operationalState: 'active',
      ...(query.ruleType ? { ruleType: query.ruleType as SafetyRuleType } : {}),
      ...(query.jurisdiction ? { jurisdiction: query.jurisdiction } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { versions: { some: { summary: { contains: query.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(query.status
        ? { versions: { some: { status: query.status as SafetyRuleStatus } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.safetyKnowledgeRule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              labDetail: true,
              ddiDetail: true,
              pregnancyDetail: true,
              lactationDetail: true,
              renalDetail: true,
            },
          },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.safetyKnowledgeRule.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        code: r.code,
        ruleType: r.ruleType,
        jurisdiction: r.jurisdiction,
        latestVersion: r.versions[0] ?? null,
        owner: r.owner,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getRule(id: string) {
    const rule = await this.prisma.safetyKnowledgeRule.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: {
            participants: true,
            evidence: true,
            labDetail: true,
            ddiDetail: true,
            pregnancyDetail: true,
            lactationDetail: true,
            renalDetail: true,
          },
        },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  async createRule(input: CreateRuleInput, user: RequestUser, req: Request) {
    const existing = await this.prisma.safetyKnowledgeRule.findUnique({
      where: { code: input.code },
    });
    if (existing) throw new BadRequestException(`Rule code ${input.code} already exists`);

    const matchType = this.resolveMatchType(input.matchType, input.code);

    const rule = await this.prisma.safetyKnowledgeRule.create({
      data: {
        code: input.code,
        ruleType: input.ruleType as SafetyRuleType,
        jurisdiction: input.jurisdiction ?? 'ALL',
        ownerId: user.id,
        versions: {
          create: {
            versionNumber: 1,
            status: 'DRAFT',
            changeSummary: input.changeSummary,
            summary: input.summary,
            detail: input.detail,
            clinicalSeverity: input.clinicalSeverity as SafetyClinicalSeverity,
            recommendedAction: input.recommendedAction,
            overrideAllowed: input.overrideAllowed ?? true,
            overrideReasonRequired: input.overrideReasonRequired ?? true,
            matchType,
            relationshipType: input.relationshipType ?? null,
            participants: input.participants.length
              ? {
                  create: input.participants.map((p) => ({
                    participantKey: p.participantKey,
                    selectorType: p.selectorType as SafetySelectorType,
                    conceptText: p.conceptText,
                    conceptCode: p.conceptCode,
                  })),
                }
              : undefined,
            labDetail: input.labDetail
              ? {
                  create: {
                    drugIngredient: input.labDetail.drugIngredient,
                    observationKey: input.labDetail.observationKey,
                    observationDisplay: input.labDetail.observationDisplay,
                    loincCode: input.labDetail.loincCode,
                    comparator: input.labDetail.comparator as never,
                    thresholdLow: input.labDetail.thresholdLow,
                    thresholdHigh: input.labDetail.thresholdHigh,
                    expectedUnit: input.labDetail.expectedUnit,
                    maxAgeDays: input.labDetail.maxAgeDays ?? 365,
                    missingLabAction: (input.labDetail.missingLabAction ?? 'REQUIRE_REVIEW') as never,
                  },
                }
              : undefined,
            ddiDetail: input.ddiDetail
              ? {
                  create: {
                    drugA: input.ddiDetail.drugA,
                    drugB: input.ddiDetail.drugB,
                    interactionSeverity: input.ddiDetail.interactionSeverity as never,
                    actionRequired: input.ddiDetail.actionRequired as never,
                  },
                }
              : undefined,
            pregnancyDetail: input.pregnancyDetail
              ? {
                  create: {
                    drugName: input.pregnancyDetail.drugName,
                    pregnancyCategory: input.pregnancyDetail.pregnancyCategory as never,
                    trimester: input.pregnancyDetail.trimester ?? 'all',
                    clinicalNote: input.pregnancyDetail.clinicalNote,
                    actionRequired: input.pregnancyDetail.actionRequired as never,
                  },
                }
              : undefined,
            lactationDetail: input.lactationDetail
              ? {
                  create: {
                    drugName: input.lactationDetail.drugName,
                    lactationRisk: input.lactationDetail.lactationRisk as never,
                    bandSeverity: input.lactationDetail.bandSeverity as never,
                    clinicalNote: input.lactationDetail.clinicalNote,
                    actionRequired: input.lactationDetail.actionRequired as never,
                  },
                }
              : undefined,
            renalDetail: input.renalDetail
              ? {
                  create: {
                    drugName: input.renalDetail.drugName,
                    egfrMin: input.renalDetail.egfrMin,
                    egfrMax: input.renalDetail.egfrMax,
                    bandSeverity: input.renalDetail.bandSeverity as never,
                    clinicalNote: input.renalDetail.clinicalNote,
                    actionRequired: input.renalDetail.actionRequired as never,
                  },
                }
              : undefined,
            evidence: input.evidenceSource
              ? {
                  create: {
                    source: input.evidenceSource,
                    section: input.evidenceSection,
                    accessDate: new Date(),
                  },
                }
              : undefined,
          },
        },
      },
      include: { versions: true },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'CREATE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { ruleId: rule.id, code: rule.code },
    });

    return rule;
  }

  async updateDraftVersion(
    ruleId: string,
    versionId: string,
    input: Partial<CreateRuleInput>,
    user: RequestUser,
    req: Request,
  ) {
    const version = await this.prisma.safetyRuleVersion.findFirst({
      where: { id: versionId, ruleId },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'DRAFT') {
      throw new BadRequestException('Only draft versions can be edited');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.participants) {
        await tx.safetyRuleParticipant.deleteMany({ where: { versionId } });
        await tx.safetyRuleParticipant.createMany({
          data: input.participants.map((p) => ({
            versionId,
            participantKey: p.participantKey,
            selectorType: p.selectorType as SafetySelectorType,
            conceptText: p.conceptText,
            conceptCode: p.conceptCode,
          })),
        });
      }

      await tx.safetyRuleVersion.update({
        where: { id: versionId },
        data: {
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.detail !== undefined ? { detail: input.detail } : {}),
          ...(input.clinicalSeverity !== undefined
            ? { clinicalSeverity: input.clinicalSeverity as SafetyClinicalSeverity }
            : {}),
          ...(input.recommendedAction !== undefined
            ? { recommendedAction: input.recommendedAction }
            : {}),
          ...(input.overrideAllowed !== undefined ? { overrideAllowed: input.overrideAllowed } : {}),
          ...(input.overrideReasonRequired !== undefined
            ? { overrideReasonRequired: input.overrideReasonRequired }
            : {}),
          ...(input.matchType !== undefined
            ? { matchType: this.resolveMatchType(input.matchType, ruleId) }
            : {}),
          ...(input.relationshipType !== undefined
            ? { relationshipType: input.relationshipType }
            : {}),
          ...(input.changeSummary !== undefined ? { changeSummary: input.changeSummary } : {}),
        },
      });

      // Keep type-specific medication/name fields in sync with spreadsheet edits.
      // Free-text clinical action lives on SafetyRuleVersion.recommendedAction.
      if (input.summary !== undefined) {
        const summary = input.summary.trim();

        const lab = await tx.safetyLabRuleDetail.findUnique({ where: { versionId } });
        if (lab && summary) {
          await tx.safetyLabRuleDetail.update({
            where: { versionId },
            data: { drugIngredient: summary },
          });
        }

        const ddi = await tx.safetyDdiRuleDetail.findUnique({ where: { versionId } });
        if (ddi && summary) {
          const parts = summary.split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean);
          await tx.safetyDdiRuleDetail.update({
            where: { versionId },
            data: {
              ...(parts[0] ? { drugA: parts[0] } : {}),
              ...(parts[1] ? { drugB: parts[1] } : {}),
            },
          });
        }

        const renal = await tx.safetyRenalRuleDetail.findUnique({ where: { versionId } });
        if (renal && summary) {
          await tx.safetyRenalRuleDetail.update({
            where: { versionId },
            data: { drugName: summary },
          });
        }

        const pregnancy = await tx.safetyPregnancyRuleDetail.findUnique({
          where: { versionId },
        });
        if (pregnancy && summary) {
          await tx.safetyPregnancyRuleDetail.update({
            where: { versionId },
            data: { drugName: summary },
          });
        }

        const lactation = await tx.safetyLactationRuleDetail.findUnique({
          where: { versionId },
        });
        if (lactation && summary) {
          await tx.safetyLactationRuleDetail.update({
            where: { versionId },
            data: { drugName: summary },
          });
        }

        const drugDisease = await tx.safetyDrugDiseaseRuleDetail.findUnique({
          where: { versionId },
        });
        if (drugDisease && summary) {
          await tx.safetyDrugDiseaseRuleDetail.update({
            where: { versionId },
            data: { drugDisplayName: summary },
          });
        }
      }

      if (input.jurisdiction) {
        await tx.safetyKnowledgeRule.update({
          where: { id: ruleId },
          data: { jurisdiction: input.jurisdiction },
        });
      }
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'UPDATE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { ruleId, versionId },
    });

    return this.getRule(ruleId);
  }

  async approveVersion(ruleId: string, versionId: string, user: RequestUser, req: Request) {
    const version = await this.prisma.safetyRuleVersion.findFirst({
      where: { id: versionId, ruleId },
      include: { rule: true },
    });
    if (!version) throw new NotFoundException('Version not found');
    if (version.status !== 'DRAFT') {
      throw new BadRequestException('Only draft versions can be approved');
    }
    if (version.rule.ownerId === user.id) {
      // MVP: warn but allow for single super-admin setups
    }

    await this.prisma.safetyRuleVersion.update({
      where: { id: versionId },
      data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'APPROVE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { ruleId, versionId },
    });

    return { success: true };
  }

  async deleteRule(ruleId: string, user: RequestUser, req: Request) {
    const rule = await this.prisma.safetyKnowledgeRule.findUnique({
      where: { id: ruleId },
      include: { versions: { where: { status: 'PUBLISHED' } } },
    });
    if (!rule) throw new NotFoundException('Rule not found');
    if (rule.versions.length) {
      throw new BadRequestException('Cannot delete rules with published versions. Retire instead.');
    }

    await this.prisma.safetyKnowledgeRule.delete({ where: { id: ruleId } });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'DELETE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: { ruleId, code: rule.code },
    });

    return { success: true };
  }

  async bulkUpdate(
    ids: string[],
    data: { jurisdiction?: string; status?: string; clinicalSeverity?: string },
    user: RequestUser,
    req: Request,
  ) {
    if (!ids.length) throw new BadRequestException('No rule IDs provided');

    if (data.jurisdiction) {
      await this.prisma.safetyKnowledgeRule.updateMany({
        where: { id: { in: ids } },
        data: { jurisdiction: data.jurisdiction },
      });
    }

    let approved = 0;
    if (data.status === 'APPROVED') {
      const result = await this.prisma.safetyRuleVersion.updateMany({
        where: { ruleId: { in: ids }, status: 'DRAFT' },
        data: { status: 'APPROVED', approvedById: user.id, approvedAt: new Date() },
      });
      approved = result.count;
    }

    if (data.clinicalSeverity) {
      await this.prisma.safetyRuleVersion.updateMany({
        where: { ruleId: { in: ids }, status: 'DRAFT' },
        data: { clinicalSeverity: data.clinicalSeverity as SafetyClinicalSeverity },
      });
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'BULK_UPDATE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { ids, data, approved },
    });

    return { updated: ids.length, approved };
  }

  /**
   * Approve every DRAFT rule version in the repository (optionally filtered).
   * Does not publish — pharmacist still runs Publish Release separately.
   */
  async approveAllDrafts(
    filters: { ruleType?: string; search?: string },
    user: RequestUser,
    req: Request,
  ) {
    const draftWhere: Prisma.SafetyRuleVersionWhereInput = {
      status: 'DRAFT',
      rule: {
        operationalState: 'active',
        ...(filters.ruleType ? { ruleType: filters.ruleType as SafetyRuleType } : {}),
        ...(filters.search
          ? {
              OR: [
                { code: { contains: filters.search, mode: 'insensitive' } },
                {
                  versions: {
                    some: { summary: { contains: filters.search, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      },
    };

    const draftCount = await this.prisma.safetyRuleVersion.count({ where: draftWhere });
    if (!draftCount) {
      return { approved: 0, message: 'No draft rules to approve' };
    }

    const result = await this.prisma.safetyRuleVersion.updateMany({
      where: draftWhere,
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'APPROVE_ALL',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { approved: result.count, filters },
    });

    return {
      approved: result.count,
      message: `Approved ${result.count} draft rule${result.count === 1 ? '' : 's'}`,
    };
  }

  async bulkDelete(ids: string[], user: RequestUser, req: Request) {
    const published = await this.prisma.safetyRuleVersion.count({
      where: { ruleId: { in: ids }, status: 'PUBLISHED' },
    });
    if (published) {
      throw new BadRequestException('Cannot bulk-delete rules with published versions');
    }

    await this.prisma.safetyKnowledgeRule.deleteMany({
      where: { id: { in: ids } },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'BULK_DELETE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: { ids },
    });

    return { deleted: ids.length };
  }

  async importPreview(buffer: Buffer, fileName: string) {
    return this.importParser.validate(buffer, fileName);
  }

  async importPreviewBatch(files: Express.Multer.File[]): Promise<ImportBatchPreviewResponse> {
    this.assertBatchFiles(files);

    const fileResults = files.map((file) => {
      const validation = this.importParser.validate(file.buffer, file.originalname);
      const errors: ImportValidationError[] = validation.errors.map((e) => ({
        ...e,
        fileName: file.originalname,
      }));
      const validRowCount = validation.preview.filter((r) => r.status === 'valid').length;
      return {
        fileName: file.originalname,
        valid: validation.valid,
        errorCount: errors.length,
        validRowCount,
        errors,
      };
    });

    const errors = fileResults.flatMap((f) => f.errors);
    const validFileCount = fileResults.filter((f) => f.valid).length;

    return {
      valid: validFileCount === fileResults.length && fileResults.length > 0,
      fileCount: fileResults.length,
      validFileCount,
      files: fileResults,
      errors,
    };
  }

  async importCommit(buffer: Buffer, fileName: string, user: RequestUser, req: Request) {
    const validation = this.importParser.validate(buffer, fileName);
    if (!validation.valid || !validation.data) {
      throw new BadRequestException({
        message: 'Import validation failed',
        errors: validation.errors,
      });
    }

    const counts = await this.commitValidatedData(validation.data, user, req, {
      refreshCache: true,
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'IMPORT',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { ...counts, fileName },
    });

    return counts;
  }

  async importCommitBatch(
    files: Express.Multer.File[],
    user: RequestUser,
    req: Request,
  ): Promise<ImportBatchCommitResponse> {
    this.assertBatchFiles(files);

    const fileResults: ImportBatchFileResult[] = [];
    const totals = emptyImportCounts();
    let needsCacheRefresh = false;

    // Sequential commit keeps duplicate-code skips deterministic across files
    for (const file of files) {
      const validation = this.importParser.validate(file.buffer, file.originalname);
      const errors: ImportValidationError[] = validation.errors.map((e) => ({
        ...e,
        fileName: file.originalname,
      }));

      if (!validation.valid || !validation.data) {
        fileResults.push({
          fileName: file.originalname,
          status: 'failed',
          valid: false,
          errorCount: errors.length || 1,
          errors:
            errors.length > 0
              ? errors
              : [
                  {
                    sheet: 'Workbook',
                    fileName: file.originalname,
                    message: 'Validation failed with no detail',
                  },
                ],
          ...emptyImportCounts(),
          message: 'Skipped — validation failed',
        });
        continue;
      }

      try {
        const counts = await this.commitValidatedData(validation.data, user, req, {
          refreshCache: false,
        });
        if (
          counts.taxonomyClassesCreated ||
          counts.catalogDrugsCreated ||
          counts.classesCreated
        ) {
          needsCacheRefresh = true;
        }
        addImportCounts(totals, counts);
        fileResults.push({
          fileName: file.originalname,
          status: 'imported',
          valid: true,
          errorCount: 0,
          errors: [],
          ...counts,
          message: 'Imported successfully',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const detailErrors =
          err instanceof BadRequestException &&
          typeof err.getResponse() === 'object' &&
          err.getResponse() !== null &&
          Array.isArray((err.getResponse() as { errors?: unknown }).errors)
            ? ((err.getResponse() as { errors: ImportValidationError[] }).errors).map(
                (e) => ({ ...e, fileName: file.originalname }),
              )
            : [
                {
                  sheet: 'Workbook',
                  fileName: file.originalname,
                  message,
                },
              ];
        fileResults.push({
          fileName: file.originalname,
          status: 'failed',
          valid: true,
          errorCount: detailErrors.length,
          errors: detailErrors,
          ...emptyImportCounts(),
          message: 'Import failed after validation',
        });
      }
    }

    if (needsCacheRefresh) {
      await this.cache.refreshClassIndexCache();
    }

    const importedCount = fileResults.filter((f) => f.status === 'imported').length;
    const failedCount = fileResults.filter((f) => f.status === 'failed').length;

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'IMPORT_BATCH',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: {
        fileCount: files.length,
        importedCount,
        failedCount,
        totals,
        files: fileResults.map((f) => ({
          fileName: f.fileName,
          status: f.status,
          ...pickImportCounts(f),
        })),
      },
    });

    return {
      fileCount: files.length,
      importedCount,
      failedCount,
      skippedCount: failedCount,
      totals,
      files: fileResults,
    };
  }

  private assertBatchFiles(files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('Upload at least one file');
    }
    if (files.length > 6) {
      throw new BadRequestException('Maximum 6 files per multi-import');
    }

    const seen = new Set<string>();
    for (const file of files) {
      const name = file.originalname?.trim() || 'unnamed';
      const ext = `.${name.split('.').pop()?.toLowerCase() ?? ''}`;
      if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
        throw new BadRequestException(
          `Unsupported file type for "${name}". Use .csv, .xlsx, or .xls`,
        );
      }
      const key = name.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate file name in batch: ${name}`);
      }
      seen.add(key);
    }
  }

  /**
   * Persist one already-validated workbook. Caller owns audit + optional cache refresh.
   */
  private async commitValidatedData(
    data: ParsedImportData,
    user: RequestUser,
    req: Request,
    opts: { refreshCache: boolean },
  ): Promise<ImportCommitCounts> {
    const counts = emptyImportCounts();

    const createImportedRule = async (
      mapped: CreateRuleInput,
      sheet: string,
      rowHint: string,
    ) => {
      const existing = await this.prisma.safetyKnowledgeRule.findUnique({
        where: { code: mapped.code },
      });
      if (existing) return false;
      try {
        await this.createRule(mapped, user, req);
        return true;
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException({
          message: `Failed to import rule ${mapped.code} from ${sheet} (${rowHint})`,
          detail: message,
        });
      }
    };

    for (const [index, row] of data.rules.entries()) {
      const mapped = this.importParser.mapRuleRowToCreate(row);
      if (await createImportedRule(mapped, 'safety_rules', `row ${index + 2}`)) {
        counts.rulesCreated++;
      }
    }

    for (const [index, row] of data.labRules.entries()) {
      const mapped = this.importParser.mapLabRuleRowToCreate(row);
      if (await createImportedRule(mapped, 'lab_rules', `row ${index + 2}`)) {
        counts.labRulesCreated++;
      }
    }

    for (const [index, row] of data.ddiRules.entries()) {
      const mapped = this.importParser.mapDdiRowToCreate(row);
      if (await createImportedRule(mapped, 'drug_interactions', `row ${index + 2}`)) {
        counts.ddiRulesCreated++;
      }
    }

    for (const [index, row] of data.pregnancyRules.entries()) {
      const mapped = this.importParser.mapPregnancyRowToCreate(row);
      if (await createImportedRule(mapped, 'pregnancy_rules', `row ${index + 2}`)) {
        counts.pregnancyRulesCreated++;
      }
    }

    for (const [index, row] of data.lactationRules.entries()) {
      const mapped = this.importParser.mapLactationRowToCreate(row);
      if (await createImportedRule(mapped, 'lactation_rules', `row ${index + 2}`)) {
        counts.lactationRulesCreated++;
      }
    }

    for (const [index, row] of data.renalRules.entries()) {
      const mapped = this.importParser.mapRenalRowToCreate(row);
      if (await createImportedRule(mapped, 'renal_rules', `row ${index + 2}`)) {
        counts.renalRulesCreated++;
      }
    }

    for (const row of data.ingredients) {
      const ingredients = row.ingredients
        .split('|')
        .map((i) => normalizeDrugKey(i))
        .filter(Boolean);
      await this.prisma.medicationIngredient.upsert({
        where: { productName: row.product_name.trim() },
        create: {
          productName: row.product_name.trim(),
          genericName: row.generic_name?.trim() || null,
          ingredients,
        },
        update: {
          genericName: row.generic_name?.trim() || null,
          ingredients,
        },
      });
      counts.ingredientsCreated++;
    }

    for (const row of data.classTaxonomy) {
      const className = normalizeDrugKey(row.class_name);
      if (!className) continue;
      await this.prisma.drugClassTaxonomy.upsert({
        where: { className },
        create: {
          className,
          parentClass: row.parent_class?.trim() ? normalizeDrugKey(row.parent_class) : null,
          therapeuticGroup: row.therapeutic_group?.trim() || null,
          riskTags: parseRiskTags(row.risk_tag),
          externalId: row.class_id?.trim() || null,
        },
        update: {
          parentClass: row.parent_class?.trim() ? normalizeDrugKey(row.parent_class) : null,
          therapeuticGroup: row.therapeutic_group?.trim() || null,
          riskTags: parseRiskTags(row.risk_tag),
          externalId: row.class_id?.trim() || null,
        },
      });
      counts.taxonomyClassesCreated++;
    }

    for (const row of data.drugs) {
      const drugName = normalizeDrugKey(row.drug_name);
      const className = normalizeDrugKey(row.class_name);
      if (!drugName || !className) continue;
      await this.prisma.drugCatalog.upsert({
        where: { drugName },
        create: {
          drugName,
          className,
          ingredient: row.ingredient?.trim() ? normalizeDrugKey(row.ingredient) : drugName,
          commonBrands: parseBrandList(row.common_brand),
          notes: row.notes?.trim() || null,
        },
        update: {
          className,
          ingredient: row.ingredient?.trim() ? normalizeDrugKey(row.ingredient) : drugName,
          commonBrands: parseBrandList(row.common_brand),
          notes: row.notes?.trim() || null,
        },
      });
      await this.prisma.drugClassMembership.upsert({
        where: { drugName_className: { drugName, className } },
        create: { drugName, className },
        update: {},
      });
      counts.catalogDrugsCreated++;
    }

    for (const row of data.classes) {
      if (!row.drug_name?.trim() || !row.class_name?.trim()) continue;
      await this.prisma.drugClassMembership.upsert({
        where: {
          drugName_className: {
            drugName: normalizeDrugKey(row.drug_name),
            className: normalizeDrugKey(row.class_name),
          },
        },
        create: {
          drugName: normalizeDrugKey(row.drug_name),
          className: normalizeDrugKey(row.class_name),
        },
        update: {},
      });
      counts.classesCreated++;
    }

    if (
      opts.refreshCache &&
      (counts.taxonomyClassesCreated || counts.catalogDrugsCreated || counts.classesCreated)
    ) {
      await this.cache.refreshClassIndexCache();
    }

    return counts;
  }

  async listDrugClasses(query: { page?: number; limit?: number; search?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { className: { contains: search, mode: 'insensitive' as const } },
            { parentClass: { contains: search, mode: 'insensitive' as const } },
            { therapeuticGroup: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.drugClassTaxonomy.findMany({
        where,
        orderBy: { className: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.drugClassTaxonomy.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listDrugCatalog(query: { page?: number; limit?: number; search?: string; className?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const search = query.search?.trim();
    const className = query.className?.trim();

    const where: Prisma.DrugCatalogWhereInput = {};
    if (className) where.className = normalizeDrugKey(className);
    if (search) {
      where.OR = [
        { drugName: { contains: search, mode: 'insensitive' } },
        { ingredient: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.drugCatalog.findMany({
        where,
        orderBy: { drugName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.drugCatalog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  getImportTemplate(): Buffer {
    return this.importParser.buildTemplateWorkbook();
  }

  async evaluate(
    request: MedicationSafetyEvaluateRequest,
    user?: RequestUser,
    tenantId?: string | null,
  ) {
    const result = await this.evaluator.evaluate(request);

    const activeTerm = await this.prisma.terminologyRelease.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activatedAt: 'desc' },
    });

    const evaluation = await this.prisma.safetyEvaluation.create({
      data: {
        consultationId: request.consultationId ?? null,
        tenantId: tenantId ?? user?.tenantId ?? null,
        status: result.status as never,
        knowledgeRelease: result.knowledgeRelease,
        engineVersion: result.engineVersion,
        terminologyReleaseId: activeTerm?.id ?? null,
        terminologyVersion: activeTerm?.releaseKey ?? null,
        requestPayload: request as unknown as Prisma.InputJsonValue,
        findings: {
          create: [
            ...result.findings.map((f) => ({
              findingType: f.findingType,
              matchType: f.matchType,
              summary: f.summary,
              detail: f.detail,
              clinicalSeverity: f.clinicalSeverity as SafetyClinicalSeverity,
              recommendedAction: f.recommendedAction,
              ruleVersionId: f.ruleVersionId,
              ruleCode: f.ruleCode,
              displayed: true,
            })),
            ...result.suppressedFindings.map((f) => ({
              findingType: f.findingType,
              matchType: f.matchType,
              summary: f.summary,
              detail: f.detail,
              clinicalSeverity: f.clinicalSeverity as SafetyClinicalSeverity,
              recommendedAction: f.recommendedAction,
              ruleVersionId: f.ruleVersionId,
              ruleCode: f.ruleCode,
              displayed: false,
              suppressedReason: 'deduplicated',
            })),
          ],
        },
      },
    });

    return {
      evaluationId: evaluation.id,
      ...result,
      terminologyReleaseId: activeTerm?.id ?? null,
      terminologyVersion: activeTerm?.releaseKey ?? null,
    };
  }

  async recordOverride(
    evaluationId: string,
    reasonCode: string,
    reasonComment: string | undefined,
    user: RequestUser,
    req: Request,
  ) {
    const evaluation = await this.prisma.safetyEvaluation.findUnique({
      where: { id: evaluationId },
    });
    if (!evaluation) throw new NotFoundException('Evaluation not found');

    await this.prisma.safetyEvaluationOverride.upsert({
      where: { evaluationId },
      create: {
        evaluationId,
        reasonCode,
        reasonComment,
        userId: user.id,
      },
      update: { reasonCode, reasonComment },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'OVERRIDE',
      module: 'medication-safety',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { evaluationId, reasonCode },
    });

    return { success: true };
  }

  /** Normalize / validate matchType before Prisma write — never let invalid enums become 500s. */
  private resolveMatchType(
    raw: string | null | undefined,
    context: string,
  ): SafetyMatchType | null {
    if (raw == null || String(raw).trim() === '') return null;
    const normalized = normalizeSafetyMatchType(raw);
    if (!normalized) {
      throw new BadRequestException(
        `Invalid matchType "${raw}" for ${context}. Expected one of: ${SAFETY_MATCH_TYPES.join(', ')}`,
      );
    }
    return normalized as SafetyMatchType;
  }
}

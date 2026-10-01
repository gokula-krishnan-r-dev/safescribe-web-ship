import {
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { Request } from 'express';
import {
  WORKBOOK_REGISTRY,
  type ClinicalFileTypeKey,
  type ImportIssue,
  summarizeImportIssues,
} from './contracts/workbook-registry';
import {
  parseClinicalWorkbook,
  escapeCsvFormula,
  WorkbookParserError,
} from './import/parse-xlsx';
import { validateWorkbookRow } from './import/validate-row';
import { ClinicalRepositoryPromoteService } from './import/promote-drafts';
import { TerminologySnapshotService } from '@/modules/terminology/snapshot/terminology-snapshot.service';
import {
  isClientSafePromoteError,
  isUniqueConstraintError,
  PromoteBatchException,
} from './import/promote-errors';

@Injectable()
export class ClinicalRepositoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly promoteService: ClinicalRepositoryPromoteService,
    private readonly terminology: TerminologySnapshotService,
  ) {}

  listWorkbooks() {
    return Object.values(WORKBOOK_REGISTRY).map((w) => ({
      typeKey: w.typeKey,
      schemaVersion: w.schemaVersion,
      domain: w.domain,
      headerCount: w.exactHeaders.length,
      businessKeyColumns: w.businessKeyColumns,
      safetyRuleType: w.safetyRuleType ?? null,
    }));
  }

  async listImportBatches(query: { page?: number; limit?: number; status?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.ClinicalImportBatchWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.clinicalImportBatch.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { rows: true } },
        },
      }),
      this.prisma.clinicalImportBatch.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getImportBatch(batchId: string) {
    const batch = await this.prisma.clinicalImportBatch.findUnique({
      where: { id: batchId },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        rows: {
          orderBy: { sourceRowNumber: 'asc' },
          take: 500,
        },
      },
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    return batch;
  }

  /**
   * Upload → parse → fingerprint → validate → stage immutable rows.
   * Does NOT publish. Import creates draft content only after promote.
   */
  async uploadAndValidate(
    file: Express.Multer.File,
    user: RequestUser,
    req: Request,
    opts?: { jurisdiction?: string; targetReleaseId?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File required');
    }

    let parsed;
    try {
      parsed = parseClinicalWorkbook(file.buffer, file.originalname);
    } catch (err) {
      if (err instanceof WorkbookParserError) {
        throw new BadRequestException({
          code: err.code,
          message: err.message,
          issues: err.issues,
        });
      }
      throw err;
    }

    // Idempotency: same sha256 + same release
    const existing = await this.prisma.clinicalImportBatch.findFirst({
      where: {
        sha256: parsed.sha256,
        targetReleaseId: opts?.targetReleaseId ?? null,
      },
      include: { rows: { take: 5 } },
    });
    if (existing && existing.status === 'IMPORTED') {
      return {
        batchId: existing.id,
        fileType: existing.fileTypeKey,
        schemaVersion: existing.schemaVersion,
        status: existing.status,
        counts: {
          total: existing.totalRows,
          valid: existing.validRows,
          warnings: existing.warningRows,
          errors: existing.errorRows,
        },
        issues: [],
        issueSummary: [],
        message: 'Identical file already imported for this release (idempotent).',
        idempotent: true,
      };
    }

    const activeTerminology = await this.terminology.getActiveRelease();

    const batch = await this.prisma.clinicalImportBatch.create({
      data: {
        fileTypeKey: parsed.fileTypeKey,
        originalFilename: file.originalname,
        sha256: parsed.sha256,
        workbookSheetName: parsed.sheetName,
        headerFingerprint: parsed.headerFingerprint,
        schemaVersion: parsed.schemaVersion,
        status: 'VALIDATING',
        jurisdiction: opts?.jurisdiction ?? 'CA',
        targetReleaseId: opts?.targetReleaseId ?? null,
        terminologyReleaseId: activeTerminology?.id ?? null,
        uploadedById: user.id,
        totalRows: parsed.rows.length,
      },
    });

    const allIssues: ImportIssue[] = [...parsed.issues];
    let validRows = 0;
    let warningRows = 0;
    let errorRows = 0;

    const rowCreates: Prisma.ClinicalImportRowCreateManyInput[] = [];

    for (const row of parsed.rows) {
      const fieldIssues = validateWorkbookRow(
        parsed.fileTypeKey,
        row.sourceRowNumber,
        row.raw,
      );
      // Terminology soft-resolution for medication selectors
      const termIssues = await this.resolveRowSelectors(
        parsed.fileTypeKey,
        row.sourceRowNumber,
        row.raw,
        activeTerminology?.id,
      );
      const issues = [...fieldIssues, ...termIssues];
      const hasError = issues.some((i) => i.severity === 'ERROR') ||
        parsed.issues.some((i) => i.row === row.sourceRowNumber && i.severity === 'ERROR');
      const hasWarning = issues.some((i) => i.severity === 'WARNING');

      let rowStatus: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      if (hasError) {
        rowStatus = 'ERROR';
        errorRows += 1;
      } else if (hasWarning) {
        rowStatus = 'WARNING';
        warningRows += 1;
        validRows += 1; // warnings still importable as draft
      } else {
        validRows += 1;
      }

      allIssues.push(...issues);
      rowCreates.push({
        importBatchId: batch.id,
        sourceRowNumber: row.sourceRowNumber,
        businessKey: row.businessKey || null,
        rawPayload: row.raw as Prisma.InputJsonValue,
        normalizedPayload: row.raw as Prisma.InputJsonValue,
        rowStatus,
        errors: issues.filter((i) => i.severity === 'ERROR') as unknown as Prisma.InputJsonValue,
        warnings: issues.filter((i) => i.severity === 'WARNING') as unknown as Prisma.InputJsonValue,
      });
    }

    // Include structural issues for blank/duplicate rows already in parsed.issues
    for (const issue of parsed.issues) {
      if (issue.severity === 'ERROR') {
        // already counted if linked to a data row; structural blank rows may not be in rowCreates
        const hasRow = rowCreates.some((r) => r.sourceRowNumber === issue.row);
        if (!hasRow) errorRows += 1;
      }
    }

    if (rowCreates.length) {
      await this.prisma.clinicalImportRow.createMany({ data: rowCreates });
    }

    const status =
      errorRows > 0
        ? 'REQUIRES_CORRECTION'
        : validRows > 0
          ? 'READY_TO_IMPORT'
          : 'FAILED';

    await this.prisma.clinicalImportBatch.update({
      where: { id: batch.id },
      data: {
        status,
        validRows,
        warningRows,
        errorRows,
        totalRows: parsed.rows.length,
        failureSummary:
          errorRows > 0
            ? `${errorRows} row(s) failed validation. Correct the workbook and upload a new batch.`
            : null,
      },
    });

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'CLINICAL_REPOSITORY_UPLOAD',
      module: 'clinical-repository',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: {
        batchId: batch.id,
        fileType: parsed.fileTypeKey,
        status,
        counts: { total: parsed.rows.length, valid: validRows, warnings: warningRows, errors: errorRows },
      },
    });

    return {
      batchId: batch.id,
      fileType: parsed.fileTypeKey,
      schemaVersion: parsed.schemaVersion,
      status,
      counts: {
        total: parsed.rows.length,
        valid: validRows,
        warnings: warningRows,
        errors: errorRows,
      },
      issues: allIssues.slice(0, 200),
      issueSummary: summarizeImportIssues(allIssues),
      notice:
        'Import creates draft content only. Clinical review and publication are separate steps.',
      idempotent: false,
    };
  }

  private async resolveRowSelectors(
    fileTypeKey: ClinicalFileTypeKey,
    sourceRow: number,
    row: Record<string, unknown>,
    terminologyReleaseId?: string | null,
  ): Promise<ImportIssue[]> {
    const issues: ImportIssue[] = [];
    const pairs: Array<{ typeCol: string; codeCol: string; displayCol?: string }> = [];

    switch (fileTypeKey) {
      case 'allergy_cross_reactivity_rules':
        pairs.push(
          { typeCol: 'source_selector_type', codeCol: 'source_selector_code' },
          { typeCol: 'target_selector_type', codeCol: 'target_selector_code' },
        );
        break;
      case 'drug_interactions':
        pairs.push(
          {
            typeCol: 'drug_a_selector_type',
            codeCol: 'drug_a_selector_code',
            displayCol: 'drug_a_display_name_snapshot',
          },
          {
            typeCol: 'drug_b_selector_type',
            codeCol: 'drug_b_selector_code',
            displayCol: 'drug_b_display_name_snapshot',
          },
        );
        break;
      case 'drug_disease_rules':
      case 'renal_rules':
      case 'lab_threshold_rules':
      case 'pregnancy_rules':
        pairs.push({
          typeCol: 'drug_selector_type',
          codeCol: 'drug_selector_code',
          displayCol: 'drug_display_name_snapshot',
        });
        break;
      case 'lactation_rules':
        pairs.push({
          typeCol: 'medication_selector_type',
          codeCol: 'medication_selector_code',
          displayCol: 'medication_selector_display',
        });
        break;
      default:
        return issues;
    }

    for (const p of pairs) {
      const code = String(row[p.codeCol] ?? '').trim();
      const type = String(row[p.typeCol] ?? '').trim();
      if (!code) continue;
      if (type.toUpperCase() === 'VALUE_SET') {
        const versionCol = p.codeCol.replace('_code', '_version');
        const version = String(row[versionCol] ?? row.drug_a_selector_version ?? row.drug_b_selector_version ?? '').trim();
        const vs = await this.prisma.clinicalValueSet.findFirst({
          where: {
            valueSetCode: code,
            ...(version ? { valueSetVersion: version } : {}),
          },
        });
        if (!vs) {
          issues.push({
            severity: 'WARNING',
            code: 'MISSING_VALUE_SET',
            row: sourceRow,
            column: p.codeCol,
            value: code,
            message: `Referenced value set "${code}" is not present yet. Import clinical_value_sets first or resolve before publication.`,
            suggestedFix: 'Upload the clinical value sets workbook for this release.',
          });
        }
        continue;
      }

      try {
        const resolved = await this.terminology.resolveSelector({
          selectorType: type || 'INGREDIENT_SELECTOR',
          selectorCode: code,
          displayName: p.displayCol ? String(row[p.displayCol] ?? '') : null,
          terminologyReleaseId: terminologyReleaseId ?? undefined,
        });
        if (resolved.resolutionStatus === 'UNRESOLVED') {
          issues.push({
            severity: 'WARNING',
            code: 'UNRESOLVED_SELECTOR',
            row: sourceRow,
            column: p.codeCol,
            value: code,
            message:
              'The selector could not be resolved in the pinned terminology release.',
            suggestedFix:
              'Resolve the selector in Admin Terminology or correct the workbook code, then upload a new file.',
          });
        }
      } catch {
        issues.push({
          severity: 'WARNING',
          code: 'TERMINOLOGY_LOOKUP_FAILED',
          row: sourceRow,
          column: p.codeCol,
          value: code,
          message: 'Terminology lookup failed; draft import may proceed with warning.',
        });
      }
    }

    return issues;
  }

  async promote(
    batchId: string,
    user: RequestUser,
    req: Request,
  ) {
    const batch = await this.prisma.clinicalImportBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Import batch not found');
    if (batch.status === 'IMPORTED') {
      return { batchId, status: 'IMPORTED', message: 'Already imported (idempotent).' };
    }
    if (batch.errorRows > 0 || batch.status === 'REQUIRES_CORRECTION') {
      throw new BadRequestException(
        'Cannot import: batch still has validation errors. Partial imports are not allowed.',
      );
    }
    if (batch.status !== 'READY_TO_IMPORT') {
      throw new BadRequestException(
        `Cannot promote a batch in ${batch.status} status. Upload and validate the workbook first.`,
      );
    }
    if (!batch.fileTypeKey) {
      throw new BadRequestException('Batch has no file type key');
    }

    let result: Awaited<ReturnType<ClinicalRepositoryPromoteService['promoteBatch']>>;
    try {
      result = await this.promoteService.promoteBatch(
        batchId,
        batch.fileTypeKey as ClinicalFileTypeKey,
        user.id,
      );
    } catch (err) {
      this.throwPromoteHttpException(err);
    }

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId,
      action: 'CLINICAL_REPOSITORY_PROMOTE',
      module: 'clinical-repository',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      newValue: { batchId, ...result },
    });

    return {
      batchId,
      status: 'IMPORTED',
      ...result,
      notice: 'Draft content created. Clinical review and publication are separate steps.',
    };
  }

  private throwPromoteHttpException(err: unknown): never {
    if (err instanceof PromoteBatchException) {
      if (err.timedOut) {
        throw new GatewayTimeoutException(err.message);
      }
      if (isClientSafePromoteError(err) || isClientSafePromoteError(err.cause)) {
        throw new BadRequestException(err.message);
      }
      if (isUniqueConstraintError(err.cause)) {
        throw new ConflictException(err.message);
      }
      throw new InternalServerErrorException(err.message);
    }
    if (isClientSafePromoteError(err) && err instanceof Error) {
      throw new BadRequestException(err.message);
    }
    throw new InternalServerErrorException(
      err instanceof Error
        ? 'Promotion failed. Please retry. If it keeps failing, check the import workbook and try again.'
        : 'Promotion failed.',
    );
  }

  async exportIssuesCsv(batchId: string): Promise<string> {
    const batch = await this.getImportBatch(batchId);
    const lines = ['severity,code,row,column,value,message,suggestedFix'];
    for (const row of batch.rows) {
      const errors = (row.errors as ImportIssue[]) ?? [];
      const warnings = (row.warnings as ImportIssue[]) ?? [];
      for (const issue of [...errors, ...warnings]) {
        const cells = [
          issue.severity,
          issue.code,
          String(issue.row),
          issue.column ?? '',
          escapeCsvFormula(issue.value),
          escapeCsvFormula(issue.message),
          escapeCsvFormula(issue.suggestedFix ?? ''),
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
        lines.push(cells.join(','));
      }
    }
    return lines.join('\n');
  }

  async listValueSets(query: { page?: number; limit?: number; search?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.ClinicalValueSetWhereInput = {
      ...(query.search
        ? {
            OR: [
              { valueSetCode: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.clinicalValueSet.findMany({
        where,
        orderBy: { valueSetCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.clinicalValueSet.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getValueSet(id: string) {
    const vs = await this.prisma.clinicalValueSet.findUnique({
      where: { id },
      include: { members: { orderBy: { memberSequence: 'asc' } } },
    });
    if (!vs) throw new NotFoundException('Value set not found');
    return vs;
  }

  async listEvidence(query: { page?: number; limit?: number; search?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const where: Prisma.SafetyRuleEvidenceWhereInput = {
      evidenceLinkId: { not: null },
      ...(query.search
        ? {
            OR: [
              { evidenceLinkId: { contains: query.search, mode: 'insensitive' } },
              { ruleCode: { contains: query.search, mode: 'insensitive' } },
              { source: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.safetyRuleEvidence.findMany({
        where,
        orderBy: { evidenceLinkId: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.safetyRuleEvidence.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listTestCases(query: { page?: number; limit?: number; domain?: string }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const where: Prisma.ClinicalTestCaseWhereInput = {
      ...(query.domain ? { safetyDomain: query.domain } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.clinicalTestCase.findMany({
        where,
        orderBy: { testCaseId: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.clinicalTestCase.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listTestInputs(query: { bundleKey?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 100, 500);
    const where: Prisma.ClinicalTestInputWhereInput = {
      ...(query.bundleKey ? { inputBundleKey: query.bundleKey } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.clinicalTestInput.findMany({
        where,
        orderBy: [{ inputBundleKey: 'asc' }, { inputSequence: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.clinicalTestInput.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Membership evaluation: included AND NOT excluded.
   */
  async isMemberOfValueSet(
    valueSetCode: string,
    valueSetVersion: string | null | undefined,
    conceptTokens: string[],
  ): Promise<boolean> {
    const vs = await this.prisma.clinicalValueSet.findFirst({
      where: {
        valueSetCode,
        ...(valueSetVersion ? { valueSetVersion } : {}),
        recordStatus: { in: ['DRAFT', 'APPROVED', 'PUBLISHED'] },
      },
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!vs) return false;

    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const tokenSet = new Set(conceptTokens.map(norm).filter(Boolean));

    const matchesMember = (m: {
      memberLocalCode: string | null;
      memberDisplayName: string;
      terminologyConceptCode: string | null;
      terminologyDisplayName: string | null;
    }) => {
      const candidates = [
        m.memberLocalCode,
        m.memberDisplayName,
        m.terminologyConceptCode,
        m.terminologyDisplayName,
      ]
        .filter(Boolean)
        .map((x) => norm(String(x)));
      return candidates.some((c) => tokenSet.has(c) || [...tokenSet].some((t) => t.includes(c) || c.includes(t)));
    };

    const included = vs.members
      .filter((m) => m.membershipAction === 'INCLUDE')
      .some(matchesMember);
    const excluded = vs.members
      .filter((m) => m.membershipAction === 'EXCLUDE')
      .some(matchesMember);

    return included && !excluded;
  }

  async listRenewWorkflow(query: {
    dataset: 'indications' | 'monitoring' | 'inputs' | 'questions';
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    if (query.dataset === 'inputs') {
      const where: Prisma.RenewMonitoringInputWhereInput = search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { label: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};
      const [data, total] = await Promise.all([
        this.prisma.renewMonitoringInput.findMany({
          where,
          orderBy: [{ displayPriority: 'asc' }, { code: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.renewMonitoringInput.count({ where }),
      ]);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    if (query.dataset === 'monitoring') {
      const where: Prisma.RenewMonitoringRuleWhereInput = search
        ? {
            OR: [
              { ruleCode: { contains: search, mode: 'insensitive' } },
              { appliesToId: { contains: search, mode: 'insensitive' } },
              { indicationId: { contains: search, mode: 'insensitive' } },
              { input: { code: { contains: search, mode: 'insensitive' } } },
              { input: { label: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {};
      const [data, total] = await Promise.all([
        this.prisma.renewMonitoringRule.findMany({
          where,
          orderBy: [{ ruleCode: 'asc' }, { createdAt: 'asc' }],
          skip,
          take: limit,
          include: { input: { select: { code: true, label: true, category: true } } },
        }),
        this.prisma.renewMonitoringRule.count({ where }),
      ]);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    if (query.dataset === 'questions') {
      const where: Prisma.RenewConditionalQuestionWhereInput = search
        ? {
            OR: [
              { questionRuleId: { contains: search, mode: 'insensitive' } },
              { questionCode: { contains: search, mode: 'insensitive' } },
              { questionText: { contains: search, mode: 'insensitive' } },
              { appliesToId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};
      const [data, total] = await Promise.all([
        this.prisma.renewConditionalQuestion.findMany({
          where,
          orderBy: { questionRuleId: 'asc' },
          skip,
          take: limit,
        }),
        this.prisma.renewConditionalQuestion.count({ where }),
      ]);
      return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    const where: Prisma.RenewMedicationIndicationMapWhereInput = search
      ? {
          OR: [
            { ingredientId: { contains: search, mode: 'insensitive' } },
            { medicationConceptId: { contains: search, mode: 'insensitive' } },
            { drugName: { contains: search, mode: 'insensitive' } },
            { condition: { code: { contains: search, mode: 'insensitive' } } },
            { condition: { displayName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.renewMedicationIndicationMap.findMany({
        where,
        orderBy: [{ ingredientId: 'asc' }, { suggestionRank: 'asc' }],
        skip,
        take: limit,
        include: { condition: { select: { code: true, displayName: true } } },
      }),
      this.prisma.renewMedicationIndicationMap.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async renewWorkflowCounts() {
    const [indications, monitoring, inputs, questions] = await Promise.all([
      this.prisma.renewMedicationIndicationMap.count({ where: { active: true } }),
      this.prisma.renewMonitoringRule.count({ where: { active: true, ruleCode: { not: null } } }),
      this.prisma.renewMonitoringInput.count({ where: { active: true } }),
      this.prisma.renewConditionalQuestion.count({ where: { active: true } }),
    ]);
    return { indications, monitoring, inputs, questions };
  }
}

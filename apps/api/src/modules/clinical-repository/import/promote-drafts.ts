import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SafetyRuleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  cellToString,
  isRenewWorkflowFileType,
  mapAlertSeverity,
  parseOptionalBool,
  parseOptionalNumber,
  type ClinicalFileTypeKey,
} from '../contracts/workbook-registry';
import { promoteRenewWorkflowRow } from './promote-renew';
import {
  mapActionRequired,
  mapBandSeverityFromImport,
  mapLactationRisk,
  mapPregnancyCategory,
} from '@/modules/medication-safety/utils/patient-context.util';
import {
  isPrismaTransactionTimeout,
  PromoteBatchException,
  promotePublicMessage,
} from './promote-errors';

type ClinicalAction = 'HARD_STOP' | 'PHARMACIST_REVIEW' | 'MONITOR' | 'INFO_ONLY' | 'NONE';

function toClinicalAction(raw: string | null | undefined): ClinicalAction {
  const v = mapActionRequired(raw ?? 'PHARMACIST_REVIEW');
  if (v === 'HARD_STOP' || v === 'MONITOR' || v === 'INFO_ONLY' || v === 'NONE') return v;
  return 'PHARMACIST_REVIEW';
}

type BandSeverity = 'BLOCK' | 'CAUTION' | 'SAFE';

function toBandSeverity(raw: string | null | undefined): BandSeverity {
  const v = mapBandSeverityFromImport(raw ?? 'BLOCK');
  if (v === 'CAUTION' || v === 'SAFE') return v;
  return 'BLOCK';
}

type LactationRisk = 'HIGH_RISK' | 'MODERATE_RISK' | 'LOW_RISK' | 'UNKNOWN';

function toLactationRisk(raw: string | null | undefined): LactationRisk {
  const v = mapLactationRisk(raw ?? 'HIGH_RISK');
  if (v === 'MODERATE_RISK' || v === 'LOW_RISK' || v === 'UNKNOWN') return v;
  return 'HIGH_RISK';
}

type PregnancyCategory = 'CONTRAINDICATED' | 'CAUTION' | 'PREFERRED' | 'UNKNOWN';

function toPregnancyCategory(raw: string | null | undefined): PregnancyCategory {
  const v = mapPregnancyCategory(raw ?? 'CONTRAINDICATED');
  if (v === 'CAUTION' || v === 'PREFERRED' || v === 'UNKNOWN') return v;
  return 'CONTRAINDICATED';
}

type PromotableRow = {
  id: string;
  sourceRowNumber: number;
  businessKey: string | null;
  rawPayload: Record<string, unknown>;
};

/** Rows per interactive transaction — keeps each txn well under the timeout on a small VM. */
const PROMOTE_CHUNK_SIZE = 10;
const CHUNK_TIMEOUT_MS = 45_000;
const CHUNK_MAX_WAIT_MS = 15_000;

/**
 * Promote a validated import batch into draft repository records.
 *
 * Each chunk is its own interactive transaction so large workbooks cannot blow
 * Prisma's default 5s timeout. Already-IMPORTED rows are skipped, so a retry
 * resumes instead of redoing (or rolling back) the whole file.
 */
@Injectable()
export class ClinicalRepositoryPromoteService {
  private readonly logger = new Logger(ClinicalRepositoryPromoteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async promoteBatch(
    batchId: string,
    fileTypeKey: ClinicalFileTypeKey,
    userId: string,
  ) {
    const batch = await this.prisma.clinicalImportBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: {
        id: true,
        errorRows: true,
        targetReleaseId: true,
        originalFilename: true,
      },
    });

    if (batch.errorRows > 0) {
      throw new Error('Cannot promote a batch that still has validation errors.');
    }

    const alreadyImported = await this.prisma.clinicalImportRow.count({
      where: { importBatchId: batchId, rowStatus: 'IMPORTED' },
    });
    const pendingAtStart = await this.prisma.clinicalImportRow.count({
      where: {
        importBatchId: batchId,
        rowStatus: { in: ['VALID', 'WARNING'] },
      },
    });

    if (pendingAtStart === 0) {
      await this.markBatchImported(batchId, userId);
      return {
        promotedCount: 0,
        promotedIds: [] as string[],
        alreadyImportedCount: alreadyImported,
        resumed: alreadyImported > 0,
      };
    }

    this.logger.log(
      `Promoting ${batch.originalFilename} (${batchId}): ${pendingAtStart} pending, ${alreadyImported} already imported`,
    );

    const promoted: string[] = [];
    try {
      for (;;) {
        const chunkIds = await this.promoteChunk(
          batchId,
          fileTypeKey,
          userId,
          batch.targetReleaseId,
        );
        if (chunkIds.length === 0) break;
        promoted.push(...chunkIds);
        this.logger.log(
          `Promote ${batchId}: committed ${promoted.length}/${pendingAtStart} rows this run`,
        );
      }
    } catch (err) {
      const publicMessage = promotePublicMessage(err, promoted.length);
      this.logger.error(
        `Promote ${batchId} failed after ${promoted.length} committed row(s): ${
          err instanceof Error ? err.message.split('\n')[0] : String(err)
        }`,
      );
      await this.prisma.clinicalImportBatch
        .update({
          where: { id: batchId },
          data: { failureSummary: publicMessage },
        })
        .catch((updateErr: unknown) => {
          this.logger.error(
            `Failed to persist promote failureSummary for ${batchId}`,
            updateErr instanceof Error ? updateErr.stack : updateErr,
          );
        });
      throw new PromoteBatchException(
        publicMessage,
        isPrismaTransactionTimeout(err),
        promoted.length,
        err,
      );
    }

    await this.markBatchImported(batchId, userId);
    return {
      promotedCount: promoted.length,
      promotedIds: promoted,
      alreadyImportedCount: alreadyImported,
      resumed: alreadyImported > 0,
    };
  }

  private async markBatchImported(batchId: string, userId: string) {
    await this.prisma.clinicalImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'IMPORTED',
        importedAt: new Date(),
        importedById: userId,
        failureSummary: null,
      },
    });
  }

  private async promoteChunk(
    batchId: string,
    fileTypeKey: ClinicalFileTypeKey,
    userId: string,
    releaseId: string | null | undefined,
  ): Promise<string[]> {
    return this.prisma.$transaction(
      async (tx) => {
        // Serialize concurrent promote clicks for the same batch (connection-safe:
        // xact lock is released on commit/rollback of this chunk).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clinical-promote:${batchId}`}))`;

        const rows = await tx.clinicalImportRow.findMany({
          where: {
            importBatchId: batchId,
            rowStatus: { in: ['VALID', 'WARNING'] },
          },
          orderBy: { sourceRowNumber: 'asc' },
          take: PROMOTE_CHUNK_SIZE,
        });
        if (!rows.length) return [];

        const promoted: string[] = [];
        for (const row of rows) {
          const promotedId = await this.promoteOne(
            tx,
            fileTypeKey,
            {
              id: row.id,
              sourceRowNumber: row.sourceRowNumber,
              businessKey: row.businessKey,
              rawPayload: row.rawPayload as Record<string, unknown>,
            },
            batchId,
            releaseId,
            userId,
          );
          promoted.push(promotedId);
          await tx.clinicalImportRow.update({
            where: { id: row.id },
            data: {
              rowStatus: 'IMPORTED',
              promotedRecordId: promotedId,
              promotedRecordType: fileTypeKey,
            },
          });
        }
        return promoted;
      },
      { maxWait: CHUNK_MAX_WAIT_MS, timeout: CHUNK_TIMEOUT_MS },
    );
  }

  private async promoteOne(
    tx: Prisma.TransactionClient,
    fileTypeKey: ClinicalFileTypeKey,
    row: PromotableRow,
    batchId: string,
    releaseId: string | null | undefined,
    userId: string,
  ): Promise<string> {
    const r = row.rawPayload;
    switch (fileTypeKey) {
      case 'clinical_value_sets':
        return this.promoteValueSet(tx, r, batchId, releaseId, row.id);
      case 'clinical_value_set_members':
        return this.promoteValueSetMember(tx, r, batchId);
      case 'rule_evidence':
        return this.promoteEvidence(tx, r, batchId);
      case 'test_cases':
        return this.promoteTestCase(tx, r, batchId, releaseId);
      case 'test_inputs':
        return this.promoteTestInput(tx, r, batchId, releaseId);
      case 'allergy_cross_reactivity_rules':
        return this.promoteAllergyCross(tx, r, batchId, row.id, userId);
      case 'drug_interactions':
        return this.promoteDdi(tx, r, batchId, row.id, userId);
      case 'drug_disease_rules':
        return this.promoteDrugDisease(tx, r, batchId, row.id, userId);
      case 'renal_rules':
        return this.promoteRenal(tx, r, batchId, row.id, userId);
      case 'lab_threshold_rules':
        return this.promoteLab(tx, r, batchId, row.id, userId);
      case 'pregnancy_rules':
        return this.promotePregnancy(tx, r, batchId, row.id, userId);
      case 'lactation_rules':
        return this.promoteLactation(tx, r, batchId, row.id, userId);
      default:
        if (isRenewWorkflowFileType(fileTypeKey)) {
          return promoteRenewWorkflowRow(tx, fileTypeKey, r, batchId);
        }
        throw new Error(`Unsupported promotion for ${fileTypeKey}`);
    }
  }

  private mapSeverity(raw: unknown) {
    return mapAlertSeverity(raw);
  }

  private async upsertRuleVersion(
    tx: Prisma.TransactionClient,
    input: {
      code: string;
      ruleType: SafetyRuleType;
      jurisdiction: string;
      summary: string;
      detail: string;
      clinicalSeverity: 'INFO' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
      recommendedAction: string;
      overrideAllowed: boolean;
      overrideReasonRequired: boolean;
      acknowledgementRequired?: boolean;
      deduplicationGroup?: string | null;
      specificityRank?: number;
      ruleEffect?: string | null;
      ruleVersionLabel?: string | null;
      relationshipType?: string | null;
      payload?: Record<string, unknown>;
      importBatchId: string;
      importRowId: string;
      userId: string;
      participants?: Array<{
        participantKey: string;
        selectorType: string;
        conceptText: string;
        conceptCode?: string | null;
        selectorVersion?: string | null;
      }>;
    },
  ) {
    const rule = await tx.safetyKnowledgeRule.upsert({
      where: { code: input.code },
      create: {
        code: input.code,
        ruleType: input.ruleType,
        jurisdiction: input.jurisdiction || 'CA',
        ownerId: input.userId,
      },
      update: {},
    });
    if (rule.ruleType !== input.ruleType) {
      throw new Error(
        `Rule code ${input.code} already exists with type ${rule.ruleType}, cannot promote as ${input.ruleType}`,
      );
    }

    const latest = await tx.safetyRuleVersion.findFirst({
      where: { ruleId: rule.id },
      orderBy: { versionNumber: 'desc' },
    });

    // Only upsert into existing DRAFT; otherwise create new version
    if (latest && latest.status === 'DRAFT') {
      await tx.safetyRuleParticipant.deleteMany({ where: { versionId: latest.id } });
      const updated = await tx.safetyRuleVersion.update({
        where: { id: latest.id },
        data: {
          summary: input.summary,
          detail: input.detail,
          clinicalSeverity: input.clinicalSeverity,
          recommendedAction: input.recommendedAction,
          overrideAllowed: input.overrideAllowed,
          overrideReasonRequired: input.overrideReasonRequired,
          acknowledgementRequired: input.acknowledgementRequired ?? false,
          deduplicationGroup: input.deduplicationGroup ?? null,
          specificityRank: input.specificityRank ?? 0,
          ruleEffect: input.ruleEffect ?? null,
          ruleVersionLabel: input.ruleVersionLabel ?? null,
          relationshipType: input.relationshipType ?? null,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          importBatchId: input.importBatchId,
          importRowId: input.importRowId,
          changeSummary: 'Imported from clinical repository workbook',
        },
      });
      if (input.participants?.length) {
        await tx.safetyRuleParticipant.createMany({
          data: input.participants.map((p) => ({
            versionId: updated.id,
            participantKey: p.participantKey,
            selectorType: this.mapSelectorType(p.selectorType),
            conceptText: p.conceptText,
            conceptCode: p.conceptCode ?? null,
            selectorVersion: p.selectorVersion ?? null,
          })),
        });
      }
      return updated.id;
    }

    const created = await tx.safetyRuleVersion.create({
      data: {
        ruleId: rule.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: 'DRAFT',
        summary: input.summary,
        detail: input.detail,
        clinicalSeverity: input.clinicalSeverity,
        recommendedAction: input.recommendedAction,
        overrideAllowed: input.overrideAllowed,
        overrideReasonRequired: input.overrideReasonRequired,
        acknowledgementRequired: input.acknowledgementRequired ?? false,
        deduplicationGroup: input.deduplicationGroup ?? null,
        specificityRank: input.specificityRank ?? 0,
        ruleEffect: input.ruleEffect ?? null,
        ruleVersionLabel: input.ruleVersionLabel ?? null,
        relationshipType: input.relationshipType ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        importBatchId: input.importBatchId,
        importRowId: input.importRowId,
        changeSummary: 'Imported from clinical repository workbook',
        participants: input.participants?.length
          ? {
              create: input.participants.map((p) => ({
                participantKey: p.participantKey,
                selectorType: this.mapSelectorType(p.selectorType),
                conceptText: p.conceptText,
                conceptCode: p.conceptCode ?? null,
                selectorVersion: p.selectorVersion ?? null,
              })),
            }
          : undefined,
      },
    });
    return created.id;
  }

  private mapSelectorType(raw: string): 'EXACT_INGREDIENT' | 'HAS_INGREDIENT' | 'MEMBER_OF_CLASS' | 'STRUCTURAL_RELATIONSHIP' | 'VALUE_SET' | 'INGREDIENT_SELECTOR' | 'PRODUCT_SELECTOR' {
    const v = raw.toUpperCase();
    if (v === 'VALUE_SET') return 'VALUE_SET';
    if (v.includes('INGREDIENT')) return 'INGREDIENT_SELECTOR';
    if (v.includes('PRODUCT') || v.includes('MEDICATION')) return 'PRODUCT_SELECTOR';
    if (v.includes('CLASS')) return 'MEMBER_OF_CLASS';
    if (v.includes('STRUCT')) return 'STRUCTURAL_RELATIONSHIP';
    if (v === 'HAS_INGREDIENT') return 'HAS_INGREDIENT';
    if (v === 'EXACT_INGREDIENT') return 'EXACT_INGREDIENT';
    return 'INGREDIENT_SELECTOR';
  }

  private async promoteAllergyCross(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const versionId = await this.upsertRuleVersion(tx, {
      code: cellToString(r.rule_code)!,
      ruleType: 'CROSS_REACTIVITY',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? cellToString(r.rule_code)!,
      detail: cellToString(r.alert_detail) ?? cellToString(r.alert_summary) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action_code) ?? 'REVIEW',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      relationshipType: cellToString(r.relationship_basis),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
      participants: [
        {
          participantKey: 'allergen',
          selectorType: cellToString(r.source_selector_type) ?? 'INGREDIENT_SELECTOR',
          conceptText: cellToString(r.source_selector_code) ?? '',
          conceptCode: cellToString(r.source_selector_code),
          selectorVersion: cellToString(r.source_selector_version),
        },
        {
          participantKey: 'trigger_substance',
          selectorType: cellToString(r.target_selector_type) ?? 'INGREDIENT_SELECTOR',
          conceptText: cellToString(r.target_selector_code) ?? '',
          conceptCode: cellToString(r.target_selector_code),
          selectorVersion: cellToString(r.target_selector_version),
        },
      ],
    });
    return versionId;
  }

  private async promoteDdi(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const code = cellToString(r.interaction_code)!;
    const drugA = cellToString(r.drug_a_display_name_snapshot) || cellToString(r.drug_a_selector_code)!;
    const drugB = cellToString(r.drug_b_display_name_snapshot) || cellToString(r.drug_b_selector_code)!;
    const severityRaw = cellToString(r.alert_severity) ?? 'MODERATE';
    const clinicalSev = this.mapSeverity(severityRaw);
    const interactionSeverity =
      clinicalSev === 'CRITICAL' || clinicalSev === 'HIGH'
        ? 'MAJOR'
        : clinicalSev === 'LOW' || clinicalSev === 'INFO'
          ? 'MINOR'
          : 'MODERATE';

    const versionId = await this.upsertRuleVersion(tx, {
      code,
      ruleType: 'DRUG_INTERACTION',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? `${drugA} + ${drugB}`,
      detail: cellToString(r.alert_detail) ?? '',
      clinicalSeverity: clinicalSev,
      recommendedAction: cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
      participants: [
        {
          participantKey: 'drug_a',
          selectorType: cellToString(r.drug_a_selector_type) ?? 'INGREDIENT_SELECTOR',
          conceptText: drugA,
          conceptCode: cellToString(r.drug_a_selector_code),
          selectorVersion: cellToString(r.drug_a_selector_version),
        },
        {
          participantKey: 'drug_b',
          selectorType: cellToString(r.drug_b_selector_type) ?? 'INGREDIENT_SELECTOR',
          conceptText: drugB,
          conceptCode: cellToString(r.drug_b_selector_code),
          selectorVersion: cellToString(r.drug_b_selector_version),
        },
      ],
    });

    await tx.safetyDdiRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugA,
        drugB,
        drugASelectorType: cellToString(r.drug_a_selector_type),
        drugASelectorCode: cellToString(r.drug_a_selector_code),
        drugASelectorVersion: cellToString(r.drug_a_selector_version),
        drugBSelectorType: cellToString(r.drug_b_selector_type),
        drugBSelectorCode: cellToString(r.drug_b_selector_code),
        drugBSelectorVersion: cellToString(r.drug_b_selector_version),
        pairMatchMode: cellToString(r.pair_match_mode),
        exposureWindowCode: cellToString(r.exposure_window_code),
        interactionMechanismCode: cellToString(r.interaction_mechanism_code),
        clinicalEffectCode: cellToString(r.clinical_effect_code),
        applicabilityConditionCode: cellToString(r.applicability_condition_code),
        monitoringCode: cellToString(r.monitoring_code),
        monitoringDetail: cellToString(r.monitoring_detail),
        interactionSeverity: interactionSeverity as 'MAJOR' | 'MODERATE' | 'MINOR',
        actionRequired: toClinicalAction(cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW'),
      },
      update: {
        drugA,
        drugB,
        drugASelectorType: cellToString(r.drug_a_selector_type),
        drugASelectorCode: cellToString(r.drug_a_selector_code),
        drugBSelectorType: cellToString(r.drug_b_selector_type),
        drugBSelectorCode: cellToString(r.drug_b_selector_code),
        pairMatchMode: cellToString(r.pair_match_mode),
        interactionSeverity: interactionSeverity as 'MAJOR' | 'MODERATE' | 'MINOR',
      },
    });
    return versionId;
  }

  private async promoteDrugDisease(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const versionId = await this.upsertRuleVersion(tx, {
      code: cellToString(r.rule_code)!,
      ruleType: 'DRUG_DISEASE',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? cellToString(r.rule_code)!,
      detail: cellToString(r.alert_detail) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? false,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
      participants: [
        {
          participantKey: 'drug',
          selectorType: cellToString(r.drug_selector_type) ?? 'INGREDIENT_SELECTOR',
          conceptText:
            cellToString(r.drug_display_name_snapshot) ||
            cellToString(r.drug_selector_code) ||
            '',
          conceptCode: cellToString(r.drug_selector_code),
          selectorVersion: cellToString(r.drug_selector_version),
        },
        {
          participantKey: 'condition',
          selectorType: 'EXACT_INGREDIENT',
          conceptText:
            cellToString(r.condition_display_name_snapshot) ||
            cellToString(r.condition_concept_code) ||
            '',
          conceptCode: cellToString(r.condition_concept_code),
        },
      ],
    });

    await tx.safetyDrugDiseaseRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugSelectorType: cellToString(r.drug_selector_type) ?? 'INGREDIENT_SELECTOR',
        drugSelectorCode: cellToString(r.drug_selector_code) ?? '',
        drugSelectorVersion: cellToString(r.drug_selector_version),
        drugDisplayName: cellToString(r.drug_display_name_snapshot),
        drugRouteScopeCode: cellToString(r.drug_route_scope_code),
        conditionCodeSystemUri: cellToString(r.condition_code_system_uri),
        conditionConceptCode: cellToString(r.condition_concept_code),
        conditionTerminologyVersion: cellToString(r.condition_terminology_version),
        conditionDisplayName: cellToString(r.condition_display_name_snapshot),
        conditionMatchMode: cellToString(r.condition_match_mode),
        conditionClinicalStatusRequired: cellToString(r.condition_clinical_status_required),
        conditionTemporalityCode: cellToString(r.condition_temporality_code),
        conditionSeverityRequirement: cellToString(r.condition_severity_requirement),
        conditionVerificationRequirement: cellToString(r.condition_verification_requirement),
        applicabilityConditionCode: cellToString(r.applicability_condition_code),
        clinicalRationaleCode: cellToString(r.clinical_rationale_code),
        monitoringCode: cellToString(r.monitoring_code),
        monitoringDetail: cellToString(r.monitoring_detail),
        actionRequired: toClinicalAction(cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW'),
      },
      update: {
        drugSelectorCode: cellToString(r.drug_selector_code) ?? '',
        conditionConceptCode: cellToString(r.condition_concept_code),
        conditionDisplayName: cellToString(r.condition_display_name_snapshot),
      },
    });
    return versionId;
  }

  private async promoteRenal(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const drugName =
      cellToString(r.drug_display_name_snapshot) ||
      cellToString(r.drug_selector_code) ||
      '';
    const versionId = await this.upsertRuleVersion(tx, {
      code: cellToString(r.rule_code)!,
      ruleType: 'RENAL_EGFR_BAND',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? cellToString(r.rule_code)!,
      detail: cellToString(r.alert_detail) ?? cellToString(r.dose_instruction_snapshot) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
    });

    const egfrMin = parseOptionalNumber(r.threshold_min_value) ?? 0;
    const egfrMax = parseOptionalNumber(r.threshold_max_value) ?? 999;
    const band = toBandSeverity(cellToString(r.alert_severity) ?? 'CAUTION');

    await tx.safetyRenalRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugName,
        egfrMin,
        egfrMax,
        bandSeverity: band,
        clinicalNote: cellToString(r.dose_instruction_snapshot),
        actionRequired: toClinicalAction(cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW'),
      },
      update: {
        drugName,
        egfrMin,
        egfrMax,
        bandSeverity: band,
        clinicalNote: cellToString(r.dose_instruction_snapshot),
      },
    });
    return versionId;
  }

  private async promoteLab(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const drugIngredient =
      cellToString(r.drug_display_name_snapshot) ||
      cellToString(r.drug_selector_code) ||
      '';
    const versionId = await this.upsertRuleVersion(tx, {
      code: cellToString(r.rule_code)!,
      ruleType: 'LAB_THRESHOLD',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? cellToString(r.rule_code)!,
      detail: cellToString(r.alert_detail) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action_code) ?? 'PHARMACIST_REVIEW',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
    });

    const low = parseOptionalNumber(r.threshold_min_value);
    const high = parseOptionalNumber(r.threshold_max_value);
    const refDir = (cellToString(r.reference_limit_direction) ?? '').toUpperCase();
    const obsKey = (
      cellToString(r.observation_display_name) ??
      cellToString(r.observation_code) ??
      ''
    ).toLowerCase();

    // Map single-sided Excel thresholds into comparator + thresholdLow used by the evaluator.
    let comparator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ' | 'BETWEEN' = 'BETWEEN';
    let thresholdLow: number | null = low;
    let thresholdHigh: number | null = high;

    if (low != null && high != null) {
      comparator = 'BETWEEN';
    } else if (high != null && low == null) {
      // ABOVE / max-only rows (e.g. lithium > 1.5)
      comparator = 'GT';
      thresholdLow = high;
      thresholdHigh = null;
    } else if (low != null && high == null) {
      comparator = 'LT';
    } else if (refDir.includes('ABOVE') || refDir.includes('UPPER')) {
      // LOCAL_REFERENCE_LIMIT above ULN — use common adult defaults when numeric ULN is absent
      comparator = 'GT';
      if (/potassium|2823-3/.test(obsKey)) thresholdLow = 5.0;
      else if (/lithium/.test(obsKey)) thresholdLow = 1.5;
    } else if (refDir.includes('BELOW') || refDir.includes('LOWER')) {
      comparator = 'LT';
      if (/potassium|2823-3/.test(obsKey)) thresholdLow = 3.5;
    }

    await tx.safetyLabRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugIngredient,
        observationKey: cellToString(r.observation_code) ?? cellToString(r.observation_display_name) ?? 'lab',
        observationDisplay: cellToString(r.observation_display_name),
        loincCode: cellToString(r.observation_code),
        comparator,
        thresholdLow,
        thresholdHigh,
        expectedUnit: cellToString(r.expected_unit_ucum_code),
        maxAgeDays: parseOptionalNumber(r.max_result_age_days) ?? 365,
        missingLabAction:
          String(r.missing_or_stale_result_action ?? '')
            .toUpperCase()
            .includes('SKIP')
            ? 'SKIP_RULE'
            : 'REQUIRE_REVIEW',
      },
      update: {
        drugIngredient,
        observationKey: cellToString(r.observation_code) ?? 'lab',
        observationDisplay: cellToString(r.observation_display_name),
        loincCode: cellToString(r.observation_code),
        comparator,
        thresholdLow,
        thresholdHigh,
        expectedUnit: cellToString(r.expected_unit_ucum_code),
      },
    });
    return versionId;
  }

  private async promotePregnancy(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const drugName =
      cellToString(r.drug_display_name_snapshot) ||
      cellToString(r.drug_selector_code) ||
      '';
    const versionId = await this.upsertRuleVersion(tx, {
      code: cellToString(r.rule_code)!,
      ruleType: 'PREGNANCY',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      summary: cellToString(r.alert_summary) ?? cellToString(r.rule_code)!,
      detail: cellToString(r.alert_detail) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action_code) ?? 'HARD_STOP',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      deduplicationGroup: cellToString(r.deduplication_group),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.rule_effect),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
      participants: [
        {
          participantKey: 'drug',
          selectorType: cellToString(r.drug_selector_type) ?? 'VALUE_SET',
          conceptText: drugName,
          conceptCode: cellToString(r.drug_selector_code),
          selectorVersion: cellToString(r.drug_selector_version),
        },
      ],
    });

    await tx.safetyPregnancyRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugName,
        pregnancyCategory: toPregnancyCategory(cellToString(r.alert_severity) ?? 'CAUTION'),
        trimester: cellToString(r.trimester_snapshot) ?? 'all',
        clinicalNote: cellToString(r.alternative_guidance),
        actionRequired: toClinicalAction(cellToString(r.recommended_action_code) ?? 'HARD_STOP'),
      },
      update: {
        drugName,
        trimester: cellToString(r.trimester_snapshot) ?? 'all',
        clinicalNote: cellToString(r.alternative_guidance),
      },
    });
    return versionId;
  }

  private async promoteLactation(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    importRowId: string,
    userId: string,
  ) {
    const code = cellToString(r.rule_id)!;
    const drugName =
      cellToString(r.medication_selector_display) ||
      cellToString(r.medication_selector_code) ||
      '';
    const versionId = await this.upsertRuleVersion(tx, {
      code,
      ruleType: 'LACTATION',
      jurisdiction: 'CA',
      summary: cellToString(r.rule_name) ?? code,
      detail: cellToString(r.clinical_rationale) ?? cellToString(r.evidence_summary) ?? '',
      clinicalSeverity: this.mapSeverity(r.alert_severity),
      recommendedAction: cellToString(r.recommended_action) ?? 'HARD_STOP',
      overrideAllowed: parseOptionalBool(r.override_allowed) ?? true,
      overrideReasonRequired: parseOptionalBool(r.override_reason_required) ?? true,
      acknowledgementRequired: parseOptionalBool(r.acknowledgement_required) ?? false,
      deduplicationGroup: cellToString(r.deduplication_key),
      specificityRank: parseOptionalNumber(r.specificity_rank) ?? 0,
      ruleEffect: cellToString(r.recommendation),
      ruleVersionLabel: cellToString(r.rule_version),
      payload: r,
      importBatchId: batchId,
      importRowId,
      userId,
    });

    await tx.safetyLactationRuleDetail.upsert({
      where: { versionId },
      create: {
        versionId,
        drugName,
        lactationRisk: toLactationRisk(cellToString(r.exposure_risk_level) ?? 'HIGH_RISK'),
        bandSeverity: toBandSeverity(cellToString(r.alert_severity) ?? 'BLOCK'),
        clinicalNote: cellToString(r.safer_alternative_text),
        actionRequired: toClinicalAction(cellToString(r.recommended_action) ?? 'HARD_STOP'),
      },
      update: {
        drugName,
        clinicalNote: cellToString(r.safer_alternative_text),
      },
    });
    return versionId;
  }

  private async promoteValueSet(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    releaseId: string | null | undefined,
    sourceRowId: string,
  ) {
    const code = cellToString(r.value_set_code)!;
    const version = cellToString(r.value_set_version)!;
    const existing = await tx.clinicalValueSet.findFirst({
      where: {
        valueSetCode: code,
        valueSetVersion: version,
        releaseId: releaseId ?? null,
      },
    });
    if (existing) {
      const updated = await tx.clinicalValueSet.update({
        where: { id: existing.id },
        data: {
          displayName: cellToString(r.display_name) ?? code,
          description: cellToString(r.description),
          clinicalDomain: cellToString(r.clinical_domain) ?? 'MULTI_DOMAIN',
          intendedUse: cellToString(r.intended_use) ?? '',
          memberConceptType: cellToString(r.member_concept_type) ?? 'INGREDIENT',
          terminologyBasis: cellToString(r.terminology_basis),
          candidateGenerationMethod: cellToString(r.candidate_generation_method),
          membershipMode: cellToString(r.membership_mode) ?? 'EXPLICIT_VERSIONED_MEMBERS',
          routeScope: cellToString(r.route_scope),
          doseFormScope: cellToString(r.dose_form_scope),
          inclusionDefinition: cellToString(r.inclusion_definition) ?? '',
          exclusionDefinition: cellToString(r.exclusion_definition),
          clinicalSteward: cellToString(r.clinical_steward),
          reviewFrequencyMonths: parseOptionalNumber(r.review_frequency_months) ?? null,
          terminologyReleaseSnapshot: cellToString(r.terminology_release_snapshot),
          changeSummary: cellToString(r.change_summary),
          approvalStatus: cellToString(r.approval_status) ?? 'NOT_REVIEWED',
          importBatchId: batchId,
          sourceRowId,
          recordStatus: 'DRAFT',
        },
      });
      return updated.id;
    }
    const created = await tx.clinicalValueSet.create({
      data: {
        releaseId: releaseId ?? null,
        valueSetCode: code,
        valueSetVersion: version,
        displayName: cellToString(r.display_name) ?? code,
        description: cellToString(r.description),
        clinicalDomain: cellToString(r.clinical_domain) ?? 'MULTI_DOMAIN',
        intendedUse: cellToString(r.intended_use) ?? '',
        memberConceptType: cellToString(r.member_concept_type) ?? 'INGREDIENT',
        terminologyBasis: cellToString(r.terminology_basis),
        candidateGenerationMethod: cellToString(r.candidate_generation_method),
        membershipMode: cellToString(r.membership_mode) ?? 'EXPLICIT_VERSIONED_MEMBERS',
        routeScope: cellToString(r.route_scope),
        doseFormScope: cellToString(r.dose_form_scope),
        inclusionDefinition: cellToString(r.inclusion_definition) ?? '',
        exclusionDefinition: cellToString(r.exclusion_definition),
        clinicalSteward: cellToString(r.clinical_steward),
        reviewFrequencyMonths: parseOptionalNumber(r.review_frequency_months) ?? null,
        terminologyReleaseSnapshot: cellToString(r.terminology_release_snapshot),
        changeSummary: cellToString(r.change_summary),
        approvalStatus: cellToString(r.approval_status) ?? 'NOT_REVIEWED',
        importBatchId: batchId,
        sourceRowId,
        recordStatus: 'DRAFT',
      },
    });
    return created.id;
  }

  private async promoteValueSetMember(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
  ) {
    const code = cellToString(r.value_set_code)!;
    const version = cellToString(r.value_set_version)!;
    let valueSet = await tx.clinicalValueSet.findFirst({
      where: { valueSetCode: code, valueSetVersion: version },
    });
    if (!valueSet) {
      // Create a placeholder value set definition so members can attach
      valueSet = await tx.clinicalValueSet.create({
        data: {
          valueSetCode: code,
          valueSetVersion: version,
          displayName: code,
          clinicalDomain: 'MULTI_DOMAIN',
          intendedUse: 'Pending definition import',
          memberConceptType: 'INGREDIENT',
          membershipMode: 'EXPLICIT_VERSIONED_MEMBERS',
          inclusionDefinition: 'Imported before value set definition',
          importBatchId: batchId,
          recordStatus: 'DRAFT',
        },
      });
    }

    const seq = parseOptionalNumber(r.member_sequence) ?? 0;
    const existing = await tx.clinicalValueSetMember.findFirst({
      where: { valueSetId: valueSet.id, memberSequence: seq },
    });
    const data = {
      membershipAction: (cellToString(r.membership_action)?.toUpperCase() === 'EXCLUDE'
        ? 'EXCLUDE'
        : 'INCLUDE') as 'INCLUDE' | 'EXCLUDE',
      memberSelectorType: cellToString(r.member_selector_type) ?? 'INGREDIENT',
      memberLocalCode: cellToString(r.member_local_code),
      memberDisplayName: cellToString(r.member_display_name) ?? '',
      conceptDomain: cellToString(r.concept_domain) ?? 'MEDICATION_INGREDIENT',
      terminologySystem: cellToString(r.terminology_system),
      terminologyConceptCode: cellToString(r.terminology_concept_code),
      terminologyDisplayName: cellToString(r.terminology_display_name),
      terminologyVersion: cellToString(r.terminology_version),
      routeScope: cellToString(r.route_scope),
      doseFormScope: cellToString(r.dose_form_scope),
      candidateSource: cellToString(r.candidate_source),
      candidateQueryReference: cellToString(r.candidate_query_reference),
      mappingMethod: cellToString(r.mapping_method),
      mappingConfidence: cellToString(r.mapping_confidence),
      clinicalRationale: cellToString(r.clinical_rationale),
      clinicalReviewStatus: cellToString(r.clinical_review_status) ?? 'PENDING_REVIEW',
      reviewedBy: cellToString(r.reviewed_by),
      changeSummary: cellToString(r.change_summary),
      importBatchId: batchId,
      sourceRowId: cellToString(r.row_id),
      recordStatus: 'DRAFT' as const,
    };
    if (existing) {
      await tx.clinicalValueSetMember.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await tx.clinicalValueSetMember.create({
      data: {
        valueSetId: valueSet.id,
        memberSequence: seq,
        ...data,
      },
    });
    return created.id;
  }

  private async promoteEvidence(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
  ) {
    const linkId = cellToString(r.evidence_link_id)!;
    const existing = await tx.safetyRuleEvidence.findFirst({
      where: { evidenceLinkId: linkId },
    });
    const data = {
      evidenceLinkId: linkId,
      ruleCode: cellToString(r.rule_code),
      ruleVersion: cellToString(r.rule_version),
      clinicalDomain: cellToString(r.clinical_domain),
      evidenceRole: cellToString(r.evidence_role),
      sourceType: cellToString(r.source_type),
      source: cellToString(r.source_title) ?? linkId,
      sourceOrganization: cellToString(r.source_organization),
      sourceJurisdiction: cellToString(r.source_jurisdiction),
      sourceIdentifier: cellToString(r.source_identifier),
      sourceVersionOrDate: cellToString(r.source_version_or_date),
      sourceUrl: cellToString(r.source_url),
      sourceLocator: cellToString(r.source_locator),
      evidenceSummary: cellToString(r.evidence_summary),
      applicabilityToRule: cellToString(r.applicability_to_rule),
      limitationsOrUncertainty: cellToString(r.limitations_or_uncertainty),
      evidenceQuality: cellToString(r.evidence_quality),
      recommendationStrength: cellToString(r.recommendation_strength),
      supportsRuleOutcome: cellToString(r.supports_rule_outcome),
      sourceStatus: cellToString(r.source_status) ?? 'ACTIVE',
      recordStatus: 'DRAFT' as const,
      approvalStatus: cellToString(r.approval_status) ?? 'NOT_REVIEWED',
      clinicalReviewer: cellToString(r.clinical_reviewer),
      extractedBy: cellToString(r.extracted_by),
      importBatchId: batchId,
    };
    if (existing) {
      await tx.safetyRuleEvidence.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await tx.safetyRuleEvidence.create({ data });
    return created.id;
  }

  private async promoteTestCase(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    releaseId: string | null | undefined,
  ) {
    const testCaseId = cellToString(r.test_case_id)!;
    const suiteVersion = cellToString(r.suite_version)!;
    const existing = await tx.clinicalTestCase.findFirst({
      where: {
        testCaseId,
        suiteVersion,
        releaseId: releaseId ?? null,
      },
    });
    const data = {
      testCaseName: cellToString(r.test_case_name) ?? testCaseId,
      safetyDomain: cellToString(r.safety_domain) ?? 'UNKNOWN',
      testType: cellToString(r.test_type) ?? 'POSITIVE_MATCH',
      priority: cellToString(r.priority) ?? 'P1',
      jurisdiction: cellToString(r.jurisdiction) ?? 'CA',
      scenarioSummary: cellToString(r.scenario_summary) ?? '',
      ruleCodeUnderTest: cellToString(r.rule_code_under_test),
      ruleVersionUnderTest: cellToString(r.rule_version_under_test),
      inputBundleKey: cellToString(r.input_bundle_key)!,
      requiredRepositoryRelease: cellToString(r.required_repository_release),
      requiredTerminologyRelease: cellToString(r.required_terminology_release),
      expectedRawMatchCount: parseOptionalNumber(r.expected_raw_match_count) ?? 0,
      expectedPrimaryRuleCode: cellToString(r.expected_primary_rule_code),
      expectedRuleEffect: cellToString(r.expected_rule_effect),
      expectedAlertSeverity: cellToString(r.expected_alert_severity),
      expectedActionCode: cellToString(r.expected_action_code),
      expectedDeduplicatedFindingCount:
        parseOptionalNumber(r.expected_deduplicated_finding_count) ?? 0,
      expectedNoMatchReason: cellToString(r.expected_no_match_reason),
      passCriteria: cellToString(r.pass_criteria) ?? '',
      executionMode: cellToString(r.execution_mode) ?? 'AUTOMATED',
      contentStatus: 'DRAFT' as const,
      testOwnerRole: cellToString(r.test_owner_role),
      implementationNotes: cellToString(r.implementation_notes),
      importBatchId: batchId,
    };
    if (existing) {
      await tx.clinicalTestCase.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await tx.clinicalTestCase.create({
      data: {
        releaseId: releaseId ?? null,
        testCaseId,
        suiteVersion,
        ...data,
      },
    });
    return created.id;
  }

  private async promoteTestInput(
    tx: Prisma.TransactionClient,
    r: Record<string, unknown>,
    batchId: string,
    releaseId: string | null | undefined,
  ) {
    const recordId = cellToString(r.record_id)!;
    const existing = await tx.clinicalTestInput.findFirst({
      where: { recordId, releaseId: releaseId ?? null },
    });
    const payload = { ...r };
    const data = {
      inputBundleKey: cellToString(r.input_bundle_key)!,
      inputSequence: parseOptionalNumber(r.input_sequence) ?? 0,
      inputType: cellToString(r.input_type)!,
      entityRole: cellToString(r.entity_role)!,
      payload: payload as Prisma.InputJsonValue,
      terminologyRelease: cellToString(r.terminology_release),
      resolutionStatus: cellToString(r.resolution_status) ?? 'PENDING',
      contentStatus: 'DRAFT' as const,
      implementationNotes: cellToString(r.implementation_notes),
      importBatchId: batchId,
    };
    if (existing) {
      await tx.clinicalTestInput.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await tx.clinicalTestInput.create({
      data: {
        releaseId: releaseId ?? null,
        recordId,
        ...data,
      },
    });
    return created.id;
  }
}

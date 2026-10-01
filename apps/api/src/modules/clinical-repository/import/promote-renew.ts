import { Prisma } from '@prisma/client';
import {
  cellToString,
  isTruthyBool,
  parseOptionalNumber,
  parseSpreadsheetBoolean,
  type ClinicalFileTypeKey,
} from '../contracts/workbook-registry';
import {
  aliasesForIndicationCode,
  defaultAliasesForInput,
  expandIndicationCodes,
  toRenewValueShape,
} from '@safescript/shared';

const LIVE_VERSION = 'live';

function asBool(value: unknown, fallback = true): boolean {
  try {
    return parseSpreadsheetBoolean(value, 'boolean') ?? fallback;
  } catch {
    return fallback;
  }
}

function displayPriorityForInput(category: string, indexHint = 100): number {
  if (category === 'VITAL') return 10;
  if (category === 'LAB') return 40;
  if (category === 'QUESTION') return 250;
  return 200 + (indexHint % 50);
}

async function ensureConditionAlias(
  tx: Prisma.TransactionClient,
  conditionId: string,
  alias: string,
) {
  const normalizedAlias = alias.trim().toLowerCase();
  if (!normalizedAlias) return;
  await tx.renewConditionAlias.upsert({
    where: {
      conditionId_normalizedAlias: {
        conditionId,
        normalizedAlias,
      },
    },
    update: { alias: alias.trim(), active: true },
    create: {
      conditionId,
      alias: alias.trim(),
      normalizedAlias,
      active: true,
    },
  });
}

async function resolveConditionId(
  tx: Prisma.TransactionClient,
  indicationId: string,
  indicationName?: string | null,
): Promise<string> {
  const code = indicationId.trim().toUpperCase();
  const existing = await tx.renewCondition.findUnique({ where: { code } });
  if (existing) {
    if (indicationName && existing.displayName !== indicationName) {
      await tx.renewCondition.update({
        where: { id: existing.id },
        data: { displayName: indicationName, active: true },
      });
    }
    for (const alias of aliasesForIndicationCode(code, indicationName)) {
      await ensureConditionAlias(tx, existing.id, alias);
    }
    return existing.id;
  }

  const aliasHit = await tx.renewConditionAlias.findFirst({
    where: { normalizedAlias: code.toLowerCase(), active: true },
    select: { conditionId: true, condition: { select: { code: true } } },
  });
  if (aliasHit && expandIndicationCodes([code]).includes(aliasHit.condition.code)) {
    for (const alias of aliasesForIndicationCode(code, indicationName)) {
      await ensureConditionAlias(tx, aliasHit.conditionId, alias);
    }
    return aliasHit.conditionId;
  }

  const created = await tx.renewCondition.create({
    data: {
      code,
      displayName: indicationName?.trim() || code,
      commonForRenewal: true,
      active: true,
    },
  });
  for (const alias of aliasesForIndicationCode(code, indicationName)) {
    await ensureConditionAlias(tx, created.id, alias);
  }
  return created.id;
}

export async function promoteRenewWorkflowRow(
  tx: Prisma.TransactionClient,
  fileTypeKey: ClinicalFileTypeKey,
  raw: Record<string, unknown>,
  batchId: string,
): Promise<string> {
  switch (fileTypeKey) {
    case 'renew_input_definitions':
      return promoteInputDefinition(tx, raw, batchId);
    case 'renew_monitoring_rules':
      return promoteMonitoringRule(tx, raw, batchId);
    case 'renew_medication_indications':
      return promoteMedicationIndication(tx, raw, batchId);
    case 'renew_conditional_questions':
      return promoteConditionalQuestion(tx, raw, batchId);
    default:
      throw new Error(`Not a Renew workflow file type: ${fileTypeKey}`);
  }
}

async function promoteInputDefinition(
  tx: Prisma.TransactionClient,
  raw: Record<string, unknown>,
  batchId: string,
): Promise<string> {
  const code = cellToString(raw.input_code)?.toUpperCase();
  if (!code) throw new Error('input_code is required');
  const label = cellToString(raw.label) || code;
  const category = (cellToString(raw.category) || 'LAB').toUpperCase();
  const dataType = (cellToString(raw.data_type) || 'DECIMAL').toUpperCase();
  const uiComponent = (cellToString(raw.ui_component) || 'LAB_INPUT').toUpperCase();
  const unit = cellToString(raw.unit);
  const row = await tx.renewMonitoringInput.upsert({
    where: { code },
    update: {
      label,
      inputType: category === 'QUESTION' ? 'PATIENT_CONTEXT' : category,
      valueShape: toRenewValueShape(dataType, uiComponent),
      unit,
      aliases: defaultAliasesForInput(code, label),
      category,
      dataType,
      uiComponent,
      allowDate: asBool(raw.allow_date, true),
      allowNotAvailable: asBool(raw.allow_not_available, true),
      normalRangeDisplay: cellToString(raw.normal_range_display),
      active: asBool(raw.active, true),
      displayPriority: displayPriorityForInput(category),
      ruleSetVersion: LIVE_VERSION,
      sourceBatchId: batchId,
    },
    create: {
      code,
      label,
      inputType: category === 'QUESTION' ? 'PATIENT_CONTEXT' : category,
      valueShape: toRenewValueShape(dataType, uiComponent),
      unit,
      aliases: defaultAliasesForInput(code, label),
      category,
      dataType,
      uiComponent,
      allowDate: asBool(raw.allow_date, true),
      allowNotAvailable: asBool(raw.allow_not_available, true),
      normalRangeDisplay: cellToString(raw.normal_range_display),
      active: asBool(raw.active, true),
      displayPriority: displayPriorityForInput(category),
      ruleSetVersion: LIVE_VERSION,
      sourceBatchId: batchId,
    },
  });
  return row.id;
}

async function promoteMonitoringRule(
  tx: Prisma.TransactionClient,
  raw: Record<string, unknown>,
  batchId: string,
): Promise<string> {
  const ruleCode = cellToString(raw.rule_id)?.toUpperCase();
  const inputCode = cellToString(raw.input_code)?.toUpperCase();
  if (!ruleCode || !inputCode) throw new Error('rule_id and input_code are required');
  const input = await tx.renewMonitoringInput.findUnique({ where: { code: inputCode } });
  if (!input) {
    throw new Error(
      `Monitoring rule ${ruleCode} references unknown input_code ${inputCode}. Promote input definitions first.`,
    );
  }
  const appliesToType = (cellToString(raw.applies_to_type) || 'INGREDIENT').toUpperCase();
  const appliesToId = (cellToString(raw.applies_to_id) || '').toUpperCase();
  const indicationId = (cellToString(raw.indication_id) || 'ANY').toUpperCase();
  const inputType = (cellToString(raw.input_type) || input.inputType).toUpperCase();
  const requirement = (cellToString(raw.requirement) || 'RELEVANT').toUpperCase();
  const matchType = appliesToType === 'CLASS' ? 'class' : 'ingredient';
  const ingredientKey = matchType === 'ingredient' ? appliesToId.toLowerCase() : null;

  const existing = await tx.renewMonitoringRule.findFirst({
    where: { ruleCode, ruleSetVersion: LIVE_VERSION },
  });
  const data = {
    ruleCode,
    inputId: input.id,
    matchType,
    ingredientKey,
    conditionCode: indicationId === 'ANY' ? null : indicationId,
    appliesToType,
    appliesToId,
    indicationId,
    inputType,
    requirementLevel: requirement,
    freshnessDays: parseOptionalNumber(raw.freshness_days),
    actionIfMissing: (cellToString(raw.action_if_missing) || 'REVIEW').toUpperCase(),
    active: asBool(raw.active, true),
    ruleSetVersion: LIVE_VERSION,
    sourceBatchId: batchId,
  };
  if (existing) {
    await tx.renewMonitoringRule.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await tx.renewMonitoringRule.create({ data });
  return created.id;
}

async function promoteMedicationIndication(
  tx: Prisma.TransactionClient,
  raw: Record<string, unknown>,
  batchId: string,
): Promise<string> {
  const ingredientId = cellToString(raw.ingredient_id)?.toUpperCase();
  const indicationId = cellToString(raw.indication_id)?.toUpperCase();
  if (!ingredientId || !indicationId) throw new Error('ingredient_id and indication_id are required');
  const conditionId = await resolveConditionId(tx, indicationId, cellToString(raw.indication_name));
  const conceptId = ingredientId.toLowerCase();
  const rank = parseOptionalNumber(raw.suggestion_rank) ?? 1;
  const common = asBool(raw.common_indication, true);
  const mappingStrength = rank <= 1 ? 'primary' : rank === 2 ? 'common' : 'possible';
  const rankingWeight = rank <= 1 ? 100 : rank === 2 ? 70 : 40;
  const row = await tx.renewMedicationIndicationMap.upsert({
    where: {
      medicationConceptId_conditionId: {
        medicationConceptId: conceptId,
        conditionId,
      },
    },
    update: {
      ingredientId,
      drugName: cellToString(raw.drug_name),
      mappingStrength,
      rankingWeight,
      suggestionRank: rank,
      commonIndication: common,
      autoGroupAllowed: common,
      active: asBool(raw.active, true),
      ruleSetVersion: LIVE_VERSION,
      sourceBatchId: batchId,
    },
    create: {
      medicationConceptId: conceptId,
      ingredientId,
      drugName: cellToString(raw.drug_name),
      conditionId,
      mappingStrength,
      rankingWeight,
      suggestionRank: rank,
      commonIndication: common,
      autoGroupAllowed: common,
      active: asBool(raw.active, true),
      ruleSetVersion: LIVE_VERSION,
      sourceBatchId: batchId,
    },
  });
  return row.id;
}

async function promoteConditionalQuestion(
  tx: Prisma.TransactionClient,
  raw: Record<string, unknown>,
  batchId: string,
): Promise<string> {
  const questionRuleId = cellToString(raw.question_rule_id)?.toUpperCase();
  if (!questionRuleId) throw new Error('question_rule_id is required');
  const data = {
    questionRuleId,
    appliesToType: (cellToString(raw.applies_to_type) || 'INGREDIENT').toUpperCase(),
    appliesToId: (cellToString(raw.applies_to_id) || '').toUpperCase(),
    indicationId: (cellToString(raw.indication_id) || 'ANY').toUpperCase(),
    questionCode: (cellToString(raw.question_code) || questionRuleId).toUpperCase(),
    questionText: cellToString(raw.question_text) || questionRuleId,
    responseType: (cellToString(raw.response_type) || 'YES_NO').toUpperCase(),
    triggerAnswer: (cellToString(raw.trigger_answer) || 'YES').toUpperCase(),
    actionOnTrigger: (cellToString(raw.action_on_trigger) || 'REVIEW').toUpperCase(),
    followupPrompt: cellToString(raw.followup_prompt),
    active: asBool(raw.active, true),
    ruleSetVersion: LIVE_VERSION,
    sourceBatchId: batchId,
  };
  const row = await tx.renewConditionalQuestion.upsert({
    where: {
      questionRuleId_ruleSetVersion: {
        questionRuleId,
        ruleSetVersion: LIVE_VERSION,
      },
    },
    update: data,
    create: data,
  });
  return row.id;
}

export function isTruthyImportFlag(value: unknown): boolean {
  return isTruthyBool(value);
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  answersMatchTrigger,
  classAliasMembers,
  emptyContextAnswer,
  emptyMonitoringResult,
  indicationMatches,
  ingredientAliasMatches,
  isYesNoContextQuestion,
  medicationIngredientKeys,
  medicationShortName,
  parseEnumDisplayOptions,
  shortestFreshness,
  strongerMissingAction,
  strongerRequirement,
  monitoringItemRemovable,
  resolveMonitoringPresentationTier,
  type RenewMedication,
  type RenewMedicationIndication,
  type RenewMonitoringInputDef,
  type RenewMonitoringRequirement,
  type RenewMonitoringSafetyState,
  type RenewPatientContextRequirement,
} from '@safescript/shared';

export type ResolvedMonitoring = {
  monitoring: RenewMonitoringRequirement[];
  context: RenewPatientContextRequirement[];
  uncoveredMedicationIds: string[];
  usedPublishedConfig: boolean;
};

type RuleRow = {
  ruleCode: string | null;
  matchType: string;
  ingredientKey: string | null;
  conditionCode: string | null;
  appliesToType: string | null;
  appliesToId: string | null;
  indicationId: string | null;
  inputType: string | null;
  requirementLevel: string;
  freshnessDays: number | null;
  actionIfMissing: string;
  triggerSourceCode: string | null;
  triggerValue: string | null;
  input: {
    code: string;
    label: string;
    inputType: string;
    valueShape: string;
    unit: string | null;
    aliases: string[];
    displayPriority: number;
    category: string | null;
    dataType: string | null;
    uiComponent: string | null;
    allowDate: boolean;
    allowNotAvailable: boolean;
    normalRangeDisplay: string | null;
  };
};

@Injectable()
export class RenewStep3ResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    items: RenewMedication[],
    mappings: RenewMedicationIndication[],
    state: RenewMonitoringSafetyState,
    indicationCodesByConditionId: Map<string, string[]>,
  ): Promise<ResolvedMonitoring> {
    const publishedCount = await this.prisma.renewMonitoringRule.count({
      where: { active: true, ruleCode: { not: null } },
    });
    const usedPublishedConfig = publishedCount > 0;
    const rules = await this.prisma.renewMonitoringRule.findMany({
      where: usedPublishedConfig
        ? { active: true, ruleCode: { not: null }, input: { active: true } }
        : { active: true, input: { active: true } },
      include: { input: true },
    });
    const questions = usedPublishedConfig
      ? await this.prisma.renewConditionalQuestion.findMany({ where: { active: true } })
      : [];

    const matched = new Map<
      string,
      {
        def: RenewMonitoringInputDef;
        medicationIds: Set<string>;
        requirement: string;
        freshnessDays: number | null;
        actionIfMissing: string;
        sourceRuleIds: string[];
      }
    >();
    const covered = new Set<string>();

    for (const med of items) {
      const keys = new Set(medicationIngredientKeys(med));
      const mapping = mappings.find((row) => row.medicationId === med.id);
      const indicationCodes = mapping?.conditionId
        ? indicationCodesByConditionId.get(mapping.conditionId) ?? []
        : mapping?.customIndicationText
          ? [mapping.customIndicationText]
          : [];
      let hit = false;
      for (const rule of rules) {
        if (!this.ruleMatches(rule, keys, indicationCodes)) continue;
        if (rule.triggerSourceCode && rule.input.inputType !== 'PATIENT_CONTEXT') {
          const answer = state.contextAnswers.find((row) => row.inputCode === rule.triggerSourceCode);
          if (!answersMatchTrigger(answer?.valueText, rule.triggerValue ?? 'YES')) continue;
        }
        hit = true;
        covered.add(med.id);
        const def = toInputDef(rule.input);
        const current = matched.get(def.code) ?? {
          def,
          medicationIds: new Set<string>(),
          requirement: rule.requirementLevel,
          freshnessDays: rule.freshnessDays,
          actionIfMissing: rule.actionIfMissing,
          sourceRuleIds: [],
        };
        current.medicationIds.add(med.id);
        current.requirement = strongerRequirement(current.requirement, rule.requirementLevel);
        current.freshnessDays = shortestFreshness(current.freshnessDays, rule.freshnessDays);
        current.actionIfMissing = strongerMissingAction(current.actionIfMissing, rule.actionIfMissing);
        if (rule.ruleCode) current.sourceRuleIds.push(rule.ruleCode);
        matched.set(def.code, current);
      }
      for (const question of questions) {
        if (!this.targetMatches(question.appliesToType, question.appliesToId, keys)) continue;
        if (!indicationMatches(question.indicationId, indicationCodes)) continue;
        hit = true;
        covered.add(med.id);
        const def = questionToInputDef(question);
        const current = matched.get(def.code) ?? {
          def,
          medicationIds: new Set<string>(),
          requirement: 'RELEVANT',
          freshnessDays: null,
          actionIfMissing: question.actionOnTrigger,
          sourceRuleIds: [],
        };
        current.medicationIds.add(med.id);
        current.sourceRuleIds.push(question.questionRuleId);
        matched.set(def.code, current);
      }
      if (!hit) {
        // keep uncovered
      }
    }

    const monitoring: RenewMonitoringRequirement[] = [];
    const context: RenewPatientContextRequirement[] = [];
    const nextState = state;
    const sorted = [...matched.values()].sort(
      (a, b) => a.def.displayPriority - b.def.displayPriority || a.def.label.localeCompare(b.def.label),
    );

    for (const row of sorted) {
      const medicationIds = [...row.medicationIds];
      const medicationNames = medicationIds
        .map((id) => items.find((med) => med.id === id))
        .filter((med): med is RenewMedication => Boolean(med))
        .map(medicationShortName);
      const isContext = row.def.inputType === 'PATIENT_CONTEXT';
      if (isContext) {
        const saved =
          nextState.contextAnswers.find((a) => a.inputCode === row.def.code) ?? emptyContextAnswer(row.def.code);
        if (!nextState.contextAnswers.some((a) => a.inputCode === row.def.code)) {
          nextState.contextAnswers.push(saved);
        }
        const question = questions.find((q) => q.questionCode === row.def.code);
        context.push({
          inputCode: row.def.code,
          label: row.def.label,
          valueShape: row.def.valueShape,
          unit: row.def.unit,
          medicationIds,
          medicationNames,
          trigger: question
            ? { sourceCode: row.def.code, operator: 'EQ', value: question.triggerAnswer }
            : null,
          visible: true,
          answer: saved,
          uiComponent: row.def.uiComponent ?? null,
          enumOptions: parseEnumDisplayOptions(row.def.normalRangeDisplay),
          actionOnTrigger: question?.actionOnTrigger ?? null,
          followupPrompt: question?.followupPrompt ?? null,
          allowNotAvailable: row.def.allowNotAvailable ?? true,
          triggerAnswer: question?.triggerAnswer ?? null,
          stableAnswer: stableAnswerFromTrigger(question?.triggerAnswer),
          bulkApplyAllowed:
            isYesNoContextQuestion({
              inputCode: row.def.code,
              valueShape: row.def.valueShape,
              enumOptions: parseEnumDisplayOptions(row.def.normalRangeDisplay),
              uiComponent: row.def.uiComponent,
            }) && stableAnswerFromTrigger(question?.triggerAnswer) != null,
          removable: true,
        });
      } else {
        const saved =
          nextState.results.find((r) => r.inputCode === row.def.code) ?? emptyMonitoringResult(row.def.code);
        if (!nextState.results.some((r) => r.inputCode === row.def.code)) nextState.results.push(saved);
        const extra = new Set(state.extraMonitoringCodes ?? []);
        const addedManually = extra.has(row.def.code);
        const presentationTier = resolveMonitoringPresentationTier({
          inputCode: row.def.code,
          requirement: row.requirement,
          addedManually,
          triggerSatisfied: true,
        });
        const removal = monitoringItemRemovable({
          requirement: row.requirement,
          actionIfMissing: row.actionIfMissing,
        });
        monitoring.push({
          inputCode: row.def.code,
          label: row.def.label,
          inputType: row.def.inputType as RenewMonitoringRequirement['inputType'],
          valueShape: row.def.valueShape,
          unit: row.def.unit,
          medicationIds,
          medicationNames,
          result: saved,
          requirement: row.requirement,
          freshnessDays: row.freshnessDays,
          actionIfMissing: row.actionIfMissing,
          sourceRuleIds: row.sourceRuleIds,
          allowDate: row.def.allowDate ?? true,
          allowNotAvailable: row.def.allowNotAvailable ?? true,
          normalRangeDisplay: row.def.normalRangeDisplay ?? null,
          presentationTier,
          removable: removal.removable,
          overrideRequiresReason: removal.overrideRequiresReason,
          addedManually,
        });
      }
    }

    return {
      monitoring,
      context,
      uncoveredMedicationIds: items.filter((med) => !covered.has(med.id)).map((med) => med.id),
      usedPublishedConfig,
    };
  }

  workflowFindings(
    context: RenewPatientContextRequirement[],
  ): Array<{ key: string; summary: string; detail: string; clinicalSeverity: string; recommendedAction: string; inputCode: string }> {
    const findings = [];
    for (const row of context) {
      if (!row.actionOnTrigger || !row.trigger) continue;
      if (!answersMatchTrigger(row.answer.valueText, row.trigger.value)) continue;
      const severity = row.actionOnTrigger === 'BLOCK' || row.actionOnTrigger === 'REFER' ? 'AVOID' : 'REVIEW_REQUIRED';
      findings.push({
        key: `workflow:${row.inputCode}`,
        summary: row.label,
        detail: row.followupPrompt || 'Document the concern and the action taken before continuing.',
        clinicalSeverity: severity,
        recommendedAction: row.actionOnTrigger,
        inputCode: row.inputCode,
      });
    }
    return findings;
  }

  private ruleMatches(rule: RuleRow, medKeys: Set<string>, indicationCodes: string[]): boolean {
    const indicationId = rule.indicationId ?? rule.conditionCode ?? 'ANY';
    if (!indicationMatches(indicationId, indicationCodes)) return false;
    const type = (rule.appliesToType || (rule.matchType === 'class' ? 'CLASS' : 'INGREDIENT')).toUpperCase();
    const target = rule.appliesToId || rule.ingredientKey;
    if (rule.matchType === 'condition' && rule.conditionCode) {
      return indicationMatches(rule.conditionCode, indicationCodes);
    }
    return this.targetMatches(type, target, medKeys);
  }

  private targetMatches(appliesToType: string, appliesToId: string | null | undefined, medKeys: Set<string>): boolean {
    if (!appliesToId) return false;
    if (appliesToType.toUpperCase() === 'CLASS') {
      return classAliasMembers(appliesToId).some((alias) => ingredientAliasMatches(alias, medKeys));
    }
    return ingredientAliasMatches(appliesToId, medKeys);
  }
}

function toInputDef(row: RuleRow['input']): RenewMonitoringInputDef & {
  uiComponent?: string | null;
  allowDate?: boolean;
  allowNotAvailable?: boolean;
  normalRangeDisplay?: string | null;
} {
  return {
    code: row.code,
    label: row.label,
    inputType: row.inputType as RenewMonitoringInputDef['inputType'],
    valueShape: row.valueShape as RenewMonitoringInputDef['valueShape'],
    unit: row.unit,
    aliases: row.aliases,
    displayPriority: row.displayPriority,
    uiComponent: row.uiComponent,
    allowDate: row.allowDate,
    allowNotAvailable: row.allowNotAvailable,
    normalRangeDisplay: row.normalRangeDisplay,
  };
}

function questionToInputDef(question: {
  questionCode: string;
  questionText: string;
}): RenewMonitoringInputDef & { uiComponent?: string | null; allowNotAvailable?: boolean } {
  return {
    code: question.questionCode,
    label: question.questionText,
    inputType: 'PATIENT_CONTEXT',
    valueShape: 'YES_NO',
    unit: null,
    aliases: [],
    displayPriority: 300,
    uiComponent: 'YES_NO',
    allowNotAvailable: true,
  };
}

function stableAnswerFromTrigger(trigger: string | null | undefined): 'YES' | 'NO' | 'UNKNOWN' | null {
  const value = (trigger ?? 'YES').trim().toUpperCase();
  if (value === 'YES') return 'NO';
  if (value === 'NO') return 'YES';
  if (value === 'UNKNOWN') return null;
  return 'NO';
}

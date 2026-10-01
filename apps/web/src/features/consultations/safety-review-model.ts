import {
  countSafetyReviewObligations,
  isAllergyFindingType,
  isMislabelledPregnancyAsAllergy,
  isVisibleSafetyReviewItem,
  ruleCodeTargetsDifferentIngredient,
  type SafetyDrugReference,
  type SafetyReviewItem,
} from '@safescript/shared';
import type { TreatmentRecommendation } from './types';

function isMislabelledPregnancyAllergy(reason: string): boolean {
  return isMislabelledPregnancyAsAllergy(reason);
}

function legacyItemsFromTreatment(
  t: TreatmentRecommendation,
  patientPregnant: boolean,
): SafetyReviewItem[] {
  const items: SafetyReviewItem[] = [];

  if (
    (t.allergyBlocked || t.allergyWarning) &&
    isAllergyFindingType(t.allergyWarning?.safetySource?.findingType ?? 'allergy') &&
    !isMislabelledPregnancyAllergy(t.allergyWarning?.reason ?? '')
  ) {
    items.push({
      findingId: 'allergy',
      issueKey: `allergy:${t.allergyWarning?.patientAllergy ?? t.medicationName}`,
      safetyDomain: 'allergy',
      presentationKind: 'SIGNIFICANT_RISK',
      severity: t.allergyWarning?.severity ?? 'CRITICAL',
      title: 'Allergy',
      summary:
        t.allergyWarning?.reason?.trim() ||
        (t.allergyWarning?.patientAllergy
          ? `${t.allergyWarning.patientAllergy} allergy`
          : 'This medicine conflicts with a recorded allergy.'),
      requiresAcknowledgement: true,
      requiresRationale: true,
    });
  }

  if (t.pregnancyWarning?.active && (t.pregnancyWarning.safetySource || patientPregnant)) {
    const text = t.pregnancyWarning.message ?? '';
    const significant = /\bcontraindicat/.test(text.toLowerCase());
    items.push({
      findingId: 'pregnancy',
      issueKey: 'pregnancy',
      safetyDomain: 'pregnancy',
      presentationKind: significant ? 'SIGNIFICANT_RISK' : 'ROUTINE_CAUTION',
      severity: t.pregnancyWarning.safetySource?.severity ?? 'MODERATE',
      title: significant ? 'Pregnancy — avoid' : 'Pregnancy',
      summary: text,
      requiresAcknowledgement: true,
      requiresRationale: significant,
    });
  }

  if (t.renalWarning?.active && t.renalWarning.safetySource) {
    items.push({
      findingId: 'renal',
      issueKey: 'renal',
      safetyDomain: 'renal',
      presentationKind: 'ROUTINE_CAUTION',
      severity: t.renalWarning.safetySource.severity ?? 'MODERATE',
      title: 'Renal',
      summary: t.renalWarning.message,
      requiresAcknowledgement: true,
      requiresRationale: false,
    });
  }

  if (t.hepaticWarning?.active && t.hepaticWarning.safetySource) {
    items.push({
      findingId: 'hepatic',
      issueKey: 'hepatic',
      safetyDomain: 'hepatic',
      presentationKind: 'ROUTINE_CAUTION',
      severity: t.hepaticWarning.safetySource.severity ?? 'MODERATE',
      title: 'Hepatic',
      summary: t.hepaticWarning.message,
      requiresAcknowledgement: true,
      requiresRationale: false,
    });
  }

  const sources = t.interactionSafetySources ?? [];
  if (sources.length) {
    (t.interactions ?? []).forEach((text, i) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      const significant = /\bcontraindicat/.test(lower) || /\bavoid\b/.test(lower);
      if (/\bmonitor\b/.test(lower) && !significant) return;
      items.push({
        findingId: `interaction-${i}`,
        issueKey: `interaction:${trimmed.slice(0, 48)}`,
        safetyDomain: 'interaction',
        presentationKind: significant ? 'SIGNIFICANT_RISK' : 'ROUTINE_CAUTION',
        severity: sources[i]?.severity ?? 'MODERATE',
        title: significant ? 'Interaction — avoid' : 'Interaction',
        summary: trimmed,
        requiresAcknowledgement: true,
        requiresRationale: significant,
      });
    });
  }

  return items;
}

export function drugReferenceFromTreatment(t: TreatmentRecommendation): SafetyDrugReference {
  if (t.drugReference) {
    return {
      interactions: t.drugReference.interactions ?? [],
      renal: t.drugReference.renal,
      hepatic: t.drugReference.hepatic,
      monitoring: t.drugReference.monitoring,
      pregnancy: t.drugReference.pregnancy,
    };
  }

  const engineBackedInteractions = (t.interactionSafetySources ?? []).length > 0;
  return {
    interactions: engineBackedInteractions ? [] : (t.interactions ?? []).filter((s) => s.trim()),
    renal:
      t.renalWarning?.safetySource ? undefined : t.renalAdjustmentReason || t.renalWarning?.message,
    hepatic:
      t.hepaticWarning?.safetySource
        ? undefined
        : t.hepaticAdjustmentReason || t.hepaticWarning?.message,
    monitoring: t.monitoringReason || t.monitoringWarning?.message,
    pregnancy: t.pregnancyWarning?.safetySource ? undefined : t.pregnancyReason,
  };
}

export function safetyReviewItemsForOption(
  option: { treatment: TreatmentRecommendation },
  patientPregnant = false,
  patientHasAllergies = true,
): SafetyReviewItem[] {
  const t = option.treatment;
  const medName = t.medicationName ?? '';
  const genericName = t.genericName;
  const dropUnrelated = (item: SafetyReviewItem) =>
    !ruleCodeTargetsDifferentIngredient(item.ruleCode, medName, genericName);

  if (t.safetyReviewItems) {
    return t.safetyReviewItems
      .filter(isVisibleSafetyReviewItem)
      .filter(dropUnrelated)
      .filter((item) => {
        if (item.safetyDomain !== 'allergy') return true;
        if (!patientHasAllergies) return false;
        if (isMislabelledPregnancyAsAllergy(item.summary)) return false;
        return true;
      });
  }
  return legacyItemsFromTreatment(t, patientPregnant)
    .filter(isVisibleSafetyReviewItem)
    .filter(dropUnrelated);
}

export function countSafetyReviewItems(
  option: { treatment: TreatmentRecommendation },
  patientPregnant = false,
  patientHasAllergies = true,
): number {
  return countSafetyReviewObligations(
    safetyReviewItemsForOption(option, patientPregnant, patientHasAllergies),
  );
}

export function hasDrugReference(ref: SafetyDrugReference): boolean {
  return Boolean(
    ref.interactions.length ||
      ref.renal?.trim() ||
      ref.hepatic?.trim() ||
      ref.monitoring?.trim() ||
      ref.pregnancy?.trim(),
  );
}

import { createHash } from 'crypto';
import {
  containsIngredient,
  findingsApplyToProduct,
  splitAllergyInputs,
} from '@/modules/medication-safety/utils/drug-name.util';
import {
  describeSafetyFindingSource,
  isAllergyFindingType,
  isVisibleSafetyReviewItem,
  overlayTreatmentSafety,
  presentationKindForFinding,
  safetyDomainFromRuleDomain,
  safetyReviewTitle,
  sanitizeTreatmentSafety,
  isAcetaminophenOnlyProduct,
  isNsaidClassPregnancyRule,
  type SafetyDrugReference,
  type SafetyEngineSource,
  type SafetyFinding,
  type SafetyReviewItem,
} from '@safescript/shared';
import type { TreatmentSafetyStatus } from '@safescript/shared';

export type MappedSafetyTier = 'PREFERRED' | 'CAUTION' | 'REVIEW_REQUIRED' | 'AVOID';

export interface MappedMedicationSafety {
  status: TreatmentSafetyStatus;
  safetyTier: MappedSafetyTier;
  allergyBlocked: boolean;
  allergyWarning?: {
    patientAllergy: string;
    prescribedDrug: string;
    matchedDrugClass: string;
    parentClass: string;
    therapeuticGroup: string;
    matchType: string;
    risk: string;
    reason: string;
    severity: string;
    safetySource?: SafetyEngineSource;
  };
  renalWarning?: { active: boolean; message: string; safetySource?: SafetyEngineSource };
  hepaticWarning?: { active: boolean; message: string; safetySource?: SafetyEngineSource };
  pregnancyWarning?: { active: boolean; message: string; safetySource?: SafetyEngineSource };
  interactions: string[];
  interactionSafetySources: SafetyEngineSource[];
  safetySources: SafetyEngineSource[];
  safetyReviewItems: SafetyReviewItem[];
  safetyEngineMeta?: { knowledgeRelease?: string | null; engineVersion?: string | null };
}

function findingAppliesToMedication(
  finding: {
    implicatedProductName?: string;
    subjectMedicationId?: string;
    detail?: string;
    summary?: string;
    ruleCode?: string;
    findingType?: string;
  },
  medicationName: string,
  genericName?: string,
): boolean {
  if (
    isNsaidClassPregnancyRule(finding.ruleCode) &&
    isAcetaminophenOnlyProduct(medicationName, genericName)
  ) {
    return false;
  }
  const implicated = finding.implicatedProductName?.trim() || finding.subjectMedicationId?.trim();
  if (implicated) {
    return findingsApplyToProduct(implicated, medicationName, genericName);
  }
  // Do not broadcast findings that never recorded a product subject.
  return false;
}

function issueKeyFor(finding: SafetyFinding): string {
  const code = finding.ruleCode?.trim();
  if (code) return `${finding.findingType}:${code}`;
  return `${finding.findingType}:${(finding.detail ?? finding.summary).slice(0, 80)}`;
}

function toReviewItem(finding: SafetyFinding, index: number): SafetyReviewItem {
  const kind = presentationKindForFinding(finding);
  const domain = safetyDomainFromRuleDomain(finding.ruleDomain, finding.findingType);
  const hepatic =
    finding.findingType === 'drug_disease' &&
    /hepatic|liver\s+impair/i.test(`${finding.detail ?? ''} ${finding.summary ?? ''}`);
  const safetyDomain = hepatic ? 'hepatic' : domain;
  return {
    findingId: `${finding.ruleCode ?? finding.findingType}-${index}`,
    issueKey: issueKeyFor(finding),
    safetyDomain,
    presentationKind: kind,
    severity: finding.clinicalSeverity,
    title: safetyReviewTitle(safetyDomain, kind),
    summary: finding.detail || finding.summary,
    requiresAcknowledgement: kind !== 'REFERENCE',
    requiresRationale: kind === 'SIGNIFICANT_RISK',
    ruleCode: finding.ruleCode,
  };
}

/** Same pathway mapping used by recommendTreatment, for a single candidate medication. */
export function mapSafetyEvalToMedication(opts: {
  medicationName: string;
  genericName?: string;
  findings: SafetyFinding[];
  patientAllergies: string[];
  knowledgeRelease?: string | null;
  engineVersion?: string | null;
}): MappedMedicationSafety {
  const medName = opts.medicationName;
  const genericName = opts.genericName ?? '';
  const findingsForMed = opts.findings.filter((f) =>
    findingAppliesToMedication(f, medName, genericName),
  );

  const recordedAllergies = splitAllergyInputs(opts.patientAllergies);
  const allergyFinding = findingsForMed.find((f) => isAllergyFindingType(f.findingType));

  let allergyWarning: MappedMedicationSafety['allergyWarning'];
  // MX-12: never emit an allergy finding when the patient has no recorded allergies.
  if (recordedAllergies.length > 0) {
    if (allergyFinding) {
      const allergyHint =
        recordedAllergies.find(
          (a) =>
            containsIngredient(allergyFinding.summary, a) ||
            containsIngredient(allergyFinding.detail, a) ||
            containsIngredient(medName, a) ||
            containsIngredient(genericName, a),
        ) ?? '';
      if (allergyHint) {
        allergyWarning = {
          patientAllergy: allergyHint,
          prescribedDrug: medName,
          matchedDrugClass: allergyFinding.relationshipType ?? '',
          parentClass: '',
          therapeuticGroup: '',
          matchType: allergyFinding.matchType ?? 'ingredient',
          risk: allergyFinding.clinicalSeverity,
          reason: allergyFinding.detail,
          severity: allergyFinding.clinicalSeverity,
          safetySource: describeSafetyFindingSource(allergyFinding),
        };
      }
    } else {
      for (const allergy of recordedAllergies) {
        const hit = [medName, genericName].filter(Boolean).some((name) =>
          containsIngredient(name, allergy),
        );
        if (!hit) continue;
        const reason = `Patient has a recorded allergy to ${allergy}.`;
        allergyWarning = {
          patientAllergy: allergy,
          prescribedDrug: medName,
          matchedDrugClass: allergy,
          parentClass: '',
          therapeuticGroup: '',
          matchType: 'ingredient',
          risk: 'CRITICAL',
          reason,
          severity: 'CRITICAL',
          safetySource: describeSafetyFindingSource({
            findingType: 'allergy',
            matchType: 'exact_ingredient',
            clinicalSeverity: 'CRITICAL',
            detail: reason,
          }),
        };
        break;
      }
    }
  }

  const renalFindings = findingsForMed.filter(
    (f) => f.findingType === 'renal_band' || f.findingType === 'renal_lab',
  );
  const pregnancyFinding = findingsForMed.find(
    (f) => f.findingType === 'pregnancy' || f.findingType === 'lactation',
  );
  const hepaticFinding = findingsForMed.find(
    (f) =>
      f.findingType === 'drug_disease' &&
      /hepatic|liver\s+impair/i.test(`${f.detail ?? ''} ${f.summary ?? ''}`),
  );
  const interactionFindings = findingsForMed.filter((f) => f.findingType === 'drug_interaction');

  const safetySources: SafetyEngineSource[] = [];
  const push = (s?: SafetyEngineSource) => {
    if (!s) return;
    const key = `${s.findingType}|${s.ruleCode ?? ''}|${s.workbook}`;
    if (!safetySources.some((x) => `${x.findingType}|${x.ruleCode ?? ''}|${x.workbook}` === key)) {
      safetySources.push(s);
    }
  };
  if (allergyWarning?.safetySource) push(allergyWarning.safetySource);
  for (const f of findingsForMed) push(describeSafetyFindingSource(f));

  const renalWarning = renalFindings.length
    ? {
        active: true,
        message: (
          renalFindings.find(
            (f) => f.clinicalSeverity === 'CRITICAL' || f.clinicalSeverity === 'HIGH',
          ) ?? renalFindings[0]
        ).detail,
        safetySource: describeSafetyFindingSource(
          renalFindings.find(
            (f) => f.clinicalSeverity === 'CRITICAL' || f.clinicalSeverity === 'HIGH',
          ) ?? renalFindings[0],
        ),
      }
    : undefined;

  const pregnancyWarning = pregnancyFinding
    ? {
        active: true,
        message: pregnancyFinding.detail,
        safetySource: describeSafetyFindingSource(pregnancyFinding),
      }
    : undefined;

  const hepaticWarning = hepaticFinding
    ? {
        active: true,
        message: hepaticFinding.detail,
        safetySource: describeSafetyFindingSource(hepaticFinding),
      }
    : undefined;

  const significantInteractions = interactionFindings.filter(
    (f) => presentationKindForFinding(f) !== 'REFERENCE',
  );

  const reviewItems = findingsForMed
    .filter((f) => !isAllergyFindingType(f.findingType) || Boolean(allergyWarning))
    .map((f, i) => toReviewItem(f, i));
  if (allergyWarning && !reviewItems.some((i) => i.safetyDomain === 'allergy')) {
    reviewItems.unshift({
      findingId: 'allergy-direct',
      issueKey: `allergy:${allergyWarning.patientAllergy}`,
      safetyDomain: 'allergy',
      presentationKind: 'SIGNIFICANT_RISK',
      severity: allergyWarning.severity,
      title: 'Allergy',
      summary: allergyWarning.reason,
      requiresAcknowledgement: true,
      requiresRationale: true,
    });
  }

  const visible = reviewItems.filter(isVisibleSafetyReviewItem);
  const hasAvoid = visible.some(
    (i) =>
      i.presentationKind === 'SIGNIFICANT_RISK' &&
      i.safetyDomain !== 'pregnancy' &&
      i.safetyDomain !== 'lactation',
  );
  const hasPregnancySignificant = visible.some(
    (i) => i.safetyDomain === 'pregnancy' && i.presentationKind === 'SIGNIFICANT_RISK',
  );
  const hasRoutine = visible.some(
    (i) =>
      i.presentationKind === 'ROUTINE_CAUTION' || i.presentationKind === 'REQUIRED_INFORMATION',
  );
  const renalHard = Boolean(
    renalWarning &&
      (renalWarning.safetySource?.severity === 'CRITICAL' ||
        renalWarning.safetySource?.severity === 'HIGH'),
  );

  const allergyBlocked = Boolean(allergyWarning);
  const safetyTier: MappedSafetyTier =
    allergyBlocked || hasAvoid
      ? 'AVOID'
      : renalHard || hasPregnancySignificant
        ? 'REVIEW_REQUIRED'
        : hasRoutine
          ? 'CAUTION'
          : 'PREFERRED';
  const status: TreatmentSafetyStatus =
    safetyTier === 'AVOID' ? 'AVOID' : safetyTier === 'PREFERRED' ? 'CLEAR' : 'REVIEW_REQUIRED';

  return {
    status,
    safetyTier,
    allergyBlocked,
    allergyWarning,
    renalWarning,
    hepaticWarning,
    pregnancyWarning,
    interactions: significantInteractions.map((f) => f.detail),
    interactionSafetySources: significantInteractions.map((f) =>
      describeSafetyFindingSource(f),
    ),
    safetySources,
    safetyReviewItems: reviewItems,
    safetyEngineMeta:
      safetySources.length > 0
        ? {
            knowledgeRelease: opts.knowledgeRelease ?? null,
            engineVersion: opts.engineVersion ?? null,
          }
        : undefined,
  };
}

/** Fields the UI/API persist as the current evaluation for one treatment row. */
export function safetyOverlayFromMapped(
  flags: MappedMedicationSafety,
  drugReference: SafetyDrugReference,
): Record<string, unknown> {
  return {
    allergyBlocked: flags.allergyBlocked,
    allergyWarning: flags.allergyWarning,
    renalWarning: flags.renalWarning,
    hepaticWarning: flags.hepaticWarning,
    pregnancyWarning: flags.pregnancyWarning,
    interactions: flags.interactions,
    interactionSafetySources: flags.interactionSafetySources,
    safetySources: flags.safetySources,
    safetyReviewItems: flags.safetyReviewItems,
    safetyStatus: flags.status,
    safetyTier: flags.safetyTier,
    drugReference,
    safetyEngineMeta: flags.safetyEngineMeta,
  };
}

export function applyMappedSafetyToTreatment(
  row: Record<string, unknown>,
  flags: MappedMedicationSafety,
  drugReference: SafetyDrugReference,
  patientHasRecordedAllergies: boolean,
): Record<string, unknown> {
  return sanitizeTreatmentSafety(
    overlayTreatmentSafety(row, safetyOverlayFromMapped(flags, drugReference)),
    { patientHasRecordedAllergies },
  );
}

export function pathwayDrugReference(input: {
  interactions?: string[] | null;
  renal?: string | null;
  hepatic?: string | null;
  monitoring?: string | null;
  pregnancy?: string | null;
}): SafetyDrugReference {
  return {
    interactions: (input.interactions ?? []).map((s) => s.trim()).filter(Boolean),
    renal: input.renal?.trim() || undefined,
    hepatic: input.hepatic?.trim() || undefined,
    monitoring: input.monitoring?.trim() || undefined,
    pregnancy: input.pregnancy?.trim() || undefined,
  };
}

export function patientContextVersionFrom(
  consultation: { updatedAt?: Date; demographics?: unknown; aiEntities?: unknown },
  allergies: string[],
): string {
  const demographics = (consultation.demographics ?? {}) as Record<string, unknown>;
  const payload = JSON.stringify({
    updatedAt: consultation.updatedAt?.toISOString() ?? '',
    allergies,
    pregnancy: demographics.pregnancyStatus ?? demographics.pregnancyAnswer ?? '',
    labs: demographics.labValues ?? demographics.labEntries ?? '',
    conditions: demographics.medicalConditions ?? '',
    meds: demographics.currentMedications ?? demographics.medicationEntries ?? '',
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 24);
}

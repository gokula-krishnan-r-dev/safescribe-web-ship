/**
 * Defense-in-depth for treatment-card safety fields.
 *
 * The engine must attribute findings by medication instance and domain.
 * This layer repairs persisted / stale JSON that previously stored a
 * sibling-medication pregnancy finding as Allergy (Maxalt / ondansetron).
 *
 * Do not hide findings by searching for a drug name in the message text.
 */

import { isAllergyFindingType, type SafetyReviewItem } from './safety-presentation';

export const TREATMENT_SAFETY_OVERLAY_KEYS = [
  'allergyBlocked',
  'allergyWarning',
  'renalWarning',
  'hepaticWarning',
  'pregnancyWarning',
  'monitoringWarning',
  'interactions',
  'interactionSafetySources',
  'safetySources',
  'safetyReviewItems',
  'safetyStatus',
  'safetyTier',
  'drugReference',
  'safetyEngineMeta',
] as const;

export type TreatmentSafetyOverlayKey = (typeof TREATMENT_SAFETY_OVERLAY_KEYS)[number];

/** Ingredient tokens that appear in governed unary rule codes (SS-PREG-ONDANSETRON-…). */
const RULE_INGREDIENT =
  /(?:^|-)(ONDANSETRON|RIZATRIPTAN|SUMATRIPTAN|ZOLMITRIPTAN|ACETAMINOPHEN|IBUPROFEN|NAPROXEN|OSELTAMIVIR)(?:-|$)/i;

const NSAID_CLASS_PREGNANCY_RULE =
  /SYSTEMIC-NSAID|PREG-NSAID|NSAID-GA|BASELINE-PREG-NSAID/i;

const NSAID_INGREDIENT_IN_NAME =
  /ibuprofen|naproxen|diclofenac|ketorolac|indomethacin|meloxicam|celecoxib|ketoprofen|piroxicam|mefenamic|aspirin|acetylsalicylic|\basa\b|advil|motrin|nuprin|aleve|voltaren|celebrex/i;

const ACETAMINOPHEN_IN_NAME = /acetaminophen|paracetamol|tylenol|panadol/i;

export function isNsaidClassPregnancyRule(ruleCode: string | undefined): boolean {
  return NSAID_CLASS_PREGNANCY_RULE.test(ruleCode ?? '');
}

export function productContainsNsaidIngredient(
  medicationName: string,
  genericName?: string,
): boolean {
  return NSAID_INGREDIENT_IN_NAME.test(`${medicationName} ${genericName ?? ''}`);
}

/** Acetaminophen (or paracetamol) without an NSAID co-ingredient. */
export function isAcetaminophenOnlyProduct(
  medicationName: string,
  genericName?: string,
): boolean {
  const hay = `${medicationName} ${genericName ?? ''}`;
  return ACETAMINOPHEN_IN_NAME.test(hay) && !productContainsNsaidIngredient(medicationName, genericName);
}

export function isNkdaAllergyLabel(value: string | undefined | null): boolean {
  const n = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ');
  return (
    !n ||
    n === 'nkda' ||
    n === 'nka' ||
    n === 'none' ||
    n === 'nil' ||
    n.includes('no known allerg') ||
    n.includes('no known drug allerg')
  );
}

export function patientHasRecordedAllergies(input?: {
  allergies?: string | null;
  allergyEntries?: Array<{
    drug?: string | null;
    allergen?: string | null;
    label?: string | null;
    genericName?: string | null;
  } | null> | null;
  allergiesNone?: boolean;
} | null): boolean {
  if (!input || input.allergiesNone) return false;
  for (const entry of input.allergyEntries ?? []) {
    const drug = (
      entry?.drug ??
      entry?.allergen ??
      entry?.label ??
      entry?.genericName ??
      ''
    ).trim();
    if (drug && !isNkdaAllergyLabel(drug)) return true;
  }
  const raw = input.allergies?.trim() ?? '';
  if (!raw) return false;
  return raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => !isNkdaAllergyLabel(part));
}

export function treatmentSafetyMatchKey(t: {
  treatmentInstanceId?: string | null;
  pathwayTreatmentId?: string | null;
  drugId?: string | null;
  genericName?: string | null;
  medicationName?: string | null;
}): string {
  const instance = t.treatmentInstanceId?.trim();
  if (instance) return `instance:${instance}`;
  const pathway = t.pathwayTreatmentId?.trim();
  if (pathway) return `pathway:${pathway}`;
  const drug = t.drugId?.trim();
  if (drug) return `drug:${drug}`;
  const name = (t.genericName?.trim() || t.medicationName?.trim() || '').toLowerCase();
  return `name:${name}`;
}

export function isAgeGateWarning(warning?: {
  matchType?: string | null;
  safetySource?: { findingType?: string | null } | null;
} | null): boolean {
  const type = (warning?.safetySource?.findingType ?? '').trim().toLowerCase();
  const match = (warning?.matchType ?? '').trim().toLowerCase();
  return type === 'age_gate' || match === 'age_gate';
}

export function isMislabelledPregnancyAsAllergy(reason: string | undefined): boolean {
  const text = reason ?? '';
  return /pregnan/i.test(text) && !/\ballerg/i.test(text);
}

/**
 * True when a unary rule code names an ingredient that is not this product.
 * Uses the rule identity, not the displayed sentence (MX-01 / MX-19).
 */
export function ruleCodeTargetsDifferentIngredient(
  ruleCode: string | undefined,
  medicationName: string,
  genericName?: string,
): boolean {
  if (!ruleCode?.trim()) return false;
  if (
    isNsaidClassPregnancyRule(ruleCode) &&
    isAcetaminophenOnlyProduct(medicationName, genericName)
  ) {
    return true;
  }
  const match = ruleCode.toUpperCase().match(RULE_INGREDIENT);
  if (!match?.[1]) return false;
  const ingredient = match[1].toLowerCase();
  const hay = `${medicationName} ${genericName ?? ''}`.toLowerCase();
  return !hay.includes(ingredient);
}

type AllergyWarningLike = {
  reason?: string;
  patientAllergy?: string;
  prescribedDrug?: string;
  matchType?: string;
  safetySource?: { findingType?: string | null; ruleCode?: string | null } | null;
};

function warningFindingType(warning?: AllergyWarningLike | null): string {
  return (warning?.safetySource?.findingType ?? '').trim().toLowerCase();
}

export function allergyWarningIsValidPatientAllergy(
  warning: AllergyWarningLike | null | undefined,
  patientHasAllergies: boolean,
  medicationName = '',
  genericName?: string,
): boolean {
  if (!warning) return false;
  if (isAgeGateWarning(warning)) return false;
  if (!patientHasAllergies) return false;
  if (isMislabelledPregnancyAsAllergy(warning.reason)) return false;
  const type = warningFindingType(warning);
  if (type && !isAllergyFindingType(type)) return false;
  if (
    ruleCodeTargetsDifferentIngredient(
      warning.safetySource?.ruleCode ?? undefined,
      medicationName,
      genericName,
    )
  ) {
    return false;
  }
  return true;
}

function filterReviewItems(
  items: SafetyReviewItem[] | undefined,
  opts: {
    patientHasAllergies: boolean;
    medicationName: string;
    genericName?: string;
    keepValidAllergy: boolean;
  },
): SafetyReviewItem[] | undefined {
  if (!items) return items;
  return items.filter((item) => {
    if (
      ruleCodeTargetsDifferentIngredient(item.ruleCode, opts.medicationName, opts.genericName)
    ) {
      return false;
    }
    if (item.safetyDomain !== 'allergy') return true;
    if (!opts.keepValidAllergy) return false;
    if (isMislabelledPregnancyAsAllergy(item.summary)) return false;
    return true;
  });
}

function dropStaleAllergyOverride(
  row: Record<string, unknown>,
  keepAllergy: boolean,
): Record<string, unknown> {
  const override = row.clinicalOverride as
    | { source?: string; acknowledgedRisk?: boolean; reason?: string }
    | undefined;
  if (!override) return row;
  if (keepAllergy) return row;
  if ((override.source ?? '').toUpperCase() !== 'ALLERGY') return row;
  const next = { ...row };
  delete next.clinicalOverride;
  return next;
}

function recomputeTierAfterAllergyDrop(row: Record<string, unknown>): Record<string, unknown> {
  if (row.allergyBlocked) {
    return { ...row, safetyTier: 'AVOID', safetyStatus: 'AVOID' };
  }
  const items = Array.isArray(row.safetyReviewItems)
    ? (row.safetyReviewItems as SafetyReviewItem[])
    : [];
  const hasAvoid = items.some(
    (i) =>
      i.presentationKind === 'SIGNIFICANT_RISK' &&
      i.safetyDomain !== 'pregnancy' &&
      i.safetyDomain !== 'lactation',
  );
  const hasPregnancySignificant = items.some(
    (i) => i.safetyDomain === 'pregnancy' && i.presentationKind === 'SIGNIFICANT_RISK',
  );
  const hasPregnancyCaution = items.some((i) => i.safetyDomain === 'pregnancy');
  const pregnancy = row.pregnancyWarning as { active?: boolean } | undefined;
  const next: Record<string, unknown> = { ...row };
  if (hasAvoid) {
    next.safetyTier = 'AVOID';
    next.safetyStatus = 'AVOID';
    return next;
  }
  if (hasPregnancySignificant) {
    next.safetyTier = 'REVIEW_REQUIRED';
    next.safetyStatus = 'REVIEW_REQUIRED';
    return next;
  }
  if (hasPregnancyCaution || pregnancy?.active) {
    next.safetyTier = 'CAUTION';
    next.safetyStatus = 'REVIEW_REQUIRED';
    return next;
  }
  if (next.safetyTier === 'AVOID') {
    delete next.safetyTier;
    if (next.safetyStatus === 'AVOID') delete next.safetyStatus;
  }
  return next;
}

export function sanitizeTreatmentSafety<T extends Record<string, unknown>>(
  treatment: T,
  ctx: { patientHasRecordedAllergies: boolean },
): T {
  const medicationName = String(treatment.medicationName ?? '');
  const genericName = String(treatment.genericName ?? '');
  const warning = treatment.allergyWarning as AllergyWarningLike | undefined;
  const ageGate = isAgeGateWarning(warning);
  const validAllergy = allergyWarningIsValidPatientAllergy(
    warning,
    ctx.patientHasRecordedAllergies,
    medicationName,
    genericName,
  );

  let next: Record<string, unknown> = { ...treatment };

  if (ageGate) {
    next.allergyBlocked = true;
  } else if (!validAllergy) {
    delete next.allergyWarning;
    next.allergyBlocked = false;
  } else {
    next.allergyBlocked = true;
  }

  const items = filterReviewItems(next.safetyReviewItems as SafetyReviewItem[] | undefined, {
    patientHasAllergies: ctx.patientHasRecordedAllergies,
    medicationName,
    genericName,
    keepValidAllergy: validAllergy,
  });
  if (items) next.safetyReviewItems = items;

  next = dropStaleAllergyOverride(next, validAllergy || ageGate);
  next = recomputeTierAfterAllergyDrop(next);
  return next as T;
}

/**
 * Copy current evaluation safety onto pharmacist-edited prescription fields.
 * Missing overlay keys are deleted so stale allergy / renal flags cannot linger.
 */
export function overlayTreatmentSafety<T extends object>(
  saved: T,
  fresh: Record<string, unknown>,
): T {
  const next: Record<string, unknown> = {
    ...(saved as unknown as Record<string, unknown>),
  };
  for (const key of TREATMENT_SAFETY_OVERLAY_KEYS) {
    if (fresh[key] !== undefined) next[key] = fresh[key];
    else delete next[key];
  }
  return next as T;
}

export function overlaySafetyOntoSavedTreatments<T extends Record<string, unknown>>(
  saved: T[],
  incoming: T[],
): T[] {
  if (!saved.length) return incoming;
  if (!incoming.length) return saved;

  const incomingBySafetyKey = new Map(
    incoming.map((row) => [treatmentSafetyMatchKey(row), row] as const),
  );
  const used = new Set<string>();

  const merged = saved.map((row) => {
    const key = treatmentSafetyMatchKey(row);
    const fresh = incomingBySafetyKey.get(key);
    if (!fresh) return row;
    used.add(key);
    return overlayTreatmentSafety(row, fresh);
  });

  const extras = incoming.filter((row) => !used.has(treatmentSafetyMatchKey(row)));
  return extras.length ? [...merged, ...extras] : merged;
}

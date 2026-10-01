import type { TreatmentRecommendation, SafetyEngineSourceMeta } from './types';
import {
  overlaySafetyOntoSavedTreatments,
  buildSuggestedRegimenBundle,
  formatEligibility,
  formatMonitoringAndFollowUp,
  formatWhyRecommended,
  pharmacistFacingCopy,
  type SuggestedRegimenBundle,
} from '@safescript/shared';

/** Patient-specific safety tier — never inferred as confidence % */
export type SafetyTier = 'PREFERRED' | 'CAUTION' | 'REVIEW_REQUIRED' | 'AVOID';

export type TreatmentType = 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | 'NON_DRUG';

export type TreatmentOrigin = 'PATHWAY' | 'PHARMACIST_ADDED';

export type SelectionMode = 'SINGLE' | 'MULTIPLE';

export type TreatmentRole = 'PRIMARY' | 'ALTERNATIVE' | 'ADJUNCT';

/** UI group for always-visible prescription panels */
export type PrescriptionGroupKey = 'PREFERRED' | 'CAUTION' | 'AVOID';

/** Prioritized Treatment Selection presentation groups (UI rendering only). */
export type TreatmentPresentationGroup =
  | 'RECOMMENDED'
  | 'OTHER_SUITABLE'
  | 'ADD_ON'
  | 'EXCLUDED';

export const MAX_RECOMMENDED_TREATMENTS = 3;

export interface TreatmentOptionView {
  /** Stable index into the treatments array */
  index: number;
  treatment: TreatmentRecommendation;
  treatmentType: TreatmentType;
  safetyTier: SafetyTier;
  origin: TreatmentOrigin;
  role: TreatmentRole;
  selectionMode: SelectionMode;
  selectionGroupId: string;
  selectable: boolean;
  /** True when AVOID / review-required caution was unlocked via documented clinical override */
  clinicallyOverridden: boolean;
  requiresAcknowledgement: boolean;
  displayName: string;
  /** Dose · frequency · duration line (collapsed row) */
  regimenSummary: string;
  regimen: SuggestedRegimenBundle;
  whyRecommended: string;
  eligibility: string;
  monitoringAndFollowUp: string;
  /** Patient-specific safety reason visible without expanding */
  patientSpecificReason?: string;
  avoidReason?: string;
  /** Collapsed-row Safety Engine source chips (Excel + engine type) */
  safetySources: SafetyEngineSourceMeta[];
  badgeLabel: string;
  /** Pathway display order / priority for stable sort */
  displayOrder: number;
  /** One-line pharmacist explanation — derived from pathway/safety fields, not ranked in the browser. */
  whyShown: string;
}

/** Regular Rx / OTC / supplement cards — not devices, compounds, or non-drug. */
export function supportsInlinePrescriptionEditor(option: TreatmentOptionView): boolean {
  const kind = option.treatment.treatmentKind;
  if (kind === 'DEVICE' || kind === 'CUSTOM_COMPOUND') return false;
  return option.treatmentType !== 'NON_DRUG';
}

const TIER_RANK: Record<SafetyTier, number> = {
  PREFERRED: 0,
  CAUTION: 1,
  REVIEW_REQUIRED: 2,
  AVOID: 3,
};

/** Active consultation-scoped override that unlocks an otherwise blocked option. */
export function hasClinicalOverride(t: TreatmentRecommendation): boolean {
  if (!t.clinicalOverride?.acknowledgedRisk || !t.clinicalOverride.reason?.trim()) {
    return false;
  }
  if (
    t.clinicalOverride.source === 'ALLERGY' &&
    !t.allergyBlocked &&
    !t.allergyWarning
  ) {
    return false;
  }
  return true;
}

/** Tiers that require a documented clinical override before selection. */
export function requiresClinicalOverride(tier: SafetyTier): boolean {
  return tier === 'AVOID' || tier === 'REVIEW_REQUIRED';
}

export function isPharmacistAdded(t: TreatmentRecommendation): boolean {
  return t.source === 'manual' || t.source === 'ccdd' || t.source === 'rxnorm' || t.source === 'openfda';
}

export function resolveTreatmentType(t: TreatmentRecommendation): TreatmentType {
  return t.category ?? 'PRESCRIPTION';
}

/**
 * Maps pathway + CDS flags into a safety tier.
 * Allergy / hard-stop blocks dominate. Pharmacist-added never becomes PREFERRED.
 * Prefer server-provided tier when present (future API); fall back to deterministic local mapping.
 */
export function resolveSafetyTier(t: TreatmentRecommendation): SafetyTier {
  const fromServer = (t as TreatmentRecommendation & { safetyTier?: SafetyTier }).safetyTier;
  if (fromServer === 'PREFERRED' ||
    fromServer === 'CAUTION' ||
    fromServer === 'REVIEW_REQUIRED' ||
    fromServer === 'AVOID'
  ) {
    if (
      fromServer === 'AVOID' &&
      t.allergyBlocked &&
      /pregnan/i.test(t.allergyWarning?.reason ?? '') &&
      !/\ballerg/i.test(t.allergyWarning?.reason ?? '')
    ) {
      // Mislabelled pregnancy stored as allergy/AVOID — do not trust the server tier.
    } else {
      return fromServer;
    }
  }

  if (t.allergyBlocked && !/pregnan/i.test(t.allergyWarning?.reason ?? '')) return 'AVOID';

  // Patient-specific engine matches only — pathway monograph flags are not a tier.
  if (t.renalWarning?.active && t.renalWarning.safetySource) {
    const sev = (t.renalWarning.safetySource.severity ?? '').toUpperCase();
    if (sev === 'CRITICAL' || sev === 'HIGH') return 'REVIEW_REQUIRED';
    return 'CAUTION';
  }
  if (t.pregnancyWarning?.active) return 'CAUTION';
  if (t.hepaticWarning?.active && t.hepaticWarning.safetySource) return 'CAUTION';
  if ((t.interactionSafetySources?.length ?? 0) > 0) {
    const avoid = (t.interactions ?? []).some((row) =>
      /\bcontraindicat|\bavoid\b/i.test(row),
    );
    return avoid ? 'AVOID' : 'CAUTION';
  }

  const ack = t.safetyAcknowledgment;
  if (ack && (ack.topSeverity === 'CRITICAL' || ack.topSeverity === 'HIGH')) {
    return 'CAUTION';
  }

  if (t.recommendationLevel === 'FIRST_LINE') return 'PREFERRED';
  if (
    t.recommendationLevel === 'SECOND_LINE' ||
    t.recommendationLevel === 'ALTERNATIVE' ||
    t.recommendationLevel === 'ADJUNCTIVE' ||
    t.recommendationLevel === 'SUPPORTIVE_CARE'
  ) {
    return 'CAUTION';
  }

  // Patient-specific CDS (allergy / renal / DDI) drives tier elevation above.

  return 'PREFERRED';
}

/**
 * Collapsed-row directions from the same structured regimen as Details.
 * Never invents once-daily / one-day fallbacks.
 */
export function formatRegimenSummary(t: TreatmentRecommendation): string {
  const bundle = buildSuggestedRegimenBundle(t);
  if (bundle.status === 'READY' && bundle.presentation.summaryPrimary) {
    return [
      bundle.presentation.summaryPrimary,
      bundle.presentation.summarySecondary,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  if (bundle.status === 'REVIEW_REQUIRED') {
    return bundle.presentation.expandedText || 'Regimen requires review';
  }
  if (t.treatmentKind === 'DEVICE') {
    const parts = [t.deviceType, t.sizeSpecification, t.useSchedule, t.instructions]
      .map((p) => p?.trim())
      .filter(Boolean);
    if (parts.length) return parts.slice(0, 2).join(' · ');
  }
  return '';
}

export function safetyBadgeLabel(
  tier: SafetyTier,
  overridden = false,
): string {
  if (overridden) return 'Overridden';
  if (tier === 'AVOID') return 'Avoid';
  if (tier === 'REVIEW_REQUIRED' || tier === 'CAUTION') return 'Review required';
  return 'Preferred';
}

/** Collapsed-row badge for the prioritized selection layout. */
export function presentationBadgeLabel(
  group: TreatmentPresentationGroup,
  option: TreatmentOptionView,
  isLeadRecommended: boolean,
): string {
  if (option.clinicallyOverridden) return 'Clinical judgment';
  if (group === 'EXCLUDED') {
    return option.safetyTier === 'AVOID' ? 'Avoid' : 'Not suitable';
  }
  if (group === 'RECOMMENDED' && isLeadRecommended && option.safetyTier === 'PREFERRED') {
    return 'Recommended';
  }
  if (option.safetyTier === 'REVIEW_REQUIRED') {
    return 'Review required';
  }
  if (option.safetyTier === 'CAUTION' && option.patientSpecificReason) {
    return 'Review required';
  }
  return 'Suitable';
}

/**
 * Pharmacist-facing "Why shown" copy from existing pathway/safety fields.
 * Does not invent ranking — it surfaces the reason already on the option.
 */
export function resolveWhyShown(
  t: TreatmentRecommendation,
  role: TreatmentRole,
  tier: SafetyTier,
  patientSpecificReason?: string,
): string {
  if (tier === 'AVOID' || tier === 'REVIEW_REQUIRED') {
    return patientSpecificReason?.trim() || 'Excluded based on patient-specific safety findings.';
  }
  if (tier === 'CAUTION' && patientSpecificReason?.trim()) {
    return patientSpecificReason.trim();
  }
  if (role === 'ADJUNCT') {
    if (t.recommendationLevel === 'SUPPORTIVE_CARE') return 'supportive treatment option';
    return 'add-on or adjunctive treatment';
  }
  if (t.recommendationLevel === 'FIRST_LINE' || tier === 'PREFERRED') {
    return 'pathway-preferred option';
  }
  if (t.recommendationLevel === 'SECOND_LINE') return 'second-line option';
  if (t.recommendationLevel === 'ALTERNATIVE') {
    return 'suitable alternative when clinically appropriate';
  }
  return 'suitable option for pharmacist review';
}

/** Visible safety rationale for the collapsed row (allergy, caution, avoid). */
export function resolvePatientSpecificReason(
  t: TreatmentRecommendation,
  tier: SafetyTier,
): string | undefined {
  if (t.allergyBlocked || t.allergyWarning) {
    if (/pregnan/i.test(t.allergyWarning?.reason ?? '') && !/\ballerg/i.test(t.allergyWarning?.reason ?? '')) {
      // Mislabelled pregnancy must not drive Avoid copy.
    } else {
      if (t.allergyWarning?.reason?.trim()) return t.allergyWarning.reason.trim();
      const allergy =
        t.allergyWarning?.patientAllergy?.trim() ||
        t.allergyWarning?.prescribedDrug?.trim();
      if (allergy) return `Recorded allergy: ${allergy}`;
      if (tier === 'AVOID') return 'Not suitable for this patient.';
    }
  }

  if (tier === 'AVOID') return 'Not suitable for this patient.';

  if (tier === 'CAUTION' || tier === 'REVIEW_REQUIRED') {
    if (t.pregnancyWarning?.active && t.pregnancyWarning.message?.trim()) {
      return t.pregnancyWarning.message.trim();
    }
    if (t.renalWarning?.active && t.renalWarning.safetySource && t.renalWarning.message?.trim()) {
      return t.renalWarning.message.trim();
    }
    if (t.hepaticWarning?.active && t.hepaticWarning.safetySource && t.hepaticWarning.message?.trim()) {
      return t.hepaticWarning.message.trim();
    }
    if ((t.interactionSafetySources?.length ?? 0) > 0) {
      const interaction = t.interactions?.find((c) => c?.trim());
      if (interaction) return `Interaction: ${interaction.trim()}`;
    }
    if (t.allergyWarning?.reason?.trim()) return t.allergyWarning.reason.trim();
  }

  return undefined;
}

/** Collect unique Safety Engine provenance entries for the treatment card. */
export function collectSafetySources(
  t: TreatmentRecommendation,
): SafetyEngineSourceMeta[] {
  const out: SafetyEngineSourceMeta[] = [];
  const push = (s?: SafetyEngineSourceMeta | null) => {
    if (!s?.engineType && !s?.workbook) return;
    const key = `${s.findingType}|${s.ruleCode ?? ''}|${s.workbook}`;
    if (out.some((x) => `${x.findingType}|${x.ruleCode ?? ''}|${x.workbook}` === key)) {
      return;
    }
    out.push(s);
  };

  for (const s of t.safetySources ?? []) push(s);
  push(t.allergyWarning?.safetySource);
  push(t.renalWarning?.safetySource);
  push(t.pregnancyWarning?.safetySource);
  for (const s of t.interactionSafetySources ?? []) push(s);

  return out;
}

export function toOptionView(
  treatment: TreatmentRecommendation,
  index: number,
): TreatmentOptionView {
  const treatmentType = resolveTreatmentType(treatment);
  const origin: TreatmentOrigin = isPharmacistAdded(treatment)
    ? 'PHARMACIST_ADDED'
    : 'PATHWAY';
  const safetyTier = resolveSafetyTier(treatment);
  const clinicallyOverridden = hasClinicalOverride(treatment);
  // AVOID / REVIEW_REQUIRED stay blocked unless pharmacist documents a clinical override.
  const selectable =
    clinicallyOverridden ||
    (safetyTier !== 'AVOID' && safetyTier !== 'REVIEW_REQUIRED');

  const role: TreatmentRole =
    treatment.recommendationLevel === 'ADJUNCTIVE' ||
    treatment.recommendationLevel === 'SUPPORTIVE_CARE' ||
    treatmentType === 'OTC' ||
    treatmentType === 'SUPPLEMENT'
      ? 'ADJUNCT'
      : treatment.recommendationLevel === 'ALTERNATIVE' ||
          treatment.recommendationLevel === 'SECOND_LINE'
        ? 'ALTERNATIVE'
        : 'PRIMARY';

  const selectionMode: SelectionMode = 'MULTIPLE';

  const selectionGroupId =
    treatmentType === 'PRESCRIPTION'
      ? 'PRESCRIPTION'
      : treatmentType === 'OTC'
        ? 'OTC_ADJUNCT'
        : treatmentType === 'SUPPLEMENT'
          ? 'SUPPLEMENT_ADJUNCT'
          : 'SUPPORTIVE';

  const patientSpecificReason = resolvePatientSpecificReason(
    treatment,
    safetyTier,
  );
  const avoidReason =
    safetyTier === 'AVOID' ? patientSpecificReason : undefined;
  const safetySources = collectSafetySources(treatment);
  const regimen = buildSuggestedRegimenBundle(treatment);
  const whyRecommended = pharmacistFacingCopy(
    patientSpecificReason && (safetyTier === 'AVOID' || safetyTier === 'REVIEW_REQUIRED')
      ? patientSpecificReason
      : formatWhyRecommended(treatment),
  );

  return {
    index,
    treatment,
    treatmentType,
    safetyTier,
    origin,
    role,
    selectionMode,
    selectionGroupId,
    selectable,
    clinicallyOverridden,
    requiresAcknowledgement:
      (safetyTier === 'CAUTION' || clinicallyOverridden) &&
      Boolean(
        treatment.allergyWarning ||
          clinicallyOverridden ||
          (treatment.interactions?.length ?? 0) > 0,
      ),
    displayName:
      treatment.treatmentKind === 'DEVICE' ||
      treatment.treatmentKind === 'CUSTOM_COMPOUND'
        ? treatment.medicationName.trim()
        : treatment.brandName?.trim() ||
          treatment.genericName?.trim() ||
          treatment.medicationName.trim(),
    regimenSummary:
      regimen.status === 'READY'
        ? [
            regimen.presentation.summaryPrimary,
            regimen.presentation.summarySecondary,
          ]
            .filter(Boolean)
            .join(' · ')
        : formatRegimenSummary(treatment),
    regimen,
    whyRecommended,
    eligibility: formatEligibility(treatment),
    monitoringAndFollowUp: formatMonitoringAndFollowUp(treatment),
    patientSpecificReason,
    avoidReason,
    safetySources,
    badgeLabel: safetyBadgeLabel(safetyTier, clinicallyOverridden),
    displayOrder: treatment.priority ?? index,
    whyShown: resolveWhyShown(
      treatment,
      role,
      safetyTier,
      patientSpecificReason,
    ),
  };
}

export function prescriptionGroupKey(tier: SafetyTier): PrescriptionGroupKey {
  if (tier === 'AVOID') return 'AVOID';
  if (tier === 'PREFERRED') return 'PREFERRED';
  return 'CAUTION';
}

export function sortOptionViews(a: TreatmentOptionView, b: TreatmentOptionView): number {
  const order = a.displayOrder - b.displayOrder;
  if (order !== 0) return order;
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
}

export function groupPrescriptionOptions(options: TreatmentOptionView[]) {
  const rx = options.filter((o) => o.treatmentType === 'PRESCRIPTION');
  const preferred = rx
    .filter((o) => prescriptionGroupKey(o.safetyTier) === 'PREFERRED')
    .sort(sortOptionViews);
  const caution = rx
    .filter((o) => prescriptionGroupKey(o.safetyTier) === 'CAUTION')
    .sort(sortOptionViews);
  const avoid = rx
    .filter((o) => prescriptionGroupKey(o.safetyTier) === 'AVOID')
    .sort(sortOptionViews);
  return { preferred, caution, avoid };
}

export interface TreatmentPresentationBuckets {
  recommended: TreatmentOptionView[];
  otherSuitable: TreatmentOptionView[];
  addOn: TreatmentOptionView[];
  excluded: TreatmentOptionView[];
  counts: {
    recommended: number;
    otherSuitable: number;
    addOn: number;
    excluded: number;
  };
}

function isExcludedOption(option: TreatmentOptionView): boolean {
  if (option.clinicallyOverridden) return false;
  return option.safetyTier === 'AVOID' || option.safetyTier === 'REVIEW_REQUIRED';
}

/** Supportive / adjunctive options that must not occupy the primary slot. */
export function isAdjunctLikeOption(option: TreatmentOptionView): boolean {
  return (
    option.role === 'ADJUNCT' ||
    option.treatmentType === 'OTC' ||
    option.treatmentType === 'SUPPLEMENT' ||
    option.treatmentType === 'NON_DRUG'
  );
}

/** One details panel at a time — Details never selects. */
export function nextExpandedTreatmentOptionId(
  currentId: string | null,
  toggledId: string,
): string | null {
  return currentId === toggledId ? null : toggledId;
}

/**
 * Unsaved prescription edits block switching the editor or primary selection.
 * Details is always read-only and must never trigger a discard prompt.
 */
export function blocksUnsavedTreatmentSwitch(input: {
  action: 'details' | 'edit' | 'select-other';
  editingKey: string | null;
  targetKey: string;
  dirtyKeys: ReadonlySet<string>;
}): boolean {
  if (input.action === 'details') return false;
  if (!input.editingKey || !input.dirtyKeys.has(input.editingKey)) return false;
  return input.targetKey !== input.editingKey;
}

/**
 * Confirm treatment plan stays disabled until every selected Rx/OTC treatment
 * has been explicitly saved and no prescription editor is open.
 */
export function confirmTreatmentPlanBlockedReason(input: {
  savingKey: string | null;
  editingKey: string | null;
  dirtyKeys: ReadonlySet<string>;
  selectedOptions: TreatmentOptionView[];
  savedTreatmentKeys: ReadonlySet<string>;
}): string | null {
  if (input.savingKey) {
    return 'Save treatment changes before confirming the plan.';
  }
  if (input.editingKey) {
    return 'Save or cancel the open prescription before confirming the plan.';
  }
  if (input.dirtyKeys.size > 0) {
    return 'Save treatment changes before confirming the plan.';
  }
  if (input.selectedOptions.length === 0) {
    return 'Select at least one treatment';
  }
  if (input.selectedOptions.some((o) => !o.selectable)) {
    return 'Document a clinical override or remove blocked treatments';
  }
  for (const o of input.selectedOptions) {
    if (o.treatmentType === 'NON_DRUG') continue;
    const dose =
      o.treatment.dose?.trim() || `${o.treatment.doseAmount ?? ''}`.trim();
    if (!dose || !o.treatment.frequency?.trim()) {
      return `Complete the dose and frequency for ${o.displayName}`;
    }
  }
  for (const o of input.selectedOptions) {
    if (!supportsInlinePrescriptionEditor(o)) continue;
    const key = optionKey(o);
    if (!input.savedTreatmentKeys.has(key)) {
      return `Save treatment for ${o.displayName} before confirming the plan.`;
    }
  }
  return null;
}

/** Selected treatments in on-screen order, for step-by-step pharmacist review. */
export function selectedTreatmentsInReviewOrder(
  orderedOptions: TreatmentOptionView[],
  selectedIndexes: Iterable<number>,
): TreatmentOptionView[] {
  const selected = new Set(selectedIndexes);
  return orderedOptions.filter((option) => selected.has(option.index));
}

/** Next selected treatment after the one currently being reviewed. */
export function nextSelectedTreatmentForReview(
  orderedOptions: TreatmentOptionView[],
  selectedIndexes: Iterable<number>,
  currentIndex: number,
): TreatmentOptionView | undefined {
  const queue = selectedTreatmentsInReviewOrder(orderedOptions, selectedIndexes);
  const currentPos = queue.findIndex((option) => option.index === currentIndex);
  if (currentPos < 0) return queue[0];
  return queue[currentPos + 1];
}

export function currentPrimaryOption(
  options: TreatmentOptionView[],
  selectedIndexes: Iterable<number>,
): TreatmentOptionView | undefined {
  const selected = new Set(selectedIndexes);
  return options.find((option) => selected.has(option.index) && !isAdjunctLikeOption(option));
}

/** Replace the primary selection while keeping add-ons. */
export function replacePrimarySelection(
  options: TreatmentOptionView[],
  selectedIndexes: Iterable<number>,
  nextPrimary: TreatmentOptionView,
): number[] {
  const next = new Set<number>();
  for (const idx of selectedIndexes) {
    const option = options.find((row) => row.index === idx);
    if (option && isAdjunctLikeOption(option)) next.add(idx);
  }
  next.add(nextPrimary.index);
  return [...next].sort((a, b) => a - b);
}

/**
 * Add or remove a primary treatment without dropping other primaries or add-ons.
 * Recommended / other suitable options are multi-select so the confirmed list
 * can carry every chosen treatment into Documents.
 */
function toggleSelectedIndex(
  selectedIndexes: Iterable<number>,
  index: number,
): number[] {
  const next = new Set(selectedIndexes);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return [...next].sort((a, b) => a - b);
}
export function togglePrimarySelection(
  selectedIndexes: Iterable<number>,
  option: TreatmentOptionView,
): number[] {
  return toggleSelectedIndex(selectedIndexes, option.index);
}

export function addAdjunctSelection(
  selectedIndexes: Iterable<number>,
  adjunct: TreatmentOptionView,
): number[] {
  const next = new Set(selectedIndexes);
  next.add(adjunct.index);
  return [...next].sort((a, b) => a - b);
}

/** Add or remove an add-on without touching the primary selection. */
export function toggleAdjunctSelection(
  selectedIndexes: Iterable<number>,
  adjunct: TreatmentOptionView,
): number[] {
  return toggleSelectedIndex(selectedIndexes, adjunct.index);
}

export function filterTreatmentOptions(
  options: TreatmentOptionView[],
  query: string,
): TreatmentOptionView[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => {
    const haystack = [
      option.displayName,
      option.treatment.medicationName,
      option.treatment.genericName,
      option.treatment.brandName,
      option.treatment.strength,
    ]
      .map((part) => part?.toLowerCase() ?? '')
      .join(' ');
    return haystack.includes(needle);
  });
}

/**
 * Present options in the prioritized Treatment Selection groups.
 * Ranking uses existing backend safety tier, recommendation level, role, and
 * displayOrder — the UI does not invent clinical suitability.
 *
 * At most {@link MAX_RECOMMENDED_TREATMENTS} selectable primaries appear
 * under Recommended, in existing displayOrder. Extra primaries move to
 * Other suitable; excluded options are never promoted to fill empty slots.
 */
export function presentTreatmentOptions(
  options: TreatmentOptionView[],
): TreatmentPresentationBuckets {
  const excluded: TreatmentOptionView[] = [];
  const addOn: TreatmentOptionView[] = [];
  const primaryPool: TreatmentOptionView[] = [];

  for (const option of options) {
    // Pathway non-drug measures are Patient Guidance, not selectable treatments.
    if (option.treatmentType === 'NON_DRUG') continue;
    if (isExcludedOption(option)) {
      excluded.push(option);
      continue;
    }
    if (isAdjunctLikeOption(option)) {
      addOn.push(option);
      continue;
    }
    primaryPool.push(option);
  }

  excluded.sort(sortOptionViews);
  addOn.sort(sortOptionViews);
  primaryPool.sort(sortOptionViews);

  const recommended: TreatmentOptionView[] = [];
  const otherSuitable: TreatmentOptionView[] = [];
  for (const option of primaryPool) {
    const canLead = option.selectable && recommended.length < MAX_RECOMMENDED_TREATMENTS;
    if (canLead) recommended.push(option);
    else otherSuitable.push(option);
  }

  return {
    recommended,
    otherSuitable,
    addOn,
    excluded,
    counts: {
      recommended: recommended.length,
      otherSuitable: otherSuitable.length,
      addOn: addOn.length,
      excluded: excluded.length,
    },
  };
}

export function isPrimarySelectableOption(option: TreatmentOptionView): boolean {
  return (
    option.selectable &&
    !isAdjunctLikeOption(option) &&
    !isExcludedOption(option)
  );
}

export function sortAccordionOptions(options: TreatmentOptionView[]) {
  return [...options].sort((a, b) => {
    const tr = TIER_RANK[a.safetyTier] - TIER_RANK[b.safetyTier];
    if (tr !== 0) return tr;
    return sortOptionViews(a, b);
  });
}

export function optionKey(option: TreatmentOptionView): string {
  return (
    option.treatment.treatmentInstanceId ||
    option.treatment.pathwayTreatmentId ||
    option.treatment.drugId ||
    `${option.displayName}-${option.index}`
  );
}

export function treatmentOptionDomId(key: string): string {
  return `treatment-option-${key}`;
}

/** Supportive (accordion) categories shown after prescription groups. */
export type SupportiveTreatmentSection = 'OTC' | 'NON_DRUG' | 'SUPPLEMENT';

export const SUPPORTIVE_SECTION_ORDER: SupportiveTreatmentSection[] = [
  'OTC',
  'NON_DRUG',
  'SUPPLEMENT',
];

export function visibleSupportiveSections(
  counts: Record<SupportiveTreatmentSection, number>,
): SupportiveTreatmentSection[] {
  return SUPPORTIVE_SECTION_ORDER.filter((section) => counts[section] > 0);
}

export function nextSupportiveSection(
  from: SupportiveTreatmentSection | 'PRESCRIPTION',
  visible: SupportiveTreatmentSection[],
): SupportiveTreatmentSection | undefined {
  if (!visible.length) return undefined;
  if (from === 'PRESCRIPTION') return visible[0];
  const index = visible.indexOf(from);
  if (index < 0) return visible[0];
  return visible[index + 1];
}

/** Furthest selected section in clinical order, used to open the next accordion. */
export function lastSelectedSupportiveOrPrescription(
  options: TreatmentOptionView[],
  selectedIndexes: Set<number>,
  visible: SupportiveTreatmentSection[],
): SupportiveTreatmentSection | 'PRESCRIPTION' | undefined {
  const selected = options.filter(
    (o) => selectedIndexes.has(o.index) && o.selectable,
  );
  if (!selected.length) return undefined;

  let from: SupportiveTreatmentSection | 'PRESCRIPTION' | undefined;
  if (selected.some((o) => o.treatmentType === 'PRESCRIPTION')) {
    from = 'PRESCRIPTION';
  }
  for (const section of visible) {
    if (selected.some((o) => o.treatmentType === section)) {
      from = section;
    }
  }
  return from;
}

export function sectionForTreatmentType(
  type: TreatmentType,
): SupportiveTreatmentSection | 'PRESCRIPTION' | undefined {
  if (type === 'PRESCRIPTION') return 'PRESCRIPTION';
  if (type === 'OTC' || type === 'NON_DRUG' || type === 'SUPPLEMENT') return type;
  return undefined;
}

/** Stable identity for matching the same treatment across pathway reloads. */
export function treatmentIdentityKey(t: TreatmentRecommendation): string {
  const pathwayId = t.pathwayTreatmentId?.trim() || t.drugId?.trim() || '';
  const name = (t.genericName?.trim() || t.medicationName?.trim() || '').toLowerCase();
  const brand = (t.medicationName?.trim() || '').toLowerCase();
  const dose = (t.doseAmount?.trim() || t.dose?.trim() || '').toLowerCase();
  const freq = (t.frequency?.trim() || '').toLowerCase();
  const route = (t.route?.trim() || '').toLowerCase();
  const kind = t.treatmentKind || t.category || '';
  return [pathwayId, name, brand, dose, freq, route, kind].join('|');
}

/** Keep pharmacist selections/edits; overlay current safety from a fresh evaluation. */
export function mergeTreatmentOptionLists(
  saved: TreatmentRecommendation[],
  incoming: TreatmentRecommendation[],
): TreatmentRecommendation[] {
  if (!saved.length) return incoming;
  if (!incoming.length) return saved;
  return overlaySafetyOntoSavedTreatments(
    saved as unknown as Array<Record<string, unknown>>,
    incoming as unknown as Array<Record<string, unknown>>,
  ) as unknown as TreatmentRecommendation[];
}

export function remapSelectedIndexes(
  previous: TreatmentRecommendation[],
  previousSelected: Iterable<number>,
  next: TreatmentRecommendation[],
): number[] {
  const nextByKey = new Map(next.map((t, i) => [treatmentIdentityKey(t), i]));
  const out: number[] = [];
  for (const idx of previousSelected) {
    const t = previous[idx];
    if (!t) continue;
    const mapped = nextByKey.get(treatmentIdentityKey(t));
    if (mapped != null) out.push(mapped);
  }
  return out;
}

export function canContinueWithSelection(
  options: TreatmentOptionView[],
  selectedIndexes: Set<number>,
): { ok: boolean; reason?: string } {
  if (selectedIndexes.size === 0) {
    return { ok: false, reason: 'TREATMENT_REQUIRED' };
  }
  let hasSelectable = false;
  for (const idx of selectedIndexes) {
    const opt = options.find((o) => o.index === idx);
    if (!opt) continue;
    if (!opt.selectable) {
      return { ok: false, reason: 'UNSAFE_SELECTION' };
    }
    hasSelectable = true;
  }
  if (!hasSelectable) {
    return { ok: false, reason: 'TREATMENT_REQUIRED' };
  }
  return { ok: true };
}

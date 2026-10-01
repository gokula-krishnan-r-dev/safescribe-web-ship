import {
  formatRenalRangeLabel,
  getApplicableRule,
  parseRenalDosingRulesJson,
  selectLatestLabValues,
  type RenalDosingBasis,
  type RenalDosingRule,
} from '@safescript/shared';

export type RenalBasis = 'CrCl' | 'eGFR';

export type RenalSafetyState =
  | 'NOT_APPLICABLE'
  | 'ADJUSTMENT_RECOMMENDED'
  | 'APPLIED'
  | 'MODIFIED'
  | 'PRODUCT_REQUIRED'
  | 'RENAL_VALUE_REQUIRED'
  | 'NO_STRUCTURED_RULE';

export type RegimenSource = 'STANDARD' | 'RENAL_ADJUSTED' | 'PHARMACIST_MODIFIED';

export interface PatientRenalMetric {
  basis: RenalBasis;
  value: number;
  unit: string;
  displayValue: string;
}

export interface RenalDosingTier {
  label: string;
  min: number | null;
  max: number | null;
  maxExclusive: boolean;
  regimen: string;
  hemodialysis: boolean;
}

export interface RenalApplyProposal {
  recommendedMg: number | null;
  tabletCount: number | null;
  recommendedRegimen: string;
  productMismatch: boolean;
  currentProductLabel: string;
  frequency?: string;
  duration?: number;
  durationUnit?: 'Days' | 'Weeks' | 'Months';
  directions?: string;
}

export interface RenalClinicalSource {
  shortLabel: string;
  fullReference: string;
  url?: string | null;
}

export interface RenalSafetyView {
  matched: boolean;
  state: RenalSafetyState;
  basis?: RenalBasis;
  patient?: PatientRenalMetric;
  standardRegimenSummary: string;
  recommendedRegimenSummary?: string;
  humanReadableConfiguration?: string;
  tiers: RenalDosingTier[];
  applicableTier?: RenalDosingTier;
  applicableRule?: RenalDosingRule;
  apply?: RenalApplyProposal;
  disableApplyReason?: string;
  clinicalSource?: RenalClinicalSource;
}

export interface RenalSafetySource {
  renalAdjustmentRequired?: boolean;
  renalAdjustmentReason?: string | null;
  renalDosingBasis?: RenalDosingBasis | string | null;
  renalDosingRules?: unknown;
  renalWarningActive?: boolean;
  renalWarningMessage?: string | null;
  regimenSource?: RegimenSource | null;
  standardRegimenSummary: string;
  productStrength?: string | null;
  productLabel?: string | null;
  labsText?: string | null;
  extractedLabs?: Array<{
    test?: string | null;
    value?: string | null;
    unit?: string | null;
    observedDate?: string | null;
  }>;
  guidelineReference?: string | null;
}

const CRCL = /\bcrcl\b|\bcreatinine\s+clearance\b|\bcrcl\b/i;
const EGFR = /\begfr\b|\bestimated\s+gfr\b/i;

function compact(text: string | null | undefined): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function deriveShortReference(full?: string | null): string {
  const text = compact(full);
  if (!text) return '';
  const first = compact(text.split(';')[0] ?? text);
  const pathway = first.match(/([^,/]*pathway[^,/]*)/i);
  if (pathway) {
    const name = compact(pathway[1]);
    if (/alberta/i.test(first) && !/alberta/i.test(name)) {
      return `Alberta ${name}`;
    }
    return name;
  }
  const parts = first.split(',').map((part) => compact(part)).filter(Boolean);
  return parts[parts.length - 1] || first;
}

function extractReferenceUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

export function resolveClinicalSource(
  guidelineReference?: string | null,
): RenalClinicalSource | undefined {
  const fullReference = compact(guidelineReference);
  if (!fullReference) return undefined;
  return {
    shortLabel: deriveShortReference(fullReference) || fullReference,
    fullReference,
    url: extractReferenceUrl(fullReference),
  };
}

function parseNumber(raw: string | null | undefined): number | null {
  const n = Number(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function toMilligrams(value: number, unit: string): number | null {
  const u = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (u === 'mg' || u === 'milligram' || u === 'milligrams') return value;
  if (u === 'g' || u === 'gram' || u === 'grams') return value * 1000;
  if (u === 'mcg' || u === 'µg' || u === 'ug') return value / 1000;
  return null;
}

export function parseMassAmount(raw: string | null | undefined): { value: number; unit: string } | null {
  const text = compact(raw);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg|ug)\b/i);
  if (!match) return null;
  return { value: Number(match[1]), unit: match[2].toLowerCase() === 'g' ? 'g' : match[2] };
}

export function extractPatientRenalMetric(source: RenalSafetySource): PatientRenalMetric | undefined {
  const blobs: Array<{ test: string; value: string; unit?: string; observedDate?: string }> = [];
  for (const lab of source.extractedLabs ?? []) {
    if (lab.test?.trim() && lab.value?.trim()) {
      blobs.push({
        test: lab.test,
        value: String(lab.value),
        unit: lab.unit ?? undefined,
        observedDate: lab.observedDate ?? undefined,
      });
    }
  }
  const freeText = compact(source.labsText);
  if (freeText) {
    const re =
      /\b(e\s*GFR|eGFR|CrCl|creatinine clearance)\b[^\d]{0,12}(\d+(?:\.\d+)?)(?:\s*(mL\/min(?:\/1\.73\s*m²?)?))?/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(freeText))) {
      blobs.push({
        test: match[1],
        value: match[2],
        unit: match[3] || undefined,
      });
    }
  }

  const preferred: RenalBasis | undefined =
    source.renalDosingBasis === 'CrCl' || source.renalDosingBasis === 'eGFR'
      ? source.renalDosingBasis
      : CRCL.test(`${source.renalAdjustmentReason ?? ''} ${source.renalWarningMessage ?? ''}`)
        ? 'CrCl'
        : EGFR.test(`${source.renalAdjustmentReason ?? ''} ${source.renalWarningMessage ?? ''}`)
          ? 'eGFR'
          : undefined;

  const parsed = selectLatestLabValues(blobs)
    .map((lab) => {
      const basis: RenalBasis | undefined = CRCL.test(lab.test)
        ? 'CrCl'
        : EGFR.test(lab.test)
          ? 'eGFR'
          : undefined;
      const value = parseNumber(lab.value);
      if (!basis || value == null) return null;
      const unit =
        compact(lab.unit) ||
        (basis === 'eGFR' ? 'mL/min/1.73 m²' : 'mL/min');
      return { basis, value, unit, displayValue: String(value) } satisfies PatientRenalMetric;
    })
    .filter((row): row is PatientRenalMetric => Boolean(row));

  if (!parsed.length) return undefined;
  if (preferred) {
    const match = parsed.find((row) => row.basis === preferred);
    if (match) return match;
    return parsed[0];
  }
  return parsed[0];
}

export function parseRenalDosingTiers(reason: string | null | undefined): RenalDosingTier[] {
  const lines = String(reason ?? '')
    .split(/\n+|•/)
    .flatMap((chunk) => chunk.split(/\s*;\s*(?=(?:CrCl|eGFR|Hemodialysis)\b)/i))
    .flatMap((chunk) =>
      chunk.split(
        /(?=(?:CrCl|eGFR)\s*(?:≥|>=|>|≤|<=|<)?\s*\d)|(?=Hemodialysis\s*:)/i,
      ),
    )
    .map((line) => compact(line))
    .filter(Boolean);

  const tiers: RenalDosingTier[] = [];
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    const head = colonIndex >= 0 ? compact(line.slice(0, colonIndex)) : line;
    const description = colonIndex >= 0 ? compact(line.slice(colonIndex + 1)) : '';

    if (/hemodialysis|haemodialysis|dialysis/i.test(head) && !/\d+\s*to/i.test(head)) {
      tiers.push({
        label: 'Hemodialysis',
        min: null,
        max: null,
        maxExclusive: false,
        regimen: description || line,
        hemodialysis: true,
      });
      continue;
    }

    const range = head.match(
      /\b(?:CrCl|eGFR)\s*(≥|>=|>|≤|<=|<)?\s*(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*<?\s*(\d+(?:\.\d+)?))?\s*(?:mL\/min(?:\/1\.73\s*m²?)?)?/i,
    );
    if (!range) continue;
    const op = range[1] ?? '';
    const a = Number(range[2]);
    const b = range[3] ? Number(range[3]) : null;
    const regimen = description;
    if (!regimen) continue;
    let min: number | null = a;
    let max: number | null = b;
    let maxExclusive = Boolean(range[3] && /to\s*</i.test(head));
    if (!b) {
      if (op === '>' || op === '≥' || op === '>=') {
        min = a;
        max = null;
        maxExclusive = false;
      } else if (op === '<' || op === '≤' || op === '<=') {
        min = null;
        max = a;
        maxExclusive = op === '<';
      }
    }
    tiers.push({
      label: head,
      min,
      max,
      maxExclusive,
      regimen,
      hemodialysis: false,
    });
  }
  const seen = new Set<string>();
  return tiers.filter((tier) => {
    const key = `${tier.label}|${tier.regimen}|${tier.min}|${tier.max}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchRenalTier(
  tiers: RenalDosingTier[],
  value: number | undefined,
): RenalDosingTier | undefined {
  if (value == null) return undefined;
  const matches = tiers.filter((tier) => {
    if (tier.hemodialysis) return false;
    if (tier.min != null && value < tier.min) return false;
    if (tier.max != null) {
      if (tier.maxExclusive ? value >= tier.max : value > tier.max) return false;
    }
    return tier.min != null || tier.max != null;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function buildRenalApplyProposal(input: {
  recommendedRegimen: string;
  productStrength?: string | null;
  productLabel?: string | null;
}): RenalApplyProposal {
  const mass = parseMassAmount(input.recommendedRegimen);
  const strength = parseMassAmount(input.productStrength);
  const recommendedMg = mass ? toMilligrams(mass.value, mass.unit) : null;
  const strengthMg = strength ? toMilligrams(strength.value, strength.unit) : null;
  let tabletCount: number | null = null;
  let productMismatch = false;
  if (recommendedMg != null && strengthMg && strengthMg > 0) {
    const count = recommendedMg / strengthMg;
    if (Number.isInteger(count) && count > 0) {
      tabletCount = count;
    } else {
      productMismatch = true;
    }
  }
  return {
    recommendedMg,
    tabletCount,
    recommendedRegimen: input.recommendedRegimen,
    productMismatch,
    currentProductLabel: compact(input.productLabel) || compact(input.productStrength) || 'Current product',
  };
}

function structuredRulesFrom(source: RenalSafetySource): RenalDosingRule[] {
  const parsed = parseRenalDosingRulesJson(source.renalDosingRules);
  return parsed.ok ? parsed.rules : [];
}

function preferredBasisFrom(source: RenalSafetySource): RenalBasis | undefined {
  if (source.renalDosingBasis === 'CrCl' || source.renalDosingBasis === 'eGFR') {
    return source.renalDosingBasis;
  }
  return CRCL.test(source.renalAdjustmentReason ?? '')
    ? 'CrCl'
    : EGFR.test(source.renalAdjustmentReason ?? '')
      ? 'eGFR'
      : undefined;
}

function tiersFromRules(rules: RenalDosingRule[], basis: RenalBasis): RenalDosingTier[] {
  return rules.map((rule) => ({
    label: formatRenalRangeLabel(rule, basis),
    min: rule.min,
    max: rule.max,
    maxExclusive: rule.max != null && !rule.maxInclusive,
    regimen: rule.directions,
    hemodialysis: false,
  }));
}

function applyFromRule(
  rule: RenalDosingRule,
  productStrength?: string | null,
  productLabel?: string | null,
): RenalApplyProposal {
  const recommendedMg = toMilligrams(rule.doseAmount, rule.doseUnit);
  const strength = parseMassAmount(productStrength);
  const strengthMg = strength ? toMilligrams(strength.value, strength.unit) : null;
  let tabletCount: number | null = null;
  let productMismatch = false;
  if (recommendedMg != null && strengthMg && strengthMg > 0) {
    const count = recommendedMg / strengthMg;
    if (Number.isInteger(count) && count > 0) {
      tabletCount = count;
    } else {
      productMismatch = true;
    }
  }
  return {
    recommendedMg,
    tabletCount,
    recommendedRegimen: rule.directions,
    productMismatch,
    currentProductLabel: compact(productLabel) || compact(productStrength) || 'Current product',
    frequency: rule.frequency,
    duration: rule.duration,
    durationUnit: rule.durationUnit,
    directions: rule.directions,
  };
}

export function buildRenalSafetyView(source: RenalSafetySource): RenalSafetyView {
  const view = assembleRenalSafetyView(source);
  const clinicalSource = resolveClinicalSource(source.guidelineReference);
  if (!view.matched || !clinicalSource) return view;
  return { ...view, clinicalSource };
}

function assembleRenalSafetyView(source: RenalSafetySource): RenalSafetyView {
  const required = Boolean(source.renalAdjustmentRequired || source.renalWarningActive);
  const standardRegimenSummary = compact(source.standardRegimenSummary);
  if (!required) {
    return {
      matched: false,
      state: 'NOT_APPLICABLE',
      standardRegimenSummary,
      tiers: [],
    };
  }

  if (source.regimenSource === 'RENAL_ADJUSTED') {
    const patient = extractPatientRenalMetric(source);
    return {
      matched: true,
      state: 'APPLIED',
      basis: patient?.basis,
      patient,
      standardRegimenSummary,
      recommendedRegimenSummary: undefined,
      humanReadableConfiguration: compact(source.renalAdjustmentReason) || undefined,
      tiers: parseRenalDosingTiers(source.renalAdjustmentReason),
    };
  }

  if (source.regimenSource === 'PHARMACIST_MODIFIED') {
    const patient = extractPatientRenalMetric(source);
    return {
      matched: true,
      state: 'MODIFIED',
      basis: patient?.basis,
      patient,
      standardRegimenSummary,
      humanReadableConfiguration: compact(source.renalAdjustmentReason) || undefined,
      tiers: parseRenalDosingTiers(source.renalAdjustmentReason),
    };
  }

  const configuration =
    compact(source.renalAdjustmentReason) || compact(source.renalWarningMessage) || undefined;
  const rules = structuredRulesFrom(source);
  const preferredBasis: RenalBasis | undefined = preferredBasisFrom(source);
  const displayTiers =
    rules.length > 0 && preferredBasis
      ? tiersFromRules(rules, preferredBasis)
      : parseRenalDosingTiers(source.renalAdjustmentReason);
  const patient = extractPatientRenalMetric(source);

  if (preferredBasis && patient && patient.basis !== preferredBasis) {
    return {
      matched: true,
      state: 'RENAL_VALUE_REQUIRED',
      basis: preferredBasis,
      patient,
      standardRegimenSummary,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      disableApplyReason: `This treatment's renal dosing is based on ${preferredBasis}. A verified ${preferredBasis} is required before SafeScribe can recommend a renal-adjusted regimen.`,
    };
  }

  if (!patient) {
    return {
      matched: true,
      state: 'RENAL_VALUE_REQUIRED',
      basis: preferredBasis,
      standardRegimenSummary,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      disableApplyReason: preferredBasis
        ? `A verified ${preferredBasis} is required before SafeScribe can recommend a renal-adjusted regimen.`
        : 'A verified renal lab value is required before SafeScribe can recommend a renal-adjusted regimen.',
    };
  }

  if (!rules.length) {
    return {
      matched: true,
      state: 'NO_STRUCTURED_RULE',
      basis: patient.basis,
      patient,
      standardRegimenSummary,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      disableApplyReason:
        'This treatment requires renal consideration, but no structured dose-adjustment regimen is available.',
    };
  }

  const applicableRule = getApplicableRule(patient.value, rules);
  if (!applicableRule) {
    return {
      matched: true,
      state: 'NO_STRUCTURED_RULE',
      basis: patient.basis,
      patient,
      standardRegimenSummary,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      disableApplyReason:
        'This treatment requires renal consideration, but no structured dose-adjustment regimen is available.',
    };
  }

  const applicableTier = tiersFromRules([applicableRule], patient.basis)[0];
  const apply = applyFromRule(applicableRule, source.productStrength, source.productLabel);

  if (apply.productMismatch) {
    return {
      matched: true,
      state: 'PRODUCT_REQUIRED',
      basis: patient.basis,
      patient,
      standardRegimenSummary,
      recommendedRegimenSummary: applicableRule.directions,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      applicableTier,
      applicableRule,
      apply,
      disableApplyReason: 'A different product strength is required for this regimen.',
    };
  }

  if (apply.tabletCount == null) {
    return {
      matched: true,
      state: 'NO_STRUCTURED_RULE',
      basis: patient.basis,
      patient,
      standardRegimenSummary,
      recommendedRegimenSummary: applicableRule.directions,
      humanReadableConfiguration: configuration,
      tiers: displayTiers,
      applicableTier,
      applicableRule,
      apply,
      disableApplyReason:
        'This treatment requires renal consideration, but the adjusted dose cannot be applied to the current product automatically.',
    };
  }

  return {
    matched: true,
    state: 'ADJUSTMENT_RECOMMENDED',
    basis: patient.basis,
    patient,
    standardRegimenSummary,
    recommendedRegimenSummary: applicableRule.directions,
    humanReadableConfiguration: configuration,
    tiers: displayTiers,
    applicableTier,
    applicableRule,
    apply,
  };
}

export function renalHeadline(state: RenalSafetyState): string {
  switch (state) {
    case 'APPLIED':
      return 'RENAL — Adjusted regimen applied';
    case 'MODIFIED':
      return 'RENAL — Renal-adjusted regimen modified';
    case 'PRODUCT_REQUIRED':
      return 'RENAL — Dose adjustment recommended';
    case 'RENAL_VALUE_REQUIRED':
      return 'RENAL — Additional information required';
    case 'NO_STRUCTURED_RULE':
      return 'RENAL — Pharmacist review required';
    case 'ADJUSTMENT_RECOMMENDED':
      return 'RENAL — Dose adjustment recommended';
    default:
      return 'RENAL';
  }
}

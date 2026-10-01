/**
 * Lab observation normalization and threshold comparison for Safety Engine Phase 2.
 */

export type LabComparator = 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ' | 'BETWEEN';

export interface NormalizedLabObservation {
  key: string;
  display: string;
  value: number;
  unit: string;
  observedAt?: Date;
  source: 'structured' | 'text';
}

export interface LabRuleThreshold {
  observationKey: string;
  comparator: LabComparator;
  thresholdLow?: number | null;
  thresholdHigh?: number | null;
  expectedUnit?: string | null;
  maxAgeDays?: number;
}

const OBSERVATION_ALIASES: Record<string, string> = {
  egfr: 'egfr',
  'estimated gfr': 'egfr',
  'gfr': 'egfr',
  creatinine: 'creatinine',
  cr: 'creatinine',
  potassium: 'potassium',
  k: 'potassium',
  inr: 'inr',
  'international normalized ratio': 'inr',
  hba1c: 'hba1c',
  'hb a1c': 'hba1c',
  hemoglobin: 'hemoglobin',
  hb: 'hemoglobin',
  alt: 'alt',
  ast: 'ast',
  bilirubin: 'bilirubin',
  lactate: 'lactate',
};

const UNIT_ALIASES: Record<string, string> = {
  'ml/min': 'ml/min',
  'ml/min/1.73m2': 'ml/min',
  'ml/min/1.73 m2': 'ml/min',
  'mg/dl': 'mg/dl',
  'mmol/l': 'mmol/l',
  'meq/l': 'mmol/l',
  '%': '%',
};

export function normalizeObservationKey(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip LOINC-style qualifiers: "Potassium [Moles/volume] in Serum or Plasma"
  n = n.replace(/\[[^\]]*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (OBSERVATION_ALIASES[n]) return OBSERVATION_ALIASES[n];

  // Prefix / contains matches for long LOINC display names
  if (/^potassium\b|\bpotassium\b/.test(n) || n.startsWith('k ')) return 'potassium';
  if (/^egfr\b|estimated gfr|estimated glomerular/.test(n)) return 'egfr';
  if (/^creatinine\b|\bserum creatinine\b/.test(n)) return 'creatinine';
  if (/^crcl\b|creatinine clearance/.test(n)) return 'crcl';
  if (/^inr\b|international normalized/.test(n)) return 'inr';
  if (/hba1c|hb a1c|hemoglobin a1c/.test(n)) return 'hba1c';
  if (/^hemoglobin\b|\bhgb\b/.test(n)) return 'hemoglobin';
  if (/^lithium\b/.test(n)) return 'lithium';
  if (/^neutrophil/.test(n)) return 'neutrophils';
  if (/^lymphocyte/.test(n)) return 'lymphocytes';
  if (
    /^alt\b/.test(n) ||
    /\balanine aminotransferase\b/.test(n) ||
    /\bsgpt\b/.test(n)
  ) {
    return 'alt';
  }
  if (
    /^ast\b/.test(n) ||
    /\baspartate aminotransferase\b/.test(n) ||
    /\bsgot\b/.test(n)
  ) {
    return 'ast';
  }
  if (/^bilirubin\b|\btotal bilirubin\b/.test(n)) return 'bilirubin';
  if (/^lactate\b|\blactic acid\b/.test(n)) return 'lactate';
  if (/^co2\b|carbon dioxide|bicarbonate/.test(n)) return 'co2';

  return n.replace(/[^a-z0-9]/g, '');
}

export function normalizeLabUnit(unit?: string | null): string {
  if (!unit?.trim()) return '';
  const u = unit.trim().toLowerCase().replace(/\s+/g, ' ');
  return UNIT_ALIASES[u] ?? u;
}

export function parseNumericLabValue(raw?: string | number | null): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const match = String(raw).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Parse free-text lab block (e.g. demographics.labValues). */
export function parseLabValuesText(text: string): NormalizedLabObservation[] {
  if (!text?.trim()) return [];
  const results: NormalizedLabObservation[] = [];
  const lines = text.split(/[\n;]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (colon) {
      const name = colon[1].trim();
      const rest = colon[2].trim();
      const value = parseNumericLabValue(rest);
      if (value == null) continue;
      const unitMatch = rest.match(/[a-zA-Z%/][\w/.%]*/g);
      const unit = unitMatch?.find((u) => !/^-?\d/.test(u)) ?? '';
      results.push({
        key: normalizeObservationKey(name),
        display: name,
        value,
        unit: normalizeLabUnit(unit),
        source: 'text',
      });
      continue;
    }
    const egfrInline = trimmed.match(/egfr\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (egfrInline) {
      results.push({
        key: 'egfr',
        display: 'eGFR',
        value: Number(egfrInline[1]),
        unit: 'ml/min',
        source: 'text',
      });
    }
  }
  return results;
}

export function mergeLabObservations(
  structured: Array<{ name: string; value?: string | number; unit?: string; observedAt?: string }>,
  textLabs: string | null | undefined,
  aiLabs?: Array<{ test: string; value: string; unit?: string }>,
): NormalizedLabObservation[] {
  const map = new Map<string, NormalizedLabObservation>();

  const push = (obs: NormalizedLabObservation) => {
    const existing = map.get(obs.key);
    if (!existing || obs.source === 'structured') map.set(obs.key, obs);
  };

  for (const lab of structured) {
    const value = parseNumericLabValue(lab.value);
    if (value == null) continue;
    push({
      key: normalizeObservationKey(lab.name),
      display: lab.name,
      value,
      unit: normalizeLabUnit(lab.unit),
      observedAt: lab.observedAt ? new Date(lab.observedAt) : undefined,
      source: 'structured',
    });
  }

  for (const lab of aiLabs ?? []) {
    const value = parseNumericLabValue(lab.value);
    if (value == null) continue;
    push({
      key: normalizeObservationKey(lab.test),
      display: lab.test,
      value,
      unit: normalizeLabUnit(lab.unit),
      source: 'structured',
    });
  }

  for (const lab of parseLabValuesText(textLabs ?? '')) {
    if (!map.has(lab.key)) push(lab);
  }

  return Array.from(map.values());
}

export function compareLabValue(
  value: number,
  comparator: LabComparator,
  thresholdLow?: number | null,
  thresholdHigh?: number | null,
): boolean {
  switch (comparator) {
    case 'LT':
      return thresholdLow != null && value < thresholdLow;
    case 'LTE':
      return thresholdLow != null && value <= thresholdLow;
    case 'GT':
      return thresholdLow != null && value > thresholdLow;
    case 'GTE':
      return thresholdLow != null && value >= thresholdLow;
    case 'EQ':
      return thresholdLow != null && value === thresholdLow;
    case 'BETWEEN':
      return (
        thresholdLow != null &&
        thresholdHigh != null &&
        value >= thresholdLow &&
        value <= thresholdHigh
      );
    default:
      return false;
  }
}

/**
 * Clinical defaults when Excel uses LOCAL_REFERENCE_LIMIT without publishing numeric
 * bounds, or when a single-sided threshold was stored on the wrong field.
 * Potassium ULN ≈ 5.0 mmol/L is the common CA adult laboratory upper limit used when
 * the reporting lab ULN is not available on the observation.
 */
const DEFAULT_OBSERVATION_LIMITS: Record<
  string,
  { aboveUln: number; belowLln?: number }
> = {
  potassium: { aboveUln: 5.0, belowLln: 3.5 },
  lithium: { aboveUln: 1.5 },
};

export function resolveLabThreshold(detail: {
  comparator: string;
  thresholdLow?: number | null;
  thresholdHigh?: number | null;
  observationKey?: string | null;
  observationDisplay?: string | null;
  loincCode?: string | null;
  referenceLimitDirection?: string | null;
}): {
  comparator: LabComparator;
  thresholdLow: number | null;
  thresholdHigh: number | null;
  resolved: boolean;
} {
  let comparator = (detail.comparator as LabComparator) || 'BETWEEN';
  let low = detail.thresholdLow ?? null;
  let high = detail.thresholdHigh ?? null;

  // promote-drafts historically stored ABOVE-only max as high + comparator GT, but
  // compareLabValue(GT) only reads thresholdLow — normalize that shape here.
  if (comparator === 'GT' && low == null && high != null) {
    low = high;
    high = null;
  }
  if (comparator === 'LT' && low == null && high != null) {
    low = high;
    high = null;
  }

  const obsKey = normalizeObservationKey(
    detail.observationDisplay ||
      detail.observationKey ||
      detail.loincCode ||
      '',
  );
  const defaults = DEFAULT_OBSERVATION_LIMITS[obsKey];
  const dir = (detail.referenceLimitDirection ?? '').toUpperCase();

  if (low == null && high == null && defaults) {
    if (dir.includes('ABOVE') || dir.includes('UPPER') || /above.?uln|gt/i.test(comparator)) {
      // Spec / common CA ULN for potassium is inclusive (>= 5.0 mmol/L).
      return { comparator: 'GTE', thresholdLow: defaults.aboveUln, thresholdHigh: null, resolved: true };
    }
    if (dir.includes('BELOW') || dir.includes('LOWER')) {
      const lln = defaults.belowLln;
      if (lln != null) {
        return { comparator: 'LT', thresholdLow: lln, thresholdHigh: null, resolved: true };
      }
    }
    // Spironolactone ABOVE_ULN sample rows arrive as BETWEEN with null bounds.
    if (comparator === 'BETWEEN' && defaults.aboveUln != null) {
      return {
        comparator: 'GTE',
        thresholdLow: defaults.aboveUln,
        thresholdHigh: null,
        resolved: true,
      };
    }
  }

  if (obsKey === 'potassium' && comparator === 'GT' && low === 5) {
    comparator = 'GTE';
  }

  return {
    comparator,
    thresholdLow: low,
    thresholdHigh: high,
    resolved: low != null || high != null,
  };
}

export function isLabStale(observedAt: Date | undefined, maxAgeDays: number): boolean {
  if (!observedAt || maxAgeDays <= 0) return false;
  const ageMs = Date.now() - observedAt.getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

export function medicationMatchesIngredient(
  medIngredients: string[],
  productName: string,
  genericName: string | undefined,
  drugIngredient: string,
): boolean {
  const needle = drugIngredient.trim().toLowerCase();
  if (!needle || needle.length < 3) return false;
  const haystacks = [productName, genericName ?? '', ...medIngredients]
    .map((s) => s.toLowerCase().trim())
    .filter((h) => h.length >= 3);
  return haystacks.some(
    (h) =>
      h === needle ||
      h.includes(needle) ||
      // Avoid empty-string / tiny-token false positives ('' is included in every string)
      (needle.includes(h) && h.length >= 4),
  );
}

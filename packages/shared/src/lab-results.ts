/**
 * Prescribe Labs & Vitals: keep one latest result per test and present it
 * in the same compact table pattern as Renew monitoring.
 */

export type LabResultKind = 'LAB' | 'VITAL';

export type LabResultStatusTone = 'ok' | 'review' | 'action' | 'pending';

export interface LabResultLike {
  test: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  observedDate?: string;
  confidence?: number;
  needsReview?: boolean;
}

export interface LatestLabResultRow extends LabResultLike {
  kind: LabResultKind;
  canonicalTest: string;
  statusLabel: string;
  statusTone: LabResultStatusTone;
  statusDetail: string;
  resultDisplay: string;
  dateDisplay: string;
  referenceDisplay: string;
}

const TEST_NAME_ALIASES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /^h\.?\s*b\.?\s*a\.?\s*1?\s*c$/i, canonical: 'HbA1c' },
  { pattern: /^hba[!l1i]?c$/i, canonical: 'HbA1c' },
  { pattern: /^a1c$/i, canonical: 'HbA1c' },
  { pattern: /^hemoglobin\s*a1c$/i, canonical: 'HbA1c' },
  { pattern: /^egfr$/i, canonical: 'eGFR' },
  { pattern: /^estimated\s*gfr$/i, canonical: 'eGFR' },
  { pattern: /^scr$|^serum\s*creat(inine)?$|^creat(inine)?$/i, canonical: 'Creatinine' },
  { pattern: /^alt$|^sgpt$/i, canonical: 'ALT' },
  { pattern: /^ast$|^sgot$/i, canonical: 'AST' },
  { pattern: /^tsh$/i, canonical: 'TSH' },
  { pattern: /^ldl([- ]?c)?$/i, canonical: 'LDL-C' },
  { pattern: /^hdl([- ]?c)?$/i, canonical: 'HDL-C' },
  { pattern: /^triglycerides?$|^tg$/i, canonical: 'Triglycerides' },
  { pattern: /^inr$/i, canonical: 'INR' },
  { pattern: /^wbc$/i, canonical: 'WBC' },
  { pattern: /^rbc$/i, canonical: 'RBC' },
  { pattern: /^hgb$|^hb$|^haemoglobin$|^hemoglobin$/i, canonical: 'Hemoglobin' },
  { pattern: /^plt$|^platelets?$/i, canonical: 'Platelets' },
  { pattern: /^na\+?$|^sodium$/i, canonical: 'Sodium' },
  { pattern: /^k\+?$|^potassium$/i, canonical: 'Potassium' },
  { pattern: /^glucose$|^fbs$|^fbg$/i, canonical: 'Glucose' },
  { pattern: /^bp$|^blood\s*pressure$/i, canonical: 'Blood pressure' },
  { pattern: /^pulse$|^heart\s*rate$|^hr$/i, canonical: 'Pulse' },
  { pattern: /^height$|^ht$/i, canonical: 'Height' },
  { pattern: /^weight$|^wt$/i, canonical: 'Weight' },
  { pattern: /^bmi$|^body\s*mass\s*index$/i, canonical: 'BMI' },
  { pattern: /^temp(erature)?$/i, canonical: 'Temperature' },
  { pattern: /^spo2$|^oxygen\s*saturation$|^o2\s*sat$/i, canonical: 'SpO2' },
  { pattern: /^respiratory\s*rate$|^rr$/i, canonical: 'Respiratory rate' },
];

const VITAL_KEYS = new Set([
  'bloodpressure',
  'pulse',
  'heartrate',
  'height',
  'weight',
  'bmi',
  'temperature',
  'spo2',
  'oxygensaturation',
  'respiratoryrate',
]);

export function canonicalizeLabTestName(raw: string): string {
  const compact = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const key = compact.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  for (const { pattern, canonical } of TEST_NAME_ALIASES) {
    if (pattern.test(compact) || pattern.test(key)) return canonical;
  }
  if (/^hba.?c$/i.test(key) || /^hba1?c$/i.test(key)) return 'HbA1c';
  return compact;
}

export function labTestKey(test: string): string {
  return canonicalizeLabTestName(test).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

export function classifyLabResultKind(test: string): LabResultKind {
  return VITAL_KEYS.has(labTestKey(test)) ? 'VITAL' : 'LAB';
}

function dateRank(raw?: string): number {
  const iso = normalizeLabDate(raw);
  if (!iso) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function normalizeLabDate(raw?: string | null): string | undefined {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return undefined;
}

export function formatLabDate(raw?: string | null): string {
  const iso = normalizeLabDate(raw);
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatLabResultValue(row: LabResultLike): string {
  const unit = row.unit?.trim();
  return unit ? `${row.value} ${unit}` : row.value;
}

/**
 * One row per canonical test. Newer observedDate wins; when dates are missing
 * the later extracted row wins (typical report order is oldest → newest).
 */
export function selectLatestLabValues<T extends LabResultLike>(values: T[]): T[] {
  const best = new Map<string, { row: T; index: number; rank: number }>();
  values.forEach((row, index) => {
    const key = labTestKey(row.test);
    if (!key) return;
    const canonical = canonicalizeLabTestName(row.test);
    const next = {
      ...row,
      test: canonical,
      observedDate: normalizeLabDate(row.observedDate) ?? row.observedDate,
    } as T;
    const rank = dateRank(next.observedDate);
    const existing = best.get(key);
    if (!existing || rank > existing.rank || (rank === existing.rank && index > existing.index)) {
      best.set(key, { row: next, index, rank });
    }
  });
  return Array.from(best.values())
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.row);
}

export function partitionLabAndVitalResults<T extends LabResultLike>(
  values: T[],
): { labs: T[]; vitals: T[] } {
  const latest = selectLatestLabValues(values);
  const labs: T[] = [];
  const vitals: T[] = [];
  for (const row of latest) {
    if (classifyLabResultKind(row.test) === 'VITAL') vitals.push(row);
    else labs.push(row);
  }
  return { labs, vitals };
}

function parseNumericLabValue(raw: string): number | null {
  const match = String(raw).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function parseReferenceBounds(raw?: string): {
  min: number | null;
  max: number | null;
} | null {
  const text = String(raw ?? '')
    .replace(/ref(?:erence)?\s*:?\s*/i, '')
    .replace(/,/g, '')
    .trim();
  if (!text) return null;
  const range = text.match(/^([<>]=?|≤|≥)?\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (range) {
    return { min: Number(range[2]), max: Number(range[3]) };
  }
  const upper = text.match(/^(?:<=|≤|<)\s*(-?\d+(?:\.\d+)?)/);
  if (upper) return { min: null, max: Number(upper[1]) };
  const lower = text.match(/^(?:>=|≥|>)\s*(-?\d+(?:\.\d+)?)/);
  if (lower) return { min: Number(lower[1]), max: null };
  const single = text.match(/^-?\d+(?:\.\d+)?$/);
  if (single) return { min: Number(single[0]), max: Number(single[0]) };
  return null;
}

export function interpretLabReference(
  value: string,
  referenceRange?: string,
  needsReview?: boolean,
): { label: string; tone: LabResultStatusTone; detail: string } {
  if (needsReview) {
    return { label: 'Review', tone: 'review', detail: 'Value needs pharmacist confirmation' };
  }
  const numeric = parseNumericLabValue(value);
  const bounds = parseReferenceBounds(referenceRange);
  if (numeric == null || !bounds) {
    return referenceRange
      ? { label: 'Recorded', tone: 'pending', detail: 'Compare with the listed reference' }
      : { label: 'Recorded', tone: 'pending', detail: 'No reference range provided' };
  }
  const below = bounds.min != null && numeric < bounds.min;
  const above = bounds.max != null && numeric > bounds.max;
  if (below || above) {
    return {
      label: 'Outside target',
      tone: 'review',
      detail: below ? 'Below the listed reference' : 'Above the listed reference',
    };
  }
  return { label: 'In range', tone: 'ok', detail: 'Within the listed reference' };
}

export function presentLatestLabRows(values: LabResultLike[]): LatestLabResultRow[] {
  return selectLatestLabValues(values).map((row) => {
    const status = interpretLabReference(row.value, row.referenceRange, row.needsReview);
    return {
      ...row,
      kind: classifyLabResultKind(row.test),
      canonicalTest: canonicalizeLabTestName(row.test),
      statusLabel: status.label,
      statusTone: status.tone,
      statusDetail: status.detail,
      resultDisplay: formatLabResultValue(row),
      dateDisplay: formatLabDate(row.observedDate),
      referenceDisplay: row.referenceRange?.trim() || '—',
    };
  });
}

export function formatLatestLabValuesAsText(values: LabResultLike[]): string {
  return presentLatestLabRows(values)
    .map((row) => {
      const range = row.referenceRange ? ` (ref ${row.referenceRange})` : '';
      const date = row.dateDisplay !== '—' ? ` · ${row.dateDisplay}` : '';
      return `${row.canonicalTest}: ${row.resultDisplay}${range}${date}`;
    })
    .join('\n');
}

export function vitalsFieldsFromLabValues(values: LabResultLike[]): {
  height?: string;
  weight?: string;
  bmi?: string;
  pulse?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
} {
  const patch: ReturnType<typeof vitalsFieldsFromLabValues> = {};
  for (const row of selectLatestLabValues(values)) {
    const key = labTestKey(row.test);
    if (key === 'bloodpressure') {
      const match = row.value.replace(/\s/g, '').match(/^(\d{2,3})\s*[/\\]\s*(\d{2,3})/);
      if (match) {
        patch.bloodPressureSystolic = match[1];
        patch.bloodPressureDiastolic = match[2];
      }
      continue;
    }
    const numeric = parseNumericLabValue(row.value);
    if (numeric == null) continue;
    if (key === 'height') patch.height = String(numeric);
    if (key === 'weight') patch.weight = String(numeric);
    if (key === 'bmi') patch.bmi = String(numeric);
    if (key === 'pulse' || key === 'heartrate') patch.pulse = String(Math.round(numeric));
  }
  return patch;
}

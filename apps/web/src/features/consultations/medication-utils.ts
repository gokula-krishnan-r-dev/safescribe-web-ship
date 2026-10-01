import type { MedicationEntry } from './types';

export type DrugTerminologySource =
  | 'ccdd'
  | 'rxnorm'
  | 'openfda'
  | 'transcript'
  | 'manual';

export interface DrugSearchResult {
  id: string;
  brandName: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  drugClass?: string;
  label: string;
  source: DrugTerminologySource;
  rxcui?: string;
  ndc?: string;
  /** e.g. "DIN: 00628123" — shown in allergy/drug dropdowns */
  codeDisplay?: string;
}

const PLACEHOLDER_VALUE_RE =
  /^(unknown(?:\s+dose)?|dose\s+unknown|n\/a|n\.a\.|na|unspecified|not specified|not known|not stated|none|null|-)$/i;

const TRAILING_PLACEHOLDER_RE =
  /\s+[-–—·,]?\s*(unknown(?:\s+dose)?|dose\s+unknown|n\/a|n\.a\.|unspecified|not specified|not known|not stated|none|null)\s*$/i;

/** Values CCDD / the extractor use as stand-ins — never show these on chips. */
export function isPlaceholderClinicalValue(value?: string | null): boolean {
  const t = value?.trim();
  if (!t) return false;
  return PLACEHOLDER_VALUE_RE.test(t);
}

export function omitPlaceholderValue(value?: string | null): string | undefined {
  const t = value?.trim();
  if (!t || PLACEHOLDER_VALUE_RE.test(t)) return undefined;
  return t;
}

/** "Metformin Unknown" / "metformin · Unknown" → "Metformin" */
export function cleanMedicationDisplayName(raw?: string | null): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  s = s.replace(TRAILING_PLACEHOLDER_RE, '').trim();
  s = s.replace(/\s*[·,;:/|]+\s*$/, '').trim();
  s = s.replace(/^(unknown|n\/a)\s*[·,;:/|]+\s*/i, '').trim();
  if (!s || PLACEHOLDER_VALUE_RE.test(s)) return '';
  return s;
}

function titleCaseChipName(name: string): string {
  const cleaned = cleanMedicationDisplayName(name);
  if (!cleaned) return '';
  if (cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned) && cleaned.length <= 40) {
    return cleaned;
  }
  if (cleaned === cleaned.toLowerCase()) {
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return cleaned;
}

export function isCodedDrugSource(source?: string): boolean {
  return source === 'ccdd' || source === 'rxnorm' || source === 'openfda';
}

export function isCodedMedicationEntry(
  entry: Pick<MedicationEntry, 'id' | 'source' | 'rxcui' | 'ndc'>,
): boolean {
  if (isCodedDrugSource(entry.source)) return true;
  if (entry.rxcui?.trim() || entry.ndc?.trim()) return true;
  const id = entry.id ?? '';
  return id.startsWith('ccdd-') || id.startsWith('rxnorm-') || id.startsWith('openfda-');
}

export function medicationEntryNeedsCcdDResolve(entry: MedicationEntry): boolean {
  return !isCodedMedicationEntry(entry);
}

export function toPersistedDrugSource(
  source?: string,
): 'ccdd' | 'rxnorm' | 'openfda' | 'manual' {
  if (source === 'ccdd' || source === 'rxnorm' || source === 'openfda') return source;
  return 'manual';
}

/** Pathway types that collect a medication list. Never infer this from question wording. */
const MEDICATION_LIST_QUESTION_TYPES = new Set(['TEXT', 'TEXTAREA']);

/**
 * Medication search is shown only for free-text question types.
 * YES_NO / SELECT / etc. keep their native controls even if the prompt mentions
 * treatment, medications, or drugs.
 */
export function isMedicationQuestion(q: { type?: string | null } | null | undefined): boolean {
  const type = String(q?.type ?? '')
    .trim()
    .toUpperCase();
  return MEDICATION_LIST_QUESTION_TYPES.has(type);
}

export function sanitizeMedicationEntry(entry: MedicationEntry): MedicationEntry {
  const genericName = omitPlaceholderValue(cleanMedicationDisplayName(entry.genericName));
  const brandName = omitPlaceholderValue(cleanMedicationDisplayName(entry.brandName));
  const label =
    cleanMedicationDisplayName(entry.label) ||
    genericName ||
    brandName ||
    entry.label;
  const manufacturer = omitPlaceholderValue(entry.manufacturer);
  const strength = omitPlaceholderValue(entry.strength);
  const dosageForm = omitPlaceholderValue(entry.dosageForm);
  const drugClass = omitPlaceholderValue(entry.drugClass);

  return {
    ...entry,
    genericName,
    brandName: brandName || genericName,
    label,
    manufacturer,
    strength,
    dosageForm,
    drugClass,
  };
}

export function sanitizeMedicationEntries(entries: MedicationEntry[]): MedicationEntry[] {
  return entries
    .map(sanitizeMedicationEntry)
    .filter((e) => Boolean(cleanMedicationDisplayName(e.label || e.genericName || e.brandName)));
}

export function sanitizeDrugSearchResult(r: DrugSearchResult): DrugSearchResult {
  const genericName = omitPlaceholderValue(cleanMedicationDisplayName(r.genericName));
  const brandName =
    omitPlaceholderValue(cleanMedicationDisplayName(r.brandName)) || genericName || r.brandName;
  const label =
    cleanMedicationDisplayName(r.label) || genericName || brandName || r.label;
  return {
    ...r,
    genericName,
    brandName,
    label,
    manufacturer: omitPlaceholderValue(r.manufacturer),
    strength: omitPlaceholderValue(r.strength),
    dosageForm: omitPlaceholderValue(r.dosageForm),
    drugClass: omitPlaceholderValue(r.drugClass),
  };
}

export function drugResultToEntry(r: DrugSearchResult): MedicationEntry {
  const clean = sanitizeDrugSearchResult(r);
  return {
    id: clean.id,
    label: clean.label,
    brandName: clean.brandName,
    genericName: clean.genericName,
    strength: clean.strength,
    dosageForm: clean.dosageForm,
    manufacturer: clean.manufacturer,
    drugClass: clean.drugClass,
    source: clean.source,
    rxcui: clean.rxcui,
    ndc: clean.ndc,
  };
}

export function formatMedicationChipLabel(entry: MedicationEntry): string {
  const clean = sanitizeMedicationEntry(entry);
  const primary = clean.genericName || clean.brandName || clean.label;
  return titleCaseChipName(primary);
}

export function formatMedicationCardTitle(entry: MedicationEntry): string {
  const clean = sanitizeMedicationEntry(entry);
  const name = formatMedicationChipLabel(clean);
  const strength = clean.strength;
  return strength ? `${name} ${strength}` : name;
}

export function entriesToDisplayString(entries: MedicationEntry[]): string {
  return sanitizeMedicationEntries(entries)
    .map((e) => formatMedicationChipLabel(e) || e.label)
    .filter(Boolean)
    .join(', ');
}

export function parseMedicationEntriesFromSaved(
  saved: MedicationEntry[] | undefined,
  fallbackText: string | undefined,
): MedicationEntry[] {
  if (saved?.length) return sanitizeMedicationEntries(saved);
  if (!fallbackText?.trim()) return [];
  const parsed: MedicationEntry[] = [];
  for (const part of fallbackText.split(/[,;]/)) {
    const label = cleanMedicationDisplayName(part);
    if (!label) continue;
    parsed.push({
      id: `text-${label.toLowerCase().replace(/\s+/g, '-')}`,
      label,
      brandName: label,
      genericName: label,
      source: 'manual',
    });
  }
  return parsed;
}

export function formatChipLabel(entry: MedicationEntry): string {
  return formatMedicationChipLabel(entry);
}

export function uniqueCcdDStrengthOptions(results: DrugSearchResult[]): Array<{
  strength: string;
  dosageForm?: string;
  result: DrugSearchResult;
}> {
  const seen = new Set<string>();
  const out: Array<{ strength: string; dosageForm?: string; result: DrugSearchResult }> = [];
  for (const result of results) {
    const strength = omitPlaceholderValue(result.strength)?.replace(/\s+/g, ' ');
    if (!strength) continue;
    const dosageForm = omitPlaceholderValue(result.dosageForm)?.replace(/\s+/g, ' ');
    const key = `${strength.toLowerCase()}|${(dosageForm ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ strength, dosageForm, result });
  }
  out.sort((a, b) => {
    const na = Number.parseFloat(a.strength) || 0;
    const nb = Number.parseFloat(b.strength) || 0;
    if (na !== nb) return na - nb;
    return a.strength.localeCompare(b.strength);
  });
  return out.slice(0, 8);
}

export function collectMedicationNamesToResolve(opts: {
  aiNames: string[];
  freeText?: string;
  existing: MedicationEntry[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const name = cleanMedicationDisplayName(raw);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };

  for (const name of opts.aiNames) push(name);
  if (!out.length) {
    for (const entry of opts.existing) {
      if (!medicationEntryNeedsCcdDResolve(entry)) continue;
      push(entry.genericName || entry.brandName || entry.label);
    }
  }
  if (!out.length && opts.freeText?.trim() && !/^none\b/i.test(opts.freeText.trim())) {
    for (const part of opts.freeText.split(/[,;]/)) push(part);
  }
  return out;
}

export function formatSourceBadge(source?: MedicationEntry['source'] | string): string {
  if (source === 'ccdd') return '';
  if (source === 'openfda') return 'OpenFDA';
  if (source === 'rxnorm') return 'RxNorm';
  if (source === 'transcript') return 'Transcript';
  if (source === 'ai') return 'Suggested';
  return source === 'manual' ? 'Manual' : '';
}

function medicationDedupeKey(entry: MedicationEntry): string {
  return (
    entry.genericName ||
    entry.brandName ||
    entry.label ||
    entry.id
  )
    .trim()
    .toLowerCase();
}

export function mergeUniqueMedications(
  existing: MedicationEntry[],
  incoming: MedicationEntry[],
): MedicationEntry[] {
  const seen = new Set(existing.map(medicationDedupeKey).filter(Boolean));
  const next = [...existing];
  for (const item of incoming) {
    const key = medicationDedupeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

export function drugResultToTreatment(
  drug: DrugSearchResult,
  priority: number,
): import('./types').TreatmentRecommendation {
  const clean = sanitizeDrugSearchResult(drug);
  const route = inferRoute(clean.dosageForm);
  return {
    priority,
    medicationName: clean.brandName || clean.genericName || clean.label,
    genericName: clean.genericName,
    dose: clean.strength || 'As directed',
    route,
    frequency: 'As directed',
    duration: 'As directed',
    instructions: [
      clean.label,
      clean.manufacturer ? `Manufacturer: ${clean.manufacturer}` : null,
      clean.drugClass ? `Class: ${clean.drugClass}` : null,
    ].filter(Boolean).join(' · '),
    confidence: 100,
    drugId: clean.id,
    rxcui: clean.rxcui,
    ndc: clean.ndc,
    manufacturer: clean.manufacturer,
    drugClass: clean.drugClass,
    terminologyLabel: clean.label,
    source: toPersistedDrugSource(clean.source),
  };
}

function inferRoute(dosageForm?: string): string {
  if (!dosageForm) return 'oral';
  const f = dosageForm.toLowerCase();
  if (f.includes('tablet') || f.includes('capsule') || f.includes('solution') || f.includes('suspension')) return 'oral';
  if (f.includes('cream') || f.includes('ointment') || f.includes('gel') || f.includes('patch')) return 'topical';
  if (f.includes('injection') || f.includes('injectable')) return 'injection';
  if (f.includes('inhal')) return 'inhalation';
  return dosageForm;
}

export function medicationEntryToTreatment(
  entry: MedicationEntry,
  priority: number,
): import('./types').TreatmentRecommendation {
  return drugResultToTreatment(
    {
      id: entry.id,
      brandName: entry.brandName ?? entry.label,
      genericName: entry.genericName,
      strength: entry.strength,
      dosageForm: entry.dosageForm,
      manufacturer: entry.manufacturer,
      drugClass: entry.drugClass,
      label: entry.label,
      source: toPersistedDrugSource(entry.source),
      rxcui: entry.rxcui,
      ndc: entry.ndc,
    },
    priority,
  );
}

/**
 * Controlled clinical-use tag vocabulary for the central Evidence Library.
 * Used by Prescribe, Adapt, Renew, and documentation reference selection.
 */

export const CLINICAL_USE_TAG_CODES = [
  'assessment',
  'differential_diagnosis',
  'red_flags_referral',
  'treatment_place_in_therapy',
  'dose',
  'age_weight',
  'renal',
  'hepatic',
  'pregnancy_lactation',
  'contraindications_precautions',
  'allergies_hypersensitivity',
  'drug_interactions',
  'dosage_form_formulation',
  'route_administration',
  'regimen_frequency',
  'therapeutic_substitution',
  'adherence_use',
  'monitoring_follow_up',
  'counselling_patient_guidance',
] as const;

export type ClinicalUseTagCode = (typeof CLINICAL_USE_TAG_CODES)[number];

export const CLINICAL_USE_TAG_LABELS: Record<ClinicalUseTagCode, string> = {
  assessment: 'Assessment',
  differential_diagnosis: 'Differential diagnosis',
  red_flags_referral: 'Red flags / referral',
  treatment_place_in_therapy: 'Treatment / place in therapy',
  dose: 'Dose',
  age_weight: 'Age / weight',
  renal: 'Renal',
  hepatic: 'Hepatic',
  pregnancy_lactation: 'Pregnancy / lactation',
  contraindications_precautions: 'Contraindications / precautions',
  allergies_hypersensitivity: 'Allergies / hypersensitivity',
  drug_interactions: 'Drug interactions',
  dosage_form_formulation: 'Dosage form / formulation',
  route_administration: 'Route / administration',
  regimen_frequency: 'Regimen / frequency',
  therapeutic_substitution: 'Therapeutic substitution',
  adherence_use: 'Adherence / use',
  monitoring_follow_up: 'Monitoring / follow-up',
  counselling_patient_guidance: 'Counselling / patient guidance',
};

const LABEL_TO_CODE = new Map(
  Object.entries(CLINICAL_USE_TAG_LABELS).map(([code, label]) => [
    compactKey(label),
    code as ClinicalUseTagCode,
  ]),
);

function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Normalize an AI/admin label into a controlled tag code, or null if unknown. */
export function normalizeClinicalUseTag(raw: string): ClinicalUseTagCode | null {
  const text = raw.trim();
  if (!text) return null;
  const compact = compactKey(text);
  if ((CLINICAL_USE_TAG_CODES as readonly string[]).includes(compact)) {
    return compact as ClinicalUseTagCode;
  }
  // Underscore / hyphen variants of codes
  const asCode = text
    .toLowerCase()
    .trim()
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '') as ClinicalUseTagCode;
  if ((CLINICAL_USE_TAG_CODES as readonly string[]).includes(asCode)) return asCode;
  return LABEL_TO_CODE.get(compact) ?? null;
}

export function parseClinicalUseTags(raw: string | string[] | null | undefined): {
  tags: ClinicalUseTagCode[];
  unknown: string[];
} {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw ?? '')
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
  const tags: ClinicalUseTagCode[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const code = normalizeClinicalUseTag(part);
    if (!code) {
      unknown.push(part);
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    tags.push(code);
  }
  return { tags, unknown };
}

export const EVIDENCE_JURISDICTIONS = [
  'Canada',
  'Alberta',
  'British Columbia',
  'Ontario',
  'Other Canadian province/territory',
  'International',
] as const;

export type EvidenceJurisdiction = (typeof EVIDENCE_JURISDICTIONS)[number];

export function normalizeEvidenceJurisdiction(raw: string | null | undefined): {
  value: EvidenceJurisdiction | null;
  warning?: string;
} {
  const text = (raw ?? '').trim();
  if (!text) return { value: null };
  const compact = compactKey(text);
  const aliases: Record<string, EvidenceJurisdiction> = {
    canada: 'Canada',
    ca: 'Canada',
    alberta: 'Alberta',
    ab: 'Alberta',
    britishcolumbia: 'British Columbia',
    bc: 'British Columbia',
    ontario: 'Ontario',
    on: 'Ontario',
    othercanadianprovinceterritory: 'Other Canadian province/territory',
    othercanadianprovince: 'Other Canadian province/territory',
    international: 'International',
  };
  const mapped = aliases[compact];
  if (mapped) return { value: mapped };
  // Exact allow-list match
  const exact = EVIDENCE_JURISDICTIONS.find((j) => compactKey(j) === compact);
  if (exact) return { value: exact };
  return {
    value: null,
    warning: `Unknown jurisdiction “${text}” — select an allowed value`,
  };
}

export const CLINICAL_USE_TAG_OPTIONS = CLINICAL_USE_TAG_CODES.map((code) => ({
  value: code,
  label: CLINICAL_USE_TAG_LABELS[code],
}));

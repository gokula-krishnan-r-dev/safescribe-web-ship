/**
 * Clinical Yes/No flags for pathway treatment safety fields
 * (pregnancy, renal, hepatic, monitoring) + pharmacist-authored reasons.
 */

export type ClinicalYesNo = 'Yes' | 'No';

export const CLINICAL_YES_NO_OPTIONS: Array<{ value: ClinicalYesNo; label: string }> = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
];

/**
 * Normalize stored values to Yes/No.
 * Legacy free-text notes are treated as Yes (a caution was authored).
 */
export function normalizeClinicalYesNo(
  value?: string | null,
): ClinicalYesNo | '' {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  if (/^yes$/i.test(raw)) return 'Yes';
  if (/^no$/i.test(raw)) return 'No';
  // Legacy free-text → treat as Yes so existing cautions are not lost
  return 'Yes';
}

export function isClinicalYes(value?: string | null): boolean {
  return normalizeClinicalYesNo(value) === 'Yes';
}

/** Display label for admin / read-only views */
export function formatClinicalYesNo(value?: string | null): string {
  const flag = normalizeClinicalYesNo(value);
  if (flag === 'Yes') return 'Yes';
  if (flag === 'No') return 'No';
  return '—';
}

/**
 * Detect patient pregnancy from demographics.
 * Prefer raw pregnancyAnswer (Yes/No/Unknown); fall back to composed safety labels.
 */
export function isPatientPregnant(demographics?: {
  pregnancyAnswer?: string | null;
  pregnancyStatus?: string | null;
} | null): boolean {
  if (!demographics) return false;
  const answer = (demographics.pregnancyAnswer ?? '').trim();
  if (answer) {
    if (/^yes$/i.test(answer)) return true;
    if (/^no$/i.test(answer) || /^unknown$/i.test(answer)) return false;
  }

  const status = (demographics.pregnancyStatus ?? '').trim();
  if (!status) return false;
  if (/^yes$/i.test(status)) return true;
  if (/not\s+pregnant/i.test(status)) return false;
  if (/pregnancy\s+unknown/i.test(status)) return false;
  // Composed label e.g. "Pregnant; Not breastfeeding"
  if (/\bpregnant\b/i.test(status) && !/not\s+pregnant/i.test(status)) return true;
  return false;
}

export const PREGNANCY_TREATMENT_CAUTION_MESSAGE =
  'Pregnancy caution — this treatment is flagged for pregnancy or lactation review. Confirm suitability before prescribing.';

export const RENAL_TREATMENT_CAUTION_MESSAGE =
  'Renal adjustment or caution is required for this treatment. Review renal function before prescribing.';

export const HEPATIC_TREATMENT_CAUTION_MESSAGE =
  'Hepatic adjustment or caution is required for this treatment. Review liver function before prescribing.';

export const MONITORING_TREATMENT_CAUTION_MESSAGE =
  'Monitoring is required for this treatment. Confirm follow-up and counselling points with the patient.';

export type TreatmentWarningKind =
  | 'pregnancy'
  | 'renal'
  | 'hepatic'
  | 'monitoring';

const FALLBACK_REASONS: Record<TreatmentWarningKind, string> = {
  pregnancy: PREGNANCY_TREATMENT_CAUTION_MESSAGE,
  renal: RENAL_TREATMENT_CAUTION_MESSAGE,
  hepatic: HEPATIC_TREATMENT_CAUTION_MESSAGE,
  monitoring: MONITORING_TREATMENT_CAUTION_MESSAGE,
};

/**
 * Resolve the pharmacist-facing warning reason.
 * Prefers the authored reason when the flag is Yes; otherwise uses the clinical fallback.
 */
export function resolveTreatmentWarningReason(
  kind: TreatmentWarningKind,
  flag?: string | null,
  reason?: string | null,
): string | null {
  if (!isClinicalYes(flag)) return null;
  const custom = (reason ?? '').trim();
  return custom || FALLBACK_REASONS[kind];
}

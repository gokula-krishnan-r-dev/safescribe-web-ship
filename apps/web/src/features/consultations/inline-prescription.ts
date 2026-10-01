import type { TreatmentRecommendation } from './types';
import type { DurationUnit, FieldErrors, RegimenLineDraft } from './add-treatment/types';
import { emptyRegimenLine } from './add-treatment/constants';
import { resolveFormValue } from './add-treatment/form-options';
import { resolveRouteValue } from './add-treatment/route-options';
import { isOtherFrequencyPlaceholder, resolveFrequencyValue } from './add-treatment/frequency-options';
import { composePatientDirections, doseRangeInvalid } from './add-treatment/directions';
import { formatCourseDurationDisplay } from './add-treatment/quantity';
import {
  isInstructionalDose,
  resolvePharmacistProductUse,
} from './pharmacist-product-use';
import { isMassOrDoseUnit } from '@/features/pathways/product-use-mapping';
import { buildSuggestedRegimenBundle } from '@safescript/shared';

export interface InlinePrescriptionDraft {
  lines: RegimenLineDraft[];
  patientDirections: string;
  directionsMode: 'AUTO' | 'MANUAL';
  quantityValue: string;
  quantityUnit: string;
  refills: number;
  route: string;
  productForm: string;
  allowedRoutes: string[];
  allowedAdministrationUnits: string[];
  allowedQuantityUnits: string[];
}

/** Coerce nullable API / draft strings before `.trim()` (production-safe). */
export function draftString(value: string | null | undefined): string {
  return value ?? '';
}

/** Ensure regimen lines from the API never leave required string fields undefined. */
export function normalizeRegimenLine(
  line: Partial<RegimenLineDraft> & Pick<RegimenLineDraft, 'clientId' | 'sequence'>,
  defaults?: Partial<RegimenLineDraft>,
): RegimenLineDraft {
  const base = emptyRegimenLine(defaults);
  const doseToRaw = line.doseTo ?? base.doseTo;
  const durationRaw = line.durationValue ?? base.durationValue;
  return {
    clientId: line.clientId || base.clientId,
    sequence: line.sequence ?? base.sequence,
    doseFrom: draftString(line.doseFrom ?? base.doseFrom),
    // Keep '' so "Add dose range" can open an empty maximum field without collapsing.
    doseTo: doseToRaw == null ? null : draftString(doseToRaw),
    form: draftString(line.form ?? base.form),
    frequency: draftString(line.frequency ?? base.frequency),
    prn: Boolean(line.prn ?? base.prn),
    durationValue:
      durationRaw != null && draftString(durationRaw) !== '' ? draftString(durationRaw) : null,
    durationUnit: line.durationUnit ?? base.durationUnit,
  };
}

export function normalizeInlineDraft(draft: InlinePrescriptionDraft): InlinePrescriptionDraft {
  return {
    ...draft,
    patientDirections: draftString(draft.patientDirections),
    quantityValue: draftString(draft.quantityValue),
    quantityUnit: draftString(draft.quantityUnit),
    route: draftString(draft.route),
    productForm: draftString(draft.productForm),
    refills: Number.isInteger(draft.refills) && draft.refills >= 0 ? draft.refills : 0,
    lines: draft.lines.map((line, index) =>
      normalizeRegimenLine({
        ...line,
        clientId: line.clientId || `line-${index + 1}`,
        sequence: line.sequence || index + 1,
      }),
    ),
  };
}

/** Apply a partial editor patch without wiping fields the pharmacist did not change. */
export function applyInlineDraftPatch(
  prev: InlinePrescriptionDraft,
  patch: Partial<InlinePrescriptionDraft>,
): InlinePrescriptionDraft {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<InlinePrescriptionDraft>;
  return normalizeInlineDraft({ ...prev, ...defined });
}

function titleCaseRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return '';
  const resolved = resolveRouteValue(trimmed);
  if (resolved) return resolved;
  if (/^(po|by mouth|oral)$/i.test(trimmed)) return 'Oral';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function inferProductFormFromUnit(unit?: string | null): string {
  const u = (unit ?? '').trim().toLowerCase();
  if (!u) return '';
  if (/tablet|caplet/.test(u)) return 'Tablet';
  if (/capsule/.test(u)) return 'Capsule';
  if (/application|cream|ointment|gel|foam/.test(u)) return 'Cream';
  if (/puff|inhalation|nebule/.test(u)) return 'Metered-dose inhaler';
  if (/drop/.test(u)) return 'Drop';
  if (/spray/.test(u)) return 'Spray';
  if (/patch/.test(u)) return 'Patch';
  if (/suppositor/.test(u)) return 'Suppository';
  if (/lozenge|wafer/.test(u)) return 'Lozenge';
  if (/bag|packet|package|sachet|bottle|vial|cup|can/.test(u)) return 'Solution';
  return '';
}

function inferRouteFromDirections(text?: string | null): string {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return '';
  if (/\b(by mouth|orally|\bpo\b|swallow|per os)\b/.test(t)) return 'Oral';
  if (/\b(topical|to the affected area|externally)\b/.test(t)) return 'Topical';
  if (/\b(inhale|inhaled|inhalation)\b/.test(t)) return 'Inhalation';
  if (/\b(subcutaneous|\bsq\b|\bsc\b)\b/.test(t)) return 'Subcutaneous';
  if (/\b(intramuscular|\bim\b)\b/.test(t)) return 'Intramuscular';
  if (/\b(intravenous|\biv\b)\b/.test(t)) return 'Intravenous';
  if (/\b(ophthalmic|into the eye|in the eye)\b/.test(t)) return 'Ophthalmic';
  if (/\b(otic|in the ear|into the ear)\b/.test(t)) return 'Otic';
  if (/\b(rectal|per rectum|suppository)\b/.test(t)) return 'Rectal';
  if (/\b(nasal|into the nose|in each nostril)\b/.test(t)) return 'Nasal';
  return '';
}

function mapFrequency(raw?: string | null): string {
  return resolveFrequencyValue(raw);
}

function parseDuration(raw?: string | null): { value: string | null; unit: DurationUnit | null } {
  const text = (raw ?? '').trim();
  if (!text) return { value: null, unit: null };
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)\b/i);
  if (!match) {
    if (/^\d+$/.test(text)) return { value: text, unit: 'DAY' };
    return { value: null, unit: null };
  }
  const unitRaw = match[2].toLowerCase();
  const unit: DurationUnit = unitRaw.startsWith('week')
    ? 'WEEK'
    : unitRaw.startsWith('month')
      ? 'MONTH'
      : 'DAY';
  return { value: match[1], unit };
}

function parseQuantity(
  treatment: TreatmentRecommendation,
  preferredUnit: string,
): { value: string; unit: string } {
  const unitHint = treatment.quantityUnit?.trim();
  const raw = (treatment.quantity ?? '').trim();
  let unit = unitHint
    ? resolveFormValue(unitHint) || unitHint
    : preferredUnit;
  if (
    unit &&
    /tablet/i.test(unit) &&
    preferredUnit &&
    !/tablet/i.test(preferredUnit)
  ) {
    unit = preferredUnit;
  }
  if (!unit) unit = preferredUnit;
  if (unitHint) {
    const stripped = raw
      .replace(new RegExp(`\\s*${unitHint.replace(/[()]/g, '\\$&')}\\s*$`, 'i'), '')
      .trim();
    const value = stripped.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? stripped;
    return { value, unit: unit || preferredUnit };
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const parsedUnit = match[2].trim();
    if (parsedUnit && /tablet/i.test(parsedUnit) && preferredUnit && !/tablet/i.test(preferredUnit)) {
      return { value: match[1], unit: preferredUnit };
    }
    return { value: match[1], unit: resolveFormValue(parsedUnit) || parsedUnit || unit };
  }
  return { value: '', unit };
}

function parseDoseCount(treatment: TreatmentRecommendation): { from: string; to: string | null } {
  if (isInstructionalDose(treatment.dose)) {
    return { from: treatment.dose!.trim(), to: null };
  }
  const amount = treatment.doseAmount?.trim() ?? '';
  const unit = treatment.doseUnit?.trim() ?? '';
  if (amount && !/mg|mcg|µg|g\b|ml/i.test(`${amount} ${unit}`) && !isMassOrDoseUnit(amount)) {
    const range = amount.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
    if (range) return { from: range[1], to: range[2] };
    if (/^\d/.test(amount)) return { from: amount, to: null };
  }
  const dose = treatment.dose?.trim() ?? '';
  const range = dose.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (range && !/mg|mcg/i.test(dose)) return { from: range[1], to: range[2] };
  const count = dose.match(/^(\d+(?:\.\d+)?)\s*(tablet|capsule|puff|drop|unit|application)?/i);
  if (count && !/mg|mcg/i.test(dose)) return { from: count[1], to: null };
  if (amount && /^\d/.test(amount)) return { from: amount, to: null };
  return { from: '', to: null };
}

export function hydrateInlineDraft(treatment: TreatmentRecommendation): InlinePrescriptionDraft {
  const product = resolvePharmacistProductUse(treatment);
  const duration = parseDuration(treatment.duration);
  const quantity = parseQuantity(treatment, product.preferredQuantityUnit);
  const dose = parseDoseCount(treatment);
  const administrationUnit = product.administrationUnit;
  const existingDirections = draftString(
    treatment.patientDirections || treatment.instructions,
  ).trim();
  const directionsMode = treatment.directionsMode === 'MANUAL' ? 'MANUAL' : 'AUTO';
  const inferredRoute =
    draftString(product.route || titleCaseRoute(treatment.route ?? '')) ||
    inferRouteFromDirections(existingDirections);
  const lines =
    treatment.regimenLines && treatment.regimenLines.length > 0
      ? treatment.regimenLines.map((line, index) => {
          const normalized = normalizeRegimenLine(
            {
              ...line,
              clientId: line.clientId || `line-${index + 1}`,
              sequence: line.sequence || index + 1,
            },
            { form: administrationUnit },
          );
          const stored = resolveFormValue(normalized.form) || normalized.form;
          const form =
            stored &&
            product.allowedAdministrationUnits.some(
              (unit) => unit.toLowerCase() === stored.toLowerCase(),
            )
              ? stored
              : administrationUnit || stored;
          return normalizeRegimenLine(
            { ...normalized, form, frequency: mapFrequency(normalized.frequency || line.frequency) },
            { form: administrationUnit },
          );
        })
      : [
          normalizeRegimenLine(
            emptyRegimenLine({
              doseFrom: dose.from,
              doseTo: dose.to,
              form: administrationUnit,
              frequency: mapFrequency(treatment.frequency),
              prn: Boolean(treatment.prn),
              durationValue: duration.value,
              durationUnit: duration.unit,
            }),
            { form: administrationUnit },
          ),
        ];

  const inferredProductForm =
    draftString(product.productForm) ||
    inferProductFormFromUnit(administrationUnit) ||
    inferProductFormFromUnit(quantity.unit) ||
    inferProductFormFromUnit(lines[0]?.form);

  return normalizeInlineDraft({
    lines,
    patientDirections:
      existingDirections ||
      (directionsMode === 'AUTO' ? composePatientDirections(lines, inferredRoute) : ''),
    directionsMode,
    quantityValue: draftString(quantity.value),
    quantityUnit: draftString(quantity.unit),
    refills: Number.isInteger(treatment.refills) ? Number(treatment.refills) : 0,
    route: inferredRoute,
    productForm: inferredProductForm,
    allowedRoutes: product.allowedRoutes ?? [],
    allowedAdministrationUnits: product.allowedAdministrationUnits ?? [],
    allowedQuantityUnits: product.allowedQuantityUnits ?? [],
  });
}

export function regimenFingerprint(draft: InlinePrescriptionDraft): string {
  const safe = normalizeInlineDraft(draft);
  return JSON.stringify({
    lines: safe.lines.map((line) => ({
      doseFrom: draftString(line.doseFrom).trim(),
      doseTo: line.doseTo != null ? draftString(line.doseTo).trim() : null,
      form: draftString(line.form),
      frequency: draftString(line.frequency),
      prn: line.prn,
      durationValue: line.durationValue,
      durationUnit: line.durationUnit,
    })),
    route: safe.route,
  });
}

export function snapshotInlineDraft(draft: InlinePrescriptionDraft): string {
  const safe = normalizeInlineDraft(draft);
  return JSON.stringify({
    regimen: regimenFingerprint(safe),
    patientDirections: safe.patientDirections.trim(),
    directionsMode: safe.directionsMode,
    quantityValue: safe.quantityValue.trim(),
    quantityUnit: safe.quantityUnit,
    refills: safe.refills,
  });
}

export function isInlineDraftDirty(
  draft: InlinePrescriptionDraft,
  saved: InlinePrescriptionDraft,
): boolean {
  return snapshotInlineDraft(draft) !== snapshotInlineDraft(saved);
}

export function validateInlineDraft(draft: InlinePrescriptionDraft): FieldErrors {
  const safe = normalizeInlineDraft(draft);
  const errors: FieldErrors = {};
  if (!safe.lines.length) {
    errors.regimenLines = 'Add at least one dose line.';
  }
  safe.lines.forEach((line, index) => {
    const doseFrom = draftString(line.doseFrom).trim();
    const instructional = isInstructionalDose(doseFrom);
    const dose = Number(doseFrom);
    if (!doseFrom) {
      errors[`regimenLines.${index}.doseFrom`] = 'Enter a dose instruction.';
    } else if (!instructional && (!Number.isFinite(dose) || dose <= 0)) {
      errors[`regimenLines.${index}.doseFrom`] = 'Enter a dose greater than 0.';
    }
    if (line.doseTo != null) {
      const rangeError = doseRangeInvalid(doseFrom, line.doseTo);
      if (rangeError) errors[`regimenLines.${index}.doseTo`] = rangeError;
    }
    if (!draftString(line.form).trim()) {
      errors[`regimenLines.${index}.form`] = 'Select a dose unit.';
    }
    const frequency = draftString(line.frequency).trim();
    if (!frequency || isOtherFrequencyPlaceholder(frequency)) {
      errors[`regimenLines.${index}.frequency`] = frequency
        ? 'Enter a custom frequency.'
        : 'Select a frequency.';
    }
    const sequential = safe.lines.length > 1;
    const durationValue = draftString(line.durationValue).trim();
    const hasDuration = Boolean(durationValue);
    const hasUnit = Boolean(line.durationUnit);
    if (sequential) {
      const n = Number(durationValue);
      if (!hasDuration || !Number.isFinite(n) || n <= 0) {
        errors[`regimenLines.${index}.durationValue`] =
          'Enter how long this schedule should be taken.';
      }
      if (!hasUnit) {
        errors[`regimenLines.${index}.durationUnit`] = 'Select a duration unit.';
      }
    } else if (hasDuration !== hasUnit || (hasDuration && !durationValue)) {
      errors[`regimenLines.${index}.durationValue`] = 'Enter a duration and select a unit.';
      errors[`regimenLines.${index}.durationUnit`] = 'Enter a duration and select a unit.';
    }
  });
  if (!safe.patientDirections.trim()) {
    errors.patientDirections = 'Enter patient directions.';
  }
  const quantity = Number(safe.quantityValue.trim());
  if (!safe.quantityValue.trim() || !Number.isFinite(quantity) || quantity <= 0) {
    errors.quantityValue = 'Enter a quantity greater than 0.';
  }
  if (!safe.quantityUnit.trim()) errors.quantityUnit = 'Select a quantity unit.';
  if (!Number.isInteger(safe.refills) || safe.refills < 0 || safe.refills > 99) {
    errors.refills = 'Enter a valid number of refills.';
  }
  if (!safe.route.trim()) errors.route = 'Select a route.';
  return errors;
}

export function applyInlineDraft(
  treatment: TreatmentRecommendation,
  draft: InlinePrescriptionDraft,
): TreatmentRecommendation {
  const safe = normalizeInlineDraft(draft);
  const line = safe.lines[0];
  const doseFrom = draftString(line?.doseFrom).trim();
  const doseTo = line?.doseTo != null ? draftString(line.doseTo).trim() : '';
  const dose = doseTo ? `${doseFrom}–${doseTo}` : doseFrom || treatment.dose;
  const autoDirections = composePatientDirections(safe.lines, safe.route);
  const directions =
    safe.directionsMode === 'MANUAL' ? safe.patientDirections.trim() : autoDirections;
  return {
    ...treatment,
    dose,
    doseAmount: doseFrom || treatment.doseAmount,
    doseUnit: draftString(line?.form) || treatment.doseUnit,
    frequency: draftString(line?.frequency) || treatment.frequency,
    duration: formatCourseDurationDisplay(safe.lines) ?? treatment.duration,
    prn: Boolean(line?.prn),
    route: safe.route,
    quantity: `${safe.quantityValue.trim()} ${safe.quantityUnit}`.trim(),
    quantityUnit: safe.quantityUnit,
    refills: safe.refills,
    instructions: directions,
    patientDirections: directions,
    directionsMode: safe.directionsMode,
    productForm: safe.productForm || treatment.productForm,
    allowedRoutes: safe.allowedRoutes.length ? safe.allowedRoutes : treatment.allowedRoutes,
    pharmacistModified: true,
    regimenLines: safe.lines.map((entry) => ({
      ...entry,
      doseTo:
        entry.doseTo != null && draftString(entry.doseTo).trim() !== ''
          ? draftString(entry.doseTo).trim()
          : null,
    })),
  };
}

export function collapsedRegimenSummary(
  draft: InlinePrescriptionDraft,
  treatment?: TreatmentRecommendation,
): string {
  const safe = normalizeInlineDraft(draft);
  const line = safe.lines[0];
  if (!line) return '';
  const bundle = buildSuggestedRegimenBundle({
    strength: treatment?.strength,
    doseAmount: draftString(line.doseFrom).trim(),
    doseUnit: draftString(line.form),
    dose: line.doseTo
      ? `${draftString(line.doseFrom).trim()}–${draftString(line.doseTo).trim()}`
      : draftString(line.doseFrom).trim(),
    frequency: draftString(line.frequency),
    duration: formatCourseDurationDisplay(safe.lines),
    route: safe.route,
    prn: Boolean(line.prn),
    maxDose: treatment?.maxDose,
    instructions: treatment?.instructions,
    productForm: safe.productForm || treatment?.productForm,
    regimenLines: safe.lines,
  });
  if (bundle.status === 'READY') {
    return [bundle.presentation.summaryPrimary, bundle.presentation.summarySecondary]
      .filter(Boolean)
      .join(' · ');
  }
  return bundle.presentation.expandedText;
}

export function productSummary(
  treatment: TreatmentRecommendation,
  draft: InlinePrescriptionDraft,
): string {
  const strength = treatment.strength?.trim();
  const form = (draft.productForm || treatment.productForm || '')
    .replace(/\(e?s\)/gi, '')
    .trim();
  if (strength && form) {
    if (new RegExp(`\\b${form}\\b`, 'i').test(strength)) return strength;
    return `${strength}`.replace(/\s+/g, ' ').trim();
  }
  return strength || form;
}

export function generateInlineDirections(draft: InlinePrescriptionDraft): string {
  return composePatientDirections(draft.lines, draft.route);
}

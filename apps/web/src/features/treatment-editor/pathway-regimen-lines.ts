import type { ClinicalTreatment } from '@/features/pathways/types';
import {
  composeDuration,
  createEmptyRegimen,
  type TreatmentRegimenDraft,
} from '@/features/pathways/treatment-option-editor-constants';
import {
  inferProductForm,
  isMassOrDoseUnit,
  reconcileRegimenUse,
} from '@/features/pathways/product-use-mapping';
import type { DurationUnit, RegimenLineDraft } from '@/features/consultations/add-treatment/types';
import { emptyRegimenLine } from '@/features/consultations/add-treatment/constants';
import { resolveFormValue } from '@/features/consultations/add-treatment/form-options';
import { resolveFrequencyValue } from '@/features/consultations/add-treatment/frequency-options';

export type StoredRegimenLine = {
  clientId?: string;
  sequence: number;
  doseFrom: string;
  doseTo: string | null;
  form: string;
  frequency: string;
  prn: boolean;
  durationValue: string | null;
  durationUnit: DurationUnit | null;
};

function parseDuration(
  raw?: string | null,
): { value: string | null; unit: DurationUnit | null } {
  const text = (raw ?? '').trim();
  if (!text) return { value: null, unit: null };
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)\b/i);
  if (!match) {
    if (/^\d+$/.test(text)) return { value: text, unit: 'DAY' };
    return { value: null, unit: null };
  }
  const unitRaw = match[2].toLowerCase();
  const unit = unitRaw.startsWith('week') ? 'WEEK' : unitRaw.startsWith('month') ? 'MONTH' : 'DAY';
  return { value: match[1], unit };
}

function durationUnitToRegimen(unit: DurationUnit | null): 'Days' | 'Weeks' | 'Months' {
  if (unit === 'WEEK') return 'Weeks';
  if (unit === 'MONTH') return 'Months';
  return 'Days';
}

function durationUnitFromStored(raw: unknown): DurationUnit | null {
  if (raw === 'DAY' || raw === 'WEEK' || raw === 'MONTH') return raw;
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.startsWith('week')) return 'WEEK';
  if (value.startsWith('month')) return 'MONTH';
  if (value.startsWith('day')) return 'DAY';
  return null;
}

export function persistDoseTo(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function serializeRegimenLines(lines: RegimenLineDraft[]): StoredRegimenLine[] {
  return lines.map((line, index) => ({
    clientId: line.clientId,
    sequence: index + 1,
    doseFrom: line.doseFrom,
    doseTo: persistDoseTo(line.doseTo),
    form: line.form,
    frequency: line.frequency,
    prn: Boolean(line.prn),
    durationValue:
      line.durationValue != null && line.durationValue.trim() !== ''
        ? line.durationValue.trim()
        : null,
    durationUnit: line.durationUnit,
  }));
}

export function storedLinesFromUnknown(raw: unknown): StoredRegimenLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): StoredRegimenLine | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const doseFrom = String(row.doseFrom ?? '').trim();
      const frequency = String(row.frequency ?? '').trim();
      const form = String(row.form ?? '').trim();
      if (!doseFrom && !frequency && !form) return null;
      const doseToRaw = row.doseTo;
      return {
        clientId: typeof row.clientId === 'string' ? row.clientId : undefined,
        sequence: Number(row.sequence) || index + 1,
        doseFrom,
        doseTo: persistDoseTo(doseToRaw == null ? null : String(doseToRaw)),
        form,
        frequency,
        prn: Boolean(row.prn) || /prn|as needed/i.test(frequency),
        durationValue:
          row.durationValue == null || String(row.durationValue).trim() === ''
            ? null
            : String(row.durationValue).trim(),
        durationUnit: durationUnitFromStored(row.durationUnit),
      };
    })
    .filter((line): line is StoredRegimenLine => Boolean(line));
}

export function storedLinesToDrafts(stored: StoredRegimenLine[]): RegimenLineDraft[] {
  if (!stored.length) return [];
  return stored.map((line, index) =>
    emptyRegimenLine({
      ...line,
      clientId: line.clientId,
      sequence: line.sequence || index + 1,
      frequency: resolveFrequencyValue(line.frequency) || line.frequency,
    }),
  );
}

export function regimenToLines(regimen: TreatmentRegimenDraft): RegimenLineDraft[] {
  const duration = parseDuration(composeDuration(regimen.durationValue, regimen.durationUnit));
  const doseRange = regimen.dose.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  return [
    emptyRegimenLine({
      doseFrom: doseRange?.[1] ?? regimen.dose,
      doseTo: doseRange?.[2] ?? null,
      form: regimen.administrationUnit,
      frequency: resolveFrequencyValue(regimen.frequency),
      prn: /prn|as needed/i.test(regimen.frequency),
      durationValue: duration.value,
      durationUnit: duration.unit,
    }),
  ];
}

export function linesToRegimen(
  lines: RegimenLineDraft[],
  base: TreatmentRegimenDraft,
): TreatmentRegimenDraft {
  const line = lines[0] ?? emptyRegimenLine();
  const persistedTo = persistDoseTo(line.doseTo);
  const dose = persistedTo ? `${line.doseFrom}–${persistedTo}` : line.doseFrom;
  const durationValue = line.durationValue ?? base.durationValue;
  const durationUnit = durationUnitToRegimen(line.durationUnit);
  const reconciled = reconcileRegimenUse({
    productForm: base.productForm,
    route: base.route,
    administrationUnit: resolveFormValue(line.form) || line.form,
  });
  return {
    ...base,
    dose,
    administrationUnit: reconciled.administrationUnit,
    productForm: reconciled.productForm,
    route: reconciled.route || base.route,
    frequency: line.frequency,
    durationValue: durationValue ?? '',
    durationUnit,
  };
}

export function normalizeRegimenFromTreatment(
  raw: Partial<TreatmentRegimenDraft>,
  index: number,
  treatment: ClinicalTreatment,
): TreatmentRegimenDraft {
  const meta = (treatment.metadata ?? {}) as Record<string, unknown>;
  const parsed = parseDuration(
    raw.durationValue
      ? composeDuration(raw.durationValue, raw.durationUnit ?? 'Days')
      : treatment.duration,
  );
  const inferredForm =
    raw.productForm?.trim() ||
    (typeof meta.productForm === 'string' ? meta.productForm : '') ||
    inferProductForm(
      typeof meta.doseForm === 'string' ? meta.doseForm : undefined,
      [treatment.medicationName, treatment.brandName].filter(Boolean).join(' '),
    ) ||
    '';
  const legacyUnit = raw.administrationUnit || '';
  const reconciled = reconcileRegimenUse({
    productForm: inferredForm,
    route: raw.route ?? (index === 0 ? treatment.route ?? '' : ''),
    administrationUnit: isMassOrDoseUnit(legacyUnit) ? '' : legacyUnit,
  });
  const empty = createEmptyRegimen(index);
  return {
    id: raw.id || `regimen-${treatment.id}-${index}`,
    label: raw.label || empty.label,
    dose: raw.dose ?? (index === 0 ? treatment.dose ?? '' : ''),
    administrationUnit: reconciled.administrationUnit,
    productForm: reconciled.productForm,
    frequency: raw.frequency ?? (index === 0 ? treatment.frequency ?? '' : ''),
    route: reconciled.route,
    durationValue: raw.durationValue ?? parsed.value ?? '',
    durationUnit:
      raw.durationUnit ??
      (parsed.unit === 'WEEK' ? 'Weeks' : parsed.unit === 'MONTH' ? 'Months' : 'Days'),
  };
}

export function regimensFromTreatment(treatment: ClinicalTreatment): TreatmentRegimenDraft[] {
  const meta = treatment.metadata as { regimens?: Partial<TreatmentRegimenDraft>[] } | null;
  if (Array.isArray(meta?.regimens) && meta.regimens.length) {
    return meta.regimens.map((r, i) => normalizeRegimenFromTreatment(r, i, treatment));
  }
  return [normalizeRegimenFromTreatment({}, 0, treatment)];
}

export function linesFromTreatment(
  treatment: ClinicalTreatment,
  primary: TreatmentRegimenDraft,
): RegimenLineDraft[] {
  const meta = (treatment.metadata ?? {}) as Record<string, unknown>;
  const stored = storedLinesToDrafts(storedLinesFromUnknown(meta.regimenLines));
  if (stored.length) return stored;
  return regimenToLines(primary);
}

/**
 * Treatment plan confirmation helpers — fingerprint selected treatments so
 * counselling is only generated from a pharmacist-confirmed snapshot.
 */

export type TreatmentPlanConfirmStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'STALE';

export interface TreatmentPlanConfirmationMeta {
  confirmationId: string;
  confirmedAt: string;
  planVersion: number;
  planHash: string;
  selectedIndexes: number[];
  /** Display names at confirm time for audit / UI */
  selectedNames: string[];
  idempotencyKey?: string;
}

export interface TreatmentPlanConfirmationPayload {
  status: TreatmentPlanConfirmStatus;
  confirmation: TreatmentPlanConfirmationMeta | null;
}

/** Stable hash of selected treatments + regimens + overrides. */
export function computeTreatmentPlanHash(
  items: Array<Record<string, unknown>>,
): string {
  const normalized = items.map((t) => ({
    name: String(t.medicationName ?? t.genericName ?? '').trim().toLowerCase(),
    dose: String(t.dose ?? t.doseAmount ?? '').trim(),
    unit: String(t.doseUnit ?? '').trim(),
    frequency: String(t.frequency ?? '').trim(),
    route: String(t.route ?? '').trim(),
    duration: String(t.duration ?? '').trim(),
    override: t.clinicalOverride
      ? {
          reason: String(
            (t.clinicalOverride as { reason?: string }).reason ?? '',
          ).trim(),
          source: String(
            (t.clinicalOverride as { source?: string }).source ?? '',
          ).trim(),
        }
      : null,
  }));
  normalized.sort((a, b) => a.name.localeCompare(b.name));
  const raw = JSON.stringify(normalized);
  // FNV-1a 32-bit — fast, stable, no crypto dependency
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `tp_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function readTreatmentPlanConfirmation(
  treatmentPlan: unknown,
): TreatmentPlanConfirmationPayload {
  if (!treatmentPlan || typeof treatmentPlan !== 'object' || Array.isArray(treatmentPlan)) {
    return { status: 'DRAFT', confirmation: null };
  }
  const raw = treatmentPlan as Record<string, unknown>;
  const status =
    raw.confirmStatus === 'CONFIRMED' || raw.confirmStatus === 'STALE'
      ? (raw.confirmStatus as TreatmentPlanConfirmStatus)
      : 'DRAFT';
  const c = raw.confirmation;
  if (!c || typeof c !== 'object' || Array.isArray(c)) {
    return { status, confirmation: null };
  }
  const meta = c as Record<string, unknown>;
  if (
    typeof meta.confirmationId !== 'string' ||
    typeof meta.confirmedAt !== 'string' ||
    typeof meta.planHash !== 'string'
  ) {
    return { status, confirmation: null };
  }
  return {
    status,
    confirmation: {
      confirmationId: meta.confirmationId,
      confirmedAt: meta.confirmedAt,
      planVersion: typeof meta.planVersion === 'number' ? meta.planVersion : 1,
      planHash: meta.planHash,
      selectedIndexes: Array.isArray(meta.selectedIndexes)
        ? meta.selectedIndexes.filter((i): i is number => typeof i === 'number')
        : [],
      selectedNames: Array.isArray(meta.selectedNames)
        ? meta.selectedNames.filter((n): n is string => typeof n === 'string')
        : [],
      idempotencyKey:
        typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : undefined,
    },
  };
}

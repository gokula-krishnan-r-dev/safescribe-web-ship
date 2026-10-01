/**
 * Per-medication renewal duration validation and bulk apply/undo.
 * Bulk never overwrites clinical or manual constraints without an explicit pharmacist action.
 */

import {
  RENEW_CUSTOM_DURATION_LIMITS,
  RENEW_DURATION_OPTIONS,
  type RenewDurationBulkAction,
  type RenewDurationBulkResult,
  type RenewDurationBulkSnapshotItem,
  type RenewDurationId,
  type RenewMedicationPlanItem,
  type RenewSafetyTone,
} from './renew';

export interface RenewDurationSafetyTone {
  tone: RenewSafetyTone;
}

export type RenewalDurationValidation =
  | 'VALID'
  | 'MAXIMUM_EXCEEDED'
  | 'NOT_ALLOWED'
  | 'REQUIRES_INDIVIDUAL_REVIEW'
  | 'INSUFFICIENT_CONTEXT'
  | 'INVALID_VALUE'
  | 'MANUAL_OVERRIDE';

export type RenewDurationOption = (typeof RENEW_DURATION_OPTIONS)[number];

export function renewDurationOptions(): RenewDurationOption[] {
  return [...RENEW_DURATION_OPTIONS];
}

export function parseCustomDurationInput(
  raw: string | number | null | undefined,
): { days: number | null; error: string | null } {
  if (raw == null || raw === '') {
    return { days: null, error: 'Enter a valid number of days.' };
  }
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) {
    return { days: null, error: 'Enter a valid number of days.' };
  }
  const days = Number(trimmed);
  if (!Number.isInteger(days) || days < RENEW_CUSTOM_DURATION_LIMITS.min) {
    return { days: null, error: 'Enter a valid number of days.' };
  }
  if (days > RENEW_CUSTOM_DURATION_LIMITS.max) {
    return { days: null, error: 'Enter a valid number of days.' };
  }
  return { days, error: null };
}

export function requestedDurationLabel(
  durationId: RenewDurationId | null,
  customDurationDays?: number | null,
): string {
  if (!durationId) return 'Duration';
  if (durationId === 'custom') {
    if (customDurationDays && customDurationDays > 0) return `Custom ${customDurationDays} days`;
    return 'Custom duration';
  }
  return RENEW_DURATION_OPTIONS.find((option) => option.id === durationId)?.label ?? durationId;
}

export function validateRenewalDuration(input: {
  durationId: RenewDurationId | null;
  customDurationDays?: number | null;
  safetyTone: RenewSafetyTone;
  mode: 'bulk' | 'confirm';
}): { status: RenewalDurationValidation; message: string | null } {
  const { durationId, customDurationDays, safetyTone, mode } = input;
  if (!durationId) {
    return { status: 'INSUFFICIENT_CONTEXT', message: 'Select a renewal duration.' };
  }
  if (!RENEW_DURATION_OPTIONS.some((option) => option.id === durationId)) {
    return { status: 'NOT_ALLOWED', message: 'That duration is not available for this renewal.' };
  }
  if (durationId === 'custom') {
    const parsed = parseCustomDurationInput(customDurationDays);
    if (parsed.error || parsed.days == null) {
      return {
        status:
          typeof customDurationDays === 'number' && customDurationDays > RENEW_CUSTOM_DURATION_LIMITS.max
            ? 'MAXIMUM_EXCEEDED'
            : 'INVALID_VALUE',
        message: parsed.error ?? 'Enter a valid number of days.',
      };
    }
  }
  if (mode === 'bulk' && safetyTone === 'review') {
    return {
      status: 'REQUIRES_INDIVIDUAL_REVIEW',
      message: 'Individual review needed',
    };
  }
  return { status: 'VALID', message: null };
}

export function planConfirmIssues(
  items: RenewMedicationPlanItem[],
): Array<{ medicationId: string; message: string }> {
  const selected = items.filter((row) => row.selected);
  if (!selected.length) {
    return [{ medicationId: '', message: 'Select at least one medication to renew.' }];
  }
  const issues: Array<{ medicationId: string; message: string }> = [];
  for (const row of selected) {
    const result = validateRenewalDuration({
      durationId: row.durationId,
      customDurationDays: row.customDurationDays,
      safetyTone: 'clear',
      mode: 'confirm',
    });
    if (result.status !== 'VALID') {
      issues.push({
        medicationId: row.medicationId,
        message: result.message ?? 'This medication needs review before confirming.',
      });
    }
  }
  return issues;
}

export function confirmPlanIncompleteCopy(issueCount: number): string {
  if (issueCount <= 0) return '';
  if (issueCount === 1) return '1 medication needs review before confirming.';
  return `${issueCount} medications need review before confirming.`;
}

function formatDurationLabel(
  item: Pick<RenewMedicationPlanItem, 'durationId' | 'customDurationDays' | 'customDurationText'>,
): string | null {
  if (!item.durationId) return null;
  if (item.durationId === 'custom') {
    if (item.customDurationDays && item.customDurationDays > 0) {
      return `${item.customDurationDays} days`;
    }
    return item.customDurationText?.trim() || 'Custom';
  }
  return RENEW_DURATION_OPTIONS.find((option) => option.id === item.durationId)?.label ?? null;
}

export function confirmedPlanDurationSummary(items: RenewMedicationPlanItem[]): string {
  const selected = items.filter((row) => row.selected);
  const meds = `${selected.length} medication${selected.length === 1 ? '' : 's'}`;
  if (!selected.length) return meds;
  const counts = new Map<string, number>();
  for (const row of selected) {
    const label = formatDurationLabel(row) ?? 'duration pending';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([label, count]) => `${count} at ${label}`);
  return [meds, ...parts].join(' · ');
}

function snapshotItem(row: RenewMedicationPlanItem): RenewDurationBulkSnapshotItem {
  return {
    medicationId: row.medicationId,
    durationId: row.durationId,
    customDurationDays: row.customDurationDays,
    customDurationText: row.customDurationText,
    durationSource: row.durationSource,
    durationBulkActionId: row.durationBulkActionId,
    durationApplyNote: row.durationApplyNote,
  };
}

function newBulkActionId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function skipNote(requestedLabel: string, status: RenewalDurationValidation): string | null {
  if (status === 'REQUIRES_INDIVIDUAL_REVIEW') {
    return `${requestedLabel} not applied — individual review needed`;
  }
  if (status === 'MAXIMUM_EXCEEDED') {
    return `${requestedLabel} not applied — exceeds the allowed maximum`;
  }
  if (status === 'NOT_ALLOWED') {
    return `${requestedLabel} not applied — not allowed for this medication`;
  }
  if (status === 'INVALID_VALUE' || status === 'INSUFFICIENT_CONTEXT') {
    return `${requestedLabel} not applied — enter a valid duration`;
  }
  return null;
}

export function applyBulkDuration(
  items: RenewMedicationPlanItem[],
  safetyById: Map<string, RenewDurationSafetyTone>,
  input: {
    durationId: RenewDurationId;
    customDurationDays?: number | null;
    overwriteManual?: boolean;
  },
): {
  items: RenewMedicationPlanItem[];
  bulk: RenewDurationBulkAction;
  result: RenewDurationBulkResult;
} {
  const requestedLabel = requestedDurationLabel(input.durationId, input.customDurationDays);
  const customDurationText =
    input.durationId === 'custom' && input.customDurationDays
      ? `${input.customDurationDays} days`
      : null;
  const bulkActionId = newBulkActionId();
  const appliedIds: string[] = [];
  const skippedIds: string[] = [];
  let skippedReviewCount = 0;
  let preservedManualCount = 0;
  const snapshots: RenewDurationBulkSnapshotItem[] = [];

  const next = items.map((row) => {
    if (!row.selected) return row;
    snapshots.push(snapshotItem(row));
    if (row.durationSource === 'MANUAL' && !input.overwriteManual) {
      skippedIds.push(row.medicationId);
      preservedManualCount += 1;
      return row;
    }
    const safety = safetyById.get(row.medicationId);
    const validation = validateRenewalDuration({
      durationId: input.durationId,
      customDurationDays: input.customDurationDays,
      safetyTone: safety?.tone ?? 'clear',
      mode: 'bulk',
    });
    if (validation.status !== 'VALID') {
      skippedIds.push(row.medicationId);
      if (validation.status === 'REQUIRES_INDIVIDUAL_REVIEW') skippedReviewCount += 1;
      return {
        ...row,
        durationApplyNote: skipNote(requestedLabel, validation.status),
      };
    }
    appliedIds.push(row.medicationId);
    return {
      ...row,
      durationId: input.durationId,
      customDurationDays: input.durationId === 'custom' ? (input.customDurationDays ?? null) : null,
      customDurationText: input.durationId === 'custom' ? customDurationText : null,
      durationSource: 'BULK' as const,
      durationBulkActionId: bulkActionId,
      durationApplyNote: null,
    };
  });

  const result: RenewDurationBulkResult = {
    bulkActionId,
    requestedLabel,
    appliedCount: appliedIds.length,
    skippedCount: skippedIds.length,
    skippedReviewCount,
    preservedManualCount,
    canUndo: appliedIds.length > 0,
  };

  return {
    items: next,
    bulk: {
      bulkActionId,
      requestedDurationId: input.durationId,
      requestedCustomDays: input.customDurationDays ?? null,
      requestedLabel,
      createdAt: new Date().toISOString(),
      snapshots,
      appliedIds,
      skippedIds,
    },
    result,
  };
}

export function undoBulkDuration(
  items: RenewMedicationPlanItem[],
  bulk: RenewDurationBulkAction,
): RenewMedicationPlanItem[] {
  const previous = new Map(bulk.snapshots.map((row) => [row.medicationId, row]));
  const applied = new Set(bulk.appliedIds);
  const skipped = new Set(bulk.skippedIds);
  return items.map((row) => {
    const snapshot = previous.get(row.medicationId);
    if (!snapshot) return row;
    if (applied.has(row.medicationId)) {
      const stillOwned =
        row.durationSource === 'BULK' && row.durationBulkActionId === bulk.bulkActionId;
      if (!stillOwned) return row;
      return {
        ...row,
        durationId: snapshot.durationId,
        customDurationDays: snapshot.customDurationDays,
        customDurationText: snapshot.customDurationText,
        durationSource: snapshot.durationSource,
        durationBulkActionId: snapshot.durationBulkActionId,
        durationApplyNote: snapshot.durationApplyNote,
      };
    }
    if (skipped.has(row.medicationId) && row.durationApplyNote === snapshot.durationApplyNote) {
      return { ...row, durationApplyNote: snapshot.durationApplyNote };
    }
    if (
      skipped.has(row.medicationId) &&
      row.durationApplyNote &&
      row.durationApplyNote.includes('not applied')
    ) {
      return { ...row, durationApplyNote: snapshot.durationApplyNote };
    }
    return row;
  });
}

export function bulkDurationResultCopy(result: RenewDurationBulkResult): {
  success: string | null;
  warning: string | null;
} {
  const appliedLabel = result.requestedLabel.replace(/^Custom /, '');
  const success =
    result.appliedCount > 0
      ? `${appliedLabel} applied to ${result.appliedCount} medication${
          result.appliedCount === 1 ? '' : 's'
        }.`
      : null;
  const warning =
    result.skippedReviewCount > 0
      ? `${result.skippedReviewCount} medication${
          result.skippedReviewCount === 1 ? '' : 's'
        } require${result.skippedReviewCount === 1 ? 's' : ''} individual review.`
      : null;
  return { success, warning };
}

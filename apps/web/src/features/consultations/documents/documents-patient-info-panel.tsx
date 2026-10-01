'use client';

import { useEffect, useId, useState } from 'react';
import { CalendarDays, Loader2, Pencil, User } from 'lucide-react';
import {
  dateOfBirthError,
  documentationDobFieldError,
  formatConfirmedAge,
  validateOptionalDob,
  type ConfirmedAge,
  type RecordedAgeOrigin,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import {
  finalizePatientDocumentInfo,
  formatPatientAddressInline,
  formatPatientAddressLine,
} from './patient-address';
import { formatPhnDigits, optionalPhnError } from './phn';
import { formatNanpPhoneDisplay, formatNanpPhoneInput, optionalPhoneError } from './phone';
import type { PatientDocumentInfo } from './types';

export type DocumentsPatientInfoPanelProps = {
  value: PatientDocumentInfo;
  /** Persist draft while editing (does not touch document packages). */
  onDraftChange?: (info: PatientDocumentInfo) => void;
  /** Apply identity to all open documents (Save). */
  onSave: (info: PatientDocumentInfo) => void | Promise<void>;
  /**
   * Skip patient details — hide this panel and continue document generation
   * without patient identity on headers.
   */
  onSkip?: () => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
  className?: string;
  /** Recorded age from intake or conversation, used to catch a mismatched DOB. */
  recordedAge?: ConfirmedAge | null;
  recordedAgeOrigin?: RecordedAgeOrigin;
  consultationDate?: string;
};

type Draft = {
  name: string;
  dateOfBirth: string;
  patientId: string;
  phone: string;
  address: string;
};

function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function toDraft(info: PatientDocumentInfo): Draft {
  return {
    name: info.name ?? '',
    dateOfBirth: info.dateOfBirth ?? '',
    patientId: info.patientId ?? '',
    phone: formatNanpPhoneDisplay(info.phone ?? ''),
    address: formatPatientAddressInline(info.addressLines, info.address) || '',
  };
}

function draftFingerprint(draft: Draft): string {
  return [
    draft.name.trim(),
    draft.dateOfBirth.trim(),
    draft.patientId.trim(),
    draft.phone.trim(),
    draft.address.trim(),
  ].join('|');
}

function buildInfo(
  draft: Draft,
  previous: PatientDocumentInfo,
  skipped = false,
): PatientDocumentInfo {
  return finalizePatientDocumentInfo({
    ...previous,
    name: draft.name,
    dateOfBirth: draft.dateOfBirth,
    patientId: draft.patientId,
    phone: draft.phone,
    addressLines: undefined,
    address: draft.address,
    skipped,
  });
}

function emptySkippedInfo(previous: PatientDocumentInfo): PatientDocumentInfo {
  return finalizePatientDocumentInfo({
    ...previous,
    name: '',
    dateOfBirth: '',
    patientId: '',
    phone: '',
    addressLines: undefined,
    address: '',
    skipped: true,
  });
}

function dobAgeError(
  dob: string,
  recordedAge: ConfirmedAge | null | undefined,
  consultationDate: string | undefined,
  origin: RecordedAgeOrigin,
): string | null {
  if (!recordedAge || !consultationDate) return null;
  const trimmed = dob.trim();
  if (!trimmed || trimmed.length < 10) return null;
  return documentationDobFieldError(
    validateOptionalDob({ dob: trimmed, recordedAge, consultationDate }),
    origin,
  );
}

function softValidate(
  draft: Draft,
  opts?: {
    recordedAge?: ConfirmedAge | null;
    recordedAgeOrigin?: RecordedAgeOrigin;
    consultationDate?: string;
    requireCompleteDob?: boolean;
  },
): Partial<Record<'name' | 'dateOfBirth' | 'patientId' | 'phone', string>> {
  const errors: Partial<Record<'name' | 'dateOfBirth' | 'patientId' | 'phone', string>> =
    {};
  if (draft.name.trim() && draft.name.trim().length < 2) {
    errors.name = 'Enter at least 2 characters, or leave blank.';
  }
  const dob = draft.dateOfBirth.trim();
  if (dob) {
    const incomplete = dob.length < 10;
    if (incomplete) {
      if (opts?.requireCompleteDob) {
        errors.dateOfBirth = 'Use YYYY-MM-DD.';
      }
    } else {
      const dobError = dateOfBirthError(dob);
      if (dobError && dobError !== 'Required') {
        errors.dateOfBirth =
          dobError === 'Enter a valid date.' ? 'Use YYYY-MM-DD.' : dobError;
      } else {
        const mismatch = dobAgeError(
          dob,
          opts?.recordedAge,
          opts?.consultationDate,
          opts?.recordedAgeOrigin ?? 'intake',
        );
        if (mismatch) errors.dateOfBirth = mismatch;
      }
    }
  }
  const phnError = optionalPhnError(draft.patientId);
  if (phnError) errors.patientId = phnError;
  const phoneError = optionalPhoneError(draft.phone);
  if (phoneError) errors.phone = phoneError;
  return errors;
}

const inputClassName = cn(
  'h-10 w-full rounded-[9px] border border-[#cbdde2] bg-white px-3 text-[14px] text-[#111827]',
  'transition-[border-color,box-shadow] placeholder:text-[#8a969f]',
  'hover:border-[#91b8c1]',
  'focus-visible:border-[#0f817c] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-[rgba(15,129,124,0.15)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Patient-details strip for Consultation Documents.
 * Always open for entry. Skip dismisses the panel and continues without identity;
 * Save applies identity across open documents.
 */
export function DocumentsPatientInfoPanel({
  value,
  onDraftChange,
  onSave,
  onSkip,
  saving = false,
  disabled = false,
  className,
  recordedAge = null,
  recordedAgeOrigin = 'intake',
  consultationDate,
}: DocumentsPatientInfoPanelProps) {
  const formId = useId();
  const committed = toDraft(value);
  const [draft, setDraft] = useState(committed);
  const [errors, setErrors] = useState<ReturnType<typeof softValidate>>({});
  const [skipping, setSkipping] = useState(false);
  const [editing, setEditing] = useState(() => {
    const d = toDraft(value);
    return !(
      d.name.trim() ||
      d.dateOfBirth.trim() ||
      d.patientId.trim() ||
      d.phone.trim() ||
      d.address.trim()
    );
  });
  const validateOpts = {
    recordedAge,
    recordedAgeOrigin,
    consultationDate,
  };
  const liveDobError = dobAgeError(
    draft.dateOfBirth,
    recordedAge,
    consultationDate,
    recordedAgeOrigin,
  );
  const shownErrors = {
    ...errors,
    dateOfBirth: liveDobError ?? errors.dateOfBirth,
  };

  // Sync from parent by field content — not object identity. Renew rebuilds `value`
  // on every keystroke (extras), which used to wipe Name/DOB/PHN mid-edit.
  const valueSyncKey = draftFingerprint(toDraft(value));
  useEffect(() => {
    setDraft((prev) => {
      const next = toDraft(value);
      return draftFingerprint(prev) === draftFingerprint(next) ? prev : next;
    });
    // valueSyncKey captures the meaningful fields; `value` is read for the latest snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content-key sync
  }, [valueSyncKey]);

  if (value.skipped) return null;

  const dirty = draftFingerprint(draft) !== draftFingerprint(committed);
  const busy = saving || disabled || skipping;
  /** Before first confirm/skip, Save can confirm even with blank optional fields. */
  const awaitingFirstConfirm = Boolean(onSkip);
  const saveEnabled =
    !busy && !liveDobError && (dirty || awaitingFirstConfirm);

  const patch = (next: Partial<Draft>) => {
    setDraft((prev) => {
      const merged = { ...prev, ...next };
      onDraftChange?.(buildInfo(merged, value, false));
      return merged;
    });
    setErrors({});
  };

  const handleSkip = async () => {
    if (busy || !onSkip) return;
    setSkipping(true);
    setErrors({});
    try {
      const skipped = emptySkippedInfo(value);
      onDraftChange?.(skipped);
      await onSkip();
    } finally {
      setSkipping(false);
    }
  };

  const handleSave = async () => {
    const nextErrors = softValidate(draft, {
      ...validateOpts,
      requireCompleteDob: true,
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    await onSave(buildInfo(draft, value, false));
    setEditing(false);
  };

  const summaryValue = (raw: string, empty: string) => {
    const v = raw.trim();
    return v || empty;
  };

  if (!editing) {
    return (
      <section
        className={cn(
          'documents-patient-info overflow-hidden rounded-xl border border-[#c7dde2] bg-[#f4fafb]',
          'shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
          className,
        )}
      >
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0f7e99] shadow-sm">
                <User className="h-4 w-4" aria-hidden />
              </div>
              <h2 className="text-[14px] font-semibold text-[#111827]">Patient details</h2>
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 text-[13px] min-[900px]:grid-cols-5">
              {(
                [
                  ['Name', summaryValue(committed.name, 'Not entered')],
                  ['DOB', summaryValue(committed.dateOfBirth, 'Not entered')],
                  ['PHN', summaryValue(committed.patientId, 'Not entered')],
                  ['Phone', summaryValue(committed.phone, 'Not provided')],
                  ['Address', summaryValue(committed.address, 'Not provided')],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
                    {label}
                  </dt>
                  <dd
                    className={cn(
                      'mt-0.5 truncate font-medium',
                      val.startsWith('Not ') ? 'text-[#8a969f]' : 'text-[#111827]',
                    )}
                    title={val}
                  >
                    {val}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-[8px] border border-[#0f7e99] bg-white px-3.5 text-[13px] font-semibold text-[#0f7e99] hover:bg-[#f0f9fb] disabled:opacity-60 sm:self-center"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit details
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'documents-patient-info overflow-hidden rounded-xl border border-[#d5e2e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
        className,
      )}
    >
      <div id={`${formId}-body`} className="px-4 py-3.5">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f4f8] text-[#0f7e99]">
            <User className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-[#111827]">Patient details</h2>
            <p className="text-[12px] text-[#58636f]">
              Optional — included on document headers when provided.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2 min-[1100px]:grid-cols-5">
          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
              Name
            </span>
            <input
              className={inputClassName}
              value={draft.name}
              disabled={busy}
              placeholder="e.g., Jane Smith"
              autoComplete="name"
              autoFocus
              onChange={(e) => patch({ name: e.target.value })}
            />
            {errors.name ? (
              <p className="text-[12px] text-destructive" role="alert">
                {errors.name}
              </p>
            ) : null}
          </label>

          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
              DOB
            </span>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a8792]"
                aria-hidden
              />
              <input
                className={cn(
                  inputClassName,
                  'pl-9',
                  shownErrors.dateOfBirth &&
                    'border-destructive focus-visible:border-destructive',
                )}
                value={draft.dateOfBirth}
                disabled={busy}
                placeholder="YYYY-MM-DD"
                inputMode="numeric"
                autoComplete="bday"
                aria-invalid={Boolean(shownErrors.dateOfBirth)}
                onChange={(e) => patch({ dateOfBirth: formatDobInput(e.target.value) })}
              />
            </div>
            {shownErrors.dateOfBirth ? (
              <p className="text-[12px] leading-snug text-destructive" role="alert">
                {shownErrors.dateOfBirth}
              </p>
            ) : recordedAge ? (
              <p className="text-[11px] leading-snug text-[#7a8792]">
                Must match {formatConfirmedAge(recordedAge)}
                {recordedAgeOrigin === 'conversation'
                  ? ' mentioned in the conversation summary'
                  : ' recorded at intake'}
                .
              </p>
            ) : null}
          </label>

          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
              PHN
            </span>
            <input
              className={cn(
                inputClassName,
                errors.patientId && 'border-destructive focus-visible:border-destructive',
              )}
              value={draft.patientId}
              disabled={busy}
              placeholder="e.g., 123456789"
              inputMode="numeric"
              autoComplete="off"
              maxLength={9}
              pattern="[0-9]{9}"
              aria-invalid={Boolean(errors.patientId)}
              onChange={(e) => patch({ patientId: formatPhnDigits(e.target.value) })}
            />
            {errors.patientId ? (
              <p className="text-[12px] text-destructive" role="alert">
                {errors.patientId}
              </p>
            ) : null}
          </label>

          <label className="min-w-0 space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
              Phone
            </span>
            <input
              className={cn(
                inputClassName,
                errors.phone && 'border-destructive focus-visible:border-destructive',
              )}
              value={draft.phone}
              disabled={busy}
              placeholder="e.g., 780-555-0123"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              onChange={(e) => {
                const el = e.currentTarget;
                const next = formatNanpPhoneInput(
                  el.value,
                  el.selectionStart ?? el.value.length,
                );
                patch({ phone: next.value });
                requestAnimationFrame(() => {
                  try {
                    el.setSelectionRange(next.caret, next.caret);
                  } catch {
                    /* input unmounted */
                  }
                });
              }}
            />
            {errors.phone ? (
              <p className="text-[12px] text-destructive" role="alert">
                {errors.phone}
              </p>
            ) : null}
          </label>

          <label className="min-w-0 space-y-1 min-[641px]:col-span-2 min-[1100px]:col-span-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#7a8792]">
              Address
            </span>
            <input
              className={inputClassName}
              value={draft.address}
              disabled={busy}
              placeholder="e.g., 123 Jasper Avenue, Edmonton, AB"
              autoComplete="street-address"
              onChange={(e) => patch({ address: e.target.value })}
              onBlur={(e) => {
                const formatted = formatPatientAddressLine(e.currentTarget.value);
                if (formatted !== e.currentTarget.value) {
                  patch({ address: formatted });
                }
              }}
            />
          </label>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
          {onSkip ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSkip()}
              className="inline-flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-[8px] border border-[#c5d4da] bg-white px-3.5 text-[13px] font-semibold text-[#25303b] hover:bg-[#f7fafb] disabled:opacity-60"
            >
              {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Skip
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(committed);
                setErrors({});
                setEditing(false);
              }}
              className="inline-flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-[8px] border border-[#c5d4da] bg-white px-3.5 text-[13px] font-semibold text-[#25303b] hover:bg-[#f7fafb] disabled:opacity-60"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!saveEnabled}
            onClick={() => void handleSave()}
            className="inline-flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-[8px] bg-[#0f7e99] px-3.5 text-[13px] font-semibold text-white hover:bg-[#0c6d85] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </section>
  );
}

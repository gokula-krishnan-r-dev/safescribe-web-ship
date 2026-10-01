'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatNanpPhoneDisplay,
  formatNanpPhoneInput,
  optionalPhoneError,
} from '@/features/consultations/documents/phone';
import { formatPhnDigits, optionalPhnError } from '@/features/consultations/documents/phn';
import type { PatientDocumentInfo } from '@/features/consultations/documents/types';

export interface AdaptPatientInfoPanelProps {
  value: PatientDocumentInfo;
  onDraftChange?: (info: PatientDocumentInfo) => void;
  onSave: (info: PatientDocumentInfo) => void | Promise<void>;
  onSkip?: () => void | Promise<void>;
  saving?: boolean;
  disabled?: boolean;
  className?: string;
  isConfirmed?: boolean;
}

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
    address: info.address ?? '',
  };
}

export function AdaptPatientInfoPanel({
  value,
  onDraftChange,
  onSave,
  onSkip,
  saving = false,
  disabled = false,
  className,
  isConfirmed = false,
}: AdaptPatientInfoPanelProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [skipping, setSkipping] = useState(false);

  // Sync draft if value prop changes externally (e.g. initial load)
  useEffect(() => {
    setDraft(toDraft(value));
  }, [value.name, value.dateOfBirth, value.patientId, value.phone, value.address]);

  const patch = useCallback(
    (next: Partial<Draft>) => {
      setDraft((prev) => {
        const merged = { ...prev, ...next };
        onDraftChange?.({
          ...value,
          name: merged.name,
          dateOfBirth: merged.dateOfBirth,
          patientId: merged.patientId,
          phone: merged.phone,
          address: merged.address,
        });
        return merged;
      });
      setErrors({});
    },
    [onDraftChange, value],
  );

  const validate = (): boolean => {
    const errs: Partial<Record<keyof Draft, string>> = {};
    if (draft.name.trim() && draft.name.trim().length < 2) {
      errs.name = 'Minimum 2 characters';
    }
    if (draft.dateOfBirth.trim() && draft.dateOfBirth.trim().length < 10) {
      errs.dateOfBirth = 'Use YYYY-MM-DD';
    }
    const phnErr = optionalPhnError(draft.patientId);
    if (phnErr) {
      errs.patientId = phnErr;
    }
    const phoneErr = optionalPhoneError(draft.phone);
    if (phoneErr) {
      errs.phone = phoneErr;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    await onSave({
      ...value,
      name: draft.name.trim(),
      dateOfBirth: draft.dateOfBirth.trim(),
      patientId: draft.patientId.trim(),
      phone: draft.phone.trim(),
      address: draft.address.trim(),
      skipped: false,
    });
  };

  const handleSkip = async () => {
    if (!onSkip || skipping) return;
    setSkipping(true);
    try {
      await onSkip();
    } finally {
      setSkipping(false);
    }
  };

  const busy = saving || disabled || skipping;

  return (
    <section
      className={cn(
        'documents-patient-info rounded-xl border border-[#c7dde2] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
        className,
      )}
    >
      {/* Header Row: Title, Status Badge, and Save/Skip Actions */}
      <div className="flex flex-col gap-3 pb-3 border-b border-[#eef3f5] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8f4f8] text-[#0f7e99] shadow-sm">
            <User className="h-4 w-4" aria-hidden />
          </div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[14px] font-bold text-[#111827]">Patient details</h2>
            {isConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f6f5] border border-[#a3dad4] px-2.5 py-0.5 text-[11px] font-semibold text-[#0f766e]">
                <Check className="h-3 w-3" aria-hidden />
                Details confirmed
              </span>
            ) : value.skipped ? (
              <span className="inline-flex items-center rounded-full bg-[#f1f5f9] border border-[#cbd5e1] px-2.5 py-0.5 text-[11px] font-semibold text-[#64748b]">
                Skipped
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[#fff8eb] border border-[#f5d59f] px-2.5 py-0.5 text-[11px] font-semibold text-[#b45309]">
                Confirmation required
              </span>
            )}
          </div>
        </div>

        {/* Buttons: Skip & Save */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {onSkip ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSkip()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#c5d4da] bg-white px-4 text-[13px] font-semibold text-[#334155] hover:bg-[#f8fafc] hover:text-[#0f172a] disabled:opacity-50 transition-colors"
            >
              {skipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Skip
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#008CA4] px-5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#007a8f] disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isConfirmed ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {isConfirmed ? 'Update & Save' : 'Save Details'}
          </button>
        </div>
      </div>

      {/* Editable Fields Grid: Always ready to edit */}
      <div className="pt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Name */}
        <label className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748b]">
            Name
          </span>
          <input
            className={cn(
              'h-9 w-full rounded-lg border border-[#cbdde2] bg-white px-3 text-[13.5px] font-medium text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#008CA4]/20 transition-all',
              errors.name && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            )}
            value={draft.name}
            disabled={busy}
            placeholder="First Last"
            autoComplete="name"
            onChange={(e) => patch({ name: e.target.value })}
          />
          {errors.name ? (
            <p className="text-[11px] font-medium text-destructive">{errors.name}</p>
          ) : null}
        </label>

        {/* DOB */}
        <label className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748b]">
            DOB
          </span>
          <div className="relative">
            <CalendarDays
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7a8792]"
              aria-hidden
            />
            <input
              className={cn(
                'h-9 w-full rounded-lg border border-[#cbdde2] bg-white pl-9 pr-3 text-[13.5px] font-medium text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#008CA4]/20 transition-all',
                errors.dateOfBirth && 'border-destructive focus:border-destructive focus:ring-destructive/20',
              )}
              value={draft.dateOfBirth}
              disabled={busy}
              placeholder="YYYY-MM-DD"
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => patch({ dateOfBirth: formatDobInput(e.target.value) })}
            />
          </div>
          {errors.dateOfBirth ? (
            <p className="text-[11px] font-medium text-destructive">{errors.dateOfBirth}</p>
          ) : null}
        </label>

        {/* PHN */}
        <label className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748b]">
            PHN
          </span>
          <input
            className={cn(
              'h-9 w-full rounded-lg border border-[#cbdde2] bg-white px-3 text-[13.5px] font-medium text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#008CA4]/20 transition-all',
              errors.patientId && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            )}
            value={draft.patientId}
            disabled={busy}
            placeholder="e.g., 123456789"
            inputMode="numeric"
            maxLength={9}
            onChange={(e) => patch({ patientId: formatPhnDigits(e.target.value) })}
          />
          {errors.patientId ? (
            <p className="text-[11px] font-medium text-destructive">{errors.patientId}</p>
          ) : null}
        </label>

        {/* Phone */}
        <label className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748b]">
            Phone
          </span>
          <input
            className={cn(
              'h-9 w-full rounded-lg border border-[#cbdde2] bg-white px-3 text-[13.5px] font-medium text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#008CA4]/20 transition-all',
              errors.phone && 'border-destructive focus:border-destructive focus:ring-destructive/20',
            )}
            value={draft.phone}
            disabled={busy}
            placeholder="e.g., (403) 555-0123"
            inputMode="tel"
            onChange={(e) => {
              const el = e.currentTarget;
              const next = formatNanpPhoneInput(el.value, el.selectionStart ?? el.value.length);
              patch({ phone: next.value });
            }}
          />
          {errors.phone ? (
            <p className="text-[11px] font-medium text-destructive">{errors.phone}</p>
          ) : null}
        </label>

        {/* Address */}
        <label className="min-w-0 space-y-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748b]">
            Address
          </span>
          <input
            className="h-9 w-full rounded-lg border border-[#cbdde2] bg-white px-3 text-[13.5px] font-medium text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#008CA4] focus:outline-none focus:ring-2 focus:ring-[#008CA4]/20 transition-all"
            value={draft.address}
            disabled={busy}
            placeholder="e.g., 123 Street NW, Calgary, AB"
            autoComplete="street-address"
            onChange={(e) => patch({ address: e.target.value })}
          />
        </label>
      </div>
    </section>
  );
}

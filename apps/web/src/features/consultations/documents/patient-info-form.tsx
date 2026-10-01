'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, Loader2, MapPin, User } from 'lucide-react';
import {
  displayDob,
  formatConfirmedAge,
  type AgeCaptureMode,
  type ConfirmedAge,
} from '@safescript/shared';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import {
  addressFromPatientInfo,
  CA_PROVINCES,
  finalizePatientDocumentInfo,
  isValidCanadianPostalCode,
  normalizePostalCode,
} from './patient-address';
import { formatPhnDigits, optionalPhnError } from './phn';
import { formatNanpPhoneDisplay, formatNanpPhoneInput, optionalPhoneError } from './phone';
import type { PatientAddress, PatientDocumentInfo } from './types';
import { useOptionalDobValidation } from './use-optional-dob';
import {
  AgeDobResolutionDialog,
  DocumentActionLockHint,
  OptionalDobFieldStatus,
  OptionalDobMismatchAlert,
  OptionalDobNetworkError,
} from './optional-dob-ui';

interface Props {
  initial?: PatientDocumentInfo;
  onContinue: (info: PatientDocumentInfo) => void;
  /** Parent-driven busy state (document generation starting). */
  loading?: boolean;
  /** Fired as the pharmacist types so Back/Next can restore the draft. */
  onDraftChange?: (info: PatientDocumentInfo) => void;
  optionalDob?: {
    consultationId: string;
    snapshotVersion: number;
    intakeMode: AgeCaptureMode;
    recordedAge: ConfirmedAge | null;
    consultationDate: string;
    onReviewAge?: () => void;
  };
}

type FieldErrors = Partial<
  Record<'name' | 'dateOfBirth' | 'patientId' | 'phone' | 'postalCode', string>
>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keep DOB entry as YYYY-MM-DD while typing digits. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/**
 * Soft validation only — every patient field is optional.
 * When a value is entered, check format so documents stay clean.
 */
function validateFields(
  values: {
    name: string;
    dateOfBirth: string;
    patientId: string;
    phone: string;
    address: PatientAddress;
  },
  opts?: { skipDob?: boolean; consultationDate?: string },
): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const dob = values.dateOfBirth.trim();
  const patientId = values.patientId.trim();
  const postal = values.address.postalCode?.trim() ?? '';

  if (name && name.length < 2) {
    errors.name = 'Enter at least 2 characters, or leave blank.';
  }

  if (dob && !opts?.skipDob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errors.dateOfBirth = 'Use YYYY-MM-DD format.';
    } else {
      const parsed = new Date(`${dob}T00:00:00`);
      const maxDate = opts?.consultationDate || todayIso();
      if (Number.isNaN(parsed.getTime())) {
        errors.dateOfBirth = 'Enter a valid date.';
      } else if (dob > maxDate) {
        errors.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (parsed.getFullYear() < 1900) {
        errors.dateOfBirth = 'Enter a realistic date of birth.';
      }
    }
  }

  const phnError = optionalPhnError(patientId);
  if (phnError) errors.patientId = phnError;
  const phoneError = optionalPhoneError(values.phone);
  if (phoneError) errors.phone = phoneError;

  if (postal && !isValidCanadianPostalCode(postal)) {
    errors.postalCode = 'Enter a valid Canadian postal code (e.g. T5J 1N3), or leave blank.';
  }

  return errors;
}

const inputClassName = cn(
  'patient-info-input w-full rounded-[10px] border border-[#cbdde2] bg-white px-3.5 text-[15px] text-[#111827]',
  'h-12 shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow] placeholder:text-[#687581]',
  'hover:border-[#91b8c1]',
  'focus-visible:border-[#0f817c] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-[rgba(15,129,124,0.15)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

const selectClassName = cn(
  inputClassName,
  'appearance-none py-0 pl-3.5 pr-9',
);

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-[13px] text-destructive" role="alert">
      {message}
    </p>
  );
}

export function PatientInfoForm({
  initial,
  onContinue,
  loading = false,
  onDraftChange,
  optionalDob,
}: Props) {
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const dobRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? '');
  const [patientId, setPatientId] = useState(initial?.patientId ?? '');
  const [phone, setPhone] = useState(() => formatNanpPhoneDisplay(initial?.phone ?? ''));
  const [address, setAddress] = useState<PatientAddress>(() =>
    addressFromPatientInfo(initial),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  const manualAge = optionalDob?.intakeMode === 'MANUAL_AGE';
  const intakeDob = optionalDob?.intakeMode === 'DOB';
  const optionalCtl = useOptionalDobValidation({
    enabled: Boolean(optionalDob && manualAge),
    consultationId: optionalDob?.consultationId ?? '',
    recordedAge: optionalDob?.recordedAge ?? null,
    consultationDate: optionalDob?.consultationDate ?? '',
    snapshotVersion: optionalDob?.snapshotVersion ?? 0,
    value: dateOfBirth,
  });

  const persistDob = intakeDob
    ? dateOfBirth
    : optionalCtl.status === 'MATCH'
      ? dateOfBirth
      : '';

  const busy = loading || submitting;
  const dobBlocked = Boolean(manualAge && optionalCtl.blocksActions);
  const dobInvalid =
    manualAge &&
    (optionalCtl.status === 'MISMATCH' || optionalCtl.status === 'INVALID');
  const recordedLabel = optionalDob?.recordedAge
    ? formatConfirmedAge(optionalDob.recordedAge)
    : '';

  const clearOptionalDob = () => {
    void optionalCtl.removeDob().then(() => {
      setDateOfBirth('');
      const msg = `DOB removed. Recorded age ${recordedLabel} will continue to be used.`;
      setLiveMessage(msg);
      toast.message(msg);
      dobRef.current?.focus();
    });
  };

  useEffect(() => {
    setName(initial?.name ?? '');
    if (!manualAge) {
      setDateOfBirth(initial?.dateOfBirth ?? '');
    }
    setPatientId(initial?.patientId ?? '');
    setPhone(formatNanpPhoneDisplay(initial?.phone ?? ''));
    setAddress(addressFromPatientInfo(initial));
  }, [
    manualAge,
    initial?.name,
    initial?.dateOfBirth,
    initial?.patientId,
    initial?.phone,
    initial?.address,
    initial?.addressLines?.street,
    initial?.addressLines?.unit,
    initial?.addressLines?.city,
    initial?.addressLines?.province,
    initial?.addressLines?.postalCode,
  ]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    onDraftChange?.(
      finalizePatientDocumentInfo({
        name,
        dateOfBirth: persistDob,
        patientId,
        phone,
        addressLines: address,
        skipped: false,
      }),
    );
  }, [name, persistDob, patientId, phone, address, onDraftChange]);

  const clearError = (key: keyof FieldErrors) => {
    if (!errors[key]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const patchAddress = (patch: Partial<PatientAddress>) => {
    setAddress((prev) => ({ ...prev, ...patch }));
    if ('postalCode' in patch) clearError('postalCode');
  };

  const focusFirstError = (nextErrors: FieldErrors) => {
    const order: Array<{ key: keyof FieldErrors; id: string; ref?: boolean }> = [
      { key: 'name', id: `${formId}-name`, ref: true },
      { key: 'dateOfBirth', id: `${formId}-dob` },
      { key: 'patientId', id: `${formId}-id` },
      { key: 'phone', id: `${formId}-phone` },
      { key: 'postalCode', id: `${formId}-postal` },
    ];
    for (const item of order) {
      if (!nextErrors[item.key]) continue;
      if (item.ref) nameRef.current?.focus();
      else document.getElementById(item.id)?.focus();
      return;
    }
  };

  const submit = () => {
    if (busy) return;
    if (dobBlocked) {
      dobRef.current?.focus();
      return;
    }

    const nextErrors = validateFields(
      { name, dateOfBirth: persistDob, patientId, phone, address },
      {
        skipDob: Boolean(optionalDob),
        consultationDate: optionalDob?.consultationDate,
      },
    );
    if (manualAge && dateOfBirth.trim() && dateOfBirth.trim().length < 10) {
      nextErrors.dateOfBirth = 'Enter a valid date of birth in YYYY-MM-DD format.';
    }
    if (manualAge && optionalCtl.status === 'INVALID' && optionalCtl.result.message) {
      nextErrors.dateOfBirth = optionalCtl.result.message;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors);
      return;
    }

    const committedDob = persistDob;
    const hasAny =
      Boolean(name.trim()) ||
      Boolean(committedDob.trim()) ||
      Boolean(patientId.trim()) ||
      Boolean(phone.trim()) ||
      Boolean(
        address.street?.trim() ||
          address.unit?.trim() ||
          address.city?.trim() ||
          address.province?.trim() ||
          address.postalCode?.trim(),
      );

    setSubmitting(true);
    onContinue(
      finalizePatientDocumentInfo({
        name,
        dateOfBirth: committedDob,
        patientId,
        phone,
        addressLines: address,
        skipped: !hasAny,
      }),
    );
  };

  return (
    <form
      className="patient-info-card mt-[22px] overflow-hidden rounded-2xl border border-[#d5e2e6] bg-white shadow-[0_2px_4px_rgba(15,23,42,0.08)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <header className="patient-info-header flex min-h-[76px] items-start gap-[11px] border-b border-[#d5e2e6] px-[21px] py-[17px]">
        <User
          className="patient-info-icon mt-0.5 h-5 w-5 shrink-0 text-[#0f7e99]"
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="patient-info-title m-0 text-[17px] font-bold leading-[1.35] text-[#111827]">
            Patient Information
          </h2>
          <p className="patient-info-description mt-1 text-[14px] leading-[1.45] text-[#52606d]">
            Optional details for document headers. Leave fields blank to continue —
            you can add or edit them later.
          </p>
        </div>
      </header>

      <div className="patient-info-body px-5 pb-5 pt-6">
        <div className="patient-info-grid grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[901px]:grid-cols-3">
          <div className="min-w-0 order-1">
            <label
              htmlFor={`${formId}-name`}
              className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
            >
              Full Legal Name            </label>
            <input
              ref={nameRef}
              id={`${formId}-name`}
              name="patientName"
              type="text"
              autoComplete="name"
              value={name}
              disabled={busy}
              placeholder="e.g., Jane Smith"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${formId}-name-error` : undefined}
              onChange={(e) => {
                setName(e.target.value);
                clearError('name');
              }}
              className={cn(
                inputClassName,
                errors.name && 'border-destructive focus-visible:border-destructive',
              )}
            />
            <FieldError id={`${formId}-name-error`} message={errors.name} />
          </div>

          <div className="min-w-0 order-2">
            <label
              htmlFor={`${formId}-dob`}
              className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
            >
              {manualAge ? 'Date of Birth (optional)' : 'Date of Birth'}
            </label>
            {intakeDob ? (
              <>
                <div
                  id={`${formId}-dob`}
                  className={cn(inputClassName, 'flex items-center pl-3.5 text-[#111827]')}
                >
                  {displayDob(dateOfBirth) || dateOfBirth || 'Not recorded'}
                </div>
                <p id={`${formId}-dob-hint`} className="mt-1.5 text-[12px] text-[#66727d]">
                  {recordedLabel
                    ? `Age at consultation: ${recordedLabel}`
                    : 'Confirmed at intake'}
                </p>
                {optionalDob?.onReviewAge ? (
                  <button
                    type="button"
                    onClick={optionalDob.onReviewAge}
                    className="mt-1 text-[13px] font-semibold text-[#0f7e99] underline underline-offset-2"
                  >
                    Edit patient information
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <div className="relative">
                  <CalendarDays
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#687581]"
                    aria-hidden
                  />
                  <input
                    ref={dobRef}
                    id={`${formId}-dob`}
                    name="dateOfBirth"
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday"
                    maxLength={10}
                    value={dateOfBirth}
                    disabled={busy}
                    placeholder="YYYY-MM-DD"
                    aria-invalid={Boolean(errors.dateOfBirth || dobInvalid)}
                    aria-describedby={[
                      `${formId}-dob-hint`,
                      errors.dateOfBirth || optionalCtl.status === 'INVALID'
                        ? `${formId}-dob-error`
                        : '',
                      optionalCtl.status === 'MISMATCH' ? `${formId}-dob-mismatch` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onChange={(e) => {
                      setDateOfBirth(formatDobInput(e.target.value));
                      clearError('dateOfBirth');
                    }}
                    onBlur={() => optionalCtl.onBlur()}
                    className={cn(
                      inputClassName,
                      'pl-10',
                      dobInvalid ? 'pr-10' : 'pr-3',
                      (errors.dateOfBirth || dobInvalid) &&
                        'border-[#dc2626] focus-visible:border-[#dc2626] focus-visible:outline-[#fecaca]',
                    )}
                  />
                  <OptionalDobFieldStatus invalid={Boolean(dobInvalid)} />
                </div>
                {manualAge && recordedLabel ? (
                  <p id={`${formId}-dob-hint`} className="mt-1.5 text-[12px] text-[#66727d]">
                    Recorded age at intake: {recordedLabel}
                    {!dateOfBirth.trim() ? '. Leave blank if the DOB is unavailable.' : ''}
                  </p>
                ) : (
                  <p id={`${formId}-dob-hint`} className="mt-1.5 text-[12px] text-[#66727d]">
                    Format: YYYY-MM-DD
                  </p>
                )}
                {optionalCtl.status === 'MATCH' && recordedLabel ? (
                  <p className="mt-1.5 text-[13px] font-medium text-[#0f766e]">
                    ✓ DOB is consistent with the recorded age of {recordedLabel}.
                  </p>
                ) : null}
                <FieldError
                  id={`${formId}-dob-error`}
                  message={
                    errors.dateOfBirth ||
                    (optionalCtl.status === 'INVALID' ? optionalCtl.result.message : undefined)
                  }
                />
              </>
            )}
          </div>

          <div className="min-w-0 order-4 min-[641px]:order-3">
            <label
              htmlFor={`${formId}-id`}
              className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
            >
              PHN / Patient ID            </label>
            <input
              id={`${formId}-id`}
              name="patientId"
              type="text"
              autoComplete="off"
              inputMode="numeric"
              maxLength={9}
              pattern="[0-9]{9}"
              value={patientId}
              disabled={busy}
              placeholder="e.g., 123456789"
              aria-invalid={Boolean(errors.patientId)}
              aria-describedby={
                errors.patientId ? `${formId}-id-error` : undefined
              }
              onChange={(e) => {
                setPatientId(formatPhnDigits(e.target.value));
                clearError('patientId');
              }}
              className={cn(
                inputClassName,
                errors.patientId &&
                  'border-destructive focus-visible:border-destructive',
              )}
            />
            <FieldError id={`${formId}-id-error`} message={errors.patientId} />
          </div>

          {manualAge && (optionalCtl.status === 'MISMATCH' || optionalCtl.networkError) ? (
            <div
              id={`${formId}-dob-mismatch`}
              className="order-3 min-[641px]:order-4 col-span-full min-[901px]:col-span-2 min-[901px]:col-start-2"
            >
              {optionalCtl.networkError ? (
                <OptionalDobNetworkError
                  onRetry={optionalCtl.retry}
                  onRemove={clearOptionalDob}
                />
              ) : (
                <OptionalDobMismatchAlert
                  result={optionalCtl.result}
                  onRemove={clearOptionalDob}
                  onReviewAge={() => setReviewOpen(true)}
                />
              )}
              <DocumentActionLockHint />
            </div>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 min-[641px]:grid-cols-2 min-[901px]:grid-cols-3">
          <div className="min-w-0">
            <label
              htmlFor={`${formId}-phone`}
              className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
            >
              Phone            </label>
            <input
              id={`${formId}-phone`}
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              disabled={busy}
              placeholder="e.g., 780-555-0123"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? `${formId}-phone-error` : undefined}
              onChange={(e) => {
                const el = e.currentTarget;
                const next = formatNanpPhoneInput(
                  el.value,
                  el.selectionStart ?? el.value.length,
                );
                setPhone(next.value);
                clearError('phone');
                requestAnimationFrame(() => {
                  try {
                    el.setSelectionRange(next.caret, next.caret);
                  } catch {
                    /* input unmounted */
                  }
                });
              }}
              className={cn(
                inputClassName,
                errors.phone &&
                  'border-destructive focus-visible:border-destructive',
              )}
            />
            <FieldError id={`${formId}-phone-error`} message={errors.phone} />
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-[#e2eef1] bg-[#f8fbfc] p-4 min-[641px]:p-5">
          <div className="mb-4 flex items-start gap-2.5">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-[#0f7e99]"
              aria-hidden
            />
            <div>
              <h3 className="m-0 text-[14px] font-bold text-[#111827]">
                Patient Address              </h3>
              <p className="mt-0.5 text-[13px] text-[#66727d]">
                Add as much or as little as you need for document headers.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 min-[701px]:grid-cols-[minmax(0,1fr)_140px]">
            <div className="min-w-0">
              <label
                htmlFor={`${formId}-street`}
                className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
              >
                Street Address              </label>
              <input
                id={`${formId}-street`}
                name="street"
                type="text"
                autoComplete="street-address"
                value={address.street ?? ''}
                disabled={busy}
                placeholder="e.g., 123 Jasper Avenue"
                onChange={(e) => patchAddress({ street: e.target.value })}
                className={inputClassName}
              />
            </div>

            <div className="min-w-0">
              <label
                htmlFor={`${formId}-unit`}
                className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
              >
                Unit              </label>
              <input
                id={`${formId}-unit`}
                name="unit"
                type="text"
                autoComplete="address-line2"
                value={address.unit ?? ''}
                disabled={busy}
                placeholder="e.g., 401"
                onChange={(e) => patchAddress({ unit: e.target.value })}
                className={inputClassName}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 min-[641px]:grid-cols-3">
            <div className="min-w-0">
              <label
                htmlFor={`${formId}-city`}
                className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
              >
                City              </label>
              <input
                id={`${formId}-city`}
                name="city"
                type="text"
                autoComplete="address-level2"
                value={address.city ?? ''}
                disabled={busy}
                placeholder="e.g., Edmonton"
                onChange={(e) => patchAddress({ city: e.target.value })}
                className={inputClassName}
              />
            </div>

            <div className="min-w-0">
              <label
                htmlFor={`${formId}-province`}
                className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
              >
                Province              </label>
              <Select
                id={`${formId}-province`}
                name="province"
                options={[...CA_PROVINCES]}
                placeholder="Select province"
                value={address.province ?? ''}
                disabled={busy}
                onChange={(e) => patchAddress({ province: e.target.value })}
                className={selectClassName}
              />
            </div>

            <div className="min-w-0">
              <label
                htmlFor={`${formId}-postal`}
                className="field-label mb-[7px] block text-[14px] font-semibold text-[#111827]"
              >
                Postal Code              </label>
              <input
                id={`${formId}-postal`}
                name="postalCode"
                type="text"
                autoComplete="postal-code"
                inputMode="text"
                maxLength={7}
                value={address.postalCode ?? ''}
                disabled={busy}
                placeholder="e.g., T5J 1N3"
                aria-invalid={Boolean(errors.postalCode)}
                aria-describedby={
                  errors.postalCode ? `${formId}-postal-error` : undefined
                }
                onChange={(e) =>
                  patchAddress({ postalCode: e.target.value.toUpperCase() })
                }
                onBlur={() => {
                  if (!address.postalCode?.trim()) return;
                  patchAddress({
                    postalCode: normalizePostalCode(address.postalCode),
                  });
                }}
                className={cn(
                  inputClassName,
                  'uppercase tracking-wide',
                  errors.postalCode &&
                    'border-destructive focus-visible:border-destructive',
                )}
              />
              <FieldError
                id={`${formId}-postal-error`}
                message={errors.postalCode}
              />
            </div>
          </div>
        </section>

        <div className="patient-info-actions flex min-h-[68px] items-center justify-end gap-3.5 pt-[18px] max-[640px]:flex-col max-[640px]:items-stretch">
          <button
            type="submit"
            disabled={busy || dobBlocked}
            className={cn(
              'continue-patient-info inline-flex h-12 min-w-[196px] items-center justify-center gap-2 rounded-[9px] px-[22px]',
              'bg-[#0f7f98] text-[15px] font-bold text-white',
              'hover:bg-[#0c6f86]',
              'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[rgba(15,127,152,0.25)]',
              'disabled:pointer-events-none disabled:opacity-60',
              'max-[640px]:w-full',
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Continuing…
              </>
            ) : (
              'Continue to Documents'
            )}
          </button>
        </div>
      </div>
      {manualAge &&
      optionalCtl.result.status === 'MISMATCH' &&
      optionalCtl.result.derivedAge &&
      optionalCtl.result.recordedAge ? (
        <AgeDobResolutionDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          dob={dateOfBirth}
          derivedAge={optionalCtl.result.derivedAge}
          recordedAge={optionalCtl.result.recordedAge}
          resolving={optionalCtl.resolving}
          onUseDob={() => {
            void optionalCtl.useDobRecheck(dateOfBirth).then(() => {
              setReviewOpen(false);
              toast.success('Clinical age updated. Review affected items.');
              optionalDob?.onReviewAge?.();
            }).catch(() => {
              toast.error('Could not update the clinical age. Try again.');
            });
          }}
          onKeepAge={() => {
            void optionalCtl.removeDob().then(() => {
              setDateOfBirth('');
              setReviewOpen(false);
              const msg = `DOB removed. Recorded age ${recordedLabel} will continue to be used.`;
              setLiveMessage(msg);
              toast.message(msg);
              dobRef.current?.focus();
            });
          }}
        />
      ) : null}
    </form>
  );
}

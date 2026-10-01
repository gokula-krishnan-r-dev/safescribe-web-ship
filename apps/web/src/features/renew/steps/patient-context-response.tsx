'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  canonicalPatientInfoNumber,
  displayPatientInfoNumber,
  formatPatientInfoPriorDate,
  parsePatientInfoNumber,
  patientInfoCanonicalUnit,
  patientInfoDisplayUnits,
  patientInfoNumberError,
  resolvePatientInfoRenderer,
  type RenewPatientContextAnswer,
  type RenewPatientContextRequirement,
} from '@safescript/shared';

export type SaveContextAnswer = (
  inputCode: string,
  body: Partial<
    Pick<
      RenewPatientContextAnswer,
      | 'status'
      | 'valueText'
      | 'numericValue'
      | 'note'
      | 'unableReasonCode'
      | 'unableReasonText'
      | 'followup'
      | 'enteredUnit'
      | 'sourceDate'
    >
  >,
) => void;

export function PatientContextResponseControl({
  row,
  derivedBmiLabel,
  saving,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  derivedBmiLabel?: string;
  saving?: boolean;
  onSave: SaveContextAnswer;
}) {
  const renderer = resolvePatientInfoRenderer(row);
  if (renderer === 'YES_NO') return null;
  if (renderer === 'DERIVED' || renderer === 'READ_ONLY') {
    return (
      <div className="min-w-0 text-right">
        <p className="text-sm font-semibold text-[#163447]">{derivedBmiLabel || row.answer.valueText || '—'}</p>
        <p className="mt-0.5 text-[11px] text-[#7a8b94]">
          {renderer === 'DERIVED' ? 'Calculated from weight and height' : 'From date of birth'}
        </p>
      </div>
    );
  }
  if (renderer === 'SINGLE_SELECT') {
    return <SingleSelectControl row={row} saving={saving} onSave={onSave} />;
  }
  if (renderer === 'NUMBER' || renderer === 'NUMBER_WITH_UNIT') {
    return <NumberWithUnitControl row={row} saving={saving} onSave={onSave} />;
  }
  return <TextControl row={row} saving={saving} onSave={onSave} />;
}

function NumberWithUnitControl({
  row,
  saving,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  saving?: boolean;
  onSave: SaveContextAnswer;
}) {
  const units = patientInfoDisplayUnits(row);
  const unitsKey = units.join('|');
  const canonical = patientInfoCanonicalUnit(row);
  const [unit, setUnit] = useState(row.answer.enteredUnit || units[0] || canonical || '');
  const displayNumber =
    row.answer.numericValue != null
      ? displayPatientInfoNumber(row.inputCode, row.answer.numericValue, unit, canonical)
      : undefined;
  const [draft, setDraft] = useState(displayNumber != null ? String(displayNumber) : '');

  useEffect(() => {
    const nextUnit = row.answer.enteredUnit || units[0] || canonical || '';
    setUnit(nextUnit);
    if (row.answer.numericValue == null) {
      setDraft('');
      return;
    }
    setDraft(String(displayPatientInfoNumber(row.inputCode, row.answer.numericValue, nextUnit, canonical)));
  }, [row.answer.numericValue, row.answer.enteredUnit, row.inputCode, canonical, unitsKey]);

  const parsed = parsePatientInfoNumber(draft);
  const error = parsed != null ? patientInfoNumberError(row.inputCode, canonicalPatientInfoNumber(row.inputCode, parsed, unit, canonical)) : null;

  const commit = (raw: string, nextUnit: string) => {
    const value = parsePatientInfoNumber(raw);
    if (value == null) {
      if (!raw.trim()) {
        onSave(row.inputCode, {
          status: 'ANSWERED',
          numericValue: null,
          valueText: null,
          enteredUnit: nextUnit || null,
          unableReasonCode: null,
          unableReasonText: null,
          followup: null,
        });
      }
      return;
    }
    const canonicalValue = canonicalPatientInfoNumber(row.inputCode, value, nextUnit, canonical);
    if (patientInfoNumberError(row.inputCode, canonicalValue)) return;
    onSave(row.inputCode, {
      status: 'ANSWERED',
      numericValue: canonicalValue,
      valueText: `${value} ${nextUnit}`.trim(),
      enteredUnit: nextUnit || null,
      sourceDate: new Date().toISOString().slice(0, 10),
      unableReasonCode: null,
      unableReasonText: null,
      followup: null,
    });
  };

  const prior = row.priorValue;
  const priorLabel = useMemo(() => {
    if (!prior) return null;
    const date = formatPatientInfoPriorDate(prior.observedDate);
    return `${prior.numericValue} ${prior.unit}${date ? ` on ${date}` : ''}`;
  }, [prior]);

  return (
    <div className="min-w-0">
      <div className="ml-auto flex h-10 max-w-[168px] overflow-hidden rounded-[10px] border border-[#d7e2e6] bg-white shadow-[0_1px_1px_rgba(15,23,42,0.03)]">
        <Input
          value={draft}
          inputMode="decimal"
          disabled={saving}
          aria-label={row.label}
          placeholder="—"
          className="h-10 border-0 bg-transparent px-2.5 text-sm shadow-none focus-visible:ring-0"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft, unit)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft, unit);
            }
          }}
        />
        {units.length ? (
          <select
            aria-label={`${row.label} unit`}
            disabled={saving || units.length === 1}
            value={unit}
            className="h-10 shrink-0 border-l border-[#d7e2e6] bg-[#f7fafb] px-2 text-[13px] font-medium text-[#163447] outline-none"
            onChange={(event) => {
              const nextUnit = event.target.value;
              const value = parsePatientInfoNumber(draft);
              if (value != null && unit) {
                const converted = displayPatientInfoNumber(
                  row.inputCode,
                  canonicalPatientInfoNumber(row.inputCode, value, unit, canonical),
                  nextUnit,
                  canonical,
                );
                setDraft(String(converted));
                setUnit(nextUnit);
                commit(String(converted), nextUnit);
                return;
              }
              setUnit(nextUnit);
            }}
          >
            {units.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-right text-[11px] text-[#b42318]">{error}</p> : null}
      {prior && priorLabel ? (
        <p className="mt-1 text-right text-[11px] text-[#7a8b94]">
          Last recorded: {priorLabel}{' '}
          <button
            type="button"
            className="font-semibold text-[#0F6F6B] hover:underline"
            onClick={() => {
              const display = displayPatientInfoNumber(row.inputCode, prior.numericValue, unit || prior.unit, prior.unit);
              setDraft(String(display));
              commit(String(display), unit || prior.unit);
            }}
          >
            Use previous
          </button>
        </p>
      ) : null}
    </div>
  );
}

function SingleSelectControl({
  row,
  saving,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  saving?: boolean;
  onSave: SaveContextAnswer;
}) {
  const options = row.enumOptions?.filter(Boolean) ?? [];
  const value = row.answer.valueText ?? '';
  return (
    <select
      aria-label={row.label}
      disabled={saving}
      value={value}
      className="ml-auto h-10 w-full max-w-[196px] rounded-[10px] border border-[#d7e2e6] bg-white px-2.5 text-sm text-[#163447] shadow-[0_1px_1px_rgba(15,23,42,0.03)] outline-none focus:border-[#0F6F6B]/40"
      onChange={(event) => {
        const next = event.target.value;
        onSave(row.inputCode, {
          status: 'ANSWERED',
          valueText: next || null,
          numericValue: null,
          unableReasonCode: null,
          unableReasonText: null,
          followup: null,
        });
      }}
    >
      <option value="">Select…</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function TextControl({
  row,
  saving,
  onSave,
}: {
  row: RenewPatientContextRequirement;
  saving?: boolean;
  onSave: SaveContextAnswer;
}) {
  const [draft, setDraft] = useState(row.answer.valueText ?? '');
  useEffect(() => {
    setDraft(row.answer.valueText ?? '');
  }, [row.answer.valueText]);
  return (
    <Input
      value={draft}
      disabled={saving}
      aria-label={row.label}
      className="ml-auto h-10 max-w-[196px] rounded-[10px] border-[#d7e2e6] text-sm shadow-none"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next === (row.answer.valueText ?? '')) return;
        onSave(row.inputCode, {
          status: 'ANSWERED',
          valueText: next || null,
          unableReasonCode: null,
          unableReasonText: null,
          followup: null,
        });
      }}
    />
  );
}

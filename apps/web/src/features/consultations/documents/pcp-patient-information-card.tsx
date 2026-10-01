'use client';

import { useRef, useState } from 'react';
import { Pencil, Check, ChevronDown, ChevronUp, Type } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatClinicalDobInput } from '../clinical-dob-input';
import type { PatientDocumentInfo } from './types';
import {
  formatPcpLetterDateDisplay,
  formatPcpPatientDob,
  pcpIdentityFromPatientInfo,
  type PcpPatientIdentity,
} from './pcp-patient-information';

interface Props {
  patientInfo: PatientDocumentInfo;
  letterDate?: string;
  onChange: (next: PatientDocumentInfo) => void;
  disabled?: boolean;
  /** Controlled formatting-toolbar toggle next to patient Edit. */
  formatToolbarOpen?: boolean;
  onToggleFormatToolbar?: () => void;
}

export function PcpPatientInformationCard({
  patientInfo,
  letterDate,
  onChange,
  disabled,
  formatToolbarOpen = false,
  onToggleFormatToolbar,
}: Props) {
  const [editing, setEditing] = useState(false);
  const identity = pcpIdentityFromPatientInfo(patientInfo);
  const nameRef = useRef<HTMLInputElement>(null);
  const letterDateLabel = formatPcpLetterDateDisplay(letterDate);

  const patch = (partial: Partial<PcpPatientIdentity>) => {
    const next = { ...identity, ...partial };
    onChange({
      ...patientInfo,
      name: next.name,
      dateOfBirth: next.dateOfBirth,
      patientId: next.phnNotAvailable ? '' : next.phn,
      phnNotAvailable: next.phnNotAvailable,
    });
  };

  return (
    <section className="ss-pcp-patient-chrome mb-4">
      {letterDateLabel ? (
        <p className="mb-2 mt-0 text-[14px] text-[#1f2933]">
          <strong>Date:</strong> {letterDateLabel}
        </p>
      ) : null}

      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#111827]">
          Patient information
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleFormatToolbar && !disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-2.5 text-[12.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8]',
                formatToolbarOpen && 'bg-[#eef4f8]',
              )}
              aria-expanded={formatToolbarOpen}
              aria-controls="ss-document-format-toolbar"
              onClick={onToggleFormatToolbar}
            >
              <Type className="h-3.5 w-3.5" />
              Formatting
              {formatToolbarOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          {disabled ? null : editing ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[12.5px]"
              onClick={() => setEditing(false)}
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[12.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8]"
              onClick={() => {
                setEditing(true);
                window.requestAnimationFrame(() => nameRef.current?.focus());
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {editing && !disabled ? (
        <div className="grid gap-3 rounded-[10px] border border-[#d9dee3] bg-[#f5f6f7] px-3.5 py-3 sm:grid-cols-[1.2fr_1fr_1fr]">
          <label className="block text-[12.5px]">
            <span className="mb-1 block font-semibold">
              Name <span className="text-destructive">*</span>
            </span>
            <Input
              ref={nameRef}
              value={identity.name}
              maxLength={200}
              placeholder="Enter patient’s full name"
              className="h-9 bg-white"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </label>
          <label className="block text-[12.5px]">
            <span className="mb-1 block font-semibold">
              Date of birth <span className="text-destructive">*</span>
            </span>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              maxLength={10}
              placeholder="YYYY-MM-DD"
              value={identity.dateOfBirth}
              aria-label="Date of birth"
              aria-describedby="pcp-letter-dob-hint"
              className="h-9 bg-white tabular-nums"
              onChange={(e) => patch({ dateOfBirth: formatClinicalDobInput(e.target.value) })}
            />
            <p id="pcp-letter-dob-hint" className="mt-1 text-[11px] text-muted-foreground">
              Format: YYYY-MM-DD
            </p>
          </label>
          <div className="text-[12.5px]">
            <span className="mb-1 block font-semibold">PHN</span>
            <div className="flex items-center gap-2">
              <Input
                value={identity.phn}
                placeholder="Enter PHN"
                disabled={identity.phnNotAvailable}
                className="h-9 bg-white"
                onChange={(e) =>
                  patch({ phn: e.target.value, phnNotAvailable: false })
                }
              />
              <label className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={identity.phnNotAvailable}
                  onChange={(e) =>
                    patch({
                      phnNotAvailable: e.target.checked,
                      phn: e.target.checked ? '' : identity.phn,
                    })
                  }
                />
                N/A
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'flex flex-wrap gap-x-7 gap-y-1.5 rounded-[10px] border border-[#d9dee3] bg-[#f5f6f7] px-3.5 py-2.5 text-[13.5px] text-[#111827]',
          )}
        >
          <span>
            <strong>Name:</strong> {identity.name || '—'}
          </span>
          <span>
            <strong>Date of birth:</strong>{' '}
            {formatPcpPatientDob(identity.dateOfBirth) || '—'}
          </span>
          <span>
            <strong>PHN:</strong>{' '}
            {identity.phnNotAvailable ? 'Not available' : identity.phn || '—'}
          </span>
        </div>
      )}
    </section>
  );
}

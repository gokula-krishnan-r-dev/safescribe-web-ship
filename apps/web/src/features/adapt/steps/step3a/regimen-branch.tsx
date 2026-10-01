'use client';

import { useMemo } from 'react';
import { CalendarDays, Clock, Info, Settings2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import type { ProposedPrescription } from '@safescript/shared';
import {
  generateChangeSummary,
  generateCounsellingPreview,
  generateDraftRationale,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import { SectionHeading } from './section-heading';
import { SharedPrescriptionDetails } from './shared-prescription-details';
import {
  adaptRationaleAutoKey,
  SharedClinicalRationale,
} from './shared-clinical-rationale';
import { TimingSelector } from '@/features/treatment-editor/timing-selector';
import { buildAdaptDoseOptions } from './build-adapt-dose-options';
import type { BranchCommonProps } from './dose-branch';

const FREQUENCY_CARDS = [
  {
    id: 'once_daily',
    label: 'Once daily',
    value: 'Once daily',
    icon: CalendarDays,
  },
  {
    id: 'twice_daily',
    label: 'Twice daily',
    value: 'Twice daily',
    icon: CalendarDays,
  },
  {
    id: 'every_other_day',
    label: 'Every other day',
    value: 'Every other day',
    icon: CalendarDays,
  },
  {
    id: 'custom',
    label: 'Custom schedule',
    value: 'Custom',
    icon: Settings2,
  },
] as const;

const DOSING_TIME_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'With breakfast (morning)', label: 'With breakfast (morning)' },
  { value: 'With lunch', label: 'With lunch' },
  { value: 'With dinner', label: 'With dinner' },
  { value: 'With meals', label: 'With meals' },
  { value: 'At bedtime', label: 'At bedtime' },
  { value: 'Morning', label: 'Morning' },
  { value: 'Evening', label: 'Evening' },
];

/** Structured custom schedules — avoids free-text SIGs when a preset fits. */
const CUSTOM_SCHEDULE_GROUPS = [
  {
    label: 'Daily patterns',
    options: [
      { value: 'Three times daily', label: 'Three times daily' },
      { value: 'Four times daily', label: 'Four times daily' },
      { value: 'At bedtime', label: 'At bedtime' },
      { value: 'As needed', label: 'As needed (PRN)' },
    ],
  },
  {
    label: 'Specific days',
    options: [
      { value: 'Monday / Wednesday / Friday', label: 'Monday / Wednesday / Friday' },
      { value: 'Tuesday / Thursday / Saturday', label: 'Tuesday / Thursday / Saturday' },
      { value: 'Weekdays only', label: 'Weekdays only' },
      { value: 'Weekends only', label: 'Weekends only' },
      { value: 'Once weekly', label: 'Once weekly' },
      { value: 'Twice weekly', label: 'Twice weekly' },
    ],
  },
  {
    label: 'Timed intervals',
    options: [
      { value: 'Every 6 hours', label: 'Every 6 hours' },
      { value: 'Every 8 hours', label: 'Every 8 hours' },
      { value: 'Every 12 hours', label: 'Every 12 hours' },
      { value: 'Every 48 hours', label: 'Every 48 hours' },
      { value: 'Every 72 hours', label: 'Every 72 hours' },
    ],
  },
] as const;

const CUSTOM_SCHEDULE_VALUES = new Set<string>(
  CUSTOM_SCHEDULE_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
);

const STANDARD_FREQUENCY_VALUES = new Set<string>(
  FREQUENCY_CARDS.filter((c) => c.id !== 'custom').map((c) => c.value),
);

function formatDosingTimeForSig(dosingTime?: string): string {
  const raw = (dosingTime || '').trim();
  if (!raw || raw === 'Not specified') return '';
  // "With breakfast (morning)" → "with breakfast"
  const cleaned = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.toLowerCase();
}

function buildRegimenSig(params: {
  dosageForm?: string;
  frequency: string;
  dosingTime?: string;
}): string {
  const form = (params.dosageForm || 'tablet').toLowerCase();
  const freq = (params.frequency || 'once daily').toLowerCase();
  const timePart = formatDosingTimeForSig(params.dosingTime);
  const suffix = timePart ? ` ${timePart}` : '';
  return `Take 1 ${form} by mouth ${freq}${suffix}`;
}

function parseOriginalQuantity(originalQtyText?: string | null): number | null {
  if (!originalQtyText?.trim()) return null;
  const n = parseInt(originalQtyText, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toQuantityNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Suggest days-supply–aware quantity when simplifying frequency. */
function suggestQuantityForFrequency(params: {
  currentQty: number | string | null | undefined;
  originalQty: number | null;
  originalFrequencyHint: string;
  nextFrequency: string;
}): number | null {
  const { currentQty, originalQty, originalFrequencyHint, nextFrequency } = params;
  const current = toQuantityNumber(currentQty);
  const base = originalQty ?? current;
  if (base == null) return current;

  const wasTwice =
    /twice|bid|2\s*times|two times/i.test(originalFrequencyHint) ||
    /twice daily/i.test(originalFrequencyHint);
  const nextOnce = /^once daily$/i.test(nextFrequency);

  if (wasTwice && nextOnce) {
    return Math.max(30, Math.round(base / 2));
  }
  return current ?? base;
}

function foodCalloutForDrug(drugName: string): string {
  if (/metformin/i.test(drugName)) {
    return 'Taking metformin with food can help reduce gastrointestinal side effects and support adherence to the simplified schedule.';
  }
  if (/nsaid|ibuprofen|naproxen|diclofenac|asa|aspirin/i.test(drugName)) {
    return 'Taking with food can help reduce gastrointestinal irritation for this medication.';
  }
  return 'Taking medication with food can help reduce gastrointestinal side effects and support adherence to the simplified schedule.';
}

function isPresetFrequency(frequency: string | undefined): boolean {
  return Boolean(frequency && STANDARD_FREQUENCY_VALUES.has(frequency));
}

export function RegimenBranch(props: BranchCommonProps) {
  const {
    step1,
    step3A,
    doseOptions,
    showRationaleResyncPrompt,
    patchStep3A,
    patchProposedRx,
    setSigManuallyEdited,
    setShowRationaleResyncPrompt,
    buildAiRationaleDraft,
    canGenerateAiDraft,
  } = props;

  const originalRx = step1.originalPrescription;
  const baseRx = step3A.proposedPrescription;

  const originalFrequencyHint =
    originalRx?.normalized?.frequency ||
    originalRx?.raw?.directionsText ||
    '';

  const originalQty = parseOriginalQuantity(originalRx?.raw?.quantityText);

  const selectedFreqId = useMemo(() => {
    const byId = FREQUENCY_CARDS.find((c) => c.id === step3A.selectedSuggestionId);
    if (byId) return byId.id;
    return (
      FREQUENCY_CARDS.find(
        (c) =>
          c.value === baseRx.frequency ||
          (c.id === 'custom' &&
            Boolean(baseRx.frequency) &&
            !isPresetFrequency(baseRx.frequency)),
      )?.id || null
    );
  }, [step3A.selectedSuggestionId, baseRx.frequency]);

  const applyFrequency = (freqValue: string, cardId: string, customText?: string) => {
    const frequency =
      cardId === 'custom'
        ? (customText ??
            (baseRx.frequency &&
            !isPresetFrequency(baseRx.frequency) &&
            baseRx.frequency !== 'Custom'
              ? baseRx.frequency
              : ''))
        : freqValue;
    // Prefer an empty custom frequency until the pharmacist picks a structured schedule.
    const resolvedFreq =
      cardId === 'custom' ? frequency : frequency || freqValue;
    const dosingTime = step3A.dosingTime || '';
    const quantity = suggestQuantityForFrequency({
      currentQty: baseRx.quantity,
      originalQty,
      originalFrequencyHint,
      nextFrequency: resolvedFreq || 'Once daily',
    });

    const updated: ProposedPrescription = {
      ...baseRx,
      frequency: resolvedFreq,
      quantity: quantity ?? baseRx.quantity,
      sig: buildRegimenSig({
        dosageForm: baseRx.dosageForm,
        frequency: resolvedFreq || 'as directed',
        dosingTime,
      }),
    };
    setSigManuallyEdited(false);
    setShowRationaleResyncPrompt(false);
    patchStep3A({
      proposalMode: 'suggested',
      selectedSuggestionId: cardId,
      modifiedFromSuggestion: false,
      proposedPrescription: updated,
      changeSummary: generateChangeSummary(originalRx, updated),
      rationaleDraft: generateDraftRationale(step1, undefined, undefined, updated),
      rationaleEditedByPharmacist: false,
      counsellingPreview: generateCounsellingPreview(step1, updated),
    });
  };

  const applyDosingTime = (dosingTime: string) => {
    const frequency = baseRx.frequency || 'Once daily';
    const updated: ProposedPrescription = {
      ...baseRx,
      sig: buildRegimenSig({
        dosageForm: baseRx.dosageForm,
        frequency,
        dosingTime,
      }),
    };
    setSigManuallyEdited(false);
    patchStep3A({
      dosingTime,
      proposalMode: step3A.proposalMode ?? 'suggested',
      proposedPrescription: updated,
      changeSummary: generateChangeSummary(originalRx, updated),
      rationaleDraft: step3A.rationaleEditedByPharmacist
        ? step3A.rationaleDraft
        : generateDraftRationale(step1, undefined, undefined, updated),
      counsellingPreview: generateCounsellingPreview(step1, updated),
    });
  };

  const previewSig = () => {
    const next = buildRegimenSig({
      dosageForm: baseRx.dosageForm,
      frequency: baseRx.frequency || 'Once daily',
      dosingTime: step3A.dosingTime,
    });
    setSigManuallyEdited(false);
    patchProposedRx({ sig: next });
  };

  const formLabel = (baseRx.dosageForm || 'tablet').toLowerCase();
  const drugLabel =
    baseRx.drugName ||
    originalRx?.normalized?.genericName ||
    originalRx?.raw?.medicationText ||
    'medication';
  const foodCallout = foodCalloutForDrug(drugLabel);
  const isCustom =
    selectedFreqId === 'custom' ||
    (Boolean(baseRx.frequency) && !isPresetFrequency(baseRx.frequency));

  const customScheduleValue = useMemo(() => {
    const freq = (baseRx.frequency || '').trim();
    if (!freq || isPresetFrequency(freq) || freq === 'Custom') return '';
    return freq;
  }, [baseRx.frequency]);

  const customScheduleGroups = useMemo(() => {
    const groups = CUSTOM_SCHEDULE_GROUPS.map((g) => ({
      label: g.label,
      options: g.options.map((o) => ({ value: o.value, label: o.label })),
    }));
    // Preserve a previously saved free-text schedule so the pharmacist can re-pick.
    if (customScheduleValue && !CUSTOM_SCHEDULE_VALUES.has(customScheduleValue)) {
      return [
        {
          label: 'Previously entered',
          options: [{ value: customScheduleValue, label: customScheduleValue }],
        },
        ...groups,
      ];
    }
    return groups;
  }, [customScheduleValue]);

  const resolvedDoseOptions = useMemo(() => {
    return buildAdaptDoseOptions([baseRx.dose, baseRx.strength], doseOptions);
  }, [doseOptions, baseRx.dose, baseRx.strength]);

  return (
    <div className="space-y-6">
      {/* 1 — Frequency options */}
      <div className="space-y-3">
        <SectionHeading
          number={1}
          title="Frequency options"
          helper="Select a new dosing frequency for the same medication to improve adherence."
        />

        <div
          role="radiogroup"
          aria-label="Frequency options"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {FREQUENCY_CARDS.map((card) => {
            const selected = selectedFreqId === card.id;
            const Icon = card.icon;
            const subtitle =
              card.id === 'custom'
                ? 'Define days and times'
                : `1 ${formLabel} ${card.value.toLowerCase()}`;
            return (
              <button
                key={card.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => applyFrequency(card.value, card.id)}
                className={cn(
                  'relative flex min-h-[112px] flex-col items-start rounded-xl p-4 text-left transition-all',
                  selected
                    ? 'border-2 border-[#0F6F6B] bg-[#F1FAF9]/70 shadow-sm'
                    : 'border border-[#d9e4e8] bg-white hover:border-[#b0c4cb] hover:bg-slate-50/40',
                )}
              >
                <span
                  className={cn(
                    'absolute left-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border',
                    selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
                  )}
                  aria-hidden
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" /> : null}
                </span>
                <span
                  className={cn(
                    'mb-2 mt-5 flex h-9 w-9 items-center justify-center rounded-lg',
                    selected ? 'bg-[#0F6F6B] text-white' : 'bg-[#F0FAF9] text-[#0F6F6B]',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-[#102a43]">{card.label}</p>
                <p className="mt-1 text-xs leading-snug text-[#627d98]">{subtitle}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <div className="space-y-1.5 rounded-xl border border-[#e2eaed] bg-white p-3.5 shadow-sm">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#102a43]">
              <Clock className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />
              Dosing time <span className="font-normal text-[#829ab1]">(optional)</span>
            </label>
            <Select
              value={step3A.dosingTime || ''}
              onChange={(e) => applyDosingTime(e.target.value)}
              options={DOSING_TIME_OPTIONS}
              className="h-10 bg-white text-xs font-medium text-[#102a43] shadow-none"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-[#c5e4f3] bg-[#F0F9FC] px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0284c7]" aria-hidden />
            <p className="text-xs leading-relaxed text-[#0c4a6e]">{foodCallout}</p>
          </div>
        </div>

        {isCustom ? (
          <div className="max-w-lg space-y-1.5 rounded-xl border border-[#e2eaed] bg-white p-3.5 shadow-sm">
            <label
              htmlFor="adapt-custom-schedule"
              className="flex items-center gap-1.5 text-xs font-semibold text-[#102a43]"
            >
              <Settings2 className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />
              Custom schedule <span className="text-destructive">*</span>
            </label>
            <TimingSelector
              id="adapt-custom-schedule"
              value={customScheduleValue}
              onChange={(nextFreq) => applyFrequency('Custom', 'custom', nextFreq)}
              valueFormat="label"
              className="w-full min-w-0 max-w-none"
            />
            <p className="text-[11px] leading-snug text-[#829ab1]">
              Choose a structured schedule. Optional dosing time above still applies when relevant.
            </p>
          </div>
        ) : null}
      </div>

      {/* 2 — Proposed prescription details */}
      <SharedPrescriptionDetails
        sectionNumber={2}
        proposed={step3A.proposedPrescription}
        doseOptions={resolvedDoseOptions}
        showDrugName
        drugNameReadOnly
        drugNameAsField
        quantityRequired
        helper="Complete the prescription for the new frequency. Review and edit as needed."
        headerAction={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={previewSig}
            className="h-8 gap-1.5 rounded-lg border-[#d9e4e8] px-2.5 text-xs font-semibold text-[#102a43]"
          >
            <FileText className="h-3.5 w-3.5 text-[#0F6F6B]" />
            Preview SIG
          </Button>
        }
        onPatch={patchProposedRx}
        onSigManualEdit={() => setSigManuallyEdited(true)}
      />

      {/* 3 — Clinical rationale */}
      <SharedClinicalRationale
        sectionNumber={3}
        value={step3A.rationaleDraft || ''}
        helper="Explain why this proposed adaptation is appropriate for this patient."
        onChange={(next) =>
          patchStep3A({
            rationaleDraft: next,
            rationaleEditedByPharmacist: true,
          })
        }
        onApplyAiDraft={(next) => {
          setShowRationaleResyncPrompt(false);
          patchStep3A({
            rationaleDraft: next,
            rationaleEditedByPharmacist: false,
          });
        }}
        onGenerateDraft={buildAiRationaleDraft}
        canGenerateDraft={canGenerateAiDraft}
        autoGenerateKey={adaptRationaleAutoKey([
          step3A.proposedPrescription.drugName,
          step3A.proposedPrescription.dose,
          step3A.proposedPrescription.frequency,
          step3A.proposedPrescription.route,
          step3A.proposedPrescription.sig,
        ])}
        showResyncPrompt={showRationaleResyncPrompt}
        onKeepCurrent={() => setShowRationaleResyncPrompt(false)}
        onRequestRegenerate={() => setShowRationaleResyncPrompt(false)}
      />
    </div>
  );
}

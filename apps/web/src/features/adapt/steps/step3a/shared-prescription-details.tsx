'use client';

import { useMemo } from 'react';
import { Pill, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import type { ProposedPrescription } from '@safescript/shared';
import { TimingSelector } from '@/features/treatment-editor/timing-selector';
import { buildTimingConfiguration } from '@/features/treatment-editor/build-timing-menu';
import { SectionHeading } from './section-heading';

const ROUTE_OPTIONS = [
  { value: 'By mouth', label: 'By mouth' },
  { value: 'Oral', label: 'Oral' },
  { value: 'Topical', label: 'Topical' },
  { value: 'Inhalation', label: 'Inhalation' },
  { value: 'Subcutaneous', label: 'Subcutaneous' },
  { value: 'Intramuscular', label: 'Intramuscular' },
  { value: 'Ophthalmic', label: 'Ophthalmic' },
  { value: 'Otic', label: 'Otic' },
  { value: 'Nasal', label: 'Nasal' },
  { value: 'Rectal', label: 'Rectal' },
  { value: 'Transdermal', label: 'Transdermal' },
];

export function SharedPrescriptionDetails({
  sectionNumber,
  proposed,
  doseOptions,
  showDrugName = true,
  drugNameReadOnly = false,
  drugNameAsField = false,
  drugNameSlot,
  helper = 'Complete the prescription for the selected option. Review and edit as needed.',
  onPatch,
  onSigManualEdit,
  onChangeMedication,
  changeMedicationLabel = 'Change medication',
  onReset,
  resetLabel = 'Reset',
  headerAction,
  showQuantityUnit = false,
  showStrength = false,
  strengthOptions,
  quantityRequired = false,
}: {
  sectionNumber: number;
  proposed: ProposedPrescription;
  doseOptions: { value: string; label: string }[];
  showDrugName?: boolean;
  drugNameReadOnly?: boolean;
  /** Render medication as a labeled form field (mock regimen layout) instead of a teal banner. */
  drugNameAsField?: boolean;
  drugNameSlot?: React.ReactNode;
  helper?: string;
  onPatch: (patch: Partial<ProposedPrescription>) => void;
  onSigManualEdit: () => void;
  onChangeMedication?: () => void;
  changeMedicationLabel?: string;
  onReset?: () => void;
  resetLabel?: string;
  headerAction?: React.ReactNode;
  showQuantityUnit?: boolean;
  showStrength?: boolean;
  strengthOptions?: { value: string; label: string }[];
  quantityRequired?: boolean;
}) {
  const routeValue =
    proposed.route === 'By mouth' || !proposed.route ? 'Oral' : proposed.route;
  const routeOptions = ROUTE_OPTIONS.some((o) => o.value === routeValue)
    ? ROUTE_OPTIONS
    : [{ value: routeValue, label: routeValue }, ...ROUTE_OPTIONS];

  const frequencyValue = proposed.frequency?.trim() || 'Once daily';
  const timingConfig = useMemo(
    () =>
      buildTimingConfiguration({
        pathwayFrequency: frequencyValue,
        commonTimingPresetIds: [
          'ONCE_DAILY',
          'TWICE_DAILY',
          'THREE_TIMES_DAILY',
          'FOUR_TIMES_DAILY',
          'AT_BEDTIME',
        ],
      }),
    [frequencyValue],
  );

  const resolvedStrengthOptions =
    strengthOptions && strengthOptions.length > 0
      ? strengthOptions
      : proposed.strength
        ? [{ value: proposed.strength, label: proposed.strength }]
        : [{ value: '', label: 'Select strength' }];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading
          number={sectionNumber}
          title="Proposed prescription details"
          helper={helper}
        />
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {headerAction}
          {onReset ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-8 gap-1.5 text-xs font-medium text-[#52677a] hover:text-[#102a43]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {resetLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm sm:p-5">
        {drugNameSlot ? (
          <div>{drugNameSlot}</div>
        ) : showDrugName && drugNameAsField ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Medication <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              value={proposed.drugName}
              onChange={(e) => onPatch({ drugName: e.target.value })}
              placeholder="e.g. Metformin 500 mg tablet"
              readOnly={drugNameReadOnly}
              disabled={drugNameReadOnly}
              className={
                drugNameReadOnly
                  ? 'h-10 bg-[#f4f7f8] text-xs font-medium text-[#102a43] shadow-none'
                  : 'h-10 text-xs font-medium text-[#102a43] shadow-none'
              }
            />
          </div>
        ) : showDrugName && proposed.drugName?.trim() ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#d7ebe8] bg-[#F3FAF9] px-3.5 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#0F6F6B] shadow-sm">
                <Pill className="h-4 w-4" aria-hidden />
              </span>
              <p className="truncate text-sm font-semibold text-[#102a43]">
                {proposed.drugName}
              </p>
            </div>
            {onChangeMedication ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onChangeMedication}
                className="h-8 shrink-0 rounded-lg border-[#d9e4e8] bg-white px-2.5 text-xs font-semibold text-[#102a43]"
              >
                {changeMedicationLabel}
              </Button>
            ) : null}
          </div>
        ) : showDrugName ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Medication <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              value={proposed.drugName}
              onChange={(e) => onPatch({ drugName: e.target.value })}
              placeholder="e.g. Metformin 500 mg tablet"
              readOnly={drugNameReadOnly}
              disabled={drugNameReadOnly}
              className="h-10 bg-slate-50/70 text-xs font-medium text-[#102a43]"
            />
          </div>
        ) : null}

        <div
          className={
            showStrength
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
              : 'grid grid-cols-2 gap-3 sm:grid-cols-4'
          }
        >
          {showStrength ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#102a43]">
                Strength <span className="text-destructive">*</span>
              </label>
              <Select
                value={proposed.strength || ''}
                onChange={(e) => onPatch({ strength: e.target.value, dose: proposed.dose || e.target.value })}
                options={resolvedStrengthOptions}
                className="h-10 text-xs font-medium text-[#102a43] shadow-none"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Dose <span className="text-destructive">*</span>
            </label>
            <Select
              value={proposed.dose || ''}
              onChange={(e) => onPatch({ dose: e.target.value })}
              options={
                doseOptions.length > 0
                  ? doseOptions
                  : proposed.dose
                    ? [{ value: proposed.dose, label: proposed.dose }]
                    : [{ value: '', label: 'Select dose' }]
              }
              className="h-10 text-xs font-medium text-[#102a43] shadow-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Frequency <span className="text-destructive">*</span>
            </label>
            <TimingSelector
              id={`adapt-proposed-frequency-${sectionNumber}`}
              value={frequencyValue}
              onChange={(nextFreq) => onPatch({ frequency: nextFreq })}
              configuration={timingConfig}
              valueFormat="label"
              className="w-full min-w-0 max-w-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Route <span className="text-destructive">*</span>
            </label>
            <Select
              value={routeValue}
              onChange={(e) =>
                onPatch({
                  route: e.target.value === 'Oral' ? 'By mouth' : e.target.value,
                })
              }
              options={routeOptions}
              className="h-10 text-xs font-medium text-[#102a43] shadow-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#102a43]">
              Quantity
              {quantityRequired ? <span className="text-destructive"> *</span> : null}
            </label>
            <div className={showQuantityUnit ? 'flex gap-2' : undefined}>
              <Input
                type="number"
                min="1"
                value={proposed.quantity ?? ''}
                onChange={(e) =>
                  onPatch({
                    quantity: e.target.value ? parseInt(e.target.value, 10) : null,
                  })
                }
                placeholder="30"
                className="h-10 text-xs font-medium text-[#102a43] shadow-none"
              />
              {showQuantityUnit ? (
                <Select
                  value={proposed.quantityUnit || 'mL'}
                  onChange={(e) => onPatch({ quantityUnit: e.target.value })}
                  options={[
                    { value: 'mL', label: 'mL' },
                    { value: 'g', label: 'g' },
                    { value: 'tablets', label: 'tablets' },
                    { value: 'capsules', label: 'capsules' },
                    { value: 'units', label: 'units' },
                  ]}
                  className="h-10 w-[110px] shrink-0 text-xs font-medium text-[#102a43] shadow-none"
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#102a43]">
              Directions (SIG) <span className="text-destructive">*</span>
            </label>
            <span className="text-[11px] text-[#829ab1]">
              {(proposed.sig || '').length} / 280
            </span>
          </div>
          <Textarea
            value={proposed.sig}
            maxLength={280}
            rows={2}
            onChange={(e) => {
              onSigManualEdit();
              onPatch({ sig: e.target.value });
            }}
            placeholder="Take 1 tablet by mouth once daily"
            className="min-h-[64px] resize-none text-xs font-medium text-[#102a43] shadow-none"
          />
        </div>
      </div>
    </div>
  );
}

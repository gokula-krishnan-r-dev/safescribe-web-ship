'use client';

import { Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_PHARMACIST_CONSULTED_REFERENCES,
  type AdaptPharmacistConsultedReference,
} from '@safescript/shared';

const SHORT_LABELS: Record<AdaptPharmacistConsultedReference['type'], string> = {
  ecps: 'eCPS',
  bugs_and_drugs: 'Bugs & Drugs',
  condition_guideline: 'Condition-specific guideline',
  other: 'Other reference',
};

export function AdaptPharmacistReferencesCard({
  value,
  onChange,
}: {
  value: AdaptPharmacistConsultedReference[];
  onChange: (next: AdaptPharmacistConsultedReference[]) => void;
}) {
  const refs =
    value.length > 0 ? value : DEFAULT_PHARMACIST_CONSULTED_REFERENCES.map((row) => ({ ...row }));

  const anySelected = refs.some((ref) => ref.selected);
  const guidelineRef = refs.find((ref) => ref.type === 'condition_guideline');
  const otherRef = refs.find((ref) => ref.type === 'other');

  const update = (
    type: AdaptPharmacistConsultedReference['type'],
    patch: Partial<AdaptPharmacistConsultedReference>,
  ) => {
    onChange(refs.map((ref) => (ref.type === type ? { ...ref, ...patch } : ref)));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[#dfe7ea] bg-white p-5 shadow-[0_4px_14px_rgba(28,48,64,0.04)] sm:p-6">
      <div className="space-y-0.5">
        <h3 className="text-[16px] font-semibold text-[#102a43]">
          References consulted by pharmacist
        </h3>
        <p className="text-[13px] text-[#52677a]">
          Sources you personally used for this decision.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {refs.map((ref) => {
          const isChecked = Boolean(ref.selected);
          return (
            <label
              key={ref.type}
              className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13.5px] text-[#102a43] select-none"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => update(ref.type, { selected: !ref.selected })}
                className="h-4 w-4 rounded border-gray-300 text-[#0F6F6B] focus:ring-[#0F6F6B]"
              />
              <span className="font-medium">{SHORT_LABELS[ref.type] ?? ref.label}</span>
            </label>
          );
        })}
      </div>

      {!anySelected ? (
        <div className="flex items-start gap-2 rounded-lg border border-[#dfe7ea] bg-[#fbfcfd] px-3 py-2.5 text-[12.5px] text-[#52677a]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F6F6B]" />
          <span>
            Additional details (e.g., guideline name or other reference) will appear here when a
            source is selected.
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {guidelineRef?.selected ? (
            <div className="space-y-1.5">
              <label className="text-[12.5px] font-semibold text-[#52677a]">Guideline title</label>
              <Input
                value={guidelineRef.title ?? ''}
                onChange={(e) => update('condition_guideline', { title: e.target.value })}
                placeholder="Enter guideline title"
                className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
              />
            </div>
          ) : null}

          {otherRef?.selected ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[12.5px] font-semibold text-[#52677a]">
                  Reference title
                </label>
                <Input
                  value={otherRef.title ?? ''}
                  onChange={(e) => update('other', { title: e.target.value })}
                  placeholder="Reference title"
                  className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12.5px] font-semibold text-[#52677a]">
                  Organization / publisher{' '}
                  <span className="font-normal text-[#7b8b94]">(optional)</span>
                </label>
                <Input
                  value={otherRef.organization ?? ''}
                  onChange={(e) => update('other', { organization: e.target.value })}
                  placeholder="Organization"
                  className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12.5px] font-semibold text-[#52677a]">
                  URL <span className="font-normal text-[#7b8b94]">(optional)</span>
                </label>
                <Input
                  value={otherRef.url ?? ''}
                  onChange={(e) => update('other', { url: e.target.value })}
                  placeholder="https://"
                  className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[12.5px] font-semibold text-[#52677a]">
                  Notes <span className="font-normal text-[#7b8b94]">(optional)</span>
                </label>
                <Input
                  value={otherRef.notes ?? ''}
                  onChange={(e) => update('other', { notes: e.target.value })}
                  placeholder="Optional notes"
                  className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

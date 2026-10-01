'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AdaptAllergyEntry, ClinicalCheckItem } from '@safescript/shared';

const TOLERANCE_OPTIONS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
  { value: 'unknown' as const, label: 'Unknown' },
];

export interface AllergyReviewDraft {
  drug: string;
  reaction: string;
  severity: AdaptAllergyEntry['severity'];
  reactionType: string;
  recordedDate: string;
  previousCephalosporinTolerance: 'yes' | 'no' | 'unknown';
}

function blankDraft(entry?: AdaptAllergyEntry | null): AllergyReviewDraft {
  return {
    drug: entry?.drug ?? '',
    reaction: entry?.reaction ?? '',
    severity: entry?.severity || '',
    reactionType: entry?.reactionType ?? entry?.allergyType ?? '',
    recordedDate: entry?.recordedDate ?? '',
    previousCephalosporinTolerance: entry?.previousCephalosporinTolerance ?? 'unknown',
  };
}

export function isAllergyReviewFinding(check: ClinicalCheckItem): boolean {
  return (
    check.id === 'allergies' &&
    check.severity === 'review' &&
    check.requiresAcknowledgment === true
  );
}

interface Step3BAllergyReviewCardProps {
  check: ClinicalCheckItem;
  allergy: AdaptAllergyEntry | null;
  proposedMedication: string;
  isAcknowledged: boolean;
  onReviewDetails: () => void;
  onChangeMedication: () => void;
}

export function Step3BAllergyReviewCard({
  check,
  allergy,
  proposedMedication,
  isAcknowledged,
  onReviewDetails,
  onChangeMedication,
}: Step3BAllergyReviewCardProps) {
  if (isAcknowledged) return null;

  const rows = [
    { label: 'Allergen', value: allergy?.drug || '—' },
    { label: 'Reaction', value: allergy?.reaction || '—' },
    { label: 'Severity', value: allergy?.severity || '—' },
    {
      label: 'Date',
      value: allergy?.recordedDate || '—',
    },
    {
      label: 'Reaction type',
      value: allergy?.reactionType || allergy?.allergyType || '—',
      emphasize: /immediate|ige/i.test(
        `${allergy?.reactionType ?? ''} ${allergy?.allergyType ?? ''}`,
      ),
    },
  ];

  return (
    <div className="rounded-xl border border-[#efd38a] bg-[#fffaf0] p-4 sm:p-5 space-y-3.5">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[14.5px] font-semibold text-[#102a43]">
              Allergy review required
            </h4>
            <span className="inline-flex h-[22px] items-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-900">
              Not a hard stop
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-[#52677a]">
            {check.summary ||
              `${proposedMedication} may cross-react with a recorded penicillin-class allergy. Review details or change the proposed medication before confirming.`}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#efd38a]/70 bg-white/80">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-[#fff7e6] text-[#7b5c14]">
            <tr>
              {rows.map((row) => (
                <th key={row.label} className="px-2.5 py-2 font-semibold">
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="text-[#102a43]">
              {rows.map((row) => (
                <td
                  key={row.label}
                  className={cn(
                    'px-2.5 py-2.5 align-top',
                    row.emphasize && 'font-semibold text-rose-700',
                  )}
                >
                  {row.value}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onReviewDetails}
          className="h-8 rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800"
        >
          Review allergy details
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onChangeMedication}
          className="h-8 rounded-lg border-[#dfe7ea] bg-white px-3 text-xs font-semibold text-[#102a43] hover:bg-white"
        >
          Change medication
        </Button>
      </div>
    </div>
  );
}

interface Step3BAllergyReviewResolvedBannerProps {
  onUndo?: () => void;
}

export function Step3BAllergyReviewResolvedBanner({
  onUndo,
}: Step3BAllergyReviewResolvedBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#b9e2cf] bg-[#f4fbf8] px-4 py-3">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        Safety check updated — allergy review completed
      </div>
      {onUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="text-[12.5px] font-semibold text-[#0F6F6B] hover:underline"
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}

interface Step3BAllergyDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allergy: AdaptAllergyEntry | null;
  proposedMedication: string;
  onSave: (draft: AllergyReviewDraft) => void;
}

export function Step3BAllergyDetailsDialog({
  open,
  onOpenChange,
  allergy,
  proposedMedication,
  onSave,
}: Step3BAllergyDetailsDialogProps) {
  const [draft, setDraft] = useState<AllergyReviewDraft>(() => blankDraft(allergy));

  useEffect(() => {
    if (open) setDraft(blankDraft(allergy));
  }, [open, allergy]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-[#dfe7ea] sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold text-[#102a43]">
            Allergy details
          </DialogTitle>
        </DialogHeader>

        <p className="text-[13px] leading-relaxed text-[#52677a]">
          Confirm allergy details for the proposed adaptation to{' '}
          <span className="font-semibold text-[#102a43]">{proposedMedication}</span>.
        </p>

        <div className="space-y-3">
          <Field label="Allergen">
            <Input
              value={draft.drug}
              onChange={(e) => setDraft((d) => ({ ...d, drug: e.target.value }))}
              className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
            />
          </Field>
          <Field label="Reaction">
            <Input
              value={draft.reaction}
              onChange={(e) => setDraft((d) => ({ ...d, reaction: e.target.value }))}
              className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Severity">
              <select
                value={draft.severity || ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    severity: (e.target.value || '') as AdaptAllergyEntry['severity'],
                  }))
                }
                className="h-9 w-full rounded-md border border-[#dfe7ea] bg-white px-2.5 text-[13.5px] text-[#102a43] focus:outline-none focus:ring-2 focus:ring-[#0F6F6B]/30"
              >
                <option value="">Select</option>
                <option value="Mild">Mild</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
              </select>
            </Field>
            <Field label="Date">
              <Input
                value={draft.recordedDate}
                onChange={(e) => setDraft((d) => ({ ...d, recordedDate: e.target.value }))}
                placeholder="e.g. 2019"
                className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
              />
            </Field>
          </div>
          <Field label="Reaction type">
            <Input
              value={draft.reactionType}
              onChange={(e) => setDraft((d) => ({ ...d, reactionType: e.target.value }))}
              placeholder="e.g. Immediate (IgE-mediated)"
              className="h-9 border-[#dfe7ea] text-[13.5px] focus-visible:ring-[#0F6F6B]"
            />
          </Field>

          <div className="space-y-2 rounded-lg border border-[#dfe7ea] bg-[#fbfcfd] p-3">
            <div className="text-[12.5px] font-semibold text-[#102a43]">
              Previous tolerance of cephalosporins?
            </div>
            <div className="flex flex-wrap gap-2">
              {TOLERANCE_OPTIONS.map((opt) => {
                const selected = draft.previousCephalosporinTolerance === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        previousCephalosporinTolerance: opt.value,
                      }))
                    }
                    className={cn(
                      'h-8 min-w-[72px] rounded-lg border px-3 text-[12.5px] font-semibold transition-colors',
                      selected
                        ? 'border-[#0F6F6B] bg-[#0F6F6B] text-white'
                        : 'border-[#dfe7ea] bg-white text-[#102a43] hover:bg-slate-50',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg border-[#dfe7ea] text-[13px] font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
            className="h-9 gap-1.5 rounded-lg bg-[#0F6F6B] text-[13px] font-semibold text-white hover:bg-[#0d5f5b]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Save &amp; mark reviewed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12.5px] font-semibold text-[#52677a]">{label}</label>
      {children}
    </div>
  );
}

'use client';

import { useCallback, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ClinicalPrimaryButton } from '@/features/consultations/clinical-ui';
import { cn } from '@/lib/utils';
import {
  contextBulkApplyAllowed,
  contextChoiceFromAnswer,
  derivedBmiFromContext,
  isContextComplete,
  patientContextCollapsedSummary,
  patientContextProgress,
  type ContextRemovalReasonId,
  type RemovedConditionalQuestion,
  type RenewPatientContextRequirement,
} from '@safescript/shared';
import {
  PatientContextProgressPills,
  PatientContextQuestionRow,
  PatientContextRemovedList,
  type SaveContextAnswer,
} from './patient-context-question-row';
import { useDeferredSectionOpen } from './use-deferred-section-open';

export function PatientContextSection({
  items,
  removed = [],
  additionalNote = '',
  confirmed = false,
  bulkAcked = false,
  sectionNumber = 1,
  open,
  savingCode,
  busy,
  bulkBanner,
  onToggle,
  onSave,
  onApplyNoConcerns,
  onRemove,
  onRestore,
  onConfirm,
  onCancel,
  onNoteChange,
}: {
  items: RenewPatientContextRequirement[];
  removed?: Array<RemovedConditionalQuestion & { label: string; medicationNames: string[] }>;
  additionalNote?: string;
  confirmed?: boolean;
  bulkAcked?: boolean;
  sectionNumber?: number;
  open: boolean;
  savingCode?: string | null;
  busy?: boolean;
  bulkBanner?: { message: string; onUndo: () => void } | null;
  onToggle: () => void;
  onSave: SaveContextAnswer;
  onApplyNoConcerns: () => void;
  onRemove: (inputCode: string, reasonCode: ContextRemovalReasonId, reasonText?: string | null) => void;
  onRestore: (inputCode: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onNoteChange: (value: string) => void;
}) {
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const { visualOpen, showBody, handleToggle } = useDeferredSectionOpen(open, onToggle);
  const progress = patientContextProgress({ active: items, removedCount: removed.length });
  const allComplete = items.every((row) => isContextComplete(row));
  const eligibleBulk = items.filter(
    (row) => contextBulkApplyAllowed(row) && !contextChoiceFromAnswer(row.answer),
  ).length;
  const bmi = derivedBmiFromContext(items);
  const findingCount = items.filter((row) => row.answer.followup?.completed).length;
  const collapsedSummary = patientContextCollapsedSummary({
    active: items,
    removedCount: removed.length,
    findingCount,
  });

  const applyBulk = useCallback(() => {
    if (!eligibleBulk) return;
    if (!bulkAcked) {
      setBulkConfirmOpen(true);
      return;
    }
    onApplyNoConcerns();
  }, [eligibleBulk, bulkAcked, onApplyNoConcerns]);

  return (
    <TooltipProvider delayDuration={200}>
      <>
        <section className="overflow-hidden rounded-2xl border border-[#d7e2e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="sticky top-0 z-10 flex w-full items-start gap-3 border-b border-transparent bg-white px-4 py-3.5 sm:px-5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              aria-expanded={visualOpen}
              onClick={handleToggle}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150',
                  confirmed && !visualOpen
                    ? 'bg-[#16A34A] text-white'
                    : visualOpen
                      ? 'bg-[#0F6F6B] text-white'
                      : 'bg-[#e8eef1] text-[#5b6b75]',
                )}
              >
                {confirmed && !visualOpen ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  sectionNumber
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[15px] font-semibold text-[#163447]">
                  Patient-specific information
                </span>
                {confirmed && !visualOpen ? (
                  <span className="mt-0.5 block text-[12px] leading-5 text-[#5b6b75]">
                    {collapsedSummary}
                  </span>
                ) : (
                  <>
                    <span className="mt-0.5 block text-[12px] leading-5 text-[#5b6b75]">
                      Only questions relevant to current medications are shown.
                    </span>
                    {visualOpen ? (
                      <PatientContextProgressPills
                        questions={progress.questions}
                        reviewed={progress.reviewed}
                        remaining={progress.remaining}
                        removed={progress.removed}
                        findings={progress.findings}
                      />
                    ) : null}
                  </>
                )}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {visualOpen ? (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || eligibleBulk === 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      applyBulk();
                    }}
                    className="h-9 border-[#d7e2e6] bg-white px-3 text-[13px] font-medium text-[#163447] shadow-none hover:bg-[#f3f7f8]"
                  >
                    <Check className="h-3.5 w-3.5 text-[#0F6F6B]" />
                    Set all applicable to No
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#8aa0aa] hover:text-[#0F6F6B]"
                        aria-label="About set all applicable to No"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {eligibleBulk > 0
                        ? `Applies No to ${eligibleBulk} unanswered Yes/No safety question${
                            eligibleBulk === 1 ? '' : 's'
                          }. Measurements and other patient information are not changed.`
                        : 'No unanswered Yes/No questions remain. Measurements are not changed.'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ) : null}
              <p className="hidden text-[12px] font-medium text-[#5b6b75] sm:block">
                {progress.reviewed} reviewed
                {progress.remaining ? ` · ${progress.remaining} remaining` : ''}
                {progress.removed ? ` · ${progress.removed} removed` : ''}
              </p>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#5b6b75] hover:bg-[#f3f7f8]"
                aria-label={
                  visualOpen
                    ? 'Collapse patient-specific information'
                    : 'Expand patient-specific information'
                }
                onClick={handleToggle}
              >
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', visualOpen && 'rotate-180')}
                />
              </button>
            </div>
          </div>

          {visualOpen && !showBody ? (
            <div className="border-t border-[#e8eef1] px-5 py-5" aria-hidden>
              <div className="space-y-3">
                <div className="h-10 animate-pulse rounded-lg bg-[#f3f7f8]" />
                <div className="h-10 animate-pulse rounded-lg bg-[#f3f7f8]" />
                <div className="h-10 w-4/5 animate-pulse rounded-lg bg-[#f3f7f8]" />
              </div>
            </div>
          ) : null}

          {showBody ? (
            <div className="border-t border-[#e8eef1]">
              {bulkBanner ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-[#eef8f2] px-4 py-2.5 sm:px-5"
                  role="status"
                  aria-live="polite"
                >
                  <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#0b7a52]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {bulkBanner.message}
                  </p>
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-primary hover:underline"
                    onClick={bulkBanner.onUndo}
                  >
                    Undo
                  </button>
                </div>
              ) : null}

              <div className="renew-psi-table">
                <div className="renew-psi-head text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">
                  <span>Item</span>
                  <span className="text-right">Response</span>
                  <span className="text-right">Status</span>
                  <span className="sr-only">More options</span>
                </div>
                <div>
                  {items.map((row) => (
                    <PatientContextQuestionRow
                      key={row.inputCode}
                      row={row}
                      derivedBmiLabel={row.inputCode.toUpperCase() === 'BMI' ? bmi.label : undefined}
                      saving={savingCode === row.inputCode}
                      onSave={onSave}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              </div>

              <PatientContextRemovedList
                removed={removed.map((row) => ({
                  ...row,
                  reasonText: row.reasonText,
                }))}
                onRestore={onRestore}
              />

              <div className="border-t border-[#edf1f3] px-4 py-2.5 sm:px-5">
                <details className="text-[12px] text-[#5b6b75]">
                  <summary className="cursor-pointer list-none font-medium text-[#163447]">
                    <span className="inline-flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-[#8aa0aa]" />
                      Information from earlier in the consultation
                    </span>
                  </summary>
                  <p className="mt-1.5 leading-5 text-[#7a8b94]">
                    Weight, height, age, and other patient information captured earlier will be
                    prefilled when available.
                  </p>
                </details>
                <label
                  htmlFor="renew-psi-note"
                  className="mt-2.5 block text-[12px] font-medium text-[#163447]"
                >
                  Additional details <span className="font-normal text-[#7a8b94]">(optional)</span>
                </label>
                <Textarea
                  id="renew-psi-note"
                  value={additionalNote}
                  maxLength={500}
                  rows={2}
                  onChange={(event) => onNoteChange(event.target.value.slice(0, 500))}
                  placeholder="Add any extra context for this renewal…"
                  className="mt-1 min-h-[44px] resize-y border-[#d7e2e6] px-2.5 py-1.5 text-[12px] leading-4 shadow-none"
                />
                <p className="mt-1 text-right text-[11px] text-[#8aa0aa]">
                  {additionalNote.length}/500
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[#edf1f3] px-5 py-3.5 sm:px-6">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-[#d7e2e6] bg-white px-4 text-sm font-medium"
                  onClick={onCancel}
                  disabled={busy}
                >
                  Back
                </Button>
                <ClinicalPrimaryButton
                  onClick={onConfirm}
                  disabled={!allComplete || busy}
                  loading={busy}
                  loadingLabel="Saving…"
                >
                  Save & continue
                </ClinicalPrimaryButton>
              </div>
            </div>
          ) : null}
        </section>

        <ConfirmDialog
          open={bulkConfirmOpen}
          onOpenChange={setBulkConfirmOpen}
          variant="default"
          title="Set unanswered Yes/No questions to No?"
          description="Only unanswered Yes/No safety questions will be set to No. Measurements and other patient information are not changed."
          confirmLabel="Apply"
          onConfirm={() => {
            setBulkConfirmOpen(false);
            onApplyNoConcerns();
          }}
        />
      </>
    </TooltipProvider>
  );
}

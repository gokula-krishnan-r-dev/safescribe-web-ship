'use client';

import { useId, type ReactNode } from 'react';
import {
  Ban,
  Check,
  ChevronDown,
  CircleHelp,
  List,
  Loader2,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TreatmentOptionView, TreatmentPresentationGroup } from './treatment-options-model';
import { optionKey, presentationBadgeLabel, treatmentOptionDomId } from './treatment-options-model';
import {
  medicationPrimaryName,
  medicationSecondaryName,
  resolvePharmacistProductUse,
} from './pharmacist-product-use';
import { pharmacistFacingCopy } from '@safescript/shared';

const SUITABILITY_BADGE: Record<string, string> = {
  Recommended: 'bg-[#e7f6ee] text-[#1b7a4e] border-[#c8ead8]',
  Suitable: 'bg-[#e8f1fb] text-[#2f5f8f] border-[#c9dcea]',
  'Review required': 'bg-[#fbf3e0] text-[#8a5a12] border-[#ead9b0]',
  Avoid: 'bg-[#fdecee] text-[#b42318] border-[#f3c4c8]',
  'Not suitable': 'bg-[#fdecee] text-[#b42318] border-[#f3c4c8]',
  'Clinical judgment': 'bg-[#fbf3e0] text-[#8a5a12] border-[#ead9b0]',
};

export function TreatmentOptionsHeader({
  addAction,
}: {
  addAction?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[24px] font-bold tracking-tight text-[#1e3a5f] sm:text-[26px]">
            Treatment options
          </h1>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#3d6b9a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden />
                  How options are ranked
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-[280px]">
                Options are ordered from the pathway treatment list and this
                patient&apos;s completed safety screening. SafeScribe does not
                invent ranking in the browser.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Options are prioritized using pathway guidance and this patient&apos;s
          completed safety screening.
        </p>
      </div>
      {addAction}
    </header>
  );
}

export function PathwaySupportedTreatmentsPanel({
  children,
  empty,
  selectedCount = 0,
}: {
  children: ReactNode;
  empty?: boolean;
  selectedCount?: number;
}) {
  const helper = empty
    ? 'No pathway-supported treatments are currently listed. Review other available options and use clinical judgment when appropriate.'
    : selectedCount > 0
      ? `${selectedCount} selected · confirmed treatments appear together in Documents.`
      : 'Treatment options supported by the current clinical pathway. The pharmacist selects the most appropriate treatment.';

  return (
    <section
      className="overflow-hidden rounded-[14px] border border-[#d5dee1] bg-card shadow-[0_2px_4px_rgba(15,23,42,0.04)]"
      aria-labelledby="tx-pathway-supported-heading"
    >
      <div className="border-b border-[#e6ecee] px-5 py-4 sm:px-6">
        <h2 id="tx-pathway-supported-heading" className="text-[16px] font-bold text-[#1e3a5f]">
          Pathway-supported treatment options
        </h2>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{helper}</p>
      </div>
      <div role="group" aria-label="Pathway-supported treatments" className="divide-y divide-[#e6ecee]">
        {children}
      </div>
    </section>
  );
}

/** @deprecated Use PathwaySupportedTreatmentsPanel */
export const RecommendedTreatmentsPanel = PathwaySupportedTreatmentsPanel;

export function TreatmentOptionCard({
  option,
  group,
  isLeadRecommended = false,
  selected,
  detailsOpen,
  selecting,
  selectDisabled,
  selectError,
  onToggleDetails,
  onSelect,
  onOpen,
  details,
  editor,
}: {
  option: TreatmentOptionView;
  group: TreatmentPresentationGroup;
  isLeadRecommended?: boolean;
  selected: boolean;
  detailsOpen: boolean;
  selecting?: boolean;
  selectDisabled?: boolean;
  selectError?: string | null;
  onToggleDetails: () => void;
  onSelect: () => void;
  /** Opens the prescription editor directly (selected treatments). */
  onOpen?: () => void;
  details?: ReactNode;
  editor?: ReactNode;
}) {
  const reactId = useId();
  const key = optionKey(option);
  const detailsId = `${treatmentOptionDomId(key)}-details`;
  const nameId = `tx-name-${option.index}-${reactId}`;
  const badge = presentationBadgeLabel(group, option, isLeadRecommended);
  const product = resolvePharmacistProductUse(option.treatment);
  const primary = medicationPrimaryName(option.treatment);
  const secondary =
    medicationSecondaryName(option.treatment) ||
    [option.treatment.genericName, option.treatment.strength, product.productForm]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(' ');
  const summaryPrimary = option.regimen.presentation.summaryPrimary;
  const summarySecondary = option.regimen.presentation.summarySecondary;
  const regimenNeedsReview = option.regimen.status === 'REVIEW_REQUIRED';
  const regimenDescId = `${nameId}-regimen`;
  const isAddOn = group === 'ADD_ON';
  const isExcluded = group === 'EXCLUDED';
  const canSelectPrimary = !isExcluded && !isAddOn && option.selectable;
  const canAdd = isAddOn && option.selectable;
  const multiSelect = canSelectPrimary;
  const actionLabel = isAddOn
    ? selected
      ? 'Added'
      : 'Add'
    : selected
      ? 'Selected'
      : selecting
        ? 'Selecting…'
        : 'Select';

  return (
    <article
      id={treatmentOptionDomId(key)}
      data-treatment-option-key={key}
      className={cn(
        'bg-card transition-colors',
        selected && !isExcluded && 'bg-[#F4FBFA] shadow-[inset_3px_0_0_#0F817C]',
        isExcluded && 'bg-[#FDF6F6]',
      )}
    >
      <div className="grid items-start gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[28px_minmax(240px,1.1fr)_minmax(280px,1.4fr)_auto] lg:items-center lg:gap-6">
        {multiSelect ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-labelledby={`${nameId} ${regimenDescId}`}
            disabled={selectDisabled || selecting || !canSelectPrimary}
            onClick={onSelect}
            className={cn(
              'hidden h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border-2 lg:flex',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/35 focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-45',
              selected
                ? 'border-[#0F817C] bg-[#0F817C] text-white'
                : 'border-[#c5d0d4] bg-white hover:border-[#0F817C]/70',
            )}
          >
            {selected ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
          </button>
        ) : (
          <span
            className={cn(
              'hidden h-[18px] w-[18px] shrink-0 lg:flex',
              isAddOn || isExcluded ? 'opacity-0' : '',
            )}
            aria-hidden="true"
          />
        )}

        <div className="min-w-0">
          <p
            id={nameId}
            className="text-[15px] font-bold uppercase tracking-[0.02em] text-[#1e3a5f]"
          >
            {primary}
          </p>
          {secondary ? (
            <p className="mt-0.5 text-[13px] leading-snug text-[#667085]">{secondary}</p>
          ) : null}
          <p id={regimenDescId} className="sr-only">
            {regimenNeedsReview
              ? `Regimen requires review${
                  option.regimen.issues?.[0]?.message
                    ? `. ${option.regimen.issues[0].message}`
                    : ''
                }`
              : `Regimen: ${[summaryPrimary, summarySecondary].filter(Boolean).join('. ')}`}
          </p>
        </div>

        <div className="min-w-0">
          {regimenNeedsReview ? (
            <>
              <p className="text-[13.5px] font-medium leading-snug text-[#8a5a12]">
                Regimen requires review
              </p>
              {option.regimen.issues?.[0]?.message ? (
                <p className="mt-0.5 text-[13px] leading-snug text-[#8a5a12]/85">
                  {option.regimen.issues[0].message}
                </p>
              ) : null}
            </>
          ) : (
            <>
              {summaryPrimary ? (
                <p className="text-[14.5px] font-medium leading-snug text-[#344054]">
                  {summaryPrimary}
                </p>
              ) : null}
              {summarySecondary ? (
                <p className="mt-0.5 text-[13.5px] leading-snug text-[#52606d]">
                  {summarySecondary}
                </p>
              ) : null}
            </>
          )}
          {option.whyShown ? (
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#667085]">
              Why shown: {option.whyShown}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">
          {option.treatment.pharmacistModified ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#c8ead8] bg-[#e7f6ee] px-2.5 text-[11.5px] font-semibold text-[#1b7a4e]">
              Pharmacist modified
            </span>
          ) : null}
          <span
            className={cn(
              'inline-flex h-7 min-w-[108px] items-center justify-center rounded-full border px-3 text-[12.5px] font-semibold',
              SUITABILITY_BADGE[badge] ?? SUITABILITY_BADGE.Suitable,
            )}
          >
            {badge}
          </span>

          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            aria-label={
              detailsOpen
                ? `Hide details for ${option.displayName}`
                : `Show details for ${option.displayName}`
            }
            onClick={onToggleDetails}
            className="inline-flex h-10 items-center justify-center gap-1 rounded-md px-2.5 text-[13.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {detailsOpen ? 'Hide details' : 'Details'}
            <ChevronDown
              className={cn(
                'h-4 w-4 motion-reduce:transition-none motion-safe:transition-transform motion-safe:duration-200',
                detailsOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {selected && onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-10 min-w-[72px] items-center justify-center rounded-lg border border-[#0F817C]/35 bg-white px-3 text-[13px] font-semibold text-[#0F817C] hover:bg-[#F4FBFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Open
            </button>
          ) : null}

          {isExcluded ? (
            option.clinicallyOverridden ? null : (
              <span className="text-[12.5px] font-semibold text-[#b42318]">
                Cannot select
              </span>
            )
          ) : (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={
                selected
                  ? isAddOn
                    ? `Remove ${option.displayName} from add-on treatments`
                    : `Remove ${option.displayName} from the treatment plan`
                  : isAddOn
                    ? `Add ${option.displayName}`
                    : `Add ${option.displayName} to the treatment plan`
              }
              id={`tx-select-${key}`}
              disabled={selectDisabled || selecting || (!canSelectPrimary && !canAdd)}
              onClick={onSelect}
              className={cn(
                'inline-flex h-10 min-w-[92px] items-center justify-center gap-1.5 rounded-lg border px-3.5 text-[13.5px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                'disabled:pointer-events-none disabled:opacity-45',
                selected
                  ? 'border-[#0F817C] bg-[#0F817C] text-white'
                  : 'border-[#3d6b9a] bg-white text-[#2f5f8f] hover:bg-[#eef4f8]',
              )}
            >
              {selecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {selected && !selecting ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
              {actionLabel}
            </button>
          )}
        </div>
      </div>

      {selectError ? (
        <p className="px-5 pb-3 text-[13px] text-[#b42318]" role="alert">
          {selectError}
        </p>
      ) : null}

      <div
        id={detailsId}
        className={cn(
          'grid motion-reduce:transition-none motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out',
          detailsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {detailsOpen && details ? details : null}
        </div>
      </div>

      {selected && editor ? (
        <div className="border-t border-[#e6ecee] bg-[#f8fbfb] px-4 py-4 sm:px-5">
          {editor}
        </div>
      ) : null}
    </article>
  );
}

function DetailsBlock({
  heading,
  body,
  emphasized,
}: {
  heading: string;
  body: string;
  emphasized?: boolean;
}) {
  if (!body) return null;
  const copy = pharmacistFacingCopy(body);
  if (!copy) return null;
  return (
    <div
      className={cn(
        emphasized &&
          'rounded-xl bg-tx-preferred-bg px-5 py-5 sm:px-6',
      )}
    >
      <h4 className="text-[15px] font-bold leading-snug text-[#1e3a5f]">{heading}</h4>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-[#344054]">{copy}</p>
    </div>
  );
}

export function TreatmentReadOnlyDetails({
  option,
  onRequestOverride,
}: {
  option: TreatmentOptionView;
  onRequestOverride?: () => void;
}) {
  const suggested = pharmacistFacingCopy(
    option.regimen.status === 'READY'
      ? option.regimen.presentation.expandedText
      : option.regimen.presentation.expandedText || 'Regimen requires review',
  );

  return (
    <section
      aria-label={`${option.displayName} treatment details`}
      className="border-t border-[#e6ecee] bg-white px-5 py-8 sm:px-10 sm:py-9"
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-12 md:gap-y-9">
        <div className="flex min-w-0 flex-col gap-8">
          <DetailsBlock heading="Why recommended" body={option.whyRecommended} />
          <DetailsBlock heading="Eligibility" body={option.eligibility} />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <DetailsBlock heading="Suggested regimen" body={suggested} emphasized />
          <DetailsBlock
            heading="Monitoring and follow-up"
            body={option.monitoringAndFollowUp}
          />
        </div>
      </div>
      {onRequestOverride ? (
        <button
          type="button"
          onClick={onRequestOverride}
          className="mt-6 inline-flex h-10 items-center rounded-lg border border-[#d6a15c] bg-[#fff8ee] px-3.5 text-[13.5px] font-semibold text-[#8a5a12] hover:bg-[#fbf3e0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          Use clinical judgment
        </button>
      ) : null}
    </section>
  );
}

export function TreatmentOptionsFilter({
  id,
  value,
  onChange,
  label = 'Search treatments',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="border-b border-[#e6ecee] bg-[#f8fbfb] px-4 py-2.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="h-10 w-full rounded-lg border border-[#d5dee1] bg-white px-3 text-[13.5px] text-[#1e3a5f] outline-none placeholder:text-[#98a2b3] focus-visible:ring-2 focus-visible:ring-primary/30"
      />
    </div>
  );
}

export function TreatmentGroupAccordion({
  id,
  group,
  count,
  open,
  onToggle,
  children,
}: {
  id: string;
  group: 'OTHER_SUITABLE' | 'ADD_ON' | 'EXCLUDED';
  count: number;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const copy =
    group === 'OTHER_SUITABLE'
      ? {
          title: 'Other suitable options',
          description: 'Select any that belong on this plan',
          action: `View ${count} other suitable option${count === 1 ? '' : 's'}`,
          actionVisible: 'View options',
        }
      : group === 'ADD_ON'
        ? {
            title: 'Add-on treatments',
            description: '',
            action: `View ${count} add-on treatment${count === 1 ? '' : 's'}`,
            actionVisible: 'View options',
          }
        : {
            title: 'Avoid / not suitable',
            description:
              'Excluded based on allergy, interaction, contraindication or patient-specific factors.',
            action: `View ${count} excluded treatment${count === 1 ? '' : 's'}`,
            actionVisible: 'View excluded treatments',
          };

  const excluded = group === 'EXCLUDED';

  return (
    <section
      className={cn(
        'overflow-hidden rounded-[12px] border',
        excluded ? 'border-[#f3c4c8] bg-[#FDF6F6]' : 'border-[#d5dee1] bg-card',
      )}
    >
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        aria-label={copy.action}
        onClick={onToggle}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 sm:px-5"
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            excluded ? 'bg-[#fdecee] text-[#b42318]' : 'bg-[#eef4f8] text-[#3d6b9a]',
          )}
        >
          {excluded ? <Ban className="h-4 w-4" /> : <List className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-bold text-[#1e3a5f]">{copy.title}</span>
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[12px] font-semibold tabular-nums',
                excluded ? 'bg-[#fdecee] text-[#b42318]' : 'bg-[#eef2f4] text-[#52606d]',
              )}
            >
              {count}
            </span>
          </span>
          {copy.description ? (
            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
              {copy.description}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'hidden shrink-0 text-[13px] font-semibold sm:inline',
            excluded ? 'text-[#b42318]' : 'text-[#3d6b9a]',
          )}
        >
          {copy.actionVisible}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
            excluded && 'text-[#b42318]',
          )}
          aria-hidden
        />
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-header`}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="divide-y divide-[#e6ecee] border-t border-[#e6ecee] bg-card">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClinicalJudgmentNotice() {
  return (
    <p className="flex items-start gap-2 text-[13px] leading-snug text-[#3d6b9a]">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      All options remain available for pharmacist review. Suitability does not replace
      clinical judgment.
    </p>
  );
}

export function SelectedTreatmentEditorHeader({
  headingId = 'selected-treatment-editor-heading',
}: {
  headingId?: string;
}) {
  return (
    <div className="mb-3">
      <h3
        id={headingId}
        tabIndex={-1}
        className="text-[15px] font-bold text-[#1e3a5f] outline-none"
      >
        Selected treatment
      </h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Complete and review the prescription details below.
      </p>
    </div>
  );
}

export function SelectedTreatmentPreview({
  isAddOn,
  onEdit,
  headingId = 'selected-treatment-editor-heading',
}: {
  isAddOn?: boolean;
  onEdit: () => void;
  headingId?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3
          id={headingId}
          tabIndex={-1}
          className="text-[15px] font-bold text-[#1e3a5f] outline-none"
        >
          {isAddOn ? 'Added treatment' : 'Selected treatment'}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          This option is selected. Open the prescription editor only if you need to
          change the directions, quantity, or refills.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-1.5 px-3 text-[13px]"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit prescription
      </Button>
    </div>
  );
}

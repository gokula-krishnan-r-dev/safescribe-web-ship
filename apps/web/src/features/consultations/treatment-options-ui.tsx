'use client';

import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Pill,
  FlaskConical,
  HeartPulse,
  AlertTriangle,
  ShieldAlert,
  Pencil,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { TreatmentRecommendation } from './types';
import type {
  PrescriptionGroupKey,
  SafetyTier,
  TreatmentOptionView,
} from './treatment-options-model';
import { optionKey, treatmentOptionDomId, supportsInlinePrescriptionEditor } from './treatment-options-model';
import { ConsultationRegimenEditor } from './consultation-regimen-editor';
import { InlineTreatmentEditor } from './inline-treatment-editor';
import { ChangeProductDialog } from './change-product-dialog';
import {
  applyMedicationProductChange,
  medicationPrimaryName,
  medicationSecondaryName,
  resolvePharmacistProductUse,
} from './pharmacist-product-use';
import { countSafetyReviewItems } from './inline-safety-review';
import type { DrugSearchResult } from './medication-utils';

/* ── Tier visual tokens (CSS variables from globals) ─────────────────────── */

const TIER_SHELL: Record<
  PrescriptionGroupKey,
  { border: string; headerBg: string; headerText: string }
> = {
  PREFERRED: {
    border: 'border-tx-preferred-border',
    headerBg: 'bg-tx-preferred-bg',
    headerText: 'text-tx-preferred-fg',
  },
  CAUTION: {
    border: 'border-tx-caution-border',
    headerBg: 'bg-tx-caution-bg',
    headerText: 'text-tx-caution-fg',
  },
  AVOID: {
    border: 'border-tx-avoid-border',
    headerBg: 'bg-tx-avoid-bg',
    headerText: 'text-tx-avoid-fg',
  },
};

const BADGE_CLASS: Record<SafetyTier, string> = {
  PREFERRED:
    'bg-tx-preferred-badge-bg text-tx-preferred-fg border-tx-preferred-border/70',
  CAUTION:
    'bg-tx-caution-badge-bg text-tx-caution-fg border-tx-caution-border/70',
  REVIEW_REQUIRED:
    'bg-tx-caution-badge-bg text-tx-caution-fg border-tx-caution-border/70',
  AVOID: 'bg-tx-avoid-badge-bg text-tx-avoid-fg border-tx-avoid-border/70',
};

const GROUP_TITLE: Record<PrescriptionGroupKey, string> = {
  PREFERRED: 'Preferred treatments',
  CAUTION: 'Use with caution',
  AVOID: 'Avoid / not suitable',
};

/* ── Selection control ───────────────────────────────────────────────────── */

function SelectionControl({
  mode,
  selected,
  disabled,
  labelledBy,
}: {
  mode: 'radio' | 'checkbox' | 'none';
  selected: boolean;
  disabled?: boolean;
  labelledBy?: string;
}) {
  if (mode === 'none') {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-tx-avoid-border/80 bg-tx-avoid-bg text-tx-avoid"
        aria-hidden
        title="Not selectable"
      >
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
    );
  }

  if (mode === 'checkbox') {
    return (
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors',
          disabled && 'opacity-40',
          selected
            ? 'border-[color:var(--tx-preferred)] bg-[color:var(--tx-preferred)]'
            : 'border-muted-foreground/35 bg-background',
        )}
        aria-hidden
      >
        {selected && (
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white" aria-hidden>
            <path
              d="M2.5 6.2 5 8.7 9.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    );
  }

  return (
    <span
      role="presentation"
      aria-labelledby={labelledBy}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        disabled && 'opacity-40',
        selected
          ? 'border-[color:var(--tx-preferred)]'
          : 'border-muted-foreground/35',
      )}
    >
      {selected && (
        <span className="h-3 w-3 rounded-full bg-[color:var(--tx-preferred)]" />
      )}
    </span>
  );
}

/* ── Safety badge ────────────────────────────────────────────────────────── */

export function TreatmentSafetyBadge({
  label,
  tier,
  originLabel,
  overridden,
}: {
  label: string;
  tier: SafetyTier;
  originLabel?: string;
  overridden?: boolean;
}) {
  const badgeTier =
    overridden && (tier === 'AVOID' || tier === 'REVIEW_REQUIRED')
      ? 'CAUTION'
      : tier;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span
        className={cn(
          'inline-flex h-[30px] min-w-[96px] items-center justify-center rounded-md border px-3.5 text-[14px] font-semibold leading-none',
          BADGE_CLASS[badgeTier],
        )}
      >
        {label}
      </span>
      {originLabel && (
        <span className="text-[11px] font-medium text-muted-foreground">
          {originLabel}
        </span>
      )}
    </div>
  );
}

/* ── Prescription safety group ───────────────────────────────────────────── */

export function PrescriptionSafetyGroup({
  groupKey,
  children,
}: {
  groupKey: PrescriptionGroupKey;
  children: ReactNode;
}) {
  const shell = TIER_SHELL[groupKey];
  return (
    <section
      className={cn(
        'treatment-group mb-3.5 overflow-hidden rounded-lg border bg-card',
        shell.border,
        groupKey === 'PREFERRED' && 'preferred',
        groupKey === 'CAUTION' && 'caution',
        groupKey === 'AVOID' && 'avoid',
      )}
      aria-labelledby={`tx-group-${groupKey}`}
    >
      <header
        className={cn(
          'treatment-group-header flex min-h-[38px] items-center px-4 py-2',
          shell.headerBg,
        )}
      >
        <h3
          id={`tx-group-${groupKey}`}
          className={cn('text-[15px] font-semibold tracking-tight', shell.headerText)}
        >
          {GROUP_TITLE[groupKey]}
        </h3>
      </header>
      <div className="divide-y divide-[color:var(--consult-divider,#D9E1E3)] bg-card">
        {children}
      </div>
    </section>
  );
}

/* ── Compact treatment row ───────────────────────────────────────────────── */

function TreatmentRowCopy({
  option,
  selected,
  expanded,
  onChangeProduct,
}: {
  option: TreatmentOptionView;
  selected: boolean;
  expanded: boolean;
  onChangeProduct?: () => void;
}) {
  const nameId = `tx-name-${option.index}`;
  const summary =
    option.regimen.status === 'READY'
      ? [
          option.regimen.presentation.summaryPrimary,
          option.regimen.presentation.summarySecondary,
        ]
          .filter(Boolean)
          .join(' · ')
      : option.regimenSummary;
  const product = resolvePharmacistProductUse(option.treatment);
  const primary = medicationPrimaryName(option.treatment);
  const secondary = medicationSecondaryName(option.treatment);
  const isRx =
    option.treatmentType === 'PRESCRIPTION' ||
    option.treatment.treatmentKind === 'MEDICATION' ||
    !option.treatment.treatmentKind;
  const reviewCount = countSafetyReviewItems(option);

  const nameBlock = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <p
        id={nameId}
        tabIndex={-1}
        className={cn(
          'font-semibold leading-[1.35] text-[#1e3a5f] outline-none',
          expanded ? 'text-[18px] uppercase tracking-wide' : 'text-[16px]',
        )}
      >
        {expanded && isRx ? primary : option.displayName}
      </p>
      {selected && option.selectable && (
        <span className="text-[12px] font-semibold text-tx-preferred-fg">Selected</span>
      )}
    </div>
  );

  if (!expanded) {
    return (
      <div className="min-w-0 flex-1">
        {nameBlock}
        {summary ? (
          <p className="mt-[3px] text-[13.5px] leading-[1.4] text-[#58636F]">{summary}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f6f4] text-[#0f766e]">
          <Pill className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          {isRx ? (
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6b7c86]">
              Prescription
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {nameBlock}
            {onChangeProduct ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeProduct();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#c5d0d4] bg-white px-2.5 text-[12.5px] font-semibold text-[#1e3a5f] hover:bg-[#f4f7f8]"
                aria-label={`Change medication product for ${primary}`}
                title="Change medication, strength, or dosage form"
              >
                <Pencil className="h-3.5 w-3.5" />
                Change product
              </button>
            ) : null}
          </div>
          {secondary ? (
            <p className="mt-[2px] text-[13px] leading-snug text-[#58636F]">{secondary}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {product.productForm ? (
              <span className="rounded-full bg-[#eef2f4] px-2.5 py-0.5 text-[12px] font-medium text-[#52606d]">
                {product.productForm}
              </span>
            ) : null}
            {product.route ? (
              <span className="rounded-full bg-[#eef2f4] px-2.5 py-0.5 text-[12px] font-medium text-[#52606d]">
                {product.route}
              </span>
            ) : null}
            {option.treatment.pharmacistModified || option.origin === 'PHARMACIST_ADDED' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f6f4] px-2.5 py-0.5 text-[12px] font-semibold text-[#0f766e]">
                <Check className="h-3 w-3" />
                Pharmacist modified
              </span>
            ) : null}
          </div>
          {reviewCount > 0 ? (
            <p className="mt-1 text-[12px] text-amber-800">
              {reviewCount} safety item{reviewCount === 1 ? '' : 's'} require
              {reviewCount === 1 ? 's' : ''} review
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TreatmentOptionRow({
  option,
  selected,
  expanded,
  controlMode,
  onSelect,
  onToggleExpand,
  onSave,
  detail,
}: {
  option: TreatmentOptionView;
  selected: boolean;
  expanded: boolean;
  controlMode: 'radio' | 'checkbox' | 'none';
  onSelect: () => void;
  onToggleExpand: () => void;
  onSave?: (updated: TreatmentRecommendation) => Promise<TreatmentRecommendation | void> | TreatmentRecommendation | void;
  detail?: ReactNode;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const hardBlocked = !option.selectable && !option.clinicallyOverridden;
  const nameId = `tx-name-${option.index}`;
  const rowKey = optionKey(option);
  const isSelected = selected && option.selectable;
  const canChangeProduct = Boolean(onSave) && supportsInlinePrescriptionEditor(option);

  const handleProductSelect = (drug: DrugSearchResult) => {
    const next = applyMedicationProductChange(option.treatment, drug);
    void onSave?.(next);
  };

  return (
    <div
      id={treatmentOptionDomId(rowKey)}
      data-treatment-option-key={rowKey}
      className={cn(
        'treatment-row bg-card transition-colors',
        isSelected && 'bg-[#F1FAF9] shadow-[inset_3px_0_0_#0F817C]',
        hardBlocked && !isSelected && option.safetyTier === 'AVOID' && 'bg-tx-avoid-bg/25',
        hardBlocked &&
          !isSelected &&
          option.safetyTier === 'REVIEW_REQUIRED' &&
          'bg-tx-caution-bg/35',
        option.clinicallyOverridden &&
          !isSelected &&
          'bg-tx-caution-bg/30 shadow-[inset_3px_0_0_var(--tx-caution-border)]',
        'focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-[-3px] focus-within:outline-[rgba(15,129,124,0.18)]',
      )}
    >
      <div className="grid min-h-[68px] grid-cols-[28px_minmax(0,1fr)_auto_36px] items-start gap-3.5 px-[18px] py-2.5 sm:gap-3.5">
        {hardBlocked ? (
          <div className="col-span-2 flex min-w-0 items-start gap-3.5">
            <SelectionControl mode="none" selected={false} disabled />
            <div className="min-w-0 flex-1">
              <TreatmentRowCopy
                option={option}
                selected={false}
                expanded={expanded}
                onChangeProduct={
                  canChangeProduct && expanded ? () => setProductOpen(true) : undefined
                }
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            role={controlMode === 'checkbox' ? 'checkbox' : 'radio'}
            aria-checked={selected}
            aria-labelledby={nameId}
            onClick={onSelect}
            className="col-span-2 flex min-w-0 items-start gap-3.5 rounded-md text-left focus-visible:outline-none"
          >
            <SelectionControl
              mode={controlMode === 'none' ? 'checkbox' : controlMode}
              selected={selected}
              labelledBy={nameId}
            />
            <TreatmentRowCopy
              option={option}
              selected={selected}
              expanded={expanded}
              onChangeProduct={
                canChangeProduct && expanded ? () => setProductOpen(true) : undefined
              }
            />
          </button>
        )}

        <TreatmentSafetyBadge
          label={option.badgeLabel}
          tier={option.safetyTier}
          overridden={option.clinicallyOverridden}
          originLabel={
            option.origin === 'PHARMACIST_ADDED' ? 'Pharmacist-added' : undefined
          }
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Hide details for ${option.displayName}`
              : `Show details for ${option.displayName}`
          }
          className="flex h-9 w-9 shrink-0 items-center justify-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--tx-preferred)]"
        >
          <ChevronDown
            className={cn(
              'h-[18px] w-[18px] transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-250 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {expanded && (
            <div className="border-t border-[color:var(--consult-divider,#D9E1E3)] bg-background px-[18px] py-4">
              {detail}
            </div>
          )}
        </div>
      </div>
      <ChangeProductDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        currentLabel={medicationPrimaryName(option.treatment)}
        onSelect={handleProductSelect}
      />
    </div>
  );
}

/* ── Row detail panel ────────────────────────────────────────────────────── */

export function TreatmentRowDetail({
  option,
  onSave,
  onCancel,
  onDirtyChange,
  saving,
  saveError,
  checkingSafety,
  safetyUnavailable,
  onRetrySafety,
  onRequestOverride,
  onClearOverride,
  patientPregnant = false,
  patientHasAllergies = true,
  headingId,
  labsText,
  extractedLabs,
  saveLabel,
  continueHint,
  consultationId,
}: {
  option: TreatmentOptionView;
  onSave?: (updated: TreatmentRecommendation) => Promise<TreatmentRecommendation | void> | TreatmentRecommendation | void;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  saving?: boolean;
  saveError?: string | null;
  checkingSafety?: boolean;
  safetyUnavailable?: boolean;
  onRetrySafety?: () => void;
  onRequestOverride?: () => void;
  onClearOverride?: () => void;
  patientPregnant?: boolean;
  patientHasAllergies?: boolean;
  headingId?: string;
  labsText?: string | null;
  extractedLabs?: Array<{ test?: string | null; value?: string | null; unit?: string | null }>;
  saveLabel?: string;
  continueHint?: string;
  consultationId?: string;
}) {
  const t = option.treatment;
  const inline = supportsInlinePrescriptionEditor(option);

  if (inline && onSave) {
    return (
      <InlineTreatmentEditor
        option={option}
        headingId={headingId}
        onSave={onSave}
        onCancel={onCancel ?? (() => undefined)}
        onDirtyChange={onDirtyChange}
        saving={saving}
        saveError={saveError}
        checkingSafety={checkingSafety}
        safetyUnavailable={safetyUnavailable}
        onRetrySafety={onRetrySafety}
        onRequestOverride={onRequestOverride}
        patientPregnant={patientPregnant}
        patientHasAllergies={patientHasAllergies}
        labsText={labsText}
        extractedLabs={extractedLabs}
        saveLabel={saveLabel}
        continueHint={continueHint}
        consultationId={consultationId}
      />
    );
  }

  return (
    <div className="space-y-3 text-[13px]">
      <ConsultationRegimenEditor
        value={t}
        editing={Boolean(onSave)}
        onChange={
          onSave
            ? (next) =>
                void onSave({
                  ...t,
                  ...next,
                  reasoning: next.clinicalNotes?.trim() || t.reasoning,
                })
            : undefined
        }
      />

      {option.clinicallyOverridden && t.clinicalOverride ? (
        <div className="rounded-md border border-tx-caution-border/60 bg-tx-caution-bg/50 px-2.5 py-2">
          <p className="text-[12px] font-semibold text-tx-caution-fg">
            Clinical override documented
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-foreground/85">
            {t.clinicalOverride.reason}
          </p>
          {onClearOverride ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearOverride}
              className="mt-1.5 h-7 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              Remove override
            </Button>
          ) : null}
        </div>
      ) : null}

      {t.brandName && t.genericName ? (
        <p className="text-[12px] text-muted-foreground">
          Brand may appear as {t.brandName}.
        </p>
      ) : null}
    </div>
  );
}

/* ── OTC / Supplement accordion ──────────────────────────────────────────── */

export function SupportiveCategoryAccordion({
  id,
  title,
  icon: Icon,
  optionCount,
  selectedSummary,
  hasWarning,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Pill;
  optionCount: number;
  selectedSummary?: string | null;
  hasWarning?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const countLabel =
    optionCount === 1 ? '1 option' : `${optionCount} options`;

  return (
    <div className="overflow-hidden rounded-lg border border-tx-preferred-border/80 bg-card">
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--tx-preferred)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tx-preferred-bg text-tx-preferred">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">
            {title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
            {selectedSummary ? (
              <span className="font-medium text-tx-preferred-fg">
                {selectedSummary}
              </span>
            ) : (
              <span>{countLabel}</span>
            )}
            {hasWarning && (
              <span className="inline-flex items-center gap-1 font-semibold text-tx-caution-fg">
                <AlertTriangle className="h-3.5 w-3.5" />
                Review required
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-header`}
        className={cn(
          'grid transition-[grid-template-rows] duration-250 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="divide-y divide-[color:var(--consult-divider,#D9E1E3)] border-t border-[color:var(--consult-divider,#D9E1E3)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export const TreatmentCategoryIcons = {
  otc: Pill,
  supplement: FlaskConical,
  nonDrug: HeartPulse,
} as const;

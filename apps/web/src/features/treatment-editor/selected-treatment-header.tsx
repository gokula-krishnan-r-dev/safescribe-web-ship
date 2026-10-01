'use client';

import { useState, type ReactNode } from 'react';
import { Check, ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { editorBadgeClass, editorCardClass, editorChipClass } from './editor-styles';

export interface SelectedTreatmentHeaderProps {
  primaryName: string;
  secondaryName?: string;
  productForm?: string;
  route?: string;
  recommendationBadge?: string;
  pathwayReason?: string;
  selected?: boolean;
  showSelectedBadge?: boolean;
  pharmacistModified?: boolean;
  onChangeProduct?: () => void;
  detailsContent?: string;
  headingId?: string;
}

export function SelectedTreatmentHeader({
  primaryName,
  secondaryName,
  productForm,
  route,
  recommendationBadge,
  pathwayReason,
  selected = true,
  showSelectedBadge = true,
  pharmacistModified,
  onChangeProduct,
  detailsContent,
  headingId = 'selected-treatment-editor-heading',
}: SelectedTreatmentHeaderProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <header className="space-y-3">
      <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#0f766e]">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border border-[#0F817C]/25 bg-[#e8f6f4]">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        Selected treatment
      </p>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h3
            id={headingId}
            tabIndex={-1}
            className="text-[20px] font-bold uppercase leading-tight tracking-[0.02em] text-[#1e3a5f] outline-none sm:text-[22px]"
          >
            {primaryName}
          </h3>

          {secondaryName ? (
            <p className="text-[13.5px] leading-snug text-[#667085]">{secondaryName}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
            {productForm ? <span className={editorChipClass}>{productForm}</span> : null}
            {route ? <span className={editorChipClass}>{route}</span> : null}
            {onChangeProduct ? (
              <button
                type="button"
                onClick={onChangeProduct}
                className="font-semibold text-[#3d6b9a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25"
              >
                Change product
              </button>
            ) : null}
            {pathwayReason ? (
              <>
                <span className="text-[#98a2b3]" aria-hidden>
                  ·
                </span>
                <span className="font-semibold text-[#3d6b9a]">{pathwayReason}</span>
              </>
            ) : null}
            {pharmacistModified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f6f4] px-2.5 py-0.5 text-[12px] font-semibold text-[#0f766e]">
                <Check className="h-3 w-3" aria-hidden />
                Pharmacist modified
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {recommendationBadge ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c8ead8] bg-[#e7f6ee] px-2.5 text-[12.5px] font-semibold text-[#1b7a4e]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {recommendationBadge}
            </span>
          ) : null}
          {detailsContent ? (
            <button
              type="button"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((v) => !v)}
              className="inline-flex h-10 items-center gap-0.5 rounded-md px-2.5 text-[13.5px] font-semibold text-[#3d6b9a] hover:bg-[#eef4f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25"
            >
              Details
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          {selected && showSelectedBadge ? (
            <span className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1e3a5f] px-3.5 text-[13.5px] font-semibold text-white shadow-sm">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Selected
            </span>
          ) : null}
        </div>
      </div>

      {detailsOpen && detailsContent ? (
        <div className="rounded-lg border border-[#e6ecee] bg-[#f8fbfb] px-3.5 py-3 text-[13px] leading-relaxed text-[#667085]">
          {detailsContent}
        </div>
      ) : null}
    </header>
  );
}

export function PrescriptionDetailsSection({
  children,
  headingId = 'prescription-details-heading',
  subtitle = 'Review and adjust for this patient.',
  headerRight,
}: {
  children: ReactNode;
  headingId?: string;
  subtitle?: string;
  headerRight?: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="space-y-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id={headingId} className="text-[15px] font-bold text-[#1e3a5f]">
            Prescription details
          </h4>
          {subtitle ? (
            <p className="mt-0.5 text-[13px] text-[#667085]">{subtitle}</p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function EditorCard({
  title,
  badge,
  subtitle,
  children,
  footer,
  headerRight,
  hideTitle = false,
  className,
}: {
  title?: string;
  badge?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  hideTitle?: boolean;
  className?: string;
}) {
  const showHeader = !hideTitle && (title || badge || subtitle || headerRight);

  return (
    <div className={cn(editorCardClass, className)}>
      {showHeader ? (
        <div className={cn('mb-3', subtitle && 'space-y-1')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {title ? (
                <h5 className="text-[13.5px] font-bold text-[#1e3a5f]">{title}</h5>
              ) : null}
              {badge ? <span className={editorBadgeClass}>{badge}</span> : null}
            </div>
            {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
          </div>
          {subtitle ? (
            <p className="text-[12.5px] text-[#667085]">{subtitle}</p>
          ) : null}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f4] pt-3">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function EditLinkButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {label}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </>
  );

  if (!onClick) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[#3d6b9a]',
          className,
        )}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-[#3d6b9a] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/25',
        className,
      )}
    >
      {content}
    </button>
  );
}

export function OutlineActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-9 gap-1.5 rounded-[10px] border-[#0F817C]/30 bg-white px-3.5 text-[13px] font-semibold text-[#0F817C]',
        'hover:border-[#0F817C]/45 hover:bg-[#F4FBFA]',
      )}
    >
      <span className="text-[15px] leading-none font-normal" aria-hidden>
        +
      </span>
      {label}
    </Button>
  );
}

export function ProductReviewBanner({ message }: { message: string }) {
  return (
    <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
      {message}
    </p>
  );
}

export function RouteSelectField({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (route: string) => void;
}) {
  return (
    <div className="max-w-xs">
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-[#1e3a5f]">
        Route <span className="text-destructive">*</span>
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full appearance-none rounded-[10px] border border-[#d8e0e3] bg-white px-3 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-[#0F817C]/15"
      >
        <option value="">Select…</option>
        {options.map((route) => (
          <option key={route} value={route}>
            {route}
          </option>
        ))}
      </select>
    </div>
  );
}

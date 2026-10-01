'use client';

import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { Check, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeferredSectionOpen } from './use-deferred-section-open';

export function Step3SectionAccordion({
  number,
  title,
  subtitle,
  collapsedSummary,
  badge,
  headerRight,
  open,
  confirmed,
  locked,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  collapsedSummary?: string | null;
  badge?: ReactNode;
  headerRight?: ReactNode;
  open: boolean;
  confirmed?: boolean;
  locked?: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const stableToggle = useCallback(() => {
    if (locked) return;
    onToggle();
  }, [locked, onToggle]);
  const { visualOpen, showBody, handleToggle } = useDeferredSectionOpen(open, stableToggle);
  const showSummary = Boolean(confirmed && !visualOpen && collapsedSummary);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7e2e6] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex w-full items-start gap-3 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={visualOpen}
          aria-disabled={locked}
          onClick={handleToggle}
        >
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150',
              confirmed
                ? 'bg-[#16A34A] text-white'
                : visualOpen
                  ? 'bg-[#0F6F6B] text-white'
                  : 'bg-[#e8eef1] text-[#5b6b75]',
            )}
          >
            {confirmed ? <Check className="h-4 w-4" strokeWidth={2.5} /> : number}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-[#163447]">{title}</span>
            </span>
            <span className="mt-0.5 block text-[12px] leading-5 text-[#5b6b75]">
              {showSummary ? collapsedSummary : subtitle}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {headerRight}
          {badge}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#5b6b75] hover:bg-[#f3f7f8] disabled:opacity-40"
            aria-label={visualOpen ? `Collapse ${title}` : `Expand ${title}`}
            disabled={locked}
            onClick={handleToggle}
          >
            {visualOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
      {showBody ? <div className="border-t border-[#e8eef1]">{children}</div> : null}
    </section>
  );
}

export function Step3EvidenceCallout() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[#d7e8f4] bg-[#f3f8fc] px-3.5 py-2.5 text-[12px] leading-5 text-[#1e4b73]">
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#2b6cb0]" aria-hidden />
      <p>
        <span className="font-semibold">Guided by evidence.</span> You remain in control.
      </p>
    </div>
  );
}

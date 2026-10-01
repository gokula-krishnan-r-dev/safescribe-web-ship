'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  CalendarClock,
  FileText,
  MoreHorizontal,
  Navigation,
  Pencil,
  Pill,
  TestTube2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdaptationType } from '@safescript/shared';

export const ADAPT_TYPE_ICONS: Record<AdaptationType, LucideIcon> = {
  dose: Pill,
  dosage_form: TestTube2,
  regimen: CalendarClock,
  route: Navigation,
  therapeutic_substitution: ArrowLeftRight,
  other: MoreHorizontal,
};

export function AdaptSectionGlyph({
  complete,
  className,
}: {
  complete?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid size-[50px] shrink-0 place-items-center rounded-full',
        complete ? 'bg-[#e7f6ef]' : 'bg-[#e7f5f4]',
        className,
      )}
      aria-hidden
    >
      <FileText className={cn('size-[22px]', complete ? 'text-[#199f6b]' : 'text-[#0f6f73]')} />
    </span>
  );
}

export function AdaptCollapsedSummaryCard({
  title,
  summary,
  emphasize = false,
  onEdit,
}: {
  title: string;
  summary: string;
  emphasize?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex min-h-[104px] items-center justify-between gap-4 rounded-2xl border border-[#dce4e8] bg-white px-[22px] py-5 shadow-[0_4px_14px_rgba(28,48,64,0.04)] sm:px-[26px]">
      <div className="flex min-w-0 items-center gap-4">
        <AdaptSectionGlyph />
        <div className="min-w-0">
          <p className="text-[16px] font-medium leading-snug text-[#172337]">{title}</p>
          <p
            className={cn(
              'mt-1 truncate leading-tight text-[#172337]',
              emphasize
                ? 'text-[20px] font-semibold tracking-[-0.01em]'
                : 'text-[15px] font-medium text-[#27405c]',
            )}
            title={summary}
          >
            {summary}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-[46px] shrink-0 items-center gap-2 rounded-[10px] border border-[#c9d5da] bg-white px-5 text-[15px] font-semibold text-[#0f6f73] transition-colors hover:border-[#14878a] hover:bg-[#f4fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14878a]/25"
      >
        <Pencil className="size-4" />
        Edit
      </button>
    </div>
  );
}

export function AdaptCollapsedPrescriptionCard({
  medicationName,
  onEdit,
}: {
  medicationName: string;
  onEdit: () => void;
}) {
  return (
    <AdaptCollapsedSummaryCard
      title="Original prescription"
      summary={medicationName}
      emphasize
      onEdit={onEdit}
    />
  );
}

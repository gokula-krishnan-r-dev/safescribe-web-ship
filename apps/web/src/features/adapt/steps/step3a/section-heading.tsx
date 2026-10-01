'use client';

import { cn } from '@/lib/utils';

export function SectionHeading({
  number,
  title,
  helper,
}: {
  number: number;
  title: string;
  helper?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B] text-sm font-semibold text-white">
        {number}
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-[16px] font-semibold text-[#102a43]">{title}</h3>
        {helper ? <p className="mt-0.5 text-xs text-[#627d98]">{helper}</p> : null}
      </div>
    </div>
  );
}

export function OptionCard({
  selected,
  onSelect,
  title,
  subtitle,
  helper,
  badge,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  helper?: string;
  badge?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col rounded-xl p-4 text-left transition-all',
        selected
          ? 'border-2 border-[#0F6F6B] bg-[#F1FAF9]/60 shadow-sm'
          : 'border border-[#d9e4e8] bg-white hover:border-[#b0c4cb] hover:bg-slate-50/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
              selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
            )}
          >
            {selected ? <span className="h-2 w-2 rounded-full bg-[#0F6F6B]" /> : null}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#102a43]">{title}</p>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-[#627d98]">{subtitle}</p>
            ) : null}
            {helper ? <p className="mt-1.5 text-xs leading-relaxed text-[#627d98]">{helper}</p> : null}
          </div>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-[#b2dfdb] bg-[#e6f4f1] px-2 py-0.5 text-[10px] font-semibold text-[#0F6F6B]">
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

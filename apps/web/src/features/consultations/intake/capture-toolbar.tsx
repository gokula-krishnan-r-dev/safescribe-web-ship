'use client';

import type { ReactNode } from 'react';
import { Camera, Languages, Mic, Pencil, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IntakeCaptureMode } from '@safescript/shared';
import { INTAKE_COPY } from './intake-copy';

type Props = {
  mode: IntakeCaptureMode;
  photoCount: number;
  photoLimit: number;
  translateActive: boolean;
  disabled?: boolean;
  onSelectMode: (mode: Exclude<IntakeCaptureMode, null>) => void;
  onPhotos: () => void;
  onTranslate: () => void;
  children?: ReactNode;
};

export function CaptureToolbar({
  mode,
  photoCount,
  photoLimit,
  translateActive,
  disabled,
  onSelectMode,
  onPhotos,
  onTranslate,
  children,
}: Props) {
  const hasPanelContent = Boolean(children);

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#d5dee2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 shrink">
            <h2 className="text-[18px] font-bold tracking-tight text-[#10233d]">
              {INTAKE_COPY.captureHeading}
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[#6b7280]">
              {INTAKE_COPY.captureHelper}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2 lg:max-w-[min(100%,36rem)] lg:justify-end">
            <ModePill
              selected={mode === 'type'}
              disabled={disabled}
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Type note"
              onClick={() => onSelectMode('type')}
            />
            <ModePill
              selected={mode === 'dictation'}
              disabled={disabled}
              icon={<Mic className="h-3.5 w-3.5" />}
              label="Dictate"
              onClick={() => onSelectMode('dictation')}
            />
            <ModePill
              selected={mode === 'conversation'}
              disabled={disabled}
              icon={<Users className="h-3.5 w-3.5" />}
              label="Natural conversation"
              onClick={() => onSelectMode('conversation')}
            />
            <ModePill
              selected={false}
              disabled={disabled}
              icon={<Camera className="h-3.5 w-3.5" />}
              label="Add photos"
              ariaLabel={`Add photos, ${photoCount} of ${photoLimit}`}
              onClick={onPhotos}
            />
            <ModePill
              selected={translateActive}
              disabled={disabled}
              icon={<Languages className="h-3.5 w-3.5" />}
              label="Translate"
              onClick={onTranslate}
            />
          </div>
        </div>
        {hasPanelContent ? (
          <div className="min-w-0 space-y-3 overflow-hidden">{children}</div>
        ) : null}
      </div>
    </section>
  );
}

function ModePill({
  selected,
  disabled,
  icon,
  label,
  ariaLabel,
  onClick,
}: {
  selected: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      aria-expanded={selected}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-9 max-w-full shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
        selected
          ? 'border-[#7eb8c4] bg-[#e7f4f8] text-[#0f4f63] shadow-[0_0_0_1px_rgba(126,184,196,0.28)]'
          : 'border-[#d5dee2] bg-white text-[#334155] hover:bg-[#f8fafb]',
        disabled && 'opacity-50',
      )}
    >
      <span className={cn('shrink-0', selected ? 'text-[#1d7a8a]' : 'text-[#64748b]')} aria-hidden>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

'use client';

import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, ExternalLink, FileText, Pencil, Shield, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExtractedClinicalItem } from '@safescript/shared';
import { isSafetyItem } from '@safescript/shared';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { INTAKE_COPY, PRIVACY_POLICY_URL } from './intake-copy';

type NoteStatus = 'empty' | 'draft' | 'review_required' | 'approved';

type Props = {
  status: NoteStatus;
  presentingConcern: string;
  items: ExtractedClinicalItem[];
  noteBody: string;
  editing: boolean;
  processing?: boolean;
  hasTemporaryTranscript: boolean;
  privacyOpen: boolean;
  onEdit: () => void;
  onChangeNote: (value: string) => void;
  onOpenTranscript: () => void;
  onOpenPrivacy: () => void;
  onPrivacyOpenChange: (open: boolean) => void;
  onFocusNote?: () => void;
  onBlurNote?: () => void;
};

export function ConsultationNoteCard({
  status,
  presentingConcern,
  items,
  noteBody,
  editing,
  processing,
  hasTemporaryTranscript,
  privacyOpen,
  onEdit,
  onChangeNote,
  onOpenTranscript,
  onOpenPrivacy,
  onPrivacyOpenChange,
  onFocusNote,
  onBlurNote,
}: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const chipItems = items.filter(
    (item) =>
      item.category === 'allergy' ||
      item.category === 'medication' ||
      item.category === 'medical_condition' ||
      item.category === 'lab' ||
      item.category === 'vital' ||
      item.category === 'pregnancy_lactation',
  );
  const proseItems = items.filter((item) => !chipItems.includes(item));
  const hasStructured = Boolean(presentingConcern || items.length);
  const showStructured = hasStructured && !editing;

  return (
    <section className="overflow-hidden rounded-[14px] border border-[#d5dee2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="px-4 py-4 sm:px-5 sm:py-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[22px] font-bold tracking-tight text-[#10233d]">
                {INTAKE_COPY.noteTitle}
              </h2>
              {status === 'review_required' || status === 'draft' ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fff6e8] px-2 py-0.5 text-[12px] font-semibold text-[#c2410c]">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {INTAKE_COPY.reviewRequired}
                </span>
              ) : null}
              {status === 'approved' ? (
                <span className="inline-flex items-center rounded-full border border-[#b7e0db] bg-[#eef8f6] px-2.5 py-0.5 text-[12px] font-semibold text-[#0f6f6b]">
                  Approved
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">{INTAKE_COPY.noteSupport}</p>
          </div>

          <div
            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
            aria-label="Consultation note actions"
          >
            {hasTemporaryTranscript ? (
              <NoteHeaderButton
                onClick={onOpenTranscript}
                icon={<FileText className="h-3.5 w-3.5" />}
              >
                Full transcript
              </NoteHeaderButton>
            ) : null}
            <Popover
              open={privacyOpen}
              onOpenChange={(open) => {
                if (open) onOpenPrivacy();
                else onPrivacyOpenChange(false);
              }}
            >
              <PopoverTrigger asChild>
                <NoteHeaderButton icon={<Shield className="h-3.5 w-3.5" />}>Privacy</NoteHeaderButton>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="w-[min(100vw-2rem,320px)] rounded-xl border-[#d5e2e6] p-4 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] font-semibold text-[#111827]">{INTAKE_COPY.privacyTitle}</p>
                  <PopoverClose className="rounded-sm p-0.5 text-[#6b7280] opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Close</span>
                  </PopoverClose>
                </div>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#4b5563]">
                  {INTAKE_COPY.privacyBullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <a
                  href={PRIVACY_POLICY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[#1d6b9a] hover:underline"
                >
                  Learn more
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </PopoverContent>
            </Popover>
            <NoteHeaderButton onClick={onEdit} icon={<Pencil className="h-3.5 w-3.5" />} active={editing}>
              Edit note
            </NoteHeaderButton>
          </div>
        </div>

        <div className="consultation-note-content mt-4 min-w-0">
            {processing ? (
              <div className="space-y-3" role="status">
                <p className="text-sm text-[#4b5563]">
                  {noteBody
                    ? 'Organizing clinically relevant information…'
                    : 'Generating the consultation note…'}
                </p>
                {showStructured ? (
                  <div className="space-y-4 opacity-80">
                    {presentingConcern ? (
                      <div>
                        <h3 className="text-[15px] font-semibold text-[#10233d]">
                          {INTAKE_COPY.presentingSection}
                        </h3>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-[#1f2937]">
                          {presentingConcern}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : noteBody ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#1f2937]">
                    {noteBody}
                  </p>
                ) : null}
              </div>
            ) : showStructured ? (
              <div className="space-y-4">
                {presentingConcern ? (
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#10233d]">
                      {INTAKE_COPY.presentingSection}
                    </h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#1f2937]">
                      {presentingConcern}
                    </p>
                  </div>
                ) : null}
                {(chipItems.length > 0 || proseItems.length > 0) && (
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#10233d]">
                      {INTAKE_COPY.relevantSection}
                    </h3>
                    {chipItems.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {chipItems.map((item) => (
                          <span
                            key={item.id}
                            className={cn(
                              'inline-flex items-center rounded-full border px-2.5 py-1 text-[13px] font-medium',
                              isSafetyItem(item)
                                ? 'border-[#f5c2c2] bg-[#fdecec] text-[#c24141]'
                                : 'border-[#d5dee2] bg-[#f4f7f8] text-[#334155]',
                            )}
                          >
                            {isSafetyItem(item) ? (
                              <AlertTriangle className="mr-1.5 h-3 w-3" aria-hidden />
                            ) : null}
                            {item.text}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {proseItems.length > 0 ? (
                      <div className="mt-3 space-y-1 text-[15px] leading-relaxed text-[#1f2937]">
                        {proseItems.map((item) => (
                          <p key={item.id}>{item.text}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <textarea
                ref={noteRef}
                value={noteBody}
                onChange={(e) => onChangeNote(e.target.value)}
                onFocus={onFocusNote}
                onBlur={onBlurNote}
                onClick={() => noteRef.current?.focus()}
                placeholder={INTAKE_COPY.notePlaceholder}
                rows={7}
                disabled={processing}
                spellCheck
                className={cn(
                  'box-border min-h-[168px] w-full resize-y rounded-[10px] border border-[#c5d1d5] bg-white',
                  'px-4 py-3.5 text-[15px] leading-relaxed text-[#1f2937] shadow-none',
                  'placeholder:text-[#9ca3af]',
                  'outline-none focus-visible:border-[#0F766E] focus-visible:ring-[3px] focus-visible:ring-[rgba(15,118,110,0.12)]',
                  'disabled:cursor-not-allowed disabled:bg-[#f8fafb]',
                )}
                aria-label="Consultation note"
              />
            )}
        </div>
      </div>
    </section>
  );
}

const NoteHeaderButton = forwardRef<
  HTMLButtonElement,
  {
    children: string;
    icon: ReactNode;
    active?: boolean;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function NoteHeaderButton(
  { children, icon, active, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/25',
        active
          ? 'border-[#7eb8c4] bg-[#eef7f8] text-[#0f5f6b]'
          : 'border-[#d5dee2] bg-white text-[#334155] hover:bg-[#f8fafb]',
        className,
      )}
      {...props}
    >
      <span className="shrink-0 text-[#64748b]" aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  );
});

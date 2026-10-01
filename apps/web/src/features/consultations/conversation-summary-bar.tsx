'use client';
import type { Consultation } from './types';

interface Props {
  consultation: Consultation;
}

export function ConversationSummaryBar({ consultation }: Props) {
  const text = consultation.transcript?.trim() || consultation.chiefComplaint?.trim();
  if (!text) return null;

  return (
    <div className="shrink-0 border-b border-border/50 bg-muted/20">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <div className="pb-2.5 pt-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Conversation summary
          </p>
          <p className="line-clamp-4 text-xs leading-relaxed text-foreground/75">{text}</p>
        </div>
      </div>
    </div>
  );
}

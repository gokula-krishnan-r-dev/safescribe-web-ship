'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ASSESSMENT_COPY } from './assessment-copy';

export function ConsultationNoteSnapshot({
  summary,
  onView,
}: {
  summary: string;
  onView: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[12px] border border-[#e6eef1] bg-[#f7fafb] px-3.5 py-3">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#7b8c98]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7b8c98]">
          {ASSESSMENT_COPY.noteTitle}
        </p>
        <p className="mt-0.5 truncate text-[13px] leading-snug text-[#8a97a3]">
          {summary || 'Reviewed consultation note'}
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="shrink-0 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
      >
        {ASSESSMENT_COPY.viewNote}
      </button>
    </div>
  );
}

export function ConsultationNoteDialog({
  open,
  onOpenChange,
  presentingConcern,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentingConcern: string;
  items: string[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] gap-5 rounded-2xl p-6">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-[20px] font-bold text-[#10233d]">
            {ASSESSMENT_COPY.noteTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Approved consultation note from intake
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-[14px] leading-relaxed text-[#1f3347]">
          <div>
            <p className="font-semibold text-[#10233d]">{ASSESSMENT_COPY.presentingConcern}</p>
            <p className="mt-1 text-[#334155]">{presentingConcern || '—'}</p>
          </div>
          {items.length ? (
            <div>
              <p className="font-semibold text-[#10233d]">{ASSESSMENT_COPY.relevantClinical}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[#334155]">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter className="flex-row items-center justify-between gap-3 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {ASSESSMENT_COPY.close}
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-10 items-center rounded-[10px] bg-[#0f6f6b] px-4 text-sm font-semibold text-white hover:bg-[#0c5e5b]"
          >
            {ASSESSMENT_COPY.backToAssessment}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssessmentHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{ASSESSMENT_COPY.helpTitle}</DialogTitle>
          <DialogDescription>{ASSESSMENT_COPY.helpIntro}</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-[#4b5563]">
          {ASSESSMENT_COPY.helpBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

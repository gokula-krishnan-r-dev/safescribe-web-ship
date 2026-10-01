'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function MonitoringReferencePopover({
  title,
  appliesBecause,
  configuredValue,
  usedFor,
  currentValue,
  sourceName,
  sourceCitation,
  sourceUrl,
  medicationRules,
  children,
}: {
  title: string;
  appliesBecause: string[];
  configuredValue: string | null;
  usedFor: string;
  currentValue: string | null;
  sourceName: string;
  sourceCitation: string | null;
  sourceUrl?: string | null;
  medicationRules: Array<{ medicationDisplay: string; interpretation: string }>;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] rounded-xl border-[#d7e2e6] p-0 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#edf1f3] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#163447]">{title}</p>
        </div>
        <div className="space-y-3 px-4 py-3 text-[13px] leading-5">
          {configuredValue ? <PopoverField label="Displayed reference" value={configuredValue} /> : null}
          {appliesBecause.length ? (
            <PopoverField label="Clinical context" value={appliesBecause.join(' + ')} />
          ) : null}
          {currentValue ? <PopoverField label="Current result" value={currentValue} /> : null}
          <PopoverField label="Used for" value={usedFor} />
          {medicationRules.map((rule) => (
            <div key={rule.medicationDisplay}>
              <p className="font-semibold text-[#163447]">{rule.medicationDisplay}</p>
              <p className="mt-0.5 text-[#5b6b75]">• {rule.interpretation}</p>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">Source</p>
            <p className="mt-0.5 font-medium text-[#163447]">{sourceName}</p>
            {sourceCitation ? <p className="text-[#5b6b75]">{sourceCitation}</p> : null}
          </div>
        </div>
        {sourceUrl ? (
          <div className="border-t border-[#edf1f3] px-4 py-2.5">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0F6F6B] hover:underline"
            >
              View source
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PopoverField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">{label}</p>
      <p className="mt-0.5 font-medium text-[#163447]">{value}</p>
    </div>
  );
}

export function MonitoringReferenceDetailsDialog({
  open,
  itemLabel,
  popover,
  onClose,
}: {
  open: boolean;
  itemLabel: string;
  popover: {
    title: string;
    appliesBecause: string[];
    configuredValue: string | null;
    usedFor: string;
    currentValue: string | null;
    sourceName: string;
    sourceCitation: string | null;
    sourceUrl?: string | null;
    medicationRules: Array<{ medicationDisplay: string; interpretation: string }>;
  };
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="space-y-1 border-b border-[#edf1f3] px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-[17px] font-semibold text-[#163447]">
            Reference details — {itemLabel}
          </DialogTitle>
          <DialogDescription className="sr-only">Governed target or reference for this monitoring item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 py-4 text-[13px] leading-5">
          {popover.configuredValue ? <PopoverField label="Displayed reference" value={popover.configuredValue} /> : null}
          {popover.appliesBecause.length ? (
            <PopoverField label="Clinical context" value={popover.appliesBecause.join(' + ')} />
          ) : null}
          {popover.currentValue ? <PopoverField label="Current result" value={popover.currentValue} /> : null}
          <PopoverField label="Used for" value={popover.usedFor} />
          {popover.medicationRules.map((rule) => (
            <div key={rule.medicationDisplay}>
              <p className="font-semibold text-[#163447]">{rule.medicationDisplay}</p>
              <p className="mt-0.5 text-[#5b6b75]">• {rule.interpretation}</p>
            </div>
          ))}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a8b94]">Source</p>
            <p className="mt-0.5 font-medium text-[#163447]">{popover.sourceName}</p>
            {popover.sourceCitation ? <p className="text-[#5b6b75]">{popover.sourceCitation}</p> : null}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-[#edf1f3] px-6 py-3">
          {popover.sourceUrl ? (
            <a
              href={popover.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0F6F6B] hover:underline"
            >
              View source
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <span />
          )}
          <button type="button" className="text-sm font-medium text-[#5b6b75] hover:text-[#163447]" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

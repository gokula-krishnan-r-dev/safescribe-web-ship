'use client';

import { ArrowRight, FileText, MessageSquare } from 'lucide-react';

export function Step3BComparisonCards({
  origMedName,
  origSig,
  origQty,
  propMedName,
  propSig,
  propQty,
  reasonLabel,
  reasonDetails,
  onEditProposed,
}: {
  origMedName: string;
  origSig: string;
  origQty: string;
  /** @deprecated Refills removed from Adapt proposed Rx UI */
  origRefills?: string;
  propMedName: string;
  propSig: string;
  propQty: string;
  /** @deprecated Refills removed from Adapt proposed Rx UI */
  propRefills?: string;
  reasonLabel: string;
  reasonDetails: string;
  onEditProposed: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr_1fr] md:items-stretch">
      <SummaryCard
        eyebrow="Original prescription"
        icon={<FileText className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />}
        title={origMedName}
        subtitle={origSig}
        meta={`Qty: ${origQty}`}
      />

      <div className="hidden items-center justify-center text-[#b0c4cb] md:flex" aria-hidden>
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e2eaed] bg-white shadow-sm">
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <SummaryCard
        eyebrow="Proposed adaptation"
        icon={<FileText className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />}
        title={propMedName}
        subtitle={propSig}
        meta={`Qty: ${propQty}`}
        action={
          <button
            type="button"
            onClick={onEditProposed}
            className="text-[12px] font-semibold text-[#0F6F6B] hover:underline"
          >
            Edit
          </button>
        }
      />

      <SummaryCard
        eyebrow="Reason for adaptation"
        icon={<MessageSquare className="h-3.5 w-3.5 text-[#0F6F6B]" aria-hidden />}
        title={reasonLabel}
        subtitle={reasonDetails}
      />
    </div>
  );
}

function SummaryCard({
  eyebrow,
  icon,
  title,
  subtitle,
  meta,
  action,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#e2eaed] bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#829ab1]">
          {icon}
          {eyebrow}
        </div>
        {action}
      </div>
      <p className="mt-1.5 truncate text-[14px] font-semibold leading-snug text-[#102a43]" title={title}>
        {title}
      </p>
      {subtitle ? (
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-[#52677a]" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
      {meta ? <p className="mt-1.5 text-[12px] font-medium text-[#829ab1]">{meta}</p> : null}
    </div>
  );
}

'use client';

import { ArrowRight, Loader2, Sparkles, BadgeCheck, Upload, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClinicalPathway } from './types';
import { getPipelineNextAction } from './pathway-utils';
import { cn } from '@/lib/utils';

type Props = {
  pathway: ClinicalPathway;
  isPending?: boolean;
  onUpload?: () => void;
  onConfirmDocs?: () => void;
  onGenerate?: () => void;
  onClinicalApprove?: () => void;
  onPublish?: () => void;
};

export function PathwayNextActionBar({
  pathway,
  isPending,
  onUpload,
  onConfirmDocs,
  onGenerate,
  onClinicalApprove,
  onPublish,
}: Props) {
  const next = getPipelineNextAction(pathway);
  if (!next) return null;

  if (next.action === 'DONE') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-900">{next.title}</p>
        <p className="text-xs text-emerald-800">{next.description}</p>
      </div>
    );
  }

  if (next.action === 'WAIT') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-blue-900">{next.title}</p>
          <p className="text-xs text-blue-700">{next.description}</p>
        </div>
      </div>
    );
  }

  const icon =
    next.action === 'UPLOAD' ? (
      <Upload className="h-5 w-5" />
    ) : next.action === 'CONFIRM_DOCS' ? (
      <FileCheck2 className="h-5 w-5" />
    ) : next.action === 'GENERATE_PATHWAY' ? (
      <Sparkles className="h-5 w-5" />
    ) : next.action === 'CLINICAL_APPROVE' ? (
      <BadgeCheck className="h-5 w-5" />
    ) : (
      <ArrowRight className="h-5 w-5" />
    );

  const onClick = () => {
    if (next.action === 'UPLOAD') onUpload?.();
    if (next.action === 'CONFIRM_DOCS') onConfirmDocs?.();
    if (next.action === 'GENERATE_PATHWAY') onGenerate?.();
    if (next.action === 'CLINICAL_APPROVE') onClinicalApprove?.();
    if (next.action === 'PUBLISH') onPublish?.();
  };

  const emphasize = next.action === 'GENERATE_PATHWAY' || next.action === 'PUBLISH';

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        emphasize
          ? 'border-primary/30 bg-primary/5'
          : 'border-amber-200/80 bg-amber-50/50',
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold tracking-tight">{next.title}</p>
        <p className="text-xs text-muted-foreground max-w-2xl">{next.description}</p>
      </div>
      {next.buttonLabel && (
        <Button
          size="default"
          className="gap-2 shrink-0 shadow-sm"
          onClick={onClick}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
          {next.buttonLabel}
          {!isPending && <ArrowRight className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
}

'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClinicalPathway } from './types';
import {
  PIPELINE_STEPS,
  getPipelineStepIndex,
  isPipelineProcessing,
  getPipelineNextAction,
} from './pathway-utils';

export function PathwayPipelineStepper({ pathway }: { pathway: ClinicalPathway }) {
  const stage = pathway.pipelineStage ?? 'IDLE';
  const activeIndex = getPipelineStepIndex(stage, (pathway.documents?.length ?? 0) > 0);
  const processing = isPipelineProcessing(stage, pathway.status);
  const next = getPipelineNextAction(pathway);

  return (
    <div className="rounded-xl border bg-card px-4 py-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-tight">Pathway generation pipeline</p>
          <p className="text-xs text-muted-foreground">
            Upload → Classify → Doc review → Concepts → Generate → Clinical review → Publish
          </p>
        </div>
        {processing ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Working…
          </span>
        ) : next && next.action !== 'DONE' && next.action !== 'WAIT' ? (
          <span className="inline-flex max-w-xs items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Next: {next.buttonLabel || next.title}
          </span>
        ) : null}
      </div>

      <ol className="grid gap-2 sm:grid-cols-7">
        {PIPELINE_STEPS.map((step, index) => {
          const done = index < activeIndex || (pathway.status === 'PUBLISHED' && index <= 6);
          const current = index === activeIndex && pathway.status !== 'PUBLISHED';
          // CONCEPTS_READY highlights Generate as current; Concepts (index 3) is done
          const conceptsReadyHighlight =
            stage === 'CONCEPTS_READY' && index === 4 && current;

          return (
            <li
              key={step.id}
              className={cn(
                'relative rounded-lg border px-2.5 py-2 transition-colors',
                done && 'border-emerald-200 bg-emerald-50/60',
                current && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
                !done && !current && 'border-transparent bg-muted/40',
                conceptsReadyHighlight && 'ring-2 ring-primary/30',
              )}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                    done && 'bg-emerald-600 text-white',
                    current && 'bg-primary text-primary-foreground',
                    !done && !current && 'bg-muted-foreground/20 text-muted-foreground',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className="text-[11px] font-semibold leading-tight">{step.label}</span>
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">{step.description}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

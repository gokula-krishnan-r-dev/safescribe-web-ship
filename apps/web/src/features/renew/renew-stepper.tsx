'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RENEW_UI_STEPS, type RenewUIStepId } from '@safescript/shared';

interface Props {
  currentUIStep: RenewUIStepId;
  completedUISteps: Set<number>;
  maxClickableIndex?: number;
  onStepClick?: (stepId: RenewUIStepId, index: number) => void;
  className?: string;
}

type StepStatus = 'completed' | 'active' | 'visited' | 'pending';

function getStatus(
  idx: number,
  currentIndex: number,
  completedUISteps: Set<number>,
  maxClickableIndex: number,
): StepStatus {
  if (idx === currentIndex) return 'active';
  if (completedUISteps.has(idx) || idx < currentIndex) return 'completed';
  if (idx <= maxClickableIndex) return 'visited';
  return 'pending';
}

/** Horizontal renewal progress stepper. */
function RenewStepperImpl({
  currentUIStep,
  completedUISteps,
  maxClickableIndex,
  onStepClick,
  className,
}: Props) {
  const steps = RENEW_UI_STEPS;
  const currentIndex = steps.findIndex((s) => s.id === currentUIStep);
  const reachable = Math.max(maxClickableIndex ?? currentIndex, currentIndex);

  return (
    <div className={cn('w-full', className)}>
      <nav aria-label="Renewal progress" className="w-full">
        <ol className="flex w-full items-center">
          {steps.map((step, idx) => {
            const status = getStatus(idx, currentIndex, completedUISteps, reachable);
            const isClickable =
              Boolean(onStepClick) &&
              (status === 'completed' || status === 'active' || status === 'visited');
            const isLast = idx === steps.length - 1;
            const lineComplete =
              status === 'completed' || status === 'visited' || (status === 'active' && idx > 0);

            return (
              <li
                key={step.id}
                className={cn('relative flex min-w-0 flex-1 flex-col items-center', !isLast && 'pr-0.5')}
              >
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute left-[calc(50%+14px)] right-[calc(-50%+14px)] top-[11px] h-px',
                      lineComplete ? 'bg-primary/35' : 'bg-border/70',
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isClickable) onStepClick?.(step.id, idx);
                  }}
                  disabled={!isClickable}
                  aria-current={status === 'active' ? 'step' : undefined}
                  aria-label={
                    status === 'active' ? `${step.label} (current)` : `Go to ${step.label}`
                  }
                  title={isClickable ? `Go to ${step.label}` : step.label}
                  className={cn(
                    'relative z-[1] flex flex-col items-center gap-1 rounded-md px-0.5 py-0.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                    isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                      status === 'completed' && 'bg-primary text-primary-foreground',
                      status === 'active' &&
                        'bg-primary text-primary-foreground ring-2 ring-primary/20 ring-offset-1',
                      status === 'visited' && 'border border-primary/45 bg-primary/10 text-primary',
                      status === 'pending' && 'border border-border bg-background text-muted-foreground',
                    )}
                  >
                    {status === 'completed' ? (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-center text-[10px] font-medium leading-tight tracking-wide',
                      status === 'active' && 'text-foreground',
                      status === 'completed' && 'text-muted-foreground',
                      status === 'visited' && 'text-foreground/80',
                      status === 'pending' && 'text-muted-foreground/70',
                    )}
                  >
                    {step.shortLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}

export const RenewStepper = memo(RenewStepperImpl);

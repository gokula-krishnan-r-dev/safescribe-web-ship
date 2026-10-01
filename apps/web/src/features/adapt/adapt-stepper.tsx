'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADAPT_UI_STEPS, type AdaptUIStepId } from '@safescript/shared';

interface Props {
  currentUIStep: AdaptUIStepId;
  completedUISteps: Set<number>;
  maxClickableIndex?: number;
  onStepClick?: (stepId: AdaptUIStepId, index: number) => void;
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

/**
 * Compact Adapt progress stepper — matches Renew / Prescribe styling.
 * Intended to sit in document flow (not sticky) so it scrolls with step content.
 */
function AdaptStepperImpl({
  currentUIStep,
  completedUISteps,
  maxClickableIndex,
  onStepClick,
  className,
}: Props) {
  const steps = ADAPT_UI_STEPS;
  const currentIndex = steps.findIndex((s) => s.id === currentUIStep);
  const reachable = Math.max(maxClickableIndex ?? currentIndex, currentIndex);

  return (
    <div className={cn('w-full', className)}>
      <nav aria-label="Adapt prescription progress" className="w-full">
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
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute left-[calc(50%+20px)] right-[calc(-50%+20px)] top-[19px] h-px',
                      lineComplete ? 'bg-[#0f6f73]/30' : 'bg-[#d7e1e5]',
                    )}
                  />
                ) : null}

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
                    'relative z-[1] flex flex-col items-center gap-2 rounded-md px-0.5 py-0.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                    isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-[38px] items-center justify-center rounded-full text-[14px] font-semibold transition-colors',
                      status === 'completed' && 'bg-[#0f6f73] text-white',
                      status === 'active' && 'bg-[#0f6f73] text-white',
                      status === 'visited' && 'border-[1.5px] border-[#0f6f73]/45 bg-[#e7f5f4] text-[#0f6f73]',
                      status === 'pending' && 'border-[1.5px] border-[#d7e0e5] bg-white text-[#607285]',
                    )}
                  >
                    {status === 'completed' ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-center text-[14px] font-medium leading-tight',
                      status === 'active' && 'font-semibold text-[#172337]',
                      status === 'completed' && 'text-[#617184]',
                      status === 'visited' && 'text-[#27405c]',
                      status === 'pending' && 'text-[#617184]',
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

export const AdaptStepper = memo(AdaptStepperImpl);

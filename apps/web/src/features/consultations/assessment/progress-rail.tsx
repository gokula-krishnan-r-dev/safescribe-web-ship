import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ASSESSMENT_COPY, ASSESSMENT_RAIL } from './assessment-copy';

export function AssessmentProgressRail() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ol className="flex min-w-0 flex-1 items-start justify-between gap-1">
        {ASSESSMENT_RAIL.map((step, index) => {
          const complete = index === 0;
          const current = index === 1;
          return (
            <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              {index < ASSESSMENT_RAIL.length - 1 ? (
                <span
                  className={cn(
                    'absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[15px] h-[2px]',
                    index === 0 ? 'bg-[#9ed4cf]' : 'bg-[#e6eef1]',
                  )}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  'relative z-[1] flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold',
                  complete && 'bg-[#0f6f6b] text-white',
                  current && 'bg-[#0f6f6b] text-white ring-[5px] ring-[#0f6f6b]/15',
                  !complete && !current && 'bg-[#eef3f5] text-[#8a97a3]',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {complete ? <Check className="h-4 w-4 stroke-[2.5]" aria-hidden /> : index + 1}
              </span>
              <span className="mt-2 text-center text-[12px] font-semibold leading-tight text-[#1b3a4a]">
                {step.label}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-center text-[11px] leading-tight',
                  current ? 'font-medium text-[#0f6f6b]' : 'text-[#8a97a3]',
                )}
              >
                {step.status}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="shrink-0 text-[12px] font-medium text-[#8a97a3]">{ASSESSMENT_COPY.stepOf}</p>
    </div>
  );
}

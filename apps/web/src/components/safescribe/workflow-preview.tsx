import { Check, ChevronRight } from 'lucide-react';

export const LANDING_WORKFLOW_STEPS = [
  { title: 'Consultation captured', detail: 'Transcription complete', done: true },
  { title: 'Pathway confirmed', detail: 'Cold sore', done: false },
  { title: 'Treatment selected', detail: 'Valacyclovir 2 g', done: true },
  { title: 'Documentation', detail: 'DAP note generated', done: false },
] as const;

export function WorkflowPreview() {
  return (
    <ol className="ss-workflow-cards" aria-label="Clinical workflow preview">
      {LANDING_WORKFLOW_STEPS.map((step, index) => (
        <li key={step.title} className="ss-workflow-card">
          <div className="min-w-0">
            <p className="ss-workflow-card-title">{step.title}</p>
            <p className="ss-workflow-card-detail">{step.detail}</p>
          </div>
          <span className="ss-workflow-status" aria-hidden>
            {step.done ? (
              <Check className="h-4 w-4 text-[#008D84]" strokeWidth={2.75} />
            ) : (
              <ChevronRight className="h-4 w-4 text-[#087DB5]" strokeWidth={2.5} />
            )}
          </span>
          {index < LANDING_WORKFLOW_STEPS.length - 1 ? (
            <span className="ss-workflow-connector" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

import Link from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardList, FileText, MessageCircle, Trash2 } from 'lucide-react';
import { consultationLifecycle, endOfDayFallback } from '@/content/legal/privacy-policy';

const icons = [MessageCircle, ClipboardList, FileText, CheckCircle2, Trash2] as const;

export function ConsultationLifecycle() {
  return (
    <section className="ss-privacy-life-wrap" aria-labelledby="consultation-lifecycle-heading">
      <div className="ss-privacy-life-intro">
        <p className="ss-about-eyebrow">Consultation lifecycle</p>
        <h2 id="consultation-lifecycle-heading">How consultation information is handled</h2>
        <p>
          SafeScribe keeps consultation information only while it is needed for the active workflow.
          The healthcare professional completes the consultation after saving required documentation.
          End-of-day deletion is the non-optional privacy safety net.
        </p>
      </div>

      <ol className="ss-privacy-life">
        {consultationLifecycle.map((step, index) => {
          const Icon = icons[index];
          return (
            <li key={step.title} className="ss-privacy-life-step">
              {index > 0 ? (
                <span className="ss-privacy-life-arrow" aria-hidden>
                  <ArrowRight className="h-4 w-4" />
                </span>
              ) : null}
              <span className="ss-privacy-life-icon" aria-hidden>
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="ss-privacy-life-n">
                {index + 1}. {step.title}
              </p>
              <p>{step.body}</p>
            </li>
          );
        })}
      </ol>

      <p className="ss-privacy-life-note">{endOfDayFallback}</p>
      <Link href="#temporary" className="ss-privacy-inline-link">
        See full details of what information we process
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}

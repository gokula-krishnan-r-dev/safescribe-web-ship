import { Brain, Shield, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const nodes = [
  {
    title: 'Rules',
    body: 'Safety checks, eligibility criteria, referral logic, and clinical guardrails.',
    icon: Shield,
    featured: false,
  },
  {
    title: 'Clinical intelligence',
    body: 'Transcription, structuring, suggestions, and documentation support.',
    icon: Brain,
    featured: true,
  },
  {
    title: 'Pharmacist',
    body: 'Reviews, decides, confirms, and remains in control.',
    icon: User,
    featured: false,
  },
] as const;

export function ApproachSection() {
  return (
    <section className="ss-about-section ss-about-section-muted">
      <div className="ss-about-section-intro">
        <p className="ss-about-eyebrow">Our approach</p>
        <h2>Rules for safety. Automation for efficiency. Pharmacist for judgment.</h2>
      </div>
      <ol className="ss-about-approach">
        {nodes.map((node, index) => (
          <li key={node.title} className={cn('ss-about-node', node.featured && 'ss-about-node-featured')}>
            {index > 0 ? <span className="ss-about-node-line" aria-hidden /> : null}
            <span className="ss-about-icon-wrap" aria-hidden>
              <node.icon className="h-6 w-6" strokeWidth={1.7} />
            </span>
            <h3>{node.title}</h3>
            <p>{node.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

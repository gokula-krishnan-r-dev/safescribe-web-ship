import { FileText, ShieldCheck, Workflow } from 'lucide-react';

const pillars = [
  {
    n: '01',
    icon: FileText,
    title: 'Less administrative burden',
    body: 'Spend less time documenting and more time with patients.',
  },
  {
    n: '02',
    icon: ShieldCheck,
    title: 'More confident decisions',
    body: 'Structured pathways and safety checks support every step.',
  },
  {
    n: '03',
    icon: Workflow,
    title: 'Better clinical workflow',
    body: 'Move from consultation to documentation in one place.',
  },
] as const;

export function WhySafeScribe() {
  return (
    <section className="ss-about-section">
      <div className="ss-about-section-intro">
        <p className="ss-about-eyebrow">Why SafeScribe exists</p>
        <h2>
          Pharmacists have more clinical responsibility than ever — but the tools supporting them
          haven’t kept pace.
        </h2>
      </div>
      <ul className="ss-about-pillars">
        {pillars.map((item) => (
          <li key={item.title} className="ss-about-pillar">
            <span className="ss-about-icon-wrap" aria-hidden>
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p className="ss-about-pillar-n">{item.n}</p>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

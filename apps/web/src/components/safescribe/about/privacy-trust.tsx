import { HeartPulse, Lock, Shield, UserRound } from 'lucide-react';

const items = [
  { icon: Lock, label: 'Encrypted in transit and at rest' },
  { icon: Shield, label: 'Canadian privacy standards' },
  { icon: UserRound, label: 'You own your data' },
  { icon: HeartPulse, label: 'Transparent, secure, and built for healthcare' },
] as const;

export function PrivacyTrust() {
  return (
    <section className="ss-about-section ss-about-section-muted">
      <div className="ss-about-section-intro">
        <h2 className="ss-about-eyebrow">Privacy-first. Always.</h2>
      </div>
      <ul className="ss-about-trust">
        {items.map((item) => (
          <li key={item.label}>
            <span className="ss-about-icon-wrap" aria-hidden>
              <item.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p>{item.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { Ban, Lock, Shield, UserRound } from 'lucide-react';
import { termsKeyThings } from '@/content/legal/terms-of-service';
import { termsSummaryDisclaimer } from '@/content/legal/terms-metadata';

const icons = {
  responsibly: Shield,
  content: Lock,
  duty: UserRound,
  termination: Ban,
} as const;

export function KeyThingsToKnow() {
  return (
    <section className="ss-terms-keys-wrap" aria-labelledby="key-things-heading">
      <div className="ss-terms-keys">
        <p className="ss-terms-disclaimer">{termsSummaryDisclaimer}</p>
        <h2 id="key-things-heading">Key things to know</h2>
        <ul className="ss-terms-keys-grid">
          {termsKeyThings.map((card) => {
            const Icon = icons[card.id];
            return (
              <li key={card.id}>
                <span className="ss-privacy-chip-icon" aria-hidden>
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="ss-privacy-chip-title">{card.title}</p>
                <p>{card.body}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

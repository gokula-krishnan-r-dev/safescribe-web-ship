import { MapPin, Users } from 'lucide-react';
import { MapleLeafIcon } from '@/components/safescribe/maple-leaf-icon';

function CanadaOutline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M4.5 14.2c-.8-1.2-.6-2.8.4-3.8 1.4-1.4 3.4-1.6 5.1-.8 1.2.6 2 .4 2.8-.4.7-.8 1.8-1 2.8-.5 1.2.6 1.8 1.8 1.6 3-.2 1.2-1.2 2-2.2 2.4-.8.3-1.4 1-1.6 1.8-.3 1.2-1.2 2.2-2.4 2.5-1.4.4-2.8-.2-3.6-1.4-.5-.8-1.3-1.1-2.2-.8-.8.3-1.6.2-2.1-.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const items = [
  { icon: MapPin, label: 'Based in Edmonton, Alberta' },
  { icon: Users, label: 'Designed around Canadian pharmacist workflows' },
  { icon: MapleLeafIcon, label: 'Built to support province-specific clinical practice' },
  { icon: CanadaOutline, label: 'Supporting pharmacy teams across Canada' },
] as const;

export function CanadianRoots() {
  return (
    <section className="ss-about-section">
      <div className="ss-about-section-intro">
        <p className="ss-about-eyebrow">Canadian roots</p>
        <h2>Built from pharmacy practice. Built in Canada.</h2>
      </div>
      <ul className="ss-about-roots">
        {items.map((item) => (
          <li key={item.label}>
            <span className="ss-about-icon-wrap" aria-hidden>
              <item.icon className="h-5 w-5" />
            </span>
            <p>{item.label}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

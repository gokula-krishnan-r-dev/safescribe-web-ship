import { EyeOff, Lock, Trash2, UserCog } from 'lucide-react';
import { MapleLeafIcon } from '@/components/safescribe/maple-leaf-icon';
import { privacyTrustChips } from '@/content/legal/privacy-policy';

function ChipIcon({ id }: { id: (typeof privacyTrustChips)[number]['id'] }) {
  const className = 'h-5 w-5';
  switch (id) {
    case 'temporary':
      return <Trash2 className={className} strokeWidth={1.75} />;
    case 'canada':
      return <MapleLeafIcon className={className} />;
    case 'encrypted':
      return <Lock className={className} strokeWidth={1.75} />;
    case 'no-training':
      return <EyeOff className={className} strokeWidth={1.75} />;
    case 'control':
      return <UserCog className={className} strokeWidth={1.75} />;
  }
}

export function PrivacyTrustChips() {
  return (
    <section className="ss-privacy-chips-wrap" aria-label="Privacy highlights">
      <ul className="ss-privacy-chips">
        {privacyTrustChips.map((chip) => (
          <li key={chip.id}>
            <span className="ss-privacy-chip-icon" aria-hidden>
              <ChipIcon id={chip.id} />
            </span>
            <p className="ss-privacy-chip-title">{chip.title}</p>
            <p>{chip.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

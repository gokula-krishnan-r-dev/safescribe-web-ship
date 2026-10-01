import Image from 'next/image';
import { MapPin, Shield, User } from 'lucide-react';
import { MapleLeafIcon } from '@/components/safescribe/maple-leaf-icon';

const chips = [
  { icon: User, label: 'Pharmacist-designed' },
  { icon: MapleLeafIcon, label: 'Canadian-built' },
  { icon: Shield, label: 'Privacy by design' },
] as const;

export function AboutHero() {
  return (
    <section className="ss-about-hero">
      <div className="ss-about-hero-copy">
        <p className="ss-about-eyebrow">About SafeScribe</p>
        <h1>Built in Canada for Canadian pharmacy practice</h1>
        <p className="ss-about-hero-body">
          SafeScribe is a clinical intelligence platform for pharmacists, designed to support
          assessment, prescribing, and documentation with greater safety, clarity, and efficiency.
        </p>
        <ul className="ss-about-chips">
          {chips.map((chip) => (
            <li key={chip.label}>
              <chip.icon className="h-3.5 w-3.5 text-[#008CA4]" aria-hidden />
              {chip.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="ss-about-hero-visual">
        <div className="ss-about-map" aria-hidden>
          <Image
            src="/landing/canada-alberta-map.jpg"
            alt=""
            fill
            sizes="(max-width: 767px) 100vw, 52vw"
            priority
            className="object-contain object-center"
          />
        </div>
        <aside className="ss-about-location-card">
          <p>
            <MapPin className="h-4 w-4 text-[#008CA4]" aria-hidden />
            Based in Edmonton, Alberta, Canada
          </p>
          <p>
            <MapleLeafIcon className="h-4 w-4 text-[#008CA4]" />
            Supporting pharmacy teams across Canada
          </p>
        </aside>
      </div>
    </section>
  );
}

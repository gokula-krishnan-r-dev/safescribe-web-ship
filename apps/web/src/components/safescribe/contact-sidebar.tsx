import type { ComponentType } from 'react';
import { CONTACT_SUPPORT_EMAIL } from '@safescript/shared';
import { Calendar, Check, Clock, Mail, MapPin } from 'lucide-react';
import { CanadaMap } from '@/components/safescribe/canada-map';
import { MapleLeafIcon } from '@/components/safescribe/maple-leaf-icon';

interface ContactSidebarProps {
  onBookDemo: () => void;
}

export function ContactSidebar({ onBookDemo }: ContactSidebarProps) {
  return (
    <aside className="ss-contact-sidebar">
      <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#06244A]">
        We&apos;re here for you
      </h2>
      <span className="ss-contact-sidebar-rule" aria-hidden />

      <div className="mt-5 flex items-start gap-3">
        <span className="ss-contact-sidebar-badge">
          <Mail className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#60738E]">Email</p>
          <a
            href={`mailto:${CONTACT_SUPPORT_EMAIL}`}
            className="mt-0.5 block break-all text-[15px] font-semibold text-[#087DB5] hover:text-[#066A9A] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
          >
            {CONTACT_SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      <button type="button" onClick={onBookDemo} className="ss-contact-demo-btn">
        <Calendar className="h-4 w-4" aria-hidden />
        Book a demo
      </button>

      <ul className="mt-6 space-y-3.5">
        <InfoRow icon={Clock} text="Response time: Usually within 1 business day" />
        <InfoRow icon={Clock} text="Support hours: Mon–Fri, 8:00 AM – 6:00 PM MT" />
        <InfoRow icon={MapPin} text="Based in Edmonton, Alberta, Canada" />
        <InfoRow icon={MapleLeafIcon} text="Supporting pharmacy teams across Canada" />
      </ul>

      <CanadaMap className="mt-6 w-full" />

      <div className="ss-contact-trust">
        {['Canadian-built', 'Pharmacist-focused', 'Privacy-conscious'].map((item) => (
          <span key={item} className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-[#008CA4]" strokeWidth={2.6} aria-hidden />
            {item}
          </span>
        ))}
      </div>
    </aside>
  );
}

function InfoRow({
  icon: Icon,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2.5 text-[13.5px] leading-snug text-[#425A78]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#5B8FA3]" aria-hidden />
      <span>{text}</span>
    </li>
  );
}

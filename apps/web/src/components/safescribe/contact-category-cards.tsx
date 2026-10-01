'use client';

import {
  CONTACT_TOPIC_OPTIONS,
  type ContactTopic,
} from '@safescript/shared';
import { CalendarClock, ChevronRight, Headset, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS = {
  product_support: Headset,
  request_demo: CalendarClock,
  partnerships: Users,
} as const;

interface ContactCategoryCardsProps {
  activeTopic: ContactTopic;
  onSelect: (topic: ContactTopic) => void;
}

export function ContactCategoryCards({ activeTopic, onSelect }: ContactCategoryCardsProps) {
  return (
    <div className="ss-contact-cards">
      {CONTACT_TOPIC_OPTIONS.map((item) => {
        const Icon = ICONS[item.value];
        const active = item.value === activeTopic;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            className={cn('ss-contact-card', active && 'ss-contact-card-active')}
          >
            <span className="ss-contact-card-icon" aria-hidden>
              <Icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[15px] font-semibold leading-snug text-[#0B2545]">
                {item.label}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-[#52709A]">
                {item.description}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#8AA0B5]" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

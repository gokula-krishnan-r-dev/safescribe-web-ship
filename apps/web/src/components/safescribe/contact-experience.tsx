'use client';

import { useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CONTACT_TOPICS,
  type ContactTopic,
} from '@safescript/shared';
import { ContactCategoryCards } from '@/components/safescribe/contact-category-cards';
import { ContactForm } from '@/components/safescribe/contact-form';
import { ContactSidebar } from '@/components/safescribe/contact-sidebar';

function parseTopic(value: string | null): ContactTopic {
  if (value === CONTACT_TOPICS.REQUEST_DEMO || value === 'demo') {
    return CONTACT_TOPICS.REQUEST_DEMO;
  }
  if (value === CONTACT_TOPICS.PARTNERSHIPS || value === 'partnerships') {
    return CONTACT_TOPICS.PARTNERSHIPS;
  }
  return CONTACT_TOPICS.PRODUCT_SUPPORT;
}

export function ContactExperience() {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState<ContactTopic>(() => parseTopic(searchParams.get('topic')));

  const selectTopic = useCallback((next: ContactTopic) => {
    setTopic(next);
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('contact-form')?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  return (
    <div className="ss-contact-body">
      <section className="ss-contact-hero">
        <h1>How can we help?</h1>
        <p>
          We&apos;re here to support pharmacists, clinics, and healthcare partners with SafeScribe.
          Reach out and our team will get back to you.
        </p>
      </section>

      <ContactCategoryCards activeTopic={topic} onSelect={selectTopic} />

      <div className="ss-contact-grid">
        <ContactForm topic={topic} onTopicChange={setTopic} />
        <ContactSidebar onBookDemo={() => selectTopic(CONTACT_TOPICS.REQUEST_DEMO)} />
      </div>
    </div>
  );
}

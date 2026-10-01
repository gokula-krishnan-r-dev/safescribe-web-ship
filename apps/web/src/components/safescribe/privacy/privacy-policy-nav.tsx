'use client';

import { useEffect, useState } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import { privacyPolicySections } from '@/content/legal/privacy-policy';
import { PRIVACY_CONTACT_EMAIL } from '@/content/legal/privacy-policy-metadata';
import { cn } from '@/lib/utils';

export function PrivacyPolicyNav() {
  const [activeId, setActiveId] = useState(privacyPolicySections[0]?.id ?? '');

  useEffect(() => {
    const headings = privacyPolicySections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (headings.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const nextId = visible[0]?.target.id;
        if (nextId) setActiveId(nextId);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: [0, 0.2, 0.45, 1] },
    );

    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, []);

  return (
    <aside className="ss-privacy-nav">
      <details className="ss-privacy-toc-mobile">
        <summary>On this page</summary>
        <NavList activeId={activeId} />
      </details>

      <div className="ss-privacy-toc-desktop">
        <p className="ss-privacy-toc-label">On this page</p>
        <NavList activeId={activeId} />
      </div>

      <div className="ss-privacy-nav-support">
        <span className="ss-privacy-chip-icon" aria-hidden>
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <p>Questions about privacy?</p>
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>
          <Mail className="h-3.5 w-3.5" aria-hidden />
          {PRIVACY_CONTACT_EMAIL}
        </a>
      </div>
    </aside>
  );
}

function NavList({ activeId }: { activeId: string }) {
  return (
    <nav aria-label="Privacy policy sections">
      <ol className="ss-privacy-toc">
        {privacyPolicySections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(activeId === section.id && 'is-active')}
              aria-current={activeId === section.id ? 'location' : undefined}
            >
              {index + 1}. {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

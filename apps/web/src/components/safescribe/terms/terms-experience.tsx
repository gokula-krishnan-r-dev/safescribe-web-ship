'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronsDown, ChevronsUp, Mail } from 'lucide-react';
import { TermsLegalText } from '@/components/safescribe/terms/terms-legal-text';
import {
  termsDesktopDefaultOpen,
  termsMobileDefaultOpen,
  termsOfServiceSections,
  termsSectionIds,
} from '@/content/legal/terms-of-service';
import { termsMeta } from '@/content/legal/terms-metadata';
import { PRIVACY_CONTACT_EMAIL } from '@/content/legal/privacy-policy-metadata';
import { cn } from '@/lib/utils';

export function TermsExperience() {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(termsDesktopDefaultOpen));
  const [activeId, setActiveId] = useState(termsSectionIds[0] ?? '');

  const allOpen = openIds.size === termsSectionIds.length;

  const openSection = useCallback((id: string) => {
    setOpenIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash || !termsSectionIds.includes(hash)) return;
      openSection(hash);
      window.requestAnimationFrame(() => {
        document.getElementById(`heading-${hash}`)?.focus();
      });
    };

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile && !window.location.hash) {
      setOpenIds(new Set(termsMobileDefaultOpen));
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [openSection]);

  useEffect(() => {
    const headings = termsOfServiceSections
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

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setOpenIds(allOpen ? new Set() : new Set(termsSectionIds));
  };

  return (
    <div className="ss-privacy-layout-wrap" id="terms">
      <div className="ss-privacy-layout">
        <aside className="ss-privacy-nav">
          <details className="ss-privacy-toc-mobile">
            <summary>On this page</summary>
            <TermsNavList activeId={activeId} onOpen={openSection} />
          </details>
          <div className="ss-privacy-toc-desktop">
            <p className="ss-privacy-toc-label">On this page</p>
            <TermsNavList activeId={activeId} onOpen={openSection} />
          </div>
          <div className="ss-privacy-nav-support">
            <span className="ss-privacy-chip-icon" aria-hidden>
              <Mail className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p>Questions about these Terms?</p>
            <Link href="/contact">Contact us</Link>
            <p className="ss-terms-nav-email">
              Privacy:{' '}
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
            </p>
          </div>
        </aside>

        <div className="ss-terms-content">
          <header className="ss-privacy-content-head">
            <p className="ss-about-eyebrow">Full agreement</p>
            <p className="ss-terms-group-title">The complete Terms</p>
            <ul className="ss-privacy-facts">
              <li>Effective {termsMeta.lastUpdatedLabel}</li>
              <li>{termsMeta.organization}</li>
              <li>{termsMeta.location}</li>
            </ul>
          </header>

          {termsOfServiceSections.map((section, index) => {
            const isOpen = openIds.has(section.id);
            return (
              <article key={section.id} id={section.id} className="ss-terms-section">
                <h2>
                  <button
                    id={`heading-${section.id}`}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`panel-${section.id}`}
                    className="ss-terms-acc-btn"
                    onClick={() => toggle(section.id)}
                  >
                    <span>
                      <span className="ss-terms-acc-n">{index + 1}.</span> {section.title}
                    </span>
                    <ChevronDown
                      className={cn('ss-terms-chevron', isOpen && 'is-open')}
                      aria-hidden
                    />
                  </button>
                </h2>
                <section
                  id={`panel-${section.id}`}
                  aria-labelledby={`heading-${section.id}`}
                  className={cn('ss-terms-panel', isOpen && 'is-open')}
                >
                  <div className="ss-terms-panel-inner">
                    {section.blocks.map((block, blockIndex) => {
                      if (block.type === 'p') {
                        return (
                          <p key={blockIndex}>
                            <TermsLegalText text={block.text} />
                          </p>
                        );
                      }
                      if (block.type === 'subhead') {
                        return <h3 key={blockIndex}>{block.text}</h3>;
                      }
                      return (
                        <ul key={blockIndex}>
                          {block.items.map((item) => (
                            <li key={item}>
                              <TermsLegalText text={item} />
                            </li>
                          ))}
                        </ul>
                      );
                    })}
                  </div>
                </section>
              </article>
            );
          })}

          <button type="button" className="ss-terms-toggle-all" onClick={toggleAll}>
            {allOpen ? (
              <>
                Collapse all sections
                <ChevronsUp className="h-4 w-4" aria-hidden />
              </>
            ) : (
              <>
                Show all sections
                <ChevronsDown className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsNavList({
  activeId,
  onOpen,
}: {
  activeId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <nav aria-label="Terms of Service sections">
      <ol className="ss-privacy-toc">
        {termsOfServiceSections.map((section, index) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={cn(activeId === section.id && 'is-active')}
              aria-current={activeId === section.id ? 'location' : undefined}
              onClick={() => onOpen(section.id)}
            >
              {index + 1}. {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

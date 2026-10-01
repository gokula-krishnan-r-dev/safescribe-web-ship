'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  ClipboardPen,
  Gift,
  Lock,
  Monitor,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { BrandLockup } from '@/components/safescribe/brand-lockup';
import { RegistrationCard } from './registration-card';

const BENEFITS = [
  'Guideline-informed prescribing support',
  'Safety checks and red-flag screening',
  'Treatment options and follow-up guidance',
  'Assisted documentation in seconds',
] as const;

const STEPS = [
  {
    title: 'Register your pharmacy',
    copy: 'Provide a few details to get started.',
    icon: ClipboardPen,
  },
  {
    title: 'We verify and set you up',
    copy: 'We confirm your eligibility and enable your access.',
    icon: ShieldCheck,
  },
  {
    title: 'Start using SafeScribe',
    copy: 'Access clinical support and document with confidence.',
    icon: Monitor,
  },
] as const;

export function ActivateLanding() {
  const searchParams = useSearchParams();
  const utm = {
    source: searchParams.get('utm_source'),
    medium: searchParams.get('utm_medium'),
    campaign: searchParams.get('utm_campaign'),
  };

  return (
    <div className="ss-activate">
      <div className="ss-activate-wash" aria-hidden />

      <header className="ss-activate-header">
        <div className="ss-activate-header-inner">
          <Link href="/" aria-label="SafeScribe home" className="ss-activate-logo">
            <BrandLockup variant="header" priority />
          </Link>
          <p className="ss-activate-badge">
            <Shield aria-hidden />
            Built for Alberta Pharmacists
          </p>
        </div>
      </header>

      <main>
        <section className="ss-activate-hero" aria-labelledby="activate-headline">
          <div className="ss-activate-copy">
            <h1 id="activate-headline">
              Safe. Smart.
              <span>Made for you.</span>
            </h1>
            <p className="ss-activate-lede">
              Clinical decision support and documentation
              <br />
              for Alberta pharmacists.
            </p>

            <p className="ss-activate-callout">
              <Gift aria-hidden />
              Complimentary access during our Alberta launch.
            </p>

            <ul className="ss-activate-benefits">
              {BENEFITS.map((item) => (
                <li key={item}>
                  <span aria-hidden>
                    <Check />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="ss-activate-trust">
              <p>
                <Lock aria-hidden />
                Secure. Private. Canadian.
              </p>
              <p>
                <UserRound aria-hidden />
                Pharmacist remains the final decision-maker.
              </p>
            </div>
          </div>

          <RegistrationCard utm={utm} />
        </section>

        <section className="ss-activate-how" aria-labelledby="how-it-works">
          <div className="ss-activate-how-title">
            <span />
            <h2 id="how-it-works">How it works</h2>
            <span />
          </div>
          <ol className="ss-activate-steps">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  {index < STEPS.length - 1 ? <span className="ss-activate-step-line" aria-hidden /> : null}
                  <span className="ss-activate-step-icon">
                    <Icon aria-hidden />
                  </span>
                  <p>
                    <strong>
                      {index + 1}. {step.title}
                    </strong>
                    {step.copy}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      </main>

      <footer className="ss-activate-footer">
        <div className="ss-activate-footer-inner">
          <BrandLockup variant="header" />
          <ul>
            <li>
              <MapleLeaf />
              Proudly Canadian
            </li>
            <li>
              <AlbertaMark />
              Built for Alberta
            </li>
            <li>
              <Lock aria-hidden />
              <Link href="/privacy">Privacy Policy</Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

function MapleLeaf() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ss-activate-footer-glyph">
      <path
        fill="currentColor"
        d="M12 2.2c.3 1.4.8 2.6 1.6 3.6.4-.9 1-1.7 1.8-2.3.2 1.5.1 2.7-.2 3.8 1.1-.6 2.2-.8 3.4-.7-.4 1.3-1.1 2.3-2 3.1 1.2.2 2.3.6 3.2 1.2-.9 1-2.1 1.6-3.4 1.8.8.7 1.4 1.6 1.8 2.7-1.4-.2-2.6-.7-3.6-1.5.1 1.2.1 2.4-.1 3.6L12 21.8l-2.5-4.3c-.2-1.2-.2-2.4-.1-3.6-1 .8-2.2 1.3-3.6 1.5.4-1.1 1-2 1.8-2.7-1.3-.2-2.5-.8-3.4-1.8.9-.6 2-1 3.2-1.2-.9-.8-1.6-1.8-2-3.1 1.2-.1 2.3.1 3.4.7-.3-1.1-.4-2.3-.2-3.8.8.6 1.4 1.4 1.8 2.3C11.2 4.8 11.7 3.6 12 2.2Z"
      />
    </svg>
  );
}

function AlbertaMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="ss-activate-footer-glyph">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        d="M5.5 17.5 8 7.5l3 4 2.2-5 2.3 6.2 3-1.7-.8 6.5H5.5Z"
      />
    </svg>
  );
}

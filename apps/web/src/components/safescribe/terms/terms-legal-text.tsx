import Link from 'next/link';
import type { ReactNode } from 'react';

const LEGAL_LINKS = [
  { phrase: 'SafeScribe Privacy & Security Policy', href: '/privacy' },
  { phrase: 'Privacy & Security Policy', href: '/privacy' },
  { phrase: 'SafeScribe Contact page', href: '/contact' },
  { phrase: 'Privacy@pharmasafe.ca', href: 'mailto:Privacy@pharmasafe.ca' },
] as const;

export function TermsLegalText({ text }: { text: string }) {
  return <>{linkLegalMentions(text)}</>;
}

function linkLegalMentions(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliest = -1;
    let matched: (typeof LEGAL_LINKS)[number] | null = null;

    for (const rule of LEGAL_LINKS) {
      const index = remaining.indexOf(rule.phrase);
      if (index === -1) continue;
      if (earliest === -1 || index < earliest) {
        earliest = index;
        matched = rule;
      }
    }

    if (!matched || earliest === -1) {
      nodes.push(remaining);
      break;
    }

    if (earliest > 0) {
      nodes.push(remaining.slice(0, earliest));
    }

    nodes.push(
      <Link key={`legal-link-${key}`} href={matched.href} className="ss-terms-inline-link">
        {matched.phrase}
      </Link>,
    );
    key += 1;
    remaining = remaining.slice(earliest + matched.phrase.length);
  }

  return nodes;
}

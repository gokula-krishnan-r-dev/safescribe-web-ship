'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Globe, Menu, X } from 'lucide-react';
import { BrandLockup } from '@/components/safescribe/brand-lockup';
import { PUBLIC_NAV, type PublicNavId } from '@/components/safescribe/public-nav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function PublicHeader({ active }: { active?: PublicNavId | null }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="ss-public-header">
      <div className="ss-public-header-inner">
        <Link
          href="/"
          aria-label="SafeScribe home"
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40"
        >
          <BrandLockup variant="header" priority />
        </Link>

        <nav aria-label="Primary" className="ss-public-nav">
          <NavLinks active={active} />
        </nav>

        <div className="ss-public-header-actions">
          <LanguageSelect />
          <button
            type="button"
            className="ss-public-menu-btn"
            aria-expanded={mobileOpen}
            aria-controls="ss-public-mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">{mobileOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div id="ss-public-mobile-nav" className="ss-public-mobile">
          <nav aria-label="Mobile">
            <NavLinks
              active={active}
              onNavigate={() => setMobileOpen(false)}
              stacked
            />
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function NavLinks({
  active,
  stacked = false,
  onNavigate,
}: {
  active?: PublicNavId | null;
  stacked?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className={cn('ss-public-nav-list', stacked && 'is-stacked')}>
      {PUBLIC_NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onNavigate}
              className={cn('ss-public-nav-link', isActive && 'ss-public-nav-link-active')}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LanguageSelect() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ss-lang-btn" aria-label="Language, English">
        <Globe className="h-4 w-4" aria-hidden />
        EN
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl border-[#d9e5ee] p-1.5">
        <DropdownMenuItem className="rounded-lg px-3 py-2" onSelect={(event) => event.preventDefault()}>
          <Check className="mr-2 h-3.5 w-3.5 text-[#008CA4]" aria-hidden />
          English
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-lg px-3 py-2 text-[#60738E]" disabled>
          Français
          <span className="ml-auto text-[11px] uppercase tracking-wide">Soon</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  FlaskConical,
  ShieldCheck,
  Bot,
  FileDown,
  Settings,
} from 'lucide-react';
import { BrandMark } from '@/components/shared/brand-mark';
import { cn } from '@/lib/utils';
import { SUPER_ADMIN_PORTALS, type SuperAdminPortal } from './portal';

type Props = {
  /** Where each card should navigate (login path or portal home). */
  hrefForPortal: (portal: SuperAdminPortal) => string;
  onSelectPortal?: (portal: SuperAdminPortal) => void;
  subtitle?: string;
  showWorkspaceLoginLink?: boolean;
  allowedPortals?: SuperAdminPortal[];
};

const pharmacyIcons = [Building2];
const platformIcons = [FlaskConical, ShieldCheck, Bot, FileDown, Settings];

export function SuperAdminPortalChooser({
  hrefForPortal,
  onSelectPortal,
  subtitle = 'Choose which workspace you want to open.',
  showWorkspaceLoginLink = true,
  allowedPortals = ['pharmacy', 'platform'],
}: Props) {
  const showPharmacy = allowedPortals.includes('pharmacy');
  const showPlatform = allowedPortals.includes('platform');
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div className="text-center">
        <div className="mx-auto mb-5">
          <BrandMark size="lg" priority className="mx-auto" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          Platform Admin
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          SafeScribe control plane
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className={cn('grid gap-4', showPharmacy && showPlatform ? 'sm:grid-cols-2' : 'max-w-md mx-auto')}>
        {showPharmacy ? (
        <PortalCard
          portal="pharmacy"
          href={hrefForPortal('pharmacy')}
          onSelect={onSelectPortal}
          accent="teal"
          icons={pharmacyIcons}
          highlights={['Pharmacies & tenants', 'Pharmacist admins', 'Activity log']}
        />
        ) : null}
        {showPlatform ? (
        <PortalCard
          portal="platform"
          href={hrefForPortal('platform')}
          onSelect={onSelectPortal}
          accent="slate"
          icons={platformIcons}
          highlights={[
            'Clinical pathways',
            'Safety Alert',
            'Assist & document formats',
          ]}
        />
        ) : null}
      </div>

      {showWorkspaceLoginLink ? (
        <p className="text-center text-sm text-muted-foreground">
          Pharmacist or Pharmacy Admin?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in to your pharmacy workspace
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function PortalCard({
  portal,
  href,
  onSelect,
  accent,
  icons,
  highlights,
}: {
  portal: SuperAdminPortal;
  href: string;
  onSelect?: (portal: SuperAdminPortal) => void;
  accent: 'teal' | 'slate';
  icons: Array<typeof Building2>;
  highlights: string[];
}) {
  const meta = SUPER_ADMIN_PORTALS[portal];

  return (
    <Link
      href={href}
      onClick={() => onSelect?.(portal)}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        accent === 'teal'
          ? 'border-primary/20'
          : 'border-border',
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-12 w-12 items-center justify-center rounded-xl',
          accent === 'teal' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground',
        )}
      >
        {portal === 'pharmacy' ? (
          <Building2 className="h-6 w-6" />
        ) : (
          <FlaskConical className="h-6 w-6" />
        )}
      </div>

      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {meta.name}
      </h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
        {meta.description}
      </p>

      <ul className="mt-4 space-y-1.5">
        {highlights.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1 w-1 rounded-full bg-primary/70" />
            {item}
          </li>
        ))}
      </ul>

      {portal === 'platform' ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {icons.slice(0, 5).map((Icon, i) => (
            <span
              key={i}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/80 text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      ) : null}

      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        Continue
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

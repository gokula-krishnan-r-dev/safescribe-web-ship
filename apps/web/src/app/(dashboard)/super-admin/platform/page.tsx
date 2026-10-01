'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  FileDown,
  FlaskConical,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { writeStoredPortal } from '@/features/super-admin-portal/portal';
import { canAccessPharmacyManagement, resolveSuperAdminScope } from '@safescript/shared';

const LINKS = [
  {
    title: 'Clinical Pathways',
    description: 'Author, version, and publish clinical pathways.',
    href: '/super-admin/pathways',
    icon: FlaskConical,
  },
  {
    title: 'Pathway test cases',
    description: 'Upload the 48-pathway Excel pack and run unique Safety, Treatment, and Flow cases.',
    href: '/super-admin/pathway-qa',
    icon: ClipboardCheck,
  },
  {
    title: 'Safety Alert',
    description: 'Upload, review, publish, and restore safety knowledge releases.',
    href: '/super-admin/safety-engine',
    icon: ShieldCheck,
  },
  {
    title: 'Assist System',
    description: 'Configure prompts, models, and clinical assist behaviour.',
    href: '/super-admin/ai-system',
    icon: Bot,
  },
  {
    title: 'Doc Download Format',
    description: 'Manage document templates and download formats.',
    href: '/super-admin/doc-download-format',
    icon: FileDown,
  },
  {
    title: 'Settings',
    description: 'Appearance and platform preference controls.',
    href: '/super-admin/settings',
    icon: Settings,
  },
] as const;

export default function ClinicalPlatformDashboard() {
  const user = useAuthStore((s) => s.user);
  const canSwitchToPharmacy = canAccessPharmacyManagement(
    resolveSuperAdminScope(user?.role, user?.superAdminScope),
  );

  useEffect(() => {
    writeStoredPortal('platform');
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Clinical Platform"
        description={`Welcome back, ${user?.firstName}. Pathways, test cases, Safety Alert, assist system, and document tooling live here.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group block transition-transform hover:scale-[1.01]"
          >
            <Card className="h-full border-border/80 shadow-sm transition-shadow group-hover:border-primary/30 group-hover:shadow-md">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base font-semibold">{item.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </div>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Open
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {canSwitchToPharmacy ? (
      <Card className="border-border/80">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            Need pharmacies, admins, or activity logs instead?
          </p>
          <Link href="/super-admin" onClick={() => writeStoredPortal('pharmacy')}>
            <Button variant="outline">Switch to Pharmacy Management</Button>
          </Link>
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { BookMarked, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GOVERNANCE_STATUS_LABELS, type GovernanceReviewStatus } from '@safescript/shared';
import type { ClinicalPathway } from '../types';
import { PathwayReadOnlyBanner, editLockProps } from '../pathway-edit-lock';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { ReferencesPanel } from '../references-governance/references-panel';
import { GovernancePanel } from '../references-governance/governance-panel';
import {
  formatShortDate,
  resolveGovernance,
} from '../references-governance/utils';
import { cn } from '@/lib/utils';

export function ReferencesGovernanceTab({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const lock = editLockProps(canEdit);
  const [innerTab, setInnerTab] = useState<'references' | 'governance'>('references');
  const library = pathway.libraryReferences ?? [];
  const governance = resolveGovernance(pathway);

  const summary = useMemo(() => {
    const verified = library.filter((r) => r.status === 'verified').length;
    const needsReview = library.filter(
      (r) => r.status === 'needs_review' || r.status === 'verification_required' || !r.status,
    ).length;
    return { total: library.length, verified, needsReview };
  }, [library]);

  return (
    <div className="space-y-5">
      <PathwayReadOnlyBanner canEdit={canEdit} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <BookMarked className="h-5 w-5 text-primary" />
            References & Governance
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Evidence sources and clinical review information for this pathway.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportFromChatGptButton pathway={pathway} target="references" canEdit={canEdit} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setInnerTab('references');
              window.setTimeout(() => {
                document.querySelector<HTMLButtonElement>('[data-rg-link-library]')?.click();
              }, 50);
            }}
            {...lock}
          >
            Link from library
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setInnerTab('references');
              window.setTimeout(() => {
                document.querySelector<HTMLButtonElement>('[data-rg-add-reference]')?.click();
              }, 50);
            }}
            {...lock}
          >
            <Plus className="h-4 w-4" />
            Add reference
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="References"
          value={String(summary.total)}
          hint={`${summary.verified} verified · ${summary.needsReview} needs review`}
        />
        <KpiCard
          label="Internal review"
          value={statusLabel(governance.internalReviewStatus)}
          tone={governance.internalReviewStatus === 'completed' ? 'good' : 'warn'}
        />
        <KpiCard
          label="Independent peer review"
          value={statusLabel(governance.externalPeerReviewStatus)}
          tone={governance.externalPeerReviewStatus === 'completed' ? 'good' : 'warn'}
        />
        <KpiCard label="Last reviewed" value={formatShortDate(governance.lastReviewedAt)} />
        <KpiCard
          label="Next review"
          value={formatShortDate(governance.nextReviewDueAt)}
          tone={isOverdue(governance.nextReviewDueAt) ? 'warn' : undefined}
        />
      </div>

      <Tabs
        value={innerTab}
        onValueChange={(v) => setInnerTab(v as 'references' | 'governance')}
      >
        <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="references"
            className="relative rounded-none border-b-2 border-transparent px-4 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            References
          </TabsTrigger>
          <TabsTrigger
            value="governance"
            className="relative rounded-none border-b-2 border-transparent px-4 pb-2.5 pt-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Governance & Review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="references" className="mt-0">
          <ReferencesPanel pathway={pathway} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="governance" className="mt-0">
          <GovernancePanel pathway={pathway} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <Card
      className={cn(
        'border-border/80 p-3.5 shadow-sm',
        tone === 'good' && 'border-emerald-200 bg-emerald-50/40',
        tone === 'warn' && 'border-amber-200 bg-amber-50/40',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function statusLabel(status?: string | null): string {
  if (!status) return GOVERNANCE_STATUS_LABELS.not_started;
  return GOVERNANCE_STATUS_LABELS[status as GovernanceReviewStatus] ?? status;
}

function isOverdue(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

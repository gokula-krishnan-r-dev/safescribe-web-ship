'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Code2,
  Database,
  FileSpreadsheet,
  FlaskConical,
  Lightbulb,
  ShieldAlert,
  Server,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  ISSUE_SOURCE_HINT,
  ISSUE_SOURCE_LABEL,
  type PathwayQaIssueSource,
  type PathwayQaRun,
  type PathwayQaVariantResult,
} from './types';

const SOURCE_ICON: Record<PathwayQaIssueSource, typeof FileSpreadsheet> = {
  EXCEL_DATA: FileSpreadsheet,
  PATHWAY_CONTENT: FlaskConical,
  CODE: Code2,
  SAFETY_REPOSITORY: ShieldAlert,
  ENVIRONMENT: Server,
};

const SOURCE_TONE: Record<PathwayQaIssueSource, string> = {
  EXCEL_DATA: 'bg-amber-50 text-amber-900 border-amber-200',
  PATHWAY_CONTENT: 'bg-sky-50 text-sky-900 border-sky-200',
  CODE: 'bg-violet-50 text-violet-900 border-violet-200',
  SAFETY_REPOSITORY: 'bg-rose-50 text-rose-900 border-rose-200',
  ENVIRONMENT: 'bg-slate-50 text-slate-800 border-slate-200',
};

function verdictBadge(verdict: string) {
  if (verdict === 'PASS') return <Badge variant="success">Pass</Badge>;
  if (verdict === 'SKIPPED') return <Badge variant="warning">Skipped</Badge>;
  return <Badge variant="destructive">Fail</Badge>;
}

function ResultRow({ item }: { item: PathwayQaVariantResult }) {
  const [open, setOpen] = useState(item.verdict !== 'PASS');
  const failed = item.verdict === 'FAIL';

  return (
    <div
      className={cn(
        'rounded-xl border',
        failed ? 'border-red-200/80 bg-red-50/40' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {failed ? (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">{item.title}</p>
            {verdictBadge(item.verdict)}
            <Badge variant="outline">{item.layer}</Badge>
            <span className="text-xs text-muted-foreground">{item.priority}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.fixtureText}</p>
        </div>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border/70 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expected</p>
              <p className="mt-1 text-sm">{item.expectedDisposition}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.expected}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actual</p>
              <p className="mt-1 text-sm font-medium">{item.actualDisposition.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.actualSummary}</p>
            </div>
          </div>

          {item.checks.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {item.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2 text-sm">
                  {check.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  )}
                  <span>
                    {check.label}
                    {check.detail ? (
                      <span className="block text-xs text-muted-foreground">{check.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {item.issues.map((issue, idx) => {
            const Icon = SOURCE_ICON[issue.source];
            return (
              <div key={`${issue.title}-${idx}`} className={cn('rounded-lg border p-3', SOURCE_TONE[issue.source])}>
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{issue.title}</p>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-80">
                      {ISSUE_SOURCE_LABEL[issue.source]} · {ISSUE_SOURCE_HINT[issue.source]}
                    </p>
                    <p className="mt-2 text-sm">{issue.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {item.suggestions.length > 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <Lightbulb className="h-4 w-4" />
                How to fix
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emerald-950">
                {item.suggestions.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.findings.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Engine findings</p>
              <ul className="mt-2 space-y-2">
                {item.findings.map((finding, idx) => (
                  <li key={`${finding.ruleCode ?? finding.summary}-${idx}`} className="rounded-lg border border-border bg-background p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{finding.findingType}</Badge>
                      <Badge variant={finding.clinicalSeverity === 'CRITICAL' ? 'destructive' : 'warning'}>
                        {finding.clinicalSeverity}
                      </Badge>
                      {finding.ruleCode ? <span className="font-mono text-xs">{finding.ruleCode}</span> : null}
                    </div>
                    <p className="mt-1 font-medium">{finding.summary}</p>
                    <p className="text-xs text-muted-foreground">{finding.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PathwayQaRunResults({ run }: { run: PathwayQaRun }) {
  const [layer, setLayer] = useState<'all' | string>('all');
  const [verdict, setVerdict] = useState<'all' | 'FAIL' | 'PASS'>('all');
  const results = run.results ?? [];
  const filtered = useMemo(
    () =>
      results.filter((item) => {
        if (layer !== 'all' && item.layer !== layer) return false;
        if (verdict !== 'all' && item.verdict !== verdict) return false;
        return true;
      }),
    [results, layer, verdict],
  );
  const summary = run.summary;
  const sourceEntries = Object.entries(summary?.bySource ?? {}) as Array<[PathwayQaIssueSource, number]>;

  return (
    <div className="space-y-5">
      {run.status === 'FAILED' && run.errorMessage ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-950">This run could not finish</p>
            <p className="mt-1 text-sm text-amber-900">{run.errorMessage}</p>
            {run.matchSuggestions?.length ? (
              <p className="mt-2 text-sm text-amber-900">
                Closest workbook conditions:{' '}
                {run.matchSuggestions
                  .slice(0, 3)
                  .map((item) => `${item.condition} (${Math.round(item.score * 100)}%)`)
                  .join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Unique cases', value: summary.total },
            { label: 'Passed', value: summary.passed, tone: 'text-emerald-700' },
            { label: 'Failed', value: summary.failed, tone: summary.failed ? 'text-red-700' : undefined },
            { label: 'Pass rate', value: `${summary.passRate}%` },
          ].map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={cn('mt-1 text-2xl font-semibold tabular-nums', card.tone)}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {sourceEntries.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sourceEntries.map(([source, count]) => {
            const Icon = SOURCE_ICON[source];
            return (
              <div key={source} className={cn('rounded-xl border p-3', SOURCE_TONE[source])}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <p className="text-sm font-semibold">{ISSUE_SOURCE_LABEL[source]}</p>
                  <span className="ml-auto tabular-nums text-sm font-bold">{count}</span>
                </div>
                <p className="mt-1 text-xs opacity-80">{ISSUE_SOURCE_HINT[source]}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'FAIL', 'PASS'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={verdict === value ? 'default' : 'outline'}
            onClick={() => setVerdict(value)}
          >
            {value === 'all' ? 'All results' : value === 'FAIL' ? 'Failed only' : 'Passed only'}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {['all', ...Object.keys(summary?.byLayer ?? {})].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={layer === value ? 'secondary' : 'ghost'}
            onClick={() => setLayer(value)}
          >
            {value === 'all' ? 'All layers' : value}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
          <ResultRow key={item.uniqueKey} item={item} />
        ))}
        {!filtered.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No cases match this filter.</p>
        ) : null}
      </div>
    </div>
  );
}

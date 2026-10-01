'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useLatestPathwayQaRun,
  usePathwayQaRun,
} from './hooks';
import { PathwayQaRunResults } from './run-results';
import { FlaskConical, Loader2 } from 'lucide-react';

export function PathwayQaTab({ pathwayId }: { pathwayId: string }) {
  const router = useRouter();
  const latest = useLatestPathwayQaRun(pathwayId);
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = usePathwayQaRun(openId);
  const run = latest.data;
  const summary = run?.summary;

  const statusBadge = useMemo(() => {
    if (!run) return null;
    if (run.status === 'FAILED') return <Badge variant="destructive">Run failed</Badge>;
    if (summary?.failed) return <Badge variant="warning">{summary.failed} failed</Badge>;
    if (summary?.passed) return <Badge variant="success">{summary.passed} passed</Badge>;
    return <Badge variant="outline">{run.status}</Badge>;
  }, [run, summary]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">Developer test cases</p>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Upload the 48-pathway Excel pack and run the unique Safety, Treatment, and Flow
                variants that match this condition. Failures tell you whether to fix the workbook,
                the pathway content, or the engine.
              </p>
            </div>
          </div>
          <Button onClick={() => router.push(`/super-admin/pathway-qa?pathwayId=${pathwayId}`)}>
            Open test lab
          </Button>
        </CardContent>
      </Card>

      {latest.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading latest run…
        </div>
      ) : run ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {statusBadge}
            <span className="text-muted-foreground">
              {run.workbook.fileName} · {formatDate(run.createdAt)}
              {run.matchedCondition ? ` · matched ${run.matchedCondition}` : ''}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenId(openId === run.id ? null : run.id)}
            >
              {openId === run.id ? 'Hide results' : 'Show results'}
            </Button>
          </div>
          {openId === run.id ? (
            detail.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading results…
              </div>
            ) : detail.data ? (
              <PathwayQaRunResults run={detail.data} />
            ) : null
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No test run yet for this pathway.</p>
      )}
    </div>
  );
}

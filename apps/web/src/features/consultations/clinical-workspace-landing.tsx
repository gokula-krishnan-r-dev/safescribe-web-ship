'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnsureWorkspace } from './hooks';
import { ensureWorkspaceOnce } from './ensure-workspace-once';
import { usePrescribeUsage, useRenewUsage, isDailyLimitReached } from '@/features/entitlements/hooks';
import { DailyLimitReachedPanel } from '@/features/entitlements/daily-limit-reached-panel';
import { getErrorMessage } from '@/lib/errors';

/**
 * Post-login Prescribe/Renew landing: start a new consult (or reuse a blank unused
 * draft). Existing in-progress work stays in Active Consultations.
 * One round-trip; concurrent calls share a lock.
 */
export function ClinicalWorkspaceLanding({
  basePath,
  module,
}: {
  basePath: string;
  module: 'prescribe' | 'renew' | 'adapt';
}) {
  const router = useRouter();
  const ensure = useEnsureWorkspace();
  const mutateRef = useRef(ensure.mutateAsync);
  mutateRef.current = ensure.mutateAsync;
  const [attempt, setAttempt] = useState(0);
  const [limitBlocked, setLimitBlocked] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const prescribeUsage = usePrescribeUsage({ enabled: limitBlocked && module === 'prescribe' });
  const renewUsage = useRenewUsage({ enabled: limitBlocked && module === 'renew' });
  const usage = module === 'renew' ? renewUsage : prescribeUsage;
  const workspaceLabel = module === 'adapt' ? 'Adapt' : module === 'renew' ? 'Renew' : 'Prescribe';

  const retry = useCallback(() => {
    setLoadError(null);
    setLimitBlocked(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void ensureWorkspaceOnce(`${module}:${attempt}`, () => mutateRef.current({ module }))
      .then((workspace) => {
        if (!cancelled) router.replace(`${basePath}/${workspace.id}`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isDailyLimitReached(err)) {
          setLimitBlocked(true);
          return;
        }
        setLoadError(getErrorMessage(err, `Could not open the ${workspaceLabel} workspace.`));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, basePath, module, router, workspaceLabel]);

  if (limitBlocked && usage.data?.current) {
    return <DailyLimitReachedPanel snapshot={usage.data.current} />;
  }

  if (loadError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-foreground">{loadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

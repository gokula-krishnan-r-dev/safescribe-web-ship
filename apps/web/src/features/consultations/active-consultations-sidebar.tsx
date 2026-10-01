'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Loader2,
  CircleDashed,
  PanelLeftClose,
  Info,
  Clock,
  FileCheck2,
  CircleCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  mapWorkflowStageToLabel,
  type ActiveConsultationListItem,
  type ActiveWorkflowStage,
} from '@safescript/shared';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import {
  useActiveConsultations,
  useCreateConsultation,
} from './hooks';
import { usePrescribeUsage, useRenewUsage, isDailyLimitReached } from '@/features/entitlements/hooks';
import { PrescribeUsageMeter } from '@/features/entitlements/prescribe-usage-meter';
import { setConsultSidebarOpen } from './consult-sidebar-state';

const SIDEBAR_WIDTH_PX = 320;

interface Props {
  activeId?: string;
  basePath: string;
  /** When false, the pane is fully hidden (no collapsed rail). */
  expanded?: boolean;
  className?: string;
  module?: 'prescribe' | 'renew' | 'adapt';
}

function formatSidebarTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function stageTone(stage: ActiveWorkflowStage): {
  wrap: string;
  icon: typeof FileCheck2;
} {
  if (stage === 'documents') {
    return {
      wrap: 'bg-[#E8F6EF] text-[#1B7A4E]',
      icon: FileCheck2,
    };
  }
  return {
    wrap: 'bg-[#E8F1FB] text-[#2F5F8F]',
    icon: CircleCheck,
  };
}

function ActiveConsultationStatus({ stage }: { stage: ActiveWorkflowStage }) {
  const label = mapWorkflowStageToLabel(stage);
  const tone = stageTone(stage);
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
        tone.wrap,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ActiveConsultationRow({
  consultation,
  selected,
  onOpen,
}: {
  consultation: ActiveConsultationListItem;
  selected: boolean;
  onOpen: () => void;
}) {
  const timeLabel = formatSidebarTime(consultation.updatedAt || consultation.startedAt);
  const accessibleName = `${consultation.displayLabel}, ${mapWorkflowStageToLabel(consultation.workflowStage)}, updated ${timeLabel}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'page' : undefined}
      aria-label={accessibleName}
      title={consultation.displayLabel}
      className={cn(
        'group relative flex min-h-11 w-full flex-col gap-1.5 rounded-[11px] px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
        selected
          ? 'bg-[#EAF7F6] shadow-[inset_3px_0_0_0_#008CA4]'
          : 'bg-card hover:bg-muted/40',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            selected ? 'bg-[#008CA4]' : 'bg-muted-foreground/40',
          )}
          aria-hidden
        />
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {timeLabel}
        </span>
      </div>
      <p
        className={cn(
          'line-clamp-2 text-[13px] leading-snug',
          selected ? 'font-semibold text-foreground' : 'font-medium text-foreground/90',
        )}
      >
        {consultation.displayLabel}
      </p>
      <ActiveConsultationStatus stage={consultation.workflowStage} />
    </button>
  );
}

function RetentionInfoButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="About active consultation retention"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-[240px]">
        Consultations remain available while in progress. They are permanently deleted when
        completed, or automatically at 12:00 midnight MT.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Active Consultations work queue — temporary consultations that still need action.
 * Hidden when collapsed; reopen from the wizard header or Active Consultations nav.
 */
export function ActiveConsultationsSidebar({
  activeId,
  basePath,
  expanded = true,
  className,
  module = 'prescribe',
}: Props) {
  const router = useRouter();
  const { data, isLoading, isError, refetch, isFetching } = useActiveConsultations({ module });
  const create = useCreateConsultation();
  const prescribeUsage = usePrescribeUsage({ enabled: module === 'prescribe' });
  const renewUsage = useRenewUsage({ enabled: module === 'renew' });
  const usage = module === 'renew' ? renewUsage : prescribeUsage;
  const remaining = usage.data?.current?.remaining;
  const atLimit = remaining === 0 && usage.data?.current?.unlimited !== true;

  const consultations = data?.consultations ?? [];
  const count = data?.count ?? consultations.length;

  const handleNew = async () => {
    if (atLimit) {
      toast.message(
        module === 'renew'
          ? "Today's included renewals have been used"
          : "Today's included assessments have been used",
        {
          description: 'Existing consultations remain available.',
        },
      );
      return;
    }
    try {
      const c = await create.mutateAsync(
        module === 'adapt'
          ? { module: 'adapt' }
          : module === 'renew'
            ? { module: 'renew' }
            : undefined,
      );
      toast.success(
        module === 'adapt'
          ? 'Adaptation started'
          : module === 'renew'
            ? 'Renewal started'
            : 'Consultation started',
      );
      setConsultSidebarOpen(true);
      router.push(`${basePath}/${c.id}`);
    } catch (err) {
      if (isDailyLimitReached(err)) {
        toast.message(
          module === 'renew'
            ? "Today's included renewals have been used"
            : "Today's included assessments have been used",
          {
            description: 'Existing consultations remain available.',
          },
        );
        void usage.refetch();
        return;
      }
      toastError(err, 'Could not start consultation');
    }
  };

  const subtitle = useMemo(() => {
    if (isLoading) return 'Loading…';
    if (isError) return 'Unavailable';
    return `${count} open · Temporary workspace`;
  }, [isLoading, isError, count]);

  if (!expanded) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-border/70 bg-sidebar',
          className,
        )}
        style={{ width: SIDEBAR_WIDTH_PX }}
        aria-label="Active consultations"
      >
        <div className="flex items-start justify-between gap-2 border-b border-border/60 px-[18px] pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h2 className="truncate text-[15px] font-bold tracking-tight text-foreground">
                Active Consultations
              </h2>
              <RetentionInfoButton />
            </div>
            <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">{subtitle}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setConsultSidebarOpen(false)}
            aria-expanded
            aria-label="Hide active consultations"
            title="Hide active consultations"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
          <div className="flex flex-col gap-2">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {isError && !isLoading && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-8 text-center">
                <AlertCircle className="h-5 w-5 text-muted-foreground/70" />
                <p className="text-[12px] font-medium text-foreground">
                  Unable to load active consultations
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Try again
                </Button>
              </div>
            )}

            {!isLoading && !isError && consultations.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <CircleDashed className="h-5 w-5 text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-foreground">No active consultations</p>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Start a consultation to begin.
                </p>
              </div>
            )}

            {!isLoading &&
              !isError &&
              consultations.map((item) => (
                <ActiveConsultationRow
                  key={item.id}
                  consultation={item}
                  selected={item.id === activeId}
                  onOpen={() => router.push(`${basePath}/${item.id}`)}
                />
              ))}
          </div>
        </div>

        <div className="shrink-0 space-y-2.5 border-t border-border/60 px-3 py-3">
          {usage.data?.current ? (
            <PrescribeUsageMeter snapshot={usage.data.current} compact />
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-9 w-full gap-1.5 rounded-lg text-xs font-medium"
            onClick={handleNew}
            disabled={create.isPending || atLimit}
            title={atLimit ? "Today's included assessments have been used" : undefined}
          >
            {create.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            New {module === 'adapt' ? 'Adaptation' : module === 'renew' ? 'Renewal' : 'Consultation'}
          </Button>
          <p className="flex items-start gap-1.5 px-0.5 text-[11px] leading-snug text-muted-foreground">
            <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Unfinished consultations auto-delete at midnight MT.
          </p>
        </div>
      </aside>
    </TooltipProvider>
  );
}

/** @deprecated Use ActiveConsultationsSidebar */
export const ConsultationHistorySidebar = ActiveConsultationsSidebar;

export const ACTIVE_CONSULTATIONS_SIDEBAR_WIDTH = SIDEBAR_WIDTH_PX;
/** Fully hidden when collapsed — no leftover rail. */
export const ACTIVE_CONSULTATIONS_COLLAPSED_WIDTH = 0;

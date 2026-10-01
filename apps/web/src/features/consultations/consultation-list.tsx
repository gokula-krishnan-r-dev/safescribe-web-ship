'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Activity, Clock, CheckCircle, XCircle, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { useConsultations, useCreateConsultation } from './hooks';
import { usePrescribeUsage, isDailyLimitReached } from '@/features/entitlements/hooks';
import { PrescribeUsageMeter } from '@/features/entitlements/prescribe-usage-meter';
import type { ConsultationListItem, ConsultationStatus } from './types';
import { STEP_LABELS } from './types';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  basePath: string;
  role: 'pharmacist' | 'admin' | 'super_admin';
}

const STATUS_CONFIG: Record<ConsultationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: {
    label: 'Draft',
    color: 'bg-muted text-muted-foreground border-muted-foreground/20',
    icon: <Clock className="h-3 w-3" />,
  },
  IN_PROGRESS: {
    label: 'Ongoing',
    color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50',
    icon: <Activity className="h-3 w-3" />,
  },
  COMPLETED: {
    label: 'Done',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
    icon: <CheckCircle className="h-3 w-3" />,
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50',
    icon: <XCircle className="h-3 w-3" />,
  },
};

function ConsultationRow({ item, href }: { item: ConsultationListItem; href: string }) {
  const router = useRouter();
  const config = STATUS_CONFIG[item.status];

  return (
    <button
      onClick={() => router.push(href)}
      className="w-full text-left rounded-xl border border-border bg-card px-5 py-4 hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-foreground">{item.consultationRef}</span>
            <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] gap-1 border', config.color)}>
              {config.icon} {config.label}
            </Badge>
            {item.status !== 'COMPLETED' && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {STEP_LABELS[item.currentStep]}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {item.chiefComplaint || 'No complaint noted yet'}
          </p>

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.pathway && (
              <span className="text-xs text-muted-foreground/70">
                📋 {item.pathway.name}
              </span>
            )}
            <span className="text-xs text-muted-foreground/70">
              {item.pharmacist.firstName} {item.pharmacist.lastName}
            </span>
            <span className="text-xs text-muted-foreground/50">
              {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1 text-muted-foreground/40">
          <span className="text-xs">{item.stepIndex + 1}/10</span>
        </div>
      </div>
    </button>
  );
}

export function ConsultationList({ basePath, role }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useConsultations({ search, status, page, limit: 20 });
  const create = useCreateConsultation();
  const usage = usePrescribeUsage({ enabled: role !== 'super_admin' });
  const atLimit =
    role !== 'super_admin' &&
    usage.data?.current?.remaining === 0 &&
    usage.data?.current?.unlimited !== true;

  const handleNew = async () => {
    if (atLimit) {
      toast.message("Today's included assessments have been used", {
        description: 'Existing consultations remain available.',
      });
      return;
    }
    try {
      const c = await create.mutateAsync();
      router.push(`${basePath}/${c.id}`);
    } catch (err) {
      if (isDailyLimitReached(err)) {
        toast.message("Today's included assessments have been used", {
          description: 'Existing consultations remain available.',
        });
        void usage.refetch();
        return;
      }
      toastError(err, 'Could not start consultation');
    }
  };

  const STATUS_FILTERS = [
    { label: 'All', value: undefined },
    { label: 'Ongoing', value: 'IN_PROGRESS' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Done', value: 'COMPLETED' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Consultations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {role === 'admin'
              ? 'All consultations across your pharmacy team'
              : 'Step-by-step consultations with clinical support'}
          </p>
        </div>
        {role !== 'super_admin' && (
          <Button
            onClick={handleNew}
            disabled={create.isPending || atLimit}
            className="h-9 gap-2 rounded-lg shadow-sm"
            title={atLimit ? "Today's included assessments have been used" : undefined}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Start Consultation
          </Button>
        )}
      </div>

      {role !== 'super_admin' && usage.data?.current ? (
        <div className="max-w-sm">
          <PrescribeUsageMeter snapshot={usage.data.current} />
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by complaint or ref…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => { setStatus(f.value); setPage(1); }}
              className={cn(
                'h-8 px-3 rounded-lg text-xs font-medium transition-colors',
                status === f.value
                  ? 'bg-foreground text-background'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="text-xs text-muted-foreground">
          {data.total} consultation{data.total !== 1 ? 's' : ''} total
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : data?.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-2xl border-2 border-dashed border-border/60">
          <div className="h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center">
            <FileText className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">No consultations yet</p>
            <p className="text-sm text-muted-foreground mt-1">Start a consultation to record the patient visit and get clinical suggestions.</p>
          </div>
          {role !== 'super_admin' && (
            <Button
              onClick={handleNew}
              disabled={create.isPending || atLimit}
              variant="outline"
              className="gap-2 mt-1"
            >
              <Plus className="h-4 w-4" /> Start Consultation
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.items.map((item) => (
            <ConsultationRow
              key={item.id}
              item={item}
              href={`${basePath}/${item.id}`}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {data.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

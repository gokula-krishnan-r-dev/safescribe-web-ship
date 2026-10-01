import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline'; dot: string }> = {
  ACTIVE: { label: 'Active', variant: 'success', dot: 'bg-emerald-500' },
  SUSPENDED: { label: 'Suspended', variant: 'destructive', dot: 'bg-red-500' },
  INACTIVE: { label: 'Inactive', variant: 'destructive', dot: 'bg-red-500' },
  PENDING: { label: 'Pending', variant: 'warning', dot: 'bg-amber-500' },
  SUCCESS: { label: 'Successful', variant: 'success', dot: 'bg-emerald-500' },
  FAILED: { label: 'Unsuccessful', variant: 'destructive', dot: 'bg-red-500' },
  new: { label: 'New', variant: 'warning', dot: 'bg-amber-500' },
  open: { label: 'In progress', variant: 'outline', dot: 'bg-sky-500' },
  closed: { label: 'Closed', variant: 'success', dot: 'bg-emerald-500' },
  pending: { label: 'Pending Review', variant: 'warning', dot: 'bg-amber-500' },
  approved: { label: 'Activated', variant: 'success', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', variant: 'destructive', dot: 'bg-red-500' },
  duplicate: { label: 'Duplicate', variant: 'outline', dot: 'bg-slate-500' },
  needs_review: { label: 'Needs Review', variant: 'outline', dot: 'bg-sky-500' },
  existing_match: { label: 'Existing Match', variant: 'warning', dot: 'bg-orange-500' },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusMap[status] ?? { label: status, variant: 'outline' as const, dot: 'bg-muted-foreground' };
  return (
    <Badge variant={config.variant} className={cn('gap-1.5 pl-2 font-medium', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </Badge>
  );
}

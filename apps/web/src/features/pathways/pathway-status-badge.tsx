import { cn } from '@/lib/utils';
import type { PathwayStatus } from './types';
import { isPathwayPublished } from './pathway-utils';

const STATUS_CONFIG: Record<
  PathwayStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  AI_PROCESSING: { label: 'Being Prepared', className: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' },
  AI_GENERATED: { label: 'Ready to Review', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  UNPUBLISHED: { label: 'Not Live', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  PUBLISHED: { label: 'Live', className: 'bg-green-100 text-green-800 border-green-200' },
  ARCHIVED: { label: 'Archived', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export function PathwayStatusBadge({
  status,
  className,
  showPublicationOnly = false,
}: {
  status: PathwayStatus;
  className?: string;
  showPublicationOnly?: boolean;
}) {
  if (showPublicationOnly) {
    const published = isPathwayPublished(status);
    const config = published
      ? STATUS_CONFIG.PUBLISHED
      : status === 'ARCHIVED'
        ? STATUS_CONFIG.ARCHIVED
        : STATUS_CONFIG.UNPUBLISHED;

    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          config.className,
          className,
        )}
      >
        {config.label}
      </span>
    );
  }

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

export function getStatusLabel(status: PathwayStatus): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

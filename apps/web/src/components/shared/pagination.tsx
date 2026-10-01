import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  className?: string;
  hideSummary?: boolean;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  className,
  hideSummary = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className={cn('flex items-center justify-between gap-4 px-1', hideSummary && 'justify-end', className)}>
      {!hideSummary && (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{start}–{end}</span> of{' '}
          <span className="font-medium text-foreground">{total}</span>
        </p>
      )}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-9"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="hidden px-2 text-sm text-muted-foreground sm:inline">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-9"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

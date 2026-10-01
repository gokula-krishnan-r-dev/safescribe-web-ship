import { Search, ArrowUpDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  status?: string;
  onStatusChange?: (value: string) => void;
  statusOptions?: SelectOption[];
  sortOrder?: 'asc' | 'desc';
  onSortToggle?: () => void;
  onReset?: () => void;
  total?: number;
  className?: string;
}

const defaultStatusOptions: SelectOption[] = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PENDING', label: 'Pending' },
];

export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  status,
  onStatusChange,
  statusOptions = defaultStatusOptions,
  sortOrder,
  onSortToggle,
  onReset,
  total,
  className,
}: DataTableToolbarProps) {
  const hasFilters = search || status;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            className="h-11 border-border/80 bg-background pl-10 shadow-none focus-visible:ring-primary/20"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onStatusChange && (
            <Select
              className="min-w-[140px] border-border/80 bg-background shadow-none"
              options={statusOptions}
              value={status ?? ''}
              onChange={(e) => onStatusChange(e.target.value)}
            />
          )}
          {onSortToggle && (
            <Button
              variant="outline"
              size="sm"
              className="h-11 border-border/80 bg-background shadow-none"
              onClick={onSortToggle}
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
            </Button>
          )}
          {hasFilters && onReset && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 text-muted-foreground"
              onClick={onReset}
            >
              <X className="h-4 w-4" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
      {total !== undefined && (
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {total} {total === 1 ? 'item' : 'items'}
        </p>
      )}
    </div>
  );
}

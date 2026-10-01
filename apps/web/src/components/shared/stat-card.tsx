import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: 'primary' | 'success' | 'warning' | 'muted';
  className?: string;
}

const accentStyles = {
  primary: 'from-primary/10 to-primary/5 text-primary',
  success: 'from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  warning: 'from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-400',
  muted: 'from-muted to-muted/50 text-muted-foreground',
};

export function StatCard({ label, value, icon: Icon, accent = 'primary', className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br', accentStyles[accent])}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

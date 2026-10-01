import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-secondary text-secondary-foreground border border-border/50',
  success:
    'bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50',
  warning:
    'bg-amber-50 text-amber-800 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50',
  destructive:
    'bg-red-50 text-red-800 border border-red-200/60 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50',
  outline: 'border border-border text-foreground bg-background',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

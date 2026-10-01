'use client';
import {
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from './clinical-ui';

/** Shared card shell for consultation steps */
export function StepCard({
  title,
  description,
  icon: Icon,
  iconClassName,
  badge,
  headerRight,
  children,
  className,
  noPadding,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.03] overflow-hidden',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-muted/20 px-5 py-3.5">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Icon className={cn('h-4 w-4 text-primary', iconClassName)} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm text-foreground">{title}</h3>
              {badge}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
        {headerRight}
      </div>
      <div className={cn(!noPadding && 'p-5')}>{children}</div>
    </div>
  );
}

/** Standard back / continue footer */
export function StepFooter({
  onBack,
  onNext,
  nextLabel,
  loading,
  disabled,
  backLabel = 'Back',
}: {
  onBack: () => void;
  onNext?: () => void;
  nextLabel: string;
  loading?: boolean;
  disabled?: boolean;
  backLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pt-2 border-t border-border mt-6">
      <ClinicalSecondaryButton onClick={onBack}>
        <ChevronLeft className="h-4 w-4" />
        {backLabel}
      </ClinicalSecondaryButton>
      {onNext && (
        <ClinicalPrimaryButton
          onClick={onNext}
          disabled={disabled}
          loading={loading}
          busyFeedback={false}
          className="gap-2 min-w-[9rem]"
        >
          {nextLabel}
          <ChevronRight className="h-4 w-4" />
        </ClinicalPrimaryButton>
      )}
    </div>
  );
}

/** AI loading state */
export function StepLoadingState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-30" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}

/** AI error with retry */
export function StepRetryState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
        <AlertTriangle className="h-6 w-6 text-warning" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
      <ClinicalSecondaryButton onClick={onRetry} className="gap-2 mt-1">
        <RotateCcw className="h-3.5 w-3.5" /> Try again
      </ClinicalSecondaryButton>
    </div>
  );
}

/** Warning / info banner */
export function InfoBanner({
  children,
  variant = 'warning',
}: {
  children: React.ReactNode;
  variant?: 'warning' | 'info';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 text-xs leading-relaxed',
        variant === 'warning'
          ? 'border-warning/30 bg-warning-muted/40 text-foreground/90'
          : 'border-primary/25 bg-primary/5 text-foreground/90',
      )}
    >
      {children}
    </div>
  );
}

/** Pass / fail verdict banner */
export function VerdictBanner({
  passed,
  title,
  summary,
}: {
  passed: boolean;
  title: string;
  summary?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-4 flex items-start gap-3',
        passed
          ? 'border-success/35 bg-success-muted/50'
          : 'border-destructive/35 bg-destructive/10',
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          passed ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive',
        )}
      >
        {passed ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('text-lg font-bold tracking-tight', passed ? 'text-success' : 'text-destructive')}>
          {title}
        </p>
        {summary && (
          <p className="text-sm text-foreground/75 mt-1 leading-relaxed">{summary}</p>
        )}
      </div>
    </div>
  );
}

/** Single assessment criterion row */
export function CriterionRow({
  met,
  criterion,
  explanation,
  source,
}: {
  met: boolean;
  criterion: string;
  explanation?: string;
  source?: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        met
          ? 'border-success/20 bg-success-muted/25'
          : 'border-destructive/20 bg-destructive/5',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center',
          met ? 'text-success' : 'text-destructive',
        )}
      >
        {met ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-snug">{criterion}</p>
        {explanation && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{explanation}</p>
        )}
        {source && (
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">Based on: {source}</p>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 h-5 text-[10px] self-start font-medium',
          met
            ? 'border-success/35 text-success bg-success/10'
            : 'border-destructive/35 text-destructive bg-destructive/10',
        )}
      >
        {met ? 'Met' : 'Not met'}
      </Badge>
    </div>
  );
}

/** AI confidence badge — theme-aware */
export function AiConfidenceBadge({ confidence }: { confidence: number }) {
  const tier =
    confidence >= 90
      ? 'border-success/40 text-success bg-success/10'
      : confidence >= 75
        ? 'border-primary/40 text-primary bg-primary/10'
        : 'border-warning/40 text-warning bg-warning-muted/50';

  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] tabular-nums gap-1', tier)}>
      <Sparkles className="h-2.5 w-2.5" />
      {confidence}%
    </Badge>
  );
}

/** Theme-aware confidence progress bar */
export function ConfidenceBar({ value }: { value: number }) {
  const barColor =
    value >= 90
      ? 'bg-success'
      : value >= 75
        ? 'bg-primary'
        : value >= 60
          ? 'bg-warning'
          : 'bg-muted-foreground/40';
  const textColor =
    value >= 90
      ? 'text-success'
      : value >= 75
        ? 'text-primary'
        : value >= 60
          ? 'text-warning'
          : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className={cn('text-xs font-bold tabular-nums shrink-0 w-8 text-right', textColor)}>
        {value}%
      </span>
    </div>
  );
}

/** Form field label */
export function FieldLabel({
  label,
  required,
  hint,
  aiConfidence,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  aiConfidence?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {aiConfidence !== undefined && <AiConfidenceBadge confidence={aiConfidence} />}
      {hint && !aiConfidence && (
        <span className="text-[10px] text-muted-foreground/70">{hint}</span>
      )}
    </div>
  );
}

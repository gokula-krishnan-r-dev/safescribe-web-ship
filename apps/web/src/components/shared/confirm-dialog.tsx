'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Yes, continue',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      data-confirm-dialog
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="flex gap-4">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10',
              )}
            >
              <AlertTriangle
                className={cn('h-5 w-5', variant === 'destructive' ? 'text-destructive' : 'text-primary')}
              />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="shadow-none">
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading} className="min-w-[100px]">
            {loading ? 'Please wait...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    confirmLabel?: string;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const confirm = (opts: Omit<typeof state, 'open'>) =>
    new Promise<boolean>((resolve) => {
      setState({
        ...opts,
        open: true,
        onConfirm: () => {
          opts.onConfirm();
          setState((s) => ({ ...s, open: false }));
          resolve(true);
        },
      });
    });

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      onConfirm={state.onConfirm}
    />
  );

  return { confirm, dialog };
}

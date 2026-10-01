'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Loader2, Plus, X } from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const MAX_SCREENSHOTS = 8;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp';

type StagedShot = {
  id: string;
  file: File;
  url: string;
};

function isImageFile(file: File) {
  const type = file.type.toLowerCase();
  if (type.startsWith('image/')) {
    return type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg' || type === 'image/webp';
  }
  return /\.(png|jpe?g|webp)$/i.test(file.name);
}

function filesFromClipboard(event: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (!item.type.startsWith('image/')) continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    out.push(
      new File([blob], `screenshot-${Date.now()}-${out.length + 1}.${ext}`, {
        type: item.type || 'image/png',
      }),
    );
  }
  return out;
}

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `shot_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ScreenshotComposer({
  processing,
  onAnalyze,
  onCancel,
  emptyTitle = 'Paste screenshots',
  emptyHint = 'Press ⌘V / Ctrl+V, or add images from Netcare, PharmaNet, or Kroll.',
  processingDetail = 'Extracting unique medications. This usually takes a few seconds.',
  closeAriaLabel = 'Close screenshot composer',
  showClose = true,
}: {
  processing: boolean;
  onAnalyze: (files: File[], note: string) => void;
  onCancel: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  processingDetail?: string;
  closeAriaLabel?: string;
  showClose?: boolean;
}) {
  const inputId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const shotsRef = useRef<StagedShot[]>([]);
  const [shots, setShots] = useState<StagedShot[]>([]);
  const [note, setNote] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  shotsRef.current = shots;

  useEffect(() => {
    noteRef.current?.focus();
    return () => {
      for (const shot of shotsRef.current) URL.revokeObjectURL(shot.url);
    };
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length || processing) return;
    const prev = shotsRef.current;
    const remaining = MAX_SCREENSHOTS - prev.length;
    if (remaining <= 0) {
      toast.error(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
      return;
    }

    const accepted: StagedShot[] = [];
    let skippedType = false;
    let skippedSize = false;
    let truncated = false;

    for (const file of incoming) {
      if (accepted.length >= remaining) {
        truncated = true;
        break;
      }
      if (!isImageFile(file)) {
        skippedType = true;
        continue;
      }
      if (file.size > MAX_BYTES) {
        skippedSize = true;
        continue;
      }
      const duplicate = prev.some(
        (shot) => shot.file.name === file.name && shot.file.size === file.size,
      );
      if (duplicate) continue;
      accepted.push({ id: newId(), file, url: URL.createObjectURL(file) });
    }

    if (skippedType) toast.error('Use a PNG, JPG, or WebP screenshot.');
    if (skippedSize) toast.error('Each screenshot must be 10 MB or smaller.');
    if (truncated) toast.error(`You can attach up to ${MAX_SCREENSHOTS} screenshots.`);
    if (!accepted.length) return;

    setShots((current) => {
      const room = MAX_SCREENSHOTS - current.length;
      const take = accepted.slice(0, room);
      for (const extra of accepted.slice(room)) URL.revokeObjectURL(extra.url);
      const next = [...current, ...take];
      shotsRef.current = next;
      return next;
    });
  }, [processing]);

  const removeShot = (id: string) => {
    setShots((prev) => {
      const next = prev.filter((shot) => shot.id !== id);
      const removed = prev.find((shot) => shot.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      shotsRef.current = next;
      return next;
    });
    setPreviewId((current) => (current === id ? null : current));
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (processing) return;
      const images = filesFromClipboard(event);
      if (!images.length) return;

      const target = event.target as HTMLElement | null;
      const hostDialog = rootRef.current?.closest('[role="dialog"]') ?? null;
      const inComposer = Boolean(
        rootRef.current?.contains(target) || (hostDialog && target && hostDialog.contains(target)),
      );
      const nestedForeignDialog = Boolean(
        target?.closest('[role="dialog"]') &&
          hostDialog &&
          target.closest('[role="dialog"]') !== hostDialog,
      );
      const typing =
        Boolean(target) &&
        (target!.tagName === 'INPUT' ||
          target!.tagName === 'TEXTAREA' ||
          target!.isContentEditable);
      const hasText = Array.from(event.clipboardData?.types ?? []).some(
        (type) => type === 'text/plain' || type === 'text/html',
      );
      if (nestedForeignDialog) return;
      if (!inComposer && target?.closest('[role="dialog"]')) return;
      if (typing && hasText && !inComposer) return;

      event.preventDefault();
      addFiles(images);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles, processing]);

  const submit = () => {
    if (processing || !shots.length) return;
    onAnalyze(
      shots.map((shot) => shot.file),
      note.trim(),
    );
  };

  const preview = shots.find((shot) => shot.id === previewId) ?? null;
  const remaining = MAX_SCREENSHOTS - shots.length;

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-card shadow-[0_8px_28px_rgba(15,23,42,0.06)]',
        'border-border/80 focus-within:border-primary/35 focus-within:shadow-[0_8px_28px_rgba(15,118,110,0.10)]',
        dragOver && 'border-primary/50 bg-primary/[0.03]',
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!processing && remaining > 0) setDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (processing) return;
        addFiles(Array.from(event.dataTransfer.files ?? []));
      }}
    >
      {showClose ? (
      <button
        type="button"
        className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={onCancel}
        disabled={processing}
        aria-label={closeAriaLabel}
      >
        <X className="h-4 w-4" />
      </button>
      ) : null}

      {shots.length > 0 ? (
        <div className={cn('flex gap-2.5 overflow-x-auto px-3.5 pb-1 pt-3.5', showClose && 'pr-12')}>
          {shots.map((shot, index) => (
            <div key={shot.id} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPreviewId(shot.id)}
                className="block h-[72px] w-[72px] overflow-hidden rounded-2xl border border-border/70 bg-muted/40 shadow-sm ring-offset-background transition hover:ring-2 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-label={`Preview screenshot ${index + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.url}
                  alt=""
                  className="h-full w-full object-contain p-0.5"
                />
              </button>
              <button
                type="button"
                onClick={() => removeShot(shot.id)}
                disabled={processing}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm ring-2 ring-card transition hover:bg-zinc-700 disabled:opacity-50"
                aria-label={`Remove screenshot ${index + 1}`}
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn('px-4 pb-0.5 pt-3.5', showClose && 'pr-12')}>
          <p className="text-[13px] font-medium text-foreground">{emptyTitle}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{emptyHint}</p>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 pb-3 pt-2">
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={processing || remaining <= 0}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={processing || remaining <= 0}
          onClick={() => fileInputRef.current?.click()}
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          aria-label="Add screenshot"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
        </button>
        <input
          ref={noteRef}
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 240))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape' && !processing) onCancel();
          }}
          disabled={processing}
          placeholder={
            shots.length
              ? 'Optional note, then Extract Information'
              : 'Paste a screenshot, or type a short note'
          }
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={processing || !shots.length}
          onClick={submit}
          className={cn(
            'mb-0.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition',
            shots.length
              ? 'bg-primary hover:bg-primary/90'
              : 'bg-muted text-muted-foreground',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
          aria-label="Extract details from uploaded document"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          )}
          {processing ? 'Extracting…' : 'Extract details'}
        </button>
      </div>

      {processing ? (
        <div
          className="absolute inset-0 z-20 flex items-center gap-3 bg-card/85 px-4 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Reading {shots.length} screenshot{shots.length === 1 ? '' : 's'}…
            </p>
            <p className="text-[12px] text-muted-foreground">{processingDetail}</p>
          </div>
        </div>
      ) : null}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="max-w-4xl p-4 sm:p-5" hideCloseButton={false}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">Screenshot preview</DialogTitle>
            <DialogDescription>
              {preview ? preview.file.name : 'Attached screenshot'}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.file.name}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

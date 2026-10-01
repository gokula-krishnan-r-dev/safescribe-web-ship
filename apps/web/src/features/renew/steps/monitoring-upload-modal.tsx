'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, CloudUpload, Loader2, ClipboardPaste, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ScreenshotComposer } from './screenshot-composer';

const ACCEPTED = 'image/png,image/jpeg,image/jpg,application/pdf';
const MAX_BYTES = 20 * 1024 * 1024;

function validateFile(file: File): string | null {
  const type = file.type.toLowerCase();
  const okType =
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/jpg' ||
    type === 'application/pdf' ||
    /\.(png|jpe?g|pdf)$/i.test(file.name);
  if (!okType) return 'This file type is not supported. Upload a PDF, JPG or PNG.';
  if (file.size > MAX_BYTES) return 'File must be 20 MB or smaller.';
  return null;
}

export function MonitoringUploadModal({
  open,
  uploading,
  error,
  onClose,
  onFile,
  onAnalyzeScreenshots,
  onEnterManually,
}: {
  open: boolean;
  uploading?: boolean;
  error?: string | null;
  onClose: () => void;
  onFile: (file: File, sourceType: 'screenshot' | 'upload') => void;
  onAnalyzeScreenshots?: (files: File[], note: string) => void;
  onEnterManually: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<'options' | 'paste'>('options');
  const [localError, setLocalError] = useState<string | null>(null);
  const displayedError = localError ?? error;

  const acceptFile = useCallback(
    (file: File, sourceType: 'screenshot' | 'upload') => {
      const message = validateFile(file);
      if (message) {
        setLocalError(message);
        return;
      }
      setLocalError(null);
      onFile(file, sourceType);
    },
    [onFile],
  );

  useEffect(() => {
    if (!open) {
      setLocalError(null);
      setPanel('options');
      return;
    }
    if (panel !== 'options' || uploading) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const image = items.find((item) => item.type.startsWith('image/'));
      const file = image?.getAsFile();
      if (!file) {
        if (items.length) {
          setLocalError('Clipboard did not contain an image. Copy a screenshot and paste again.');
        }
        return;
      }
      event.preventDefault();
      acceptFile(file, 'screenshot');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, panel, uploading, acceptFile]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !uploading && onClose()}>
      <DialogContent className={cn('gap-5 p-6 sm:rounded-2xl', panel === 'paste' ? 'max-w-lg' : 'max-w-md')}>
        <DialogHeader className="pr-6">
          <DialogTitle>
            {panel === 'paste' ? 'Paste screenshot' : 'Add monitoring results'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'paste'
              ? 'Copy from Netcare or another source and press Ctrl + V (Windows) or Cmd + V (Mac).'
              : 'Paste a screenshot from Netcare or another source, upload a file, or enter values manually.'}
          </DialogDescription>
        </DialogHeader>

        {panel === 'paste' ? (
          <ScreenshotComposer
            processing={Boolean(uploading)}
            showClose={false}
            emptyTitle="Paste screenshots"
            emptyHint="Press Cmd + V or Ctrl + V. You can add more than one Netcare screenshot."
            processingDetail="Extracting monitoring values. Confirm them before they are saved."
            onCancel={() => {
              if (uploading) return;
              setPanel('options');
            }}
            onAnalyze={(files, note) => {
              if (onAnalyzeScreenshots) {
                onAnalyzeScreenshots(files, note);
                return;
              }
              const first = files[0];
              if (first) acceptFile(first, 'screenshot');
            }}
          />
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) acceptFile(file, 'upload');
              }}
            />

            <div className="space-y-2">
              <OptionButton
                icon={<ClipboardPaste className="h-4 w-4" />}
                title="Paste screenshot"
                description="Copy from Netcare or another source and press Ctrl + V (Windows) or Cmd + V (Mac)."
                disabled={uploading}
                onClick={() => {
                  setLocalError(null);
                  setPanel('paste');
                }}
              />
              <OptionButton
                icon={<CloudUpload className="h-4 w-4" />}
                title="Upload file"
                description="PDF, image (JPG, PNG) or screenshot."
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              />
              <OptionButton
                icon={<Pencil className="h-4 w-4" />}
                title="Enter manually"
                description="Type results in manually."
                disabled={uploading}
                onClick={onEnterManually}
              />
            </div>
          </>
        )}

        {uploading && panel === 'options' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extracting candidate results…
          </p>
        ) : null}
        {displayedError ? <p className="text-sm text-amber-800">{displayedError}</p> : null}
        {panel === 'options' ? (
          <p className="text-xs leading-relaxed text-[#7a8b94]">
            After a successful paste or upload, extracted results appear in the table for pharmacist review.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (panel === 'paste' && !uploading) {
                setPanel('options');
                return;
              }
              onClose();
            }}
            disabled={uploading}
            className="h-10 px-4"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionButton({
  icon,
  title,
  description,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-[#d7e2e6] bg-white px-4 py-3 text-left transition-colors',
        'hover:border-[#0F6F6B]/40 hover:bg-[#0F6F6B]/[0.03]',
        'disabled:pointer-events-none disabled:opacity-60',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F6F6B]/10 text-[#0F6F6B]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#163447]">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[#5b6b75]">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#98a2b3]" aria-hidden />
    </button>
  );
}

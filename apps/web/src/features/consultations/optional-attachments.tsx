'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { api } from '@/lib/api-client';
import type { ConsultationAttachment } from './types';
import { useDeleteAttachment, useUploadAttachments } from './hooks';
import { isEditablePasteTarget } from './lab-clipboard';

const MAX_ATTACHMENTS = 5;
const MAX_FILE_MB = 8;
const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif';

interface Props {
  consultationId: string;
  attachments: ConsultationAttachment[];
  disabled?: boolean;
  /**
   * `panel` — legacy expandable upload card.
   * `composer` — compact thumbnails only (toolbar trigger lives in the notes composer).
   */
  mode?: 'panel' | 'composer';
  /** Composer mode: register open/busy actions for the parent toolbar button. */
  onRegisterActions?: (actions: { openFilePicker: () => void; busy: boolean } | null) => void;
}

function filePath(consultationId: string, att: ConsultationAttachment) {
  if (att.fileUrl?.includes(`/attachments/${att.id}/file`)) {
    return att.fileUrl.startsWith('/') ? att.fileUrl : `/${att.fileUrl}`;
  }
  return `/consultations/${consultationId}/attachments/${att.id}/file`;
}

function useAuthenticatedImageUrl(consultationId: string, att: ConsultationAttachment | null) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!att) {
      setSrc(null);
      setFailed(false);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const blob = await api.download(filePath(consultationId, att));
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) {
          setSrc(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [consultationId, att?.id, att?.fileUrl, att?.uploadedAt]);

  return { src, failed };
}

function AttachmentThumb({
  consultationId,
  att,
  disabled,
  busy,
  removing,
  onPreview,
  onRemove,
}: {
  consultationId: string;
  att: ConsultationAttachment;
  disabled?: boolean;
  busy: boolean;
  removing: boolean;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { src, failed } = useAuthenticatedImageUrl(consultationId, att);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border/70 bg-muted/40">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onPreview}
        aria-label={`Preview ${att.fileName}`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={att.fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center">
            {failed ? (
              <span className="text-[10px] text-muted-foreground">Preview unavailable</span>
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <span className="line-clamp-2 text-[10px] text-muted-foreground">{att.fileName}</span>
          </div>
        )}
      </button>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={onRemove}
        className={cn(
          'absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg',
          'bg-background/90 text-destructive shadow-sm border border-border/60',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
        )}
        aria-label={`Remove ${att.fileName}`}
      >
        {removing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function PreviewLightbox({
  consultationId,
  preview,
  onClose,
}: {
  consultationId: string;
  preview: ConsultationAttachment;
  onClose: () => void;
}) {
  const { src, failed } = useAuthenticatedImageUrl(consultationId, preview);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Photo preview"
    >
      <div
        className="relative max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <p className="truncate text-sm font-medium">{preview.fileName}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={preview.fileName}
            className="max-h-[75vh] w-full object-contain bg-black/40"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            {failed ? 'Could not load this photo.' : <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
        )}
      </div>
    </div>
  );
}

export function OptionalAttachments({
  consultationId,
  attachments,
  disabled,
  mode = 'panel',
  onRegisterActions,
}: Props) {
  const list = Array.isArray(attachments) ? attachments : [];
  const isComposer = mode === 'composer';
  const [open, setOpen] = useState(list.length > 0);
  const [preview, setPreview] = useState<ConsultationAttachment | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const upload = useUploadAttachments(consultationId);
  const remove = useDeleteAttachment(consultationId);

  const remaining = MAX_ATTACHMENTS - list.length;
  const busy = upload.isPending || remove.isPending;

  useEffect(() => {
    if (!isComposer || !onRegisterActions) return;
    onRegisterActions({
      openFilePicker: () => inputRef.current?.click(),
      busy,
    });
    return () => onRegisterActions(null);
  }, [isComposer, onRegisterActions, busy]);

  const handleFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || disabled) return;
      const files = Array.from(fileList);
      if (!files.length) return;
      if (files.length > remaining) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} photos (${remaining} remaining).`);
        return;
      }
      for (const f of files) {
        if (!f.type.startsWith('image/')) {
          toast.error(`"${f.name}" is not an image.`);
          return;
        }
        if (f.size > MAX_FILE_MB * 1024 * 1024) {
          toast.error(`"${f.name}" is larger than ${MAX_FILE_MB} MB.`);
          return;
        }
      }
      try {
        await upload.mutateAsync(files);
        toast.success(files.length === 1 ? 'Photo attached.' : `${files.length} photos attached.`);
        setOpen(true);
      } catch (err) {
        toastError(err, 'Could not attach photos');
      } finally {
        if (inputRef.current) inputRef.current.value = '';
        if (cameraRef.current) cameraRef.current.value = '';
      }
    },
    [disabled, remaining, upload],
  );

  const handleRemove = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success('Photo removed.');
      if (preview?.id === id) setPreview(null);
    } catch (err) {
      toastError(err, 'Could not remove photo');
    }
  };

  const extractImagesFromClipboard = useCallback((e: ClipboardEvent): File[] => {
    const out: File[] = [];
    const items = e.clipboardData?.items;
    if (!items) return out;
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const name =
        blob.name && blob.name !== 'image.png'
          ? blob.name
          : `pasted-${Date.now()}.${ext}`;
      out.push(new File([blob], name, { type: item.type }));
    }
    return out;
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (disabled || remaining <= 0) return;
      const images = extractImagesFromClipboard(e);
      if (!images.length) return;

      const typing = isEditablePasteTarget(e.target);
      if (typing) return;

      e.preventDefault();
      setOpen(true);
      void handleFiles(images);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, remaining, extractImagesFromClipboard, handleFiles]);

  useEffect(() => {
    if (!open || disabled || remaining <= 0) return;
    setPasteHint(true);
    const t = window.setTimeout(() => setPasteHint(false), 4000);
    return () => window.clearTimeout(t);
  }, [open, disabled, remaining, list.length]);

  const fileInputs = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </>
  );

  if (isComposer) {
    return (
      <div ref={panelRef}>
        {fileInputs}
        {list.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {list.map((att) => (
              <AttachmentThumb
                key={att.id}
                consultationId={consultationId}
                att={att}
                disabled={disabled}
                busy={busy}
                removing={remove.isPending}
                onPreview={() => setPreview(att)}
                onRemove={() => handleRemove(att.id)}
              />
            ))}
          </div>
        )}
        {preview && (
          <PreviewLightbox
            consultationId={consultationId}
            preview={preview}
            onClose={() => setPreview(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={panelRef} className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Optional attachments</p>
            <p className="text-[11px] text-muted-foreground">
              Clinical photos · used to suggest the pathway · up to {MAX_ATTACHMENTS}
              {list.length > 0 && (
                <span className="ml-1 tabular-nums text-foreground/80">· {list.length} attached</span>
              )}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          className={cn(
            'space-y-3 border-t border-border/60 px-3.5 py-3 transition-colors',
            dragOver && 'bg-primary/5',
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled && remaining > 0) setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled || remaining <= 0) return;
            void handleFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg"
              disabled={disabled || busy || remaining <= 0}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="h-3.5 w-3.5" />
              )}
              Add photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg"
              disabled={disabled || busy || remaining <= 0}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-3.5 w-3.5" />
              Take photo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-muted-foreground"
              disabled={disabled || busy || remaining <= 0}
              onClick={() => {
                toast.message('Copy an image, then press ⌘V / Ctrl+V to paste it here.');
                setPasteHint(true);
              }}
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              Paste
            </Button>
            {fileInputs}
            {remaining <= 0 && (
              <p className="w-full text-xs text-muted-foreground">
                Maximum of {MAX_ATTACHMENTS} photos reached.
              </p>
            )}
            {pasteHint && remaining > 0 && (
              <p className="w-full text-xs text-muted-foreground">
                Tip: paste (⌘V / Ctrl+V) or drag & drop images into this panel.
              </p>
            )}
          </div>

          {list.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {list.map((att) => (
                <AttachmentThumb
                  key={att.id}
                  consultationId={consultationId}
                  att={att}
                  disabled={disabled}
                  busy={busy}
                  removing={remove.isPending}
                  onPreview={() => setPreview(att)}
                  onRemove={() => handleRemove(att.id)}
                />
              ))}

              {remaining > 0 && (
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    'aspect-square rounded-xl border-2 border-dashed border-border/80',
                    'flex flex-col items-center justify-center gap-1 text-muted-foreground',
                    'hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors',
                  )}
                >
                  <ImagePlus className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Add</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80',
                'px-4 py-8 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors',
                dragOver && 'border-primary/50 bg-primary/5 text-primary',
              )}
            >
              <Camera className="h-7 w-7 opacity-70" />
              <div className="text-center">
                <p className="text-sm font-medium">Attach a clinical photo</p>
                <p className="text-xs mt-0.5 opacity-80">
                  e.g. cold sore on the lip — used to suggest the pathway
                </p>
                <p className="text-xs mt-1 opacity-70">
                  JPG, PNG or WebP · max {MAX_FILE_MB} MB · up to {MAX_ATTACHMENTS}
                </p>
                <p className="text-xs mt-1 opacity-70">Paste · drag & drop · or browse</p>
              </div>
            </button>
          )}
        </div>
      )}

      {preview && (
        <PreviewLightbox
          consultationId={consultationId}
          preview={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

export const CLINICAL_PHOTO_LIMIT = MAX_ATTACHMENTS;

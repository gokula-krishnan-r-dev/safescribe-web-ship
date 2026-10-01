'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from '@/lib/notify';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { optimizeBrandingImage, type BrandingImageKind } from './optimize-branding-image';

interface BrandingImageCardProps {
  kind: BrandingImageKind;
  title: string;
  description: string;
  filePath: string;
  uploadPath: string;
  hasImage?: boolean;
  onChanged?: () => void;
  embedded?: boolean;
}

export function BrandingImageCard({
  kind,
  title,
  description,
  filePath,
  uploadPath,
  hasImage,
  onChanged,
  embedded = false,
}: BrandingImageCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const blob = await api.download(filePath);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [filePath, hasImage]);

  const handleSelect = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const optimized = await optimizeBrandingImage(file, kind);
      const form = new FormData();
      form.append('file', optimized);
      await api.upload(uploadPath, form);
      const blob = await api.download(filePath);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      toast.success(kind === 'signature' ? 'Signature saved' : 'Pharmacy logo saved');
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not upload that image'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(uploadPath);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      toast.success(kind === 'signature' ? 'Signature removed' : 'Pharmacy logo removed');
      onChanged?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove that image'));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-4">
      <div
        className={
          kind === 'signature'
            ? 'flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] px-6 py-4'
            : 'flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-4'
        }
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={title}
            className={
              kind === 'signature'
                ? 'max-h-20 w-auto max-w-full object-contain'
                : 'max-h-24 w-auto max-w-[220px] object-contain'
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {kind === 'signature' ? 'No signature uploaded yet' : 'No logo uploaded yet'}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => void handleSelect(e.target.files?.[0])}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {previewUrl ? 'Replace image' : 'Upload image'}
        </Button>
        {previewUrl ? (
          <Button type="button" variant="outline" onClick={() => void handleRemove()} disabled={busy}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        PNG or JPEG, up to 2 MB. Transparent PNG works best for signatures.
      </p>
    </div>
  );

  if (embedded) {
    return (
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ImageIcon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{description}</p>
        {body}
      </div>
    );
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

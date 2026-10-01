'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { INTAKE_COPY, PRIVACY_POLICY_URL } from './intake-copy';
import type { TemporaryTranscriptTurn } from '@safescript/shared';

export function HowThisWorksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{INTAKE_COPY.howThisWorks}</DialogTitle>
          <DialogDescription>
            Capture broadly. Extract minimally. Let the pharmacist review once.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-[#4b5563]">
          {INTAKE_COPY.howThisWorksBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function PrivacyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{INTAKE_COPY.privacyTitle}</DialogTitle>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-[#4b5563]">
          {INTAKE_COPY.privacyBullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <a
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Learn more
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TranscriptDialog({
  open,
  onOpenChange,
  turns,
  fallbackText,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turns: TemporaryTranscriptTurn[];
  fallbackText?: string;
  onInsert: (text: string) => void;
}) {
  const [selection, setSelection] = useState('');

  useEffect(() => {
    if (!open) setSelection('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/25 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-[#d5dee2] bg-white p-5 shadow-[-12px_0_40px_rgba(15,23,42,0.12)] outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-[16px] font-semibold text-[#10233d]">
                Full transcript
              </DialogTitle>
              <DialogDescription className="text-[12.5px] leading-relaxed">
                {INTAKE_COPY.transcriptNotice}
              </DialogDescription>
            </DialogHeader>
            <DialogClose className="rounded-sm p-1 text-[#6b7280] opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <div
            className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-[12px] border border-[#e5ecee] bg-[#f8fafb] px-4 py-3 text-sm leading-relaxed"
            onMouseUp={() => setSelection(window.getSelection()?.toString() ?? '')}
          >
            {turns.length ? (
              <div className="space-y-3">
                {turns.map((turn, idx) => (
                  <p key={`${turn.timestamp ?? idx}-${turn.text}`}>
                    {turn.timestamp ? (
                      <span className="mr-2 font-mono text-[11px] text-[#9ca3af]">
                        {turn.timestamp}
                      </span>
                    ) : null}
                    <span className="font-semibold text-[#0f4f63]">
                      {turn.speaker === 'patient' ? 'Patient' : 'Pharmacist'}:
                    </span>{' '}
                    <span className="text-[#1f2937]">{turn.text}</span>
                  </p>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[#1f2937]">{fallbackText}</p>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!selection.trim()}
              onClick={() => {
                onInsert(selection.trim());
                onOpenChange(false);
              }}
            >
              Insert selected text
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

export function MicPairingDialog({
  open,
  onOpenChange,
  pairingUrl,
  expiresAt,
  connecting,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pairingUrl?: string | null;
  expiresAt?: string | null;
  connecting?: boolean;
  onRefresh: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!pairingUrl) {
      setQr(null);
      return;
    }
    void QRCode.toDataURL(pairingUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#0f4f63', light: '#ffffff' },
    }).then(setQr);
  }, [pairingUrl]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const remaining = useMemo(() => {
    if (!expiresAt) return 90;
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  }, [expiresAt, now]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{INTAKE_COPY.micTitle}</DialogTitle>
          <DialogDescription>{INTAKE_COPY.micBody}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl border border-[#d5dee2] bg-white p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="SafeScribe Mic pairing QR code" width={200} height={200} />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <p className="text-xs text-[#6b7280]">
            Code expires in {mm}:{ss}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="outline" disabled={connecting} onClick={onRefresh}>
            <RefreshCw className={connecting ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

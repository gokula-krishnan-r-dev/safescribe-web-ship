'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ShieldPlus } from 'lucide-react';
import {
  PROFESSIONAL_ACK_BODY,
  PROFESSIONAL_ACK_HEADING,
  type ProfessionalAcknowledgementStatus,
} from '@safescript/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  copy: Pick<ProfessionalAcknowledgementStatus, 'heading' | 'body'>;
  saving: boolean;
  error: string | null;
  onAcknowledge: () => void;
  onSignOut: () => void;
}

export function ProfessionalUseAcknowledgementModal({
  copy,
  saving,
  error,
  onAcknowledge,
  onSignOut,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const heading = copy.heading || PROFESSIONAL_ACK_HEADING;
  const body = copy.body || PROFESSIONAL_ACK_BODY;
  const busy = saving || signOutBusy;

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        hideCloseButton
        overlayClassName="bg-black/45 backdrop-blur-[2px]"
        className="w-[calc(100%-2rem)] max-w-[640px] border-0 bg-transparent p-0 shadow-none sm:rounded-none"
        aria-describedby="professional-ack-copy"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus();
        }}
      >
        <div className="rounded-2xl bg-white px-6 py-8 shadow-[0_24px_60px_rgba(15,42,68,0.18)] sm:px-10 sm:py-9">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#1A9B8E] text-white shadow-sm">
            <ShieldPlus className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <DialogTitle asChild>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-center text-[22px] font-semibold tracking-tight text-[#0F2A44] outline-none sm:text-2xl"
            >
              {heading}
            </h1>
          </DialogTitle>
          <DialogDescription asChild>
            <p
              id="professional-ack-copy"
              className="mt-5 rounded-xl border border-[#C9E0E4] bg-[#EAF6F8] px-5 py-4 text-center text-base leading-[1.55] text-[#0F2A44] sm:text-[17px] sm:leading-[1.6]"
            >
              {body}
            </p>
          </DialogDescription>

          <div
            aria-live="polite"
            className="min-h-6 pt-3 text-center text-sm text-destructive"
          >
            {error ? error : saving ? 'Saving…' : null}
          </div>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              className="order-1 min-h-11 rounded-lg bg-[#0F6F6B] px-5 text-[15px] font-semibold text-white hover:bg-[#0C5C59] sm:order-2"
              disabled={busy}
              onClick={onAcknowledge}
            >
              {saving ? 'Saving…' : 'Acknowledge and continue'}
            </Button>
            <button
              type="button"
              className={cn(
                'order-2 min-h-11 rounded-md px-2 text-[15px] font-medium text-[#2B7BB5] transition-colors',
                'hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:opacity-50 sm:order-1',
              )}
              disabled={busy}
              onClick={() => {
                setSignOutBusy(true);
                onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-[13px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            Terms of use
          </Link>
          <span className="px-2 text-white/50" aria-hidden>
            ·
          </span>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            Privacy
          </Link>
        </p>
      </DialogContent>
    </Dialog>
  );
}

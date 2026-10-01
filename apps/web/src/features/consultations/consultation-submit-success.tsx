'use client';

import { CheckCircle, Loader2 } from 'lucide-react';

interface Props {
  consultationRef: string;
  startingNext?: boolean;
}

/** Shown after a consultation is locked — then the wizard opens a fresh consult. */
export function ConsultationSubmitSuccess({ consultationRef, startingNext }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-5">
      <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center shadow-lg shadow-emerald-100">
        {startingNext ? (
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        ) : (
          <CheckCircle className="h-10 w-10 text-emerald-600" />
        )}
      </div>
      <div className="text-center max-w-md">
        <h2 className="text-xl font-bold text-foreground">Consultation Finished</h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          {startingNext
            ? 'Locked and saved. Starting a new consultation…'
            : 'This consultation is now locked and saved.'}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted/60 border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Reference</span>
          <span className="font-mono font-semibold text-sm">{consultationRef}</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Lock } from 'lucide-react';
import {
  ClinicalPrimaryButton,
  ClinicalSecondaryButton,
} from '@/features/consultations/clinical-ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function RenewPlaceholderStep({
  title,
  description,
  onBack,
  backLabel,
  onNext,
  nextLabel,
  canContinue,
}: {
  title: string;
  description: string;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  canContinue?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-16 text-center">
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          This step will be available in a later release. Step 1 medication capture is ready to use.
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
        {onBack ? (
          <ClinicalSecondaryButton onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            {backLabel ?? 'Back'}
          </ClinicalSecondaryButton>
        ) : (
          <span />
        )}
        {onNext && canContinue ? (
          <ClinicalPrimaryButton onClick={onNext}>
            {nextLabel ?? 'Continue'}
            <ChevronRight className="h-4 w-4" />
          </ClinicalPrimaryButton>
        ) : null}
      </div>
    </div>
  );
}

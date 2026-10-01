import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { ProfessionalUseAcknowledgementGate } from '@/features/professional-acknowledgement/professional-use-acknowledgement-gate';

export const metadata: Metadata = {
  title: 'Professional use acknowledgement',
  description:
    'Acknowledge professional responsibility before using SafeScribe for clinical decision-making and documentation.',
  robots: { index: false, follow: false },
};

function GateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export default function ProfessionalUseAcknowledgementPage() {
  return (
    <Suspense fallback={<GateFallback />}>
      <ProfessionalUseAcknowledgementGate />
    </Suspense>
  );
}

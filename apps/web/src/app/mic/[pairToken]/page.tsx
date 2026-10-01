import type { Metadata } from 'next';
import { MicCompanionClient } from '@/features/consultations/mic/mic-companion-client';

export const metadata: Metadata = {
  title: 'SafeScribe Mic',
  description: 'Use this phone as the microphone for SafeScribe.',
  robots: { index: false, follow: false },
  other: {
    referrer: 'no-referrer',
  },
};

export default async function MicPairPage({
  params,
}: {
  params: Promise<{ pairToken: string }>;
}) {
  const { pairToken } = await params;
  return <MicCompanionClient pairToken={pairToken} />;
}

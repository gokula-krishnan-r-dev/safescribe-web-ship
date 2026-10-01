import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { privateRobots } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Safety & Privacy',
  robots: privateRobots,
};

export default function SafetyPrivacyPage() {
  permanentRedirect('/privacy');
}

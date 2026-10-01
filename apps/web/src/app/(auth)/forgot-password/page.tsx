import type { Metadata } from 'next';
import { MarketingShell } from '@/components/safescribe/marketing-shell';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <MarketingShell>
      <ForgotPasswordForm />
    </MarketingShell>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const schema = z.object({ email: z.string().email('Please enter a valid email address') });

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', data);
      setSent(true);
      toast.success('Check your email for password reset instructions', { announce: true });
    } catch {
      toast.error('Could not send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ss-login-card mx-auto">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[#06244A]">Reset your password</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-[#60738E]">
        {sent
          ? 'If we found an account with that email, we have sent a reset link. The new password will work for SafeScribe sign-in, including if you use the same details as PhIX.'
          : 'Enter the email you use to sign in. This resets the same account password used for SafeScribe — including if you log in with your PhIX details.'}
      </p>

      {sent ? null : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-6 space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[13.5px] font-medium text-[#17385D]">
              Email
            </label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7A90A8]"
                aria-hidden
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Enter your email"
                disabled={loading}
                className={cn('ss-login-input pl-11', errors.email && 'border-[#E8A0A4]')}
                {...register('email')}
              />
            </div>
            {errors.email ? (
              <p className="text-[12.5px] text-[#B4232A]">{errors.email.message}</p>
            ) : null}
          </div>
          <button type="submit" disabled={loading} className="ss-login-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-2 text-[13.5px] font-medium text-[#087DB5] hover:text-[#066A9A]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to log in
      </Link>
    </div>
  );
}

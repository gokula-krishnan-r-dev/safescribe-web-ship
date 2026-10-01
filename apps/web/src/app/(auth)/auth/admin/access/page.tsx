'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Loader2, ShieldCheck, Lock, Building2, FlaskConical } from 'lucide-react';
import {
  LOGIN_CHANNELS,
  ROLES,
} from '@safescript/shared';
import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import { rememberIpAccessDenied } from '@/lib/ip-access-denied';
import { resolvePostLoginPath } from '@/features/super-admin-portal/portal';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

/**
 * Exclusive Super Admin sign-in. Pharmacy workspace logins cannot use this channel,
 * and Super Admin credentials are rejected on `/login`.
 */
export default function SuperAdminAccessPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password, data.rememberMe, LOGIN_CHANNELS.SUPER_ADMIN_ACCESS);
      const user = useAuthStore.getState().user;

      if (!user || user.role !== ROLES.SUPER_ADMIN) {
        api.clearTokens();
        useAuthStore.setState({ user: null, isAuthenticated: false, email2fa: null });
        toast.error('This page is reserved for platform administrators.');
        return;
      }

      router.push(resolvePostLoginPath(undefined, user?.superAdminScope));
      toast.success('Welcome back, Platform Admin', { announce: true });
    } catch (err: unknown) {
      const error = err as {
        message?: string | string[];
        error?: string;
        ipAddress?: string;
      };
      if (error.error === 'IP_ACCESS_DENIED') {
        rememberIpAccessDenied(error);
        api.clearTokens();
        useAuthStore.setState({ user: null, isAuthenticated: false });
        router.replace('/access-denied');
        return;
      }
      if (error.error === 'ADMIN_ACCESS_RESTRICTED') {
        const message = Array.isArray(error.message)
          ? error.message[0]
          : error.message ||
            'Use the pharmacy workspace login for pharmacist accounts.';
        toast.error(message);
        return;
      }
      const message =
        error.message || 'Email or password is incorrect. Please try again.';
      toast.error(Array.isArray(message) ? message[0] : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0B1520] text-white">
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 15% 20%, rgba(0,140,164,0.28), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 80%, rgba(15,118,110,0.18), transparent 50%), linear-gradient(160deg, #0B1520 0%, #102033 45%, #0B1520 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        aria-hidden
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center lg:gap-16 lg:px-8">
        {/* Brand panel */}
        <div className="mx-auto w-full max-w-md lg:mx-0 lg:flex-1">
          <div className="mb-8 flex items-center gap-3">
            <BrandMark size="md" priority />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7DD3C7]">
                SafeScribe
              </p>
              <p className="text-sm text-white/55">Platform control plane</p>
            </div>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Administrator access
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/65">
            Restricted sign-in for platform operators. Manage pharmacy tenants and the clinical
            platform from a single authenticated session.
          </p>

          <div className="mt-8 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <FeatureChip
              icon={Building2}
              title="Pharmacy Management"
              detail="Tenants, admins, activity"
            />
            <FeatureChip
              icon={FlaskConical}
              title="Clinical Platform"
              detail="Pathways, safety, assist"
            />
          </div>

          <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-white/40">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Super Admin accounts cannot authenticate through the pharmacy workspace login.
          </p>
        </div>

        {/* Form card */}
        <div className="mx-auto w-full max-w-[420px] lg:mx-0">
          <div
            className={cn(
              'rounded-2xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl shadow-black/40 backdrop-blur-md',
              'sm:p-8',
            )}
          >
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#008CA4]/15 text-[#7DD3C7] ring-1 ring-[#008CA4]/30">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7DD3C7]">
                  Restricted
                </p>
                <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-white">
                  Sign in
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  Use your platform administrator credentials.
                </p>
              </div>
            </div>

            <form
              method="post"
              action="#"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(onSubmit)(e);
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-white/80">
                  Email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@safescribe.ca"
                  className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-[#008CA4] focus-visible:ring-[#008CA4]/30"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-sm text-red-300">{errors.email.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password" className="text-white/80">
                  Password
                </Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-[#008CA4] focus-visible:ring-[#008CA4]/30"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="text-sm text-red-300">{errors.password.message}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 pt-0.5">
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    {...register('rememberMe')}
                    className="rounded border-white/30 bg-white/10"
                  />
                  Remember me
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-[#7DD3C7] hover:text-[#A5E4DC]"
                >
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="mt-2 h-11 w-full bg-[#008CA4] text-base font-semibold text-white hover:bg-[#007A8F]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Sign in as Platform Admin
              </Button>
            </form>

            <p className="mt-6 border-t border-white/10 pt-4 text-center text-sm text-white/45">
              Pharmacist or Pharmacy Admin?{' '}
              <Link href="/login" className="font-medium text-[#7DD3C7] hover:text-[#A5E4DC]">
                Pharmacy workspace login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureChip({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Building2;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[#7DD3C7]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-white/90">{title}</p>
        <p className="text-xs text-white/45">{detail}</p>
      </div>
    </div>
  );
}

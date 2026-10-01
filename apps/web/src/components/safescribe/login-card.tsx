'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import {
  CONTACT_TOPICS,
  LOGIN_CHANNELS,
  LOGIN_UI,
  ROLES,
  mapPharmacyLoginError,
  professionalAckDefaultReturnTo,
  professionalAckHref,
} from '@safescript/shared';
import { BrandLockup } from '@/components/safescribe/brand-lockup';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import { rememberIpAccessDenied } from '@/lib/ip-access-denied';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, LOGIN_UI.emailRequired)
    .email(LOGIN_UI.emailInvalid),
  password: z.string().min(1, LOGIN_UI.passwordRequired),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginCard({
  showHeading = false,
  showRequestAccess = true,
}: {
  showHeading?: boolean;
  showRequestAccess?: boolean;
}) {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const email2fa = useAuthStore((s) => s.email2fa);
  const clearEmail2fa = useAuthStore((s) => s.clearEmail2fa);
  const resendLoginEmail = useAuthStore((s) => s.resendLoginEmail);
  const formId = useId();
  const emailErrorId = `${formId}-email-error`;
  const passwordErrorId = `${formId}-password-error`;
  const formErrorId = `${formId}-form-error`;
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
    shouldFocusError: true,
  });
  const emailValue = watch('email');

  useEffect(() => {
    setTenantOptions([]);
    setSelectedTenantId('');
  }, [emailValue]);

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setFormError(null);
    try {
      const result = await login(
        data.email,
        data.password,
        data.rememberMe,
        LOGIN_CHANNELS.PHARMACY,
        selectedTenantId || undefined,
      );
      if (result === 'email_2fa') {
        toast.success('Verification email sent', { announce: true });
        return;
      }
      const user = useAuthStore.getState().user;
      if (user?.role === ROLES.SUPER_ADMIN) {
        api.clearTokens();
        useAuthStore.setState({ user: null, isAuthenticated: false });
        setFormError(
          'Platform administrator accounts must sign in through the dedicated admin access page.',
        );
        return;
      }
      if (user?.role === ROLES.PHARMACIST_ADMIN) {
        router.push(professionalAckHref(undefined, undefined, ROLES.PHARMACIST_ADMIN));
      } else if (user?.role === ROLES.PHARMACIST) {
        router.push(professionalAckHref(professionalAckDefaultReturnTo(ROLES.PHARMACIST)));
      } else {
        router.push(professionalAckDefaultReturnTo(ROLES.PHARMACIST));
      }
      toast.success('Welcome back!', { announce: true });
    } catch (err: unknown) {
      const mapped = mapPharmacyLoginError(err);
      if (mapped.kind === 'access-denied') {
        rememberIpAccessDenied(err);
        api.clearTokens();
        useAuthStore.setState({ user: null, isAuthenticated: false });
        router.replace('/access-denied');
        return;
      }
      if (mapped.kind === 'select-tenant') {
        setTenantOptions(mapped.tenants);
        setSelectedTenantId(mapped.tenants[0]?.id ?? '');
        setFormError(mapped.message);
        return;
      }
      setFormError(mapped.message);
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setResending(true);
    setFormError(null);
    try {
      await resendLoginEmail();
      toast.success(LOGIN_UI.email2faResent, { announce: true });
    } catch (err: unknown) {
      const mapped = mapPharmacyLoginError(err);
      if (mapped.kind === 'email-2fa-cooldown' || mapped.kind === 'message') {
        setFormError(mapped.message);
      } else if (mapped.kind === 'select-tenant') {
        setFormError(mapped.message);
      } else {
        setFormError(LOGIN_UI.email2faInvalid);
      }
    } finally {
      setResending(false);
    }
  };

  const emailInvalid = Boolean(errors.email);
  const passwordInvalid = Boolean(errors.password);
  const linkClass =
    'font-semibold text-[#087DB5] hover:text-[#066A9A] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087DB5]/40';

  if (email2fa) {
    return (
      <div className="ss-login-card">
        <div className="ss-login-brand">
          <BrandLockup variant="card" priority />
        </div>
        <div className="mt-5 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F5FA]">
            <Mail className="h-6 w-6 text-[#087DB5]" aria-hidden />
          </div>
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#06244A]">
            {LOGIN_UI.email2faTitle}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[#60738E]">
            {LOGIN_UI.email2faBody.replace('{email}', email2fa.emailMasked)}
          </p>
        </div>

        {formError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-[#FDECEC] px-3 py-2.5 text-[13px] leading-snug text-[#B4232A]"
          >
            {formError}
          </p>
        ) : null}

        <p className="mt-4 text-center text-[13px] text-[#60738E]">{LOGIN_UI.email2faWaiting}</p>

        <button
          type="button"
          disabled={resending}
          onClick={() => void onResend()}
          className="ss-login-submit mt-4"
        >
          {resending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {resending ? LOGIN_UI.email2faResending : LOGIN_UI.email2faResend}
        </button>

        <button
          type="button"
          onClick={() => {
            clearEmail2fa();
            setFormError(null);
          }}
          className={cn(linkClass, 'mt-4 block w-full text-center text-[13.5px]')}
        >
          {LOGIN_UI.email2faBack}
        </button>
      </div>
    );
  }

  return (
    <div className="ss-login-card">
      <div className="ss-login-brand">
        <BrandLockup variant="card" priority />
      </div>

      {showHeading ? (
        <div className="mt-5 text-center">
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[#06244A]">
            {LOGIN_UI.title}
          </h2>
          <p className="mt-1.5 text-[14px] text-[#60738E]">{LOGIN_UI.subtitle}</p>
        </div>
      ) : null}

      {LOGIN_UI.showPhixCredentialHint ? <PhixCredentialHint /> : null}

      <form
        method="post"
        action="#"
        noValidate
        aria-busy={loading}
        aria-describedby={formError ? formErrorId : undefined}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSubmit)(e);
        }}
        className="ss-login-form"
      >
        {formError ? (
          <p
            id={formErrorId}
            role="alert"
            className="rounded-lg bg-[#FDECEC] px-3 py-2.5 text-[13px] leading-snug text-[#B4232A]"
          >
            {formError}
          </p>
        ) : null}

        <div className="ss-form-field">
          <label htmlFor={`${formId}-email`} className="ss-login-label">
            {LOGIN_UI.email}
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7A90A8]"
              aria-hidden
            />
            <input
              id={`${formId}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={LOGIN_UI.emailPlaceholder}
              disabled={loading}
              aria-invalid={emailInvalid}
              aria-describedby={emailInvalid ? emailErrorId : undefined}
              className={cn('ss-login-input', emailInvalid && 'ss-login-input-error')}
              {...register('email')}
            />
          </div>
          {errors.email ? (
            <p id={emailErrorId} role="alert" className="text-[12.5px] text-[#B4232A]">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="ss-form-field">
          <label htmlFor={`${formId}-password`} className="ss-login-label">
            {LOGIN_UI.password}
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#7A90A8]"
              aria-hidden
            />
            <input
              id={`${formId}-password`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={LOGIN_UI.passwordPlaceholder}
              disabled={loading}
              aria-invalid={passwordInvalid}
              aria-describedby={passwordInvalid ? passwordErrorId : undefined}
              className={cn('ss-login-input', passwordInvalid && 'ss-login-input-error')}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="ss-login-reveal"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          {errors.password ? (
            <p id={passwordErrorId} role="alert" className="text-[12.5px] text-[#B4232A]">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {tenantOptions.length > 1 ? (
          <div className="ss-form-field">
            <label htmlFor={`${formId}-tenant`} className="ss-login-label">
              {LOGIN_UI.selectPharmacyLabel}
            </label>
            <select
              id={`${formId}-tenant`}
              value={selectedTenantId}
              disabled={loading}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="ss-login-input px-3.5"
            >
              {tenantOptions.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="ss-login-meta">
          <label className="ss-login-remember">
            <input
              type="checkbox"
              disabled={loading}
              className="ss-login-remember-input"
              {...register('rememberMe')}
            />
            {LOGIN_UI.remember}
          </label>
          <Link href="/forgot-password" className={cn(linkClass, 'ss-login-forgot')}>
            {LOGIN_UI.forgot}
          </Link>
        </div>

        <button type="submit" disabled={loading} className="ss-login-submit">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {loading ? LOGIN_UI.submitting : LOGIN_UI.submit}
        </button>
      </form>

      <p className="ss-login-help">
        {LOGIN_UI.helpPrefix}{' '}
        <Link href={`/contact?topic=${CONTACT_TOPICS.PRODUCT_SUPPORT}`} className={linkClass}>
          {LOGIN_UI.contactSupport}
        </Link>
      </p>
      {showRequestAccess ? (
        <p className="ss-login-access">
          <Link href="/activate" className={cn(linkClass, 'ss-login-access-link')}>
            {LOGIN_UI.requestAccess}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function PhixCredentialHint() {
  return (
    <div className="ss-phix-hint" role="note">
      <ShieldCheck className="ss-phix-hint-icon" aria-hidden />
      <div>
        <strong className="ss-phix-notice-title">{LOGIN_UI.phixCredentialTitle}</strong>
        <span className="ss-phix-notice-text">{LOGIN_UI.phixCredentialBody}</span>
      </div>
    </div>
  );
}

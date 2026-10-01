'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthStore } from '@/features/auth/auth-store';
import { api } from '@/lib/api-client';
import { rememberIpAccessDenied } from '@/lib/ip-access-denied';
import { LOGIN_CHANNELS, ROLES, professionalAckDefaultReturnTo, professionalAckHref, resolveSuperAdminScope } from '@safescript/shared';
import {
  SUPER_ADMIN_PORTALS,
  resolvePostLoginPath,
  writeStoredPortal,
  type SuperAdminPortal,
} from './portal';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

type Props = {
  portal: SuperAdminPortal;
};

export function SuperAdminPortalLoginForm({ portal }: Props) {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);
  const meta = SUPER_ADMIN_PORTALS[portal];
  const other = SUPER_ADMIN_PORTALS[portal === 'pharmacy' ? 'platform' : 'pharmacy'];

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

      if (user?.role !== ROLES.SUPER_ADMIN) {
        // Wrong workspace — send them to the correct role home
        if (user?.role === ROLES.PHARMACIST_ADMIN) {
          toast.message('Signed in to Pharmacy Admin workspace');
          router.push(professionalAckHref('/admin', undefined, ROLES.PHARMACIST_ADMIN));
        } else {
          toast.message('Signed in to Pharmacist workspace');
          router.push(professionalAckHref(professionalAckDefaultReturnTo(ROLES.PHARMACIST)));
        }
        return;
      }

      const dest = resolvePostLoginPath(portal, resolveSuperAdminScope(user.role, user.superAdminScope));
      writeStoredPortal(portal);
      router.push(dest);
      toast.success(`Welcome to ${meta.name}`, { announce: true });
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
      const message =
        error.message || 'Email or password is incorrect. Please try again.';
      toast.error(Array.isArray(message) ? message[0] : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 shadow-lg shadow-black/5">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto">
          <BrandMark size="lg" priority className="mx-auto" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Platform Admin
          </p>
          <CardTitle className="text-2xl tracking-tight">{meta.name}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {meta.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="admin@safescribe.com"
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('rememberMe')} className="rounded" />
              Remember me
            </label>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in to {meta.shortName}
          </Button>
        </form>

        <div className="space-y-3 border-t border-border pt-4 text-center text-sm">
          <p className="text-muted-foreground">
            Looking for {other.shortName}?{' '}
            <Link href={other.loginPath} className="font-medium text-primary hover:underline">
              Switch login
            </Link>
          </p>
          <Link
            href="/login/admin"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Platform Admin logins
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

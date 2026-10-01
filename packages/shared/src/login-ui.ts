import { LOGIN_EMAIL_2FA } from './login-email-2fa';

/** Structured login error codes returned by the API (top-level `error` field). */
export const LOGIN_ERROR_CODES = {
  SUPER_ADMIN_CHANNEL_REQUIRED: 'SUPER_ADMIN_CHANNEL_REQUIRED',
  ADMIN_ACCESS_RESTRICTED: 'ADMIN_ACCESS_RESTRICTED',
  SAFESCRIBE_NOT_ENTITLED: 'SAFESCRIBE_NOT_ENTITLED',
  IP_ACCESS_DENIED: 'IP_ACCESS_DENIED',
  TENANT_SELECTION_REQUIRED: 'TENANT_SELECTION_REQUIRED',
  PHIX_PASSWORD_MANAGED: 'PHIX_PASSWORD_MANAGED',
  LOGIN_EMAIL_2FA_REQUIRED: LOGIN_EMAIL_2FA.REQUIRED,
  LOGIN_EMAIL_2FA_INVALID_OR_EXPIRED: LOGIN_EMAIL_2FA.INVALID_OR_EXPIRED,
  LOGIN_EMAIL_2FA_RESEND_COOLDOWN: LOGIN_EMAIL_2FA.RESEND_COOLDOWN,
} as const;

export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[keyof typeof LOGIN_ERROR_CODES];

/**
 * Pharmacy login copy. Prefer these keys over hard-coded strings in the login card.
 * Localization can swap this object later without changing component structure.
 */
export const LOGIN_UI = {
  showPhixCredentialHint: true,
  title: 'Welcome back',
  subtitle: 'Log in to access your account',
  phixCredentialTitle: 'Already use PhIX?',
  phixCredentialBody: 'You can log in with the same email and password.',
  email: 'Email',
  emailPlaceholder: 'Enter your email',
  password: 'Password',
  passwordPlaceholder: 'Enter your password',
  remember: 'Remember me',
  forgot: 'Forgot password?',
  submit: 'Log In',
  submitting: 'Logging in...',
  requestAccess: 'Request access to SafeScribe',
  requestAccessLead: 'Request access',
  requestAccessRest: 'to SafeScribe',
  emailRequired: 'Enter your email.',
  emailInvalid: 'Please enter a valid email address',
  passwordRequired: 'Enter your password.',
  invalidCredentials: 'Email or password is incorrect.',
  serviceUnavailable: "We couldn't log you in right now. Please try again.",
  notEntitled:
    'This account does not currently have SafeScribe access. If you believe this is a mistake, contact your pharmacy administrator.',
  locked: 'Your account is temporarily locked. Please try again later.',
  helpPrefix: 'Need help?',
  contactSupport: 'Contact support',
  selectPharmacy: 'This email is linked to more than one pharmacy. Choose which pharmacy to open.',
  selectPharmacyLabel: 'Pharmacy',
  selectPharmacyPlaceholder: 'Select a pharmacy',
  phixPasswordManaged:
    'This account uses your PhIX password. Change or reset it in PhIX, then sign in to SafeScribe with the same credentials.',
  email2faTitle: 'Check your email',
  email2faBody:
    'We sent a secure verification link to {email}. Open it to finish signing in.',
  email2faWaiting: 'Waiting for you to verify…',
  email2faResend: 'Resend verification email',
  email2faResending: 'Sending…',
  email2faResent: 'Verification email sent again.',
  email2faBack: 'Back to sign in',
  email2faInvalid:
    'This verification link is invalid or has expired. Sign in again to get a new link.',
  email2faVerifying: 'Verifying your sign-in…',
  email2faSuccess: 'Verified — taking you to SafeScribe…',
  email2faCooldown: 'Please wait a moment before requesting another email.',
} as const;

export function isEntitledToSafescribe(input: {
  userStatus: string;
  role: string;
  tenantStatus: string | null;
}): boolean {
  if (input.userStatus !== 'ACTIVE') return false;
  if (input.role === 'SUPER_ADMIN') return true;
  return input.tenantStatus === 'ACTIVE';
}

export type PharmacyLoginTenantOption = { id: string; name: string };

export type PharmacyLoginErrorResult =
  | { kind: 'access-denied' }
  | { kind: 'message'; message: string }
  | { kind: 'select-tenant'; tenants: PharmacyLoginTenantOption[]; message: string }
  | { kind: 'email-2fa-cooldown'; message: string };

function readErrorField(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as { error?: unknown; message?: unknown };
  if (typeof err.error === 'string') return err.error;
  if (err.message && typeof err.message === 'object' && !Array.isArray(err.message)) {
    const nested = err.message as { error?: unknown };
    if (typeof nested.error === 'string') return nested.error;
  }
  return undefined;
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { statusCode?: unknown }).statusCode;
  return typeof code === 'number' ? code : undefined;
}

function readMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  if (message && typeof message === 'object') {
    const nested = (message as { message?: unknown }).message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  return undefined;
}

/** Map a pharmacy-login API failure to inline copy. Never reveals whether an email exists in PhIX. */
function readTenants(error: unknown): PharmacyLoginTenantOption[] {
  if (!error || typeof error !== 'object') return [];
  const raw = (error as { tenants?: unknown }).tenants;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id !== 'string' || !id.trim()) return [];
    return [{ id, name: typeof name === 'string' && name.trim() ? name : 'Pharmacy' }];
  });
}

export function mapPharmacyLoginError(error: unknown): PharmacyLoginErrorResult {
  const code = readErrorField(error);
  if (code === LOGIN_ERROR_CODES.IP_ACCESS_DENIED) {
    return { kind: 'access-denied' };
  }
  if (code === LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_RESEND_COOLDOWN) {
    return {
      kind: 'email-2fa-cooldown',
      message: readMessage(error) || LOGIN_UI.email2faCooldown,
    };
  }
  if (code === LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_INVALID_OR_EXPIRED) {
    return { kind: 'message', message: readMessage(error) || LOGIN_UI.email2faInvalid };
  }
  if (code === LOGIN_ERROR_CODES.TENANT_SELECTION_REQUIRED) {
    return {
      kind: 'select-tenant',
      tenants: readTenants(error),
      message: readMessage(error) || LOGIN_UI.selectPharmacy,
    };
  }
  if (code === LOGIN_ERROR_CODES.PHIX_PASSWORD_MANAGED) {
    return { kind: 'message', message: LOGIN_UI.phixPasswordManaged };
  }
  if (code === LOGIN_ERROR_CODES.SAFESCRIBE_NOT_ENTITLED) {
    return { kind: 'message', message: LOGIN_UI.notEntitled };
  }
  if (code === LOGIN_ERROR_CODES.SUPER_ADMIN_CHANNEL_REQUIRED) {
    return {
      kind: 'message',
      message:
        readMessage(error) ||
        'Platform administrator accounts must sign in through the dedicated admin access page.',
    };
  }

  const status = readStatus(error);
  const message = readMessage(error);

  if (status === 401) {
    return { kind: 'message', message: LOGIN_UI.invalidCredentials };
  }
  if (status === 403 && message?.toLowerCase().includes('locked')) {
    return { kind: 'message', message: LOGIN_UI.locked };
  }
  if (status === 403 && message) {
    return { kind: 'message', message };
  }
  if (status === 429 || (status !== undefined && status >= 500) || status === 0) {
    return { kind: 'message', message: LOGIN_UI.serviceUnavailable };
  }
  if (!status && !code) {
    return { kind: 'message', message: LOGIN_UI.serviceUnavailable };
  }
  return { kind: 'message', message: LOGIN_UI.invalidCredentials };
}

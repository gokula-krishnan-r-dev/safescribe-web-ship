import {
  AUTH_SESSION_MAX_DAYS,
  AUTH_SESSION_MAX_MS,
  authSessionExpiresAt,
  isDemoLoginBypassEmail,
  isEntitledToSafescribe,
  LOGIN_ERROR_CODES,
  LOGIN_UI,
  mapPharmacyLoginError,
  maskEmail,
  parseDemoLoginBypassEmails,
  requiresLoginEmail2fa,
  shouldChallengeLoginEmail2fa,
} from '@safescript/shared';

describe('isEntitledToSafescribe', () => {
  it('allows an active pharmacist on an active pharmacy', () => {
    expect(
      isEntitledToSafescribe({
        userStatus: 'ACTIVE',
        role: 'PHARMACIST',
        tenantStatus: 'ACTIVE',
      }),
    ).toBe(true);
  });

  it('allows an active super admin without a tenant', () => {
    expect(
      isEntitledToSafescribe({
        userStatus: 'ACTIVE',
        role: 'SUPER_ADMIN',
        tenantStatus: null,
      }),
    ).toBe(true);
  });

  it('denies inactive or pending users even with valid credentials', () => {
    expect(
      isEntitledToSafescribe({
        userStatus: 'PENDING',
        role: 'PHARMACIST',
        tenantStatus: 'ACTIVE',
      }),
    ).toBe(false);
    expect(
      isEntitledToSafescribe({
        userStatus: 'SUSPENDED',
        role: 'PHARMACIST_ADMIN',
        tenantStatus: 'ACTIVE',
      }),
    ).toBe(false);
  });

  it('denies pharmacy users when the pharmacy is suspended', () => {
    expect(
      isEntitledToSafescribe({
        userStatus: 'ACTIVE',
        role: 'PHARMACIST',
        tenantStatus: 'SUSPENDED',
      }),
    ).toBe(false);
  });
});

describe('mapPharmacyLoginError', () => {
  it('uses a generic invalid-credentials message and does not mention PhIX', () => {
    const result = mapPharmacyLoginError({
      statusCode: 401,
      message: 'Email or password is incorrect',
    });
    expect(result).toEqual({ kind: 'message', message: LOGIN_UI.invalidCredentials });
    expect(result.kind === 'message' && result.message.toLowerCase()).not.toContain('phix');
  });

  it('maps missing SafeScribe entitlement after authentication', () => {
    expect(
      mapPharmacyLoginError({
        statusCode: 403,
        error: LOGIN_ERROR_CODES.SAFESCRIBE_NOT_ENTITLED,
        message: 'hidden',
      }),
    ).toEqual({ kind: 'message', message: LOGIN_UI.notEntitled });
  });

  it('routes pharmacy IP denials to the access-denied screen', () => {
    expect(
      mapPharmacyLoginError({
        statusCode: 403,
        error: LOGIN_ERROR_CODES.IP_ACCESS_DENIED,
      }),
    ).toEqual({ kind: 'access-denied' });
  });

  it('asks the pharmacist to pick a pharmacy when the email is on more than one tenant', () => {
    expect(
      mapPharmacyLoginError({
        statusCode: 409,
        error: LOGIN_ERROR_CODES.TENANT_SELECTION_REQUIRED,
        message: LOGIN_UI.selectPharmacy,
        tenants: [{ id: 't1', name: 'North Pharmacy' }],
      }),
    ).toEqual({
      kind: 'select-tenant',
      message: LOGIN_UI.selectPharmacy,
      tenants: [{ id: 't1', name: 'North Pharmacy' }],
    });
  });

  it('uses a non-specific message when the service is unavailable', () => {
    expect(mapPharmacyLoginError({ statusCode: 503, message: 'Bad Gateway' })).toEqual({
      kind: 'message',
      message: LOGIN_UI.serviceUnavailable,
    });
    expect(mapPharmacyLoginError(new TypeError('Failed to fetch'))).toEqual({
      kind: 'message',
      message: LOGIN_UI.serviceUnavailable,
    });
  });

  it('maps email 2FA resend cooldown and expired links', () => {
    expect(
      mapPharmacyLoginError({
        statusCode: 429,
        error: LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_RESEND_COOLDOWN,
        message: LOGIN_UI.email2faCooldown,
      }),
    ).toEqual({ kind: 'email-2fa-cooldown', message: LOGIN_UI.email2faCooldown });
    expect(
      mapPharmacyLoginError({
        statusCode: 401,
        error: LOGIN_ERROR_CODES.LOGIN_EMAIL_2FA_INVALID_OR_EXPIRED,
        message: LOGIN_UI.email2faInvalid,
      }),
    ).toEqual({ kind: 'message', message: LOGIN_UI.email2faInvalid });
  });
});

describe('login email 2FA helpers', () => {
  it('requires email verification only for pharmacist roles', () => {
    expect(requiresLoginEmail2fa('PHARMACIST')).toBe(true);
    expect(requiresLoginEmail2fa('PHARMACIST_ADMIN')).toBe(true);
    expect(requiresLoginEmail2fa('SUPER_ADMIN')).toBe(false);
  });

  it('masks email addresses for the check-your-email screen', () => {
    expect(maskEmail('jane.doe@pharmacy.ca')).toBe('j***@pharmacy.ca');
  });

  it('skips email 2FA for seeded demo accounts after a valid password', () => {
    expect(isDemoLoginBypassEmail('pharmacist@demo-pharmacy.com')).toBe(true);
    expect(isDemoLoginBypassEmail('Admin@Demo-Pharmacy.com')).toBe(true);
    expect(isDemoLoginBypassEmail('admin@safescript.com')).toBe(true);
    expect(isDemoLoginBypassEmail('pharmacist@real-pharmacy.com')).toBe(false);
  });

  it('adds extra demo bypass emails from env without dropping the seed list', () => {
    const list = parseDemoLoginBypassEmails('walkthrough@safescribe.ca');
    expect(list).toContain('pharmacist@demo-pharmacy.com');
    expect(list).toContain('walkthrough@safescribe.ca');
  });

  it('can disable the demo bypass list with none', () => {
    expect(parseDemoLoginBypassEmails('none')).toEqual([]);
    expect(isDemoLoginBypassEmail('pharmacist@demo-pharmacy.com', 'none')).toBe(false);
  });

  it('does not challenge demo pharmacist emails even when email 2FA is on', () => {
    expect(
      shouldChallengeLoginEmail2fa({
        enabled: true,
        role: 'PHARMACIST',
        email: 'pharmacist@demo-pharmacy.com',
        requiresRole: requiresLoginEmail2fa,
      }),
    ).toBe(false);
    expect(
      shouldChallengeLoginEmail2fa({
        enabled: true,
        role: 'PHARMACIST',
        email: 'pharmacist@real-pharmacy.com',
        requiresRole: requiresLoginEmail2fa,
      }),
    ).toBe(true);
    expect(
      shouldChallengeLoginEmail2fa({
        enabled: false,
        role: 'PHARMACIST',
        email: 'pharmacist@real-pharmacy.com',
        requiresRole: requiresLoginEmail2fa,
      }),
    ).toBe(false);
  });
});

describe('auth session max lifetime', () => {
  it('caps authenticated sessions at 7 days from login', () => {
    expect(AUTH_SESSION_MAX_DAYS).toBe(7);
    const from = new Date('2026-08-01T00:00:00.000Z');
    expect(authSessionExpiresAt(from).toISOString()).toBe('2026-08-08T00:00:00.000Z');
    expect(AUTH_SESSION_MAX_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

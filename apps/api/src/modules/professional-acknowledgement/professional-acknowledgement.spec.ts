import {
  isProfessionalAckExemptApiPath,
  sanitizeReturnTo,
  PROFESSIONAL_ACK_BODY,
  PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
  PROFESSIONAL_ACK_HEADING,
  PROFESSIONAL_ACK_PATH,
  PROFESSIONAL_ACK_SESSION_TTL_SECONDS,
  PROFESSIONAL_ACK_VERSION,
  professionalAckDefaultReturnTo,
  professionalAckHref,
  pharmacistNeedsAcknowledgement,
  isProfessionalAckRole,
} from '@safescript/shared';
import { professionalAckCopySha256 } from './copy-hash';

describe('professional acknowledgement copy', () => {
  it('keeps the approved heading, body, and version', () => {
    expect(PROFESSIONAL_ACK_VERSION).toBe('2026-08-16-v1');
    expect(PROFESSIONAL_ACK_SESSION_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(PROFESSIONAL_ACK_HEADING).toBe('Professional use acknowledgement');
    expect(PROFESSIONAL_ACK_BODY).toBe(
      'SafeScribe supports clinical decision-making and documentation but does not replace your professional judgment. You remain responsible for all prescribing decisions.',
    );
  });

  it('hashes the approved body on the server', () => {
    const hash = professionalAckCopySha256();
    expect(hash).toHaveLength(64);
    expect(hash).toBe(professionalAckCopySha256(PROFESSIONAL_ACK_BODY));
    expect(professionalAckCopySha256('different copy')).not.toBe(hash);
  });
});

describe('sanitizeReturnTo', () => {
  it('accepts internal pharmacist paths', () => {
    expect(sanitizeReturnTo('/pharmacist')).toBe('/pharmacist');
    expect(sanitizeReturnTo('/pharmacist/consultations/abc')).toBe(
      '/pharmacist/consultations/abc',
    );
    expect(sanitizeReturnTo('/pharmacist/consultations?x=1')).toBe(
      '/pharmacist/consultations?x=1',
    );
  });

  it('accepts internal pharmacy-admin paths', () => {
    expect(sanitizeReturnTo('/admin')).toBe('/admin');
    expect(sanitizeReturnTo('/admin/consultations/abc')).toBe('/admin/consultations/abc');
    expect(sanitizeReturnTo('/admin/pharmacists?x=1')).toBe('/admin/pharmacists?x=1');
  });

  it('rejects absolute, protocol-relative, auth, and acknowledgement routes', () => {
    expect(sanitizeReturnTo('https://evil.example/phish')).toBe(
      PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
    );
    expect(sanitizeReturnTo('//evil.example/phish')).toBe(
      PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
    );
    expect(sanitizeReturnTo('/login')).toBe(PROFESSIONAL_ACK_DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('/auth/phix')).toBe(PROFESSIONAL_ACK_DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo(PROFESSIONAL_ACK_PATH)).toBe(
      PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
    );
    expect(sanitizeReturnTo('/super-admin')).toBe(PROFESSIONAL_ACK_DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('/pharmacist/../login')).toBe(
      PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
    );
    expect(sanitizeReturnTo('/pharmacist/%2e%2e/login')).toBe(
      PROFESSIONAL_ACK_DEFAULT_RETURN_TO,
    );
  });

  it('builds a safe acknowledgement href', () => {
    expect(professionalAckHref('https://evil.example')).toBe(
      `${PROFESSIONAL_ACK_PATH}?returnTo=${encodeURIComponent(PROFESSIONAL_ACK_DEFAULT_RETURN_TO)}`,
    );
  });

  it('identifies pharmacists and pharmacy admins as acknowledgement roles', () => {
    expect(isProfessionalAckRole('PHARMACIST')).toBe(true);
    expect(isProfessionalAckRole('PHARMACIST_ADMIN')).toBe(true);
    expect(isProfessionalAckRole('SUPER_ADMIN')).toBe(false);
  });

  it('requires acknowledgement when this login session has not been acknowledged', () => {
    expect(
      pharmacistNeedsAcknowledgement({
        required: true,
        acknowledged: false,
        version: PROFESSIONAL_ACK_VERSION,
        heading: PROFESSIONAL_ACK_HEADING,
        body: PROFESSIONAL_ACK_BODY,
      }),
    ).toBe(true);
    expect(
      pharmacistNeedsAcknowledgement({
        required: false,
        acknowledged: true,
        version: PROFESSIONAL_ACK_VERSION,
        heading: PROFESSIONAL_ACK_HEADING,
        body: PROFESSIONAL_ACK_BODY,
      }),
    ).toBe(false);
    expect(pharmacistNeedsAcknowledgement(undefined)).toBe(false);
  });

  it('sends pharmacists to the Prescribe workspace after acknowledgement', () => {
    expect(professionalAckDefaultReturnTo('PHARMACIST')).toBe('/pharmacist/consultations');
    expect(professionalAckDefaultReturnTo()).toBe('/pharmacist/consultations');
    expect(PROFESSIONAL_ACK_DEFAULT_RETURN_TO).toBe('/pharmacist/consultations');
  });

  it('keeps pharmacy admins on /admin even if returnTo is a pharmacist path', () => {
    expect(professionalAckDefaultReturnTo('PHARMACIST_ADMIN')).toBe('/admin');
    expect(sanitizeReturnTo('/pharmacist', '/admin', 'PHARMACIST_ADMIN')).toBe('/admin');
    expect(sanitizeReturnTo('/pharmacist/consultations', '/admin', 'PHARMACIST_ADMIN')).toBe(
      '/admin',
    );
    expect(professionalAckHref('/pharmacist', '/admin', 'PHARMACIST_ADMIN')).toBe(
      `${PROFESSIONAL_ACK_PATH}?returnTo=${encodeURIComponent('/admin')}`,
    );
    expect(professionalAckHref('/admin', '/admin', 'PHARMACIST_ADMIN')).toBe(
      `${PROFESSIONAL_ACK_PATH}?returnTo=${encodeURIComponent('/admin')}`,
    );
  });
});

describe('isProfessionalAckExemptApiPath', () => {
  it('exempts auth, acknowledgement, health, and public routes', () => {
    expect(isProfessionalAckExemptApiPath('/api/v1/auth/me')).toBe(true);
    expect(isProfessionalAckExemptApiPath('/api/v1/auth/logout')).toBe(true);
    expect(isProfessionalAckExemptApiPath('/api/v1/professional-use-acknowledgement')).toBe(
      true,
    );
    expect(isProfessionalAckExemptApiPath('/api/v1/health')).toBe(true);
    expect(isProfessionalAckExemptApiPath('/api/v1/contact')).toBe(true);
    expect(isProfessionalAckExemptApiPath('/api/v1/network-verify/abc')).toBe(true);
    expect(isProfessionalAckExemptApiPath('/api/v1/integrations/phix/events')).toBe(true);
  });

  it('does not exempt pharmacist clinical APIs', () => {
    expect(isProfessionalAckExemptApiPath('/api/v1/consultations')).toBe(false);
    expect(isProfessionalAckExemptApiPath('/api/v1/consultations/active')).toBe(false);
    expect(isProfessionalAckExemptApiPath('/api/v1/stt/transcribe')).toBe(false);
  });
});

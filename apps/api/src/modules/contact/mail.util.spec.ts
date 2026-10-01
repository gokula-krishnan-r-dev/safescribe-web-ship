import { createHmac } from 'crypto';
import {
  escapeHtml,
  isEnvFlagEnabled,
  parseFromAddress,
  resolveResendConfig,
  assertResendConfig,
  verifyResendWebhookSignature,
} from './mail.util';

function sign(secret: string, id: string, timestamp: string, payload: string) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
}

describe('mail.util', () => {
  it('parses branded From addresses', () => {
    expect(parseFromAddress('Safescript <noreply@phix.now>')).toEqual({
      from: 'Safescript <noreply@phix.now>',
      email: 'noreply@phix.now',
    });
    expect(parseFromAddress('"SafeScribe" <noreply@phix.now>')).toEqual({
      from: 'SafeScribe <noreply@phix.now>',
      email: 'noreply@phix.now',
    });
    expect(parseFromAddress('noreply@phix.now')?.email).toBe('noreply@phix.now');
    expect(parseFromAddress('not-an-email')).toBeNull();
  });

  it('reads boolean env flags', () => {
    expect(isEnvFlagEnabled('true')).toBe(true);
    expect(isEnvFlagEnabled('FALSE')).toBe(false);
    expect(isEnvFlagEnabled('')).toBe(false);
    expect(isEnvFlagEnabled('', true)).toBe(true);
  });

  it('resolves quoted Resend env values', () => {
    const resolved = resolveResendConfig({
      RESEND_ENABLED: 'true',
      RESEND_API_KEY: '"re_test_key_value"',
      RESEND_FROM_EMAIL: '"Safescript <noreply@phix.now>"',
      RESEND_WEBHOOK_SECRET: "'whsec_abc'",
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.apiKey).toBe('re_test_key_value');
    expect(resolved.fromEmail).toBe('noreply@phix.now');
    expect(resolved.from).toBe('Safescript <noreply@phix.now>');
    expect(resolved.webhookSecret).toBe('whsec_abc');
    expect(
      assertResendConfig(resolved, { required: true }),
    ).toEqual([]);
  });

  it('rejects a missing Resend key when required', () => {
    const errors = assertResendConfig(
      resolveResendConfig({
        RESEND_ENABLED: 'true',
        RESEND_API_KEY: '',
        RESEND_FROM_EMAIL: 'noreply@phix.now',
      }),
      { required: true },
    );
    expect(errors.some((e) => e.includes('RESEND_API_KEY'))).toBe(true);
  });

  it('escapes HTML in user-supplied content', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('accepts a valid Resend/Svix webhook signature', () => {
    const secret = `whsec_${Buffer.from('webhook-secret-bytes').toString('base64')}`;
    const id = 'msg_test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const payload = '{"type":"email.delivered"}';
    const signature = `v1,${sign(secret, id, timestamp, payload)}`;

    expect(
      verifyResendWebhookSignature({
        payload,
        secret,
        id,
        timestamp,
        signature,
      }),
    ).toBe(true);
  });

  it('rejects a tampered webhook payload', () => {
    const secret = `whsec_${Buffer.from('webhook-secret-bytes').toString('base64')}`;
    const id = 'msg_test';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v1,${sign(secret, id, timestamp, '{"type":"email.delivered"}')}`;

    expect(
      verifyResendWebhookSignature({
        payload: '{"type":"email.bounced"}',
        secret,
        id,
        timestamp,
        signature,
      }),
    ).toBe(false);
  });
});

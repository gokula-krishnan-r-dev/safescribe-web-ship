import {
  collapseTranslateBatch,
  handoutTranslationCacheKey,
  isRetryableTranslateError,
  translateErrorSummary,
} from './google-handout-translate.util';

describe('Google handout translate helpers', () => {
  it('deduplicates identical units and skips empty strings', () => {
    const { unique, expand } = collapseTranslateBatch([
      'Seek medical care if symptoms worsen.',
      '',
      'Seek medical care if symptoms worsen.',
      '   ',
      'Follow up with your pharmacist.',
    ]);
    expect(unique).toEqual([
      'Seek medical care if symptoms worsen.',
      'Follow up with your pharmacist.',
    ]);
    expect(expand(['A', 'B'])).toEqual(['A', '', 'A', '', 'B']);
  });

  it('builds a stable cache key from hash, language, and model', () => {
    expect(handoutTranslationCacheKey('abc', 'pa', 'general/nmt')).toBe(
      'handout:tr:v1:abc:pa:general/nmt',
    );
  });

  it('retries only transient Google errors', () => {
    expect(isRetryableTranslateError({ code: 14 })).toBe(true);
    expect(isRetryableTranslateError({ code: 8 })).toBe(true);
    expect(isRetryableTranslateError(new Error('429 Too Many Requests'))).toBe(true);
    expect(isRetryableTranslateError({ code: 3, message: 'INVALID_ARGUMENT' })).toBe(
      false,
    );
  });

  it('summarizes GCP permission errors without leaking credentials', () => {
    const summary = translateErrorSummary({
      code: 7,
      message:
        'PERMISSION_DENIED: Bearer ya29.secret Cloud Translation API has not been used',
      details: [{ reason: 'SERVICE_DISABLED' }],
    });
    expect(summary).toContain('code=7');
    expect(summary).toContain('reason=SERVICE_DISABLED');
    expect(summary).not.toContain('ya29.secret');
    expect(summary).toContain('Bearer [redacted]');
  });
});

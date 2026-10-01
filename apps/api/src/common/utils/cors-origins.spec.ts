import { isAllowedCorsOrigin, parseOriginList } from './cors-origins';

describe('parseOriginList', () => {
  it('dedupes and trims comma-separated origins', () => {
    const origins = parseOriginList(
      'https://safescribe.ca/',
      'https://www.safescribe.ca, https://safescribe.ca',
    );
    expect(origins).toEqual(
      expect.arrayContaining(['https://safescribe.ca', 'https://www.safescribe.ca']),
    );
    expect(origins.filter((origin) => origin === 'https://safescribe.ca')).toHaveLength(1);
  });

  it('always includes production and staging SafeScribe origins', () => {
    expect(parseOriginList()).toEqual(
      expect.arrayContaining([
        'https://safescribe.ca',
        'https://www.safescribe.ca',
        'https://staging.safescribe.ca',
      ]),
    );
  });
});

describe('isAllowedCorsOrigin', () => {
  const allowed = ['https://safescribe.ca', 'https://staging.safescribe.ca'];

  it('allows missing origin (mobile / curl)', () => {
    expect(isAllowedCorsOrigin(undefined, allowed)).toBe(true);
  });

  it('allows configured web origins', () => {
    expect(isAllowedCorsOrigin('https://safescribe.ca', allowed)).toBe(true);
  });

  it('allows local development', () => {
    expect(isAllowedCorsOrigin('http://localhost:3000', allowed)).toBe(true);
  });

  it('rejects unknown origins', () => {
    expect(isAllowedCorsOrigin('https://evil.example', allowed)).toBe(false);
  });
});

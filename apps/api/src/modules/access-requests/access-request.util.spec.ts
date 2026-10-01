import { capturedNetworksMatch, sanitizeUtm } from './access-request.util';

describe('capturedNetworksMatch', () => {
  it('matches identical IPv4 addresses', () => {
    expect(capturedNetworksMatch('68.148.208.135', '68.148.208.135')).toBe(true);
  });

  it('does not silently treat different IPv4 hosts as the same pharmacy', () => {
    expect(capturedNetworksMatch('68.148.208.135', '68.148.208.200')).toBe(false);
  });

  it('treats IPv6 addresses in the same /48 site as the same pharmacy network', () => {
    expect(
      capturedNetworksMatch(
        '2001:db8:abcd:1111::1',
        '2001:db8:abcd:2222::99',
      ),
    ).toBe(true);
  });

  it('rejects empty values', () => {
    expect(capturedNetworksMatch('', '68.148.208.135')).toBe(false);
  });
});

describe('sanitizeUtm', () => {
  it('trims and caps campaign values', () => {
    expect(sanitizeUtm('  alberta_launch  ')).toBe('alberta_launch');
    expect(sanitizeUtm('')).toBeNull();
    expect(sanitizeUtm('x'.repeat(90))?.length).toBe(80);
  });
});

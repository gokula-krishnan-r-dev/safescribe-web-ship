import {
  cidrCoversCidr,
  cidrToIpAndPrefix,
  compileAllowlist,
  isIpAllowed,
  matchCompiledIp,
  stabilizeAllowlistCidr,
} from './ip-matcher';

describe('stabilizeAllowlistCidr', () => {
  it('keeps a public IPv4 host as /32', () => {
    expect(stabilizeAllowlistCidr('203.0.113.10')).toMatchObject({
      ipAddress: '203.0.113.10',
      cidr: '203.0.113.10/32',
      family: 'ipv4',
      prefix: 32,
      stabilized: false,
    });
  });

  it('keeps an explicit IPv4 /24', () => {
    expect(stabilizeAllowlistCidr('203.0.113.50/24')).toMatchObject({
      ipAddress: '203.0.113.0',
      cidr: '203.0.113.0/24',
      family: 'ipv4',
      prefix: 24,
    });
  });

  it('rejects an IPv4 range broader than /24', () => {
    expect(() => stabilizeAllowlistCidr('10.0.0.0/8')).toThrow(/\/24 or smaller/);
  });

  it('converts a rotating IPv6 host to the stable /48 site prefix', () => {
    const result = stabilizeAllowlistCidr(
      '2001:db8:abcd:434e:6981:1c9b:97a2:23dc',
    );
    expect(result).toMatchObject({
      ipAddress: '2001:db8:abcd::',
      cidr: '2001:db8:abcd::/48',
      family: 'ipv6',
      prefix: 48,
      stabilized: true,
    });
  });

  it('clamps an IPv6 /128 to /48', () => {
    expect(
      stabilizeAllowlistCidr('2001:db8:ef01:6bff:1970:943b:5c18:47fd/128').cidr,
    ).toBe('2001:db8:ef01::/48');
  });

  it('clamps a rotating IPv6 /64 LAN prefix to /48', () => {
    expect(stabilizeAllowlistCidr('2001:db8:abcd:434e::/64').cidr).toBe(
      '2001:db8:abcd::/48',
    );
  });

  it('keeps an explicit IPv6 /48', () => {
    expect(stabilizeAllowlistCidr('2001:db8:abcd::/48')).toMatchObject({
      cidr: '2001:db8:abcd::/48',
      prefix: 48,
      stabilized: false,
    });
  });

  it('rejects an ISP-wide IPv6 block', () => {
    expect(() => stabilizeAllowlistCidr('2001:db8::/32')).toThrow(/\/48 or smaller/);
  });

  it('unwraps IPv4-mapped IPv6 to a public IPv4 host', () => {
    expect(stabilizeAllowlistCidr('::ffff:203.0.113.10')).toMatchObject({
      cidr: '203.0.113.10/32',
      family: 'ipv4',
    });
  });
});

describe('isIpAllowed', () => {
  it('matches rotating IPv6 privacy addresses on the same site', () => {
    const allowlist = ['2001:db8:abcd::/48'];
    expect(
      isIpAllowed('2001:db8:abcd:434e:6981:1c9b:97a2:23dc', allowlist),
    ).toBe(true);
    expect(
      isIpAllowed('2001:db8:abcd:434e:abcd:ef01:2345:6789', allowlist),
    ).toBe(true);
    expect(
      isIpAllowed('2001:db8:ef01:6bff:1970:943b:5c18:47fd', allowlist),
    ).toBe(false);
  });

  it('matches a new ISP /64 the next day when the /48 site is the same', () => {
    const allowlist = ['2001:db8:abcd:434e::/64'];
    expect(isIpAllowed('2001:db8:abcd:aaaa:1111:2222:3333:4444', allowlist)).toBe(
      true,
    );
    expect(isIpAllowed('2001:db8:ef01:aaaa:1111:2222:3333:4444', allowlist)).toBe(
      false,
    );
  });

  it('matches a legacy exact IPv6 host against later addresses on the same site', () => {
    const allowlist = ['2001:db8:abcd:434e:6981:1c9b:97a2:23dc/128'];
    expect(isIpAllowed('2001:db8:abcd:9999:abcd:ef01:2345:6789', allowlist)).toBe(
      true,
    );
  });

  it('matches a static IPv4 host', () => {
    expect(isIpAllowed('203.0.113.10', ['203.0.113.10/32'])).toBe(true);
    expect(isIpAllowed('203.0.113.11', ['203.0.113.10/32'])).toBe(false);
  });

  it('does not treat an IPv4 allowlist as covering an IPv6 connection', () => {
    expect(isIpAllowed('2001:db8:4453:c5b4:ecca:cdfd:9825:352c', ['198.51.100.10/32'])).toBe(
      false,
    );
  });
});

describe('compileAllowlist', () => {
  it('widens legacy IPv6 /64 rows to a /48 match without changing stored CIDR', () => {
    const compiled = compileAllowlist(['2001:db8:abcd:434e::/64']);
    expect(compiled).toHaveLength(1);
    expect(compiled[0]).toMatchObject({
      family: 'ipv6',
      storedCidr: '2001:db8:abcd:434e::/64',
      storedPrefix: 64,
      matchPrefix: 48,
    });
  });

  it('flags a rotated IPv6 prefix so the stored row can be upgraded', () => {
    const compiled = compileAllowlist(['2001:db8:abcd:434e::/64']);
    const result = matchCompiledIp(
      '2001:db8:abcd:aaaa:1111:2222:3333:4444',
      compiled,
    );
    expect(result.allowed).toBe(true);
    expect(result.rotatedPrefix).toBe(true);
    expect(result.matched?.storedCidr).toBe('2001:db8:abcd:434e::/64');
  });

  it('does not flag rotation when the client is still inside the stored /64', () => {
    const compiled = compileAllowlist(['2001:db8:abcd:434e::/64']);
    const result = matchCompiledIp(
      '2001:db8:abcd:434e:abcd:ef01:2345:6789',
      compiled,
    );
    expect(result.allowed).toBe(true);
    expect(result.rotatedPrefix).toBe(false);
  });
});

describe('cidrToIpAndPrefix', () => {
  it('persists the stable IPv6 site, not the rotating host', () => {
    expect(cidrToIpAndPrefix('2001:db8:abcd:434e:6981:1c9b:97a2:23dc')).toEqual({
      ipAddress: '2001:db8:abcd::',
      cidr: '2001:db8:abcd::/48',
    });
  });
});

describe('cidrCoversCidr', () => {
  it('treats a /48 site as covering a host /128 on that LAN', () => {
    expect(
      cidrCoversCidr(
        '2001:db8:abcd::/48',
        '2001:db8:abcd:434e:6981:1c9b:97a2:23dc/128',
      ),
    ).toBe(true);
  });
});

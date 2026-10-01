import * as ipaddr from 'ipaddr.js';

/**
 * Auto-registered IPv6 prefix. Consumer ISPs rotate the host bits (privacy
 * extensions) and often the /64 LAN prefix as well. A /48 is the RFC 6177
 * site assignment — one pharmacy internet, not an ISP-wide block.
 */
export const IPV6_STABLE_PREFIX = 48;
/** Broadest IPv4 pharmacy network we accept (typical office NAT). */
export const IPV4_MIN_PREFIX = 24;
/** Broadest IPv6 pharmacy network we accept (typical ISP customer assignment). */
export const IPV6_MIN_PREFIX = 48;
/** IPv6 allowlist entries tighter than this still match at the site prefix. */
export const IPV6_SITE_MATCH_PREFIX = 48;

export type IpFamily = 'ipv4' | 'ipv6';

export interface StabilizedNetwork {
  ipAddress: string;
  cidr: string;
  family: IpFamily;
  prefix: number;
  stabilized: boolean;
}

export interface CompiledNetwork {
  family: IpFamily;
  storedCidr: string;
  storedPrefix: number;
  matchPrefix: number;
  matchBytes: number[];
  storedBytes: number[];
}

export interface IpMatchResult {
  allowed: boolean;
  matched?: CompiledNetwork;
  /** IPv6 matched the pharmacy /48 but not the stored host or /64. */
  rotatedPrefix: boolean;
}

function parseAddress(value: string): ipaddr.IPv4 | ipaddr.IPv6 {
  const parsed = ipaddr.parse(value.trim());
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      return v6.toIPv4Address();
    }
  }
  return parsed;
}

function familyOf(addr: ipaddr.IPv4 | ipaddr.IPv6): IpFamily {
  return addr.kind() === 'ipv4' ? 'ipv4' : 'ipv6';
}

function maxPrefix(family: IpFamily): number {
  return family === 'ipv4' ? 32 : 128;
}

function minPrefix(family: IpFamily): number {
  return family === 'ipv4' ? IPV4_MIN_PREFIX : IPV6_MIN_PREFIX;
}

export function maskToPrefix(addr: ipaddr.IPv4 | ipaddr.IPv6, prefix: number): string {
  const bytes = maskBytes(addr.toByteArray(), prefix);
  return `${ipaddr.fromByteArray(bytes).toString()}/${prefix}`;
}

function maskBytes(bytes: number[], prefix: number): number[] {
  const masked = bytes.slice();
  let remaining = prefix;
  for (let i = 0; i < masked.length; i += 1) {
    if (remaining >= 8) {
      remaining -= 8;
      continue;
    }
    if (remaining > 0) {
      masked[i] &= (0xff << (8 - remaining)) & 0xff;
      remaining = 0;
    } else {
      masked[i] = 0;
    }
  }
  return masked;
}

function bytesMatchPrefix(client: number[], network: number[], prefix: number): boolean {
  if (client.length !== network.length) return false;
  const fullBytes = prefix >> 3;
  for (let i = 0; i < fullBytes; i += 1) {
    if (client[i] !== network[i]) return false;
  }
  const rem = prefix & 7;
  if (rem === 0 || fullBytes >= client.length) return true;
  const mask = (0xff << (8 - rem)) & 0xff;
  return (client[fullBytes] & mask) === (network[fullBytes] & mask);
}

export function cidrPrefixLength(cidr: string): number {
  const bits = Number(cidr.split('/')[1]);
  return Number.isInteger(bits) ? bits : -1;
}

export function ipFamily(value: string): IpFamily {
  return familyOf(parseAddress(value));
}

/**
 * Parse an IP or CIDR without changing prefix length.
 * Bare IPv4 → /32, bare IPv6 → /128.
 */
export function normalizeCidr(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Please enter an IP address or CIDR range');
  }

  if (trimmed.includes('/')) {
    const [addr, prefix] = trimmed.split('/');
    const parsed = parseAddress(addr);
    const bits = Number(prefix);
    if (!Number.isInteger(bits) || bits < 0) {
      throw new Error(`Invalid network prefix: ${prefix}`);
    }
    const family = familyOf(parsed);
    if (bits > maxPrefix(family)) {
      throw new Error(`Network prefix is out of range for ${family}`);
    }
    return `${parsed.toString()}/${bits}`;
  }

  const parsed = parseAddress(trimmed);
  return `${parsed.toString()}/${maxPrefix(familyOf(parsed))}`;
}

/**
 * Convert a detected or typed address into the CIDR we should persist.
 *
 * IPv4 hosts stay /32 (static public IP).
 * IPv6 hosts and /49–/128 ranges become the /48 site prefix so privacy
 * addresses and ISP /64 rotations on the same pharmacy internet keep matching.
 */
export function stabilizeAllowlistCidr(value: string): StabilizedNetwork {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Please enter an IP address or CIDR range');
  }

  const hasPrefix = trimmed.includes('/');
  const addrPart = hasPrefix ? trimmed.split('/')[0] : trimmed;
  const parsed = parseAddress(addrPart);
  const family = familyOf(parsed);
  const originalPrefix = hasPrefix
    ? Number(trimmed.split('/')[1])
    : maxPrefix(family);

  if (!Number.isInteger(originalPrefix) || originalPrefix < 0) {
    throw new Error('Invalid network prefix');
  }
  if (originalPrefix > maxPrefix(family)) {
    throw new Error(`Network prefix is out of range for ${family}`);
  }

  let prefix = originalPrefix;
  let stabilized = false;

  if (family === 'ipv6' && prefix > IPV6_STABLE_PREFIX) {
    prefix = IPV6_STABLE_PREFIX;
    stabilized = true;
  } else if (!hasPrefix && family === 'ipv6') {
    prefix = IPV6_STABLE_PREFIX;
    stabilized = true;
  }

  if (prefix < minPrefix(family)) {
    throw new Error(
      family === 'ipv4'
        ? 'IPv4 ranges must be /24 or smaller (a single office network). Use a public host IP when possible.'
        : 'IPv6 ranges must be /48 or smaller. Use the pharmacy site prefix, not an ISP-wide block.',
    );
  }

  const cidr = maskToPrefix(parsed, prefix);
  const [ipAddress] = cidr.split('/');
  return { ipAddress, cidr, family, prefix, stabilized };
}

export function compileAllowlist(allowlist: string[]): CompiledNetwork[] {
  const compiled: CompiledNetwork[] = [];
  for (const entry of allowlist) {
    try {
      const normalized = normalizeCidr(entry);
      const [addr, prefixBits] = normalized.split('/');
      const parsed = parseAddress(addr);
      const family = familyOf(parsed);
      const storedPrefix = Number(prefixBits);
      const matchPrefix =
        family === 'ipv6' ? Math.min(storedPrefix, IPV6_SITE_MATCH_PREFIX) : storedPrefix;
      const rawBytes = parsed.toByteArray();
      compiled.push({
        family,
        storedCidr: entry.trim(),
        storedPrefix,
        matchPrefix,
        matchBytes: maskBytes(rawBytes, matchPrefix),
        storedBytes: maskBytes(rawBytes, storedPrefix),
      });
    } catch {
      // Skip malformed rows rather than failing closed on the whole pharmacy.
    }
  }
  return compiled;
}

export function matchCompiledIp(clientIp: string, networks: CompiledNetwork[]): IpMatchResult {
  if (!networks.length) {
    return { allowed: false, rotatedPrefix: false };
  }

  let parsedClient: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsedClient = parseAddress(clientIp);
  } catch {
    return { allowed: false, rotatedPrefix: false };
  }

  const family = familyOf(parsedClient);
  const clientBytes = parsedClient.toByteArray();

  for (const network of networks) {
    if (network.family !== family) continue;
    if (!bytesMatchPrefix(clientBytes, network.matchBytes, network.matchPrefix)) continue;
    const rotatedPrefix =
      family === 'ipv6' &&
      network.storedPrefix > network.matchPrefix &&
      !bytesMatchPrefix(clientBytes, network.storedBytes, network.storedPrefix);
    return { allowed: true, matched: network, rotatedPrefix };
  }

  return { allowed: false, rotatedPrefix: false };
}

export function isIpAllowed(clientIp: string, allowlist: string[]): boolean {
  return matchCompiledIp(clientIp, compileAllowlist(allowlist)).allowed;
}

export function cidrCoversIp(cidr: string, ip: string): boolean {
  return isIpAllowed(ip, [cidr]);
}

export function cidrCoversCidr(parent: string, child: string): boolean {
  try {
    const parentNorm = stabilizeAllowlistCidr(parent);
    const childNorm = normalizeCidr(child);
    const [childAddr] = childNorm.split('/');
    const childPrefix = cidrPrefixLength(childNorm);
    if (childPrefix < parentNorm.prefix) return false;
    return isIpAllowed(childAddr, [parentNorm.cidr]);
  } catch {
    return false;
  }
}

export function validateCidrInput(value: string): string {
  return stabilizeAllowlistCidr(value).cidr;
}

/** True for loopback, RFC1918, link-local, CGNAT, and other non-public ranges. */
export function isPrivateOrReservedIp(ip: string): boolean {
  try {
    const parsed = parseAddress(ip);
    const range = parsed.range();
    return range !== 'unicast';
  } catch {
    return true;
  }
}

export function cidrToIpAndPrefix(cidr: string): { ipAddress: string; cidr: string } {
  const stabilized = stabilizeAllowlistCidr(cidr);
  return { ipAddress: stabilized.ipAddress, cidr: stabilized.cidr };
}

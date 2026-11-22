import { URL } from 'node:url';
import net from 'node:net';
import { promises as dns } from 'node:dns';

export interface SafeUrlResult {
  isSafe: boolean;
  sanitizedUrl?: string;
  error?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
]);

/**
 * Checks whether an IPv4 address belongs to private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [b0, b1] = parts;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;

  // 10.0.0.0/8 (Private)
  if (b0 === 10) return true;

  // 172.16.0.0/12 (Private 172.16.0.0 to 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 (Link-Local, AWS IMDS 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;

  // 100.64.0.0/10 (Shared address space)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 224.0.0.0/4 (Multicast) or 240.0.0.0/4 (Reserved)
  if (b0 >= 224) return true;

  return false;
}

/** Turns an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:aabb:ccdd) into its IPv4 form. */
function mappedIpv4(ip: string): string | null {
  const m = /^(?:0{0,4}:){0,5}:?ffff:(.+)$/i.exec(ip);
  if (!m) return null;
  const tail = m[1];
  if (net.isIPv4(tail)) return tail;
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(tail);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

const PRIVATE_V6 = new net.BlockList();
for (const [prefix, bits] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['2001:db8::', 32], ['2002::', 16], ['100::', 64],
] as Array<[string, number]>) PRIVATE_V6.addSubnet(prefix, bits, 'ipv6');

/**
 * Checks whether an IPv6 address is loopback, private, link-local, multicast, a translation
 * prefix, or an IPv4-mapped form of a private IPv4 address.
 */
export function isPrivateIpv6(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
  const v4 = mappedIpv4(bare);
  if (v4) return isPrivateIpv4(v4);
  if (!net.isIPv6(bare)) return true;
  return PRIVATE_V6.check(bare, 'ipv6');
}

/** True for any address an outbound request must not reach. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '');
  if (net.isIPv4(bare)) return isPrivateIpv4(bare);
  if (net.isIPv6(bare)) return isPrivateIpv6(bare);
  return true;
}

/**
 * Validates that an outbound target URL is safe from SSRF vulnerabilities.
 * Strictly blocks internal networks, loopback addresses, AWS IMDS metadata, and non-HTTP protocols.
 */
export function validateSafeOutboundUrl(rawUrl: string, allowedHosts?: string[]): SafeUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isSafe: false, error: 'Target URL is missing or empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { isSafe: false, error: 'Malformed target URL' };
  }

  // 1. Enforce strict HTTP/HTTPS protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isSafe: false,
      error: `Disallowed protocol '${parsed.protocol}'. Only http: and https: are permitted.`,
    };
  }

  // URL keeps the brackets around IPv6 literals ("[::1]"); strip them before checking.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 2. Reject known blocked hostnames and suffix patterns
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { isSafe: false, error: `Direct access to host '${hostname}' is prohibited.` };
  }

  if (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.lan')
  ) {
    return { isSafe: false, error: `Access to internal domain '${hostname}' is prohibited.` };
  }

  // 3. Reject private IP addresses
  const ipType = net.isIP(hostname);
  if (ipType === 4 && isPrivateIpv4(hostname)) {
    return { isSafe: false, error: `Destination IP '${hostname}' belongs to a private network.` };
  }
  if (parsed.username || parsed.password) {
    return { isSafe: false, error: 'Credentials in the URL are not allowed.' };
  }
  if (ipType === 6 && isPrivateIpv6(hostname)) {
    return { isSafe: false, error: `Destination IPv6 '${hostname}' belongs to a private network.` };
  }

  // 4. Optional host whitelist enforcement
  if (allowedHosts && allowedHosts.length > 0) {
    const isWhitelisted = allowedHosts.some((h) => {
      const allowed = h.toLowerCase();
      return hostname === allowed || hostname.endsWith(`.${allowed}`);
    });
    if (!isWhitelisted) {
      return { isSafe: false, error: `Host '${hostname}' is not in the allowed outbound whitelist.` };
    }
  }

  return { isSafe: true, sanitizedUrl: parsed.toString() };
}

/**
 * The full check for a URL that came from outside: the URL rules above, then every address the
 * name resolves to must be public (a public name can point at 127.0.0.1). Fetch the result with
 * redirect: 'manual' and check any Location again, or a redirect can lead inside.
 */
export async function resolveSafeOutboundUrl(rawUrl: string, allowedHosts?: string[]): Promise<SafeUrlResult & { addresses?: string[] }> {
  const first = validateSafeOutboundUrl(rawUrl, allowedHosts);
  if (!first.isSafe) return first;
  const host = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return { ...first, addresses: [host] };
  let addresses: string[];
  try {
    addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  } catch {
    return { isSafe: false, error: `Host '${host}' does not resolve.` };
  }
  const bad = addresses.find(isPrivateAddress);
  if (!addresses.length || bad) return { isSafe: false, error: `Host '${host}' resolves to a private address.` };
  return { ...first, addresses };
}

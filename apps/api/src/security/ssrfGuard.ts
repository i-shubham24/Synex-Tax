import { URL } from 'node:url';
import net from 'node:net';

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

/**
 * Checks whether an IPv6 address belongs to private or link-local ranges.
 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6
    const mappedIpv4 = lower.replace('::ffff:', '');
    return isPrivateIpv4(mappedIpv4);
  }
  return false;
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

  const hostname = parsed.hostname.toLowerCase();

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

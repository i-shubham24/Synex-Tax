import crypto from 'node:crypto';

export interface WebhookVerificationOptions {
  secret: string;
  signatureHeader: string;
  timestampHeader?: string;
  payload: string | Buffer;
  maxAgeSeconds?: number;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
}

const DEFAULT_MAX_AGE_SECONDS = 300; // 5 minutes replay window

/**
 * Verifies HMAC-SHA256 signature for incoming webhooks with replay protection.
 * Uses timing-safe buffer comparison to prevent timing side-channel attacks.
 */
export function verifyWebhookSignature(options: WebhookVerificationOptions): WebhookVerificationResult {
  const {
    secret,
    signatureHeader,
    timestampHeader,
    payload,
    maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
  } = options;

  if (!secret || typeof secret !== 'string') {
    return { isValid: false, error: 'Webhook secret is not configured' };
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { isValid: false, error: 'Missing webhook signature header' };
  }

  // 1. Replay protection: the timestamp is required, signed, and must be recent.
  if (!timestampHeader || !/^\d{9,11}$/.test(timestampHeader)) {
    return { isValid: false, error: 'Missing or invalid webhook timestamp header' };
  }
  const timestamp = parseInt(timestampHeader, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - timestamp > maxAgeSeconds) {
    return { isValid: false, error: `Webhook payload expired (max ${maxAgeSeconds}s)` };
  }
  if (timestamp - nowSeconds > 60) {
    return { isValid: false, error: 'Webhook timestamp is in the future' };
  }

  // 2. Compute expected HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestampHeader}.`, 'utf8');
  hmac.update(typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload);
  const expectedHex = hmac.digest('hex');

  // Strip optional 'sha256=' or 'v1=' prefix from provided header
  const cleanReceivedHex = signatureHeader.replace(/^(sha256=|v1=)/i, '').trim();

  // Validate hex format and length
  if (!/^[0-9a-f]{64}$/i.test(cleanReceivedHex)) {
    return { isValid: false, error: 'Malformed signature header format' };
  }

  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const receivedBuf = Buffer.from(cleanReceivedHex, 'hex');

  if (expectedBuf.length !== receivedBuf.length) {
    return { isValid: false, error: 'Signature length mismatch' };
  }

  // 3. Constant-time comparison
  const matches = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  if (!matches) {
    return { isValid: false, error: 'Signature verification failed: invalid signature' };
  }

  // 4. Each signed message is accepted once within its window.
  const now = Date.now();
  for (const [sig, until] of seenSignatures) if (until < now) seenSignatures.delete(sig);
  if (seenSignatures.has(cleanReceivedHex.toLowerCase())) {
    return { isValid: false, error: 'Webhook already received (replay)' };
  }
  seenSignatures.set(cleanReceivedHex.toLowerCase(), now + (maxAgeSeconds + 60) * 1000);

  return { isValid: true };
}

/** Signatures accepted within the replay window. Per instance; a shared store is needed across many. */
const seenSignatures = new Map<string, number>();

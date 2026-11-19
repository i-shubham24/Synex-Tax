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

  // 1. Replay attack protection via timestamp check
  if (timestampHeader) {
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      return { isValid: false, error: 'Invalid webhook timestamp header format' };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = nowSeconds - timestamp;

    if (ageSeconds > maxAgeSeconds) {
      return { isValid: false, error: `Webhook payload expired (${ageSeconds}s old, max ${maxAgeSeconds}s)` };
    }

    // Reject timestamps more than 60 seconds in the future
    if (timestamp - nowSeconds > 60) {
      return { isValid: false, error: 'Webhook timestamp is in the future' };
    }
  }

  // 2. Compute expected HMAC-SHA256 signature
  const rawPayload = typeof payload === 'string' ? payload : payload.toString('utf8');
  const signatureInput = timestampHeader ? `${timestampHeader}.${rawPayload}` : rawPayload;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signatureInput, 'utf8');
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

  return { isValid: true };
}

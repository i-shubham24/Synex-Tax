import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import { generateTotpCode } from './cryptoUtils.js';

// OWASP Password Storage Cheat Sheet, Argon2id minimum: m=19 MiB, t=2, p=1.
const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password, ARGON);
}

/** Never throws; false for malformed hashes. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(stored, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so response time does not reveal which accounts exist.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHash;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 160-bit TOTP secret, base32 (RFC 4226 recommends at least 128 bits). */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Returns the 30-second step the code matched (current step plus or minus one), or null.
 * Callers store the step and refuse any step at or below it, so a code cannot be replayed.
 */
export function matchTotpStep(code: string, secretBase32: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(nowMs / 1000 / 30);
  for (const step of [current, current - 1, current + 1]) {
    const expected = generateTotpCode(secretBase32, step);
    if (crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string): string {
  const label = encodeURIComponent(`SynexTax:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=SynexTax&algorithm=SHA1&digits=6&period=30`;
}

function mfaKey(): Buffer {
  const configured = process.env.MFA_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MFA_ENCRYPTION_KEY must be set in production (KMS data key, base64)');
  }
  return crypto.createHash('sha256').update('synextax-local-dev-mfa-key').digest();
}

/** AES-256-GCM: iv(12) | tag(16) | ciphertext. Stands in for the KMS envelope in production. */
export function encryptSecret(plain: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', mfaKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptSecret(blob: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', mfaKey(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

export function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Ten single-use recovery codes, shown once: xxxxx-xxxxx from an unambiguous alphabet. */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: count }, () => {
    const chars = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(.{5})(.{5})$/, '$1-$2');
}

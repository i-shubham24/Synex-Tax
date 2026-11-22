import crypto from 'node:crypto';
import { isLocalEnv } from '../../security/env.js';

/**
 * Message bodies are stored encrypted with AES-256-GCM under MESSAGES_ENCRYPTION_KEY (32 bytes,
 * base64). A fixed development key is used only when NODE_ENV is development or test; anywhere
 * else a missing or malformed key stops messages from being written or read (fails closed).
 *
 * Layout matches encryptSecret in security/authCrypto.ts: iv (12) | tag (16) | ciphertext.
 * The additional authenticated data binds a body to its firm, entity and message id, so a
 * ciphertext copied onto another row does not decrypt.
 */
export const MESSAGE_KEY_VERSION = 1;

export class MessagesKeyError extends Error {}

export function messagesKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = env.MESSAGES_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) throw new MessagesKeyError('MESSAGES_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
    return key;
  }
  if (!isLocalEnv(env)) throw new MessagesKeyError('MESSAGES_ENCRYPTION_KEY must be set outside local development');
  return crypto.createHash('sha256').update('synextax-local-dev-messages-key').digest();
}

/** True when a usable key is present (or the development default applies). */
export function messagesConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    messagesKey(env);
    return true;
  } catch {
    return false;
  }
}

const aad = (firmId: string, entityId: string, messageId: string) => Buffer.from(`synextax-message:v${MESSAGE_KEY_VERSION}:${firmId}:${entityId}:${messageId}`, 'utf8');

export function encryptMessage(plain: string, firmId: string, entityId: string, messageId: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', messagesKey(), iv);
  cipher.setAAD(aad(firmId, entityId, messageId));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptMessage(blob: Buffer, firmId: string, entityId: string, messageId: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', messagesKey(), blob.subarray(0, 12));
  decipher.setAAD(aad(firmId, entityId, messageId));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
}

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { s3StoreFromEnv } from '../../integrations/s3Store.js';
import { isLocalEnv } from '../../security/env.js';

/**
 * Where client documents are kept: an S3 bucket in Mumbai or Hyderabad when S3_BUCKET is set,
 * else local disk (FILE_STORE_DIR, or .uploads in development). A serverless deployment has no
 * persistent disk, so in production uploads stay switched off until one of the two is configured.
 */
export interface FileStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/;

export class LocalFileStore implements FileStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, body, { flag: 'wx', mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }
}

let store: FileStore | null | undefined;

export function getFileStore(): FileStore | null {
  if (store !== undefined) return store;
  const dir = process.env.FILE_STORE_DIR;
  const s3 = s3StoreFromEnv();
  if (s3) store = s3;
  else if (dir) store = new LocalFileStore(dir);
  else if (isLocalEnv()) store = new LocalFileStore(path.resolve(process.cwd(), '.uploads'));
  else store = null;
  return store;
}

/** For tests: use a given store. */
export function setFileStore(s: FileStore | null | undefined) {
  store = s;
}

export type PortalMime = 'image/jpeg' | 'image/png' | 'application/pdf';

/** The file's real type from its first bytes; only JPEG, PNG and PDF are accepted. */
export function detectPortalFile(buf: Buffer): { mime: PortalMime; ext: 'jpg' | 'png' | 'pdf' } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

export const MAX_PORTAL_FILE = 10 * 1024 * 1024;

export function storageKey(firmId: string, entityId: string, ext: string): string {
  return `${firmId}/${entityId}/${randomUUID()}.${ext}`;
}

export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

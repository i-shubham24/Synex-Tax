import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKUP_KEY_RE, s3StoreFromEnv, type S3FileStore } from '../../integrations/s3Store.js';
import { isLocalEnv } from '../../security/env.js';

/**
 * Where accounting backups go. With S3 configured (S3_BUCKET, an India S3_REGION and AWS keys)
 * the agent uploads each file straight to S3 through a presigned PUT. Otherwise the agent sends
 * the file to the API in chunks and it is kept on disk: BACKUP_STORE_DIR, or FILE_STORE_DIR/backups,
 * or .uploads/backups in development. A serverless deployment has no lasting disk, so there the
 * chunked mode stays off unless one of the folders is a mounted volume.
 */
export const MAX_BACKUP_BYTES = 500 * 1024 * 1024;
/** Each chunk stays under the 4.5 MB request limit of serverless platforms. */
export const CHUNK_BYTES = 4 * 1024 * 1024;

export type BackupStore = { mode: 'S3'; s3: S3FileStore } | { mode: 'CHUNKED'; local: LocalBackupStore };

export function backupKey(firmId: string, deviceId: string, ext: 'zip' | 'vyb'): string {
  return `backups/${firmId}/${deviceId}/${randomUUID()}.${ext}`;
}

export class OffsetMismatchError extends Error {
  constructor(readonly received: number) {
    super('Chunk offset does not match what was received.');
  }
}

/** Backups on local disk, written once: chunks go to a .part file, which is linked into place when complete. */
export class LocalBackupStore {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(readonly root: string) {}

  private resolve(key: string): string {
    if (!BACKUP_KEY_RE.test(key)) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  /** One writer per key at a time, so two retries of the same chunk cannot both append. */
  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(key, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === run) this.locks.delete(key);
    }
  }

  async received(key: string): Promise<number> {
    try {
      return (await fs.stat(`${this.resolve(key)}.part`)).size;
    } catch {
      return 0;
    }
  }

  /** Appends a chunk at `offset`, which must be exactly what has been received so far. */
  append(key: string, offset: number, chunk: Buffer): Promise<number> {
    return this.locked(key, async () => {
      const part = `${this.resolve(key)}.part`;
      const have = await this.received(key);
      if (offset !== have) throw new OffsetMismatchError(have);
      await fs.mkdir(path.dirname(part), { recursive: true, mode: 0o700 });
      await fs.appendFile(part, chunk, { mode: 0o600 });
      return have + chunk.length;
    });
  }

  /** Checks the whole file against its SHA-256 and moves it into place without overwriting. */
  finalize(key: string, expectedSha256: string): Promise<{ size: number; ok: boolean }> {
    return this.locked(key, async () => {
      const full = this.resolve(key);
      const part = `${full}.part`;
      const hash = createHash('sha256');
      let size = 0;
      for await (const buf of createReadStream(part)) {
        hash.update(buf as Buffer);
        size += (buf as Buffer).length;
      }
      if (hash.digest('hex') !== expectedSha256) {
        await fs.rm(part, { force: true });
        return { size, ok: false };
      }
      await fs.link(part, full); // fails if the key already exists
      await fs.rm(part, { force: true });
      return { size, ok: true };
    });
  }

  read(key: string): ReadStream {
    return createReadStream(this.resolve(key));
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await fs.stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    await fs.rm(full, { force: true });
    await fs.rm(`${full}.part`, { force: true });
  }
}

let store: BackupStore | null | undefined;

export function getBackupStore(): BackupStore | null {
  if (store !== undefined) return store;
  const s3 = s3StoreFromEnv();
  const dir = process.env.BACKUP_STORE_DIR || (process.env.FILE_STORE_DIR ? path.join(process.env.FILE_STORE_DIR, 'backups-store') : '');
  if (s3) store = { mode: 'S3', s3 };
  else if (dir) store = { mode: 'CHUNKED', local: new LocalBackupStore(dir) };
  else if (isLocalEnv()) store = { mode: 'CHUNKED', local: new LocalBackupStore(path.resolve(process.cwd(), '.uploads', 'backups-store')) };
  else store = null;
  return store;
}

/** For tests: use a given store. */
export function setBackupStore(s: BackupStore | null | undefined) {
  store = s;
}

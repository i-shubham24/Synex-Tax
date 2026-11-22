import type { FileStore } from '../modules/storage/fileStore.js';
import { awsCredentials, indiaRegion, presignAws, signAws, type AwsCredentials } from './aws.js';

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|pdf)$/;
/** Accounting backups: backups/<firm>/<device>/<uuid>.<zip|vyb>, uploaded by the desktop agent. */
export const BACKUP_KEY_RE = /^backups\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(zip|vyb)$/;

/**
 * Client documents in an S3 bucket in Mumbai or Hyderabad, encrypted at rest (SSE-S3). A key is
 * written once (If-None-Match), never overwritten. Settings: S3_BUCKET, S3_REGION, and the AWS
 * keys (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN).
 */
export class S3FileStore implements FileStore {
  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly credentials: AwsCredentials,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private url(key: string) {
    if (!KEY_RE.test(key)) throw new Error('Invalid storage key');
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const url = this.url(key);
    const headers = signAws({
      method: 'PUT', url, region: this.region, service: 's3', s3: true, body, credentials: this.credentials,
      headers: { 'content-type': 'application/octet-stream', 'x-amz-server-side-encryption': 'AES256', 'if-none-match': '*' },
    });
    const r = await this.fetchFn(url, { method: 'PUT', headers, body: new Uint8Array(body), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`S3 upload failed (${r.status})`);
  }

  async get(key: string): Promise<Buffer> {
    const url = this.url(key);
    // Reads are safe to repeat: a network error or a 5xx is retried twice, with backoff.
    for (let attempt = 0; ; attempt++) {
      const headers = signAws({ method: 'GET', url, region: this.region, service: 's3', s3: true, credentials: this.credentials });
      let r: Response | null = null;
      try {
        r = await this.fetchFn(url, { headers, signal: AbortSignal.timeout(30_000) });
      } catch (err) {
        if (attempt >= 2) throw err;
      }
      if (r?.ok) return Buffer.from(await r.arrayBuffer());
      if (r && (r.status < 500 || attempt >= 2)) throw new Error(`S3 read failed (${r.status})`);
      await new Promise((res) => setTimeout(res, 200 * 2 ** attempt + Math.random() * 100));
    }
  }

  private backupUrl(key: string) {
    if (!BACKUP_KEY_RE.test(key)) throw new Error('Invalid storage key');
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * A presigned PUT for one backup file, straight from the agent to S3. The signed headers make
   * S3 refuse a body of another size or SHA-256, and refuse to overwrite an existing key.
   */
  presignBackupPut(key: string, sizeBytes: number, sha256Hex: string, expiresSeconds = 3600): { url: string; headers: Record<string, string> } {
    if (!/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error('Invalid SHA-256');
    const headers = {
      'content-length': String(sizeBytes),
      'x-amz-checksum-sha256': Buffer.from(sha256Hex, 'hex').toString('base64'),
      'x-amz-server-side-encryption': 'AES256',
      'if-none-match': '*',
    };
    const url = presignAws({ method: 'PUT', url: this.backupUrl(key), region: this.region, service: 's3', credentials: this.credentials, expiresSeconds, headers });
    return { url, headers };
  }

  /** A short-lived download link that saves under the given file name. */
  presignBackupGet(key: string, fileName: string, expiresSeconds = 300): string {
    const u = new URL(this.backupUrl(key));
    const safe = fileName.replace(/[^\w .()-]+/g, '_').slice(0, 120) || 'backup';
    u.searchParams.set('response-content-disposition', `attachment; filename="${safe}"`);
    return presignAws({ method: 'GET', url: u.toString(), region: this.region, service: 's3', credentials: this.credentials, expiresSeconds });
  }

  /** The object's size, or null when it is not there. */
  async headBackup(key: string): Promise<{ size: number } | null> {
    const url = this.backupUrl(key);
    const headers = signAws({ method: 'HEAD', url, region: this.region, service: 's3', s3: true, credentials: this.credentials });
    const r = await this.fetchFn(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(15_000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 check failed (${r.status})`);
    return { size: Number(r.headers.get('content-length') ?? '0') };
  }

  async deleteBackup(key: string): Promise<void> {
    const url = this.backupUrl(key);
    const headers = signAws({ method: 'DELETE', url, region: this.region, service: 's3', s3: true, credentials: this.credentials });
    const r = await this.fetchFn(url, { method: 'DELETE', headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok && r.status !== 404) throw new Error(`S3 delete failed (${r.status})`);
  }
}

/** An S3 store when S3_BUCKET, an India S3_REGION and AWS keys are set; otherwise null. */
export function s3StoreFromEnv(env: NodeJS.ProcessEnv = process.env): S3FileStore | null {
  const bucket = env.S3_BUCKET?.trim();
  const region = indiaRegion(env.S3_REGION);
  const creds = awsCredentials(env);
  if (!bucket || !region || !creds || !/^[a-z0-9.-]{3,63}$/.test(bucket)) return null;
  return new S3FileStore(bucket, region, creds);
}

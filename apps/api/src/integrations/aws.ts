import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, enough for S3, SES and Bedrock without the AWS SDK. Only the India
 * regions (Mumbai ap-south-1, Hyderabad ap-south-2) are accepted, so client data stays in India.
 */

export const INDIA_REGIONS = new Set(['ap-south-1', 'ap-south-2']);

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export function awsCredentials(env: NodeJS.ProcessEnv = process.env): AwsCredentials | null {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) return null;
  return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN || undefined };
}

/** The region from a setting, refused unless it is in India. */
export function indiaRegion(value: string | undefined): string | null {
  const r = (value ?? '').trim();
  return INDIA_REGIONS.has(r) ? r : null;
}

const sha256Hex = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as AWS wants it (encodeURIComponent leaves !'()* alone). */
export function awsEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface SignInput {
  method: string;
  url: string;
  region: string;
  service: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  credentials: AwsCredentials;
  now?: Date;
  /** S3 signs the payload hash in a header and does not double-encode the path. */
  s3?: boolean;
}

export function signAws(input: SignInput): Record<string, string> {
  const u = new URL(input.url);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const body = input.body ?? '';
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  headers.host = u.host;
  headers['x-amz-date'] = amzDate;
  if (input.s3) headers['x-amz-content-sha256'] = payloadHash;
  if (input.credentials.sessionToken) headers['x-amz-security-token'] = input.credentials.sessionToken;

  const lower = Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = lower.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = lower.map(([k]) => k).join(';');

  const path = u.pathname || '/';
  const canonicalPath = input.s3 ? path : path.split('/').map((seg) => awsEncode(seg)).join('/');
  const query = [...u.searchParams.entries()].map(([k, v]) => [awsEncode(k), awsEncode(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');

  const canonical = [input.method.toUpperCase(), canonicalPath, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.credentials.secretAccessKey}`, day), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');

  const out: Record<string, string> = { ...headers };
  delete out.host;
  out.authorization = `AWS4-HMAC-SHA256 Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return out;
}

export interface PresignInput {
  method: string;
  url: string;
  region: string;
  service: string;
  credentials: AwsCredentials;
  /** How long the URL works, 1 second to 7 days. */
  expiresSeconds: number;
  /** Headers the caller must send exactly as signed (host is always signed). */
  headers?: Record<string, string>;
  now?: Date;
}

/**
 * A presigned URL (SigV4 in the query string), as S3 accepts for GET and PUT. The payload is not
 * signed (UNSIGNED-PAYLOAD); integrity of an upload comes from a signed x-amz-checksum-sha256 header.
 */
export function presignAws(input: PresignInput): string {
  if (!Number.isInteger(input.expiresSeconds) || input.expiresSeconds < 1 || input.expiresSeconds > 604800) throw new Error('expiresSeconds must be 1 to 604800');
  const u = new URL(input.url);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;

  const headers: Record<string, string> = { ...(input.headers ?? {}), host: u.host };
  const lower = Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonicalHeaders = lower.map(([k, v]) => `${k}:${v}\n`).join('');
  const signedHeaders = lower.map(([k]) => k).join(';');

  const params: Array<[string, string]> = [...u.searchParams.entries()];
  params.push(['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'], ['X-Amz-Credential', `${input.credentials.accessKeyId}/${scope}`], ['X-Amz-Date', amzDate], ['X-Amz-Expires', String(input.expiresSeconds)], ['X-Amz-SignedHeaders', signedHeaders]);
  if (input.credentials.sessionToken) params.push(['X-Amz-Security-Token', input.credentials.sessionToken]);
  const query = params.map(([k, v]) => [awsEncode(k), awsEncode(v)]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');

  const path = u.pathname || '/';
  const canonicalPath = input.service === 's3' ? path : path.split('/').map((seg) => awsEncode(seg)).join('/');
  const canonical = [input.method.toUpperCase(), canonicalPath, query, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.credentials.secretAccessKey}`, day), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return `${u.origin}${path}?${query}&X-Amz-Signature=${signature}`;
}

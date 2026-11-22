import { randomBytes } from 'node:crypto';
import { awsCredentials, indiaRegion, signAws } from './aws.js';
import { CircuitBreaker } from '../resilience/circuitBreaker.js';

/** After repeated failures, calls fail fast for a minute instead of piling up. */
const breaker = new CircuitBreaker({ name: 'SES', failureThreshold: 5, resetTimeoutMs: 60_000, timeoutMs: 15000 });

const TIMEOUT_MS = 10_000;

/**
 * Email through Amazon SES in Mumbai or Hyderabad (SES API v2). Settings: MAIL_FROM (a verified
 * sender), SES_REGION, and the AWS keys. Plain text; a message with attachments goes as raw MIME.
 */
export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  send(m: MailMessage): Promise<{ id: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** SES v2 takes raw messages of up to 40 MB; attachments stay well under it after base64. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** A header value with no line breaks, so a value cannot add headers of its own. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** RFC 2047 encoded word for a header that is not plain ASCII. */
function encodeHeader(s: string): string {
  const v = oneLine(s);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

/** A file name safe inside a quoted MIME parameter. */
function safeFilename(name: string): string {
  const cleaned = oneLine(name).replace(/["\\]/g, '_').replace(/[^\x20-\x7e]/g, '_').slice(0, 120);
  return cleaned || 'attachment';
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (line) => `${line}\r\n`);

/** A multipart/mixed message: the text, then each attachment, all base64 encoded. */
export function buildMime(from: string, m: MailMessage, boundary = `sx_${randomBytes(12).toString('hex')}`): string {
  const head = [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(m.to)}`,
    ...(m.replyTo && EMAIL_RE.test(m.replyTo) ? [`Reply-To: ${oneLine(m.replyTo)}`] : []),
    `Subject: ${encodeHeader(m.subject.slice(0, 200))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    [`--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(m.text, 'utf8').toString('base64'))].join('\r\n'),
    ...(m.attachments ?? []).map((a) => {
      const name = safeFilename(a.filename);
      const type = /^[a-z]+\/[a-z0-9.+-]+$/i.test(a.contentType) ? a.contentType : 'application/octet-stream';
      return [`--${boundary}`, `Content-Type: ${type}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`, 'Content-Transfer-Encoding: base64', '', wrap76(a.content.toString('base64'))].join('\r\n');
    }),
  ];
  return `${head.join('\r\n')}\r\n\r\n${parts.join('')}--${boundary}--\r\n`;
}

export function sesMailerFromEnv(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): Mailer | null {
  const from = env.MAIL_FROM?.trim();
  const region = indiaRegion(env.SES_REGION);
  const credentials = awsCredentials(env);
  if (!from || !region || !credentials) return null;
  return {
    async send(m) {
      if (!EMAIL_RE.test(m.to) || /[\r\n,;<>]/.test(m.to)) throw new Error('Not a valid email address.');
      const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
      let content: object;
      if (m.attachments?.length) {
        const total = m.attachments.reduce((n, a) => n + a.content.length, 0);
        if (total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments are too large to email.');
        content = { Raw: { Data: Buffer.from(buildMime(from, m), 'utf8').toString('base64') } };
      } else {
        content = { Simple: { Subject: { Data: m.subject.slice(0, 200), Charset: 'UTF-8' }, Body: { Text: { Data: m.text, Charset: 'UTF-8' } } } };
      }
      const body = JSON.stringify({
        FromEmailAddress: from,
        Destination: { ToAddresses: [m.to] },
        ...(m.replyTo && EMAIL_RE.test(m.replyTo) ? { ReplyToAddresses: [m.replyTo] } : {}),
        Content: content,
      });
      const timeout = m.attachments?.length ? TIMEOUT_MS * 3 : TIMEOUT_MS;
      const headers = signAws({ method: 'POST', url, region, service: 'ses', body, credentials, headers: { 'content-type': 'application/json' } });
      const r = await breaker.execute(async () => {
        const res = await fetchFn(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeout) });
        if (res.status >= 500) throw new Error(`SES answered ${res.status}`);
        return res;
      });
      const b = (await r.json().catch(() => ({}))) as { MessageId?: string; message?: string };
      if (!r.ok) throw new Error(`Email not sent (${r.status})`);
      return { id: b.MessageId ?? '' };
    },
  };
}

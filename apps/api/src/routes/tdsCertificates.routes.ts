import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { sesMailerFromEnv, type Mailer } from '../integrations/mail.js';
import { certificateWhatsAppFromEnv, type CertificateWhatsApp } from '../modules/certificates/certificateWhatsApp.js';
import { getFileStore, sha256, storageKey } from '../modules/storage/fileStore.js';
import { publicMessage } from '../plugins/publicError.js';
import { AgentKeyMissingError, issueAgentChallenge } from '../security/agentChallenge.js';

/**
 * TDS certificates sent to payees. Mounted at /api/v1/tds/certificates. (POST /api/v1/tds/certificates
 * itself belongs to the lower deduction register, so uploaded PDFs live under /files.)
 *
 * The firm uploads the PDFs the TRACES converter produced, unchanged: the browser reads each one
 * from the desktop agent's certificates folder (with a certs.read challenge from this server) and
 * sends it here with the deductor client, payee PAN and quarter. SynexTax never makes or alters
 * these PDFs. Each is then emailed to the payee as an attachment and, when WhatsApp is set up,
 * announced with a download link that works for 7 days and serves that one certificate. Every
 * attempt is logged with who sent it, when, the channel and the outcome.
 */

export const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
const LINK_DAYS = 7;
const MAX_LINK_DOWNLOADS = 20;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export const maskPan = (pan: string) => (PAN_RE.test(pan) ? `XXXXX${pan.slice(5)}` : pan);
const maskMobile = (m: string) => (m.length > 4 ? `${'*'.repeat(m.length - 4)}${m.slice(-4)}` : m);

/** The same test the agent applies: a PDF signature dictionary with a byte range and contents. */
export function pdfLooksSigned(pdf: Buffer): boolean {
  const has = (s: string) => pdf.includes(Buffer.from(s, 'latin1'));
  return has('/ByteRange') && has('/Contents') && (has('/Type /Sig') || has('/Type/Sig') || has('/FT /Sig') || has('/FT/Sig'));
}

let senders: { mailer?: Mailer | null; whatsapp?: CertificateWhatsApp | null } = {};
/** For tests: replace the email and WhatsApp senders (undefined goes back to the environment). */
export function setCertificateSenders(s: { mailer?: Mailer | null; whatsapp?: CertificateWhatsApp | null }) {
  senders = s;
}
const mailer = () => (senders.mailer !== undefined ? senders.mailer : sesMailerFromEnv());
const whatsapp = () => (senders.whatsapp !== undefined ? senders.whatsapp : certificateWhatsAppFromEnv());

/** Where download links point: APP_URL, or the local web app in development. */
function linkBase(): string | null {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (configured) return configured;
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? 'http://localhost:3000' : null;
}

const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: 'USER' as const,
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const Upload = z.object({
  entityId: z.string().regex(UUID_RE),
  payeePan: z.string().trim().toUpperCase().regex(PAN_RE),
  taxYear: z.string().regex(/^20\d{2}-\d{2}$/),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  fileName: z.string().trim().min(5).max(200),
  pdfBase64: z.string().min(8).max(Math.ceil((MAX_CERTIFICATE_BYTES * 5) / 3)), // a little over 2 MB decoded, so the size check below answers
});
const Send = z.object({
  items: z
    .array(
      z.object({
        certificateId: z.string().regex(UUID_RE),
        email: z.preprocess(blankToUndef, z.string().trim().max(254).regex(EMAIL_RE).optional()),
        mobile: z.preprocess(blankToUndef, z.string().trim().regex(/^\+91[6-9]\d{9}$/).optional()),
      }),
    )
    .min(1)
    .max(100),
  whatsapp: z.boolean().default(true),
});

interface CertRow {
  id: string;
  entity_id: string;
  payee_pan: string;
  tax_year: string;
  quarter: string;
  file_name: string;
  storage_key: string;
  sha256: string;
  client: string;
  firm: string;
}

export async function tdsCertificatesRoutes(fastify: FastifyInstance) {
  // ------------------------------------------------------------------
  // Public: a payee's download link. The token is the credential.
  // ------------------------------------------------------------------
  fastify.register(async (pub) => {
    pub.get('/download', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      const token = String((request.query as { token?: string }).token ?? '');
      const gone = () => reply.status(404).type('text/plain; charset=utf-8').send('This link has expired or been withdrawn. Ask the deductor for the certificate again.');
      if (!TOKEN_RE.test(token)) return gone();
      const link = await db.withAnonymousTransaction(async (c) =>
        (await c.query<{ link_id: string; firm_id: string; certificate_id: string }>('SELECT * FROM app.resolve_certificate_link($1)', [sha256(token)])).rows[0],
      );
      if (!link) return gone();
      const store = getFileStore();
      if (!store) return reply.status(503).type('text/plain; charset=utf-8').send('Downloads are not available right now.');
      const cert = await db.withSystemTransaction(link.firm_id, async (c) => {
        const r = await c.query<{ storage_key: string; file_name: string; sha256: string }>(
          `UPDATE public.tds_certificate_links SET downloads = downloads + 1, last_download_at = now()
           WHERE id = $1 AND downloads < $2
           RETURNING (SELECT storage_key FROM public.tds_certificates WHERE id = certificate_id),
                     (SELECT file_name FROM public.tds_certificates WHERE id = certificate_id),
                     (SELECT sha256 FROM public.tds_certificates WHERE id = certificate_id)`,
          [link.link_id, MAX_LINK_DOWNLOADS],
        );
        return r.rows[0];
      }, { ip: request.ip, requestId: request.id, userAgent: request.headers['user-agent'] });
      if (!cert) return gone();
      const body = await store.get(cert.storage_key);
      if (sha256(body) !== cert.sha256) {
        request.log.error({ link: link.link_id }, 'Stored certificate does not match its checksum');
        return reply.status(500).type('text/plain; charset=utf-8').send('This certificate cannot be served. Ask the deductor to send it again.');
      }
      const name = cert.file_name.replace(/[^\w .()-]+/g, '_');
      return reply
        .header('Cache-Control', 'no-store')
        .header('Content-Disposition', `attachment; filename="${name}"`)
        .header('X-Content-Type-Options', 'nosniff')
        .type('application/pdf')
        .send(body);
    });
  });

  // ------------------------------------------------------------------
  // The firm's side.
  // ------------------------------------------------------------------
  fastify.register(async (app) => {
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
    });

    // Single-use tokens for the agent's certs.read, one per PDF to be read.
    app.post('/agent-challenge', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = z.object({ count: z.number().int().min(1).max(100).default(1) }).safeParse(request.body ?? {});
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Ask for 1 to 100 codes.' });
      try {
        return reply.status(201).send({ tokens: Array.from({ length: b.data.count }, () => issueAgentChallenge('certs.read').token) });
      } catch (err) {
        if (err instanceof AgentKeyMissingError) return reply.status(503).send({ error: 'AGENT_KEY_MISSING', message: err.message });
        throw err;
      }
    });

    // Certificates of one client and quarter, with the latest attempt on each channel.
    app.get('/files', async (request, reply) => {
      const q = z
        .object({ entityId: z.string().regex(UUID_RE), taxYear: z.string().regex(/^20\d{2}-\d{2}$/).optional(), quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional() })
        .safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: 'Invalid', message: 'Choose a client.' });
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (
          await c.query(
            `SELECT t.id, t.payee_pan, t.tax_year, t.quarter, t.file_name, t.size_bytes, t.uploaded_at,
                    em.status AS email_status, em.sent_at AS email_at, wa.status AS whatsapp_status, wa.sent_at AS whatsapp_at
             FROM public.tds_certificates t
             LEFT JOIN LATERAL (SELECT status, sent_at FROM public.tds_certificate_sends s WHERE s.certificate_id = t.id AND s.channel = 'EMAIL' ORDER BY sent_at DESC LIMIT 1) em ON true
             LEFT JOIN LATERAL (SELECT status, sent_at FROM public.tds_certificate_sends s WHERE s.certificate_id = t.id AND s.channel = 'WHATSAPP' ORDER BY sent_at DESC LIMIT 1) wa ON true
             WHERE t.entity_id = $1 AND ($2::text IS NULL OR t.tax_year = $2) AND ($3::text IS NULL OR t.quarter = $3)
             ORDER BY t.uploaded_at DESC LIMIT 500`,
            [q.data.entityId, q.data.taxYear ?? null, q.data.quarter ?? null],
          )
        ).rows,
      );
      return reply.send({
        certificates: rows.map((r) => ({
          id: r.id,
          pan: maskPan(r.payee_pan),
          taxYear: r.tax_year,
          quarter: r.quarter,
          fileName: r.file_name,
          sizeBytes: r.size_bytes,
          uploadedAt: r.uploaded_at,
          email: r.email_status ? { status: r.email_status, at: r.email_at } : null,
          whatsapp: r.whatsapp_status ? { status: r.whatsapp_status, at: r.whatsapp_at } : null,
        })),
      });
    });

    // One PDF, as the TRACES converter produced it.
    app.post('/files', { bodyLimit: 4 * 1024 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = Upload.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the client, payee PAN, tax year, quarter and the PDF.' });
      const d = b.data;
      const pdf = Buffer.from(d.pdfBase64, 'base64');
      if (pdf.length === 0 || pdf.length > MAX_CERTIFICATE_BYTES) return reply.status(413).send({ error: 'Too large', message: 'A certificate PDF can be at most 2 MB.' });
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return reply.status(415).send({ error: 'Not a PDF', message: 'This file is not a PDF.' });
      if (!pdfLooksSigned(pdf)) return reply.status(422).send({ error: 'Not signed', message: 'This PDF carries no digital signature. Run the TRACES converter with your signature first.' });
      const namePans = d.fileName.toUpperCase().match(/[A-Z]{5}[0-9]{4}[A-Z]/g) ?? [];
      if (namePans.length !== 1 || namePans[0] !== d.payeePan) return reply.status(422).send({ error: 'PAN mismatch', message: 'The file name must carry the payee PAN, and only that PAN.' });
      const store = getFileStore();
      if (!store) return reply.status(503).send({ error: 'Unavailable', message: 'File storage is not set up yet.' });
      const hash = sha256(pdf);
      const fileName = d.fileName.replace(/^.*[\\/]/, '').replace(/[^\w .()-]+/g, '_').slice(0, 120);

      try {
        const existing = await db.withTenantTransaction(ctx(request), async (c) => {
          const ent = await c.query('SELECT 1 FROM public.entities WHERE id = $1', [d.entityId]);
          if (!ent.rowCount) return 'NO_CLIENT' as const;
          return (await c.query<{ id: string }>('SELECT id FROM public.tds_certificates WHERE entity_id = $1 AND sha256 = $2', [d.entityId, hash])).rows[0]?.id ?? null;
        });
        if (existing === 'NO_CLIENT') return reply.status(404).send({ error: 'Not found', message: 'That client is not in your list.' });
        if (existing) return reply.send({ id: existing, duplicate: true });
        const key = storageKey(request.user.firmId, d.entityId, 'pdf');
        await store.put(key, pdf);
        const id = await db.withTenantTransaction(ctx(request), async (c) =>
          (
            await c.query<{ id: string }>(
              `INSERT INTO public.tds_certificates (firm_id, entity_id, payee_pan, tax_year, quarter, file_name, storage_key, size_bytes, sha256, uploaded_by)
               VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, app.current_user_id())
               ON CONFLICT (firm_id, entity_id, sha256) DO NOTHING RETURNING id`,
              [d.entityId, d.payeePan, d.taxYear, d.quarter, fileName, key, pdf.length, hash],
            )
          ).rows[0]?.id ?? (await c.query<{ id: string }>('SELECT id FROM public.tds_certificates WHERE entity_id = $1 AND sha256 = $2', [d.entityId, hash])).rows[0]?.id,
        );
        return reply.status(201).send({ id });
      } catch (err) {
        request.log.error({ err }, 'Certificate upload failed');
        return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
      }
    });

    // Addresses we already know for these payees: the last ones used, else the deductee records.
    app.post('/recipients', async (request, reply) => {
      const b = z.object({ entityId: z.string().regex(UUID_RE), pans: z.array(z.string().regex(PAN_RE)).min(1).max(500) }).safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Choose a client and payees.' });
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (
          await c.query<{ pan: string; email: string | null; mobile: string | null; name: string | null }>(
            `SELECT p.pan,
                    COALESCE(
                      (SELECT s.recipient FROM public.tds_certificate_sends s JOIN public.tds_certificates t ON t.id = s.certificate_id
                        WHERE t.entity_id = $1 AND t.payee_pan = p.pan AND s.channel = 'EMAIL' ORDER BY s.sent_at DESC LIMIT 1),
                      (SELECT d.residence_email FROM public.tds_deductees d
                        WHERE d.entity_id = $1 AND d.deductee_pan = p.pan AND d.residence_email IS NOT NULL ORDER BY d.created_at DESC LIMIT 1)
                    ) AS email,
                    (SELECT s.recipient FROM public.tds_certificate_sends s JOIN public.tds_certificates t ON t.id = s.certificate_id
                      WHERE t.entity_id = $1 AND t.payee_pan = p.pan AND s.channel = 'WHATSAPP' ORDER BY s.sent_at DESC LIMIT 1) AS mobile,
                    (SELECT d.deductee_name FROM public.tds_deductees d WHERE d.entity_id = $1 AND d.deductee_pan = p.pan ORDER BY d.created_at DESC LIMIT 1) AS name
             FROM unnest($2::text[]) AS p(pan)`,
            [b.data.entityId, b.data.pans],
          )
        ).rows,
      );
      return reply.send({ recipients: Object.fromEntries(rows.map((r) => [r.pan, { email: r.email, mobile: r.mobile, name: r.name }])) });
    });

    // Email each certificate as an attachment; on WhatsApp, a 7-day link for that certificate only.
    app.post('/send', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = Send.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Check the email addresses and mobile numbers (+91 and 10 digits).' });
      const store = getFileStore();
      const mail = mailer();
      const wa = b.data.whatsapp ? whatsapp() : null;
      const base = linkBase();
      const results: Array<{ certificateId: string; email: string | null; whatsapp: string | null; message?: string }> = [];

      for (const item of b.data.items) {
        const cert = await db.withTenantTransaction(ctx(request), async (c) =>
          (
            await c.query<CertRow>(
              `SELECT t.id, t.entity_id, t.payee_pan, t.tax_year, t.quarter, t.file_name, t.storage_key, t.sha256,
                      COALESCE(e.trade_name, e.legal_name) AS client, COALESCE(f.trade_name, f.legal_name) AS firm
               FROM public.tds_certificates t JOIN public.entities e ON e.id = t.entity_id JOIN public.firms f ON f.id = t.firm_id
               WHERE t.id = $1`,
              [item.certificateId],
            )
          ).rows[0],
        );
        if (!cert) {
          results.push({ certificateId: item.certificateId, email: null, whatsapp: null, message: 'Certificate not found.' });
          continue;
        }
        const out: (typeof results)[number] = { certificateId: cert.id, email: null, whatsapp: null };
        const period = `${cert.quarter} ${cert.tax_year}`;
        const logs: Array<{ channel: 'EMAIL' | 'WHATSAPP'; recipient: string; status: string; providerId?: string; error?: string; linkToken?: string }> = [];

        if (item.email) {
          if (!mail || !store) {
            logs.push({ channel: 'EMAIL', recipient: item.email, status: 'NOT_SET_UP', error: 'Email is not set up.' });
          } else {
            try {
              const pdf = await store.get(cert.storage_key);
              if (sha256(pdf) !== cert.sha256) throw new Error('Stored file does not match its checksum.');
              const sent = await mail.send({
                to: item.email,
                subject: `TDS certificate ${period} from ${cert.client}`,
                text: `Dear payee,\n\nAttached is your TDS certificate for ${period} (PAN ${maskPan(cert.payee_pan)}), issued by ${cert.client}. It is the digitally signed PDF generated by TRACES.\n\nSent on behalf of ${cert.client} by ${cert.firm}.`,
                attachments: [{ filename: cert.file_name, contentType: 'application/pdf', content: pdf }],
              });
              logs.push({ channel: 'EMAIL', recipient: item.email, status: 'SENT', providerId: sent.id });
            } catch (err) {
              logs.push({ channel: 'EMAIL', recipient: item.email, status: 'FAILED', error: (err as Error).message.slice(0, 300) });
            }
          }
        }

        if (item.mobile && b.data.whatsapp) {
          if (!wa || !store || !base) {
            logs.push({ channel: 'WHATSAPP', recipient: item.mobile, status: 'NOT_SET_UP', error: 'WhatsApp is not set up.' });
          } else {
            const token = randomBytes(32).toString('base64url');
            const expires = new Date(Date.now() + LINK_DAYS * 86400_000);
            try {
              const sent = await wa.sendCertificateLink(item.mobile, [
                cert.client,
                `TDS certificate ${period}`,
                `${base}/api/v1/tds/certificates/download?token=${token}`,
                expires.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
              ]);
              logs.push({ channel: 'WHATSAPP', recipient: item.mobile, status: 'SENT', providerId: sent.id, linkToken: token });
            } catch (err) {
              logs.push({ channel: 'WHATSAPP', recipient: item.mobile, status: 'FAILED', error: (err as Error).message.slice(0, 300) });
            }
          }
        }

        if (!logs.length) out.message = 'No email address or mobile number.';
        await db.withTenantTransaction(ctx(request), async (c) => {
          for (const l of logs) {
            let linkId: string | null = null;
            // The link is stored only once the message went out, and only as its hash.
            if (l.linkToken) {
              linkId = (
                await c.query<{ id: string }>(
                  `INSERT INTO public.tds_certificate_links (firm_id, entity_id, certificate_id, payee_pan, token_hash, expires_at, created_by)
                   VALUES (app.current_firm_id(), $1, $2, $3, $4, now() + interval '${LINK_DAYS} days', app.current_user_id()) RETURNING id`,
                  [cert.entity_id, cert.id, cert.payee_pan, sha256(l.linkToken)],
                )
              ).rows[0].id;
            }
            await c.query(
              `INSERT INTO public.tds_certificate_sends (firm_id, entity_id, certificate_id, channel, recipient, status, provider_id, error, link_id, sent_by)
               VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, app.current_user_id())`,
              [cert.entity_id, cert.id, l.channel, l.recipient, l.status, l.providerId ?? null, l.error ?? null, linkId],
            );
            if (l.channel === 'EMAIL') out.email = l.status;
            else out.whatsapp = l.status;
          }
        });
        results.push(out);
      }
      return reply.send({
        results,
        emailSetUp: Boolean(mail),
        whatsappSetUp: Boolean(b.data.whatsapp && wa && base),
      });
    });

    // The send log of one certificate.
    app.get('/:id/sends', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'Invalid' });
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (
          await c.query(
            `SELECT s.channel, s.recipient, s.status, s.error, s.sent_at, u.display_name AS sent_by, l.expires_at AS link_expires_at, l.downloads
             FROM public.tds_certificate_sends s
             LEFT JOIN public.users u ON u.id = s.sent_by
             LEFT JOIN public.tds_certificate_links l ON l.id = s.link_id
             WHERE s.certificate_id = $1 ORDER BY s.sent_at DESC LIMIT 100`,
            [id],
          )
        ).rows,
      );
      return reply.send({
        sends: rows.map((r) => ({
          channel: r.channel,
          recipient: r.channel === 'WHATSAPP' ? maskMobile(r.recipient) : r.recipient,
          status: r.status,
          error: r.error,
          sentAt: r.sent_at,
          sentBy: r.sent_by,
          linkExpiresAt: r.link_expires_at,
          downloads: r.downloads,
        })),
      });
    });
  });
}

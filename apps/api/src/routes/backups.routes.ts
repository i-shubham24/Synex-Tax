import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { sesMailerFromEnv, type Mailer } from '../integrations/mail.js';
import { CHUNK_BYTES, MAX_BACKUP_BYTES, OffsetMismatchError, backupKey, getBackupStore, type BackupStore } from '../modules/backups/backupStore.js';
import { sha256 } from '../modules/storage/fileStore.js';
import { cronAllowed } from '../plugins/cronAuth.js';

/**
 * Accounting backups uploaded by the desktop agent. Mounted at /api/v1/backups.
 *
 * A partner or manager adds a device and gets its token once; the agent keeps it in its own
 * config file and sends it as `Authorization: Device <token>`. Only the token's SHA-256 is kept.
 * Rules say what the agent backs up and when; each upload becomes a version. Unchanged data (the
 * same content hash as the last version) is not uploaded again. Files go straight to S3 through
 * a presigned PUT when S3 is set up, otherwise to the API in resumable 4 MB chunks.
 * GET /check-late (scheduled, CRON_SECRET) emails the partners about backups more than a day late.
 */

const PRODUCTS = ['tally', 'busy', 'marg', 'zoho', 'vyapar'] as const;
const PRODUCT_LABEL: Record<string, string> = { tally: 'Tally', busy: 'Busy', marg: 'Marg', zoho: 'Zoho Books', vyapar: 'Vyapar' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_TOKEN_RE = /^sxd_[A-Za-z0-9_-]{43}$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** A rule is late when its last good backup is older than a day plus two hours' grace. */
export const LATE_HOURS = 26;

let mailOverride: Mailer | null | undefined;
/** For tests: replace the mailer used for late notices (undefined goes back to the environment). */
export function setBackupMailer(m: Mailer | null | undefined) {
  mailOverride = m;
}

declare module 'fastify' {
  interface FastifyRequest {
    device?: { id: string; firmId: string };
  }
}

const userCtx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
const deviceMeta = (req: FastifyRequest) => ({ ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });

const extFor = (product: string): 'zip' | 'vyb' => (product === 'vyapar' ? 'vyb' : 'zip');

/** Versions of a rule older than its retention, never the newest complete one. */
async function applyRetention(firmId: string, ruleId: string, store: BackupStore, meta: ReturnType<typeof deviceMeta>) {
  const old = await db.withSystemTransaction(firmId, async (c) =>
    (
      await c.query<{ id: string; storage_key: string }>(
        `SELECT v.id, v.storage_key FROM public.backup_versions v JOIN public.backup_rules r ON r.id = v.rule_id
         WHERE v.rule_id = $1 AND v.status = 'COMPLETE' AND r.retention_days IS NOT NULL
           AND v.completed_at < now() - make_interval(days => r.retention_days)
           AND v.id <> (SELECT id FROM public.backup_versions WHERE rule_id = $1 AND status = 'COMPLETE' ORDER BY completed_at DESC LIMIT 1)
         LIMIT 200`,
        [ruleId],
      )
    ).rows,
  meta);
  for (const v of old) {
    try {
      if (store.mode === 'S3') await store.s3.deleteBackup(v.storage_key);
      else await store.local.delete(v.storage_key);
      await db.withSystemTransaction(firmId, (c) => c.query(`UPDATE public.backup_versions SET status = 'DELETED', deleted_at = now() WHERE id = $1`, [v.id]), meta);
    } catch {
      // Left for the next run.
    }
  }
}

export async function backupsRoutes(fastify: FastifyInstance) {
  // ------------------------------------------------------------------
  // The desktop agent, authenticated by its device token.
  // ------------------------------------------------------------------
  fastify.register(
    async (agent) => {
      agent.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: CHUNK_BYTES + 1024 }, (_req, body, done) => done(null, body));

      agent.addHook('onRequest', async (request, reply) => {
        const m = /^Device (\S+)$/.exec(String(request.headers.authorization ?? ''));
        if (!m || !DEVICE_TOKEN_RE.test(m[1])) return reply.status(401).send({ error: 'Unauthorized', message: 'This device is not paired. Add it again in SynexTax settings.' });
        const row = await db.withAnonymousTransaction(async (c) =>
          (await c.query<{ device_id: string; firm_id: string }>('SELECT * FROM app.resolve_backup_device($1)', [sha256(m[1])])).rows[0],
        );
        if (!row) return reply.status(401).send({ error: 'Unauthorized', message: 'This device token has been withdrawn. Add the device again in SynexTax settings.' });
        request.device = { id: row.device_id, firmId: row.firm_id };
      });

      const sys = <T>(req: FastifyRequest, fn: (c: PoolClient) => Promise<T>) => db.withSystemTransaction<T>(req.device!.firmId, fn, deviceMeta(req));

      agent.get('/config', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
        const version = String(request.headers['x-agent-version'] ?? '').slice(0, 20).replace(/[^\w.-]/g, '') || null;
        const data = await sys(request, async (c) => {
          await c.query(
            `UPDATE public.backup_devices SET last_seen_at = now(), agent_version = COALESCE($2, agent_version)
             WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes' OR agent_version IS DISTINCT FROM COALESCE($2, agent_version))`,
            [request.device!.id, version],
          );
          const dev = (await c.query<{ name: string }>('SELECT name FROM public.backup_devices WHERE id = $1', [request.device!.id])).rows[0];
          const rules = (
            await c.query<{ id: string; product: string; source_folder: string | null; daily_time: string; label: string }>(
              `SELECT id, product, source_folder, to_char(daily_time, 'HH24:MI') AS daily_time, label FROM public.backup_rules WHERE device_id = $1 AND enabled ORDER BY created_at`,
              [request.device!.id],
            )
          ).rows;
          return { dev, rules };
        });
        return reply.send({
          device: { id: request.device!.id, name: data.dev?.name ?? '' },
          timezone: 'Asia/Kolkata',
          chunkBytes: CHUNK_BYTES,
          maxBytes: MAX_BACKUP_BYTES,
          rules: data.rules.map((r) => ({ id: r.id, product: r.product, label: r.label, sourceFolder: r.source_folder, dailyTime: r.daily_time })),
        });
      });

      const Start = z.object({
        ruleId: z.string().regex(UUID_RE),
        fileName: z.string().trim().min(1).max(160),
        sizeBytes: z.number().int().min(1).max(MAX_BACKUP_BYTES),
        sha256: z.string().regex(HEX64),
        contentSha256: z.string().regex(HEX64),
      });

      agent.post('/uploads', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
        const b = Start.safeParse(request.body);
        if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Files of up to 500 MB, with their SHA-256.' });
        const d = b.data;
        const store = getBackupStore();
        if (!store) return reply.status(503).send({ error: 'Unavailable', message: 'Backup storage is not set up on the server.' });
        const out = await sys(request, async (c) => {
          const rule = (await c.query<{ product: string }>('SELECT product FROM public.backup_rules WHERE id = $1 AND device_id = $2 AND enabled', [d.ruleId, request.device!.id])).rows[0];
          if (!rule) return { kind: 'NO_RULE' as const };
          const ext = extFor(rule.product);
          if (!d.fileName.toLowerCase().endsWith(`.${ext}`)) return { kind: 'BAD_NAME' as const, ext };
          const last = (
            await c.query<{ id: string; sha256: string; content_sha256: string }>(
              `SELECT id, sha256, content_sha256 FROM public.backup_versions WHERE rule_id = $1 AND status = 'COMPLETE' ORDER BY completed_at DESC LIMIT 1`,
              [d.ruleId],
            )
          ).rows[0];
          if (last && (last.content_sha256 === d.contentSha256 || last.sha256 === d.sha256)) {
            await c.query('UPDATE public.backup_rules SET last_success_at = now(), last_error = NULL, last_error_at = NULL WHERE id = $1', [d.ruleId]);
            return { kind: 'UNCHANGED' as const, versionId: last.id };
          }
          const pending = (
            await c.query<{ id: string; storage_key: string; upload_mode: string }>(
              `SELECT id, storage_key, upload_mode FROM public.backup_versions WHERE rule_id = $1 AND status = 'UPLOADING' AND sha256 = $2 AND size_bytes = $3 AND upload_mode = $4 ORDER BY created_at DESC LIMIT 1`,
              [d.ruleId, d.sha256, d.sizeBytes, store.mode],
            )
          ).rows[0];
          if (pending) return { kind: 'UPLOAD' as const, id: pending.id, key: pending.storage_key };
          const key = backupKey(request.device!.firmId, request.device!.id, ext);
          const id = (
            await c.query<{ id: string }>(
              `INSERT INTO public.backup_versions (firm_id, device_id, rule_id, product, file_name, size_bytes, sha256, content_sha256, storage_key, upload_mode)
               VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [request.device!.id, d.ruleId, rule.product, d.fileName.replace(/[^\w .()-]+/g, '_'), d.sizeBytes, d.sha256, d.contentSha256, key, store.mode],
            )
          ).rows[0].id;
          return { kind: 'UPLOAD' as const, id, key };
        });
        if (out.kind === 'NO_RULE') return reply.status(404).send({ error: 'Not found', message: 'This backup rule is not set for this device, or is switched off.' });
        if (out.kind === 'BAD_NAME') return reply.status(400).send({ error: 'Invalid', message: `This product's backups are .${out.ext} files.` });
        if (out.kind === 'UNCHANGED') return reply.send({ unchanged: true, versionId: out.versionId });
        if (store.mode === 'S3') {
          const p = store.s3.presignBackupPut(out.key, d.sizeBytes, d.sha256);
          return reply.status(201).send({ uploadId: out.id, mode: 'S3', url: p.url, headers: p.headers });
        }
        return reply.status(201).send({ uploadId: out.id, mode: 'CHUNKED', chunkBytes: CHUNK_BYTES, received: await store.local.received(out.key) });
      });

      async function pendingUpload(request: FastifyRequest) {
        const { id } = request.params as { id: string };
        if (!UUID_RE.test(id)) return null;
        return (
          await sys(request, async (c) =>
            (
              await c.query<{ id: string; rule_id: string; storage_key: string; size_bytes: string; sha256: string; upload_mode: string; status: string }>(
                'SELECT id, rule_id, storage_key, size_bytes, sha256, upload_mode, status FROM public.backup_versions WHERE id = $1 AND device_id = $2',
                [id, request.device!.id],
              )
            ).rows[0],
          )
        ) ?? null;
      }

      agent.get('/uploads/:id', async (request, reply) => {
        const v = await pendingUpload(request);
        if (!v) return reply.status(404).send({ error: 'Not found' });
        const store = getBackupStore();
        const received = v.upload_mode === 'CHUNKED' && store?.mode === 'CHUNKED' && v.status === 'UPLOADING' ? await store.local.received(v.storage_key) : null;
        return reply.send({ status: v.status, mode: v.upload_mode, received });
      });

      agent.put('/uploads/:id/chunk', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (request, reply) => {
        const offset = Number((request.query as { offset?: string }).offset);
        const body = request.body;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Buffer.isBuffer(body) || body.length === 0) return reply.status(400).send({ error: 'Invalid', message: 'Send a chunk with its offset.' });
        const v = await pendingUpload(request);
        if (!v || v.status !== 'UPLOADING' || v.upload_mode !== 'CHUNKED') return reply.status(404).send({ error: 'Not found' });
        const store = getBackupStore();
        if (!store || store.mode !== 'CHUNKED') return reply.status(503).send({ error: 'Unavailable' });
        if (offset + body.length > Number(v.size_bytes)) return reply.status(400).send({ error: 'Too large', message: 'The chunk goes past the declared size.' });
        try {
          return reply.send({ received: await store.local.append(v.storage_key, offset, body) });
        } catch (err) {
          if (err instanceof OffsetMismatchError) return reply.status(409).send({ error: 'Offset', message: err.message, received: err.received });
          throw err;
        }
      });

      agent.post('/uploads/:id/complete', async (request, reply) => {
        const v = await pendingUpload(request);
        if (!v) return reply.status(404).send({ error: 'Not found' });
        if (v.status === 'COMPLETE') return reply.send({ versionId: v.id, status: 'COMPLETE' });
        if (v.status !== 'UPLOADING') return reply.status(409).send({ error: 'Closed', message: 'This upload was abandoned. Start it again.' });
        const store = getBackupStore();
        if (!store) return reply.status(503).send({ error: 'Unavailable' });
        const size = Number(v.size_bytes);
        let ok: boolean;
        if (store.mode === 'S3' && v.upload_mode === 'S3') {
          // S3 has already checked the SHA-256 (signed x-amz-checksum-sha256) and the size.
          const head = await store.s3.headBackup(v.storage_key);
          if (!head) return reply.status(409).send({ error: 'Missing', message: 'The file has not reached storage yet.' });
          ok = head.size === size;
        } else if (store.mode === 'CHUNKED' && v.upload_mode === 'CHUNKED') {
          const received = await store.local.received(v.storage_key);
          if (received !== size) return reply.status(409).send({ error: 'Incomplete', message: 'Not every chunk has arrived.', received });
          ok = (await store.local.finalize(v.storage_key, v.sha256)).ok;
        } else {
          return reply.status(409).send({ error: 'Closed', message: 'Storage changed since this upload started. Start it again.' });
        }
        await sys(request, async (c) => {
          if (ok) {
            await c.query(`UPDATE public.backup_versions SET status = 'COMPLETE', completed_at = now() WHERE id = $1`, [v.id]);
            await c.query('UPDATE public.backup_rules SET last_success_at = now(), last_error = NULL, last_error_at = NULL WHERE id = $1', [v.rule_id]);
          } else {
            await c.query(`UPDATE public.backup_versions SET status = 'FAILED' WHERE id = $1`, [v.id]);
          }
        });
        if (!ok) return reply.status(422).send({ error: 'Checksum', message: 'The file that arrived does not match its SHA-256. Upload it again.' });
        await applyRetention(request.device!.firmId, v.rule_id, store, deviceMeta(request));
        return reply.send({ versionId: v.id, status: 'COMPLETE' });
      });

      agent.post('/report', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
        const b = z.object({ ruleId: z.string().regex(UUID_RE), message: z.string().trim().min(1).max(300) }).safeParse(request.body);
        if (!b.success) return reply.status(400).send({ error: 'Invalid' });
        const n = await sys(request, async (c) =>
          (await c.query('UPDATE public.backup_rules SET last_error = $3, last_error_at = now() WHERE id = $1 AND device_id = $2', [b.data.ruleId, request.device!.id, b.data.message])).rowCount,
        );
        return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
      });
    },
    { prefix: '/agent' },
  );

  // ------------------------------------------------------------------
  // Scheduled: tell the partners about late backups, once per lateness.
  // ------------------------------------------------------------------
  fastify.get('/check-late', async (request, reply) => {
    if (!cronAllowed(request, reply)) return;
    const late = await db.withAnonymousTransaction(async (c) =>
      (await c.query<{ firm_id: string; rule_id: string }>(`SELECT * FROM app.late_backup_rules(make_interval(hours => $1))`, [LATE_HOURS])).rows,
    );
    const byFirm = new Map<string, string[]>();
    for (const r of late) byFirm.set(r.firm_id, [...(byFirm.get(r.firm_id) ?? []), r.rule_id]);
    const mail = mailOverride !== undefined ? mailOverride : sesMailerFromEnv();
    let emailed = 0;
    for (const [firmId, ruleIds] of byFirm) {
      try {
        const data = await db.withSystemTransaction(firmId, async (c) => {
          const rules = (
            await c.query<{ id: string; label: string; product: string; device: string; last_success_at: Date | null; last_error: string | null }>(
              `SELECT r.id, r.label, r.product, d.name AS device, r.last_success_at, r.last_error
               FROM public.backup_rules r JOIN public.backup_devices d ON d.id = r.device_id WHERE r.id = ANY($1::uuid[]) ORDER BY r.label`,
              [ruleIds],
            )
          ).rows;
          const partners = (await c.query<{ email: string }>('SELECT email FROM app.current_firm_partner_emails()')).rows;
          return { rules, partners };
        }, deviceMeta(request));
        let sent = false;
        if (mail && data.partners.length) {
          const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'never');
          const lines = data.rules.map((r) => `- ${r.label} (${PRODUCT_LABEL[r.product] ?? r.product}) on ${r.device}: last backup ${fmt(r.last_success_at)}${r.last_error ? `; last error: ${r.last_error}` : ''}`);
          for (const p of data.partners) {
            try {
              await mail.send({
                to: p.email,
                subject: `${data.rules.length} accounting backup${data.rules.length === 1 ? ' is' : 's are'} late`,
                text: `These scheduled backups have not reached SynexTax in the last day:\n\n${lines.join('\n')}\n\nCheck that the computer is on, the SynexTax agent is running and the accounting software has closed its data. Settings, Backups shows the details.`,
              });
              sent = true;
            } catch (err) {
              request.log.warn({ err }, 'Late backup notice not sent');
            }
          }
        }
        // Marked even without email, so the notice is not retried every run; the panel shows it as late.
        await db.withSystemTransaction(firmId, (c) => c.query('UPDATE public.backup_rules SET late_notified_at = now() WHERE id = ANY($1::uuid[])', [ruleIds]), deviceMeta(request));
        if (sent) emailed++;
      } catch (err) {
        request.log.error({ err }, 'Late backup check failed for a firm');
      }
    }
    return reply.send({ firms: byFirm.size, rules: late.length, firmsEmailed: emailed });
  });

  // ------------------------------------------------------------------
  // The firm's side: devices, rules, versions.
  // ------------------------------------------------------------------
  fastify.register(async (app) => {
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!['PARTNER', 'MANAGER'].includes(request.user.role)) return reply.status(403).send({ error: 'Forbidden', message: 'A partner or manager looks after backups.' });
    });

    app.get('/devices', async (request, reply) => {
      const rows = await db.withTenantTransaction(userCtx(request), async (c) =>
        (await c.query(`SELECT id, name, token_hint, agent_version, last_seen_at, revoked_at, created_at FROM public.backup_devices ORDER BY revoked_at NULLS FIRST, created_at`)).rows,
      );
      return reply.send({
        devices: rows.map((r) => ({ id: r.id, name: r.name, tokenHint: r.token_hint, agentVersion: r.agent_version, lastSeenAt: r.last_seen_at, revokedAt: r.revoked_at, createdAt: r.created_at })),
      });
    });

    // The token is shown once, here; the server keeps only its SHA-256.
    app.post('/devices', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Name the computer, for example Office PC.' });
      const token = `sxd_${randomBytes(32).toString('base64url')}`;
      const id = await db.withTenantTransaction(userCtx(request), async (c) =>
        (
          await c.query<{ id: string }>(
            `INSERT INTO public.backup_devices (firm_id, name, token_hash, token_hint, created_by) VALUES (app.current_firm_id(), $1, $2, $3, app.current_user_id()) RETURNING id`,
            [b.data.name, sha256(token), token.slice(-4)],
          )
        ).rows[0].id,
      );
      reply.header('Cache-Control', 'no-store');
      return reply.status(201).send({ id, token });
    });

    app.post('/devices/:id/revoke', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'Invalid' });
      const n = await db.withTenantTransaction(userCtx(request), async (c) => (await c.query('UPDATE public.backup_devices SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id])).rowCount);
      return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
    });

    const RuleBody = z.object({
      label: z.string().trim().min(1).max(80),
      sourceFolder: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(260).nullable()).default(null),
      dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      retentionDays: z.number().int().min(7).max(3650).nullable().default(null),
      enabled: z.boolean().default(true),
    });

    app.get('/rules', async (request, reply) => {
      const rows = await db.withTenantTransaction(userCtx(request), async (c) =>
        (
          await c.query(
            `SELECT r.id, r.device_id, d.name AS device, r.entity_id, r.label, r.product, r.source_folder, to_char(r.daily_time, 'HH24:MI') AS daily_time,
                    r.retention_days, r.enabled, r.last_success_at, r.last_error, r.last_error_at, r.created_at,
                    (r.enabled AND COALESCE(r.last_success_at, r.created_at) < now() - make_interval(hours => $1)) AS late,
                    v.file_name AS last_file, v.size_bytes AS last_size, v.completed_at AS last_completed_at
             FROM public.backup_rules r JOIN public.backup_devices d ON d.id = r.device_id
             LEFT JOIN LATERAL (SELECT file_name, size_bytes, completed_at FROM public.backup_versions x WHERE x.rule_id = r.id AND x.status = 'COMPLETE' ORDER BY completed_at DESC LIMIT 1) v ON true
             ORDER BY r.created_at`,
            [LATE_HOURS],
          )
        ).rows,
      );
      return reply.send({
        rules: rows.map((r) => ({
          id: r.id,
          deviceId: r.device_id,
          device: r.device,
          entityId: r.entity_id,
          label: r.label,
          product: r.product,
          sourceFolder: r.source_folder,
          dailyTime: r.daily_time,
          retentionDays: r.retention_days,
          enabled: r.enabled,
          lastSuccessAt: r.last_success_at,
          lastError: r.last_error,
          lastErrorAt: r.last_error_at,
          late: r.late,
          lastVersion: r.last_completed_at ? { fileName: r.last_file, sizeBytes: Number(r.last_size), completedAt: r.last_completed_at } : null,
        })),
      });
    });

    app.post('/rules', async (request, reply) => {
      const b = RuleBody.extend({ deviceId: z.string().regex(UUID_RE), product: z.enum(PRODUCTS), entityId: z.string().regex(UUID_RE).nullable().default(null) }).safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Choose a device and product, a name, and a time such as 20:00.' });
      const d = b.data;
      const id = await db.withTenantTransaction(userCtx(request), async (c) => {
        const dev = await c.query('SELECT 1 FROM public.backup_devices WHERE id = $1 AND revoked_at IS NULL', [d.deviceId]);
        if (!dev.rowCount) return null;
        return (
          await c.query<{ id: string }>(
            `INSERT INTO public.backup_rules (firm_id, device_id, entity_id, label, product, source_folder, daily_time, retention_days, enabled, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6::time, $7, $8, app.current_user_id()) RETURNING id`,
            [d.deviceId, d.entityId, d.label, d.product, d.sourceFolder, d.dailyTime, d.retentionDays, d.enabled],
          )
        ).rows[0].id;
      });
      if (!id) return reply.status(404).send({ error: 'Not found', message: 'That device is not active.' });
      return reply.status(201).send({ id });
    });

    app.put('/rules/:id', async (request, reply) => {
      const { id } = request.params as { id: string };
      const b = RuleBody.safeParse(request.body);
      if (!UUID_RE.test(id) || !b.success) return reply.status(400).send({ error: 'Invalid', message: 'Check the name, time (such as 20:00) and days to keep (7 or more).' });
      const d = b.data;
      const n = await db.withTenantTransaction(userCtx(request), async (c) =>
        (
          await c.query('UPDATE public.backup_rules SET label = $2, source_folder = $3, daily_time = $4::time, retention_days = $5, enabled = $6 WHERE id = $1', [
            id, d.label, d.sourceFolder, d.dailyTime, d.retentionDays, d.enabled,
          ])
        ).rowCount,
      );
      return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
    });

    app.get('/versions', async (request, reply) => {
      const q = z.object({ ruleId: z.string().regex(UUID_RE) }).safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: 'Invalid' });
      const rows = await db.withTenantTransaction(userCtx(request), async (c) =>
        (
          await c.query(
            `SELECT id, file_name, size_bytes, sha256, status, created_at, completed_at, deleted_at FROM public.backup_versions
             WHERE rule_id = $1 AND status IN ('COMPLETE','DELETED') ORDER BY created_at DESC LIMIT 200`,
            [q.data.ruleId],
          )
        ).rows,
      );
      return reply.send({
        versions: rows.map((r) => ({ id: r.id, fileName: r.file_name, sizeBytes: Number(r.size_bytes), sha256: r.sha256, status: r.status, completedAt: r.completed_at, deletedAt: r.deleted_at })),
      });
    });

    // S3: a 5-minute presigned link. Disk: the file itself.
    app.get('/versions/:id/download', async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!UUID_RE.test(id)) return reply.status(400).send({ error: 'Invalid' });
      const v = await db.withTenantTransaction(userCtx(request), async (c) =>
        (await c.query<{ storage_key: string; file_name: string; upload_mode: string }>(`SELECT storage_key, file_name, upload_mode FROM public.backup_versions WHERE id = $1 AND status = 'COMPLETE'`, [id])).rows[0],
      );
      if (!v) return reply.status(404).send({ error: 'Not found' });
      const store = getBackupStore();
      reply.header('Cache-Control', 'no-store');
      if (store?.mode === 'S3' && v.upload_mode === 'S3') return reply.send({ url: store.s3.presignBackupGet(v.storage_key, v.file_name) });
      if (store?.mode === 'CHUNKED' && v.upload_mode === 'CHUNKED') {
        const size = await store.local.size(v.storage_key);
        if (size === null) return reply.status(404).send({ error: 'Not found', message: 'The file is no longer in storage.' });
        return reply
          .header('Content-Disposition', `attachment; filename="${v.file_name.replace(/[^\w .()-]+/g, '_')}"`)
          .header('Content-Length', String(size))
          .type('application/octet-stream')
          .send(store.local.read(v.storage_key));
      }
      return reply.status(503).send({ error: 'Unavailable', message: 'Backup storage is not available.' });
    });
  });
}

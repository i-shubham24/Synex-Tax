import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { whatsappLink } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { getFileStore, sha256 } from '../modules/storage/fileStore.js';

const UUID = z.guid();
const LinkBody = z.object({ days: z.number().int().min(1).max(90).default(30) });

/** Upload links for clients and the files they send, for staff with access to the client. */
export async function docLinksRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
  const origin = (req: FastifyRequest) => process.env.APP_URL || (req.headers.origin as string) || 'http://localhost:3000';

  fastify.post('/checklists/:id/upload-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = LinkBody.safeParse(request.body ?? {});
    if (!UUID.safeParse(id).success || !b.success) return reply.status(400).send({ error: 'Invalid' });
    const token = randomBytes(32).toString('base64url');
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const list = (
        await c.query<{ entity_id: string; legal_name: string; mobile: string | null }>(
          `SELECT l.entity_id, e.legal_name, (SELECT mobile_e164 FROM public.entity_contacts ec WHERE ec.entity_id = l.entity_id AND ec.is_primary LIMIT 1) AS mobile
           FROM public.doc_checklists l JOIN public.entities e ON e.id = l.entity_id WHERE l.id = $1`,
          [id],
        )
      ).rows[0];
      if (!list) return null;
      const row = (
        await c.query<{ id: string; expires_at: Date }>(
          `INSERT INTO public.doc_upload_links (firm_id, entity_id, checklist_id, token_sha256, expires_at, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, now() + make_interval(days => $4), app.current_user_id()) RETURNING id, expires_at`,
          [list.entity_id, id, sha256(token), b.data.days],
        )
      ).rows[0];
      return { ...row, client: list.legal_name, mobile: list.mobile };
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    const url = `${origin(request)}/upload/${token}`;
    const message = `Please upload the documents for ${out.client} here: ${url}`;
    // The token is shown once; only its hash is kept.
    return reply.status(201).send({ id: out.id, url, expiresAt: out.expires_at, whatsapp: out.mobile ? whatsappLink(out.mobile, message) : null, message });
  });

  fastify.post('/upload-links/:id/revoke', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) => (await c.query(`UPDATE public.doc_upload_links SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id])).rowCount);
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });

  fastify.get('/checklists/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const data = await db.withTenantTransaction(ctx(request), async (c) => ({
      files: (await c.query(`SELECT id, item_id, original_name, mime_type, size_bytes, uploaded_via, uploaded_at FROM public.doc_files WHERE checklist_id = $1 ORDER BY uploaded_at DESC`, [id])).rows,
      links: (await c.query(`SELECT id, expires_at, revoked_at, last_used_at, created_at FROM public.doc_upload_links WHERE checklist_id = $1 ORDER BY created_at DESC`, [id])).rows,
    }));
    return reply.send(data);
  });

  fastify.get('/files/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const store = getFileStore();
    if (!store) return reply.status(503).send({ error: 'Unavailable', message: 'File storage is not configured.' });
    const f = await db.withTenantTransaction(ctx(request), async (c) => (await c.query<{ storage_key: string; original_name: string; mime_type: string; sha256: string }>(`SELECT storage_key, original_name, mime_type, sha256 FROM public.doc_files WHERE id = $1`, [id])).rows[0]);
    if (!f) return reply.status(404).send({ error: 'Not found' });
    const body = await store.get(f.storage_key);
    if (sha256(body) !== f.sha256) return reply.status(409).send({ error: 'Integrity', message: 'The stored file does not match its checksum.' });
    return reply
      .header('content-type', f.mime_type)
      .header('content-disposition', `attachment; filename="${f.original_name.replace(/"/g, '')}"`)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .send(body);
  });
}

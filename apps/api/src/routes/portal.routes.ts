import { FastifyInstance } from 'fastify';
import { SERVICE_LABEL, type ChecklistService } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { MAX_PORTAL_FILE, detectPortalFile, getFileStore, sha256, storageKey } from '../modules/storage/fileStore.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The client's side of a document checklist, reached by an upload link and nothing else.
 * No account: the link token is the credential. It shows the client's name, the checklist and
 * which items are still needed; it never shows other clients, amounts or PAN.
 */
export async function portalRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser(['image/jpeg', 'image/png', 'application/pdf', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: MAX_PORTAL_FILE }, (_req, body, done) => done(null, body));

  async function resolve(token: string) {
    if (!TOKEN_RE.test(token)) return null;
    const row = await db.withAnonymousTransaction(async (c) =>
      (await c.query<{ link_id: string; firm_id: string; entity_id: string; checklist_id: string; expires_at: Date }>('SELECT * FROM app.resolve_upload_link($1)', [sha256(token)])).rows[0],
    );
    return row ?? null;
  }

  fastify.get('/:token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const link = await resolve(token);
    if (!link) return reply.status(404).send({ error: 'Not found', message: 'This link has expired or been withdrawn. Ask your CA for a new one.' });
    const data = await db.withSystemTransaction(link.firm_id, async (c) => {
      const firm = (await c.query<{ name: string }>('SELECT COALESCE(trade_name, legal_name) AS name FROM public.firms WHERE id = $1', [link.firm_id])).rows[0];
      const client = (await c.query<{ name: string }>('SELECT legal_name AS name FROM public.entities WHERE id = $1', [link.entity_id])).rows[0];
      const list = (await c.query<{ service: string; period_label: string; due_date: Date }>('SELECT service, period_label, due_date FROM public.doc_checklists WHERE id = $1', [link.checklist_id])).rows[0];
      const items = (
        await c.query<{ id: string; label: string; status: string; files: number }>(
          `SELECT i.id, i.label, i.status, (SELECT count(*)::int FROM public.doc_files f WHERE f.item_id = i.id) AS files
           FROM public.doc_checklist_items i WHERE i.checklist_id = $1 ORDER BY i.position`,
          [link.checklist_id],
        )
      ).rows;
      return { firm, client, list, items };
    });
    return reply.send({
      firm: data.firm?.name ?? '',
      client: data.client?.name ?? '',
      checklist: data.list ? { service: SERVICE_LABEL[data.list.service as ChecklistService] ?? data.list.service, period: data.list.period_label } : null,
      expiresAt: link.expires_at,
      items: data.items.map((i) => ({ id: i.id, label: i.label, status: i.status === 'NOT_NEEDED' ? 'NOT_NEEDED' : i.status, files: i.files })),
    });
  });

  fastify.post(
    '/:token/items/:itemId/file',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      // The link is checked before the body (up to the file limit) is read.
      onRequest: async (request, reply) => {
        const { token } = request.params as { token: string };
        if (!(await resolve(token))) return reply.status(404).send({ error: 'Not found', message: 'This link has expired or been withdrawn. Ask your CA for a new one.' });
      },
    },
    async (request, reply) => {
    const { token, itemId } = request.params as { token: string; itemId: string };
    if (!UUID_RE.test(itemId)) return reply.status(400).send({ error: 'Invalid item' });
    const store = getFileStore();
    if (!store) return reply.status(503).send({ error: 'Unavailable', message: 'Uploads are not switched on yet. Please send the document to your CA another way.' });
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.status(400).send({ error: 'Empty', message: 'The file is empty.' });
    const kind = detectPortalFile(body);
    if (!kind) return reply.status(415).send({ error: 'Unsupported', message: 'Send a photo (JPEG or PNG) or a PDF.' });
    const link = await resolve(token);
    if (!link) return reply.status(404).send({ error: 'Not found', message: 'This link has expired or been withdrawn. Ask your CA for a new one.' });
    const rawName = String((request.headers['x-file-name'] as string) ?? `document.${kind.ext}`);
    let decoded = rawName;
    try {
      decoded = decodeURIComponent(rawName);
    } catch {
      /* a malformed name is used as sent, then cleaned */
    }
    const name = decoded.replace(/[^\w .()-]+/g, '_').slice(0, 100) || `document.${kind.ext}`;

    const key = storageKey(link.firm_id, link.entity_id, kind.ext);
    const result = await db.withSystemTransaction(link.firm_id, async (c) => {
      const item = (await c.query<{ id: string; status: string }>('SELECT id, status FROM public.doc_checklist_items WHERE id = $1 AND checklist_id = $2', [itemId, link.checklist_id])).rows[0];
      if (!item) return null;
      await store.put(key, body);
      const file = (
        await c.query<{ id: string }>(
          `INSERT INTO public.doc_files (firm_id, entity_id, checklist_id, item_id, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_via, upload_link_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PORTAL', $10) RETURNING id`,
          [link.firm_id, link.entity_id, link.checklist_id, itemId, key, name, kind.mime, body.length, sha256(body), link.link_id],
        )
      ).rows[0];
      if (['MISSING', 'REJECTED'].includes(item.status)) {
        await c.query(`UPDATE public.doc_checklist_items SET status = 'RECEIVED', received_via = 'PORTAL', updated_at = now() WHERE id = $1`, [itemId]);
      }
      await c.query('UPDATE public.doc_upload_links SET last_used_at = now() WHERE id = $1', [link.link_id]);
      return file.id;
    });
    if (!result) return reply.status(404).send({ error: 'Not found', message: 'That item is not on this checklist.' });
    return reply.status(201).send({ id: result, received: true });
  });
}

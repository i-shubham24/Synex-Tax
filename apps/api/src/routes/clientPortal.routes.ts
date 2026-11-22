import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type pg from 'pg';
import { SERVICE_LABEL, maskPan, type ChecklistService } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { MAX_PORTAL_FILE, getFileStore, sha256, storageKey } from '../modules/storage/fileStore.js';
import { messagesConfigured } from '../modules/messages/messageCrypto.js';
import {
  MAX_BODY,
  checkAttachment,
  cleanFileName,
  findAttachment,
  listConversations,
  listMessages,
  markRead,
  sendAttachment,
  sendMessage,
  visibleEntity,
  type Side,
} from '../modules/messages/messageService.js';

const UUID = z.string().uuid();
const MessageBody = z.object({ entityId: z.string().uuid(), body: z.string().trim().min(1).max(MAX_BODY) });
const FirmMessageBody = z.object({ body: z.string().trim().min(1).max(MAX_BODY) });
const EntityRef = z.object({ entityId: z.string().uuid() });
const Caption = z.string().trim().max(500);

const FIRM_ROLES = new Set(['PARTNER', 'MANAGER', 'STAFF']);
const FIRM_PREFIX = '/api/v1/client/firm/';

/** A client login acts as CLIENT_PORTAL in the audit trail; firm users act as USER. */
const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: (req.user.role === 'CLIENT' ? 'CLIENT_PORTAL' : 'USER') as 'CLIENT_PORTAL' | 'USER',
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

const NO_MESSAGES = { error: 'Unavailable', message: 'Messages are not switched on for this site yet. Contact your CA another way.' };
const NO_STORE = { error: 'Unavailable', message: 'File storage is not switched on yet. Send the document to your CA another way.' };
const NO_DOCS = { error: 'Unavailable', message: 'Shared documents are not available on this site yet.' };

function sendFile(reply: FastifyReply, f: { original_name: string; mime_type: string }, body: Buffer) {
  return reply
    .header('content-type', f.mime_type)
    .header('content-disposition', `attachment; filename="${f.original_name.replace(/["\r\n]/g, '')}"`)
    .header('x-content-type-options', 'nosniff')
    .header('cache-control', 'private, no-store')
    .send(body);
}

/**
 * Shared documents live in migration 0031 (client_documents, client_document_versions,
 * client_document_opens and app.client_document_locked). Until that migration is applied the
 * document endpoints answer 503 instead of failing on a missing table.
 */
let docsReady = false;
async function documentsAvailable(c: pg.PoolClient): Promise<boolean> {
  if (docsReady) return true;
  const r = await c.query<{ ok: boolean }>(
    `SELECT to_regclass('public.client_documents') IS NOT NULL
        AND to_regclass('public.client_document_versions') IS NOT NULL
        AND to_regclass('public.client_document_opens') IS NOT NULL
        AND to_regprocedure('app.client_document_locked(uuid)') IS NOT NULL AS ok`,
  );
  docsReady = !!r.rows[0]?.ok;
  return docsReady;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/**
 * The client's side of SynexTax (CLIENT logins only) and the firm's side of client messages
 * (/firm/..., team members only). Which entities a caller sees is decided by row-level security
 * on the assigned entities; these handlers never widen it.
 */
export async function clientPortalRoutes(fastify: FastifyInstance) {
  fastify.addContentTypeParser(['image/jpeg', 'image/png', 'application/pdf', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: MAX_PORTAL_FILE }, (_req, body, done) =>
    done(null, body),
  );

  // Checked on request, before an uploaded body is read.
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const url = request.routeOptions?.url ?? request.url;
    const firmSide = url.startsWith(FIRM_PREFIX);
    if (firmSide ? !FIRM_ROLES.has(request.user.role) : request.user.role !== 'CLIENT') {
      return reply.status(403).send({ error: 'Forbidden', message: firmSide ? 'Client logins cannot open the firm’s message inbox.' : 'This part of SynexTax is for client logins.' });
    }
  });

  // -------------------------------------------------------------------
  // Client side
  // -------------------------------------------------------------------

  fastify.get('/me', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const firm = (await c.query<{ name: string }>('SELECT COALESCE(trade_name, legal_name) AS name FROM public.firms WHERE id = app.current_firm_id()')).rows[0];
      const me = (await c.query<{ display_name: string }>('SELECT display_name FROM public.users WHERE id = app.current_user_id()')).rows[0];
      const entities = (
        await c.query<{ id: string; legal_name: string; trade_name: string | null; pan: string; unread: number }>(
          `SELECT e.id, e.legal_name, e.trade_name, e.pan,
                  (SELECT count(*)::int FROM public.client_messages m WHERE m.entity_id = e.id AND m.read_by_client_at IS NULL) AS unread
           FROM public.entities e WHERE e.status = 'ACTIVE' ORDER BY e.legal_name LIMIT 200`,
        )
      ).rows;
      return { firm, me, entities };
    });
    return reply.send({
      firm: data.firm?.name ?? '',
      name: data.me?.display_name ?? '',
      entities: data.entities.map((e) => ({ id: e.id, name: e.legal_name, tradeName: e.trade_name, pan: maskPan(e.pan), unread: e.unread })),
      messagesEnabled: messagesConfigured(),
    });
  });

  fastify.get('/checklists', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const rows = await db.withTenantTransaction(ctx(request), async (c) => {
      const lists = (
        await c.query<{ id: string; entity_id: string; entity_name: string; service: string; period_label: string; due_date: Date }>(
          `SELECT k.id, k.entity_id, e.legal_name AS entity_name, k.service, k.period_label, k.due_date
           FROM public.doc_checklists k JOIN public.entities e ON e.firm_id = k.firm_id AND e.id = k.entity_id
           WHERE k.status = 'OPEN' ORDER BY k.due_date, e.legal_name LIMIT 100`,
        )
      ).rows;
      if (!lists.length) return [];
      const items = (
        await c.query<{ id: string; checklist_id: string; label: string; status: string; files: number }>(
          `SELECT i.id, i.checklist_id, i.label, i.status, (SELECT count(*)::int FROM public.doc_files f WHERE f.item_id = i.id) AS files
           FROM public.doc_checklist_items i WHERE i.checklist_id = ANY($1::uuid[]) ORDER BY i.position`,
          [lists.map((l) => l.id)],
        )
      ).rows;
      return lists.map((l) => ({
        id: l.id,
        entityId: l.entity_id,
        entityName: l.entity_name,
        service: SERVICE_LABEL[l.service as ChecklistService] ?? l.service,
        period: l.period_label,
        dueDate: day(l.due_date),
        items: items.filter((i) => i.checklist_id === l.id).map((i) => ({ id: i.id, label: i.label, status: i.status, files: i.files })),
      }));
    });
    return reply.send({ checklists: rows });
  });

  fastify.post('/checklists/items/:itemId/file', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    if (!UUID.safeParse(itemId).success) return reply.status(400).send({ error: 'Invalid item' });
    const store = getFileStore();
    if (!store) return reply.status(503).send(NO_STORE);
    const check = checkAttachment(request.body);
    if (!check.ok) return reply.status(check.status).send({ error: 'Invalid file', message: check.message });
    const file = request.body as Buffer;
    const name = cleanFileName(request.headers['x-file-name'] as string | undefined, check.ext);

    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const item = (
        await c.query<{ status: string; entity_id: string; checklist_id: string; list_status: string }>(
          `SELECT i.status, i.entity_id, i.checklist_id, k.status AS list_status
           FROM public.doc_checklist_items i JOIN public.doc_checklists k ON k.firm_id = i.firm_id AND k.id = i.checklist_id
           WHERE i.id = $1`,
          [itemId],
        )
      ).rows[0];
      if (!item) return { status: 404 as const };
      if (item.list_status !== 'OPEN' || item.status === 'NOT_NEEDED') return { status: 409 as const };
      const key = storageKey(request.user.firmId, item.entity_id, check.ext);
      await store.put(key, file);
      const row = (
        await c.query<{ id: string }>(
          `INSERT INTO public.doc_files (firm_id, entity_id, checklist_id, item_id, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_via, uploaded_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, 'PORTAL', app.current_user_id()) RETURNING id`,
          [item.entity_id, item.checklist_id, itemId, key, name, check.mime, file.length, sha256(file)],
        )
      ).rows[0];
      if (['MISSING', 'REJECTED'].includes(item.status)) {
        await c.query(`UPDATE public.doc_checklist_items SET status = 'RECEIVED', received_via = 'PORTAL' WHERE id = $1`, [itemId]);
      }
      return { status: 201 as const, id: row.id };
    });
    if (out.status === 404) return reply.status(404).send({ error: 'Not found', message: 'That item is not on any of your checklists.' });
    if (out.status === 409) return reply.status(409).send({ error: 'Closed', message: 'This item is no longer needed. Ask your CA if you want to send it anyway.' });
    return reply.status(201).send({ id: out.id, received: true });
  });

  fastify.get('/documents', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (!(await documentsAvailable(c))) return null;
      return (
        await c.query(
          `SELECT d.id, d.entity_id, e.legal_name AS entity_name, d.title, d.current_version,
                  v.original_name, v.mime_type, v.size_bytes, v.created_at AS version_at,
                  app.client_document_locked(d.id) AS locked,
                  fi.invoice_no, fi.invoice_date, fi.total
           FROM public.client_documents d
           JOIN public.entities e ON e.firm_id = d.firm_id AND e.id = d.entity_id
           LEFT JOIN public.client_document_versions v ON v.document_id = d.id AND v.version = d.current_version
           LEFT JOIN public.fee_invoices fi ON fi.firm_id = d.firm_id AND fi.id = d.fee_invoice_id
           WHERE d.shared_with_client
           ORDER BY e.legal_name, d.title
           LIMIT 500`,
        )
      ).rows;
    });
    if (!out) return reply.status(503).send(NO_DOCS);
    return reply.send({
      documents: out.map((d: any) => ({
        id: d.id,
        entityId: d.entity_id,
        entityName: d.entity_name,
        title: d.title,
        version: d.current_version,
        fileName: d.original_name,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        updatedAt: iso(d.version_at),
        locked: !!d.locked,
        invoice: d.locked && d.invoice_no ? { number: d.invoice_no, date: day(d.invoice_date), total: String(d.total) } : null,
      })),
    });
  });

  fastify.get('/documents/:id/download', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const store = getFileStore();
    if (!store) return reply.status(503).send(NO_STORE);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (!(await documentsAvailable(c))) return { kind: 'unavailable' as const };
      const d = (
        await c.query(
          `SELECT d.id, d.firm_id, d.entity_id, d.current_version, app.client_document_locked(d.id) AS locked,
                  fi.invoice_no, fi.invoice_date, fi.total,
                  v.storage_key, v.original_name, v.mime_type, v.sha256
           FROM public.client_documents d
           LEFT JOIN public.client_document_versions v ON v.document_id = d.id AND v.version = d.current_version
           LEFT JOIN public.fee_invoices fi ON fi.firm_id = d.firm_id AND fi.id = d.fee_invoice_id
           WHERE d.id = $1 AND d.shared_with_client`,
          [id],
        )
      ).rows[0] as any;
      if (!d || !d.storage_key) return { kind: 'missing' as const };
      if (d.locked) return { kind: 'locked' as const, invoice: d.invoice_no ? { number: d.invoice_no, date: day(d.invoice_date), total: String(d.total) } : null };
      await c.query(
        `INSERT INTO public.client_document_opens (firm_id, document_id, version, user_id, kind) VALUES (app.current_firm_id(), $1, $2, app.current_user_id(), 'DOWNLOAD')`,
        [d.id, d.current_version],
      );
      return { kind: 'ok' as const, file: d as { storage_key: string; original_name: string; mime_type: string; sha256: string } };
    });
    if (out.kind === 'unavailable') return reply.status(503).send(NO_DOCS);
    if (out.kind === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out.kind === 'locked') {
      return reply.status(402).send({
        error: 'Unpaid',
        message: out.invoice ? `This document opens once invoice ${out.invoice.number} is paid.` : 'This document opens once your CA’s fee is paid.',
        invoice: out.invoice,
      });
    }
    const body = await store.get(out.file.storage_key);
    if (sha256(body) !== out.file.sha256) return reply.status(409).send({ error: 'Integrity', message: 'The stored file does not match its checksum. Ask your CA to share it again.' });
    return sendFile(reply, out.file, body);
  });

  fastify.get('/filings', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const gst = (
        await c.query(
          `SELECT g.entity_id, e.legal_name AS entity_name, g.return_type, g.return_period, g.workflow_status
           FROM public.gst_filings g JOIN public.entities e ON e.firm_id = g.firm_id AND e.id = g.entity_id
           ORDER BY g.return_period DESC, g.return_type LIMIT 200`,
        )
      ).rows;
      const tds = (
        await c.query(
          `SELECT t.entity_id, e.legal_name AS entity_name, t.form_code, t.tax_year, t.quarter, t.return_type, t.workflow_status
           FROM public.tds_returns t JOIN public.entities e ON e.firm_id = t.firm_id AND e.id = t.entity_id
           ORDER BY t.tax_year DESC, t.quarter DESC, t.form_code LIMIT 200`,
        )
      ).rows;
      return { gst, tds };
    });
    return reply.send({
      gst: out.gst.map((g: any) => ({ entityId: g.entity_id, entityName: g.entity_name, returnType: g.return_type, period: g.return_period, status: g.workflow_status })),
      tds: out.tds.map((t: any) => ({
        entityId: t.entity_id,
        entityName: t.entity_name,
        form: t.form_code,
        period: `${t.quarter} ${t.tax_year}-${String((t.tax_year + 1) % 100).padStart(2, '0')}`,
        correction: t.return_type === 'CORRECTION',
        status: t.workflow_status,
      })),
    });
  });

  // Messages, client side: one conversation per entity.
  fastify.get('/messages', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const q = EntityRef.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Invalid', message: 'Choose one of your businesses.' });
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const entity = await visibleEntity(c, q.data.entityId);
      if (!entity) return null;
      return { entity, messages: await listMessages(c, entity.id) };
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ entityId: out.entity.id, entityName: out.entity.name, messages: out.messages });
  });

  fastify.post('/messages', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const b = MessageBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: `Write a message of up to ${MAX_BODY} characters.` });
    return postMessage(request, reply, b.data.entityId, b.data.body, 'CLIENT');
  });

  fastify.post('/messages/attachments', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = EntityRef.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Invalid', message: 'Choose one of your businesses.' });
    return postAttachment(request, reply, q.data.entityId, 'CLIENT');
  });

  fastify.post('/messages/read', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = EntityRef.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), (c) => markRead(c, b.data.entityId, 'CLIENT'));
    return reply.send({ marked: n });
  });

  fastify.get('/messages/attachments/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => getAttachment(request, reply));

  // -------------------------------------------------------------------
  // Firm side: the team's inbox for the clients each member can see.
  // -------------------------------------------------------------------

  fastify.get('/firm/conversations', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const conversations = await listConversations(c, 'FIRM');
      const entities = (await c.query<{ id: string; name: string }>(`SELECT id, legal_name AS name FROM public.entities WHERE status = 'ACTIVE' ORDER BY legal_name LIMIT 1000`)).rows;
      const logins = (
        await c.query<{ entity_id: string; n: number }>(
          `SELECT e.id AS entity_id, count(DISTINCT u.id)::int AS n
           FROM public.entities e
           JOIN public.user_client_assignments a ON a.firm_id = e.firm_id AND a.revoked_at IS NULL AND (a.entity_id = e.id OR a.client_group_id = e.client_group_id)
           JOIN public.users u ON u.firm_id = a.firm_id AND u.id = a.user_id AND u.role = 'CLIENT' AND u.status = 'ACTIVE'
           GROUP BY e.id`,
        )
      ).rows;
      return { conversations, entities, logins };
    });
    const withLogin = new Map(out.logins.map((l) => [l.entity_id, l.n]));
    return reply.send({
      conversations: out.conversations.map((cv) => ({ ...cv, clientLogins: withLogin.get(cv.entityId) ?? 0 })),
      entities: out.entities.map((e) => ({ id: e.id, name: e.name, clientLogins: withLogin.get(e.id) ?? 0 })),
    });
  });

  fastify.get('/firm/conversations/:entityId/messages', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const { entityId } = request.params as { entityId: string };
    if (!UUID.safeParse(entityId).success) return reply.status(400).send({ error: 'Invalid' });
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const entity = await visibleEntity(c, entityId);
      if (!entity) return null;
      return { entity, messages: await listMessages(c, entity.id) };
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ entityId: out.entity.id, entityName: out.entity.name, messages: out.messages });
  });

  fastify.post('/firm/conversations/:entityId/messages', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const { entityId } = request.params as { entityId: string };
    if (!UUID.safeParse(entityId).success) return reply.status(400).send({ error: 'Invalid' });
    const b = FirmMessageBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: `Write a message of up to ${MAX_BODY} characters.` });
    return postMessage(request, reply, entityId, b.data.body, 'FIRM');
  });

  fastify.post('/firm/conversations/:entityId/attachments', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    if (!UUID.safeParse(entityId).success) return reply.status(400).send({ error: 'Invalid' });
    return postAttachment(request, reply, entityId, 'FIRM');
  });

  fastify.post('/firm/conversations/:entityId/read', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    if (!UUID.safeParse(entityId).success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), (c) => markRead(c, entityId, 'FIRM'));
    return reply.send({ marked: n });
  });

  fastify.get('/firm/attachments/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => getAttachment(request, reply));

  // -------------------------------------------------------------------

  async function postMessage(request: FastifyRequest, reply: FastifyReply, entityId: string, body: string, side: Side) {
    const id = await db.withTenantTransaction(ctx(request), async (c) => {
      if (!(await visibleEntity(c, entityId))) return null;
      return sendMessage(c, request.user.firmId, entityId, side, body);
    });
    if (!id) return reply.status(404).send({ error: 'Not found' });
    return reply.status(201).send({ id });
  }

  async function postAttachment(request: FastifyRequest, reply: FastifyReply, entityId: string, side: Side) {
    if (!messagesConfigured()) return reply.status(503).send(NO_MESSAGES);
    const store = getFileStore();
    if (!store) return reply.status(503).send(NO_STORE);
    const check = checkAttachment(request.body);
    if (!check.ok) return reply.status(check.status).send({ error: 'Invalid file', message: check.message });
    const rawCaption = request.headers['x-caption'];
    let captionText = '';
    if (typeof rawCaption === 'string') {
      try {
        captionText = decodeURIComponent(rawCaption);
      } catch {
        return reply.status(400).send({ error: 'Invalid', message: 'The note with the file could not be read.' });
      }
    }
    const caption = Caption.safeParse(captionText);
    if (!caption.success) return reply.status(400).send({ error: 'Invalid', message: 'Keep the note with a file under 500 characters.' });
    const name = cleanFileName(request.headers['x-file-name'] as string | undefined, check.ext);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (!(await visibleEntity(c, entityId))) return null;
      return sendAttachment(c, store, request.user.firmId, entityId, side, request.body as Buffer, check, name, caption.data);
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return reply.status(201).send({ id: out.messageId, attachmentId: out.attachmentId });
  }

  async function getAttachment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const store = getFileStore();
    if (!store) return reply.status(503).send(NO_STORE);
    const f = await db.withTenantTransaction(ctx(request), (c) => findAttachment(c, id));
    if (!f) return reply.status(404).send({ error: 'Not found' });
    const body = await store.get(f.storage_key);
    if (sha256(body) !== f.sha256) return reply.status(409).send({ error: 'Integrity', message: 'The stored file does not match its checksum.' });
    return sendFile(reply, f, body);
  }
}

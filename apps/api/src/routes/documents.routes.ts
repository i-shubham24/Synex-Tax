import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { getFileStore, sha256 } from '../modules/storage/fileStore.js';
import { MAX_DOCUMENT_BYTES, PREVIEWABLE, cleanFileName, contentDisposition, detectDocument, documentStorageKey } from '../modules/documents/fileTypes.js';

const UUID = z.guid();
const FolderName = z.string().trim().min(1).max(80).refine((s) => !/[\\/<>:"|?*\x00-\x1f]/.test(s), 'A folder name cannot contain / \\ < > : " | ? or *.');
const Title = z.string().trim().min(1).max(160);
const FolderBody = z.object({ entityId: UUID, parentId: UUID.nullable().optional(), name: FolderName });
const FolderPatch = z.object({ name: FolderName.optional(), parentId: UUID.nullable().optional() }).refine((b) => b.name !== undefined || b.parentId !== undefined, 'Nothing to change.');
const UploadQuery = z.object({ entityId: UUID, folderId: UUID.optional(), title: Title.optional() });
const DocPatch = z
  .object({
    title: Title.optional(),
    folderId: UUID.nullable().optional(),
    sharedWithClient: z.boolean().optional(),
    lockedUntilPaid: z.boolean().optional(),
    feeInvoiceId: UUID.nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to change.');
const WaiveBody = z.object({ waived: z.boolean() });
const EntityQuery = z.object({ entityId: UUID });
const VersionParams = z.object({ id: UUID, version: z.coerce.number().int().min(1).max(100000) });
const MAX_DEPTH = 8;

const NOT_SET_UP = 'File storage is not set up for this workspace yet.';

/** Client document folders, versions and the open log. Mounted at /api/v1/practice/documents. */
export async function documentsRoutes(fastify: FastifyInstance) {
  // Uploads arrive as the raw file. The session is checked before the body is read.
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_DOCUMENT_BYTES }, (_req, body, done) => done(null, body));
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
  const lead = (req: FastifyRequest) => ['PARTNER', 'MANAGER'].includes(req.user.role);
  const bad = (reply: FastifyReply, message = 'Some of the details sent are missing or not valid.') => reply.status(400).send({ error: 'Invalid', message });
  const rlsRefused = (err: unknown) => /row-level security|violates foreign key/.test(String((err as Error)?.message));

  async function folderDepth(c: PoolClient, folderId: string): Promise<{ depth: number; chain: string[] }> {
    const r = await c.query<{ id: string }>(
      `WITH RECURSIVE up AS (
         SELECT id, parent_id, 1 AS depth FROM public.doc_folders WHERE id = $1
         UNION ALL SELECT f.id, f.parent_id, up.depth + 1 FROM public.doc_folders f JOIN up ON f.id = up.parent_id WHERE up.depth < 50)
       SELECT id FROM up`,
      [folderId],
    );
    return { depth: r.rows.length, chain: r.rows.map((x) => x.id) };
  }

  async function folderOf(c: PoolClient, folderId: string, entityId: string) {
    return (await c.query<{ id: string }>(`SELECT id FROM public.doc_folders WHERE id = $1 AND entity_id = $2`, [folderId, entityId])).rows[0] ?? null;
  }

  // ------------------------------------------------------------- listing
  fastify.get('/', async (request, reply) => {
    const q = EntityQuery.safeParse(request.query ?? {});
    if (!q.success) return bad(reply, 'Choose a client.');
    const isLead = lead(request);
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const folders = (
        await c.query(`SELECT id, parent_id, name, updated_at FROM public.doc_folders WHERE entity_id = $1 ORDER BY lower(name)`, [q.data.entityId])
      ).rows;
      const docs = (
        await c.query(
          `SELECT d.id, d.folder_id, d.title, d.current_version, d.shared_with_client, d.locked_until_paid, d.fee_invoice_id, d.fee_waived, d.fee_waived_at,
                  d.updated_at, d.created_at, v.original_name, v.mime_type, v.size_bytes, v.uploaded_via, v.created_at AS version_at,
                  u.display_name AS uploaded_by_name, fi.invoice_no, fi.total::text AS invoice_total, fi.status AS invoice_status,
                  app.fee_invoice_paid(d.fee_invoice_id) AS invoice_paid, app.client_document_locked(d.id) AS locked_for_client,
                  (SELECT count(*) FROM public.client_document_versions x WHERE x.document_id = d.id)::int AS versions
           FROM public.client_documents d
           JOIN public.client_document_versions v ON v.document_id = d.id AND v.version = d.current_version
           LEFT JOIN public.users u ON u.id = v.uploaded_by
           LEFT JOIN public.fee_invoices fi ON fi.id = d.fee_invoice_id
           WHERE d.entity_id = $1
           ORDER BY lower(d.title)
           LIMIT 2000`,
          [q.data.entityId],
        )
      ).rows;
      return { folders, docs };
    });
    return reply.send({
      folders: data.folders.map((f) => ({ id: f.id, parentId: f.parent_id, name: f.name, version: new Date(f.updated_at).toISOString() })),
      documents: data.docs.map((d) => ({
        id: d.id,
        folderId: d.folder_id,
        title: d.title,
        currentVersion: d.current_version,
        versions: d.versions,
        fileName: d.original_name,
        mimeType: d.mime_type,
        sizeBytes: d.size_bytes,
        previewable: PREVIEWABLE.has(d.mime_type),
        uploadedVia: d.uploaded_via,
        uploadedBy: d.uploaded_by_name,
        updatedAt: d.version_at,
        sharedWithClient: d.shared_with_client,
        lockedUntilPaid: d.locked_until_paid,
        feeWaived: d.fee_waived,
        lockedForClient: d.shared_with_client ? d.locked_for_client : null,
        invoice: d.fee_invoice_id
          ? { id: d.fee_invoice_id, invoiceNo: d.invoice_no, status: d.invoice_status, paid: Boolean(d.invoice_paid), ...(isLead ? { total: d.invoice_total } : {}) }
          : null,
        version: new Date(d.updated_at).toISOString(),
      })),
      canLock: isLead,
      canWaive: request.user.role === 'PARTNER',
      canSeeOpens: request.user.role === 'PARTNER',
      maxBytes: MAX_DOCUMENT_BYTES,
    });
  });

  // The client's issued fee invoices, to pick the one that releases a locked document.
  fastify.get('/invoices', async (request, reply) => {
    if (!lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers lock documents against fees.' });
    const q = EntityQuery.safeParse(request.query ?? {});
    if (!q.success) return bad(reply, 'Choose a client.');
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT id, invoice_no, invoice_date, total::text AS total, app.fee_invoice_paid(id) AS paid
           FROM public.fee_invoices WHERE entity_id = $1 AND status = 'ISSUED' ORDER BY invoice_date DESC, created_at DESC LIMIT 200`,
          [q.data.entityId],
        )
      ).rows,
    );
    return reply.send({ invoices: rows.map((r) => ({ id: r.id, invoiceNo: r.invoice_no, date: String(r.invoice_date).slice(0, 10), total: r.total, paid: Boolean(r.paid) })) });
  });

  // ------------------------------------------------------------- folders
  fastify.post('/folders', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = FolderBody.safeParse(request.body);
    if (!b.success) return bad(reply, b.error.issues[0]?.message);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        if (b.data.parentId) {
          if (!(await folderOf(c, b.data.parentId, b.data.entityId))) return 'parent' as const;
          if ((await folderDepth(c, b.data.parentId)).depth >= MAX_DEPTH) return 'deep' as const;
        }
        return (
          await c.query<{ id: string }>(
            `INSERT INTO public.doc_folders (firm_id, entity_id, parent_id, name, created_by) VALUES (app.current_firm_id(), $1, $2, $3, app.current_user_id()) RETURNING id`,
            [b.data.entityId, b.data.parentId ?? null, b.data.name],
          )
        ).rows[0].id;
      });
      if (out === 'parent') return reply.status(404).send({ error: 'Not found', message: 'That folder is not in this client’s documents.' });
      if (out === 'deep') return bad(reply, `Folders go ${MAX_DEPTH} levels deep at most.`);
      return reply.status(201).send({ id: out });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Exists', message: 'A folder with that name is already here.' });
      if (rlsRefused(err)) return reply.status(403).send({ error: 'Forbidden', message: 'This client is not assigned to you.' });
      throw err;
    }
  });

  fastify.patch('/folders/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = FolderPatch.safeParse(request.body);
    if (!UUID.safeParse(id).success || !b.success) return bad(reply, b.success ? undefined : b.error.issues[0]?.message);
    const expected = expectedVersion(request);
    try {
      const out = await db.withTenantTransaction<Date | 'missing' | 'cycle' | 'deep' | 'stale'>(ctx(request), async (c) => {
        const f = (await c.query<{ entity_id: string; parent_id: string | null }>(`SELECT entity_id, parent_id FROM public.doc_folders WHERE id = $1`, [id])).rows[0];
        if (!f) return 'missing' as const;
        let parent = f.parent_id;
        if (b.data.parentId !== undefined) {
          parent = b.data.parentId;
          if (parent) {
            if (!(await folderOf(c, parent, f.entity_id))) return 'missing' as const;
            const { depth, chain } = await folderDepth(c, parent);
            if (chain.includes(id)) return 'cycle' as const;
            if (depth >= MAX_DEPTH) return 'deep' as const;
          }
        }
        const r = await c.query<{ updated_at: Date }>(
          `UPDATE public.doc_folders SET name = COALESCE($2, name), parent_id = $3 WHERE id = $1 AND ${VERSION_MATCHES('$4')} RETURNING updated_at`,
          [id, b.data.name ?? null, parent, expected],
        );
        return r.rows[0]?.updated_at ?? ('stale' as const);
      });
      if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
      if (out === 'cycle') return bad(reply, 'A folder cannot go inside itself.');
      if (out === 'deep') return bad(reply, `Folders go ${MAX_DEPTH} levels deep at most.`);
      if (out === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone changed this folder after you opened it. Reload to see the latest.' });
      reply.header('ETag', versionTag(out));
      return reply.send({ ok: true, version: new Date(out).toISOString() });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Exists', message: 'A folder with that name is already here.' });
      throw err;
    }
  });

  // Only an empty folder is removed; documents are kept and moved, never deleted.
  fastify.delete('/folders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return bad(reply);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const f = (await c.query(`SELECT id FROM public.doc_folders WHERE id = $1`, [id])).rows[0];
      if (!f) return 'missing';
      const used = (
        await c.query<{ n: number }>(
          `SELECT (SELECT count(*) FROM public.doc_folders WHERE parent_id = $1) + (SELECT count(*) FROM public.client_documents WHERE folder_id = $1) AS n`,
          [id],
        )
      ).rows[0];
      // RLS hides documents a client login may not see, but staff see all of a visible client's.
      if (Number(used.n) > 0) return 'busy';
      await c.query(`DELETE FROM public.doc_folders WHERE id = $1`, [id]);
      return 'ok';
    });
    if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out === 'busy') return reply.status(409).send({ error: 'Not empty', message: 'Move the documents and folders out of this folder first.' });
    return reply.send({ ok: true });
  });

  // ------------------------------------------------------------- uploads
  function readUpload(request: FastifyRequest): { ok: true; body: Buffer; name: string; kind: ReturnType<typeof detectDocument> & { ok: true } } | { ok: false; status: number; message: string } {
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return { ok: false, status: 400, message: 'The file is empty. Send the file itself as application/octet-stream.' };
    if (body.length > MAX_DOCUMENT_BYTES) return { ok: false, status: 413, message: 'Files can be up to 20 MB.' };
    const rawName = String(request.headers['x-file-name'] ?? '');
    let nameForType = rawName;
    try {
      nameForType = decodeURIComponent(rawName);
    } catch {
      /* checked as sent */
    }
    const kind = detectDocument(body, nameForType);
    if (!kind.ok) return { ok: false, status: 415, message: kind.reason };
    return { ok: true, body, name: cleanFileName(rawName, kind.type.ext), kind };
  }

  fastify.post('/upload', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = UploadQuery.safeParse(request.query ?? {});
    if (!q.success) return bad(reply, 'Choose a client for the document.');
    const store = getFileStore();
    if (!store) return reply.status(503).send({ error: 'Unavailable', message: NOT_SET_UP });
    const up = readUpload(request);
    if (!up.ok) return reply.status(up.status).send({ error: up.status === 415 ? 'Unsupported' : 'Invalid', message: up.message });
    const key = documentStorageKey(request.user.firmId, q.data.entityId, up.kind.type.ext);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        if (q.data.folderId && !(await folderOf(c, q.data.folderId, q.data.entityId))) return null;
        const title = q.data.title ?? up.name.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 160);
        const doc = (
          await c.query<{ id: string }>(
            `INSERT INTO public.client_documents (firm_id, entity_id, folder_id, title, current_version, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, 1, app.current_user_id()) RETURNING id`,
            [q.data.entityId, q.data.folderId ?? null, title || up.name],
          )
        ).rows[0];
        await store.put(key, up.body);
        await c.query(
          `INSERT INTO public.client_document_versions (firm_id, document_id, version, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_via)
           VALUES (app.current_firm_id(), $1, 1, $2, $3, $4, $5, $6, app.current_user_id(), 'FIRM')`,
          [doc.id, key, up.name, up.kind.type.mime, up.body.length, sha256(up.body)],
        );
        return doc.id;
      });
      if (!out) return reply.status(404).send({ error: 'Not found', message: 'That folder is not in this client’s documents.' });
      return reply.status(201).send({ id: out, version: 1, fileName: up.name, mimeType: up.kind.type.mime });
    } catch (err) {
      if (rlsRefused(err)) return reply.status(403).send({ error: 'Forbidden', message: 'This client is not assigned to you.' });
      throw err;
    }
  });

  // A new version of an existing document.
  fastify.post('/:id/versions', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return bad(reply);
    const store = getFileStore();
    if (!store) return reply.status(503).send({ error: 'Unavailable', message: NOT_SET_UP });
    const up = readUpload(request);
    if (!up.ok) return reply.status(up.status).send({ error: up.status === 415 ? 'Unsupported' : 'Invalid', message: up.message });
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const d = (await c.query<{ entity_id: string }>(`SELECT entity_id FROM public.client_documents WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!d) return null;
      const next = (await c.query<{ n: number }>(`SELECT COALESCE(max(version), 0) + 1 AS n FROM public.client_document_versions WHERE document_id = $1`, [id])).rows[0].n;
      const key = documentStorageKey(request.user.firmId, d.entity_id, up.kind.type.ext);
      await store.put(key, up.body);
      await c.query(
        `INSERT INTO public.client_document_versions (firm_id, document_id, version, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_via)
         VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, app.current_user_id(), 'FIRM')`,
        [id, next, key, up.name, up.kind.type.mime, up.body.length, sha256(up.body)],
      );
      await c.query(`UPDATE public.client_documents SET current_version = $2 WHERE id = $1`, [id, next]);
      return next;
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return reply.status(201).send({ id, version: out, fileName: up.name, mimeType: up.kind.type.mime });
  });

  // Makes an older version current again, as a new version that points at the same stored file.
  fastify.post('/:id/versions/:version/restore', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const p = VersionParams.safeParse(request.params);
    if (!p.success) return bad(reply);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const d = (await c.query<{ current_version: number }>(`SELECT current_version FROM public.client_documents WHERE id = $1 FOR UPDATE`, [p.data.id])).rows[0];
      if (!d) return 'missing' as const;
      if (d.current_version === p.data.version) return 'current' as const;
      const v = (
        await c.query(`SELECT storage_key, original_name, mime_type, size_bytes, sha256 FROM public.client_document_versions WHERE document_id = $1 AND version = $2`, [p.data.id, p.data.version])
      ).rows[0];
      if (!v) return 'missing' as const;
      const next = (await c.query<{ n: number }>(`SELECT max(version) + 1 AS n FROM public.client_document_versions WHERE document_id = $1`, [p.data.id])).rows[0].n;
      await c.query(
        `INSERT INTO public.client_document_versions (firm_id, document_id, version, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_via, restored_from)
         VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, app.current_user_id(), 'FIRM', $8)`,
        [p.data.id, next, v.storage_key, v.original_name, v.mime_type, v.size_bytes, v.sha256, p.data.version],
      );
      await c.query(`UPDATE public.client_documents SET current_version = $2 WHERE id = $1`, [p.data.id, next]);
      return next as number;
    });
    if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out === 'current') return reply.status(409).send({ error: 'Current', message: 'That version is already the current one.' });
    return reply.status(201).send({ id: p.data.id, version: out, restoredFrom: p.data.version });
  });

  // ------------------------------------------------------------- one document
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return bad(reply);
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const d = (
        await c.query(
          `SELECT d.id, d.entity_id, d.folder_id, d.title, d.current_version, d.shared_with_client, d.locked_until_paid, d.fee_invoice_id, d.fee_waived, d.fee_waived_at,
                  w.display_name AS waived_by_name, d.updated_at, app.client_document_locked(d.id) AS locked_for_client
           FROM public.client_documents d LEFT JOIN public.users w ON w.id = d.fee_waived_by WHERE d.id = $1`,
          [id],
        )
      ).rows[0];
      if (!d) return null;
      const versions = (
        await c.query(
          `SELECT v.version, v.original_name, v.mime_type, v.size_bytes, v.sha256, v.uploaded_via, v.restored_from, v.created_at, u.display_name AS uploaded_by_name
           FROM public.client_document_versions v LEFT JOIN public.users u ON u.id = v.uploaded_by
           WHERE v.document_id = $1 ORDER BY v.version DESC`,
          [id],
        )
      ).rows;
      return { d, versions };
    });
    if (!data) return reply.status(404).send({ error: 'Not found' });
    const { d, versions } = data;
    reply.header('ETag', versionTag(d.updated_at));
    return reply.send({
      id: d.id,
      entityId: d.entity_id,
      folderId: d.folder_id,
      title: d.title,
      currentVersion: d.current_version,
      sharedWithClient: d.shared_with_client,
      lockedUntilPaid: d.locked_until_paid,
      feeInvoiceId: d.fee_invoice_id,
      feeWaived: d.fee_waived,
      feeWaivedAt: d.fee_waived_at,
      feeWaivedBy: d.waived_by_name,
      lockedForClient: d.locked_for_client,
      version: new Date(d.updated_at).toISOString(),
      versions: versions.map((v) => ({
        version: v.version,
        fileName: v.original_name,
        mimeType: v.mime_type,
        sizeBytes: v.size_bytes,
        sha256: v.sha256,
        uploadedVia: v.uploaded_via,
        uploadedBy: v.uploaded_by_name,
        restoredFrom: v.restored_from,
        createdAt: v.created_at,
        previewable: PREVIEWABLE.has(v.mime_type),
      })),
    });
  });

  // Title, folder, sharing with the client, and the fee lock.
  fastify.patch('/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = DocPatch.safeParse(request.body);
    if (!UUID.safeParse(id).success || !b.success) return bad(reply, b.success ? undefined : b.error.issues[0]?.message);
    const p = b.data;
    const touchesLock = p.lockedUntilPaid !== undefined || p.feeInvoiceId !== undefined;
    if (touchesLock && !lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers lock documents against fees.' });
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const d = (
        await c.query<{ entity_id: string; folder_id: string | null; locked_until_paid: boolean; fee_invoice_id: string | null; fee_waived: boolean }>(
          `SELECT entity_id, folder_id, locked_until_paid, fee_invoice_id, fee_waived FROM public.client_documents WHERE id = $1`,
          [id],
        )
      ).rows[0];
      if (!d) return { status: 404, message: 'Not found' } as const;
      if (p.folderId && !(await folderOf(c, p.folderId, d.entity_id))) return { status: 404, message: 'That folder is not in this client’s documents.' } as const;
      const locked = p.lockedUntilPaid ?? d.locked_until_paid;
      let invoice = p.feeInvoiceId !== undefined ? p.feeInvoiceId : d.fee_invoice_id;
      if (!locked && p.lockedUntilPaid === false) invoice = null;
      if (locked && !invoice) return { status: 400, message: 'Choose the fee invoice that unlocks this document.' } as const;
      if (invoice && invoice !== d.fee_invoice_id) {
        const inv = (await c.query<{ status: string }>(`SELECT status FROM public.fee_invoices WHERE id = $1 AND entity_id = $2`, [invoice, d.entity_id])).rows[0];
        if (!inv) return { status: 404, message: 'That fee invoice is not one of this client’s.' } as const;
        if (inv.status !== 'ISSUED') return { status: 400, message: 'That fee invoice is cancelled. Choose an issued one.' } as const;
      }
      // A new lock or a different invoice needs a fresh waiver.
      const resetWaiver = (locked && !d.locked_until_paid) || invoice !== d.fee_invoice_id;
      const r = await c.query<{ updated_at: Date }>(
        `UPDATE public.client_documents SET
           title = COALESCE($2, title),
           folder_id = CASE WHEN $3::boolean THEN $4::uuid ELSE folder_id END,
           shared_with_client = COALESCE($5, shared_with_client),
           locked_until_paid = $6, fee_invoice_id = $7,
           fee_waived = CASE WHEN $8::boolean THEN false ELSE fee_waived END,
           fee_waived_by = CASE WHEN $8::boolean THEN NULL ELSE fee_waived_by END,
           fee_waived_at = CASE WHEN $8::boolean THEN NULL ELSE fee_waived_at END
         WHERE id = $1 AND ${VERSION_MATCHES('$9')} RETURNING updated_at`,
        [id, p.title ?? null, p.folderId !== undefined, p.folderId ?? null, p.sharedWithClient ?? null, locked, invoice, resetWaiver, expected],
      );
      if (!r.rows[0]) return { status: 409, message: 'Someone changed this document after you opened it. Reload to see the latest.' } as const;
      return { status: 200, updatedAt: r.rows[0].updated_at } as const;
    });
    if (out.status !== 200) return reply.status(out.status).send({ error: out.status === 409 ? 'Changed' : out.status === 404 ? 'Not found' : 'Invalid', message: out.message });
    reply.header('ETag', versionTag(out.updatedAt));
    return reply.send({ ok: true, version: new Date(out.updatedAt).toISOString() });
  });

  // The partner lets the client open a locked document before the invoice is paid, or takes that back.
  fastify.post('/:id/waive', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.user.role !== 'PARTNER') return reply.status(403).send({ error: 'Forbidden', message: 'Only a partner waives the fee lock.' });
    const { id } = request.params as { id: string };
    const b = WaiveBody.safeParse(request.body);
    if (!UUID.safeParse(id).success || !b.success) return bad(reply);
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction<Date | 'missing' | 'unlocked' | 'stale'>(ctx(request), async (c) => {
      const d = (await c.query<{ locked_until_paid: boolean }>(`SELECT locked_until_paid FROM public.client_documents WHERE id = $1`, [id])).rows[0];
      if (!d) return 'missing' as const;
      if (!d.locked_until_paid) return 'unlocked' as const;
      const r = await c.query<{ updated_at: Date }>(
        `UPDATE public.client_documents SET fee_waived = $2,
           fee_waived_by = CASE WHEN $2 THEN app.current_user_id() ELSE NULL END,
           fee_waived_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1 AND ${VERSION_MATCHES('$3')} RETURNING updated_at`,
        [id, b.data.waived, expected],
      );
      return r.rows[0]?.updated_at ?? ('stale' as const);
    });
    if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out === 'unlocked') return reply.status(409).send({ error: 'Not locked', message: 'This document is not locked against a fee.' });
    if (out === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone changed this document after you opened it. Reload to see the latest.' });
    reply.header('ETag', versionTag(out));
    return reply.send({ ok: true, version: new Date(out).toISOString() });
  });

  // Download, or preview in the browser for PDFs and images. Every open is logged.
  fastify.get('/:id/versions/:version/file', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const p = VersionParams.safeParse(request.params);
    if (!p.success) return bad(reply);
    const store = getFileStore();
    if (!store) return reply.status(503).send({ error: 'Unavailable', message: NOT_SET_UP });
    const v = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query<{ storage_key: string; original_name: string; mime_type: string; sha256: string }>(
          `SELECT storage_key, original_name, mime_type, sha256 FROM public.client_document_versions WHERE document_id = $1 AND version = $2`,
          [p.data.id, p.data.version],
        )
      ).rows[0],
    );
    if (!v) return reply.status(404).send({ error: 'Not found' });
    const body = await store.get(v.storage_key);
    if (sha256(body) !== v.sha256) return reply.status(409).send({ error: 'Integrity', message: 'The stored file does not match its checksum. It has not been opened.' });
    const inline = (request.query as { inline?: string } | undefined)?.inline === '1' && PREVIEWABLE.has(v.mime_type);
    await db.withTenantTransaction(ctx(request), (c) =>
      c.query(`INSERT INTO public.client_document_opens (firm_id, document_id, version, user_id, kind) VALUES (app.current_firm_id(), $1, $2, app.current_user_id(), $3)`, [
        p.data.id,
        p.data.version,
        inline ? 'PREVIEW' : 'DOWNLOAD',
      ]),
    );
    if (inline && v.mime_type.startsWith('image/')) reply.header('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    return reply
      .header('content-type', v.mime_type)
      .header('content-disposition', contentDisposition(inline ? 'inline' : 'attachment', v.original_name))
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store')
      .send(body);
  });

  // Who opened which version and when. Partners only (the database enforces it too).
  fastify.get('/:id/opens', async (request, reply) => {
    if (request.user.role !== 'PARTNER') return reply.status(403).send({ error: 'Forbidden', message: 'Only partners see who opened a document.' });
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return bad(reply);
    const rows = await db.withTenantTransaction(ctx(request), async (c) => {
      if (!(await c.query(`SELECT 1 FROM public.client_documents WHERE id = $1`, [id])).rowCount) return null;
      return (
        await c.query(
          `SELECT o.version, o.kind, o.opened_at, u.display_name, u.role
           FROM public.client_document_opens o LEFT JOIN public.users u ON u.id = o.user_id
           WHERE o.document_id = $1 ORDER BY o.opened_at DESC LIMIT 500`,
          [id],
        )
      ).rows;
    });
    if (!rows) return reply.status(404).send({ error: 'Not found' });
    return reply.send({ opens: rows.map((r) => ({ version: r.version, kind: r.kind, openedAt: r.opened_at, by: r.display_name ?? 'Unknown', byClient: r.role === 'CLIENT' })) });
  });
}

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseConsoFile, writeCorrection, correctionTypesNeeded } from '@synextax/tax-engine';
import type { CorrectionOptions } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { publicMessage } from '../plugins/publicError.js';
import {
  EditsSchema, CorrectionTypeSchema, TokenSchema, type Edits,
  asEngineEdits, consoPreview, exportCsv, importCsv, maskEdits, restorePans,
} from '../modules/tds/correctionEdits.js';

/**
 * TDS correction drafts, versions and revert. Mounted at /api/v1/tds/correction-drafts.
 * A draft is the consolidated file of one TAN, form, tax year and quarter plus the changes; every
 * save and every revert adds a version. Partners and managers write; staff with TDS access read.
 * PANs leave masked; a partner may export them in full with a reason, which is logged.
 */

type Client = { query: <T = any>(sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> };

const WRITERS = ['PARTNER', 'MANAGER'];
const READERS = ['PARTNER', 'MANAGER', 'STAFF'];
const EMPTY: Edits = { deductees: [], added: [], challans: [], newChallans: [] };
const Id = z.string().uuid();
const Options = z.object({ originalToken: TokenSchema.optional(), previousToken: TokenSchema.optional() });
const CreateBody = Options.extend({
  text: z.string().min(10).max(10 * 1024 * 1024),
  title: z.string().trim().max(120).optional(),
  edits: EditsSchema.default(EMPTY),
});
const SaveBody = Options.extend({
  edits: EditsSchema,
  title: z.string().trim().max(120).optional(),
  note: z.string().trim().max(200).optional(),
  /** A fresh consolidated file for the same TAN, form, tax year and quarter. */
  text: z.string().min(10).max(10 * 1024 * 1024).optional(),
});
const RevertBody = z.object({ note: z.string().trim().max(200).optional() });
const ExportBody = z.object({ revealPans: z.boolean().default(false), reason: z.string().trim().max(500).optional() });
const ImportBody = z.object({ csv: z.string().min(1).max(5 * 1024 * 1024), note: z.string().trim().max(200).optional() });
const BuildBody = Options.extend({ type: CorrectionTypeSchema.optional() });
const ListQuery = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/).optional(),
  form: z.enum(['138', '140', '143', '144']).optional(),
  taxYear: z.coerce.number().int().min(2026).max(2100).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
});

const sha = (t: string) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

interface DraftRow {
  id: string; entity_id: string; tan: string; form: string; tax_year: number; quarter: number; title: string | null; deductor_name: string | null;
  current_version: number; conso_sha256: string; edits: Edits; options: { originalToken?: string; previousToken?: string };
  created_at: Date; updated_at: Date;
}

const DRAFT_COLS = 'id, entity_id, tan, form, tax_year, quarter, title, deductor_name, current_version, conso_sha256, edits, options, created_at, updated_at';

async function loadDraft(c: Client, id: string): Promise<DraftRow | null> {
  return (await c.query<DraftRow>(`SELECT ${DRAFT_COLS} FROM public.tds_correction_drafts WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0] ?? null;
}

/** The consolidated file as it stood at a version (kept on the version where it last changed). */
async function consoAt(c: Client, draftId: string, version: number): Promise<string> {
  const r = await c.query<{ conso_text: string }>(
    `SELECT conso_text FROM public.tds_correction_draft_versions WHERE draft_id = $1 AND version <= $2 AND conso_text IS NOT NULL ORDER BY version DESC LIMIT 1`,
    [draftId, version],
  );
  return r.rows[0]?.conso_text ?? '';
}

function counts(e: Edits) {
  return {
    deductor: e.deductor ? 1 : 0, deductees: e.deductees.length, added: e.added.length, challans: e.challans.length, newChallans: e.newChallans.length,
  };
}

function summary(d: DraftRow) {
  return {
    id: d.id, tan: d.tan, form: d.form, taxYear: d.tax_year, quarter: d.quarter, title: d.title, deductorName: d.deductor_name,
    currentVersion: d.current_version, changes: counts(d.edits ?? EMPTY), createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

/** Full view of a draft: the file's contents and the changes, PANs masked, and what the changes need. */
function view(d: DraftRow, text: string) {
  const conso = parseConsoFile(text);
  const edits = EditsSchema.parse(d.edits ?? EMPTY);
  return {
    ...summary(d),
    version: d.updated_at.toISOString(),
    options: d.options ?? {},
    edits: maskEdits(edits),
    needed: correctionTypesNeeded(conso, asEngineEdits(edits)),
    conso: consoPreview(conso),
  };
}

export async function tdsCorrectionDraftsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (!READERS.includes(request.user.role)) return reply.status(403).send({ error: 'Forbidden' });
  });

  const ctx = (req: FastifyRequest) => ({
    firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'],
  });
  const writer = (request: FastifyRequest, reply: FastifyReply) => {
    if (WRITERS.includes(request.user.role)) return true;
    reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers change correction drafts.' });
    return false;
  };
  const fail = (request: FastifyRequest, reply: FastifyReply, err: unknown) => {
    request.log.error({ err }, 'correction draft request failed');
    return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
  };
  const idOf = (request: FastifyRequest) => {
    const p = Id.safeParse((request.params as { id?: string }).id);
    return p.success ? p.data : null;
  };

  /** Appends a version and moves the draft to it, if the draft is still at the version the client read. */
  async function saveVersion(
    c: Client, request: FastifyRequest, d: DraftRow,
    next: { edits: Edits; options: Record<string, unknown>; text: string | null; note?: string; revertedFrom?: number; title?: string },
  ): Promise<'stale' | DraftRow> {
    const expected = expectedVersion(request);
    const nextSha = next.text === null ? d.conso_sha256 : sha(next.text);
    const consoText = nextSha !== d.conso_sha256 ? next.text : null;
    const version = d.current_version + 1;
    const upd = await c.query<DraftRow>(
      `UPDATE public.tds_correction_drafts SET current_version = $2, conso_sha256 = $3, edits = $4::jsonb, options = $5::jsonb,
         title = COALESCE($6, title), updated_by = app.current_user_id()
       WHERE id = $1 AND deleted_at IS NULL AND current_version = $7 AND ${VERSION_MATCHES('$8')}
       RETURNING ${DRAFT_COLS}`,
      [d.id, version, nextSha, JSON.stringify(next.edits), JSON.stringify(next.options), next.title ?? null, d.current_version, expected],
    );
    if (!upd.rows[0]) return 'stale';
    await c.query(
      `INSERT INTO public.tds_correction_draft_versions (firm_id, entity_id, draft_id, version, edits, options, conso_text, conso_sha256, note, reverted_from, created_by)
       VALUES (app.current_firm_id(), $1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, app.current_user_id())`,
      [d.entity_id, d.id, version, JSON.stringify(next.edits), JSON.stringify(next.options), consoText, nextSha, next.note ?? null, next.revertedFrom ?? null],
    );
    return upd.rows[0];
  }
  const stale = (reply: FastifyReply) =>
    reply.status(409).send({ error: 'Changed', message: 'Someone saved this draft after you opened it. Reload to see their changes.' });
  const sendDraft = (reply: FastifyReply, d: DraftRow, text: string, status = 200) => {
    reply.header('ETag', versionTag(d.updated_at));
    return reply.status(status).send(view(d, text));
  };

  // Create a draft from a consolidated file.
  fastify.post('/', { bodyLimit: 11 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!writer(request, reply)) return;
    const b = CreateBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Send the consolidated file.' });
    const conso = parseConsoFile(b.data.text);
    if (!conso.form || !conso.tan || !conso.taxYear || !conso.quarter) {
      return reply.status(422).send({ error: 'Not a consolidated file', issues: conso.issues.length ? conso.issues : ['The file has no batch header with the TAN, form, tax year and quarter.'] });
    }
    const restored = restorePans(b.data.edits, EMPTY, conso);
    if (restored.problems.length) return reply.status(400).send({ error: 'Invalid', message: restored.problems[0] });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
        const tan = (await c.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [conso.tan])).rows[0];
        if (!tan) return { kind: 'unknown' as const };
        const existing = (await c.query<{ id: string }>(
          `SELECT id FROM public.tds_correction_drafts WHERE tan_registration_id = $1 AND form = $2 AND tax_year = $3 AND quarter = $4 AND deleted_at IS NULL`,
          [tan.id, conso.form, conso.taxYear, conso.quarter],
        )).rows[0];
        if (existing) return { kind: 'exists' as const, id: existing.id };
        const options = clean({ originalToken: b.data.originalToken, previousToken: b.data.previousToken });
        const hash = sha(b.data.text);
        const d = (await c.query<DraftRow>(
          `INSERT INTO public.tds_correction_drafts (firm_id, entity_id, tan_registration_id, tan, form, tax_year, quarter, title, deductor_name, conso_sha256, edits, options, created_by, updated_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, app.current_user_id(), app.current_user_id())
           RETURNING ${DRAFT_COLS}`,
          [tan.entity_id, tan.id, conso.tan, conso.form, conso.taxYear, conso.quarter, b.data.title || null, conso.deductorName.slice(0, 75) || null, hash, JSON.stringify(restored.edits), JSON.stringify(options)],
        )).rows[0];
        await c.query(
          `INSERT INTO public.tds_correction_draft_versions (firm_id, entity_id, draft_id, version, edits, options, conso_text, conso_sha256, note, created_by)
           VALUES (app.current_firm_id(), $1, $2, 1, $3::jsonb, $4::jsonb, $5, $6, 'Created', app.current_user_id())`,
          [tan.entity_id, d.id, JSON.stringify(restored.edits), JSON.stringify(options), b.data.text, hash],
        );
        return { kind: 'ok' as const, d };
      });
      if (out.kind === 'unknown') return reply.status(422).send({ error: 'Not ready', issues: [`TAN ${conso.tan} is not one of this firm's clients, or not one assigned to you.`] });
      if (out.kind === 'exists') return reply.status(409).send({ error: 'Exists', id: out.id, message: 'There is already a draft for this TAN, form and quarter. Open it, or delete it first.' });
      return sendDraft(reply, out.d, b.data.text, 201);
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  fastify.get('/', async (request, reply) => {
    const q = ListQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Invalid filter' });
    const { tan, form, taxYear, quarter } = q.data;
    const rows = await db.withTenantTransaction(ctx(request), async (c: Client) =>
      (await c.query<DraftRow>(
        `SELECT ${DRAFT_COLS} FROM public.tds_correction_drafts
         WHERE deleted_at IS NULL AND ($1::text IS NULL OR tan = $1) AND ($2::text IS NULL OR form = $2)
           AND ($3::int IS NULL OR tax_year = $3) AND ($4::int IS NULL OR quarter = $4)
         ORDER BY updated_at DESC LIMIT 200`,
        [tan ?? null, form ?? null, taxYear ?? null, quarter ?? null],
      )).rows,
    );
    return reply.send({ drafts: rows.map(summary) });
  });

  fastify.get('/:id', async (request, reply) => {
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
      const d = await loadDraft(c, id);
      return d ? { d, text: await consoAt(c, d.id, d.current_version) } : null;
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return sendDraft(reply, out.d, out.text);
  });

  // Save: a new version with these changes (and, optionally, a fresh consolidated file).
  fastify.put('/:id', { bodyLimit: 11 * 1024 * 1024 }, async (request, reply) => {
    if (!writer(request, reply)) return;
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const b = SaveBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the changes.' });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
        const d = await loadDraft(c, id);
        if (!d) return { kind: 'missing' as const };
        const text = b.data.text ?? (await consoAt(c, d.id, d.current_version));
        const conso = parseConsoFile(text);
        if (b.data.text && (conso.tan !== d.tan || conso.form !== d.form || conso.taxYear !== d.tax_year || conso.quarter !== d.quarter)) {
          return { kind: 'mismatch' as const };
        }
        const restored = restorePans(b.data.edits, EditsSchema.parse(d.edits ?? EMPTY), conso);
        if (restored.problems.length) return { kind: 'pan' as const, message: restored.problems[0] };
        const options = clean({ originalToken: b.data.originalToken, previousToken: b.data.previousToken });
        const saved = await saveVersion(c, request, d, { edits: restored.edits, options, text: b.data.text ?? null, note: b.data.note, title: b.data.title });
        return saved === 'stale' ? { kind: 'stale' as const } : { kind: 'ok' as const, d: saved, text };
      });
      if (out.kind === 'missing') return reply.status(404).send({ error: 'Not found' });
      if (out.kind === 'stale') return stale(reply);
      if (out.kind === 'mismatch') return reply.status(422).send({ error: 'Different statement', message: 'The new consolidated file is for a different TAN, form, tax year or quarter.' });
      if (out.kind === 'pan') return reply.status(400).send({ error: 'Invalid', message: out.message });
      return sendDraft(reply, out.d, out.text);
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  fastify.get('/:id/versions', async (request, reply) => {
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const rows = await db.withTenantTransaction(ctx(request), async (c: Client) => {
      if (!(await loadDraft(c, id))) return null;
      return (await c.query<{ version: number; note: string | null; reverted_from: number | null; created_at: Date; created_by_name: string | null; conso_changed: boolean; edits: Edits }>(
        `SELECT v.version, v.note, v.reverted_from, v.created_at, u.display_name AS created_by_name, (v.conso_text IS NOT NULL) AS conso_changed, v.edits
         FROM public.tds_correction_draft_versions v LEFT JOIN public.users u ON u.id = v.created_by
         WHERE v.draft_id = $1 ORDER BY v.version DESC LIMIT 500`,
        [id],
      )).rows;
    });
    if (!rows) return reply.status(404).send({ error: 'Not found' });
    return reply.send({
      versions: rows.map((r) => ({
        version: r.version, note: r.note, revertedFrom: r.reverted_from, createdAt: r.created_at, createdBy: r.created_by_name,
        consoChanged: r.conso_changed, changes: counts(EditsSchema.parse(r.edits ?? EMPTY)),
      })),
    });
  });

  // Revert: a new version that repeats an earlier one (its changes, tokens and consolidated file).
  fastify.post('/:id/versions/:version/revert', async (request, reply) => {
    if (!writer(request, reply)) return;
    const id = idOf(request);
    const target = Number((request.params as { version?: string }).version);
    if (!id || !Number.isInteger(target) || target < 1) return reply.status(400).send({ error: 'Bad id or version' });
    const b = RevertBody.safeParse(request.body ?? {});
    if (!b.success) return reply.status(400).send({ error: 'Invalid' });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
        const d = await loadDraft(c, id);
        if (!d) return { kind: 'missing' as const };
        const v = (await c.query<{ edits: Edits; options: Record<string, unknown> }>(
          'SELECT edits, options FROM public.tds_correction_draft_versions WHERE draft_id = $1 AND version = $2', [id, target],
        )).rows[0];
        if (!v || target >= d.current_version) return { kind: 'noversion' as const };
        const text = await consoAt(c, id, target);
        const saved = await saveVersion(c, request, d, { edits: EditsSchema.parse(v.edits), options: v.options ?? {}, text, note: b.data.note || `Back to version ${target}`, revertedFrom: target });
        return saved === 'stale' ? { kind: 'stale' as const } : { kind: 'ok' as const, d: saved, text };
      });
      if (out.kind === 'missing') return reply.status(404).send({ error: 'Not found' });
      if (out.kind === 'noversion') return reply.status(404).send({ error: 'Not found', message: 'Choose an earlier version of this draft.' });
      if (out.kind === 'stale') return stale(reply);
      return sendDraft(reply, out.d, out.text);
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  // Delete hides the draft; its versions stay in the history.
  fastify.delete('/:id', async (request, reply) => {
    if (!writer(request, reply)) return;
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
      const r = await c.query(
        `UPDATE public.tds_correction_drafts SET deleted_at = now(), deleted_by = app.current_user_id() WHERE id = $1 AND deleted_at IS NULL AND ${VERSION_MATCHES('$2')}`,
        [id, expected],
      );
      if (r.rowCount) return 'ok';
      return (await loadDraft(c, id)) ? 'stale' : 'missing';
    });
    if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out === 'stale') return stale(reply);
    return reply.send({ ok: true });
  });

  // Deductee rows as CSV. PANs masked; a partner may ask for them in full with a reason, which is logged.
  fastify.post('/:id/export-csv', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const b = ExportBody.safeParse(request.body ?? {});
    if (!b.success) return reply.status(400).send({ error: 'Invalid' });
    const reveal = b.data.revealPans;
    if (reveal && request.user.role !== 'PARTNER') return reply.status(403).send({ error: 'Forbidden', message: 'Only a partner can export full PANs.' });
    if (reveal && (b.data.reason ?? '').length < 5) return reply.status(400).send({ error: 'REASON_REQUIRED', message: 'State why the full PANs are needed (at least 5 characters).' });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
        const d = await loadDraft(c, id);
        if (!d) return null;
        // Logged before the PANs leave the database; if logging fails, nothing is exported.
        if (reveal) {
          await c.query('SELECT audit.log_pii_access(app.current_firm_id(), $1, $2, $3, $4, $5)', [d.entity_id, 'tds_correction_drafts', 'deductee_pan', d.id, b.data.reason]);
        }
        return { d, text: await consoAt(c, d.id, d.current_version) };
      });
      if (!out) return reply.status(404).send({ error: 'Not found' });
      const csv = exportCsv(parseConsoFile(out.text), EditsSchema.parse(out.d.edits ?? EMPTY), reveal);
      return reply.send({ fileName: `${out.d.tan}_${out.d.form}_Q${out.d.quarter}_${out.d.tax_year}_rows${reveal ? '' : '_masked'}.csv`, csv, panMasked: !reveal });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  // CSV back into the draft, as a new version.
  fastify.post('/:id/import-csv', { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!writer(request, reply)) return;
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const b = ImportBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the CSV text.' });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
        const d = await loadDraft(c, id);
        if (!d) return { kind: 'missing' as const };
        const text = await consoAt(c, d.id, d.current_version);
        const conso = parseConsoFile(text);
        const current = EditsSchema.parse(d.edits ?? EMPTY);
        const imp = importCsv(b.data.csv, conso, current);
        if (imp.problems.length) return { kind: 'problems' as const, problems: imp.problems };
        const restored = restorePans(imp.edits, current, conso);
        if (restored.problems.length) return { kind: 'problems' as const, problems: restored.problems.map((message) => ({ line: 0, message })) };
        const saved = await saveVersion(c, request, d, {
          edits: restored.edits, options: d.options ?? {}, text: null,
          note: b.data.note || `CSV: ${imp.changedRows} row${imp.changedRows === 1 ? '' : 's'} changed, ${imp.newRows} new`,
        });
        return saved === 'stale' ? { kind: 'stale' as const } : { kind: 'ok' as const, d: saved, text, changedRows: imp.changedRows, newRows: imp.newRows };
      });
      if (out.kind === 'missing') return reply.status(404).send({ error: 'Not found' });
      if (out.kind === 'stale') return stale(reply);
      if (out.kind === 'problems') return reply.status(422).send({ error: 'Not imported', problems: out.problems.slice(0, 200) });
      reply.header('ETag', versionTag(out.d.updated_at));
      return reply.send({ ...view(out.d, out.text), imported: { changedRows: out.changedRows, newRows: out.newRows } });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  // The correction file from the saved draft (save first; this does not take changes).
  fastify.post('/:id/build', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!writer(request, reply)) return;
    const id = idOf(request);
    if (!id) return reply.status(400).send({ error: 'Bad id' });
    const b = BuildBody.safeParse(request.body ?? {});
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the request.' });
    const out = await db.withTenantTransaction(ctx(request), async (c: Client) => {
      const d = await loadDraft(c, id);
      return d ? { d, text: await consoAt(c, d.id, d.current_version) } : null;
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    const conso = parseConsoFile(out.text);
    const edits = asEngineEdits(EditsSchema.parse(out.d.edits ?? EMPTY));
    const o = out.d.options ?? {};
    const res = writeCorrection(conso, edits, {
      type: b.data.type as CorrectionOptions['type'],
      originalToken: b.data.originalToken ?? o.originalToken, previousToken: b.data.previousToken ?? o.previousToken,
      fileCreated: istToday(), preparedWith: 'SynexTax',
    });
    if (res.issues.length || !res.type) return reply.status(422).send({ error: 'Not ready', type: res.type, pending: res.pending, issues: res.issues });
    request.log.info({ draft: out.d.id, tan: conso.tan, form: conso.form, type: res.type, version: out.d.current_version }, 'correction statement written from draft');
    const fileName = `${conso.tan}_${conso.form}_Q${conso.quarter}_${conso.taxYear}_${res.type}.txt`;
    return reply.send({ type: res.type, pending: res.pending, needed: correctionTypesNeeded(conso, edits), fileName, text: res.text, draftVersion: out.d.current_version });
  });
}

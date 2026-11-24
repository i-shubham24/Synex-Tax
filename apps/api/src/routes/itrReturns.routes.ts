import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ITR_ASSESSMENT_YEARS, ITR_ENGINE_AY, ITR_ENGINE_FORMS, ITR_FORMS, engineSummary, enteredSummary, itrChallans,
  type ItrAssessmentYear, type ItrFormName, type SavedReturnSummary,
} from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { publicMessage } from '../plugins/publicError.js';

const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: 'USER' as const,
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const maskPan = (pan: string | null | undefined) => (pan && PAN_RE.test(pan) ? `XXXXX${pan.slice(5)}` : pan ? 'XXXXXXXXXX' : '');
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = z.string().uuid();
const AY = z.enum(ITR_ASSESSMENT_YEARS);
const FORM = z.enum(ITR_FORMS);
const STATUS = z.enum(['DRAFT', 'READY', 'FILED']);
const money = z.number().finite().min(0).max(1e13);

const PageValues = z.record(z.string().max(40).regex(/^[a-zA-Z0-9.]+$/), z.string().max(20).regex(/^[0-9]*\.?[0-9]*$/))
  .refine((v) => Object.keys(v).length <= 80, 'Too many figures.');

/** What is kept of a return: the page's figures and the dated tax payments. No PAN, bank account or address. */
const Input = z.object({
  values: PageValues.default({}),
  ageBand: z.enum(['BELOW_60', 'SENIOR', 'SUPER_SENIOR']).default('BELOW_60'),
  metroCity: z.boolean().default(false),
  payments: z.array(z.object({
    bsr: z.string().regex(/^\d{7}$/).optional(), date: z.string().regex(ISO), serial: z.number().int().min(0).max(99999).optional(),
    amount: money, kind: z.enum(['ADVANCE', 'SELF']),
  })).max(100).default([]),
  /** The return as filed: earlier years, and ITR-5 or ITR-6 whose tax is not worked on the ITR page. */
  filed: z.object({
    totalIncome: money, totalTax: money, surcharge: money.optional(), cess: money.optional(),
    tdsTcs: money.optional(), advanceTax: money.optional(), selfAssessment: money.optional(),
  }).optional(),
}).strict();

const Body = z.object({
  entityId: UUID,
  assessmentYear: AY,
  form: FORM,
  regime: z.enum(['NEW', 'OLD']).default('NEW'),
  input: Input.default({ values: {}, ageBand: 'BELOW_60', metroCity: false, payments: [] }),
  status: STATUS.default('DRAFT'),
  ackNumber: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{15}$/).nullable()).default(null),
  filedOn: z.preprocess((v) => (v === '' ? null : v), z.string().regex(ISO).nullable()).default(null),
  notes: z.string().max(4000).default(''),
}).refine((b) => b.status !== 'FILED' || (b.ackNumber && b.filedOn), { message: 'A filed return needs the 15-digit acknowledgement number and the date of filing.', path: ['ackNumber'] });

type Saved = z.infer<typeof Body>;

/** The summary kept with a return: worked for AY 2026-27 on the individual forms, otherwise the figures as filed. */
export function summaryFor(b: Pick<Saved, 'assessmentYear' | 'form' | 'regime' | 'input'>): SavedReturnSummary {
  if (b.assessmentYear === ITR_ENGINE_AY && ITR_ENGINE_FORMS.includes(b.form as ItrFormName)) {
    return engineSummary(b.input.values, b.regime, b.input.ageBand, b.input.metroCity);
  }
  return enteredSummary(b.input.filed ?? { totalIncome: 0, totalTax: 0 }, b.regime);
}

/** Rule 12 of the Income-tax Rules: a company files ITR-6, and ITR-6 is for companies only. */
const formFits = (isCompany: boolean, form: string) => (isCompany ? form === 'ITR-6' : form !== 'ITR-6');
const FORM_MISMATCH = 'A company files ITR-6, and ITR-6 is only for companies. Pick the form that fits this client.';

const badRequest = (reply: FastifyReply, err: z.ZodError) => {
  const custom = err.issues.find((i) => i.code === 'custom');
  return reply.status(400).send({ error: 'Invalid', message: custom?.message ?? `Check: ${[...new Set(err.issues.map((i) => i.path.join('.') || 'the request'))].slice(0, 5).join(', ')}.` });
};

const RegisterQuery = z.object({
  assessmentYear: AY.default(ITR_ENGINE_AY),
  status: z.enum(['DRAFT', 'READY', 'FILED', 'NONE']).optional(),
  form: FORM.optional(),
  q: z.string().trim().max(100).optional(),
});

interface RegisterRow { entity_id: string; legal_name: string; pan: string; constitution: string; id: string | null; form: string | null; regime: string | null; status: string | null; ack_number: string | null; filed_on: string | Date | null; summary: SavedReturnSummary | null; updated_at: Date | null }

const isoDate = (d: string | Date | null) => (d ? (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);

async function register(request: FastifyRequest, q: z.infer<typeof RegisterQuery>) {
  const rows = await db.withTenantTransaction(ctx(request), async (c) =>
    (await c.query<RegisterRow>(
      `SELECT e.id AS entity_id, e.legal_name, e.pan, e.constitution::text AS constitution,
              r.id, r.form, r.regime, r.status, r.ack_number, to_char(r.filed_on, 'YYYY-MM-DD') AS filed_on, r.summary, r.updated_at
       FROM public.entities e
       LEFT JOIN public.itr_returns r ON r.entity_id = e.id AND r.firm_id = e.firm_id AND r.assessment_year = $1
       WHERE e.firm_id = app.current_firm_id()
         AND ($2::text IS NULL OR ($2 = 'NONE' AND r.id IS NULL) OR r.status = $2)
         AND ($3::text IS NULL OR r.form = $3)
         AND ($4::text IS NULL OR e.legal_name ILIKE '%' || $4 || '%' OR e.trade_name ILIKE '%' || $4 || '%')
       ORDER BY e.legal_name
       LIMIT 5000`,
      [q.assessmentYear, q.status ?? null, q.form ?? null, q.q ? q.q.replace(/[%_\\]/g, (m) => `\\${m}`) : null],
    )).rows,
  );
  return rows.map((r) => ({
    entityId: r.entity_id, name: r.legal_name, pan: maskPan(r.pan), constitution: r.constitution,
    returnId: r.id, form: r.form, regime: r.regime, status: r.status ?? 'NONE', ackNumber: r.ack_number, filedOn: isoDate(r.filed_on),
    totalIncome: r.summary?.totalIncome ?? null, totalTax: r.summary?.totalTax ?? null, payable: r.summary?.payable ?? null,
  }));
}

/** A cell for a CSV file: quoted, and text that a spreadsheet would run as a formula is prefixed with an apostrophe. */
const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

interface ReturnRow { id: string; entity_id: string; assessment_year: ItrAssessmentYear; form: ItrFormName; regime: 'NEW' | 'OLD'; input: Saved['input']; summary: SavedReturnSummary; status: string; ack_number: string | null; filed_on: string | null; notes: string | null; updated_at: Date; created_at: Date; legal_name: string; pan: string; is_company: boolean; firm_name: string }

const returnOut = (r: ReturnRow) => ({
  id: r.id, entityId: r.entity_id, entityName: r.legal_name, pan: maskPan(r.pan), isCompany: r.is_company, firmName: r.firm_name,
  assessmentYear: r.assessment_year, form: r.form, regime: r.regime, input: r.input, summary: r.summary, status: r.status,
  ackNumber: r.ack_number, filedOn: r.filed_on, notes: r.notes ?? '', version: new Date(r.updated_at).toISOString(), createdAt: new Date(r.created_at).toISOString(),
});

const SELECT_RETURN = `SELECT r.id, r.entity_id, r.assessment_year, r.form, r.regime, r.input, r.summary, r.status, r.ack_number, to_char(r.filed_on, 'YYYY-MM-DD') AS filed_on,
         r.notes, r.updated_at, r.created_at, e.legal_name, e.pan, e.is_company, f.legal_name AS firm_name
  FROM public.itr_returns r
  JOIN public.entities e ON e.id = r.entity_id AND e.firm_id = r.firm_id
  JOIN public.firms f ON f.id = r.firm_id`;

/**
 * Saved income tax returns: one per client and assessment year (AY 2022-23 to 2026-27), the five-year view,
 * the assessee register and challan values for e-Pay Tax. Mounted at /api/v1/itr-returns.
 */
export async function itrReturnsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  const read = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };
  const write = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  /** Clients to pick from, PAN masked. */
  fastify.get('/clients', read, async (request, reply) => {
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (await c.query<{ id: string; legal_name: string; pan: string; is_company: boolean; constitution: string }>(
          `SELECT id, legal_name, pan, is_company, constitution::text AS constitution FROM public.entities WHERE firm_id = app.current_firm_id() ORDER BY legal_name LIMIT 5000`,
        )).rows,
      );
      return reply.send({ clients: rows.map((r) => ({ id: r.id, name: r.legal_name, pan: maskPan(r.pan), isCompany: r.is_company, constitution: r.constitution })) });
    } catch (err) {
      request.log.error({ err }, 'itr-returns clients');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  /** The assessee register for one assessment year: every client, with its saved return if any. */
  fastify.get('/register', read, async (request, reply) => {
    const q = RegisterQuery.safeParse(request.query);
    if (!q.success) return badRequest(reply, q.error);
    try {
      return reply.send({ assessmentYear: q.data.assessmentYear, rows: await register(request, q.data), canExport: request.user.role === 'PARTNER' });
    } catch (err) {
      request.log.error({ err }, 'itr-returns register');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  /** The register as CSV, for partners only. PANs stay masked. */
  fastify.get('/register.csv', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.user.role !== 'PARTNER') return reply.status(403).send({ error: 'Forbidden', message: 'Only a partner exports the assessee register.' });
    const q = RegisterQuery.safeParse(request.query);
    if (!q.success) return badRequest(reply, q.error);
    try {
      const rows = await register(request, q.data);
      const head = ['Client', 'PAN', 'Assessment year', 'Form', 'Regime', 'Status', 'Acknowledgement', 'Filed on', 'Total income', 'Total tax', 'Payable or refund (-)'];
      const lines = rows.map((r) => [r.name, r.pan, q.data.assessmentYear, r.form, r.regime, r.status === 'NONE' ? 'Not started' : r.status, r.ackNumber, r.filedOn, r.totalIncome, r.totalTax, r.payable].map(csvCell).join(','));
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="assessee-register-AY-${q.data.assessmentYear}.csv"`);
      reply.header('cache-control', 'no-store');
      return reply.send(`ï»¿${[head.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`);
    } catch (err) {
      request.log.error({ err }, 'itr-returns register csv');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  /** Saved returns of one client, every year (the five-year view). */
  fastify.get('/', read, async (request, reply) => {
    const q = z.object({ entityId: UUID }).safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Invalid', message: 'Pick a client.' });
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (await c.query<ReturnRow>(`${SELECT_RETURN} WHERE r.firm_id = app.current_firm_id() AND r.entity_id = $1 ORDER BY r.assessment_year`, [q.data.entityId])).rows,
      );
      return reply.send({
        returns: rows.map((r) => ({
          id: r.id, assessmentYear: r.assessment_year, form: r.form, regime: r.regime, status: r.status, ackNumber: r.ack_number, filedOn: r.filed_on,
          basis: r.summary.basis ?? null, totalIncome: r.summary.totalIncome ?? 0, totalTax: r.summary.totalTax ?? 0, taxesPaid: r.summary.taxesPaid ?? 0, payable: r.summary.payable ?? 0,
          version: new Date(r.updated_at).toISOString(),
        })),
      });
    } catch (err) {
      request.log.error({ err }, 'itr-returns list');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  const loadOne = (request: FastifyRequest, id: string) =>
    db.withTenantTransaction(ctx(request), async (c) => (await c.query<ReturnRow>(`${SELECT_RETURN} WHERE r.firm_id = app.current_firm_id() AND r.id = $1`, [id])).rows[0] ?? null);

  fastify.get('/:id', read, async (request, reply) => {
    const id = UUID.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    try {
      const row = await loadOne(request, id.data);
      if (!row) return reply.status(404).send({ error: 'Not found' });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send(returnOut(row));
    } catch (err) {
      request.log.error({ err }, 'itr-returns get');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  /** The client's full PAN, when the user chooses to show it on the print. */
  fastify.get('/:id/pan', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const id = UUID.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    try {
      const row = await loadOne(request, id.data);
      if (!row) return reply.status(404).send({ error: 'Not found' });
      reply.header('cache-control', 'no-store');
      return reply.send({ pan: row.pan });
    } catch (err) {
      request.log.error({ err }, 'itr-returns pan');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  fastify.post('/', write, async (request, reply) => {
    const b = Body.safeParse(request.body);
    if (!b.success) return badRequest(reply, b.error);
    const d = b.data;
    const summary = summaryFor(d);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const e = await c.query<{ is_company: boolean }>(`SELECT is_company FROM public.entities WHERE firm_id = app.current_firm_id() AND id = $1`, [d.entityId]);
        if (!e.rows[0]) return { status: 404 as const };
        if (!formFits(e.rows[0].is_company, d.form)) return { status: 422 as const };
        const existing = await c.query<{ id: string }>(`SELECT id FROM public.itr_returns WHERE firm_id = app.current_firm_id() AND entity_id = $1 AND assessment_year = $2`, [d.entityId, d.assessmentYear]);
        if (existing.rows[0]) return { status: 409 as const, id: existing.rows[0].id };
        const r = await c.query<{ id: string; updated_at: Date }>(
          `INSERT INTO public.itr_returns (firm_id, entity_id, assessment_year, form, regime, input, summary, status, ack_number, filed_on, notes, created_by, updated_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, app.current_user_id(), app.current_user_id())
           RETURNING id, updated_at`,
          [d.entityId, d.assessmentYear, d.form, d.regime, JSON.stringify(d.input), JSON.stringify(summary), d.status, d.ackNumber, d.filedOn, d.notes || null],
        );
        return { status: 201 as const, id: r.rows[0].id, updatedAt: r.rows[0].updated_at };
      });
      if (out.status === 404) return reply.status(404).send({ error: 'Not found', message: 'Client not found.' });
      if (out.status === 422) return reply.status(422).send({ error: 'Form', message: FORM_MISMATCH });
      if (out.status === 409) return reply.status(409).send({ error: 'Exists', message: 'A return for this client and year is already saved. Open it and save over it.', id: out.id });
      reply.header('ETag', versionTag(out.updatedAt));
      return reply.status(201).send({ id: out.id, summary, version: new Date(out.updatedAt).toISOString() });
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') return reply.status(409).send({ error: 'Exists', message: 'A return for this client and year is already saved.' });
      request.log.error({ err }, 'itr-returns create');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  fastify.put('/:id', write, async (request, reply) => {
    const id = UUID.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const b = Body.safeParse(request.body);
    if (!b.success) return badRequest(reply, b.error);
    const d = b.data;
    const summary = summaryFor(d);
    const expected = expectedVersion(request);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const e = await c.query<{ is_company: boolean }>(`SELECT is_company FROM public.entities WHERE firm_id = app.current_firm_id() AND id = $1`, [d.entityId]);
        if (!e.rows[0]) return null;
        if (!formFits(e.rows[0].is_company, d.form)) return { mismatch: true as const };
        const r = await c.query<{ updated_at: Date }>(
          `UPDATE public.itr_returns SET form = $2, regime = $3, input = $4, summary = $5, status = $6, ack_number = $7, filed_on = $8, notes = $9, updated_by = app.current_user_id()
           WHERE firm_id = app.current_firm_id() AND id = $1 AND entity_id = $10 AND assessment_year = $11 AND ${VERSION_MATCHES('$12')}
           RETURNING updated_at`,
          [id.data, d.form, d.regime, JSON.stringify(d.input), JSON.stringify(summary), d.status, d.ackNumber, d.filedOn, d.notes || null, d.entityId, d.assessmentYear, expected],
        );
        if (r.rows[0]) return { updatedAt: r.rows[0].updated_at };
        const exists = await c.query(`SELECT 1 FROM public.itr_returns WHERE firm_id = app.current_firm_id() AND id = $1 AND entity_id = $2 AND assessment_year = $3`, [id.data, d.entityId, d.assessmentYear]);
        return exists.rowCount ? { conflict: true as const } : null;
      });
      if (!out) return reply.status(404).send({ error: 'Not found' });
      if ('mismatch' in out) return reply.status(422).send({ error: 'Form', message: FORM_MISMATCH });
      if ('conflict' in out) return reply.status(409).send({ error: 'Changed', message: 'Someone saved this return after you opened it. Reload to see their changes.' });
      reply.header('ETag', versionTag(out.updatedAt));
      return reply.send({ id: id.data, summary, version: new Date(out.updatedAt).toISOString() });
    } catch (err) {
      request.log.error({ err }, 'itr-returns update');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  /** Challan values for e-Pay Tax (self-assessment 300, or the open advance tax instalment 100) from the saved return. */
  fastify.get('/:id/challan', read, async (request, reply) => {
    const id = UUID.safeParse((request.params as { id: string }).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const q = z.object({
      payOn: z.string().regex(ISO).optional(),
      interest234A: z.coerce.number().finite().min(0).max(1e11).optional(),
      fee234F: z.coerce.number().finite().min(0).max(1e7).optional(),
      senior: z.enum(['true', 'false']).optional(),
    }).safeParse(request.query);
    if (!q.success) return badRequest(reply, q.error);
    try {
      const row = await loadOne(request, id.data);
      if (!row) return reply.status(404).send({ error: 'Not found' });
      const payOn = q.data.payOn ?? new Date().toISOString().slice(0, 10);
      const result = itrChallans({
        assessmentYear: row.assessment_year, company: row.is_company || row.form === 'ITR-6', summary: row.summary,
        payments: (row.input.payments ?? []).map((p) => ({ date: p.date, amount: p.amount, kind: p.kind })),
        payOn, seniorWithoutBusiness: q.data.senior === 'true', interest234A: q.data.interest234A, fee234F: q.data.fee234F,
      });
      return reply.send({ payOn, assessmentYear: row.assessment_year, pan: maskPan(row.pan), ...result });
    } catch (err) {
      request.log.error({ err }, 'itr-returns challan');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  FORM_138_SECTION_CODES,
  FORM_143_COLLECTION_CODES,
  FORM_144_SECTION_CODES,
  LEGACY_SECTION_CODES,
  form140Section,
  isLegacyForm,
  maskPan,
  parseEtdsStatement,
  parseQuarterSheet,
  tdsHealth,
} from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { commitStatement, ImportError } from '../modules/tds/statementImport.js';
import { buildStatement } from '../modules/tds/statementBuilder.js';
import { commitQuarter } from '../modules/tds/quarterImport.js';

/** What a section code means in a given form's Annexure 2, for the import preview. */
function sectionNature(form: string, code: string): string {
  const missing = `Not in the Form ${form} code list`;
  if (form === '138') return FORM_138_SECTION_CODES[code]?.nature ?? missing;
  // Protean's wording keeps the statute's dashes; the screen shows a colon instead.
  if (form === '140') return form140Section(code)?.nature.replace(/\s*[\u2013\u2014]+\s*/g, ': ') ?? missing;
  if (form === '144') return FORM_144_SECTION_CODES[code] ? `Section ${FORM_144_SECTION_CODES[code]}` : missing;
  if (form === '143') return FORM_143_COLLECTION_CODES[code] ?? missing;
  if (isLegacyForm(form)) return LEGACY_SECTION_CODES[form].has(code) ? `1961 Act code ${code}` : missing;
  return missing;
}

const StatementBody = z.object({ text: z.string().min(10).max(5 * 1024 * 1024) });
const QuarterBody = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  form: z.enum(['138', '140', '144', '143']),
  taxYear: z.number().int().min(2026).max(2100),
  quarter: z.number().int().min(1).max(4),
  text: z.string().min(10).max(5 * 1024 * 1024),
});
const TanQuery = z.object({ tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/).optional() });
const AddressSchema = z.object({
  line1: z.string().trim().max(25).default(''),
  line2: z.string().trim().max(25).optional(),
  line3: z.string().trim().max(25).optional(),
  line4: z.string().trim().max(25).optional(),
  district: z.string().trim().max(25).optional(),
  state: z.string().trim().max(60).default(''),
  pin: z.string().trim().max(6).default(''),
});
const TanDetailsSchema = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  deductorType: z.string().regex(/^[A-Z]$/),
  address: AddressSchema,
  deductorEmail: z.string().trim().max(75),
  deductorPhone: z.string().regex(/^\d{10}$/),
  gstin: z.string().regex(/^\d{2}[A-Z0-9]{13}$/).optional().or(z.literal('')),
  responsible: z.object({
    name: z.string().trim().min(1).max(75),
    designation: z.string().trim().min(1).max(20),
    pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
    address: AddressSchema,
    email: z.string().trim().max(75),
    phone: z.string().regex(/^\d{10}$/),
  }),
});

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** TDS history import (Form 140 text files), payee master and the health view. */
export async function tdsInsightsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });

  const ctx = (req: FastifyRequest) => ({
    firmId: req.user.firmId,
    userId: req.user.userId,
    actorKind: 'USER' as const,
    ip: req.ip,
    requestId: req.id,
    userAgent: req.headers['user-agent'],
  });

  // A quarter's payments pasted from Excel: checked here, saved by /quarter/import.
  fastify.post('/quarter/preview', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const b = QuarterBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the TAN, form, tax year, quarter and the pasted sheet.' });
    const q = b.data.quarter as 1 | 2 | 3 | 4;
    return reply.send(parseQuarterSheet(b.data.text, { form: b.data.form, taxYear: b.data.taxYear, quarter: q }));
  });

  fastify.post('/quarter/import', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const b = QuarterBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the TAN, form, tax year, quarter and the pasted sheet.' });
    const q = b.data.quarter as 1 | 2 | 3 | 4;
    const parsed = parseQuarterSheet(b.data.text, { form: b.data.form, taxYear: b.data.taxYear, quarter: q });
    if (parsed.missing.length) return reply.status(422).send({ error: 'Not imported', message: `Columns not found: ${parsed.missing.join(', ')}.` });
    if (parsed.errors.length) return reply.status(422).send({ error: 'Not imported', message: `${parsed.errors.length} row(s) have errors; nothing was saved.`, errors: parsed.errors });
    if (!parsed.challans.length) return reply.status(422).send({ error: 'Not imported', message: 'No rows found.' });
    try {
      const out = await db.withTenantTransaction(ctx(request), (c) => commitQuarter(c, { tan: b.data.tan, form: b.data.form, taxYear: b.data.taxYear, quarter: q, challans: parsed.challans }, request.user.userId));
      return reply.status(201).send(out);
    } catch (err: any) {
      if (err instanceof ImportError) return reply.status(err.statusCode).send({ error: 'Not imported', message: err.message });
      if (err.code === '23505') return reply.status(409).send({ error: 'Not imported', message: 'A challan in this sheet is already recorded for this TAN. Nothing was saved.' });
      throw err;
    }
  });

  // Reads the file and reports what would be imported; writes nothing.
  fastify.post('/import/preview', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const body = StatementBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Send the statement text.' });
    const s = parseEtdsStatement(body.data.text);
    const tanKnown = s.tan
      ? await db.withTenantTransaction(ctx(request), async (c) => (await c.query('SELECT 1 FROM public.tan_registrations WHERE tan = $1', [s.tan])).rows.length > 0)
      : false;
    return reply.send({
      form: s.form,
      regime: s.regime,
      tan: s.tan,
      tanKnown,
      deductorName: s.deductorName,
      taxYear: s.taxYear,
      quarter: s.quarter,
      challans: s.challans.length,
      deductees: s.deductees.length,
      totalDeposited: s.challans.reduce((sum, c) => sum + Number(c.totalDeposit), 0).toFixed(2),
      sections: [...new Set(s.deductees.map((d) => d.sectionCode))].map((code) => ({ code, nature: sectionNature(s.form, code) })),
      issues: s.issues,
    });
  });

  fastify.post('/import/commit', { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!['PARTNER', 'MANAGER'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers import past statements.' });
    }
    const body = StatementBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Send the statement text.' });
    const s = parseEtdsStatement(body.data.text);
    try {
      const result = await db.withTenantTransaction(ctx(request), (c) => commitStatement(c, s, request.user.userId));
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err instanceof ImportError) return reply.status(err.statusCode).send({ error: 'Not imported', message: err.message, issues: s.issues });
      if (err.code === '23505') return reply.status(409).send({ error: 'Not imported', message: 'A challan in this file is already recorded for this TAN.' });
      request.log.error({ err: err.code ?? err.message }, 'statement import failed');
      return reply.status(500).send({ error: 'Not imported', message: 'Nothing was saved. Try again.' });
    }
  });

  // Payee master: everyone this TAN has deducted from, newest first, for carrying into the new year.
  fastify.get('/payees', async (request, reply) => {
    const q = TanQuery.safeParse(request.query);
    if (!q.success || !q.data.tan) return reply.status(400).send({ error: 'Pass ?tan=' });
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT d.deductee_pan AS pan, max(d.deductee_name) AS name, array_agg(DISTINCT a.section_code) AS sections,
                  count(*)::int AS payments, sum(d.amount_paid)::text AS amount_paid, max(d.payment_credit_date) AS last_paid
           FROM public.tds_deductees d
           JOIN public.tan_registrations t ON t.id = d.tan_registration_id
           JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
           WHERE t.tan = $1
           GROUP BY d.deductee_pan, CASE WHEN d.deductee_pan IN ('PANNOTAVBL','PANAPPLIED','PANINVALID') THEN lower(d.deductee_name) ELSE '' END
           ORDER BY max(d.payment_credit_date) DESC
           LIMIT 2000`,
          [q.data.tan],
        )
      ).rows,
    );
    // PANs leave the server masked; the audited reveal endpoint shows a full one when needed.
    return reply.send({ payees: rows.map((r) => ({ ...r, pan: maskPan(r.pan), last_paid: iso(r.last_paid) })) });
  });

  // Returns for a TAN (newest first), to choose which statement to prepare.
  fastify.get('/returns', async (request, reply) => {
    const q = TanQuery.safeParse(request.query);
    if (!q.success || !q.data.tan) return reply.status(400).send({ error: 'Pass ?tan=' });
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT r.id, r.form_code, r.quarter, r.tax_year, r.workflow_status, r.source, r.statutory_due_date, r.total_deductees
           FROM public.tds_returns r JOIN public.tan_registrations t ON t.id = r.tan_registration_id
           WHERE t.tan = $1 ORDER BY r.tax_year DESC, r.quarter DESC`,
          [q.data.tan],
        )
      ).rows,
    );
    return reply.send({ returns: rows });
  });

  fastify.get('/tan-details', async (request, reply) => {
    const q = TanQuery.safeParse(request.query);
    if (!q.success || !q.data.tan) return reply.status(400).send({ error: 'Pass ?tan=' });
    const row = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT tan, deductor_type_code, address, deductor_email, deductor_phone, gstin, responsible_person_name, responsible_person_designation,
                  responsible_person_pan, responsible_address, responsible_email, responsible_phone
           FROM public.tan_registrations WHERE tan = $1`,
          [q.data.tan],
        )
      ).rows[0],
    );
    return row ? reply.send(row) : reply.status(404).send({ error: 'Not found' });
  });

  fastify.put('/tan-details', async (request, reply) => {
    if (!['PARTNER', 'MANAGER'].includes(request.user.role)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers edit deductor details.' });
    const b = TanDetailsSchema.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Validation Error', details: b.error.flatten() });
    const d = b.data;
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `UPDATE public.tan_registrations SET deductor_type_code = $2, address = $3, deductor_email = $4, deductor_phone = $5, gstin = NULLIF($6, ''),
             responsible_person_name = $7, responsible_person_designation = $8, responsible_person_pan = $9, responsible_address = $10,
             responsible_email = $11, responsible_phone = $12
           WHERE tan = $1`,
          [d.tan, d.deductorType, d.address, d.deductorEmail, d.deductorPhone, d.gstin ?? '', d.responsible.name, d.responsible.designation, d.responsible.pan, d.responsible.address, d.responsible.email, d.responsible.phone],
        )
      ).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });

  // Records the 15-digit token number received after filing (the next statement must quote it).
  fastify.put('/returns/:id/token', async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = String((request.body as { token?: string })?.token ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{15}$/.test(token)) return reply.status(400).send({ error: 'Give the 15-digit token number.' });
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (await c.query(`UPDATE public.tds_returns SET latest_accepted_token_15digit = $2 WHERE id = $1 AND workflow_status IN ('FILED','CLOSED')`, [id, token])).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Only a filed statement takes a token number.' });
  });

  // Writes the statement text file for a return, or lists what must be filled in first.
  fastify.post('/returns/:id/statement', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/.test(id)) return reply.status(400).send({ error: 'Bad id' });
    const out = await db.withTenantTransaction(ctx(request), (c) => buildStatement(c, id, istToday()));
    if (!out) return reply.status(404).send({ error: 'Not found' });
    if (out.issues.length) return reply.status(422).send({ error: 'Not ready', issues: out.issues });
    return reply.send({ fileName: out.fileName, text: out.text });
  });

  // Health: unconsumed challans, late deposit interest, late fee exposure, PAN problems, corrections closing.
  fastify.get('/health', async (request, reply) => {
    const q = TanQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Bad TAN' });
    const tan = q.data.tan ?? null;
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const challans = await c.query(
        `SELECT ch.id, ch.bsr_code, ch.challan_no, ch.deposit_date, ch.total_income_tax::text AS tax, t.tan
         FROM public.tds_challans ch JOIN public.tan_registrations t ON t.id = ch.tan_registration_id
         WHERE ($1::text IS NULL OR t.tan = $1)`,
        [tan],
      );
      const deductees = await c.query(
        `SELECT d.id, d.challan_id, d.deductee_pan, d.pan_status, d.deductee_name, d.tds_deducted::text AS ded, d.total_tds_deposited::text AS dep, d.deduction_date
         FROM public.tds_deductees d JOIN public.tan_registrations t ON t.id = d.tan_registration_id
         WHERE ($1::text IS NULL OR t.tan = $1)`,
        [tan],
      );
      const returns = await c.query(
        `SELECT r.id, r.form_code, r.quarter, r.tax_year, r.statutory_due_date, r.workflow_status, r.filed_at, r.total_tax_deducted::text AS tax,
                r.correction_window_expires_at, t.tan
         FROM public.tds_returns r JOIN public.tan_registrations t ON t.id = r.tan_registration_id
         WHERE ($1::text IS NULL OR t.tan = $1)`,
        [tan],
      );
      return { challans: challans.rows, deductees: deductees.rows, returns: returns.rows };
    });
    const ty = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    const report = tdsHealth({
      today: istToday(),
      challans: data.challans.map((r) => ({ id: r.id, label: `${r.tan} BSR ${r.bsr_code} / ${r.challan_no}, ${iso(r.deposit_date)}`, depositDate: iso(r.deposit_date)!, taxDeposited: r.tax })),
      deductees: data.deductees.map((r) => ({ id: r.id, challanId: r.challan_id, pan: r.deductee_pan, panStatus: r.pan_status, name: r.deductee_name, taxDeducted: r.ded, taxDeposited: r.dep, deductionDate: iso(r.deduction_date)! })),
      returns: data.returns.map((r) => ({
        id: r.id,
        label: `${r.tan} Form ${r.form_code} ${r.quarter} ${/Q$/.test(r.form_code) ? 'FY' : 'TY'} ${ty(r.tax_year)}`,
        dueDate: iso(r.statutory_due_date)!,
        status: r.workflow_status,
        filedOn: iso(r.filed_at),
        totalTax: r.tax,
        correctionWindowEndsOn: iso(r.correction_window_expires_at),
      })),
    });
    for (const p of report.panIssues) p.pan = maskPan(p.pan);
    return reply.send(report);
  });
}

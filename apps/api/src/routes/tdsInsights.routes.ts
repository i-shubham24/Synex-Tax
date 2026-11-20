import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parseEtdsStatement, tdsHealth, form140Section } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { commitStatement, ImportError } from '../modules/tds/statementImport.js';

const StatementBody = z.object({ text: z.string().min(10).max(5 * 1024 * 1024) });
const TanQuery = z.object({ tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/).optional() });

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
      tan: s.tan,
      tanKnown,
      deductorName: s.deductorName,
      taxYear: s.taxYear,
      quarter: s.quarter,
      challans: s.challans.length,
      deductees: s.deductees.length,
      totalDeposited: s.challans.reduce((sum, c) => sum + Number(c.totalDeposit), 0).toFixed(2),
      sections: [...new Set(s.deductees.map((d) => d.sectionCode))].map((code) => ({ code, nature: form140Section(code)?.nature ?? 'Not in the Form 140 code list' })),
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
    return reply.send({ payees: rows.map((r) => ({ ...r, last_paid: iso(r.last_paid) })) });
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
        label: `${r.tan} Form ${r.form_code} ${r.quarter} TY ${ty(r.tax_year)}`,
        dueDate: iso(r.statutory_due_date)!,
        status: r.workflow_status,
        filedOn: iso(r.filed_at),
        totalTax: r.tax,
        correctionWindowEndsOn: iso(r.correction_window_expires_at),
      })),
    });
    return reply.send(report);
  });
}

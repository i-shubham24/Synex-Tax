import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  defaultAnalysis,
  depositRegister,
  formHasSection,
  maskPan,
  sectionRegister,
  statementRegister,
  type RegisterRow,
} from '@synextax/tax-engine';
import { db } from '../db/pool.js';

const RegisterQuery = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  year: z.coerce.number().int().min(2000).max(2100),
});

const Form121Body = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  taxYear: z.number().int().min(2000).max(2100),
  pan: z.string().regex(/^[A-Z]{3}[ABGHJLPT][A-Z]\d{4}[A-Z]$/, 'Declarations are given by individuals, HUFs, AOPs, trusts and similar persons, not by companies or firms.'),
  name: z.string().trim().min(1).max(75),
  identificationNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{26}$/, 'The identification number is 26 letters and digits.').optional().or(z.literal('')),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seniorCitizen: z.boolean().default(false),
  incomeNature: z.string().trim().max(120).optional(),
  estimatedIncome: z.number().min(0).max(1e13),
  estimatedTotalIncome: z.number().min(0).max(1e13),
});

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Rows saved before migration 0018 have no form; place them by section code. */
function formOf(stored: string | null, code: string): string {
  if (stored) return stored;
  if (formHasSection('138', code)) return '138';
  if (formHasSection('143', code)) return '143';
  if (formHasSection('144', code) && !formHasSection('140', code)) return '144';
  return '140';
}

/** TDS registers for one TAN and year: default analysis, deposits, section totals, statements, Form 121. */
export async function tdsRegistersRoutes(fastify: FastifyInstance) {
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

  fastify.get('/registers', async (request, reply) => {
    const q = RegisterQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?tan= and ?year= (the year the period starts in, e.g. 2026 for 2026-27).' });
    const { tan, year } = q.data;
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const t = (await c.query<{ id: string }>('SELECT id FROM public.tan_registrations WHERE tan = $1', [tan])).rows[0];
      if (!t) return null;
      const challans = await c.query(
        `SELECT id, bsr_code, challan_no, deposit_date, interest_allocation::text AS interest
         FROM public.tds_challans WHERE tan_registration_id = $1 AND tax_year = $2 AND status = 'ACTIVE'`,
        [t.id, year],
      );
      const rows = await c.query(
        `SELECT d.id, d.form_code, d.challan_id, d.deductee_pan, d.deductee_name, a.section_code, d.payment_credit_date, d.amount_paid::text AS paid,
                d.tds_deducted::text AS ded, d.total_tds_deposited::text AS dep, d.deduction_date, (d.tds_rate * 100)::text AS rate,
                d.reason_for_non_deduction, d.form121_uin
         FROM public.tds_deductees d
         JOIN public.tds_challans ch ON ch.id = d.challan_id
         JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
         WHERE ch.tan_registration_id = $1 AND ch.tax_year = $2 AND ch.status = 'ACTIVE'`,
        [t.id, year],
      );
      const returns = await c.query(
        `SELECT id, form_code, quarter, statutory_due_date, filed_at, workflow_status FROM public.tds_returns
         WHERE tan_registration_id = $1 AND tax_year = $2 AND return_type = 'ORIGINAL'`,
        [t.id, year],
      );
      const form121 = await c.query(
        `SELECT id, declarant_pan, declarant_name, identification_no, received_on, senior_citizen, income_nature,
                estimated_income::text AS estimated_income, estimated_total_income::text AS estimated_total_income, status
         FROM public.form121_declarations WHERE tan_registration_id = $1 AND tax_year = $2 ORDER BY received_on DESC`,
        [t.id, year],
      );
      return { challans: challans.rows, rows: rows.rows, returns: returns.rows, form121: form121.rows };
    });
    if (!data) return reply.status(404).send({ error: 'Not found', message: `TAN ${tan} is not in Client Master.` });

    const challans = data.challans.map((c) => ({ id: c.id, label: `BSR ${c.bsr_code} / ${c.challan_no}`, depositDate: iso(c.deposit_date)!, interestPaid: c.interest ?? '0' }));
    const rows: RegisterRow[] = data.rows.map((r) => ({
      id: r.id,
      form: formOf(r.form_code, r.section_code),
      challanId: r.challan_id,
      pan: r.deductee_pan,
      name: r.deductee_name,
      sectionCode: r.section_code,
      paidOn: iso(r.payment_credit_date)!,
      amountPaid: r.paid,
      taxDeducted: r.ded,
      taxDeposited: r.dep,
      deductedOn: iso(r.deduction_date),
      ratePercent: r.rate,
      reasonCode: r.reason_for_non_deduction,
      form121Uin: r.form121_uin,
    }));
    const active = data.form121.filter((f) => f.status === 'ACTIVE');
    const analysis = defaultAnalysis({ rows, challans, form121: active.map((f) => ({ pan: f.declarant_pan, uin: f.identification_no })) });

    // PANs leave the server masked; the audited reveal endpoint shows a full one when needed.
    for (const list of [analysis.noPanLowRate, analysis.declarationsMissing]) for (const x of list) x.pan = maskPan(x.pan);

    return reply.send({
      tan,
      year,
      analysis,
      deposits: depositRegister({ rows, challans }),
      sections: sectionRegister(rows),
      statements: statementRegister(
        data.returns.map((r) => ({ id: r.id, form: r.form_code, quarter: r.quarter, dueDate: iso(r.statutory_due_date)!, filedOn: iso(r.filed_at), status: r.workflow_status })),
        istToday(),
      ),
      form121: data.form121.map((f) => ({
        id: f.id,
        pan: maskPan(f.declarant_pan),
        name: f.declarant_name,
        identificationNo: f.identification_no,
        receivedOn: iso(f.received_on),
        seniorCitizen: f.senior_citizen,
        incomeNature: f.income_nature,
        estimatedIncome: f.estimated_income,
        estimatedTotalIncome: f.estimated_total_income,
        status: f.status,
      })),
    });
  });

  fastify.post('/form121', async (request, reply) => {
    const body = Form121Body.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Invalid', message: body.error.issues[0]?.message ?? 'Check the declaration details.' });
    const d = body.data;
    if (d.seniorCitizen && d.pan[3] !== 'P') return reply.status(400).send({ error: 'Invalid', message: 'Senior citizen declarations are only given by individuals.' });
    if (d.receivedOn > istToday()) return reply.status(400).send({ error: 'Invalid', message: 'The date received cannot be in the future.' });
    try {
      const id = await db.withTenantTransaction(ctx(request), async (c) => {
        const t = (await c.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [d.tan])).rows[0];
        if (!t) return null;
        return (
          await c.query<{ id: string }>(
            `INSERT INTO public.form121_declarations (firm_id, entity_id, tan_registration_id, tax_year, declarant_pan, declarant_name, identification_no,
               received_on, senior_citizen, income_nature, estimated_income, estimated_total_income, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [t.entity_id, t.id, d.taxYear, d.pan, d.name, d.identificationNo || null, d.receivedOn, d.seniorCitizen, d.incomeNature || null, d.estimatedIncome, d.estimatedTotalIncome, request.user.userId],
          )
        ).rows[0].id;
      });
      if (!id) return reply.status(404).send({ error: 'Not found', message: `TAN ${d.tan} is not in Client Master.` });
      return reply.status(201).send({ id });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Duplicate', message: 'That identification number is already in the register for this TAN.' });
      throw err;
    }
  });

  // Withdrawn declarations stay in the register (and the audit log); they no longer cover flag B rows.
  fastify.post('/form121/:id/withdraw', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.status(400).send({ error: 'Invalid id' });
    const n = await db.withTenantTransaction(ctx(request), async (c) => (await c.query(`UPDATE public.form121_declarations SET status = 'WITHDRAWN' WHERE id = $1 AND status = 'ACTIVE'`, [id])).rowCount);
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });
}

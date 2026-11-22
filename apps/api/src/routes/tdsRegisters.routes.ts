import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  checkCertificates,
  checkRates,
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

const CertificateBody = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  certificateNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}([A-Z0-9]{5})?$/, 'The certificate number is 10 or 15 letters and digits.'),
  pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/),
  name: z.string().trim().min(1).max(75),
  sectionCode: z.string().regex(/^\d{4}$/),
  ratePercent: z.number().min(0).max(100),
  amountLimit: z.number().positive().max(1e13),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
        `SELECT id, bsr_code, challan_no, deposit_date, interest_allocation::text AS interest, payment_mode, total_challan_amount::text AS total
         FROM public.tds_challans WHERE tan_registration_id = $1 AND tax_year = $2 AND status = 'ACTIVE'`,
        [t.id, year],
      );
      const rows = await c.query(
        `SELECT d.id, d.form_code, d.challan_id, d.deductee_pan, d.deductee_name, a.section_code, d.payment_credit_date, d.amount_paid::text AS paid,
                d.tds_deducted::text AS ded, d.total_tds_deposited::text AS dep, d.deduction_date, (d.tds_rate * 100)::text AS rate,
                d.reason_for_non_deduction, d.form121_uin, d.certificate_no
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
      const certificates = await c.query(
        `SELECT id, certificate_no, deductee_pan, deductee_name, section_code, rate_percent::text AS rate, amount_limit::text AS amount_limit, valid_from, valid_to
         FROM public.lower_deduction_certificates WHERE tan_registration_id = $1 AND valid_to >= $2 AND valid_from <= $3 ORDER BY valid_from`,
        [t.id, `${year}-04-01`, `${year + 1}-03-31`],
      );
      return { challans: challans.rows, rows: rows.rows, returns: returns.rows, form121: form121.rows, certificates: certificates.rows };
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
      certificateNo: r.certificate_no,
    }));
    const active = data.form121.filter((f) => f.status === 'ACTIVE');
    const analysis = defaultAnalysis({ rows, challans, form121: active.map((f) => ({ pan: f.declarant_pan, uin: f.identification_no })) });

    // Section rates and thresholds (Form 140 codes, Tax Year 2026-27 chart); earlier years are not judged.
    const rateFindings = year >= 2026 ? checkRates(rows.filter((r) => r.form === '140').map((r) => ({ id: r.id, pan: r.pan, name: r.name, sectionCode: r.sectionCode, paidOn: r.paidOn, amountPaid: r.amountPaid, taxDeducted: r.taxDeducted, reasonCode: r.reasonCode }))) : [];

    const certs = data.certificates.map((c) => ({ id: c.id, certificateNo: c.certificate_no, pan: c.deductee_pan, name: c.deductee_name, sectionCode: c.section_code, ratePercent: c.rate, amountLimit: c.amount_limit, validFrom: iso(c.valid_from)!, validTo: iso(c.valid_to)! }));
    const certCheck = checkCertificates(rows.map((r) => ({ id: r.id, pan: r.pan, name: r.name, sectionCode: r.sectionCode, paidOn: r.paidOn, amountPaid: r.amountPaid, taxDeducted: r.taxDeducted, reasonCode: r.reasonCode, certificateNo: (r as { certificateNo?: string | null }).certificateNo })), certs);
    for (const f of certCheck.findings) f.pan = maskPan(f.pan);

    // PANs leave the server masked; the audited reveal endpoint shows a full one when needed.
    for (const list of [analysis.noPanLowRate, analysis.declarationsMissing, rateFindings]) for (const x of list) x.pan = maskPan(x.pan);

    return reply.send({
      tan,
      year,
      analysis,
      rateFindings,
      // Form 24G: tax paid by book adjustment, with the 24G receipt number and DDO serial for each transfer voucher.
      bookAdjustments: data.challans.filter((c) => c.payment_mode === 'B').map((c) => ({ month: iso(c.deposit_date)!.slice(0, 7), date: iso(c.deposit_date), receiptNo24G: c.bsr_code, ddoSerial: c.challan_no, amount: c.total })).sort((a, b) => a.date!.localeCompare(b.date!)),
      certificates: certs.map((c) => ({ ...c, pan: maskPan(c.pan), ...certCheck.usage.find((u) => u.certificateId === c.id) })),
      certificateFindings: certCheck.findings,
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

  fastify.post('/certificates', async (request, reply) => {
    const b = CertificateBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the certificate.' });
    const d = b.data;
    if (d.validTo < d.validFrom) return reply.status(400).send({ error: 'Invalid', message: 'The certificate ends before it starts.' });
    try {
      const id = await db.withTenantTransaction(ctx(request), async (c) => {
        const t = (await c.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [d.tan])).rows[0];
        if (!t) return null;
        return (
          await c.query<{ id: string }>(
            `INSERT INTO public.lower_deduction_certificates (firm_id, entity_id, tan_registration_id, certificate_no, deductee_pan, deductee_name, section_code, rate_percent, amount_limit, valid_from, valid_to, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, app.current_user_id()) RETURNING id`,
            [t.entity_id, t.id, d.certificateNo, d.pan, d.name, d.sectionCode, d.ratePercent, d.amountLimit, d.validFrom, d.validTo],
          )
        ).rows[0].id;
      });
      if (!id) return reply.status(404).send({ error: 'Not found', message: `TAN ${d.tan} is not in Client Master.` });
      return reply.status(201).send({ id });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Duplicate', message: 'That certificate is already in the register for this TAN.' });
      throw err;
    }
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

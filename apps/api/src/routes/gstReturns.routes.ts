import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { gstMis, gstr1Summary, gstr3bYear, parseSalesRegister, type MisDoc, type SalesInvoice } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { insertRows } from '../db/batchInsert.js';

const GSTIN = z.string().regex(/^\d{2}[A-Z0-9]{13}$/);
const PERIOD = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const SalesBody = z.object({ gstin: GSTIN, period: PERIOD, text: z.string().min(10).max(5 * 1024 * 1024) });
const SummaryQuery = z.object({ gstin: GSTIN, from: PERIOD, to: PERIOD.optional() });
const YearQuery = z.object({ gstin: GSTIN, fy: z.coerce.number().int().min(2017).max(2100) });

const SUPPLY_TYPE: Record<SalesInvoice['section'], string> = { B2B: 'B2B', B2CL: 'B2CL', B2CS: 'B2CS', EXPWP: 'EXPWP', EXPWOP: 'EXPWOP', CDNR: 'B2B', CDNUR: 'B2CL' };

/** Sales register import for a GSTIN and month, and the GSTR-1 summary built from what is stored. */
export async function gstReturnsRoutes(fastify: FastifyInstance) {
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

  // GSTINs the user can see, with their filing category, for the pickers.
  fastify.get('/registrations', async (request, reply) => {
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT g.gstin, g.filing_category, e.legal_name FROM public.gst_registrations g JOIN public.entities e ON e.id = g.entity_id
           WHERE g.registration_type <> 'ISD' ORDER BY e.legal_name, g.gstin`,
        )
      ).rows,
    );
    return reply.send({ registrations: rows.map((r) => ({ gstin: r.gstin, category: r.filing_category, name: r.legal_name })) });
  });

  fastify.post('/sales/preview', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const b = SalesBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the GSTIN, the month (YYYY-MM) and the pasted register.' });
    const parsed = parseSalesRegister(b.data.text, { supplierGstin: b.data.gstin, period: b.data.period });
    const ok = parsed.rows.filter((r) => r.invoice).map((r) => r.invoice!);
    return reply.send({ ...parsed, summary: gstr1Summary(ok) });
  });

  fastify.post('/sales/import', { bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const b = SalesBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Send the GSTIN, the month (YYYY-MM) and the pasted register.' });
    const parsed = parseSalesRegister(b.data.text, { supplierGstin: b.data.gstin, period: b.data.period });
    if (parsed.missing.length) return reply.status(422).send({ error: 'Not imported', message: `Columns not found: ${parsed.missing.join(', ')}.` });
    const bad = parsed.rows.filter((r) => !r.invoice);
    if (bad.length) return reply.status(422).send({ error: 'Not imported', message: `${bad.length} row(s) have errors. Fix them and paste again; nothing was saved.` });
    const invoices = parsed.rows.map((r) => r.invoice!);
    if (!invoices.length) return reply.status(422).send({ error: 'Not imported', message: 'No invoices found.' });
    const batch = randomUUID();
    try {
      const n = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = (await c.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.gst_registrations WHERE gstin = $1', [b.data.gstin])).rows[0];
        if (!reg) return null;
        await insertRows(
          c,
          `INSERT INTO public.gst_invoices_sales (firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, supply_type, customer_gstin,
             customer_legal_name, pos_state_code, reverse_charge, table_section, taxable_value, igst_rate, igst_amount, cgst_rate, cgst_amount,
             sgst_rate, sgst_amount, cess_amount, total_invoice_value, return_period, created_by, import_batch)`,
          `(app.current_firm_id(), ${Array(23).fill('?').join(', ')})`,
          invoices.map((i) => {
            const rate = i.rate / 100;
            const inter = i.igst !== '0.00' || i.pos !== b.data.gstin.slice(0, 2);
            return [
              reg.entity_id, reg.id, i.invoiceNo, i.invoiceDate, i.docType, SUPPLY_TYPE[i.section], i.customerGstin, i.customerName || null, i.pos, i.reverseCharge, i.table,
              i.taxableValue, inter ? rate : 0, i.igst, inter ? 0 : rate / 2, i.cgst, inter ? 0 : rate / 2, i.sgst, i.cess, i.invoiceValue, b.data.period, request.user.userId, batch,
            ];
          }),
        );
        return invoices.length;
      });
      if (n === null) return reply.status(404).send({ error: 'Not found', message: `GSTIN ${b.data.gstin} is not in Client Master.` });
      return reply.status(201).send({ imported: n, batch });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Not imported', message: 'Some of these invoice numbers are already recorded for this GSTIN and month. Nothing was saved.' });
      if (/locked|LOCK/i.test(err.message ?? '')) return reply.status(409).send({ error: 'Not imported', message: 'This month is locked because its return has been filed.' });
      throw err;
    }
  });

  // MIS and party master for a GSTIN and financial year, from the sales and purchase registers.
  fastify.get('/mis', async (request, reply) => {
    const q = YearQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?gstin= and ?fy=' });
    const from = `${q.data.fy}-04`;
    const to = `${q.data.fy + 1}-03`;
    const docs = await db.withTenantTransaction(ctx(request), async (c) => {
      const reg = (await c.query<{ id: string }>('SELECT id FROM public.gst_registrations WHERE gstin = $1', [q.data.gstin])).rows[0];
      if (!reg) return null;
      const sales = (
        await c.query(
          `SELECT return_period, customer_gstin, customer_legal_name, doc_type, taxable_value::text AS taxable, (igst_amount + cgst_amount + sgst_amount + cess_amount)::text AS tax
           FROM public.gst_invoices_sales WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false`,
          [reg.id, from, to],
        )
      ).rows;
      const purchases = (
        await c.query(
          `SELECT return_period, vendor_gstin, vendor_trade_name, doc_type, taxable_value::text AS taxable, (igst_amount + cgst_amount + sgst_amount + cess_amount)::text AS tax,
                  (CASE WHEN itc_eligibility = 'ELIGIBLE' THEN itc_reversal_amount ELSE igst_amount + cgst_amount + sgst_amount + cess_amount END)::text AS ineligible
           FROM public.gst_invoices_purchase WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3`,
          [reg.id, from, to],
        )
      ).rows;
      return [
        ...sales.map((r) => ({ side: 'SALE', period: r.return_period, partyGstin: r.customer_gstin, partyName: r.customer_legal_name ?? '', docType: r.doc_type, taxable: r.taxable, tax: r.tax })),
        ...purchases.map((r) => ({ side: 'PURCHASE', period: r.return_period, partyGstin: r.vendor_gstin, partyName: r.vendor_trade_name ?? '', docType: r.doc_type, taxable: r.taxable, tax: r.tax, ineligibleTax: r.ineligible })),
      ] as MisDoc[];
    });
    if (!docs) return reply.status(404).send({ error: 'Not found', message: `GSTIN ${q.data.gstin} is not in Client Master.` });
    return reply.send(gstMis(q.data.fy, docs));
  });

  // GSTR-3B for a year against the sales register and GSTR-2B, month by month.
  fastify.get('/gstr3b/year', async (request, reply) => {
    const q = YearQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?gstin= and ?fy= (e.g. 2026 for 2026-27).' });
    const from = `${q.data.fy}-04`;
    const to = `${q.data.fy + 1}-03`;
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const reg = (await c.query<{ id: string; filing_category: string }>('SELECT id, filing_category FROM public.gst_registrations WHERE gstin = $1', [q.data.gstin])).rows[0];
      if (!reg) return null;
      const sales = (
        await c.query<{ period: string; tax: string }>(
          `SELECT return_period AS period, sum((igst_amount + cgst_amount + sgst_amount + cess_amount) * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END)::text AS tax
           FROM public.gst_invoices_sales WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false GROUP BY return_period`,
          [reg.id, from, to],
        )
      ).rows;
      const twoB = (
        await c.query<{ period: string; itc: string }>(
          `SELECT return_period AS period, sum((igst_amount + cgst_amount + sgst_amount + cess_amount) * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END)::text AS itc
           FROM public.gst_2b_records WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND itc_available GROUP BY return_period`,
          [reg.id, from, to],
        )
      ).rows;
      const filings = (
        await c.query<{ period: string; liability: string; itc: string; cash: string; status: string; filed_at: Date | null }>(
          `SELECT return_period AS period, gross_tax_liability::text AS liability, total_itc_claimed::text AS itc, net_cash_paid::text AS cash, workflow_status::text AS status, filed_at
           FROM public.gst_filings WHERE gst_registration_id = $1 AND return_type = 'GSTR3B' AND return_period BETWEEN $2 AND $3`,
          [reg.id, from, to],
        )
      ).rows;
      return { category: reg.filing_category, sales, twoB, filings };
    });
    if (!data) return reply.status(404).send({ error: 'Not found', message: `GSTIN ${q.data.gstin} is not in Client Master.` });
    const periods = new Set([...data.sales.map((r) => r.period), ...data.twoB.map((r) => r.period), ...data.filings.map((r) => r.period)]);
    const months = [...periods].map((p) => {
      const f = data.filings.find((r) => r.period === p);
      return {
        period: p,
        gstr1Tax: data.sales.find((r) => r.period === p)?.tax ?? null,
        itc2b: data.twoB.find((r) => r.period === p)?.itc ?? null,
        gstr3bTax: f?.liability ?? null,
        itc3b: f?.itc ?? null,
        cashPaid: f?.cash ?? null,
        status: f?.status ?? null,
        filedOn: f?.filed_at ? new Date(f.filed_at.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null,
      };
    });
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    return reply.send(gstr3bYear({ fyStart: q.data.fy, gstin: q.data.gstin, cadence: data.category === 'QRMP' ? 'QRMP' : 'MONTHLY', months, today }));
  });

  // GSTR-1 summary (and sales turnover for CMP-08) for a month or a run of months.
  fastify.get('/gstr1/summary', async (request, reply) => {
    const q = SummaryQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?gstin= and ?from=YYYY-MM (and optionally ?to=).' });
    const to = q.data.to ?? q.data.from;
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT s.doc_type, s.supply_type, s.table_section, s.customer_gstin, s.pos_state_code, (s.igst_rate + s.cgst_rate + s.sgst_rate) * 100 AS rate,
                  s.taxable_value::text AS taxable, s.igst_amount::text AS igst, s.cgst_amount::text AS cgst, s.sgst_amount::text AS sgst, s.cess_amount::text AS cess
           FROM public.gst_invoices_sales s JOIN public.gst_registrations g ON g.id = s.gst_registration_id
           WHERE g.gstin = $1 AND s.return_period BETWEEN $2 AND $3 AND s.is_amendment = false`,
          [q.data.gstin, q.data.from, to],
        )
      ).rows,
    );
    const section = (r: { doc_type: string; supply_type: string; customer_gstin: string | null }): SalesInvoice['section'] =>
      r.doc_type !== 'INV' ? (r.customer_gstin ? 'CDNR' : 'CDNUR') : (r.supply_type as SalesInvoice['section']);
    const invoices = rows.map((r) => ({
      section: ['B2B', 'B2CL', 'B2CS', 'EXPWP', 'EXPWOP'].includes(r.supply_type) || r.doc_type !== 'INV' ? section(r) : 'B2B',
      pos: r.pos_state_code,
      rate: Math.round(Number(r.rate) * 100) / 100,
      docType: r.doc_type,
      taxableValue: r.taxable,
      igst: r.igst,
      cgst: r.cgst,
      sgst: r.sgst,
      cess: r.cess,
    })) as Parameters<typeof gstr1Summary>[0];
    return reply.send({ gstin: q.data.gstin, from: q.data.from, to, invoices: invoices.length, ...gstr1Summary(invoices) });
  });
}

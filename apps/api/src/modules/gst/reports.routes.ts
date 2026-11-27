import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  computeGstr9AnnualReconciliation,
  computeInvertedDutyRefundWorkpaper,
  gstr3bYear,
  type PurchaseInputType,
} from '@synextax/tax-engine';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration } from './gstHelper.js';
import { escapeCsvCell } from '../../security/inputSanitization.js';

const FyQuery = z.object({
  fy: z.coerce.number().int().min(2017).max(2100).default(2026),
  format: z.enum(['json', 'csv']).default('json'),
});

const RateWiseQuery = z.object({
  from: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  to: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const FiledCasesQuery = z.object({
  fy: z.coerce.number().int().min(2017).max(2100).optional(),
  suite: z.enum(['ALL', 'GST', 'TDS']).default('ALL'),
  format: z.enum(['json', 'csv']).default('json'),
});

const Pmt06CreateSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  cpin: z.string().min(6).max(20),
  challanDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankName: z.string().max(64).optional(),
  paymentMode: z.string().max(24).default('NET_BANKING'),
  reason: z.enum(['QRMP_35_PCT', 'QRMP_SELF_ASSESSMENT', 'MONTHLY_PAYMENT', 'VOLUNTARY_DRC03']).default('MONTHLY_PAYMENT'),
  igstCash: z.string().default('0.00'),
  cgstCash: z.string().default('0.00'),
  sgstCash: z.string().default('0.00'),
  cessCash: z.string().default('0.00'),
  interestCash: z.string().default('0.00'),
  lateFeeCash: z.string().default('0.00'),
});

function rateBucketLabel(ratePct: number, taxable: string, tax: string): string {
  if (Number(taxable) > 0 && Number(tax) === 0 && ratePct === 0) return 'EXEMPT_NIL_NONGST';
  const rounded = Math.round(ratePct * 100) / 100;
  for (const standard of [0, 5, 12, 18, 28]) {
    if (Math.abs(rounded - standard) <= 0.1) return `${standard}%`;
  }
  return `${rounded}%`;
}

export async function gstReportsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // 1. Yearly GSTR-3B Summary Report (12-month Apr-Mar matrix per GSTIN)
  fastify.get('/:gstinId/reports/gstr3b-year', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { fy?: string; format?: string } }>, reply: FastifyReply) => {
    const q = FyQuery.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass ?fy=2026 and optional ?format=json|csv.' });
    }

    const ctx = getTenantContext(req);
    const from = `${q.data.fy}-04`;
    const to = `${q.data.fy + 1}-03`;

    const result = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;

      const regDetail = (
        await client.query<{ filing_category: string; legal_name: string }>(
          `SELECT g.filing_category, e.legal_name
           FROM public.gst_registrations g
           JOIN public.entities e ON e.id = g.entity_id
           WHERE g.id = $1`,
          [reg.id],
        )
      ).rows[0];

      const sales = (
        await client.query<{ period: string; taxable: string; igst: string; cgst: string; sgst: string; cess: string }>(
          `SELECT return_period AS period,
                  COALESCE(sum(taxable_value * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS taxable,
                  COALESCE(sum(igst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS igst,
                  COALESCE(sum(cgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cgst,
                  COALESCE(sum(sgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS sgst,
                  COALESCE(sum(cess_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cess
           FROM public.gst_invoices_sales
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false
           GROUP BY return_period`,
          [reg.id, from, to],
        )
      ).rows;

      const twoB = (
        await client.query<{ period: string; igst: string; cgst: string; sgst: string; cess: string }>(
          `SELECT return_period AS period,
                  COALESCE(sum(igst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS igst,
                  COALESCE(sum(cgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cgst,
                  COALESCE(sum(sgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS sgst,
                  COALESCE(sum(cess_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cess
           FROM public.gst_2b_records
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND itc_available = true AND ims_action_status <> 'R'
           GROUP BY return_period`,
          [reg.id, from, to],
        )
      ).rows;

      const filings = (
        await client.query<{ period: string; liability: string; itc: string; cash: string; status: string; arn: string | null; filed_at: Date | null }>(
          `SELECT return_period AS period, gross_tax_liability::text AS liability, total_itc_claimed::text AS itc,
                  net_cash_paid::text AS cash, workflow_status::text AS status, arn, filed_at
           FROM public.gst_filings
           WHERE gst_registration_id = $1 AND return_type = 'GSTR3B' AND return_period BETWEEN $2 AND $3`,
          [reg.id, from, to],
        )
      ).rows;

      const periods = new Set([...sales.map((r) => r.period), ...twoB.map((r) => r.period), ...filings.map((r) => r.period)]);
      const monthInputs = [...periods].map((p) => {
        const s = sales.find((r) => r.period === p);
        const b = twoB.find((r) => r.period === p);
        const f = filings.find((r) => r.period === p);
        const gstr1Tax = s ? new Decimal(s.igst).plus(s.cgst).plus(s.sgst).plus(s.cess).toFixed(2) : null;
        const itc2b = b ? new Decimal(b.igst).plus(b.cgst).plus(b.sgst).plus(b.cess).toFixed(2) : null;
        return {
          period: p,
          gstr1Tax,
          itc2b,
          gstr3bTax: f?.liability ?? null,
          itc3b: f?.itc ?? null,
          cashPaid: f?.cash ?? null,
          status: f?.status ?? null,
          filedOn: f?.filed_at ? new Date(f.filed_at.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null,
        };
      });

      const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const summary = gstr3bYear({
        fyStart: q.data.fy,
        gstin: reg.gstin,
        cadence: regDetail?.filing_category === 'QRMP' ? 'QRMP' : 'MONTHLY',
        months: monthInputs,
        today,
      });

      const enrichedMonths = summary.months.map((m) => {
        const s = sales.find((r) => r.period === m.period);
        const b = twoB.find((r) => r.period === m.period);
        const f = filings.find((r) => r.period === m.period);
        return {
          ...m,
          outwardTaxable: s ? new Decimal(s.taxable).toFixed(2) : '0.00',
          outwardHeads: {
            igst: s ? new Decimal(s.igst).toFixed(2) : '0.00',
            cgst: s ? new Decimal(s.cgst).toFixed(2) : '0.00',
            sgst: s ? new Decimal(s.sgst).toFixed(2) : '0.00',
            cess: s ? new Decimal(s.cess).toFixed(2) : '0.00',
          },
          itc2bHeads: {
            igst: b ? new Decimal(b.igst).toFixed(2) : '0.00',
            cgst: b ? new Decimal(b.cgst).toFixed(2) : '0.00',
            sgst: b ? new Decimal(b.sgst).toFixed(2) : '0.00',
            cess: b ? new Decimal(b.cess).toFixed(2) : '0.00',
          },
          arn: f?.arn ?? null,
          filedOn: f?.filed_at ? new Date(f.filed_at.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null,
        };
      });

      return {
        gstin: reg.gstin,
        legalName: regDetail?.legal_name ?? '',
        cadence: regDetail?.filing_category ?? 'MONTHLY',
        ...summary,
        months: enrichedMonths,
      };
    });

    if (!result) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (q.data.format === 'csv') {
      const header = ['Period', 'Due Date', 'State', 'ARN', 'Outward Taxable', 'GSTR-1 Tax', 'GSTR-3B Tax', 'Output Diff', '2B ITC', '3B ITC', 'ITC Diff', 'Cash Paid', 'Days Late']
        .map(escapeCsvCell)
        .join(',');
      const lines = result.months.map((m) =>
        [m.period, m.dueDate, m.state, m.arn ?? '', m.outwardTaxable, m.gstr1Tax, m.gstr3bTax, m.outputDifference, m.itc2b, m.itc3b, m.itcDifference, m.cashPaid, String(m.daysLate)]
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="GSTR3B_Yearly_${result.gstin}_${result.year}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, ...result });
  });

  // 2. Rate-Wise GSTR-1 Summary Report (0%, 5%, 12%, 18%, 28%, Exempt/Nil/Non-GST)
  fastify.get('/:gstinId/reports/gstr1-ratewise', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { from?: string; to?: string; format?: string } }>, reply: FastifyReply) => {
    const q = RateWiseQuery.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass ?from=YYYY-MM and optional ?to=YYYY-MM&format=json|csv.' });
    }

    const to = q.data.to ?? q.data.from;
    const ctx = getTenantContext(req);

    const result = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;

      const rows = (
        await client.query<{
          doc_type: string;
          supply_type: string;
          table_section: string;
          rate_pct: string;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          cess_amount: string;
        }>(
          `SELECT doc_type, supply_type, table_section,
                  ((igst_rate + cgst_rate + sgst_rate) * 100)::text AS rate_pct,
                  taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text
           FROM public.gst_invoices_sales
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false`,
          [reg.id, q.data.from, to],
        )
      ).rows;

      const orderedSlabs = ['0%', '5%', '12%', '18%', '28%', 'EXEMPT_NIL_NONGST'];
      const map = new Map<
        string,
        {
          rateSlab: string;
          docCount: number;
          taxableValue: Decimal;
          igst: Decimal;
          cgst: Decimal;
          sgst: Decimal;
          cess: Decimal;
          sections: Record<string, number>;
        }
      >();

      for (const slab of orderedSlabs) {
        map.set(slab, {
          rateSlab: slab,
          docCount: 0,
          taxableValue: new Decimal(0),
          igst: new Decimal(0),
          cgst: new Decimal(0),
          sgst: new Decimal(0),
          cess: new Decimal(0),
          sections: { B2B: 0, B2CL: 0, B2CS: 0, CDNR: 0, EXP: 0 },
        });
      }

      for (const r of rows) {
        const sign = r.doc_type === 'CRN' ? -1 : 1;
        const totalTax = new Decimal(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount);
        const slab = rateBucketLabel(Number(r.rate_pct), r.taxable_value, totalTax.toFixed(2));
        if (!map.has(slab)) {
          map.set(slab, {
            rateSlab: slab,
            docCount: 0,
            taxableValue: new Decimal(0),
            igst: new Decimal(0),
            cgst: new Decimal(0),
            sgst: new Decimal(0),
            cess: new Decimal(0),
            sections: { B2B: 0, B2CL: 0, B2CS: 0, CDNR: 0, EXP: 0 },
          });
        }
        const entry = map.get(slab)!;
        entry.docCount += 1;
        entry.taxableValue = entry.taxableValue.plus(new Decimal(r.taxable_value).times(sign));
        entry.igst = entry.igst.plus(new Decimal(r.igst_amount).times(sign));
        entry.cgst = entry.cgst.plus(new Decimal(r.cgst_amount).times(sign));
        entry.sgst = entry.sgst.plus(new Decimal(r.sgst_amount).times(sign));
        entry.cess = entry.cess.plus(new Decimal(r.cess_amount).times(sign));

        const sec = r.doc_type !== 'INV'
          ? 'CDNR'
          : r.supply_type.startsWith('EXP')
            ? 'EXP'
            : r.table_section === '7' || r.supply_type === 'B2CS'
              ? 'B2CS'
              : r.table_section === '5' || r.supply_type === 'B2CL'
                ? 'B2CL'
                : 'B2B';
        entry.sections[sec] = (entry.sections[sec] ?? 0) + 1;
      }

      const slabs = [...map.values()].map((s) => ({
        rateSlab: s.rateSlab,
        docCount: s.docCount,
        taxableValue: s.taxableValue.toFixed(2),
        igst: s.igst.toFixed(2),
        cgst: s.cgst.toFixed(2),
        sgst: s.sgst.toFixed(2),
        cess: s.cess.toFixed(2),
        totalTax: s.igst.plus(s.cgst).plus(s.sgst).plus(s.cess).toFixed(2),
        sections: s.sections,
      }));

      const totals = {
        docCount: slabs.reduce((a, b) => a + b.docCount, 0),
        taxableValue: slabs.reduce((a, b) => a.plus(b.taxableValue), new Decimal(0)).toFixed(2),
        igst: slabs.reduce((a, b) => a.plus(b.igst), new Decimal(0)).toFixed(2),
        cgst: slabs.reduce((a, b) => a.plus(b.cgst), new Decimal(0)).toFixed(2),
        sgst: slabs.reduce((a, b) => a.plus(b.sgst), new Decimal(0)).toFixed(2),
        cess: slabs.reduce((a, b) => a.plus(b.cess), new Decimal(0)).toFixed(2),
        totalTax: slabs.reduce((a, b) => a.plus(b.totalTax), new Decimal(0)).toFixed(2),
      };

      return { gstin: reg.gstin, from: q.data.from, to, slabs, totals };
    });

    if (!result) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (q.data.format === 'csv') {
      const header = ['Rate Slab', 'Documents', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total Tax', 'B2B', 'B2CL', 'B2CS', 'CDNR', 'EXP']
        .map(escapeCsvCell)
        .join(',');
      const lines = result.slabs.map((s) =>
        [
          s.rateSlab,
          String(s.docCount),
          s.taxableValue,
          s.igst,
          s.cgst,
          s.sgst,
          s.cess,
          s.totalTax,
          String(s.sections.B2B ?? 0),
          String(s.sections.B2CL ?? 0),
          String(s.sections.B2CS ?? 0),
          String(s.sections.CDNR ?? 0),
          String(s.sections.EXP ?? 0),
        ]
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="GSTR1_RateWise_${result.gstin}_${result.from}_to_${result.to}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, ...result });
  });

  // 3. Firm-Wide Filed Cases Register (GST GSTR-1, 1A, IFF, 3B + TDS 138/140/143/144/24Q/26Q/27Q/27EQ)
  fastify.get('/reports/filed-cases', async (req: FastifyRequest<{ Querystring: { fy?: string; suite?: string; format?: string } }>, reply: FastifyReply) => {
    const q = FiledCasesQuery.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass optional ?fy=2026&suite=ALL|GST|TDS&format=json|csv.' });
    }

    const ctx = getTenantContext(req);
    const cases = await db.withTenantTransaction(ctx, async (client) => {
      const rows: Array<{
        id: string;
        suite: 'GST' | 'TDS';
        formType: string;
        clientName: string;
        registrationNo: string;
        period: string;
        filingDate: string | null;
        referenceNo: string | null;
        signerName: string | null;
        workflowStatus: string;
        ackSummary: string | null;
      }> = [];

      if (q.data.suite === 'ALL' || q.data.suite === 'GST') {
        const fyFrom = q.data.fy ? `${q.data.fy}-04` : null;
        const fyTo = q.data.fy ? `${q.data.fy + 1}-03` : null;
        const gstRes = await client.query<{
          id: string;
          return_type: string;
          legal_name: string;
          gstin: string;
          return_period: string;
          filed_at: Date | null;
          arn: string | null;
          signer_name: string | null;
          workflow_status: string;
          gross_tax_liability: string;
          total_itc_claimed: string;
          net_cash_paid: string;
        }>(
          `SELECT f.id, f.return_type, e.legal_name, g.gstin, f.return_period, f.filed_at, f.arn,
                  u.full_name AS signer_name, f.workflow_status::text AS workflow_status,
                  f.gross_tax_liability::text, f.total_itc_claimed::text, f.net_cash_paid::text
           FROM public.gst_filings f
           JOIN public.entities e ON e.id = f.entity_id
           JOIN public.gst_registrations g ON g.id = f.gst_registration_id
           LEFT JOIN public.users u ON u.id = f.signed_by_user_id
           WHERE ($1::varchar IS NULL OR f.return_period BETWEEN $1 AND $2)
           ORDER BY COALESCE(f.filed_at, f.updated_at) DESC, f.return_period DESC`,
          [fyFrom, fyTo],
        );

        for (const r of gstRes.rows) {
          rows.push({
            id: r.id,
            suite: 'GST',
            formType: r.return_type,
            clientName: r.legal_name,
            registrationNo: r.gstin,
            period: r.return_period,
            filingDate: r.filed_at ? new Date(r.filed_at.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null,
            referenceNo: r.arn,
            signerName: r.signer_name,
            workflowStatus: r.workflow_status,
            ackSummary: `Liability ₹${r.gross_tax_liability}, ITC ₹${r.total_itc_claimed}, Cash ₹${r.net_cash_paid}`,
          });
        }
      }

      if (q.data.suite === 'ALL' || q.data.suite === 'TDS') {
        const tdsRes = await client.query<{
          id: string;
          form_code: string;
          return_type: string;
          correction_no: number;
          legal_name: string;
          tan: string;
          tax_year: number;
          quarter: string;
          filed_at: Date | null;
          token_no: string | null;
          signer_name: string | null;
          workflow_status: string;
          total_tax_deposited: string;
        }>(
          `SELECT t.id, t.form_code, t.return_type, t.correction_no, e.legal_name, tr.tan,
                  t.tax_year, t.quarter, t.filed_at, t.latest_accepted_token_15digit AS token_no,
                  u.full_name AS signer_name, t.workflow_status::text AS workflow_status,
                  t.total_tax_deposited::text
           FROM public.tds_returns t
           JOIN public.entities e ON e.id = t.entity_id
           JOIN public.tan_registrations tr ON tr.id = t.tan_registration_id
           LEFT JOIN public.users u ON u.id = t.signed_by_user_id
           WHERE ($1::smallint IS NULL OR t.tax_year = $1)
           ORDER BY COALESCE(t.filed_at, t.updated_at) DESC, t.tax_year DESC, t.quarter DESC`,
          [q.data.fy ?? null],
        );

        for (const r of tdsRes.rows) {
          const suffix = r.return_type === 'CORRECTION' ? ` (C${r.correction_no})` : '';
          rows.push({
            id: r.id,
            suite: 'TDS',
            formType: `${r.form_code}${suffix}`,
            clientName: r.legal_name,
            registrationNo: r.tan,
            period: `${r.quarter} ${r.tax_year}-${String((r.tax_year + 1) % 100).padStart(2, '0')}`,
            filingDate: r.filed_at ? new Date(r.filed_at.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) : null,
            referenceNo: r.token_no,
            signerName: r.signer_name,
            workflowStatus: r.workflow_status,
            ackSummary: `Tax Deposited ₹${r.total_tax_deposited}`,
          });
        }
      }

      return rows;
    });

    if (q.data.format === 'csv') {
      const header = ['Suite', 'Form', 'Client Name', 'GSTIN/TAN', 'Period', 'Status', 'Filing Date', 'ARN / 15-Digit Token', 'Signer', 'Summary']
        .map(escapeCsvCell)
        .join(',');
      const lines = cases.map((c) =>
        [c.suite, c.formType, c.clientName, c.registrationNo, c.period, c.workflowStatus, c.filingDate ?? '', c.referenceNo ?? '', c.signerName ?? '', c.ackSummary ?? '']
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="Filed_Cases_Register_${q.data.suite}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, total: cases.length, cases });
  });

  // 4. Challan, Cash & Credit Ledger History (PMT-06 + Cash/Credit/Reclaim/RCM Ledgers)
  fastify.get('/:gstinId/reports/ledgers', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { fy?: string; format?: string } }>, reply: FastifyReply) => {
    const q = FyQuery.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass ?fy=2026 and optional ?format=json|csv.' });
    }

    const from = `${q.data.fy}-04`;
    const to = `${q.data.fy + 1}-03`;
    const ctx = getTenantContext(req);

    const data = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;

      const challans = (
        await client.query<{
          id: string;
          return_period: string;
          cpin: string;
          challan_date: string;
          bank_name: string | null;
          payment_mode: string;
          reason: string;
          igst_cash: string;
          cgst_cash: string;
          sgst_cash: string;
          cess_cash: string;
          interest_cash: string;
          late_fee_cash: string;
          status: string;
        }>(
          `SELECT id, return_period, cpin, challan_date::text, bank_name, payment_mode, reason,
                  igst_cash::text, cgst_cash::text, sgst_cash::text, cess_cash::text,
                  interest_cash::text, late_fee_cash::text, status
           FROM public.gst_pmt06_challans
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3
           ORDER BY challan_date DESC, return_period DESC`,
          [reg.id, from, to],
        )
      ).rows;

      const reclaimLedger = (
        await client.query(
          `SELECT return_period, opening_balance_igst::text, opening_balance_cgst::text, opening_balance_sgst::text, opening_balance_cess::text,
                  reversed_table_4b2_igst::text, reversed_table_4b2_cgst::text, reversed_table_4b2_sgst::text, reversed_table_4b2_cess::text,
                  reclaimed_table_4d1_igst::text, reclaimed_table_4d1_cgst::text, reclaimed_table_4d1_sgst::text, reclaimed_table_4d1_cess::text,
                  closing_balance_igst::text, closing_balance_cgst::text, closing_balance_sgst::text, closing_balance_cess::text
           FROM public.electronic_credit_reclaim_ledger
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3
           ORDER BY return_period ASC`,
          [reg.id, from, to],
        )
      ).rows;

      const rcmLedger = (
        await client.query(
          `SELECT return_period, opening_rcm_paid_igst::text, opening_rcm_paid_cgst::text, opening_rcm_paid_sgst::text,
                  rcm_liability_table_31d_igst::text, rcm_liability_table_31d_cgst::text, rcm_liability_table_31d_sgst::text,
                  rcm_itc_claimed_table_4a2_igst::text, rcm_itc_claimed_table_4a2_cgst::text, rcm_itc_claimed_table_4a2_sgst::text,
                  closing_rcm_eligible_igst::text, closing_rcm_eligible_cgst::text, closing_rcm_eligible_sgst::text
           FROM public.rcm_liability_itc_ledger
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3
           ORDER BY return_period ASC`,
          [reg.id, from, to],
        )
      ).rows;

      const twoBCredit = (
        await client.query<{ igst: string; cgst: string; sgst: string; cess: string }>(
          `SELECT COALESCE(sum(igst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS igst,
                  COALESCE(sum(cgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cgst,
                  COALESCE(sum(sgst_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS sgst,
                  COALESCE(sum(cess_amount * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS cess
           FROM public.gst_2b_records
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND itc_available = true AND ims_action_status <> 'R'`,
          [reg.id, from, to],
        )
      ).rows[0];

      const filingCashAndItc = (
        await client.query<{ cash_used: string; itc_claimed: string }>(
          `SELECT COALESCE(sum(net_cash_paid), 0)::text AS cash_used,
                  COALESCE(sum(total_itc_claimed), 0)::text AS itc_claimed
           FROM public.gst_filings
           WHERE gst_registration_id = $1 AND return_type = 'GSTR3B' AND return_period BETWEEN $2 AND $3`,
          [reg.id, from, to],
        )
      ).rows[0];

      const paidChallans = challans.filter((c) => c.status === 'PAID');
      const totalChallanDeposited = paidChallans.reduce(
        (acc, c) =>
          acc
            .plus(c.igst_cash)
            .plus(c.cgst_cash)
            .plus(c.sgst_cash)
            .plus(c.cess_cash)
            .plus(c.interest_cash)
            .plus(c.late_fee_cash),
        new Decimal(0),
      );
      const totalCreditAccrued = new Decimal(twoBCredit?.igst ?? 0)
        .plus(twoBCredit?.cgst ?? 0)
        .plus(twoBCredit?.sgst ?? 0)
        .plus(twoBCredit?.cess ?? 0);

      const latestReclaim = reclaimLedger[reclaimLedger.length - 1] ?? null;
      const latestRcm = rcmLedger[rcmLedger.length - 1] ?? null;

      return {
        gstin: reg.gstin,
        fy: `${q.data.fy}-${String((q.data.fy + 1) % 100).padStart(2, '0')}`,
        pmt06Challans: challans,
        cashLedger: {
          depositedTotal: totalChallanDeposited.toFixed(2),
          utilizedIn3b: new Decimal(filingCashAndItc?.cash_used ?? 0).toFixed(2),
          closingBalance: Decimal.max(0, totalChallanDeposited.minus(filingCashAndItc?.cash_used ?? 0)).toFixed(2),
        },
        creditLedger: {
          accruedFrom2b: totalCreditAccrued.toFixed(2),
          claimedIn3b: new Decimal(filingCashAndItc?.itc_claimed ?? 0).toFixed(2),
          heads: twoBCredit,
          closingBalance: Decimal.max(0, totalCreditAccrued.minus(filingCashAndItc?.itc_claimed ?? 0)).toFixed(2),
        },
        reclaimLedger,
        latestReclaimBalance: latestReclaim,
        rcmLedger,
        latestRcmBalance: latestRcm,
      };
    });

    if (!data) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (q.data.format === 'csv') {
      const header = ['Period', 'CPIN', 'Challan Date', 'Reason', 'Bank', 'IGST Cash', 'CGST Cash', 'SGST Cash', 'Cess Cash', 'Interest', 'Late Fee', 'Status']
        .map(escapeCsvCell)
        .join(',');
      const lines = data.pmt06Challans.map((c) =>
        [c.return_period, c.cpin, c.challan_date, c.reason, c.bank_name ?? '', c.igst_cash, c.cgst_cash, c.sgst_cash, c.cess_cash, c.interest_cash, c.late_fee_cash, c.status]
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="PMT06_Ledgers_${data.gstin}_${data.fy}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, ...data });
  });

  // Save a PMT-06 challan deposit into PostgreSQL ledger history
  fastify.post('/:gstinId/reports/pmt06', async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const parsed = Pmt06CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid PMT-06 challan details.', details: parsed.error.issues });
    }
    const ctx = getTenantContext(req);
    const created = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;
      const b = parsed.data;
      const res = await client.query(
        `INSERT INTO public.gst_pmt06_challans (
           firm_id, entity_id, gst_registration_id, return_period, cpin, challan_date, bank_name,
           payment_mode, reason, igst_cash, cgst_cash, sgst_cash, cess_cash, interest_cash, late_fee_cash,
           status, created_by
         ) VALUES (
           app.current_firm_id(), $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13, $14,
           'PAID', app.current_user_id()
         )
         ON CONFLICT (firm_id, gst_registration_id, cpin)
         DO UPDATE SET challan_date = EXCLUDED.challan_date, status = 'PAID', updated_at = now()
         RETURNING id, return_period, cpin, challan_date::text, status`,
        [
          reg.entity_id, reg.id, b.period, b.cpin.trim(), b.challanDate, b.bankName ?? null,
          b.paymentMode, b.reason, b.igstCash, b.cgstCash, b.sgstCash, b.cessCash, b.interestCash, b.lateFeeCash,
        ],
      );
      return res.rows[0];
    });
    if (!created) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });
    return reply.status(201).send({ success: true, challan: created });
  });

  // 5. Inverted-Duty / Export Refund Working & 90% Provisional Refund Risk Check
  fastify.get('/:gstinId/reports/refund-risk', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { from?: string; to?: string; format?: string } }>, reply: FastifyReply) => {
    const q = RateWiseQuery.safeParse(req.query);
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass ?from=YYYY-MM and optional ?to=YYYY-MM&format=json|csv.' });
    }

    const to = q.data.to ?? q.data.from;
    const ctx = getTenantContext(req);
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

    const data = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;

      const regMeta = (
        await client.query<{ lut_arn: string | null; lut_valid_to: string | null }>(
          `SELECT lut_arn, lut_valid_to::text FROM public.gst_registrations WHERE id = $1`,
          [reg.id],
        )
      ).rows[0];

      const purchases = (
        await client.query<{
          id: string;
          vendor_gstin: string;
          invoice_num: string;
          invoice_date: string;
          hsn_sac_code: string | null;
          input_type: PurchaseInputType;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          recon_status: string;
          itc_eligibility: string;
        }>(
          `SELECT id, vendor_gstin, invoice_num, invoice_date::text, hsn_sac_code, input_type,
                  taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text,
                  recon_status, itc_eligibility
           FROM public.gst_invoices_purchase
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3
           ORDER BY invoice_date ASC`,
          [reg.id, q.data.from, to],
        )
      ).rows;

      const salesAgg = (
        await client.query<{ tax: string }>(
          `SELECT COALESCE(sum((igst_amount + cgst_amount + sgst_amount + cess_amount) * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS tax
           FROM public.gst_invoices_sales
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false`,
          [reg.id, q.data.from, to],
        )
      ).rows[0];

      const twoBAgg = (
        await client.query<{ itc: string }>(
          `SELECT COALESCE(sum((igst_amount + cgst_amount + sgst_amount + cess_amount) * CASE WHEN doc_type = 'CRN' THEN -1 ELSE 1 END), 0)::text AS itc
           FROM public.gst_2b_records
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND itc_available = true AND ims_action_status <> 'R'`,
          [reg.id, q.data.from, to],
        )
      ).rows[0];

      const filingAgg = (
        await client.query<{ out_tax: string; itc_claimed: string }>(
          `SELECT COALESCE(sum(gross_tax_liability), 0)::text AS out_tax,
                  COALESCE(sum(total_itc_claimed), 0)::text AS itc_claimed
           FROM public.gst_filings
           WHERE gst_registration_id = $1 AND return_type = 'GSTR3B' AND return_period BETWEEN $2 AND $3`,
          [reg.id, q.data.from, to],
        )
      ).rows[0];

      return computeInvertedDutyRefundWorkpaper({
        gstin: reg.gstin,
        periodFrom: q.data.from,
        periodTo: to,
        today,
        lutArn: regMeta?.lut_arn ?? null,
        lutValidTo: regMeta?.lut_valid_to ?? null,
        gstr1OutwardTax: salesAgg?.tax ?? '0.00',
        gstr3bOutwardTax: filingAgg?.out_tax ?? '0.00',
        gstr2bAvailableItc: twoBAgg?.itc ?? '0.00',
        gstr3bClaimedItc: filingAgg?.itc_claimed ?? '0.00',
        purchases: purchases.map((p) => ({
          id: p.id,
          vendorGstin: p.vendor_gstin,
          invoiceNum: p.invoice_num,
          invoiceDate: p.invoice_date,
          hsnSacCode: p.hsn_sac_code,
          inputType: p.input_type,
          taxableValue: p.taxable_value,
          igstAmount: p.igst_amount,
          cgstAmount: p.cgst_amount,
          sgstAmount: p.sgst_amount,
          reconStatus: p.recon_status,
          itcEligibility: p.itc_eligibility,
        })),
      });
    });

    if (!data) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (q.data.format === 'csv') {
      const header = ['Bucket / Status', 'Vendor GSTIN', 'Invoice No', 'Invoice Date', 'Input Type', 'Tax Amount', 'Reason']
        .map(escapeCsvCell)
        .join(',');
      const summaryRows = [
        ['ELIGIBLE_INPUT_GOODS', '', '', '', 'INPUT_GOODS', data.breakdown.inputGoodsEligibleItc, 'Eligible under Rule 89(5)'],
        ['ELIGIBLE_SERVICES_POST_NOV_1', '', '', '', 'INPUT_SERVICES', data.breakdown.postNov1ServicesEligibleItc, 'Eligible (>= 2026-11-01)'],
        ['EXCLUDED_SERVICES_PRE_NOV_1', '', '', '', 'INPUT_SERVICES', data.breakdown.preNov1ServicesExcludedItc, 'Excluded (< 2026-11-01)'],
        ['EXCLUDED_CAPITAL_GOODS', '', '', '', 'CAPITAL_GOODS', data.breakdown.capitalGoodsExcludedItc, 'Excluded Capital Goods'],
        ['PROVISIONAL_90_PCT_REFUND', '', '', '', 'SUMMARY', data.breakdown.provisional90PercentRefund, data.provisionalSanctionEligible ? 'System Risk Cleared' : 'Hold: Resolve Flags'],
      ];
      const blockedLines = data.blockedRows.map((b) =>
        ['BLOCKED_ROW', b.vendorGstin, b.invoiceNum, b.invoiceDate, b.inputType, b.taxAmount, b.reason],
      );
      const csv = [header, ...[...summaryRows, ...blockedLines].map((r) => r.map(escapeCsvCell).join(','))].join('\n');
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="Refund_Risk_Workpaper_${data.gstin}_${data.periodFrom}.csv"`);
      return reply.send(csv);
    }

    return reply.send({ success: true, ...data });
  });

  // 6. FY Annual Consolidated GSTR-9 / 9C Summary Prep Sheet (default FY 2025-26)
  fastify.get('/:gstinId/reports/gstr9-workpaper', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { fy?: string; format?: string } }>, reply: FastifyReply) => {
    const q = FyQuery.safeParse({ fy: req.query.fy ?? '2025', format: req.query.format });
    if (!q.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass ?fy=2025 (for FY 2025-26) and optional ?format=json|csv.' });
    }

    const from = `${q.data.fy}-04`;
    const to = `${q.data.fy + 1}-03`;
    const fyLabel = `${q.data.fy}-${String((q.data.fy + 1) % 100).padStart(2, '0')}`;
    const ctx = getTenantContext(req);

    const workpaper = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return null;

      const entityRow = (
        await client.query<{ legal_name: string; trade_name: string | null }>(
          `SELECT legal_name, trade_name FROM public.entities WHERE id = $1`,
          [reg.entity_id],
        )
      ).rows[0];

      const sales = (
        await client.query<{
          return_period: string;
          supply_type: string;
          doc_type: string;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          cess_amount: string;
        }>(
          `SELECT return_period, supply_type, doc_type, taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text
           FROM public.gst_invoices_sales
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND is_amendment = false`,
          [reg.id, from, to],
        )
      ).rows;

      const twoB = (
        await client.query<{
          return_period: string;
          doc_type: string;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          cess_amount: string;
        }>(
          `SELECT return_period, doc_type, taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text
           FROM public.gst_2b_records
           WHERE gst_registration_id = $1 AND return_period BETWEEN $2 AND $3 AND itc_available = true AND ims_action_status <> 'R'`,
          [reg.id, from, to],
        )
      ).rows;

      const filings = (
        await client.query<{
          return_period: string;
          gross_tax_liability: string;
          total_itc_claimed: string;
          net_cash_paid: string;
        }>(
          `SELECT return_period, gross_tax_liability::text, total_itc_claimed::text, net_cash_paid::text
           FROM public.gst_filings
           WHERE gst_registration_id = $1 AND return_type = 'GSTR3B' AND return_period BETWEEN $2 AND $3`,
          [reg.id, from, to],
        )
      ).rows;

      const sumSplit = (list: typeof sales, pred: (r: (typeof sales)[number]) => boolean) => {
        let tx = new Decimal(0), ig = new Decimal(0), cg = new Decimal(0), sg = new Decimal(0), ce = new Decimal(0);
        for (const r of list) {
          if (!pred(r)) continue;
          const mult = r.doc_type === 'CRN' ? -1 : 1;
          tx = tx.plus(new Decimal(r.taxable_value).mul(mult));
          ig = ig.plus(new Decimal(r.igst_amount).mul(mult));
          cg = cg.plus(new Decimal(r.cgst_amount).mul(mult));
          sg = sg.plus(new Decimal(r.sgst_amount).mul(mult));
          ce = ce.plus(new Decimal(r.cess_amount).mul(mult));
        }
        return { taxableValue: tx.toFixed(2), igst: ig.toFixed(2), cgst: cg.toFixed(2), sgst: sg.toFixed(2), cess: ce.toFixed(2) };
      };

      const twoBTotals = twoB.reduce(
        (a, r) => {
          const m = r.doc_type === 'CRN' ? -1 : 1;
          return {
            ig: a.ig.plus(new Decimal(r.igst_amount).mul(m)),
            cg: a.cg.plus(new Decimal(r.cgst_amount).mul(m)),
            sg: a.sg.plus(new Decimal(r.sgst_amount).mul(m)),
            ce: a.ce.plus(new Decimal(r.cess_amount).mul(m)),
          };
        },
        { ig: new Decimal(0), cg: new Decimal(0), sg: new Decimal(0), ce: new Decimal(0) },
      );

      const total3bItc = filings.reduce((a, f) => a.plus(f.total_itc_claimed), new Decimal(0));
      const twoBTaxTotal = twoBTotals.ig.plus(twoBTotals.cg).plus(twoBTotals.sg).plus(twoBTotals.ce);

      const months: string[] = [];
      for (let i = 0; i < 12; i++) {
        const m = ((3 + i) % 12) + 1;
        months.push(`${m >= 4 ? q.data.fy : q.data.fy + 1}-${String(m).padStart(2, '0')}`);
      }

      const monthlyVariances = months.map((p) => {
        const g1 = sumSplit(sales, (r) => r.return_period === p);
        const g1Tax = new Decimal(g1.igst).plus(g1.cgst).plus(g1.sgst).plus(g1.cess);
        const p2b = twoB
          .filter((r) => r.return_period === p)
          .reduce((a, r) => a.plus(new Decimal(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount).mul(r.doc_type === 'CRN' ? -1 : 1)), new Decimal(0));
        const f3b = filings.find((f) => f.return_period === p);
        const out3b = new Decimal(f3b?.gross_tax_liability ?? 0);
        const itc3b = new Decimal(f3b?.total_itc_claimed ?? 0);
        const cash3b = new Decimal(f3b?.net_cash_paid ?? 0);
        return {
          period: p,
          gstr1Taxable: g1.taxableValue,
          gstr1Tax: g1Tax.toFixed(2),
          gstr3bTax: out3b.toFixed(2),
          outwardVariance: g1Tax.sub(out3b).toFixed(2),
          gstr2bItc: p2b.toFixed(2),
          gstr3bItc: itc3b.toFixed(2),
          itcVariance: itc3b.sub(p2b).toFixed(2),
          cashPaid: cash3b.toFixed(2),
        };
      });

      const engineResult = computeGstr9AnnualReconciliation({
        financialYear: fyLabel,
        gstin: reg.gstin,
        legalName: entityRow?.legal_name ?? '',
        tradeName: entityRow?.trade_name ?? undefined,
        outward: {
          b2b: sumSplit(sales, (r) => r.supply_type === 'B2B' && r.doc_type === 'INV'),
          b2cLarge: sumSplit(sales, (r) => r.supply_type === 'B2CL' && r.doc_type === 'INV'),
          b2cSmall: sumSplit(sales, (r) => r.supply_type === 'B2CS' && r.doc_type === 'INV'),
          exportsWithTax: sumSplit(sales, (r) => r.supply_type === 'EXPWP' && r.doc_type === 'INV'),
          creditNotesTaxable: sumSplit(sales, (r) => r.doc_type === 'CRN'),
          debitNotesTaxable: sumSplit(sales, (r) => r.doc_type === 'DBN'),
        },
        itc: {
          gstr3bTotalItcAvailed: {
            taxableValue: '0.00',
            igst: total3bItc.toFixed(2),
            cgst: '0.00',
            sgst: '0.00',
            cess: '0.00',
          },
          itcAsPer2b: {
            taxableValue: twoBTaxTotal.toFixed(2),
            igst: twoBTotals.ig.toFixed(2),
            cgst: twoBTotals.cg.toFixed(2),
            sgst: twoBTotals.sg.toFixed(2),
            cess: twoBTotals.ce.toFixed(2),
          },
        },
      });

      return { ...engineResult, monthlyVariances };
    });

    if (!workpaper) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (q.data.format === 'csv') {
      const header = ['Period', 'GSTR-1 Taxable', 'GSTR-1 Output Tax', 'GSTR-3B Declared Tax', 'Outward Diff (1-3B)', 'GSTR-2B ITC', 'GSTR-3B ITC', 'ITC Diff (3B-2B)', 'Cash Paid']
        .map(escapeCsvCell)
        .join(',');
      const lines = workpaper.monthlyVariances.map((m) =>
        [m.period, m.gstr1Taxable, m.gstr1Tax, m.gstr3bTax, m.outwardVariance, m.gstr2bItc, m.gstr3bItc, m.itcVariance, m.cashPaid]
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="GSTR9_9C_Prep_${workpaper.gstin}_FY_${workpaper.financialYear}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, ...workpaper });
  });
}

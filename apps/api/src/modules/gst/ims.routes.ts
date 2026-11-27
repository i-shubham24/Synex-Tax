import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration } from './gstHelper.js';
import { escapeCsvCell } from '../../security/inputSanitization.js';

const ImsBulkActionSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  actions: z.array(
    z.object({
      record2bId: z.string().uuid(),
      action: z.enum(['A', 'R', 'P', 'NONE']),
      itcReversalAmount: z.string().optional(),
      rationale: z.string().optional(),
    })
  ).min(1, 'At least one action is required.'),
});

const ReversalEntrySchema = z.object({
  entryType: z.enum(['REVERSAL_4B2', 'RECLAIM_4D1']),
  ruleCode: z.enum(['RULE_37', 'RULE_37A', 'RULE_42', 'RULE_43', 'IMS_PARTIAL', 'SEC_17_5', 'OTHER']).default('RULE_37A'),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierGstin: z.string().max(15).optional(),
  docNum: z.string().max(32).optional(),
  docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  igstAmount: z.string().default('0.00'),
  cgstAmount: z.string().default('0.00'),
  sgstAmount: z.string().default('0.00'),
  cessAmount: z.string().default('0.00'),
  parentReversalId: z.string().uuid().optional(),
  rationale: z.string().min(4, 'Audit rationale is required.'),
});

export async function imsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/gst/:gstinId/ims/actions
  fastify.get('/:gstinId/ims/actions', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period?: string; view?: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const { period, view } = req.query;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      if (view === 'SUPPLIER') {
        let sQuery = `
          SELECT id, COALESCE(customer_gstin, 'URD') AS supplier_gstin, customer_legal_name AS supplier_trade_name,
                 doc_type, invoice_num AS doc_num, invoice_date::text AS doc_date,
                 taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text,
                 ims_buyer_action::text AS ims_action_status, ims_buyer_action_date, return_period,
                 filing_status, created_at
          FROM public.gst_invoices_sales
          WHERE gst_registration_id = $1
        `;
        const sParams: any[] = [reg.id];
        if (period) {
          sQuery += ` AND return_period = $2`;
          sParams.push(period);
        }
        sQuery += ` ORDER BY invoice_date DESC, invoice_num ASC`;
        const sRows = (await client.query(sQuery, sParams)).rows;
        const rejectedCreditNotes = sRows.filter((r) => r.doc_type === 'CRN' && r.ims_action_status === 'R');
        const supplierAlerts = rejectedCreditNotes.map((r) => ({
          recordId: r.id,
          docNum: r.doc_num,
          customerGstin: r.supplier_gstin,
          taxImpact: new Decimal(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount).toFixed(2),
          warning: 'Buyer Rejected Credit Note (Sec 34(2)): Output tax liability will increase in next period GSTR-3B unless resolved.',
        }));

        return reply.send({
          success: true,
          gstin: reg.gstin,
          period: period ?? null,
          view: 'SUPPLIER',
          counts: {
            total: sRows.length,
            pending: sRows.filter((r) => r.ims_action_status === 'P' || r.ims_action_status === 'NONE').length,
            accepted: sRows.filter((r) => r.ims_action_status === 'A').length,
            rejected: sRows.filter((r) => r.ims_action_status === 'R').length,
            rejectedCreditNotes: rejectedCreditNotes.length,
            bypass: 0,
            resetsDetected: 0,
          },
          supplierAlerts,
          queue: sRows.map((r) => ({
            ...r,
            ims_pending_period_count: 0,
            credit_category: 'OUTWARD',
            ims_reset_detected: false,
            is_downward_amendment: false,
            original_filing_locked: false,
            sec34_warning:
              r.doc_type === 'CRN' && r.ims_action_status === 'R'
                ? 'Buyer Rejected Credit Note (Sec 34(2)): Output tax liability will increase in next period GSTR-3B unless resolved.'
                : null,
          })),
        });
      }

      let query = `
        SELECT id, supplier_gstin, supplier_trade_name, doc_type, doc_num, normalized_invoice_key,
               COALESCE(credit_category, CASE WHEN doc_type IN ('ISD','IMPG') THEN doc_type ELSE 'B2B' END) AS credit_category,
               boe_port_code, doc_date::text AS doc_date,
               taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text,
               itc_available, ims_action_status::text AS ims_action_status,
               ims_previous_status::text AS ims_previous_status,
               ims_reset_detected, ims_pending_period_count,
               is_downward_amendment, original_doc_num, original_doc_date::text AS original_doc_date,
               original_filing_locked, original_tax_amount::text AS original_tax_amount,
               return_period, created_at
        FROM public.gst_2b_records
        WHERE gst_registration_id = $1
      `;
      const params: any[] = [reg.id];

      if (period) {
        query += ` AND return_period = $2`;
        params.push(period);
      }
      query += ` ORDER BY doc_date DESC, doc_num ASC`;

      const res = await client.query(query, params);
      const records = res.rows;

      const queue = records.filter((r) => r.doc_type !== 'ISD' && r.doc_type !== 'IMPG' && r.credit_category === 'B2B');
      const bypassBucket = records.filter((r) => r.doc_type === 'ISD' || r.doc_type === 'IMPG' || r.credit_category !== 'B2B');
      const pendingCount = queue.filter((r) => r.ims_action_status === 'P' || r.ims_action_status === 'NONE').length;
      const acceptedCount = queue.filter((r) => r.ims_action_status === 'A').length;
      const rejectedCount = queue.filter((r) => r.ims_action_status === 'R').length;
      const resetsDetected = queue.filter((r) => r.ims_reset_detected).length;

      return reply.send({
        success: true,
        gstin: reg.gstin,
        period: period ?? null,
        view: view ?? 'RECIPIENT',
        counts: {
          total: queue.length,
          pending: pendingCount,
          accepted: acceptedCount,
          rejected: rejectedCount,
          bypass: bypassBucket.length,
          resetsDetected,
        },
        supplierAlerts: [],
        queue: view === 'BYPASS' ? bypassBucket : queue,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/ims/actions
  fastify.post('/:gstinId/ims/actions', async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const parsed = ImsBulkActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid IMS actions payload.', details: parsed.error.issues });
    }

    const { period, actions } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const dayOfMonth = new Date().getDate();
      const isPost14th = dayOfMonth >= 14;

      for (const act of actions) {
        const recRes = await client.query<{
          doc_type: string;
          doc_num: string;
          doc_date: string;
          supplier_gstin: string;
          ims_pending_period_count: number;
          ims_action_status: string;
          is_downward_amendment: boolean;
          original_filing_locked: boolean;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
        }>(
          `SELECT doc_type, doc_num, doc_date::text, supplier_gstin, ims_pending_period_count,
                  ims_action_status::text, is_downward_amendment, original_filing_locked,
                  taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text
           FROM public.gst_2b_records
           WHERE id = $1 AND gst_registration_id = $2`,
          [act.record2bId, reg.id],
        );

        const rec = recRes.rows[0];
        if (!rec) {
          return reply.status(404).send({ error: 'Not Found', message: `2B record ${act.record2bId} not found.` });
        }

        // Rule 1: 1-Period Credit Note Acceptance Cap
        if (rec.doc_type === 'CRN' && act.action === 'P' && rec.ims_pending_period_count >= 1) {
          return reply.status(422).send({
            error: 'STATUTORY_IMS_LIMIT',
            message: 'Credit Notes cannot remain in PENDING status for more than 1 tax period. Action must be Accept (A) or Reject (R).',
          });
        }

        // Rule 1B: Block PENDING (P) on downward amendments when original invoice was Accepted (A) & 3B already filed
        if (rec.is_downward_amendment && rec.original_filing_locked && act.action === 'P') {
          return reply.status(422).send({
            error: 'STATUTORY_IMS_DOWNWARD_LOCK',
            message: 'Downward amendment cannot be kept Pending (P) because the original invoice or debit note was Accepted (A) and its GSTR-3B is already filed. Choose Accept (A) or Reject (R).',
          });
        }

        // Rule 2: Partial Reversal Amount validation
        let reversalAmount = new Decimal(0);
        if (act.itcReversalAmount) {
          reversalAmount = new Decimal(act.itcReversalAmount);
          const totalTax = new Decimal(rec.igst_amount).plus(rec.cgst_amount).plus(rec.sgst_amount);
          if (reversalAmount.greaterThan(totalTax)) {
            return reply.status(422).send({
              error: 'Reversal Exceeds Tax',
              message: `ITC reversal amount (₹${reversalAmount.toFixed(2)}) cannot exceed total invoice tax (₹${totalTax.toFixed(2)}).`,
            });
          }
        }

        await client.query(
          `UPDATE public.gst_2b_records
           SET ims_action_status = $1,
               ims_action_taken_at = now(),
               ims_reset_detected = false,
               updated_at = now()
           WHERE id = $2 AND gst_registration_id = $3`,
          [act.action, act.record2bId, reg.id],
        );

        if (rec.doc_type === 'INV' || rec.doc_type === 'CRN' || rec.doc_type === 'DBN') {
          await client.query(
            `INSERT INTO public.ims_action_queue (
               firm_id, entity_id, gst_registration_id, record_2b_id, action, previous_action,
               doc_type, itc_reversal_amount, action_period, action_source, sync_status, created_by
             ) VALUES (
               app.current_firm_id(), $1, $2, $3, $4, $5,
               $6, $7, $8, 'UI_PORTAL', 'QUEUED', app.current_user_id()
             )`,
            [reg.entity_id, reg.id, act.record2bId, act.action, rec.ims_action_status, rec.doc_type, reversalAmount.toFixed(2), period],
          );
        }

        if (reversalAmount.greaterThan(0)) {
          await client.query(
            `INSERT INTO public.gst_itc_reversal_register (
               firm_id, entity_id, gst_registration_id, entry_type, rule_code, return_period,
               supplier_gstin, doc_num, doc_date, igst_amount, cgst_amount, sgst_amount, cess_amount,
               rationale, created_by
             ) VALUES (
               app.current_firm_id(), $1, $2, 'REVERSAL_4B2', 'IMS_PARTIAL', $3,
               $4, $5, $6, $7, 0.00, 0.00, 0.00,
               $8, app.current_user_id()
             )`,
            [
              reg.entity_id,
              reg.id,
              period,
              rec.supplier_gstin,
              rec.doc_num,
              rec.doc_date,
              reversalAmount.toFixed(2),
              act.rationale ?? `IMS partial Table 4(B)(2) reversal on ${rec.doc_num}`,
            ],
          );
        }
      }

      await client.query(
        `INSERT INTO public.gst_filings (
           firm_id, entity_id, gst_registration_id, return_period, return_type,
           workflow_status, statutory_due_date, last_ims_modified_at, post_14th_ims_modified,
           recompute_gstr2b_required, created_by
         ) VALUES (
           app.current_firm_id(), $1, $2, $3, 'GSTR3B',
           'DRAFT', (DATE ($3 || '-20')), now(), $4, $4, app.current_user_id()
         )
         ON CONFLICT (firm_id, gst_registration_id, return_period, return_type)
         DO UPDATE SET
           last_ims_modified_at = now(),
           post_14th_ims_modified = EXCLUDED.post_14th_ims_modified,
           recompute_gstr2b_required = EXCLUDED.recompute_gstr2b_required,
           updated_at = now()`,
        [reg.entity_id, reg.id, period, isPost14th],
      );

      return reply.send({
        success: true,
        actionsProcessed: actions.length,
        isPost14th,
        recomputeGstr2bRequired: isPost14th,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/ims/recompute-2b
  fastify.post('/:gstinId/ims/recompute-2b', async (req: FastifyRequest<{ Params: { gstinId: string }; Body: { period: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const { period } = req.body || {};
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return reply.status(400).send({ error: 'Invalid Period', message: 'Valid return period is required (YYYY-MM).' });
    }

    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      await client.query(
        `UPDATE public.gst_filings
         SET recompute_gstr2b_completed_at = now(),
             recompute_gstr2b_required = false,
             updated_at = now()
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR3B'`,
        [reg.id, period],
      );

      return reply.send({
        success: true,
        period,
        recomputedAt: new Date().toISOString(),
        recomputeRequired: false,
      });
    });
  });

  // GET /api/v1/gst/:gstinId/ims/:period/working-paper (JSON + CSV export)
  fastify.get('/:gstinId/ims/:period/working-paper', async (req: FastifyRequest<{ Params: { gstinId: string; period: string }; Querystring: { format?: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return reply.status(400).send({ error: 'Invalid Period', message: 'Period must be YYYY-MM.' });
    }
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const ctx = getTenantContext(req);

    const wp = await db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return null;

      const entityRow = (
        await client.query<{ legal_name: string }>(`SELECT legal_name FROM public.entities WHERE id = $1`, [reg.entity_id])
      ).rows[0];

      const rows = (
        await client.query<{
          id: string;
          supplier_gstin: string;
          supplier_trade_name: string | null;
          doc_type: string;
          credit_category: string;
          doc_num: string;
          doc_date: string;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          cess_amount: string;
          itc_available: boolean;
          ims_action_status: string;
          ims_reset_detected: boolean;
          is_downward_amendment: boolean;
        }>(
          `SELECT id, supplier_gstin, supplier_trade_name, doc_type,
                  COALESCE(credit_category, 'B2B') AS credit_category,
                  doc_num, doc_date::text, taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text,
                  itc_available, ims_action_status::text, ims_reset_detected, is_downward_amendment
           FROM public.gst_2b_records
           WHERE gst_registration_id = $1 AND return_period = $2
           ORDER BY credit_category, ims_action_status, doc_date`,
          [reg.id, period],
        )
      ).rows;

      const reversals = (
        await client.query<{
          id: string;
          entry_type: string;
          rule_code: string;
          doc_num: string | null;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          cess_amount: string;
          rationale: string;
        }>(
          `SELECT id, entry_type, rule_code, doc_num, igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text, rationale
           FROM public.gst_itc_reversal_register
           WHERE gst_registration_id = $1 AND return_period = $2
           ORDER BY entry_date ASC`,
          [reg.id, period],
        )
      ).rows;

      const sumTax = (list: typeof rows) =>
        list.reduce(
          (acc, r) => acc.plus(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount),
          new Decimal(0),
        );

      const accepted = rows.filter((r) => r.credit_category === 'B2B' && (r.ims_action_status === 'A' || r.ims_action_status === 'NONE') && r.itc_available);
      const pending = rows.filter((r) => r.credit_category === 'B2B' && r.ims_action_status === 'P');
      const rejected = rows.filter((r) => r.credit_category === 'B2B' && r.ims_action_status === 'R');
      const impg = rows.filter((r) => r.credit_category === 'IMPG' || r.doc_type === 'IMPG');
      const isd = rows.filter((r) => r.credit_category === 'ISD' || r.doc_type === 'ISD');

      const rev4b2 = reversals
        .filter((r) => r.entry_type === 'REVERSAL_4B2')
        .reduce((a, r) => a.plus(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount), new Decimal(0));
      const rec4d1 = reversals
        .filter((r) => r.entry_type === 'RECLAIM_4D1')
        .reduce((a, r) => a.plus(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).plus(r.cess_amount), new Decimal(0));

      return {
        gstin: reg.gstin,
        legalName: entityRow?.legal_name ?? '',
        period,
        generatedAt: new Date().toISOString(),
        summary: {
          acceptedAndDeemedCount: accepted.length,
          acceptedTax: sumTax(accepted).toFixed(2),
          pendingCount: pending.length,
          pendingTax: sumTax(pending).toFixed(2),
          rejectedCount: rejected.length,
          rejectedTax: sumTax(rejected).toFixed(2),
          impgCount: impg.length,
          impgTax: sumTax(impg).toFixed(2),
          isdCount: isd.length,
          isdTax: sumTax(isd).toFixed(2),
          table4b2Reversals: rev4b2.toFixed(2),
          table4d1Reclaims: rec4d1.toFixed(2),
          net3bItcFlow: sumTax(accepted).plus(sumTax(impg)).plus(sumTax(isd)).minus(rev4b2).plus(rec4d1).toFixed(2),
        },
        rows,
        reversals,
      };
    });

    if (!wp) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

    if (format === 'csv') {
      const header = ['Bucket', 'Supplier GSTIN/Port', 'Supplier Name', 'Doc Type', 'Doc No', 'Doc Date', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess', 'IMS Action', 'Reset Flag', 'Downward Amendment']
        .map(escapeCsvCell)
        .join(',');
      const lines = wp.rows.map((r) =>
        [
          r.credit_category,
          r.supplier_gstin,
          r.supplier_trade_name ?? '',
          r.doc_type,
          r.doc_num,
          r.doc_date,
          r.taxable_value,
          r.igst_amount,
          r.cgst_amount,
          r.sgst_amount,
          r.cess_amount,
          r.ims_action_status,
          r.ims_reset_detected ? 'YES' : 'NO',
          r.is_downward_amendment ? 'YES' : 'NO',
        ]
          .map(escapeCsvCell)
          .join(','),
      );
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="IMS_Working_Paper_${wp.gstin}_${period}.csv"`);
      return reply.send([header, ...lines].join('\n'));
    }

    return reply.send({ success: true, workingPaper: wp });
  });

  // GET /api/v1/gst/:gstinId/itc-reversals (Rule 37A Table 4B(2) & 4D(1) audit register)
  fastify.get('/:gstinId/itc-reversals', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period?: string } }>, reply: FastifyReply) => {
    const ctx = getTenantContext(req);
    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, req.params.gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const query = `
        SELECT id, entry_type, rule_code, return_period, entry_date::text, supplier_gstin, doc_num, doc_date::text,
               igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text,
               parent_reversal_id, rationale, created_at
        FROM public.gst_itc_reversal_register
        WHERE gst_registration_id = $1
          ${req.query.period ? 'AND return_period = $2' : ''}
        ORDER BY entry_date DESC, created_at DESC
      `;
      const rows = (await client.query(query, req.query.period ? [reg.id, req.query.period] : [reg.id])).rows;
      return reply.send({ success: true, entries: rows });
    });
  });

  // POST /api/v1/gst/:gstinId/itc-reversals (Insert Table 4B(2) reversal or Table 4D(1) reclaim linked to reversal)
  fastify.post('/:gstinId/itc-reversals', async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const parsed = ReversalEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid ITC reversal/reclaim entry.', details: parsed.error.issues });
    }
    const b = parsed.data;
    const ctx = getTenantContext(req);

    try {
      const entry = await db.withTenantTransaction(ctx, async (client) => {
        const reg = await resolveGstRegistration(client, req.params.gstinId);
        if (!reg) return null;

        const inserted = (
          await client.query(
            `INSERT INTO public.gst_itc_reversal_register (
               firm_id, entity_id, gst_registration_id, entry_type, rule_code, return_period,
               entry_date, supplier_gstin, doc_num, doc_date,
               igst_amount, cgst_amount, sgst_amount, cess_amount,
               parent_reversal_id, rationale, created_by
             ) VALUES (
               app.current_firm_id(), $1, $2, $3, $4, $5,
               COALESCE($6::date, current_date), $7, $8, $9::date,
               $10, $11, $12, $13,
               $14, $15, app.current_user_id()
             )
             RETURNING id, entry_type, rule_code, return_period, entry_date::text,
                       igst_amount::text, cgst_amount::text, sgst_amount::text, cess_amount::text, parent_reversal_id`,
            [
              reg.entity_id, reg.id, b.entryType, b.ruleCode, b.period,
              b.entryDate ?? null, b.supplierGstin ?? null, b.docNum ?? null, b.docDate ?? null,
              b.igstAmount, b.cgstAmount, b.sgstAmount, b.cessAmount,
              b.parentReversalId ?? null, b.rationale,
            ],
          )
        ).rows[0];

        const isReversal = b.entryType === 'REVERSAL_4B2';
        await client.query(
          `INSERT INTO public.electronic_credit_reclaim_ledger (
             firm_id, entity_id, gst_registration_id, return_period,
             reversed_table_4b2_igst, reversed_table_4b2_cgst, reversed_table_4b2_sgst, reversed_table_4b2_cess,
             reclaimed_table_4d1_igst, reclaimed_table_4d1_cgst, reclaimed_table_4d1_sgst, reclaimed_table_4d1_cess
           ) VALUES (
             app.current_firm_id(), $1, $2, $3,
             $4, $5, $6, $7,
             $8, $9, $10, $11
           )
           ON CONFLICT (firm_id, gst_registration_id, return_period)
           DO UPDATE SET
             reversed_table_4b2_igst = electronic_credit_reclaim_ledger.reversed_table_4b2_igst + EXCLUDED.reversed_table_4b2_igst,
             reversed_table_4b2_cgst = electronic_credit_reclaim_ledger.reversed_table_4b2_cgst + EXCLUDED.reversed_table_4b2_cgst,
             reversed_table_4b2_sgst = electronic_credit_reclaim_ledger.reversed_table_4b2_sgst + EXCLUDED.reversed_table_4b2_sgst,
             reversed_table_4b2_cess = electronic_credit_reclaim_ledger.reversed_table_4b2_cess + EXCLUDED.reversed_table_4b2_cess,
             reclaimed_table_4d1_igst = electronic_credit_reclaim_ledger.reclaimed_table_4d1_igst + EXCLUDED.reclaimed_table_4d1_igst,
             reclaimed_table_4d1_cgst = electronic_credit_reclaim_ledger.reclaimed_table_4d1_cgst + EXCLUDED.reclaimed_table_4d1_cgst,
             reclaimed_table_4d1_sgst = electronic_credit_reclaim_ledger.reclaimed_table_4d1_sgst + EXCLUDED.reclaimed_table_4d1_sgst,
             reclaimed_table_4d1_cess = electronic_credit_reclaim_ledger.reclaimed_table_4d1_cess + EXCLUDED.reclaimed_table_4d1_cess,
             updated_at = now()`,
          [
            reg.entity_id, reg.id, b.period,
            isReversal ? b.igstAmount : '0.00',
            isReversal ? b.cgstAmount : '0.00',
            isReversal ? b.sgstAmount : '0.00',
            isReversal ? b.cessAmount : '0.00',
            isReversal ? '0.00' : b.igstAmount,
            isReversal ? '0.00' : b.cgstAmount,
            isReversal ? '0.00' : b.sgstAmount,
            isReversal ? '0.00' : b.cessAmount,
          ],
        );

        return inserted;
      });

      if (!entry) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });
      return reply.status(201).send({ success: true, entry });
    } catch (err: any) {
      if (err?.code === '23514' || /STATUTORY_RECLAIM_/i.test(err?.message ?? '')) {
        return reply.status(422).send({ error: 'STATUTORY_RECLAIM_ERROR', message: err.message });
      }
      throw err;
    }
  });

  // GET /api/v1/gst/:gstinId/ims/offline-json
  fastify.get('/:gstinId/ims/offline-json', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const { period } = req.query;
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return reply.status(400).send({ error: 'Invalid Period', message: 'Valid return period is required (YYYY-MM).' });
    }

    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const res = await client.query<{
        supplier_gstin: string;
        doc_type: string;
        doc_num: string;
        doc_date: string;
        taxable_value: string;
        igst_amount: string;
        cgst_amount: string;
        sgst_amount: string;
        ims_action_status: string;
      }>(
        `SELECT supplier_gstin, doc_type, doc_num, doc_date::text, taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, ims_action_status::text
         FROM public.gst_2b_records
         WHERE gst_registration_id = $1 AND return_period = $2`,
        [reg.id, period],
      );

      const payload = {
        gstin: reg.gstin,
        fp: period.replace('-', ''),
        version: '1.0',
        inwardSupplies: res.rows.map((r) => ({
          ctin: r.supplier_gstin,
          cflag: r.ims_action_status,
          inv: [
            {
              inum: r.doc_num,
              idt: r.doc_date,
              val: new Decimal(r.taxable_value).plus(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).toFixed(2),
              pos: reg.state_code,
              rchrg: 'N',
              inv_typ: 'R',
              act: r.ims_action_status,
              itc_rev: '0.00',
            },
          ],
        })),
      };

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="IMS_${reg.gstin}_${period}.json"`);
      return reply.send(payload);
    });
  });
}

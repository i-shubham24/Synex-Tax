import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration } from './gstHelper.js';

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

      let query = `
        SELECT id, supplier_gstin, supplier_trade_name, doc_type, doc_num, doc_date,
               taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount,
               itc_available, ims_action_status, ims_pending_period_count, return_period,
               created_at
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

      const queue = records.filter((r) => r.doc_type !== 'ISD');
      const bypassBucket = records.filter((r) => r.doc_type === 'ISD');
      const pendingCount = queue.filter((r) => r.ims_action_status === 'P' || r.ims_action_status === 'NONE').length;
      const acceptedCount = queue.filter((r) => r.ims_action_status === 'A').length;
      const rejectedCount = queue.filter((r) => r.ims_action_status === 'R').length;

      return reply.send({
        success: true,
        gstin: reg.gstin,
        period: period ?? null,
        counts: {
          total: queue.length,
          pending: pendingCount,
          accepted: acceptedCount,
          rejected: rejectedCount,
          bypass: bypassBucket.length,
        },
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
        // Fetch 2B record
        const recRes = await client.query<{
          doc_type: string;
          ims_pending_period_count: number;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
        }>(
          `SELECT doc_type, ims_pending_period_count, taxable_value, igst_amount, cgst_amount, sgst_amount
           FROM public.gst_2b_records
           WHERE id = $1 AND gst_registration_id = $2`,
          [act.record2bId, reg.id],
        );

        const rec = recRes.rows[0];
        if (!rec) {
          return reply.status(404).send({ error: 'Not Found', message: `2B record ${act.record2bId} not found.` });
        }

        // Rule 1: 1-Period Credit Note Acceptance Cap
        if (rec.doc_type === 'CRN' && act.action === 'P') {
          if (rec.ims_pending_period_count >= 1) {
            return reply.status(422).send({
              error: 'STATUTORY_IMS_LIMIT',
              message: 'Credit Notes cannot remain in PENDING status for more than 1 tax period. Action must be Accept (A) or Reject (R).',
            });
          }
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

        // Update 2B record
        await client.query(
          `UPDATE public.gst_2b_records
           SET ims_action_status = $1, ims_action_taken_at = now(), updated_at = now()
           WHERE id = $2 AND gst_registration_id = $3`,
          [act.action, act.record2bId, reg.id],
        );

        // Insert into ims_action_queue
        await client.query(
          `INSERT INTO public.ims_action_queue (
             firm_id, entity_id, gst_registration_id, record_2b_id, action,
             doc_type, itc_reversal_amount, action_period, action_source, sync_status, created_by
           ) VALUES (
             app.current_firm_id(), $1, $2, $3, $4,
             $5, $6, $7, 'UI_PORTAL', 'QUEUED', app.current_user_id()
           )`,
          [reg.entity_id, reg.id, act.record2bId, act.action, rec.doc_type, reversalAmount.toFixed(2), period],
        );
      }

      // Update filing table: set last_ims_modified_at = now() and recompute_gstr2b_required
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

      // Mark recompute_gstr2b_completed_at = now() and recompute_gstr2b_required = false
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
        `SELECT supplier_gstin, doc_type, doc_num, doc_date, taxable_value, igst_amount, cgst_amount, sgst_amount, ims_action_status
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

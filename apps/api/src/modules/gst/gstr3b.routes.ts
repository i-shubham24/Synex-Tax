import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration } from './gstHelper.js';
import { GstItcSetOffEngine } from '@synextax/tax-engine';
import { acquireDistributedLock } from '../../infra/locks.js';

const SetOffRequestSchema = z.object({
  monthlyTaxableTurnover: z.string().default('0.00'),
  isRule86bExempt: z.boolean().default(false),
  outwardLiability: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
    cess: z.string().default('0.00'),
  }),
  inwardRcmLiability: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
    cess: z.string().default('0.00'),
  }).optional(),
  itcAvailable: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
    cess: z.string().default('0.00'),
  }),
});

const Pmt06ComputeSchema = z.object({
  method: z.enum(['FIXED_SUM_35_PCT', 'SELF_ASSESSMENT']),
  precedingQuarterNetCashPaid: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
  }).optional(),
  currentMonthLiability: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
  }).optional(),
  currentMonthItcAvailable: z.object({
    igst: z.string().default('0.00'),
    cgst: z.string().default('0.00'),
    sgst: z.string().default('0.00'),
  }).optional(),
});

export async function gstr3bRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // POST /api/v1/gst/:gstinId/gstr3b/:period/auto-draft
  fastify.post('/:gstinId/gstr3b/:period/auto-draft', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Guard: Check Post-14th IMS Cutoff Lock
      const filingRes = await client.query<{
        recompute_gstr2b_required: boolean;
        last_ims_modified_at: string | null;
        recompute_gstr2b_completed_at: string | null;
        workflow_status: string;
      }>(
        `SELECT recompute_gstr2b_required, last_ims_modified_at, recompute_gstr2b_completed_at, workflow_status
         FROM public.gst_filings
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR3B'`,
        [reg.id, period],
      );

      const filing = filingRes.rows[0];
      if (filing && filing.recompute_gstr2b_required) {
        if (!filing.recompute_gstr2b_completed_at ||
            (filing.last_ims_modified_at && new Date(filing.recompute_gstr2b_completed_at) < new Date(filing.last_ims_modified_at))) {
          return reply.status(422).send({
            error: 'IMS_RECOMPUTE_LOCK',
            message: 'IMS actions taken after 14th cutoff. GSTR-2B must be recomputed before GSTR-3B can be filed.',
          });
        }
      }

      // 1. Table 3.1 & 3.2: Aggregate from Outward Sales Register (including GSTR-1A amendments)
      const salesAggRes = await client.query<{
        taxable: string;
        igst: string;
        cgst: string;
        sgst: string;
        cess: string;
      }>(
        `SELECT COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -taxable_value ELSE taxable_value END), 0) as taxable,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -igst_amount ELSE igst_amount END), 0) as igst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -cgst_amount ELSE cgst_amount END), 0) as cgst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -sgst_amount ELSE sgst_amount END), 0) as sgst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -cess_amount ELSE cess_amount END), 0) as cess
         FROM public.gst_invoices_sales
         WHERE gst_registration_id = $1 AND return_period = $2`,
        [reg.id, period],
      );
      const salesAgg = salesAggRes.rows[0];

      // 2. Table 3.1(d): Inward RCM Supplies from Purchase Register
      const rcmAggRes = await client.query<{
        taxable: string;
        igst: string;
        cgst: string;
        sgst: string;
      }>(
        `SELECT COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -taxable_value ELSE taxable_value END), 0) as taxable,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -igst_amount ELSE igst_amount END), 0) as igst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -cgst_amount ELSE cgst_amount END), 0) as cgst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -sgst_amount ELSE sgst_amount END), 0) as sgst
         FROM public.gst_invoices_purchase
         WHERE gst_registration_id = $1 AND return_period = $2 AND reverse_charge = true`,
        [reg.id, period],
      );
      const rcmAgg = rcmAggRes.rows[0];

      // 3. Table 4: Eligible ITC from Accepted/No-Action GSTR-2B (itc_available = true, CRN negated)
      const itcAggRes = await client.query<{
        igst: string;
        cgst: string;
        sgst: string;
        cess: string;
      }>(
        `SELECT COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -igst_amount ELSE igst_amount END), 0) as igst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -cgst_amount ELSE cgst_amount END), 0) as cgst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -sgst_amount ELSE sgst_amount END), 0) as sgst,
                COALESCE(sum(CASE WHEN doc_type = 'CRN' THEN -cess_amount ELSE cess_amount END), 0) as cess
         FROM public.gst_2b_records
         WHERE gst_registration_id = $1 AND return_period = $2
           AND itc_available = true
           AND (ims_action_status = 'A' OR ims_action_status = 'NONE')`,
        [reg.id, period],
      );
      const itcAgg = itcAggRes.rows[0];

      const revAggRes = await client.query<{ total_reversal: string }>(
        `SELECT COALESCE(sum(itc_reversal_amount), 0) as total_reversal
         FROM public.ims_action_queue
         WHERE gst_registration_id = $1 AND action_period = $2`,
        [reg.id, period],
      );
      const imsReversalTotal = revAggRes.rows[0]?.total_reversal ?? '0.00';

      const draftPayload = {
        table3_1: {
          outwardTaxableSupplies: salesAgg,
          inwardRcmSupplies: rcmAgg,
        },
        table4_itc: {
          itcAvailable: itcAgg,
          imsReversalAmount: imsReversalTotal,
        },
      };

      // Upsert GSTR-3B draft
      const upsertSql = `
        INSERT INTO public.gst_filings (
          firm_id, entity_id, gst_registration_id, return_period, return_type,
          workflow_status, statutory_due_date, gross_tax_liability, total_itc_claimed,
          submission_payload, created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, 'GSTR3B',
          'DRAFT', (DATE ($3 || '-20')), $4, $5,
          $6, app.current_user_id()
        )
        ON CONFLICT (firm_id, gst_registration_id, return_period, return_type)
        DO UPDATE SET
          gross_tax_liability = EXCLUDED.gross_tax_liability,
          total_itc_claimed = EXCLUDED.total_itc_claimed,
          submission_payload = EXCLUDED.submission_payload,
          updated_at = now()
        RETURNING id, return_type, return_period, workflow_status;
      `;

      const grossLiability = new Decimal(salesAgg.igst).plus(salesAgg.cgst).plus(salesAgg.sgst).toFixed(2);
      const totalItc = new Decimal(itcAgg.igst).plus(itcAgg.cgst).plus(itcAgg.sgst).toFixed(2);

      const savedFiling = await client.query(upsertSql, [
        reg.entity_id, reg.id, period, grossLiability, totalItc, JSON.stringify(draftPayload),
      ]);

      return reply.send({
        success: true,
        filingId: savedFiling.rows[0].id,
        period,
        draft: draftPayload,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/gstr3b/:period/set-off
  fastify.post('/:gstinId/gstr3b/:period/set-off', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const parsed = SetOffRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid set-off inputs.', details: parsed.error.issues });
    }

    const data = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const isExempt = data.isRule86bExempt || reg.rule_86b_exempt;

      // Execute GstItcSetOffEngine
      const engineResult = GstItcSetOffEngine.compute({
        liability: {
          outward: {
            igst: data.outwardLiability.igst,
            cgst: data.outwardLiability.cgst,
            sgst: data.outwardLiability.sgst,
            cess: data.outwardLiability.cess,
          },
          rcm: {
            igst: data.inwardRcmLiability?.igst ?? '0.00',
            cgst: data.inwardRcmLiability?.cgst ?? '0.00',
            sgst: data.inwardRcmLiability?.sgst ?? '0.00',
            cess: data.inwardRcmLiability?.cess ?? '0.00',
          },
        },
        itcAvailable: {
          igst: data.itcAvailable.igst,
          cgst: data.itcAvailable.cgst,
          sgst: data.itcAvailable.sgst,
          cess: data.itcAvailable.cess,
        },
        turnover: {
          domesticTaxable: data.monthlyTaxableTurnover,
        },
        rule86bExemptions: {
          itPaid1LakhLast2Fy: isExempt,
          refund1LakhPrevFy: isExempt,
          cumulativeCash1PctMet: isExempt,
          isGovernmentOrPsu: isExempt,
        },
      });

      return reply.send({
        success: true,
        period,
        rule86bApplied: engineResult.rule86bApplied,
        rule86bMaxItcCap: engineResult.rule86bMaxItcCap?.toFixed(2) ?? null,
        itcUtilization: {
          igstAgainstIgst: engineResult.itcUtilization.igstAgainstIgst.toFixed(2),
          igstAgainstCgst: engineResult.itcUtilization.igstAgainstCgst.toFixed(2),
          igstAgainstSgst: engineResult.itcUtilization.igstAgainstSgst.toFixed(2),
          cgstAgainstCgst: engineResult.itcUtilization.cgstAgainstCgst.toFixed(2),
          sgstAgainstSgst: engineResult.itcUtilization.sgstAgainstSgst.toFixed(2),
          cessAgainstCess: engineResult.itcUtilization.cessAgainstCess.toFixed(2),
          totalItcUtilized: engineResult.itcUtilization.totalItcUtilized.toFixed(2),
        },
        cashPayable: {
          outward: {
            igst: engineResult.cashPayable.outward.igst.toFixed(2),
            cgst: engineResult.cashPayable.outward.cgst.toFixed(2),
            sgst: engineResult.cashPayable.outward.sgst.toFixed(2),
            cess: engineResult.cashPayable.outward.cess.toFixed(2),
          },
          rcm: {
            igst: engineResult.cashPayable.rcm.igst.toFixed(2),
            cgst: engineResult.cashPayable.rcm.cgst.toFixed(2),
            sgst: engineResult.cashPayable.rcm.sgst.toFixed(2),
            cess: engineResult.cashPayable.rcm.cess.toFixed(2),
          },
          totalCashPayable: engineResult.cashPayable.totalCashPayable.toFixed(2),
        },
        remainingItc: {
          igst: engineResult.remainingItc.igst.toFixed(2),
          cgst: engineResult.remainingItc.cgst.toFixed(2),
          sgst: engineResult.remainingItc.sgst.toFixed(2),
          cess: engineResult.remainingItc.cess.toFixed(2),
        },
      });
    });
  });

  // POST /api/v1/gst/:gstinId/gstr3b/:period/file
  fastify.post('/:gstinId/gstr3b/:period/file', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const ctx = getTenantContext(req);
    const userRole = (req.user as { role: string }).role;

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Fetch existing filing
      const filingRes = await client.query<{
        id: string;
        workflow_status: string;
        statutory_due_date: string;
        expiry_date_3yr: string;
        recompute_gstr2b_required: boolean;
        last_ims_modified_at: string | null;
        recompute_gstr2b_completed_at: string | null;
      }>(
        `SELECT id, workflow_status, statutory_due_date, expiry_date_3yr,
                recompute_gstr2b_required, last_ims_modified_at, recompute_gstr2b_completed_at
         FROM public.gst_filings
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR3B'`,
        [reg.id, period],
      );

      const filing = filingRes.rows[0];
      if (!filing) {
        return reply.status(404).send({ error: 'Not Found', message: `No draft GSTR-3B found for period ${period}. Please auto-draft and compute set-off first.` });
      }

      if (filing.workflow_status === 'FILED') {
        return reply.status(409).send({ error: 'Already Filed', message: `GSTR-3B for period ${period} has already been filed.` });
      }

      // Maker-Checker: Only Partner or APPROVED workflow status permitted
      if (userRole !== 'PARTNER' && filing.workflow_status !== 'APPROVED') {
        return reply.status(403).send({
          error: 'Maker-Checker Approval Required',
          message: 'GSTR-3B filing requires Partner signoff approval.',
        });
      }

      // Check Post-14th Recompute Lock
      if (filing.recompute_gstr2b_required) {
        if (!filing.recompute_gstr2b_completed_at ||
            (filing.last_ims_modified_at && new Date(filing.recompute_gstr2b_completed_at) < new Date(filing.last_ims_modified_at))) {
          return reply.status(422).send({
            error: 'IMS_RECOMPUTE_LOCK',
            message: 'IMS actions taken after 14th cutoff. GSTR-2B must be recomputed before GSTR-3B can be filed.',
          });
        }
      }

      // 3-Year Cliff Check
      if (new Date() > new Date(filing.expiry_date_3yr)) {
        return reply.status(422).send({
          error: 'PORTAL_LOCK_EXPIRED',
          message: `Cannot file GSTR-3B for ${period} as 3 years have elapsed since statutory due date ${filing.statutory_due_date}.`,
        });
      }

      // Concurrency lock
      const lockKey = `filing:${reg.id}:${period}:GSTR3B`;
      const { acquired, release } = await acquireDistributedLock(lockKey, 120);
      if (!acquired) {
        return reply.status(409).send({
          error: 'Filing In Progress',
          message: `A filing job is already running for GSTR-3B period ${period}.`,
        });
      }

      try {
        const stateDigits = reg.state_code;
        const nowStr = new Date().toISOString().replace(/\D/g, '').slice(2, 10);
        const randomHex = Math.floor(Math.random() * 89999 + 10000);
        const arn = `AA${stateDigits}${nowStr}${randomHex}K`;

        const updateRes = await client.query(
          `UPDATE public.gst_filings
           SET workflow_status = 'FILED',
               arn = $1,
               filed_at = now(),
               signed_by_user_id = app.current_user_id(),
               signoff_method = 'DSC',
               updated_at = now()
           WHERE id = $2
           RETURNING id, return_type, return_period, workflow_status, arn, filed_at`,
          [arn, filing.id],
        );

        return reply.send({
          success: true,
          arn,
          filing: updateRes.rows[0],
          filedAt: updateRes.rows[0].filed_at,
        });
      } finally {
        await release();
      }
    });
  });

  // POST /api/v1/gst/:gstinId/qrmp/pmt06/:period/compute
  fastify.post('/:gstinId/qrmp/pmt06/:period/compute', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const parsed = Pmt06ComputeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid PMT-06 calculation parameters.', details: parsed.error.issues });
    }

    const { method, precedingQuarterNetCashPaid, currentMonthLiability, currentMonthItcAvailable } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      if (method === 'FIXED_SUM_35_PCT') {
        const factor = new Decimal('0.35');
        const igstCash = new Decimal(precedingQuarterNetCashPaid?.igst || 0).times(factor).round();
        const cgstCash = new Decimal(precedingQuarterNetCashPaid?.cgst || 0).times(factor).round();
        const sgstCash = new Decimal(precedingQuarterNetCashPaid?.sgst || 0).times(factor).round();
        const totalCash = igstCash.plus(cgstCash).plus(sgstCash);

        return reply.send({
          success: true,
          period,
          method: 'FIXED_SUM_35_PCT',
          challanAmount: {
            igst: igstCash.toFixed(2),
            cgst: cgstCash.toFixed(2),
            sgst: sgstCash.toFixed(2),
            total: totalCash.toFixed(2),
          },
        });
      } else {
        const outIgst = new Decimal(currentMonthLiability?.igst || 0);
        const outCgst = new Decimal(currentMonthLiability?.cgst || 0);
        const outSgst = new Decimal(currentMonthLiability?.sgst || 0);

        const itcIgst = new Decimal(currentMonthItcAvailable?.igst || 0);
        const itcCgst = new Decimal(currentMonthItcAvailable?.cgst || 0);
        const itcSgst = new Decimal(currentMonthItcAvailable?.sgst || 0);

        const netIgst = Decimal.max(0, outIgst.minus(itcIgst));
        const netCgst = Decimal.max(0, outCgst.minus(itcCgst));
        const netSgst = Decimal.max(0, outSgst.minus(itcSgst));
        const total = netIgst.plus(netCgst).plus(netSgst);

        return reply.send({
          success: true,
          period,
          method: 'SELF_ASSESSMENT',
          challanAmount: {
            igst: netIgst.toFixed(2),
            cgst: netCgst.toFixed(2),
            sgst: netSgst.toFixed(2),
            total: total.toFixed(2),
          },
        });
      }
    });
  });
}

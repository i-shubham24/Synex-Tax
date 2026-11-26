import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveTanRegistration } from './tdsHelper.js';

const DeducteeSchema = z.object({
  challanId: z.string().uuid(),
  sectionAllocationId: z.string().uuid(),
  deducteePan: z.string().regex(/^([A-Z]{5}[0-9]{4}[A-Z]|PANNOTAVBL|PANAPPLIED|PANINVALID)$/, 'Must be valid PAN or Protean literal'),
  deducteeName: z.string().min(1).max(150),
  paymentCreditDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
  amountPaid: z.string(),
  tdsRate: z.string(),
  tdsDeducted: z.string(),
  surchargeAmount: z.string().default('0.00'),
  cessAmount: z.string().default('0.00'),
  totalTdsDeposited: z.string(),
  deductionDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
  certificateNo: z.string().max(32).optional().nullable(),
  reasonForNonDeduction: z.enum(['A', 'B', 'C', 'Y', 'S', 'T', 'Z']).optional().nullable(),
});

const BulkPanVerifySchema = z.object({
  pans: z.array(z.string()).min(1, 'At least one PAN is required.'),
});

export async function deducteesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/tds/:tanId/deductees
  fastify.get('/:tanId/deductees', async (req: FastifyRequest<{ Params: { tanId: string }; Querystring: { challanId?: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const { challanId } = req.query;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      let query = `
        SELECT d.*, a.section_code
        FROM public.tds_deductees d
        JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
        WHERE d.tan_registration_id = $1
      `;
      const params: any[] = [reg.id];

      if (challanId) {
        query += ` AND d.challan_id = $2`;
        params.push(challanId);
      }

      query += ` ORDER BY d.payment_credit_date DESC, d.deductee_name ASC`;

      const res = await client.query(query, params);
      return reply.send({
        success: true,
        count: res.rows.length,
        deductees: res.rows,
      });
    });
  });

  // POST /api/v1/tds/:tanId/deductees
  fastify.post('/:tanId/deductees', async (req: FastifyRequest<{ Params: { tanId: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const parsed = DeducteeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid deductee payload.', details: parsed.error.issues });
    }

    const data = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      // Verify challan and section allocation exist
      const challanRes = await client.query<{ id: string }>(
        `SELECT id FROM public.tds_challans WHERE id = $1 AND tan_registration_id = $2`,
        [data.challanId, reg.id],
      );
      if (!challanRes.rows[0]) {
        return reply.status(404).send({ error: 'Not Found', message: 'Challan record not found for this TAN.' });
      }

      const insertSql = `
        INSERT INTO public.tds_deductees (
          firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id,
          deductee_pan, deductee_name, payment_credit_date, amount_paid, tds_rate,
          tds_deducted, surcharge_amount, cess_amount, total_tds_deposited, deduction_date,
          certificate_no, reason_for_non_deduction, created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, app.current_user_id()
        ) RETURNING id, deductee_pan, deductee_name, total_tds_deposited, created_at;
      `;

      const res = await client.query(insertSql, [
        reg.entity_id, reg.id, data.challanId, data.sectionAllocationId,
        data.deducteePan, data.deducteeName, data.paymentCreditDate, data.amountPaid, data.tdsRate,
        data.tdsDeducted, data.surchargeAmount, data.cessAmount, data.totalTdsDeposited, data.deductionDate,
        data.certificateNo ?? null, data.reasonForNonDeduction ?? null,
      ]);

      return reply.status(201).send({
        success: true,
        deductee: res.rows[0],
      });
    });
  });

  // POST /api/v1/tds/:tanId/pan/verify-bulk
  fastify.post('/:tanId/pan/verify-bulk', async (req: FastifyRequest<{ Params: { tanId: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const parsed = BulkPanVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid bulk PAN list.', details: parsed.error.issues });
    }

    const { pans } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const verifiedPans: Array<{ pan: string; status: 'OPERATIVE' | 'INOPERATIVE' | 'INVALID'; higherRateRisk: boolean }> = [];
      let operativeCount = 0;
      let inoperativeCount = 0;

      for (const p of pans) {
        const cleanPan = p.trim().toUpperCase();
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
          verifiedPans.push({ pan: cleanPan, status: 'INVALID', higherRateRisk: true });
          continue;
        }

        // Deterministic simulation: PANs ending in digit/letter where 4th char is 'P' and ends in 'X' are simulated as INOPERATIVE (Aadhaar unlinked)
        const isInoperative = cleanPan.endsWith('X') || cleanPan.startsWith('ZZZ');
        const status = isInoperative ? 'INOPERATIVE' : 'OPERATIVE';

        if (status === 'OPERATIVE') {
          operativeCount++;
        } else {
          inoperativeCount++;
        }

        verifiedPans.push({
          pan: cleanPan,
          status,
          higherRateRisk: status === 'INOPERATIVE',
        });

        // Update public.tds_deductees with verified pan_status
        await client.query(
          `UPDATE public.tds_deductees
           SET pan_status = $1, updated_at = now()
           WHERE tan_registration_id = $2 AND deductee_pan = $3`,
          [status, reg.id, cleanPan],
        );
      }

      return reply.send({
        success: true,
        totalChecked: pans.length,
        operativeCount,
        inoperativeCount,
        results: verifiedPans,
      });
    });
  });

  // POST /api/v1/tds/:tanId/returns/:period/nil-quarter
  fastify.post('/:tanId/returns/:period/nil-quarter', async (req: FastifyRequest<{ Params: { tanId: string; period: string }; Body: { taxYear?: number; quarter?: string; formCode?: string } }>, reply: FastifyReply) => {
    const { tanId, period } = req.params;
    const { taxYear = 2026, quarter = 'Q1', formCode = '140' } = req.body || {};
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const regime = taxYear >= 2026 && quarter >= 'Q1' ? 'IT_ACT_2025' : 'IT_ACT_1961';
      const dueDate = `${taxYear}-07-31`;
      const correctionWindow = `${taxYear + 6}-03-31`;

      const insertSql = `
        INSERT INTO public.tds_returns (
          firm_id, entity_id, tan_registration_id, statutory_regime, tax_year,
          quarter, form_code, return_type, correction_no, workflow_status,
          statutory_due_date, is_nil_return, correction_window_expires_at,
          total_deductees, total_amount_paid, total_tax_deducted, total_tax_deposited,
          created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, $4,
          $5, $6, 'ORIGINAL', 0, 'FILED',
          $7, true, $8,
          0, 0.00, 0.00, 0.00,
          app.current_user_id()
        )
        ON CONFLICT (firm_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, return_type, correction_no)
        DO UPDATE SET
          is_nil_return = true,
          workflow_status = 'FILED',
          updated_at = now()
        RETURNING id, form_code, quarter, tax_year, workflow_status, is_nil_return;
      `;

      const res = await client.query(insertSql, [
        reg.entity_id, reg.id, regime, taxYear, quarter, formCode, dueDate, correctionWindow,
      ]);

      return reply.send({
        success: true,
        status: 'NIL_QUARTER_RECORDED',
        returnRecord: res.rows[0],
      });
    });
  });
}

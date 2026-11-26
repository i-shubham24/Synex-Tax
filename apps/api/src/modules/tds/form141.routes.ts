import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveTanRegistration } from './tdsHelper.js';

export async function form141Routes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/tds/:tanId/form141/:period
  fastify.get('/:tanId/form141/:period', async (req: FastifyRequest<{ Params: { tanId: string; period: string } }>, reply: FastifyReply) => {
    const { tanId, period } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      // Fetch all deductees and their section codes
      const res = await client.query<{
        id: string;
        deductee_pan: string;
        deductee_name: string;
        section_code: string;
        amount_paid: string;
        tds_rate: string;
        tds_deducted: string;
        total_tds_deposited: string;
        payment_credit_date: string;
      }>(
        `SELECT d.id, d.deductee_pan, d.deductee_name, a.section_code,
                d.amount_paid, d.tds_rate, d.tds_deducted, d.total_tds_deposited,
                d.payment_credit_date
         FROM public.tds_deductees d
         JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
         WHERE d.tan_registration_id = $1`,
        [reg.id],
      );

      const rows = res.rows;

      // Group into Form 141 Schedules A-E
      const scheduleA = rows.filter((r) => r.section_code === '192' || r.section_code.startsWith('138'));
      const scheduleB = rows.filter((r) => ['194C', '194J', '194H', '194I', '194Q', '140B', '140C'].includes(r.section_code));
      const scheduleC = rows.filter((r) => ['194IA', '194IB', '194M', '393_2', 'PROPERTY_NRI'].includes(r.section_code));
      const scheduleD = rows.filter((r) => ['194S', '194BA', 'VDA'].includes(r.section_code));
      const scheduleE = rows.filter((r) => r.section_code.startsWith('206C') || r.section_code.startsWith('143'));

      const aggregateSchedule = (items: typeof rows) => {
        let totalPaid = new Decimal(0);
        let totalTds = new Decimal(0);
        for (const item of items) {
          totalPaid = totalPaid.plus(item.amount_paid || 0);
          totalTds = totalTds.plus(item.total_tds_deposited || 0);
        }
        return {
          count: items.length,
          totalAmountPaid: totalPaid.toFixed(2),
          totalTdsDeposited: totalTds.toFixed(2),
          items,
        };
      };

      return reply.send({
        success: true,
        tan: reg.tan,
        period,
        formCode: '141',
        regime: 'IT_ACT_2025',
        schedules: {
          scheduleA_Salary: aggregateSchedule(scheduleA),
          scheduleB_NonSalary: aggregateSchedule(scheduleB),
          scheduleC_Property_Section393_2: aggregateSchedule(scheduleC),
          scheduleD_VirtualDigitalAssets: aggregateSchedule(scheduleD),
          scheduleE_TcsCollections: aggregateSchedule(scheduleE),
        },
      });
    });
  });

  // POST /api/v1/tds/:tanId/form141/:period
  fastify.post('/:tanId/form141/:period', async (req: FastifyRequest<{ Params: { tanId: string; period: string }; Body: { taxYear?: number; quarter?: string } }>, reply: FastifyReply) => {
    const { tanId, period } = req.params;
    const { taxYear = 2026, quarter = 'Q1' } = req.body || {};
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      // Save Form 141 return draft
      const dueDate = `${taxYear}-07-31`;
      const correctionWindow = `${taxYear + 6}-03-31`;

      const insertSql = `
        INSERT INTO public.tds_returns (
          firm_id, entity_id, tan_registration_id, statutory_regime, tax_year,
          quarter, form_code, return_type, correction_no, workflow_status,
          statutory_due_date, correction_window_expires_at, created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, 'IT_ACT_2025', $3,
          $4, '141', 'ORIGINAL', 0, 'DRAFT',
          $5, $6, app.current_user_id()
        )
        ON CONFLICT (firm_id, tan_registration_id, statutory_regime, tax_year, quarter, form_code, return_type, correction_no)
        DO UPDATE SET
          workflow_status = 'DRAFT',
          updated_at = now()
        RETURNING id, form_code, tax_year, quarter, workflow_status;
      `;

      const res = await client.query(insertSql, [
        reg.entity_id, reg.id, taxYear, quarter, dueDate, correctionWindow,
      ]);

      return reply.send({
        success: true,
        period,
        returnId: res.rows[0].id,
        status: 'DRAFT',
      });
    });
  });
}

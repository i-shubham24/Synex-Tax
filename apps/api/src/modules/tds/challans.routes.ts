import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { parseCsiFile, matchChallansWithCsi } from '@synextax/tax-engine';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveTanRegistration } from './tdsHelper.js';

const SectionAllocationSchema = z.object({
  sectionCode: z.string().min(2).max(16),
  incomeTax: z.string().default('0.00'),
  surcharge: z.string().default('0.00'),
  cess: z.string().default('0.00'),
  totalSectionAmount: z.string().default('0.00'),
});

const CreateChallanSchema = z.object({
  challanNo: z.string().min(1).max(16),
  bsrCode: z.string().regex(/^[0-9]{7}$/, 'BSR code must be 7 digits'),
  depositDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD'),
  taxYear: z.number().int().min(2020).max(2035),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  deducteeTypeHead: z.enum(['0020', '0021']),
  residencyScope: z.enum(['RESIDENT', 'NON_RESIDENT']).default('RESIDENT'),
  minorHead: z.enum(['200', '400']).default('200'),
  totalIncomeTax: z.string().default('0.00'),
  totalSurcharge: z.string().default('0.00'),
  totalCess: z.string().default('0.00'),
  interestAllocation: z.string().default('0.00'),
  othersAllocation: z.string().default('0.00'),
  feeLateFiling: z.string().default('0.00'),
  totalChallanAmount: z.string(),
  sectionAllocations: z.array(SectionAllocationSchema).min(1, 'At least 1 section allocation is required.'),
});

const CsiMatchSchema = z.object({
  csiRecords: z
    .array(
      z.object({
        bsrCode: z.string().length(7),
        depositDate: z.string(),
        challanNo: z.string(),
        challanAmount: z.string(),
        cin: z.string().optional(),
      }),
    )
    .optional(),
  csiContent: z.string().min(10).optional(),
}).refine((d) => Boolean((d.csiRecords && d.csiRecords.length > 0) || d.csiContent), {
  message: 'Provide either csiRecords or raw .csi file text in csiContent.',
});

export async function challansRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/tds/:tanId/challans
  fastify.get('/:tanId/challans', async (req: FastifyRequest<{ Params: { tanId: string }; Querystring: { quarter?: string; taxYear?: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const { quarter, taxYear } = req.query;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      let query = `
        SELECT c.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', s.id,
                     'sectionCode', s.section_code,
                     'incomeTax', s.income_tax,
                     'surcharge', s.surcharge,
                     'cess', s.cess,
                     'totalSectionAmount', s.total_section_amount
                   )
                 ) FILTER (WHERE s.id IS NOT NULL), '[]'
               ) as allocations
        FROM public.tds_challans c
        LEFT JOIN public.tds_challan_section_allocations s ON s.challan_id = c.id
        WHERE c.tan_registration_id = $1
      `;
      const params: any[] = [reg.id];
      let pIdx = 2;

      if (quarter) {
        query += ` AND c.quarter = $${pIdx++}`;
        params.push(quarter);
      }
      if (taxYear) {
        query += ` AND c.tax_year = $${pIdx++}`;
        params.push(Number(taxYear));
      }

      query += ` GROUP BY c.id ORDER BY c.deposit_date DESC, c.challan_no ASC`;

      const res = await client.query(query, params);
      return reply.send({
        success: true,
        tan: reg.tan,
        count: res.rows.length,
        challans: res.rows,
      });
    });
  });

  // POST /api/v1/tds/:tanId/challans
  fastify.post('/:tanId/challans', async (req: FastifyRequest<{ Params: { tanId: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const parsed = CreateChallanSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid challan payload.', details: parsed.error.issues });
    }

    const data = parsed.data;
    const ctx = getTenantContext(req);

    // Dual-Act Cutover Router
    // Deposit Date <= 2026-03-31: IT Act 1961 (ITNS 281) -> exactly 1 section allowed
    // Deposit Date >= 2026-04-01: IT Act 2025 (ITNS 281N) -> up to 20 sections allowed
    const is1961Act = data.depositDate <= '2026-03-31';
    const regime = is1961Act ? 'IT_ACT_1961' : 'IT_ACT_2025';

    if (is1961Act && data.sectionAllocations.length > 1) {
      return reply.status(422).send({
        error: 'STATUTORY_CHALLAN_VIOLATION',
        message: 'Under Income-tax Act, 1961 (ITNS 281), a challan can allocate to exactly 1 section code.',
      });
    }

    if (!is1961Act && data.sectionAllocations.length > 20) {
      return reply.status(422).send({
        error: 'STATUTORY_CHALLAN_VIOLATION',
        message: 'Under Income-tax Act, 2025 (ITNS 281N), a single challan cannot exceed 20 section code allocations.',
      });
    }

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      // Insert parent challan
      const insertChallanSql = `
        INSERT INTO public.tds_challans (
          firm_id, entity_id, tan_registration_id, challan_no, bsr_code,
          deposit_date, statutory_regime, tax_year, quarter, deductee_type_head,
          residency_scope, minor_head, total_income_tax, total_surcharge, total_cess,
          interest_allocation, others_allocation, fee_late_filing_427_234e, total_challan_amount,
          created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18,
          app.current_user_id()
        ) RETURNING id, challan_no, statutory_regime, total_challan_amount, created_at;
      `;

      const challanRes = await client.query(insertChallanSql, [
        reg.entity_id, reg.id, data.challanNo, data.bsrCode,
        data.depositDate, regime, data.taxYear, data.quarter, data.deducteeTypeHead,
        data.residencyScope, data.minorHead, data.totalIncomeTax, data.totalSurcharge, data.totalCess,
        data.interestAllocation, data.othersAllocation, data.feeLateFiling, data.totalChallanAmount,
      ]);

      const challanId = challanRes.rows[0].id;

      // Insert section allocations
      const insertedAllocations = [];
      for (const alloc of data.sectionAllocations) {
        const insertAllocSql = `
          INSERT INTO public.tds_challan_section_allocations (
            firm_id, entity_id, challan_id, section_code,
            income_tax, surcharge, cess, total_section_amount
          ) VALUES (
            app.current_firm_id(), $1, $2, $3,
            $4, $5, $6, $7
          ) RETURNING id, section_code, total_section_amount;
        `;
        const allocRes = await client.query(insertAllocSql, [
          reg.entity_id, challanId, alloc.sectionCode,
          alloc.incomeTax, alloc.surcharge, alloc.cess, alloc.totalSectionAmount,
        ]);
        insertedAllocations.push(allocRes.rows[0]);
      }

      return reply.status(201).send({
        success: true,
        challan: challanRes.rows[0],
        allocationsCount: insertedAllocations.length,
        allocations: insertedAllocations,
      });
    });
  });

  // POST /api/v1/tds/:tanId/csi/match
  fastify.post('/:tanId/csi/match', async (req: FastifyRequest<{ Params: { tanId: string } }>, reply: FastifyReply) => {
    const { tanId } = req.params;
    const parsed = CsiMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid CSI payload.', details: parsed.error.issues });
    }

    const { csiRecords, csiContent } = parsed.data;
    const csiInputs = csiRecords
      ? csiRecords.map((r) => ({
          bsrCode: r.bsrCode,
          challanDate: r.depositDate,
          challanNo: r.challanNo,
          amount: r.challanAmount,
        }))
      : (() => {
          const parsedCsi = parseCsiFile(csiContent ?? '');
          if (parsedCsi.errors.length > 0 && parsedCsi.records.length === 0) {
            return { errors: parsedCsi.errors, records: [] as never[] };
          }
          return parsedCsi.records.map((r) => ({
            bsrCode: r.bsrCode,
            challanDate: r.challanDate,
            challanNo: r.challanNo,
            amount: r.amount,
          }));
        })();

    if (!Array.isArray(csiInputs)) {
      return reply.status(422).send({
        error: 'INVALID_CSI_FILE',
        message: 'Uploaded .csi file could not be parsed.',
        details: csiInputs.errors,
      });
    }

    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveTanRegistration(client, tanId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'TAN registration not found.' });

      const challanRowsRes = await client.query<{
        id: string;
        bsr_code: string;
        challan_no: string;
        deposit_date: string;
        total_challan_amount: string;
      }>(
        `SELECT id, bsr_code, challan_no, deposit_date::text AS deposit_date, total_challan_amount::text AS total_challan_amount
         FROM public.tds_challans
         WHERE tan_registration_id = $1`,
        [reg.id],
      );

      const { matched, unmatchedBook, unmatchedCsi } = matchChallansWithCsi(
        challanRowsRes.rows.map((c) => ({
          id: c.id,
          bsrCode: c.bsr_code,
          challanNo: c.challan_no,
          challanDate: c.deposit_date,
          totalAmount: c.total_challan_amount,
        })),
        csiInputs,
      );

      const cinLookup = new Map<string, string>();
      if (csiRecords) {
        for (const r of csiRecords) {
          if (r.cin) {
            cinLookup.set(
              `${r.bsrCode.trim().padStart(7, '0')}-${r.challanNo.trim().replace(/\D/g, '').padStart(5, '0')}-${r.depositDate.slice(0, 10)}`,
              r.cin,
            );
          }
        }
      }

      for (const m of matched) {
        const cin = cinLookup.get(`${m.bsrCode}-${m.challanNo}-${m.challanDate}`) ?? m.cin;
        await client.query(
          `UPDATE public.tds_challans
           SET csi_matched = true,
               csi_cin = $1,
               updated_at = now()
           WHERE id = $2 AND tan_registration_id = $3`,
          [cin, m.challanId, reg.id],
        );
      }

      return reply.send({
        success: true,
        totalCsiRecords: csiInputs.length,
        matchedCount: matched.length,
        unmatchedCount: unmatchedCsi.length,
        matchedChallanIds: matched.map((m) => m.challanId),
        matched,
        unmatchedBook,
        unmatchedCsi,
      });
    });
  });
}

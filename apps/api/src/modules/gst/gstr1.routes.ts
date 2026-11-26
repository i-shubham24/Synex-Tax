import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration } from './gstHelper.js';
import { acquireDistributedLock } from '../../infra/locks.js';

const SaveReturnSchema = z.object({
  returnType: z.enum(['GSTR1', 'IFF']).default('GSTR1'),
});

const Gstr1aAmendmentSchema = z.object({
  amendments: z.array(
    z.object({
      originalInvoiceId: z.string().uuid(),
      invoiceNum: z.string().min(1).max(16),
      invoiceDate: z.string(),
      docType: z.enum(['INV', 'CRN', 'DBN']),
      taxableValue: z.string(),
      igstAmount: z.string().default('0.00'),
      cgstAmount: z.string().default('0.00'),
      sgstAmount: z.string().default('0.00'),
      cessAmount: z.string().default('0.00'),
      totalInvoiceValue: z.string(),
      customerGstin: z.string().optional().nullable(),
      posStateCode: z.string().length(2),
      amendmentReason: z.string().min(3),
    })
  ).min(1, 'At least one amendment is required.'),
});

export async function gstr1Routes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/gst/:gstinId/gstr1/:period/summaries
  fastify.get('/:gstinId/gstr1/:period/summaries', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Determine AATO threshold (<= 5 Cr -> 4 digits, > 5 Cr -> 6 digits)
      const aatoRes = await client.query<{ aato_band: string | null }>(
        `SELECT aato_band FROM public.gst_registrations WHERE id = $1`,
        [reg.id],
      );
      const isAbove5Cr = aatoRes.rows[0]?.aato_band === 'ABOVE_5CR';
      const requiredHsnDigits = isAbove5Cr ? 6 : 4;

      const salesRes = await client.query<{
        invoice_num: string;
        doc_type: string;
        taxable_value: string;
        igst_rate: string;
        igst_amount: string;
        cgst_rate: string;
        cgst_amount: string;
        sgst_rate: string;
        sgst_amount: string;
        cess_amount: string;
        total_invoice_value: string;
      }>(
        `SELECT invoice_num, doc_type, taxable_value, igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount, cess_amount, total_invoice_value
         FROM public.gst_invoices_sales
         WHERE gst_registration_id = $1 AND return_period = $2
         ORDER BY invoice_num ASC`,
        [reg.id, period],
      );

      const sales = salesRes.rows;

      // Table 13: Document Summary
      const docTypes = ['INV', 'CRN', 'DBN'] as const;
      const docSummary = docTypes.map((type) => {
        const filtered = sales.filter((s) => s.doc_type === type);
        if (filtered.length === 0) {
          return {
            docType: type,
            fromSerial: 'N/A',
            toSerial: 'N/A',
            totalCount: 0,
            cancelledCount: 0,
            netIssuedCount: 0,
          };
        }
        return {
          docType: type,
          fromSerial: filtered[0].invoice_num,
          toSerial: filtered[filtered.length - 1].invoice_num,
          totalCount: filtered.length,
          cancelledCount: 0,
          netIssuedCount: filtered.length,
        };
      });

      // Table 12: Aggregate by Tax Rate Slab (CRNs negate values; invoice lines do not store HSN yet)
      const slabBuckets = new Map<
        string,
        { rate: string; count: number; taxable: Decimal; igst: Decimal; cgst: Decimal; sgst: Decimal; cess: Decimal }
      >();

      for (const s of sales) {
        const sign = s.doc_type === 'CRN' ? -1 : 1;
        const combinedRate = new Decimal(s.igst_rate || 0)
          .plus(s.cgst_rate || 0)
          .plus(s.sgst_rate || 0)
          .toDecimalPlaces(2)
          .toString();
        const existing = slabBuckets.get(combinedRate) ?? {
          rate: combinedRate,
          count: 0,
          taxable: new Decimal(0),
          igst: new Decimal(0),
          cgst: new Decimal(0),
          sgst: new Decimal(0),
          cess: new Decimal(0),
        };
        existing.count += 1;
        existing.taxable = existing.taxable.plus(new Decimal(s.taxable_value || 0).mul(sign));
        existing.igst = existing.igst.plus(new Decimal(s.igst_amount || 0).mul(sign));
        existing.cgst = existing.cgst.plus(new Decimal(s.cgst_amount || 0).mul(sign));
        existing.sgst = existing.sgst.plus(new Decimal(s.sgst_amount || 0).mul(sign));
        existing.cess = existing.cess.plus(new Decimal(s.cess_amount || 0).mul(sign));
        slabBuckets.set(combinedRate, existing);
      }

      const hsnSummary = [...slabBuckets.values()].map((b) => ({
        hsnCode: null as string | null,
        hsnStatus: 'HSN_LINE_ITEMS_REQUIRED',
        description: `Consolidated Outward Supplies (${b.rate}% GST slab, capture invoice line HSN for Table 12)`,
        uqc: 'OTH',
        rate: b.rate,
        totalQuantity: b.count,
        taxableValue: b.taxable.toFixed(2),
        igstAmount: b.igst.toFixed(2),
        cgstAmount: b.cgst.toFixed(2),
        sgstAmount: b.sgst.toFixed(2),
        cessAmount: b.cess.toFixed(2),
        totalValue: b.taxable.plus(b.igst).plus(b.cgst).plus(b.sgst).plus(b.cess).toFixed(2),
      }));

      return reply.send({
        success: true,
        gstin: reg.gstin,
        period,
        requiredHsnDigits,
        aatoBand: isAbove5Cr ? 'ABOVE_5CR' : 'UP_TO_5CR',
        table12HsnSummary: hsnSummary,
        table13DocumentSummary: docSummary,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/gstr1/:period/save
  fastify.post('/:gstinId/gstr1/:period/save', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const body = SaveReturnSchema.parse(req.body ?? {});
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Verify period has sales invoices
      const salesCountRes = await client.query<{ count: string; total_taxable: string }>(
        `SELECT count(*) as count, COALESCE(sum(taxable_value), 0) as total_taxable
         FROM public.gst_invoices_sales
         WHERE gst_registration_id = $1 AND return_period = $2`,
        [reg.id, period],
      );

      const count = Number(salesCountRes.rows[0]?.count || 0);
      const totalTaxable = new Decimal(salesCountRes.rows[0]?.total_taxable || 0);

      if (count === 0) {
        return reply.status(422).send({
          error: 'Period Not Ready',
          message: `Cannot save ${body.returnType} for period ${period}: No sales invoices recorded.`,
        });
      }

      // QRMP IFF monthly limit check (₹50 Lakh cap)
      if (body.returnType === 'IFF') {
        const fiftyLakh = new Decimal(5000000);
        if (totalTaxable.greaterThan(fiftyLakh)) {
          return reply.status(422).send({
            error: 'QRMP IFF Limit Exceeded',
            message: `QRMP IFF monthly outward supplies cannot exceed ₹50,00,000. Current taxable turnover: ₹${totalTaxable.toFixed(2)}.`,
          });
        }
      }

      // Concurrency: Acquire Redis lock
      const lockKey = `filing:${reg.id}:${period}:${body.returnType}`;
      const { acquired, release } = await acquireDistributedLock(lockKey, 120);
      if (!acquired) {
        return reply.status(409).send({
          error: 'Filing In Progress',
          message: `A save or sync job is already executing for ${body.returnType} period ${period}. Please try again shortly.`,
        });
      }

      try {
        const referenceId = `REF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;

        const filingUpsert = `
          INSERT INTO public.gst_filings (
            firm_id, entity_id, gst_registration_id, return_period, return_type,
            workflow_status, statutory_due_date, gross_tax_liability, created_by
          ) VALUES (
            app.current_firm_id(), $1, $2, $3, $4,
            'PORTAL_SAVED', (DATE ($3 || '-11')), $5, app.current_user_id()
          )
          ON CONFLICT (firm_id, gst_registration_id, return_period, return_type)
          DO UPDATE SET
            workflow_status = 'PORTAL_SAVED',
            gross_tax_liability = EXCLUDED.gross_tax_liability,
            updated_at = now()
          RETURNING id, return_type, return_period, workflow_status, statutory_due_date;
        `;

        const filingRes = await client.query(filingUpsert, [
          reg.entity_id, reg.id, period, body.returnType, totalTaxable.toFixed(2),
        ]);

        return reply.send({
          success: true,
          referenceId,
          status: 'PORTAL_SAVED',
          filing: filingRes.rows[0],
        });
      } finally {
        await release();
      }
    });
  });

  // POST /api/v1/gst/:gstinId/gstr1a/:period/amend
  fastify.post('/:gstinId/gstr1a/:period/amend', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const parsed = Gstr1aAmendmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid GSTR-1A amendment payload.',
        details: parsed.error.issues,
      });
    }

    const { amendments } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Hard-block Guard 1: Verify GSTR-1 for this period is FILED or PORTAL_SAVED
      const gstr1Res = await client.query<{ workflow_status: string }>(
        `SELECT workflow_status FROM public.gst_filings
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR1'`,
        [reg.id, period],
      );
      const gstr1Status = gstr1Res.rows[0]?.workflow_status;
      if (!gstr1Status || (gstr1Status !== 'FILED' && gstr1Status !== 'PORTAL_SAVED')) {
        return reply.status(422).send({
          error: 'GSTR-1 Incomplete',
          message: `GSTR-1A amendment can only be filed after GSTR-1 has been filed for period ${period}.`,
        });
      }

      // Hard-block Guard 2: Verify GSTR-3B for this period is NOT PORTAL_SAVED or FILED
      const gstr3bRes = await client.query<{ workflow_status: string }>(
        `SELECT workflow_status FROM public.gst_filings
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR3B'`,
        [reg.id, period],
      );
      const gstr3bStatus = gstr3bRes.rows[0]?.workflow_status;
      if (gstr3bStatus === 'PORTAL_SAVED' || gstr3bStatus === 'FILED') {
        return reply.status(422).send({
          error: 'GSTR-3B Locked',
          message: `GSTR-1A amendments are permanently closed for period ${period} because GSTR-3B is already ${gstr3bStatus}.`,
        });
      }

      // Hard-block Guard 3: Single-shot rule: Verify no prior GSTR-1A has been filed
      const prior1aRes = await client.query<{ workflow_status: string; gstr1a_reconciliation_status: string }>(
        `SELECT workflow_status, gstr1a_reconciliation_status FROM public.gst_filings
         WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR1A'`,
        [reg.id, period],
      );
      if (prior1aRes.rows[0]?.workflow_status === 'FILED') {
        return reply.status(422).send({
          error: 'Single Shot Violation',
          message: `Only a single GSTR-1A amendment is permitted per tax period. GSTR-1A has already been filed for ${period}.`,
        });
      }

      // Insert amendment records with incremented revision_no
      const insertedRows = [];
      for (const am of amendments) {
        // Fetch original invoice to get current revision_no
        const origRes = await client.query<{ revision_no: number }>(
          `SELECT revision_no FROM public.gst_invoices_sales
           WHERE id = $1 AND gst_registration_id = $2`,
          [am.originalInvoiceId, reg.id],
        );
        const currentRev = origRes.rows[0]?.revision_no ?? 0;
        const newRev = currentRev + 1;

        const insertSql = `
          INSERT INTO public.gst_invoices_sales (
            firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type,
            pos_state_code, customer_gstin, taxable_value, igst_amount, cgst_amount, sgst_amount,
            cess_amount, total_invoice_value, return_period, parent_record_id, is_amendment,
            amendment_period, revision_no, created_by
          ) VALUES (
            app.current_firm_id(), $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, true,
            $14, $16, app.current_user_id()
          ) RETURNING id, invoice_num, revision_no, is_amendment;
        `;

        const inserted = await client.query(insertSql, [
          reg.entity_id, reg.id, am.invoiceNum, am.invoiceDate, am.docType,
          am.posStateCode, am.customerGstin ?? null, am.taxableValue, am.igstAmount, am.cgstAmount, am.sgstAmount,
          am.cessAmount, am.totalInvoiceValue, period, am.originalInvoiceId, newRev,
        ]);
        insertedRows.push(inserted.rows[0]);
      }

      // Upsert GSTR-1A filing record
      await client.query(
        `INSERT INTO public.gst_filings (
           firm_id, entity_id, gst_registration_id, return_period, return_type,
           workflow_status, statutory_due_date, gstr1a_reconciliation_status, created_by
         ) VALUES (
           app.current_firm_id(), $1, $2, $3, 'GSTR1A',
           'APPROVED', (DATE ($3 || '-13')), 'CONFIRMED_BEFORE_3B', app.current_user_id()
         )
         ON CONFLICT (firm_id, gst_registration_id, return_period, return_type)
         DO UPDATE SET
           workflow_status = 'APPROVED',
           gstr1a_reconciliation_status = 'CONFIRMED_BEFORE_3B',
           updated_at = now()`,
        [reg.entity_id, reg.id, period],
      );

      return reply.send({
        success: true,
        period,
        amendedCount: insertedRows.length,
        amendments: insertedRows,
        gstr1aStatus: 'CONFIRMED_BEFORE_3B',
      });
    });
  });
}

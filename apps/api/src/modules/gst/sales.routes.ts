import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import { getTenantContext, resolveGstRegistration, isPeriodLocked } from './gstHelper.js';
import { validateGstin } from '@synextax/tax-engine';

const SalesInvoiceSchema = z.object({
  invoiceNum: z.string().min(1).max(16, 'Invoice number cannot exceed 16 characters per Rule 46'),
  invoiceDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Date must be YYYY-MM-DD'),
  docType: z.enum(['INV', 'CRN', 'DBN']),
  supplyType: z.enum(['B2B', 'B2CL', 'B2CS', 'EXPWP', 'EXPWOP', 'RCMDOM', 'RCMIMP', 'SEZWP', 'SEZWOP']).default('B2B'),
  customerGstin: z.string().regex(/^[0-9]{2}[0-9A-Z]{13}$/, 'Invalid GSTIN format').optional().nullable(),
  customerLegalName: z.string().max(200).optional().nullable(),
  posStateCode: z.string().length(2, 'State code must be 2 digits'),
  reverseCharge: z.boolean().default(false),
  tableSection: z.enum(['4A', '4B', '6B', '6C', '7', '8', '9B', '11A', '11B', '12']).default('4A'),
  taxableValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be valid decimal string'),
  igstRate: z.string().default('0.0000'),
  igstAmount: z.string().default('0.00'),
  cgstRate: z.string().default('0.0000'),
  cgstAmount: z.string().default('0.00'),
  sgstRate: z.string().default('0.0000'),
  sgstAmount: z.string().default('0.00'),
  cessRate: z.string().default('0.0000'),
  cessAmount: z.string().default('0.00'),
  totalInvoiceValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be valid decimal string'),
  originalInvoiceRef: z.string().max(32).optional().nullable(),
  originalInvoiceDate: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).optional().nullable(),
  returnPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM'),
});

export async function salesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // GET /api/v1/gst/:gstinId/sales
  fastify.get('/:gstinId/sales', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period?: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const { period } = req.query;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) {
        return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found in firm.' });
      }

      let query = `SELECT * FROM public.gst_invoices_sales
                   WHERE gst_registration_id = $1`;
      const params: any[] = [reg.id];

      if (period) {
        query += ` AND return_period = $2`;
        params.push(period);
      }
      query += ` ORDER BY invoice_date DESC, invoice_num ASC`;

      const res = await client.query(query, params);
      const invoices = res.rows;

      let totalTaxable = new Decimal(0);
      let totalIgst = new Decimal(0);
      let totalCgst = new Decimal(0);
      let totalSgst = new Decimal(0);
      let totalInvoiceValue = new Decimal(0);

      for (const inv of invoices) {
        totalTaxable = totalTaxable.plus(inv.taxable_value || 0);
        totalIgst = totalIgst.plus(inv.igst_amount || 0);
        totalCgst = totalCgst.plus(inv.cgst_amount || 0);
        totalSgst = totalSgst.plus(inv.sgst_amount || 0);
        totalInvoiceValue = totalInvoiceValue.plus(inv.total_invoice_value || 0);
      }

      return reply.send({
        success: true,
        gstin: reg.gstin,
        period: period ?? null,
        count: invoices.length,
        summary: {
          totalTaxable: totalTaxable.toFixed(2),
          totalIgst: totalIgst.toFixed(2),
          totalCgst: totalCgst.toFixed(2),
          totalSgst: totalSgst.toFixed(2),
          totalInvoiceValue: totalInvoiceValue.toFixed(2),
        },
        invoices,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/sales
  fastify.post('/:gstinId/sales', async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const parsed = SalesInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid sales invoice payload.',
        details: parsed.error.issues,
      });
    }

    const data = parsed.data;
    const ctx = getTenantContext(req);

    // GSTIN Mod-36 validation if customer GSTIN provided
    if (data.customerGstin) {
      const { isValid: isValidGstin } = validateGstin(data.customerGstin);
      if (!isValidGstin) {
        return reply.status(422).send({
          error: 'Statutory Violation',
          message: `Customer GSTIN ${data.customerGstin} failed Mod-36 checksum validation.`,
        });
      }
    }

    // Notification 03/2026-CT: Credit notes dated prior to 2026-11-01 require original_invoice_ref
    if (data.docType === 'CRN' && data.invoiceDate < '2026-11-01') {
      if (!data.originalInvoiceRef || data.originalInvoiceRef.trim() === '') {
        return reply.status(422).send({
          error: 'Statutory Violation',
          message: 'Credit Notes dated prior to 1-Nov-2026 require original_invoice_ref under Section 15(3)(b) legacy rules.',
        });
      }
    }

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) {
        return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found in firm.' });
      }

      // POS vs Supplier State tax-type guard
      const isInterState = data.posStateCode !== reg.state_code;
      const igstDec = new Decimal(data.igstAmount);
      const cgstDec = new Decimal(data.cgstAmount);
      const sgstDec = new Decimal(data.sgstAmount);

      if (isInterState) {
        if (!cgstDec.isZero() || !sgstDec.isZero()) {
          return reply.status(422).send({
            error: 'Tax Type Violation',
            message: `Inter-state supply (POS: ${data.posStateCode} vs Supplier: ${reg.state_code}) must attract IGST only: CGST and SGST must be 0.00.`,
          });
        }
      } else {
        if (!igstDec.isZero()) {
          return reply.status(422).send({
            error: 'Tax Type Violation',
            message: `Intra-state supply (POS: ${data.posStateCode} matches Supplier: ${reg.state_code}) must attract CGST and SGST only: IGST must be 0.00.`,
          });
        }
      }

      // Check if period is already locked
      const locked = await isPeriodLocked(client, reg.id, data.returnPeriod);
      if (locked) {
        return reply.status(409).send({
          error: 'Period Locked',
          message: `Tax period ${data.returnPeriod} is locked because GSTR-1 or GSTR-3B return has already been filed or portal saved.`,
        });
      }

      // Insert into gst_invoices_sales
      const insertQuery = `
        INSERT INTO public.gst_invoices_sales (
          firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, supply_type,
          customer_gstin, customer_legal_name, pos_state_code, reverse_charge, table_section,
          taxable_value, igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
          cess_rate, cess_amount, total_invoice_value, original_invoice_ref, original_invoice_date,
          return_period, created_by
        ) VALUES (
          app.current_firm_id(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23,
          $24, app.current_user_id()
        ) RETURNING id, invoice_num, return_period, filing_status, created_at;
      `;

      try {
        const res = await client.query(insertQuery, [
          reg.entity_id, reg.id, data.invoiceNum, data.invoiceDate, data.docType, data.supplyType,
          data.customerGstin ?? null, data.customerLegalName ?? null, data.posStateCode, data.reverseCharge, data.tableSection,
          data.taxableValue, data.igstRate, data.igstAmount, data.cgstRate, data.cgstAmount, data.sgstRate, data.sgstAmount,
          data.cessRate, data.cessAmount, data.totalInvoiceValue, data.originalInvoiceRef ?? null, data.originalInvoiceDate ?? null,
          data.returnPeriod,
        ]);

        return reply.status(201).send({
          success: true,
          invoice: res.rows[0],
        });
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({
            error: 'Duplicate Invoice',
            message: `Invoice number ${data.invoiceNum} already exists for ${data.docType} in period ${data.returnPeriod}.`,
          });
        }
        throw err;
      }
    });
  });

  // PATCH /api/v1/gst/:gstinId/sales/:id
  fastify.patch('/:gstinId/sales/:id', async (req: FastifyRequest<{ Params: { gstinId: string; id: string } }>, reply: FastifyReply) => {
    const { gstinId, id } = req.params;
    const body = req.body as Record<string, any>;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const existingRes = await client.query<{ return_period: string; filing_status: string }>(
        `SELECT return_period, filing_status FROM public.gst_invoices_sales WHERE id = $1 AND gst_registration_id = $2`,
        [id, reg.id],
      );
      if (!existingRes.rows[0]) {
        return reply.status(404).send({ error: 'Not Found', message: 'Invoice not found.' });
      }

      const locked = await isPeriodLocked(client, reg.id, existingRes.rows[0].return_period);
      if (locked) {
        return reply.status(409).send({
          error: 'Period Locked',
          message: 'Cannot modify invoice in a filed or saved tax period.',
        });
      }

      const updates: string[] = [];
      const values: any[] = [id, reg.id];
      let idx = 3;

      if (body.taxableValue !== undefined) {
        updates.push(`taxable_value = $${idx++}`);
        values.push(body.taxableValue);
      }
      if (body.totalInvoiceValue !== undefined) {
        updates.push(`total_invoice_value = $${idx++}`);
        values.push(body.totalInvoiceValue);
      }
      if (body.customerLegalName !== undefined) {
        updates.push(`customer_legal_name = $${idx++}`);
        values.push(body.customerLegalName);
      }

      if (updates.length === 0) {
        return reply.send({ success: true, message: 'No changes provided.' });
      }

      const updateSql = `UPDATE public.gst_invoices_sales SET ${updates.join(', ')} WHERE id = $1 AND gst_registration_id = $2 RETURNING *`;
      const updated = await client.query(updateSql, values);
      return reply.send({ success: true, invoice: updated.rows[0] });
    });
  });

  // DELETE /api/v1/gst/:gstinId/sales/:id
  fastify.delete('/:gstinId/sales/:id', async (req: FastifyRequest<{ Params: { gstinId: string; id: string } }>, reply: FastifyReply) => {
    const { gstinId, id } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const existingRes = await client.query<{ return_period: string }>(
        `SELECT return_period FROM public.gst_invoices_sales WHERE id = $1 AND gst_registration_id = $2`,
        [id, reg.id],
      );
      if (!existingRes.rows[0]) {
        return reply.status(404).send({ error: 'Not Found', message: 'Invoice not found.' });
      }

      const locked = await isPeriodLocked(client, reg.id, existingRes.rows[0].return_period);
      if (locked) {
        return reply.status(409).send({
          error: 'Period Locked',
          message: 'Cannot delete invoice from a filed or saved tax period.',
        });
      }

      await client.query(`DELETE FROM public.gst_invoices_sales WHERE id = $1 AND gst_registration_id = $2`, [id, reg.id]);
      return reply.send({ success: true, deletedId: id });
    });
  });
}

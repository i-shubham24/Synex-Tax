import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../../db/pool.js';
import type pg from 'pg';
import { getTenantContext, resolveGstRegistration, isPeriodLocked } from './gstHelper.js';
import { parseInvoiceCsv, parseGstr2bJson, type Gstr2bParseResult } from '@synextax/ingestion';
import { validateUploadedFile } from '../../security/fileUploadValidator.js';
import { escapeCsvCell } from '../../security/inputSanitization.js';
import { validateGstin, classifyInputType } from '@synextax/tax-engine';
import { GstReconciliationEngine, normalizeInvoiceNumber, type PurchaseRegisterInvoice } from '@synextax/queue-worker';

const ImportPreviewSchema = z.object({
  invoices: z.array(
    z.object({
      vendorGstin: z.string(),
      vendorName: z.string().optional(),
      invoiceNum: z.string(),
      invoiceDate: z.string(),
      docType: z.enum(['INV', 'CRN', 'DBN']).default('INV'),
      posStateCode: z.string().length(2).default('03'),
      taxableValue: z.string(),
      igstAmount: z.string().default('0.00'),
      cgstAmount: z.string().default('0.00'),
      sgstAmount: z.string().default('0.00'),
      cessAmount: z.string().default('0.00'),
      totalInvoiceValue: z.string().optional(),
      itcEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE_17_5', 'INELIGIBLE_RULE_42_43', 'INELIGIBLE_OTHER']).default('ELIGIBLE'),
      hsnSacCode: z.string().max(16).optional(),
      inputType: z.enum(['INPUT_GOODS', 'INPUT_SERVICES', 'CAPITAL_GOODS']).optional(),
      rcmCategory: z.enum(['NONE', 'RCMDOM', 'RCMIMP']).optional(),
      description: z.string().optional(),
    })
  ).min(1, 'Invoices array cannot be empty.'),
});

/** Upload routes take the file as text in JSON: { fileName, content }. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_BODY_LIMIT = MAX_UPLOAD_BYTES + 64 * 1024;
const FileUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  content: z.string().min(1).max(MAX_UPLOAD_BYTES),
});

/**
 * Document type of a purchase-register row from its Tally/Busy voucher type, seen from the
 * supplier's side as 2B reports it: our Debit Note (a purchase return) is the supplier's credit
 * note; our Credit Note is the supplier's debit note.
 */
function purchaseDocType(voucherType: string | undefined): 'INV' | 'CRN' | 'DBN' {
  if (/debit\s*note/i.test(voucherType ?? '')) return 'CRN';
  if (/credit\s*note/i.test(voucherType ?? '')) return 'DBN';
  return 'INV';
}

const OverrideMatchSchema = z.object({
  overrideStatus: z.enum(['EXACT_MATCH', 'MANUAL_MATCH', 'MISMATCH_VALUE', 'VENDOR_NOT_IN_2B', 'UNRECONCILED']),
  rationale: z.string().min(5, 'Mandatory audit rationale required for manual match override.'),
});

export async function reconRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid session required.' });
    }
  });

  // POST /api/v1/gst/:gstinId/import/preview
  fastify.post('/:gstinId/import/preview', async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const parsed = ImportPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: 'Invalid import payload.',
        details: parsed.error.issues,
      });
    }

    const { invoices } = parsed.data;
    const errors: Array<{ rowIndex: number; field: string; message: string; jumpIndex: number }> = [];
    const validInvoices: typeof invoices = [];

    invoices.forEach((inv, index) => {
      let hasError = false;

      // GSTIN check
      const cleanGstin = inv.vendorGstin.trim().toUpperCase();
      if (!/^[0-9]{2}[0-9A-Z]{13}$/.test(cleanGstin)) {
        errors.push({ rowIndex: index + 1, field: 'vendorGstin', message: `Malformed GSTIN: ${inv.vendorGstin}`, jumpIndex: index });
        hasError = true;
      } else if (!validateGstin(cleanGstin).isValid) {
        errors.push({ rowIndex: index + 1, field: 'vendorGstin', message: `GSTIN failed Mod-36 check: ${cleanGstin}`, jumpIndex: index });
        hasError = true;
      }

      // Invoice number Rule 46 length check
      if (inv.invoiceNum.length > 16) {
        errors.push({ rowIndex: index + 1, field: 'invoiceNum', message: `Invoice number exceeds 16 chars (Rule 46): ${inv.invoiceNum}`, jumpIndex: index });
        hasError = true;
      }

      // Date check
      if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(inv.invoiceDate)) {
        errors.push({ rowIndex: index + 1, field: 'invoiceDate', message: `Invalid date format (must be YYYY-MM-DD): ${inv.invoiceDate}`, jumpIndex: index });
        hasError = true;
      }

      // Section 17(5) blocked credit detection
      let eligibility = inv.itcEligibility;
      const desc = (inv.description || '').toLowerCase();
      if (desc.includes('motor car') || desc.includes('vehicle') || desc.includes('food and beverage') || desc.includes('catering')) {
        eligibility = 'INELIGIBLE_17_5';
      }

      if (!hasError) {
        validInvoices.push({
          ...inv,
          vendorGstin: cleanGstin,
          itcEligibility: eligibility,
        });
      }
    });

    return reply.send({
      success: true,
      totalRows: invoices.length,
      validCount: validInvoices.length,
      errorCount: errors.length,
      errors,
      preview: validInvoices.slice(0, 50),
    });
  });

  // POST /api/v1/gst/:gstinId/import/commit
  fastify.post('/:gstinId/import/commit', async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const { period } = req.query;
    if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return reply.status(400).send({ error: 'Invalid Period', message: 'Query parameter period is required (YYYY-MM).' });
    }

    const parsed = ImportPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid payload for commit.', details: parsed.error.issues });
    }

    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const result = await insertPurchases(client, reg, parsed.data.invoices, period);

      return reply.status(201).send({ success: true, period, ...result });
    });
  });

  // POST /api/v1/gst/:gstinId/import/register-file?period=YYYY-MM&commit=true
  // A purchase register exported from Tally or Busy (CSV or TSV, sent as text). Without commit it
  // only reports what it read; with commit=true it also saves the rows for the period.
  fastify.post('/:gstinId/import/register-file', { bodyLimit: UPLOAD_BODY_LIMIT }, async (req: FastifyRequest<{ Params: { gstinId: string }; Querystring: { period?: string; commit?: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const period = req.query.period ?? '';
    const commit = req.query.commit === 'true';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      return reply.status(400).send({ error: 'Invalid Period', message: 'Query parameter period is required (YYYY-MM).' });
    }
    const body = FileUploadSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', message: 'Send { fileName, content } with the file as text.', details: body.error.issues });
    const check = validateUploadedFile(Buffer.from(body.data.content, 'utf8'), body.data.fileName, { allowedExtensions: ['.csv', '.tsv', '.txt'], maxSizeBytes: MAX_UPLOAD_BYTES, expectedType: 'CSV' });
    if (!check.valid) return reply.status(422).send({ error: 'File Rejected', message: check.error });

    const ctx = getTenantContext(req);
    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const parsed = parseInvoiceCsv(body.data.content, reg.state_code, { kind: 'PURCHASE' });
      if (parsed.headerRow === 0) {
        return reply.status(422).send({ error: 'No Header', message: 'No header row found. The file needs columns for the supplier invoice number, GSTIN, date and taxable value.' });
      }

      const invoices: ImportInvoice[] = [];
      const notImported: Array<{ rowNumber: number; reason: string }> = [];
      for (const row of parsed.rows) {
        if (!row.isValid) {
          notImported.push({ rowNumber: row.rowNumber, reason: row.validationErrors.join('; ') });
        } else if (row.duplicateOfRow !== undefined) {
          notImported.push({ rowNumber: row.rowNumber, reason: `Same invoice as row ${row.duplicateOfRow}` });
        } else if (!row.partyGstin) {
          notImported.push({ rowNumber: row.rowNumber, reason: 'No supplier GSTIN (unregistered supplier): no credit to reconcile' });
        } else {
          invoices.push({
            vendorGstin: row.partyGstin,
            vendorName: row.partyName,
            invoiceNum: row.invoiceNum,
            invoiceDate: row.invoiceDate,
            docType: purchaseDocType(row.voucherType),
            posStateCode: row.posStateCode,
            taxableValue: row.taxableValue,
            igstAmount: row.igstAmount,
            cgstAmount: row.cgstAmount,
            sgstAmount: row.sgstAmount,
            cessAmount: row.cessAmount,
            totalInvoiceValue: row.totalInvoiceValue,
            itcEligibility: 'ELIGIBLE',
          });
        }
      }

      const report = {
        fileName: check.sanitizedFilename,
        period,
        headerRow: parsed.headerRow,
        rowsRead: parsed.totalRows,
        readyToImport: invoices.length,
        duplicates: parsed.duplicateRowsCount,
        notImported,
        skippedLines: parsed.skipped.length,
        warnings: parsed.rows.filter((r) => r.isValid && r.duplicateOfRow === undefined && r.warnings.length > 0).map((r) => ({ rowNumber: r.rowNumber, warnings: r.warnings })),
        totals: { taxable: parsed.totalTaxableValue, igst: parsed.totalIgst, cgst: parsed.totalCgst, sgst: parsed.totalSgst },
        preview: invoices.slice(0, 50),
      };
      if (!commit) return reply.send({ success: true, committed: false, ...report });

      if (await isPeriodLocked(client, reg.id, period)) {
        return reply.status(409).send({ error: 'Period Locked', message: `GST returns for ${period} are saved or filed; the purchase register for it cannot change.` });
      }
      const result = await insertPurchases(client, reg, invoices, period);
      return reply.status(201).send({ success: true, committed: true, ...report, ...result, alreadyPresent: invoices.length - result.insertedCount });
    });
  });

  // POST /api/v1/gst/:gstinId/recon/2b-file
  // The GSTR-2B JSON downloaded from the GST portal (sent as text). Saves its documents for the
  // period in the file, replacing values for documents already there and keeping IMS actions.
  fastify.post('/:gstinId/recon/2b-file', { bodyLimit: UPLOAD_BODY_LIMIT }, async (req: FastifyRequest<{ Params: { gstinId: string } }>, reply: FastifyReply) => {
    const { gstinId } = req.params;
    const body = FileUploadSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', message: 'Send { fileName, content } with the file as text.', details: body.error.issues });
    const check = validateUploadedFile(Buffer.from(body.data.content, 'utf8'), body.data.fileName, { allowedExtensions: ['.json'], maxSizeBytes: MAX_UPLOAD_BYTES, expectedType: 'JSON' });
    if (!check.valid) return reply.status(422).send({ error: 'File Rejected', message: check.error });

    let twoB: Gstr2bParseResult;
    try {
      twoB = parseGstr2bJson(body.data.content);
    } catch (e) {
      return reply.status(422).send({ error: 'Not A GSTR-2B File', message: e instanceof Error ? e.message : 'The file could not be read as GSTR-2B.' });
    }

    const ctx = getTenantContext(req);
    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });
      if (twoB.recipientGstin !== reg.gstin.toUpperCase()) {
        return reply.status(422).send({ error: 'Wrong GSTIN', message: `This GSTR-2B is for ${twoB.recipientGstin}, not ${reg.gstin}.` });
      }

      let saved = 0;
      const rejected: Array<{ id: string; reason: string }> = [];
      let supplierResetCount = 0;
      let downwardAmendmentCount = 0;

      for (const d of twoB.documents) {
        if (d.creditCategory !== 'IMPG' && !/^[0-9]{2}[0-9A-Z]{13}$/.test(d.supplierGstin)) {
          rejected.push({ id: d.id, reason: `Supplier GSTIN '${d.supplierGstin}' is malformed` });
          continue;
        }
        if (d.docNum.length > 32) {
          rejected.push({ id: d.id, reason: 'Document number longer than 32 characters' });
          continue;
        }

        const normKey = normalizeInvoiceNumber(d.docNum);

        // Detect existing record so supplier modification / reset or downward amendment can be tracked cleanly.
        const existingRes = await client.query<{
          id: string;
          taxable_value: string;
          igst_amount: string;
          cgst_amount: string;
          sgst_amount: string;
          ims_action_status: string;
        }>(
          `SELECT id, taxable_value::text, igst_amount::text, cgst_amount::text, sgst_amount::text, ims_action_status::text
           FROM public.gst_2b_records
           WHERE firm_id = app.current_firm_id()
             AND gst_registration_id = $1
             AND return_period = $2
             AND doc_type = $3
             AND supplier_gstin = $4
             AND doc_num = $5`,
          [reg.id, twoB.period, d.docType, d.supplierGstin, d.docNum],
        );

        const existing = existingRes.rows[0];
        let resetDetected = false;
        let previousStatus = 'NONE';
        if (existing && existing.ims_action_status !== 'NONE') {
          const prevTax = new Decimal(existing.igst_amount).plus(existing.cgst_amount).plus(existing.sgst_amount);
          const nextTax = new Decimal(d.igstAmount).plus(d.cgstAmount).plus(d.sgstAmount);
          if (!prevTax.eq(nextTax) || !new Decimal(existing.taxable_value).eq(d.taxableValue)) {
            resetDetected = true;
            previousStatus = existing.ims_action_status;
            supplierResetCount++;
          }
        }

        let isDownwardAmendment = false;
        let originalFilingLocked = false;
        let originalDocDate: string | null = null;
        let originalTaxAmount: string | null = null;

        if ((d.section === 'b2ba' || d.section === 'cdnra') && d.originalInvoiceRef) {
          const origRes = await client.query<{
            return_period: string;
            doc_date: string;
            igst_amount: string;
            cgst_amount: string;
            sgst_amount: string;
            ims_action_status: string;
          }>(
            `SELECT return_period, doc_date::text, igst_amount::text, cgst_amount::text, sgst_amount::text, ims_action_status::text
             FROM public.gst_2b_records
             WHERE gst_registration_id = $1
               AND supplier_gstin = $2
               AND doc_num = $3
             ORDER BY return_period DESC
             LIMIT 1`,
            [reg.id, d.supplierGstin, d.originalInvoiceRef],
          );
          const orig = origRes.rows[0];
          const newTotalTax = new Decimal(d.igstAmount).plus(d.cgstAmount).plus(d.sgstAmount);
          const origTotalTax = orig
            ? new Decimal(orig.igst_amount).plus(orig.cgst_amount).plus(orig.sgst_amount)
            : d.originalTotalTax
              ? new Decimal(d.originalTotalTax)
              : null;

          if (origTotalTax && newTotalTax.lessThan(origTotalTax)) {
            isDownwardAmendment = true;
            originalTaxAmount = origTotalTax.toFixed(2);
            originalDocDate = orig?.doc_date ?? null;
            if (orig && orig.ims_action_status === 'A') {
              const filedOrig = await client.query(
                `SELECT 1 FROM public.gst_filings
                 WHERE gst_registration_id = $1 AND return_period = $2 AND return_type = 'GSTR3B'
                   AND workflow_status IN ('PORTAL_SAVED', 'FILED', 'CLOSED')`,
                [reg.id, orig.return_period],
              );
              if (filedOrig.rows.length > 0) {
                originalFilingLocked = true;
                downwardAmendmentCount++;
              }
            }
          }
        }

        await client.query(
          `INSERT INTO public.gst_2b_records (
             firm_id, entity_id, gst_registration_id, return_period, supplier_gstin, supplier_trade_name,
             doc_type, doc_num, normalized_invoice_key, credit_category, boe_port_code,
             doc_date, taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount,
             itc_available, itc_ineligibility_reason, gstr1_filing_date, raw_payload,
             ims_action_status, ims_previous_status, ims_reset_detected,
             is_downward_amendment, original_doc_num, original_doc_date, original_filing_locked, original_tax_amount
           ) VALUES (
             app.current_firm_id(), $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20,
             'NONE', $21, $22,
             $23, $24, $25, $26, $27
           )
           ON CONFLICT (firm_id, gst_registration_id, return_period, doc_type, supplier_gstin, doc_num)
           DO UPDATE SET supplier_trade_name = EXCLUDED.supplier_trade_name, doc_date = EXCLUDED.doc_date,
             normalized_invoice_key = EXCLUDED.normalized_invoice_key,
             credit_category = EXCLUDED.credit_category,
             boe_port_code = EXCLUDED.boe_port_code,
             taxable_value = EXCLUDED.taxable_value, igst_amount = EXCLUDED.igst_amount, cgst_amount = EXCLUDED.cgst_amount,
             sgst_amount = EXCLUDED.sgst_amount, cess_amount = EXCLUDED.cess_amount, itc_available = EXCLUDED.itc_available,
             itc_ineligibility_reason = EXCLUDED.itc_ineligibility_reason, gstr1_filing_date = EXCLUDED.gstr1_filing_date,
             raw_payload = EXCLUDED.raw_payload,
             ims_action_status = CASE WHEN $22 THEN 'NONE'::public.ims_action ELSE gst_2b_records.ims_action_status END,
             ims_previous_status = CASE WHEN $22 THEN $21::public.ims_action ELSE gst_2b_records.ims_previous_status END,
             ims_reset_detected = ($22 OR gst_2b_records.ims_reset_detected),
             is_downward_amendment = ($23 OR gst_2b_records.is_downward_amendment),
             original_doc_num = COALESCE(EXCLUDED.original_doc_num, gst_2b_records.original_doc_num),
             original_doc_date = COALESCE(EXCLUDED.original_doc_date, gst_2b_records.original_doc_date),
             original_filing_locked = ($26 OR gst_2b_records.original_filing_locked),
             original_tax_amount = COALESCE(EXCLUDED.original_tax_amount, gst_2b_records.original_tax_amount),
             updated_at = now()`,
          [
            reg.entity_id, reg.id, twoB.period, d.supplierGstin, d.supplierName?.slice(0, 200) ?? null,
            d.docType, d.docNum, normKey, d.creditCategory, d.portCode ?? null,
            d.docDate, d.taxableValue, d.igstAmount, d.cgstAmount, d.sgstAmount, d.cessAmount,
            d.itcAvailable, d.itcReason?.slice(0, 32) ?? null, d.gstr1FilingDate ?? null,
            JSON.stringify({ section: d.section, supplierPeriod: d.supplierPeriod ?? null, originalInvoiceRef: d.originalInvoiceRef ?? null }),
            previousStatus, resetDetected,
            isDownwardAmendment, d.originalInvoiceRef ?? null, originalDocDate, originalFilingLocked, originalTaxAmount,
          ],
        );
        saved++;
      }

      return reply.status(201).send({
        success: true,
        fileName: check.sanitizedFilename,
        period: twoB.period,
        generatedOn: twoB.generatedOn ?? null,
        documentsInFile: twoB.documents.length,
        saved,
        rejected,
        supplierResetCount,
        downwardAmendmentCount,
        impgCount: twoB.documents.filter((d) => d.creditCategory === 'IMPG').length,
        isdCount: twoB.documents.filter((d) => d.creditCategory === 'ISD').length,
        itcNotAvailable: twoB.documents.filter((d) => !d.itcAvailable).length,
        unreadSections: twoB.unreadSections,
      });
    });
  });

  // POST /api/v1/gst/:gstinId/purchases/:id/flag-tds
  fastify.post('/:gstinId/purchases/:id/flag-tds', async (req: FastifyRequest<{ Params: { gstinId: string; id: string }; Body: { tdsSectionCode?: string; rationale?: string } }>, reply: FastifyReply) => {
    const { gstinId, id } = req.params;
    const body = req.body || {};
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const purchaseRes = await client.query(
        `SELECT id, invoice_num, taxable_value, vendor_gstin FROM public.gst_invoices_purchase WHERE id = $1 AND gst_registration_id = $2`,
        [id, reg.id],
      );
      if (!purchaseRes.rows[0]) {
        return reply.status(404).send({ error: 'Not Found', message: 'Purchase invoice not found.' });
      }

      return reply.send({
        success: true,
        purchaseId: id,
        flagged: true,
        tdsSectionCode: body.tdsSectionCode ?? 'SEC_393_1',
        rationale: body.rationale ?? 'High-value supply flagged for Section 393 compliance review.',
        flaggedAt: new Date().toISOString(),
      });
    });
  });

  // POST /api/v1/gst/:gstinId/recon/2b/:period
  fastify.post('/:gstinId/recon/2b/:period', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      // Fetch purchase records
      const prRes = await client.query<{
        id: string;
        vendor_gstin: string;
        invoice_num: string;
        invoice_date: string;
        taxable_value: string;
        igst_amount: string;
        cgst_amount: string;
        sgst_amount: string;
        itc_eligibility: string;
        doc_type: 'INV' | 'CRN' | 'DBN';
        credit_category: 'B2B' | 'IMPG' | 'ISD';
        normalized_invoice_key: string | null;
      }>(
        `SELECT id, vendor_gstin, invoice_num, invoice_date, taxable_value, igst_amount, cgst_amount, sgst_amount,
                itc_eligibility, doc_type, COALESCE(credit_category, 'B2B') AS credit_category, normalized_invoice_key
         FROM public.gst_invoices_purchase
         WHERE gst_registration_id = $1 AND return_period = $2`,
        [reg.id, period],
      );

      // Fetch ALL 2B records for the period; the shared matcher segregates IMPG & ISD out of domestic B2B matching.
      const g2bRes = await client.query<{
        id: string;
        supplier_gstin: string;
        doc_num: string;
        doc_date: string;
        taxable_value: string;
        igst_amount: string;
        cgst_amount: string;
        sgst_amount: string;
        ims_action_status: string;
        doc_type: string;
        credit_category: 'B2B' | 'IMPG' | 'ISD';
        normalized_invoice_key: string | null;
        itc_available: boolean;
      }>(
        `SELECT id, supplier_gstin, doc_num, doc_date, taxable_value, igst_amount, cgst_amount, sgst_amount,
                ims_action_status, doc_type, COALESCE(credit_category, CASE WHEN doc_type IN ('IMPG','ISD') THEN doc_type ELSE 'B2B' END) AS credit_category,
                normalized_invoice_key, itc_available
         FROM public.gst_2b_records
         WHERE gst_registration_id = $1 AND return_period = $2`,
        [reg.id, period],
      );

      const prList = prRes.rows;
      const g2bList = g2bRes.rows;
      const taxOf = (r: { igst_amount: string; cgst_amount: string; sgst_amount: string }) =>
        new Decimal(r.igst_amount).plus(r.cgst_amount).plus(r.sgst_amount).toFixed(2);

      // The shared matcher (the same one the golden fixtures test), not a second copy of its rules.
      const report = GstReconciliationEngine.reconcile(
        period,
        prList.map((r) => ({
          id: r.id,
          vendorGstin: r.vendor_gstin,
          invoiceNum: r.invoice_num,
          normalizedInvoiceKey: r.normalized_invoice_key ?? normalizeInvoiceNumber(r.invoice_num),
          invoiceDate: r.invoice_date,
          docType: r.doc_type,
          creditCategory: r.credit_category,
          taxableValue: r.taxable_value,
          igstAmount: r.igst_amount,
          cgstAmount: r.cgst_amount,
          sgstAmount: r.sgst_amount,
          totalTax: taxOf(r),
          itcEligibility: r.itc_eligibility as PurchaseRegisterInvoice['itcEligibility'],
        })),
        g2bList.map((r) => ({
          id: r.id,
          supplierGstin: r.supplier_gstin,
          docNum: r.doc_num,
          normalizedInvoiceKey: r.normalized_invoice_key ?? normalizeInvoiceNumber(r.doc_num),
          docDate: r.doc_date,
          docType: r.doc_type as 'INV' | 'CRN' | 'DBN' | 'IMPG' | 'ISD',
          creditCategory: r.credit_category,
          taxableValue: r.taxable_value,
          igstAmount: r.igst_amount,
          cgstAmount: r.cgst_amount,
          sgstAmount: r.sgst_amount,
          totalTax: taxOf(r),
          itcAvailable: r.itc_available,
        })),
      );

      // Store each row's outcome. A row not in 2B is VENDOR_NOT_IN_2B (the old route wrote
      // PURCHASE_NOT_IN_PR, which reads as the opposite).
      for (const pair of report.matchedPairs) {
        const matched = pair.status === 'EXACT_MATCH' || pair.status === 'FUZZY_MATCH';
        await client.query(
          `UPDATE public.gst_invoices_purchase
              SET recon_status = $1, matched_2b_id = $2, matched_at = CASE WHEN $3 THEN now() ELSE NULL END
            WHERE id = $4`,
          [pair.status, pair.portal2bRecord!.id, matched, pair.purchaseInvoice!.id],
        );
      }
      for (const pr of report.unmatchedPurchase) {
        await client.query(
          `UPDATE public.gst_invoices_purchase SET recon_status = 'VENDOR_NOT_IN_2B', matched_2b_id = NULL, matched_at = NULL WHERE id = $1`,
          [pr.id],
        );
      }
      // Dated after the period: they wait for a later month's 2B.
      for (const pr of report.outOfPeriodPurchase) {
        await client.query(
          `UPDATE public.gst_invoices_purchase SET recon_status = 'UNRECONCILED', matched_2b_id = NULL, matched_at = NULL WHERE id = $1`,
          [pr.id],
        );
      }

      const totalItcClaimed = prList.reduce((a, r) => a.plus(taxOf(r)), new Decimal(0));

      return reply.send({
        success: true,
        period,
        summary: {
          totalPurchaseCount: prList.length,
          total2bCount: g2bList.length,
          exactMatches: report.exactMatchesCount,
          fuzzyMatches: report.fuzzyMatchesCount,
          probableMatches: report.probableMatchesCount,
          valueMismatches: report.valueMismatchesCount,
          docTypeMismatches: report.docTypeMismatchesCount,
          purchaseNotIn2b: report.purchaseNotIn2bCount,
          datedAfterPeriod: report.outOfPeriodCount,
          vendorNotInPr: report.vendorNotInPrCount,
          totalItcClaimed: totalItcClaimed.toFixed(2),
          totalItcAvailable: report.totalMatchedItc,
          totalItcNotAvailable: report.totalItcNotAvailable,
          totalItcAtRisk: report.totalAtRiskItc,
          totalUnclaimedItc: report.totalUnclaimedItc,
          totalDeferredItc: report.totalDeferredItc,
          impgCount: report.impgRecords?.length ?? 0,
          isdCount: report.isdRecords?.length ?? 0,
          totalImpgItc: report.totalImpgItc ?? '0.00',
          totalIsdItc: report.totalIsdItc ?? '0.00',
        },
        pairs: report.matchedPairs,
        unmatchedPurchase: report.unmatchedPurchase,
        unmatchedPortal2b: report.unmatchedPortal2b,
        outOfPeriodPurchase: report.outOfPeriodPurchase,
        impgRecords: report.impgRecords ?? [],
        isdRecords: report.isdRecords ?? [],
      });
    });
  });

  // POST /api/v1/gst/:gstinId/recon/matches/:id/override
  fastify.post('/:gstinId/recon/matches/:id/override', async (req: FastifyRequest<{ Params: { gstinId: string; id: string } }>, reply: FastifyReply) => {
    const { gstinId, id } = req.params;
    const parsed = OverrideMatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Rationale is required for match override.', details: parsed.error.issues });
    }

    const { overrideStatus, rationale } = parsed.data;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const res = await client.query(
        `UPDATE public.gst_invoices_purchase
         SET recon_status = $1, updated_at = now()
         WHERE id = $2 AND gst_registration_id = $3
         RETURNING id, invoice_num, recon_status`,
        [overrideStatus, id, reg.id],
      );

      if (!res.rows[0]) return reply.status(404).send({ error: 'Not Found', message: 'Purchase invoice record not found.' });

      return reply.send({
        success: true,
        invoice: res.rows[0],
        rationale,
        overriddenAt: new Date().toISOString(),
      });
    });
  });

  // GET /api/v1/gst/:gstinId/recon/discrepancies/:period/export
  fastify.get('/:gstinId/recon/discrepancies/:period/export', async (req: FastifyRequest<{ Params: { gstinId: string; period: string } }>, reply: FastifyReply) => {
    const { gstinId, period } = req.params;
    const ctx = getTenantContext(req);

    return db.withTenantTransaction(ctx, async (client) => {
      const reg = await resolveGstRegistration(client, gstinId);
      if (!reg) return reply.status(404).send({ error: 'Not Found', message: 'GST registration not found.' });

      const prRes = await client.query<{
        vendor_gstin: string;
        invoice_num: string;
        invoice_date: string;
        taxable_value: string;
        total_invoice_value: string;
        recon_status: string;
        itc_eligibility: string;
      }>(
        `SELECT vendor_gstin, invoice_num, invoice_date, taxable_value, total_invoice_value, recon_status, itc_eligibility
         FROM public.gst_invoices_purchase
         WHERE gst_registration_id = $1 AND return_period = $2
         ORDER BY invoice_date ASC`,
        [reg.id, period],
      );

      const rows = prRes.rows;
      const header = [
        'Vendor GSTIN',
        'Invoice Number',
        'Invoice Date',
        'Taxable Value',
        'Invoice Value',
        'Recon Status',
        'ITC Eligibility',
      ]
        .map(escapeCsvCell)
        .join(',');
      const csvLines = [
        header,
        ...rows.map((r) =>
          [
            r.vendor_gstin,
            r.invoice_num,
            r.invoice_date,
            r.taxable_value,
            r.total_invoice_value,
            r.recon_status,
            r.itc_eligibility,
          ]
            .map(escapeCsvCell)
            .join(','),
        ),
      ];

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="Vendor_Discrepancies_${reg.gstin}_${period}.csv"`);
      return reply.send(csvLines.join('\n'));
    });
  });
}


type ImportInvoice = z.infer<typeof ImportPreviewSchema>['invoices'][number];

/** Inserts purchase rows for a period; a row already there (same type, supplier, number) is left as it is. */
async function insertPurchases(
  client: pg.PoolClient,
  reg: { id: string; entity_id: string },
  invoices: ImportInvoice[],
  period: string,
) {
  let insertedCount = 0;
  let tdsFlaggedCount = 0;
  const flaggedTdsInvoices: Array<{ invoiceNum: string; reason: string; amount: string }> = [];

  for (const inv of invoices) {
    const taxableDec = new Decimal(inv.taxableValue);
    const igstDec = new Decimal(inv.igstAmount);
    const cgstDec = new Decimal(inv.cgstAmount);
    const sgstDec = new Decimal(inv.sgstAmount);
    const cessDec = new Decimal(inv.cessAmount);
    const totalVal = inv.totalInvoiceValue
      ? new Decimal(inv.totalInvoiceValue)
      : taxableDec.plus(igstDec).plus(cgstDec).plus(sgstDec).plus(cessDec);

    // GST -> TDS Cross-Compliance check:
    // Section 393(1): Purchase of goods exceeding ₹50L
    // Section 393(4): Professional / Contractor exceeding ₹5L
    // GSTR-7 Scrap purchase > ₹2.5L
    let isTdsCrossFlagged = false;
    let tdsReason = '';

    if (taxableDec.greaterThan(new Decimal(5000000))) {
      isTdsCrossFlagged = true;
      tdsReason = 'SECTION_393_1_GOODS_EXCEEDS_50L';
    } else if (taxableDec.greaterThan(new Decimal(500000)) && (inv.description || '').toLowerCase().includes('contract')) {
      isTdsCrossFlagged = true;
      tdsReason = 'SECTION_393_4_CONTRACTOR_EXCEEDS_5L';
    } else if (taxableDec.greaterThan(new Decimal(250000)) && (inv.description || '').toLowerCase().includes('scrap')) {
      isTdsCrossFlagged = true;
      tdsReason = 'GSTR7_SCRAP_EXCEEDS_2_5L';
    }

    if (isTdsCrossFlagged) {
      tdsFlaggedCount++;
      flaggedTdsInvoices.push({ invoiceNum: inv.invoiceNum, reason: tdsReason, amount: taxableDec.toFixed(2) });
    }

    const insertQuery = `
      INSERT INTO public.gst_invoices_purchase (
        firm_id, entity_id, gst_registration_id, vendor_gstin, vendor_trade_name,
        invoice_num, normalized_invoice_key, invoice_date, doc_type, pos_state_code, reverse_charge,
        hsn_sac_code, input_type, rcm_category,
        taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount, total_invoice_value,
        itc_eligibility, return_period, created_by
      ) VALUES (
        app.current_firm_id(), $1, $2, $3, $4,
        $5, $6, $7, $8, $9, false,
        $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, app.current_user_id()
      )
      ON CONFLICT (firm_id, gst_registration_id, return_period, doc_type, vendor_gstin, invoice_num, revision_no)
      DO NOTHING
      RETURNING id;
    `;

    const inferredInputType =
      inv.inputType ?? classifyInputType({ hsnOrSac: inv.hsnSacCode, description: inv.description });
    const inferredRcmCategory = inv.rcmCategory ?? 'NONE';

    const res = await client.query(insertQuery, [
      reg.entity_id, reg.id, inv.vendorGstin, inv.vendorName ?? null,
      inv.invoiceNum, normalizeInvoiceNumber(inv.invoiceNum), inv.invoiceDate, inv.docType, inv.posStateCode,
      inv.hsnSacCode ?? null, inferredInputType, inferredRcmCategory,
      taxableDec.toFixed(2), igstDec.toFixed(2), cgstDec.toFixed(2), sgstDec.toFixed(2), cessDec.toFixed(2), totalVal.toFixed(2),
      inv.itcEligibility, period,
    ]);

    if (res.rows.length > 0) insertedCount++;
  }

  return { insertedCount, tdsFlaggedCount, flaggedTdsInvoices };
}

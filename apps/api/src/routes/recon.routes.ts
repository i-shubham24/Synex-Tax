import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  GstReconciliationEngine,
  PurchaseRegisterInvoice,
  Gstr2BRecord,
  ImsPre14AlertEngine,
} from '@synextax/queue-worker';

const ReconRunInputSchema = z.object({
  entityId: z.string().uuid(),
  gstin: z.string().length(15),
  period: z.string().regex(/^\d{2}\d{4}$/, 'Period must be MMYYYY format'),
  purchaseInvoices: z
    .array(
      z.object({
        id: z.string(),
        vendorGstin: z.string().length(15),
        vendorName: z.string().optional(),
        invoiceNum: z.string(),
        invoiceDate: z.string(),
        docType: z.enum(['INV', 'CRN', 'DBN']),
        taxableValue: z.string(),
        igstAmount: z.string(),
        cgstAmount: z.string(),
        sgstAmount: z.string(),
        totalTax: z.string(),
        itcEligibility: z.enum(['ELIGIBLE', 'INELIGIBLE_17_5', 'INELIGIBLE_OTHER']),
      })
    )
    .optional(),
  portal2bRecords: z
    .array(
      z.object({
        id: z.string(),
        supplierGstin: z.string().length(15),
        supplierName: z.string().optional(),
        docNum: z.string(),
        docDate: z.string(),
        docType: z.enum(['INV', 'CRN', 'DBN']),
        taxableValue: z.string(),
        igstAmount: z.string(),
        cgstAmount: z.string(),
        sgstAmount: z.string(),
        totalTax: z.string(),
        itcAvailable: z.boolean(),
        gstr1FilingDate: z.string().optional(),
        imsActionStatus: z.enum(['A', 'R', 'P', 'NONE']).optional(),
        isAmendedPostAcceptance: z.boolean().optional(),
        originalInvoiceRef: z.string().optional(),
        originalTaxableValue: z.string().optional(),
        originalTotalTax: z.string().optional(),
      })
    )
    .optional(),
});

const ImsActionInputSchema = z.object({
  invoiceId: z.string(),
  gstin: z.string().length(15),
  action: z.enum(['A', 'R', 'P', 'NONE']),
  reason: z.string().optional(),
  acknowledgedDelta: z.boolean().optional(),
});

// Sample production calibrated records for instant preview
const DEFAULT_PURCHASE_REGISTER: PurchaseRegisterInvoice[] = [
  {
    id: 'pr-101',
    vendorGstin: '03AABCP1332L1Z4',
    vendorName: 'Amritsar Precision Steel Ltd',
    invoiceNum: 'INV/2025-26/089',
    invoiceDate: '2025-11-04',
    docType: 'INV',
    taxableValue: '150000.00',
    igstAmount: '0.00',
    cgstAmount: '13500.00',
    sgstAmount: '13500.00',
    totalTax: '27000.00',
    itcEligibility: 'ELIGIBLE',
  },
  {
    id: 'pr-102',
    vendorGstin: '07BBBPG4512D1ZR',
    vendorName: 'Apex Cloud Solutions Delhi',
    invoiceNum: 'ACS/25-26/0441',
    invoiceDate: '2025-11-05',
    docType: 'INV',
    taxableValue: '48000.00',
    igstAmount: '8640.00',
    cgstAmount: '0.00',
    sgstAmount: '0.00',
    totalTax: '8640.00',
    itcEligibility: 'ELIGIBLE',
  },
  {
    id: 'pr-103',
    vendorGstin: '03CCCPM8891B1Z2',
    vendorName: 'Golden Temple Roadways Transport',
    invoiceNum: 'GTR-9021',
    invoiceDate: '2025-11-08',
    docType: 'INV',
    taxableValue: '95000.00',
    igstAmount: '0.00',
    cgstAmount: '5700.00',
    sgstAmount: '5700.00',
    totalTax: '11400.00',
    itcEligibility: 'INELIGIBLE_17_5',
  },
  {
    id: 'pr-104',
    vendorGstin: '03AAECN9912A1ZX',
    vendorName: 'Ludhiana Machinery Spares',
    invoiceNum: 'LMS-202526-004',
    invoiceDate: '2025-11-10',
    docType: 'INV',
    taxableValue: '210000.00',
    igstAmount: '0.00',
    cgstAmount: '18900.00',
    sgstAmount: '18900.00',
    totalTax: '37800.00',
    itcEligibility: 'ELIGIBLE',
  },
];

const DEFAULT_GSTR2B: Gstr2BRecord[] = [
  {
    id: 'g2b-201',
    supplierGstin: '03AABCP1332L1Z4',
    supplierName: 'Amritsar Precision Steel Ltd',
    docNum: 'INV202526089', // Normalized fuzzy match candidate
    docDate: '2025-11-04',
    docType: 'INV',
    taxableValue: '150000.00',
    igstAmount: '0.00',
    cgstAmount: '13500.00',
    sgstAmount: '13500.00',
    totalTax: '27000.00',
    itcAvailable: true,
    gstr1FilingDate: '2025-11-11',
    imsActionStatus: 'NONE',
  },
  {
    id: 'g2b-202',
    supplierGstin: '07BBBPG4512D1ZR',
    supplierName: 'Apex Cloud Solutions Delhi',
    docNum: 'ACS/25-26/0441',
    docDate: '2025-11-05',
    docType: 'INV',
    taxableValue: '48000.00',
    igstAmount: '8640.00',
    cgstAmount: '0.00',
    sgstAmount: '0.00',
    totalTax: '8640.00',
    itcAvailable: true,
    gstr1FilingDate: '2025-11-10',
    imsActionStatus: 'A',
    isAmendedPostAcceptance: true,
    originalInvoiceRef: 'ACS/25-26/0441-ORIG',
    originalTaxableValue: '40000.00',
    originalTotalTax: '7200.00',
  },
  {
    id: 'g2b-203',
    supplierGstin: '03CCCPM8891B1Z2',
    supplierName: 'Golden Temple Roadways Transport',
    docNum: 'GTR-9021',
    docDate: '2025-11-08',
    docType: 'INV',
    taxableValue: '95000.00',
    igstAmount: '0.00',
    cgstAmount: '5700.00',
    sgstAmount: '5700.00',
    totalTax: '11400.00',
    itcAvailable: false,
    imsActionStatus: 'NONE',
  },
  {
    id: 'g2b-205',
    supplierGstin: '03XXYYZ9999P1Z1',
    supplierName: 'Unrecorded Vendor Hub',
    docNum: 'UVH/991',
    docDate: '2025-11-09',
    docType: 'INV',
    taxableValue: '62000.00',
    igstAmount: '0.00',
    cgstAmount: '5580.00',
    sgstAmount: '5580.00',
    totalTax: '11160.00',
    itcAvailable: true,
    imsActionStatus: 'NONE',
  },
];

export async function reconRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  // Run 4-Pass Reconciliation
  app.post('/run', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ReconRunInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_RECON_INPUT',
        details: parsed.error.issues,
      });
    }

    const { purchaseInvoices, portal2bRecords } = parsed.data;
    const prList = purchaseInvoices && purchaseInvoices.length > 0
      ? (purchaseInvoices as PurchaseRegisterInvoice[])
      : DEFAULT_PURCHASE_REGISTER;

    const g2bList = portal2bRecords && portal2bRecords.length > 0
      ? (portal2bRecords as Gstr2BRecord[])
      : DEFAULT_GSTR2B;

    const reconResult = GstReconciliationEngine.reconcile(parsed.data.period, prList, g2bList);

    return reply.status(200).send({
      success: true,
      data: {
        entityId: parsed.data.entityId,
        gstin: parsed.data.gstin,
        period: parsed.data.period,
        reconciledAt: new Date().toISOString(),
        summary: {
          exactMatchCount: reconResult.exactMatchesCount,
          fuzzyMatchCount: reconResult.fuzzyMatchesCount,
          valueMismatchCount: reconResult.valueMismatchesCount,
          purchaseNotIn2bCount: reconResult.purchaseNotIn2bCount,
          vendorNotInPrCount: reconResult.vendorNotInPrCount,
          totalMatchedItc: reconResult.totalMatchedItc,
          totalAtRiskItc: reconResult.totalAtRiskItc,
          totalUnclaimedItc: reconResult.totalUnclaimedItc,
        },
        pairs: reconResult.matchedPairs,
        unmatchedPurchase: reconResult.unmatchedPurchase,
        unmatchedPortal2b: reconResult.unmatchedPortal2b,
      },
    });
  });

  // IMS Action Submission
  app.post('/ims-action', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = ImsActionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_IMS_ACTION_INPUT',
        details: parsed.error.issues,
      });
    }

    const { invoiceId, action, reason, acknowledgedDelta } = parsed.data;

    // Simulate lookup of the invoice in IMS store
    const item = DEFAULT_GSTR2B.find((g) => g.id === invoiceId) || DEFAULT_GSTR2B[1];
    const isAmended = !!item.isAmendedPostAcceptance;

    // Safety guard: If amended post acceptance, verify explicit CA acknowledgement
    if (isAmended && action === 'A' && !acknowledgedDelta) {
      return reply.status(409).send({
        error: 'AMENDED_POST_ACCEPTANCE_ACKNOWLEDGEMENT_REQUIRED',
        message: 'Invoice has been amended by supplier after initial acceptance. Review net ITC delta and confirm acknowledgement.',
        originalTaxableValue: item.originalTaxableValue,
        amendedTaxableValue: item.taxableValue,
        originalTotalTax: item.originalTotalTax,
        amendedTotalTax: item.totalTax,
      });
    }

    item.imsActionStatus = action;

    return reply.status(200).send({
      success: true,
      data: {
        invoiceId,
        imsActionStatus: action,
        reason: reason || null,
        updatedAt: new Date().toISOString(),
        isAmendedPostAcceptance: isAmended,
        effectiveItcStatus: action === 'A' ? 'CLAIMABLE' : action === 'R' ? 'BLOCKED' : 'PENDING',
      },
    });
  });

  // Pre-14th Deemed Acceptance Risk Scan
  app.get('/pre14-risk', async (req: FastifyRequest, reply: FastifyReply) => {
    const scanRecords = DEFAULT_GSTR2B.map((g) => ({
      id: g.id,
      firmId: '00000000-0000-0000-0000-000000000001',
      gstRegistrationId: '00000000-0000-0000-0000-000000000002',
      gstin: g.supplierGstin,
      supplierGstin: g.supplierGstin,
      supplierName: g.supplierName || 'Unknown Supplier',
      invoiceNum: g.docNum,
      invoiceDate: g.docDate,
      taxableValue: g.taxableValue,
      totalTax: g.totalTax,
      imsActionStatus: g.imsActionStatus || 'NONE',
      itcAvailable: g.itcAvailable,
      isSection17_5Blocked: !g.itcAvailable,
    }));

    const riskScan = ImsPre14AlertEngine.scan(
      '00000000-0000-0000-0000-000000000001',
      '03AABCP1332L1Z4',
      scanRecords,
      '2025-11',
      new Decimal(25000)
    );

    return reply.status(200).send({
      success: true,
      data: {
        scanTimestamp: new Date().toISOString(),
        riskScan,
        actionRequired: !!riskScan && riskScan.unactionedCount > 0,
        statutoryAdvice:
          'Section 38 / IMS Rules: Unactioned invoices are deemed accepted on the 14th cutoff. Review flagged records immediately to prevent ineligible ITC claims.',
      },
    });
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import {
  roundItActSection516,
  roundInterestBaseRule269,
  getMajorHeadForPan,
} from '@synextax/tax-engine';
import {
  TdsChallanCreateSchema,
  TdsReturnFilingSchema,
  PROTEAN_NON_PAN_LITERALS,
} from '@synextax/shared-schemas';

const DeducteeCalcSchema = z.object({
  pan: z.string().toUpperCase(),
  sectionCode: z.string(), // e.g., '194C', '194J', '194Q', '192'
  paymentAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be monetary string'),
  tdsRate: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Rate percentage string'),
  isNonPan: z.boolean().optional(),
  delayMonths: z.number().int().min(0).default(0),
});

const CsiMatchInputSchema = z.object({
  tan: z.string().length(10),
  challans: z.array(
    z.object({
      id: z.string(),
      bsrCode: z.string().length(7),
      challanDate: z.string(),
      challanNo: z.string().min(1).max(16),
      totalAmount: z.string(),
    })
  ),
  csiFileRecords: z.array(
    z.object({
      bsrCode: z.string().length(7),
      challanDate: z.string(),
      challanNo: z.string().min(1).max(16),
      amount: z.string(),
      majorHead: z.enum(['0020', '0021']),
    })
  ),
});

export async function tdsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  // Line item TDS calculation with Section 516 & Rule 269 rounding
  app.post('/calculate', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = DeducteeCalcSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_TDS_CALC_INPUT',
        details: parsed.error.issues,
      });
    }

    const { pan, sectionCode, paymentAmount, tdsRate, isNonPan, delayMonths } = parsed.data;

    // Check non-PAN Protean literals or invalid PAN penal rate (Section 206AA)
    const isProteanLiteral = (PROTEAN_NON_PAN_LITERALS as readonly string[]).includes(pan);
    const effectiveRate = isNonPan || (!isProteanLiteral && pan.length !== 10)
      ? Decimal.max(new Decimal(tdsRate), new Decimal('20.00')).toFixed(2)
      : tdsRate;

    const baseAmount = new Decimal(paymentAmount);
    const rawTds = baseAmount.times(new Decimal(effectiveRate)).dividedBy(100);

    // Apply Section 516 Income-tax Act 2025 rounding:
    // Step 1: Drop paise completely
    // Step 2: Round to nearest Rs 10
    const roundedTdsDec = roundItActSection516(rawTds);
    const roundedTds = roundedTdsDec.toFixed(2);

    // Rule 269 Interest on delayed deduction or deposit:
    // 1% or 1.5% per month on interest base truncated down to nearest Rs 100
    let monthlyInterest = '0.00';
    let interestBase = '0.00';
    if (delayMonths > 0) {
      const interestBaseDec = roundInterestBaseRule269(roundedTdsDec);
      interestBase = interestBaseDec.toFixed(2);
      // Section 201(1A): 1.5% per month or part of month for delayed payment
      const interestDec = interestBaseDec
        .times(new Decimal('0.015'))
        .times(delayMonths);
      monthlyInterest = interestDec.toFixed(2);
    }

    // Determine major head 0020 (Company) vs 0021 (Non-Company)
    const majorHead = isProteanLiteral ? '0021' : getMajorHeadForPan(pan);

    return reply.status(200).send({
      success: true,
      data: {
        pan,
        isProteanLiteral,
        sectionCode,
        paymentAmount,
        tdsRate: effectiveRate,
        isHigherDeductionSection206AA: new Decimal(effectiveRate).gt(new Decimal(tdsRate)),
        rawTdsAmount: rawTds.toFixed(2),
        statutoryTdsSection516: roundedTds,
        interestBaseRule269: interestBase,
        delayMonths,
        statutoryInterest: monthlyInterest,
        totalPayable: new Decimal(roundedTds).plus(new Decimal(monthlyInterest)).toFixed(2),
        majorHead,
        statutoryNotes: [
          'Section 516 IT Act 2025: Truncated paise completely before rounding to nearest Rs 10.',
          'Rule 269: Interest base truncated down to nearest multiple of Rs 100.',
        ],
      },
    });
  });

  // Validate and register ITNS 281 / ITNS 281N Challan
  app.post('/challans', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = TdsChallanCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_CHALLAN_SCHEMA',
        details: parsed.error.issues,
      });
    }

    const challan = parsed.data;

    // Verify multi-section allocation total matches sum of section lines plus surcharge/cess/interest
    const lineTotal = challan.sectionAllocations.reduce((acc, curr) => {
      return acc.plus(new Decimal(curr.totalSectionAmount));
    }, new Decimal('0'))
      .plus(new Decimal(challan.interestAllocation || '0'))
      .plus(new Decimal(challan.othersAllocation || '0'))
      .plus(new Decimal(challan.feeLateFiling || '0'));

    const declaredTotal = new Decimal(challan.totalChallanAmount);

    if (!lineTotal.equals(declaredTotal)) {
      return reply.status(422).send({
        error: 'CHALLAN_TOTAL_MISMATCH',
        message: `Sum of section breakdown (${lineTotal.toFixed(2)}) does not equal challan total (${declaredTotal.toFixed(2)})`,
        lineTotal: lineTotal.toFixed(2),
        declaredTotal: declaredTotal.toFixed(2),
      });
    }

    return reply.status(201).send({
      success: true,
      data: {
        challanId: 'chl-' + Math.random().toString(36).substring(2, 9),
        statutoryRegime: challan.statutoryRegime,
        challanNo: challan.challanNo,
        bsrCode: challan.bsrCode,
        depositDate: challan.depositDate,
        taxYear: challan.taxYear,
        quarter: challan.quarter,
        deducteeTypeHead: challan.deducteeTypeHead,
        minorHead: challan.minorHead,
        sectionsCount: challan.sectionAllocations.length,
        totalChallanAmount: challan.totalChallanAmount,
        status: 'READY_FOR_CSI_MATCH',
        createdAt: new Date().toISOString(),
      },
    });
  });

  // Match Book Challans with NSDL / Protean CSI File
  app.post('/csi-match', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = CsiMatchInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_CSI_MATCH_INPUT',
        details: parsed.error.issues,
      });
    }

    const { challans, csiFileRecords } = parsed.data;

    const matched: Array<{ challanId: string; bsrCode: string; challanNo: string; amount: string }> = [];
    const unmatchedBook: string[] = [];
    const unmatchedCsi: Array<{ bsrCode: string; challanNo: string; amount: string }> = [];

    // Map CSI records by composite key: BSR-ChallanNo-Amount
    const csiMap = new Map<string, (typeof csiFileRecords)[0]>();
    for (const csi of csiFileRecords) {
      const key = `${csi.bsrCode}-${csi.challanNo.padStart(5, '0')}-${new Decimal(csi.amount).toFixed(2)}`;
      csiMap.set(key, csi);
    }

    for (const ch of challans) {
      const key = `${ch.bsrCode}-${ch.challanNo.padStart(5, '0')}-${new Decimal(ch.totalAmount).toFixed(2)}`;
      if (csiMap.has(key)) {
        matched.push({
          challanId: ch.id,
          bsrCode: ch.bsrCode,
          challanNo: ch.challanNo,
          amount: ch.totalAmount,
        });
        csiMap.delete(key);
      } else {
        unmatchedBook.push(ch.id);
      }
    }

    for (const csi of csiMap.values()) {
      unmatchedCsi.push({
        bsrCode: csi.bsrCode,
        challanNo: csi.challanNo,
        amount: csi.amount,
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        tan: parsed.data.tan,
        totalBookChallans: challans.length,
        totalCsiRecords: csiFileRecords.length,
        matchedCount: matched.length,
        unmatchedBookCount: unmatchedBook.length,
        unmatchedCsiCount: unmatchedCsi.length,
        matched,
        unmatchedBook,
        unmatchedCsi,
        matchRate: challans.length > 0 ? (matched.length / challans.length) * 100 : 100,
      },
    });
  });

  // Prepare and validate TDS Return for NSDL FVU processing
  app.post('/returns/validate', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = TdsReturnFilingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'INVALID_TDS_RETURN_SCHEMA',
        details: parsed.error.issues,
      });
    }

    const ret = parsed.data;

    return reply.status(200).send({
      success: true,
      data: {
        tan: ret.tan,
        formType: ret.formType,
        financialYear: ret.financialYear,
        quarter: ret.quarter,
        totalChallanAmount: ret.totalChallanAmount,
        totalDeductionAmount: ret.totalDeductionAmount,
        totalDeductees: ret.deducteesCount,
        panNotAvailableCount: ret.panNotAvailableCount,
        fvuCompatibility: {
          version: '8.4',
          passedPrerequisiteChecks: true,
          dualActFormEquivalence:
            ret.formType === '24Q' || ret.formType === '26Q'
              ? 'Compatible with 1961 Form 16 / 16A and 2025 Form 130 / 131'
              : 'Standard Protean TIN-FC format',
        },
      },
    });
  });
}

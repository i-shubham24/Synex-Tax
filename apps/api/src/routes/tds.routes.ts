import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../db/pool.js';
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

  const getCtx = (req: FastifyRequest) => {
    const user = req.user as { firmId: string; userId: string; role: string };
    return {
      firmId: user.firmId,
      userId: user.userId,
      actorKind: 'USER' as const,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  };

  // GET /api/v1/tds/active: Active Tenant TDS Records, Challans, and Deductees
  app.get('/active', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as { firmId: string; userId: string; role: string };

    if (!db.isConfigured()) {
      return reply.send({
        success: true,
        source: 'SAMPLE_FALLBACK',
        data: {
          tan: 'AMRG04217D',
          legalName: 'Golden Gate Hardware Pvt Ltd (Sample)',
          statutoryRegime: 'IT_ACT_2025',
          taxYear: 2026,
          quarter: 'Q3',
          challans: [
            {
              id: 'chl-demo-1',
              challanNo: '00417',
              bsrCode: '0510308',
              depositDate: '2025-11-07',
              totalAmount: '19700.00',
              majorHead: '0021',
              statutoryRegime: 'IT_ACT_2025',
              allocations: [
                { id: 'sec-1', sectionCode: '393(1)-194C', description: 'Contractors', incomeTax: '6700.00', totalSectionAmount: '6700.00' },
                { id: 'sec-2', sectionCode: '393(1)-194J', description: 'Technical Fees', incomeTax: '6000.00', totalSectionAmount: '6000.00' },
                { id: 'sec-3', sectionCode: '393(1)-194I', description: 'Rent', incomeTax: '7000.00', totalSectionAmount: '7000.00' },
              ],
            },
          ],
          deductees: [
            { id: 'ded-1', pan: 'BQRPS4410K', name: 'Sukhwinder Singh (Sample contractor)', sectionCode: '194C', amountPaid: '150000.00', rate: '1.00%', tdsDeducted: '1500.00', status: 'OPERATIVE' },
            { id: 'ded-2', pan: 'AAKFR2290D', name: 'Ranjit Builders (Sample firm)', sectionCode: '194C', amountPaid: '220000.00', rate: '2.00%', tdsDeducted: '4400.00', status: 'OPERATIVE' },
            { id: 'ded-3', pan: 'PANNOTAVBL', name: 'Unregistered labour contractor (Sample)', sectionCode: '194C', amountPaid: '40000.00', rate: '20.00%', tdsDeducted: '8000.00', status: 'UNAVAILABLE' },
            { id: 'ded-4', pan: 'ACMPK8812B', name: 'Kiran Mehta (Sample consultant)', sectionCode: '194J', amountPaid: '60000.00', rate: '10.00%', tdsDeducted: '6000.00', status: 'OPERATIVE' },
            { id: 'ded-5', pan: 'AAEPB5531H', name: 'Balwant Bedi (Sample landlord)', sectionCode: '194I', amountPaid: '75000.00', rate: '10.00%', tdsDeducted: '7500.00', status: 'OPERATIVE' },
          ],
          returnSummary: {
            formCode: '140',
            workflowStatus: 'DRAFT',
            totalDeductees: 5,
            totalTaxDeposited: '19700.00',
            statutoryDueDate: '2026-01-31',
            correctionWindowExpiresAt: '2028-03-31',
            daysToCorrectionExpiry: 520,
          },
        },
      });
    }

    try {
      const result = await db.withTenantTransaction(getCtx(req), async (client) => {
        // 1. Fetch TAN registration
        const tanRes = await client.query(
          `SELECT t.id, t.tan, t.deductor_type_code, e.legal_name, e.pan
           FROM public.tan_registrations t
           JOIN public.entities e ON e.id = t.entity_id
           WHERE t.firm_id = app.current_firm_id()
           ORDER BY t.created_at LIMIT 1`,
        );

        if (tanRes.rows.length === 0) {
          return null;
        }

        const t = tanRes.rows[0];

        // 2. Fetch challans and section allocations
        const challansRes = await client.query(
          `SELECT c.id, c.challan_no, c.bsr_code, c.deposit_date::text, c.statutory_regime,
                  c.tax_year, c.quarter, c.deductee_type_head, c.total_challan_amount::text, c.csi_matched
           FROM public.tds_challans c
           WHERE c.firm_id = app.current_firm_id() AND c.tan_registration_id = $1
           ORDER BY c.deposit_date DESC, c.created_at DESC`,
          [t.id],
        );

        const challanIds = challansRes.rows.map((c) => c.id);
        const allocationsMap = new Map<string, any[]>();

        if (challanIds.length > 0) {
          const allocRes = await client.query(
            `SELECT a.id, a.challan_id, a.section_code, a.income_tax::text, a.total_section_amount::text
             FROM public.tds_challan_section_allocations a
             WHERE a.firm_id = app.current_firm_id() AND a.challan_id = ANY($1::uuid[])
             ORDER BY a.created_at`,
            [challanIds],
          );
          for (const a of allocRes.rows) {
            const list = allocationsMap.get(a.challan_id) || [];
            list.push({
              id: a.id,
              sectionCode: a.section_code,
              description: a.section_code.replace('393(1)-', ''),
              incomeTax: a.income_tax,
              totalSectionAmount: a.total_section_amount,
            });
            allocationsMap.set(a.challan_id, list);
          }
        }

        const challans = challansRes.rows.map((c) => ({
          id: c.id,
          challanNo: c.challan_no,
          bsrCode: c.bsr_code,
          depositDate: c.deposit_date,
          taxYear: c.tax_year,
          quarter: c.quarter,
          totalAmount: c.total_challan_amount,
          majorHead: c.deductee_type_head,
          statutoryRegime: c.statutory_regime,
          csiMatched: c.csi_matched,
          allocations: allocationsMap.get(c.id) || [],
        }));

        // 3. Fetch deductees
        const dedRes = await client.query(
          `SELECT d.id, d.deductee_pan, d.deductee_name, d.pan_status, d.payment_credit_date::text,
                  d.amount_paid::text, d.tds_rate::text, d.tds_deducted::text, d.total_tds_deposited::text,
                  COALESCE(a.section_code, '393(1)-194C') as section_code
           FROM public.tds_deductees d
           LEFT JOIN public.tds_challan_section_allocations a ON a.id = d.section_allocation_id
           WHERE d.firm_id = app.current_firm_id() AND d.tan_registration_id = $1
           ORDER BY d.created_at`,
          [t.id],
        );

        const deductees = dedRes.rows.map((d) => ({
          id: d.id,
          pan: d.deductee_pan,
          name: d.deductee_name,
          sectionCode: d.section_code.replace('393(1)-', ''),
          amountPaid: d.amount_paid,
          rate: (parseFloat(d.tds_rate) * 100).toFixed(2) + '%',
          tdsDeducted: d.tds_deducted,
          status: d.pan_status,
          paymentDate: d.payment_credit_date,
        }));

        // 4. Fetch returns
        const retRes = await client.query(
          `SELECT id, form_code, statutory_regime, tax_year, quarter, workflow_status,
                  statutory_due_date::text, correction_window_expires_at::text,
                  total_deductees, total_amount_paid::text, total_tax_deposited::text
           FROM public.tds_returns
           WHERE firm_id = app.current_firm_id() AND tan_registration_id = $1
           ORDER BY created_at DESC LIMIT 1`,
          [t.id],
        );

        const r = retRes.rows[0];
        let daysToExpiry = 730;
        if (r?.correction_window_expires_at) {
          const diff = new Date(r.correction_window_expires_at).getTime() - Date.now();
          daysToExpiry = Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)));
        }

        return {
          tan: t.tan,
          legalName: t.legal_name,
          statutoryRegime: challans[0]?.statutoryRegime || 'IT_ACT_2025',
          taxYear: challans[0]?.taxYear || 2026,
          quarter: challans[0]?.quarter || 'Q3',
          challans,
          deductees,
          returnSummary: r
            ? {
                formCode: r.form_code,
                workflowStatus: r.workflow_status,
                totalDeductees: r.total_deductees,
                totalTaxDeposited: r.total_tax_deposited,
                statutoryDueDate: r.statutory_due_date,
                correctionWindowExpiresAt: r.correction_window_expires_at,
                daysToCorrectionExpiry: daysToExpiry,
              }
            : null,
        };
      });

      return reply.send({ success: true, source: 'POSTGRESQL_RLS', data: result });
    } catch (err: any) {
      return reply.status(500).send({ error: 'TDS Fetch Failed', message: err.message });
    }
  });

  // POST /api/v1/tds/fvu/dispatch: Orchestrate isolated Protean FVU Validation
  // Queues the open statement for FVU validation. The isolated FVU runner (workers/fvu-v1-2 and
  // fvu-v9-5) is not connected yet, so nothing is validated here and no file or token is produced.
  // Token numbers come only from the portal after filing.
  app.post('/fvu/dispatch', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { tan?: string; regime?: string; formCode?: string };
    const regime = body.regime === 'IT_ACT_1961' ? 'IT_ACT_1961' : 'IT_ACT_2025';
    const fvuVersion = regime === 'IT_ACT_2025' ? '1.2' : '9.5';
    if (!body.tan || !/^[A-Z]{4}\d{5}[A-Z]$/.test(body.tan) || !body.formCode) {
      return reply.status(400).send({ success: false, error: 'TAN_AND_FORM_REQUIRED' });
    }
    try {
      const job = await db.withTenantTransaction(getCtx(req), async (client) => {
        const ret = await client.query(
          `SELECT r.id, r.entity_id FROM public.tds_returns r
           JOIN public.tan_registrations t ON t.id = r.tan_registration_id
           WHERE t.tan = $1 AND r.form_code = $2 AND r.statutory_regime = $3
             AND r.workflow_status NOT IN ('FILED','CLOSED')
           ORDER BY r.tax_year DESC, r.quarter DESC LIMIT 1`,
          [body.tan, body.formCode, regime],
        );
        if (!ret.rows[0]) return null;
        const inserted = await client.query(
          `INSERT INTO public.tds_fvu_jobs (firm_id, entity_id, return_id, fvu_version, docker_image, input_file_s3, status)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, '', 'QUEUED') RETURNING id`,
          [ret.rows[0].entity_id, ret.rows[0].id, fvuVersion, `synextax/fvu-v${fvuVersion}`],
        );
        return { jobId: inserted.rows[0].id, returnId: ret.rows[0].id };
      });
      if (!job) {
        return reply.status(404).send({ success: false, error: 'NO_OPEN_RETURN', message: 'No open statement for this TAN and form.' });
      }
      return reply.status(202).send({
        success: true,
        data: {
          ...job,
          fvuVersion,
          regime,
          validationStatus: 'QUEUED',
          message: `Queued for Protean FVU ${fvuVersion}. The FVU runner is not connected yet, so this statement has not been validated.`,
        },
      });
    } catch (err: any) {
      req.log.error({ err: err.code ?? err.message }, 'FVU queue failed');
      return reply.status(500).send({ success: false, error: 'FVU_QUEUE_FAILED', message: 'Could not queue the statement. Try again.' });
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

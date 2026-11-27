import Decimal from 'decimal.js';

export type PurchaseInputType = 'INPUT_GOODS' | 'INPUT_SERVICES' | 'CAPITAL_GOODS';

const CAPITAL_GOODS_HINTS = /\b(machinery|machine|lathe|loom|equipment|plant|capital\s*goods|generator|forklift|computer|laptop|server|furniture)\b/i;

/**
 * Infers GST ITC bucket for Purchase Register rows:
 *   - 99xxxx SAC codes -> INPUT_SERVICES
 *   - Explicit capital goods flag or machinery/plant hints -> CAPITAL_GOODS
 *   - Otherwise HSN -> INPUT_GOODS
 */
export function classifyInputType(params: {
  hsnOrSac?: string | null;
  isCapitalGoods?: boolean;
  description?: string | null;
}): PurchaseInputType {
  if (params.isCapitalGoods) return 'CAPITAL_GOODS';
  const code = (params.hsnOrSac ?? '').replace(/\D/g, '');
  if (code.startsWith('99')) return 'INPUT_SERVICES';
  if (CAPITAL_GOODS_HINTS.test(params.description ?? '')) return 'CAPITAL_GOODS';
  return 'INPUT_GOODS';
}

export interface RefundPurchaseLine {
  id: string;
  vendorGstin: string;
  invoiceNum: string;
  invoiceDate: string; // YYYY-MM-DD
  hsnSacCode?: string | null;
  description?: string | null;
  inputType?: PurchaseInputType | null;
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  reconStatus: string;
  itcEligibility: string;
}

export interface RefundRiskInput {
  gstin: string;
  periodFrom: string; // YYYY-MM
  periodTo: string;   // YYYY-MM
  today: string;      // YYYY-MM-DD
  lutArn?: string | null;
  lutValidTo?: string | null; // YYYY-MM-DD
  gstr1OutwardTax: string;
  gstr3bOutwardTax: string;
  gstr2bAvailableItc: string;
  gstr3bClaimedItc: string;
  purchases: RefundPurchaseLine[];
}

export interface RefundBlockedRow {
  id: string;
  vendorGstin: string;
  invoiceNum: string;
  invoiceDate: string;
  inputType: PurchaseInputType;
  taxAmount: string;
  reason: string;
}

const MATCHED_RECON_STATUSES = new Set(['EXACT_MATCH', 'FUZZY_MATCH', 'MANUAL_MATCH']);
const SERVICE_REFUND_EFFECTIVE_DATE = '2026-11-01';

/**
 * Computes Inverted Duty / Export Refund Workpaper and Automated 90% Provisional Refund Risk Check:
 *   1. Isolates Input Services availed before 2026-11-01 (excluded) vs >= 2026-11-01 (eligible).
 *   2. Blocks unmatched / mismatched 2B purchase invoices from entering refund claims.
 *   3. Verifies LUT validity and GSTR-1 / 2B / 3B consistency before 90% provisional sanction.
 */
export function computeInvertedDutyRefundWorkpaper(input: RefundRiskInput) {
  let inputGoodsEligibleItc = new Decimal(0);
  let postNov1ServicesEligibleItc = new Decimal(0);
  let preNov1ServicesExcludedItc = new Decimal(0);
  let capitalGoodsExcludedItc = new Decimal(0);
  let blockedUnmatchedItc = new Decimal(0);

  const blockedRows: RefundBlockedRow[] = [];

  for (const row of input.purchases) {
    const inferredType =
      row.inputType ?? classifyInputType({ hsnOrSac: row.hsnSacCode, description: row.description });
    const totalTax = new Decimal(row.igstAmount || 0).plus(row.cgstAmount || 0).plus(row.sgstAmount || 0);

    if (row.itcEligibility && row.itcEligibility !== 'ELIGIBLE') {
      blockedRows.push({
        id: row.id,
        vendorGstin: row.vendorGstin,
        invoiceNum: row.invoiceNum,
        invoiceDate: row.invoiceDate,
        inputType: inferredType,
        taxAmount: totalTax.toFixed(2),
        reason: `Ineligible ITC category (${row.itcEligibility})`,
      });
      continue;
    }

    if (!MATCHED_RECON_STATUSES.has(row.reconStatus)) {
      blockedUnmatchedItc = blockedUnmatchedItc.plus(totalTax);
      blockedRows.push({
        id: row.id,
        vendorGstin: row.vendorGstin,
        invoiceNum: row.invoiceNum,
        invoiceDate: row.invoiceDate,
        inputType: inferredType,
        taxAmount: totalTax.toFixed(2),
        reason: `Blocked from refund: ${row.reconStatus} (not matched in GSTR-2B)`,
      });
      continue;
    }

    if (inferredType === 'CAPITAL_GOODS') {
      capitalGoodsExcludedItc = capitalGoodsExcludedItc.plus(totalTax);
    } else if (inferredType === 'INPUT_SERVICES') {
      if (row.invoiceDate >= SERVICE_REFUND_EFFECTIVE_DATE) {
        postNov1ServicesEligibleItc = postNov1ServicesEligibleItc.plus(totalTax);
      } else {
        preNov1ServicesExcludedItc = preNov1ServicesExcludedItc.plus(totalTax);
      }
    } else {
      inputGoodsEligibleItc = inputGoodsEligibleItc.plus(totalTax);
    }
  }

  const eligibleRefundPoolItc = inputGoodsEligibleItc.plus(postNov1ServicesEligibleItc);
  const provisional90PercentCap = eligibleRefundPoolItc.mul('0.90');

  const outDiff = new Decimal(input.gstr1OutwardTax || 0).sub(input.gstr3bOutwardTax || 0).abs();
  const itcDiff = new Decimal(input.gstr3bClaimedItc || 0).sub(input.gstr2bAvailableItc || 0);
  const lutExpired = Boolean(input.lutValidTo && input.lutValidTo < input.today);
  const lutMissing = !input.lutArn;

  const riskFlags: Array<{ code: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; message: string }> = [];
  if (blockedRows.length > 0) {
    riskFlags.push({
      code: 'UNMATCHED_2B_BLOCKED',
      severity: 'HIGH',
      message: `${blockedRows.length} unmatched or mismatched 2B invoice(s) totaling INR ${blockedUnmatchedItc.toFixed(2)} blocked from refund claim.`,
    });
  }
  if (outDiff.gt(1)) {
    riskFlags.push({
      code: 'GSTR1_3B_OUTWARD_MISMATCH',
      severity: 'HIGH',
      message: `Outward tax variance between GSTR-1 and GSTR-3B (INR ${outDiff.toFixed(2)}) triggers automated refund risk hold.`,
    });
  }
  if (itcDiff.gt(1)) {
    riskFlags.push({
      code: 'GSTR3B_EXCEEDS_2B_ITC',
      severity: 'HIGH',
      message: `GSTR-3B ITC claimed exceeds GSTR-2B credit by INR ${itcDiff.toFixed(2)}.`,
    });
  }
  if (lutMissing || lutExpired) {
    riskFlags.push({
      code: lutExpired ? 'LUT_EXPIRED' : 'LUT_MISSING',
      severity: 'MEDIUM',
      message: lutExpired
        ? `LUT ${input.lutArn ?? ''} expired on ${input.lutValidTo}; renew RFD-11 before filing zero-rated refund.`
        : 'Active LUT (Form RFD-11) not recorded for export / zero-rated refund.',
    });
  }

  const provisionalSanctionEligible = !riskFlags.some((f) => f.severity === 'HIGH') && eligibleRefundPoolItc.gt(0);

  return {
    gstin: input.gstin,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    effectiveServiceCutover: SERVICE_REFUND_EFFECTIVE_DATE,
    lutStatus: {
      lutArn: input.lutArn ?? null,
      lutValidTo: input.lutValidTo ?? null,
      status: lutMissing ? 'MISSING' : lutExpired ? 'EXPIRED' : 'ACTIVE',
    },
    breakdown: {
      inputGoodsEligibleItc: inputGoodsEligibleItc.toFixed(2),
      postNov1ServicesEligibleItc: postNov1ServicesEligibleItc.toFixed(2),
      preNov1ServicesExcludedItc: preNov1ServicesExcludedItc.toFixed(2),
      capitalGoodsExcludedItc: capitalGoodsExcludedItc.toFixed(2),
      blockedUnmatchedItc: blockedUnmatchedItc.toFixed(2),
      totalEligibleRefundPool: eligibleRefundPoolItc.toFixed(2),
      provisional90PercentRefund: provisional90PercentCap.toFixed(2),
    },
    crossReturnCheck: {
      gstr1OutwardTax: new Decimal(input.gstr1OutwardTax || 0).toFixed(2),
      gstr3bOutwardTax: new Decimal(input.gstr3bOutwardTax || 0).toFixed(2),
      outwardVariance: outDiff.toFixed(2),
      gstr2bAvailableItc: new Decimal(input.gstr2bAvailableItc || 0).toFixed(2),
      gstr3bClaimedItc: new Decimal(input.gstr3bClaimedItc || 0).toFixed(2),
      itcVariance: itcDiff.toFixed(2),
    },
    provisionalSanctionEligible,
    riskFlags,
    blockedRows,
  };
}

import { Decimal } from 'decimal.js';

export interface TaxBucket {
  igst: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  cess: Decimal;
}

export interface SetOffInput {
  liability: {
    outward: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
      cess: Decimal | string | number;
    };
    rcm: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
      cess: Decimal | string | number;
    };
    interest?: Decimal | string | number;
    lateFee?: Decimal | string | number;
  };
  itcAvailable: {
    igst: Decimal | string | number;
    cgst: Decimal | string | number;
    sgst: Decimal | string | number;
    cess: Decimal | string | number;
  };
  turnover: {
    domesticTaxable: Decimal | string | number;
    exportOrZeroRated?: Decimal | string | number;
    exemptOrNilRated?: Decimal | string | number;
  };
  rule86bExemptions?: {
    itPaid1LakhLast2Fy?: boolean;
    refund1LakhPrevFy?: boolean;
    cumulativeCash1PctMet?: boolean;
    isGovernmentOrPsu?: boolean;
  };
  advisory643Ledgers?: {
    reclaimLedgerClosing: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
    };
    rcmLedgerClosing: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
    };
    table4b2Reversed: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
    };
    table4d1Reclaimed: {
      igst: Decimal | string | number;
      cgst: Decimal | string | number;
      sgst: Decimal | string | number;
    };
  };
}

export interface SetOffResult {
  itcUtilization: {
    igstAgainstIgst: Decimal;
    igstAgainstCgst: Decimal;
    igstAgainstSgst: Decimal;
    cgstAgainstCgst: Decimal;
    sgstAgainstSgst: Decimal;
    cessAgainstCess: Decimal;
    totalItcUtilized: Decimal;
  };
  cashPayable: {
    outward: TaxBucket;
    rcm: TaxBucket;
    interest: Decimal;
    lateFee: Decimal;
    totalCashPayable: Decimal;
  };
  remainingItc: TaxBucket;
  rule86bApplied: boolean;
  rule86bMaxItcCap?: Decimal;
  advisory643Validation: {
    isValid: boolean;
    errors: string[];
  };
}

export class GstItcSetOffEngine {
  public static compute(input: SetOffInput): SetOffResult {
    // 1. Convert all inputs to Decimal
    const outLiab: TaxBucket = {
      igst: new Decimal(input.liability.outward.igst || 0),
      cgst: new Decimal(input.liability.outward.cgst || 0),
      sgst: new Decimal(input.liability.outward.sgst || 0),
      cess: new Decimal(input.liability.outward.cess || 0),
    };

    const rcmLiab: TaxBucket = {
      igst: new Decimal(input.liability.rcm.igst || 0),
      cgst: new Decimal(input.liability.rcm.cgst || 0),
      sgst: new Decimal(input.liability.rcm.sgst || 0),
      cess: new Decimal(input.liability.rcm.cess || 0),
    };

    const interest = new Decimal(input.liability.interest || 0);
    const lateFee = new Decimal(input.liability.lateFee || 0);

    const itc: TaxBucket = {
      igst: new Decimal(input.itcAvailable.igst || 0),
      cgst: new Decimal(input.itcAvailable.cgst || 0),
      sgst: new Decimal(input.itcAvailable.sgst || 0),
      cess: new Decimal(input.itcAvailable.cess || 0),
    };

    const totalOutwardLiab = outLiab.igst.plus(outLiab.cgst).plus(outLiab.sgst);

    // 2. Rule 86B Check (1% Cash Payment Rule)
    const domesticTaxableTurnover = new Decimal(input.turnover.domesticTaxable || 0);
    const isTurnoverAbove50Lakhs = domesticTaxableTurnover.greaterThan(5000000);
    const isExempt =
      Boolean(input.rule86bExemptions?.itPaid1LakhLast2Fy) ||
      Boolean(input.rule86bExemptions?.refund1LakhPrevFy) ||
      Boolean(input.rule86bExemptions?.cumulativeCash1PctMet) ||
      Boolean(input.rule86bExemptions?.isGovernmentOrPsu);

    const rule86bApplied = isTurnoverAbove50Lakhs && !isExempt;
    // Under Rule 86B, maximum ITC utilization cannot exceed 99% of outward liability
    const maxItcAllowedUnder86B = rule86bApplied ? totalOutwardLiab.times(0.99) : totalOutwardLiab;

    // Working copies for set-off
    let remIgstLiab = new Decimal(outLiab.igst);
    let remCgstLiab = new Decimal(outLiab.cgst);
    let remSgstLiab = new Decimal(outLiab.sgst);
    let remCessLiab = new Decimal(outLiab.cess);

    let remIgstItc = new Decimal(itc.igst);
    let remCgstItc = new Decimal(itc.cgst);
    let remSgstItc = new Decimal(itc.sgst);
    let remCessItc = new Decimal(itc.cess);

    // 3. Section 49A/49B & Rule 88A ITC Set-Off Execution

    // Step A: Exhaust IGST ITC against IGST liability 100%
    const igstAgainstIgst = Decimal.min(remIgstItc, remIgstLiab);
    remIgstLiab = remIgstLiab.minus(igstAgainstIgst);
    remIgstItc = remIgstItc.minus(igstAgainstIgst);

    // Step B: Optimal split of remaining IGST ITC across CGST and SGST liabilities
    let igstAgainstCgst = new Decimal(0);
    let igstAgainstSgst = new Decimal(0);

    if (remIgstItc.greaterThan(0)) {
      // Phase B.1: Cover deficits (uncovered liability after native credit) first to prevent cash outflow
      const uncoveredCgst = Decimal.max(0, remCgstLiab.minus(remCgstItc));
      const uncoveredSgst = Decimal.max(0, remSgstLiab.minus(remSgstItc));

      // Prioritize the side with larger deficit
      if (uncoveredCgst.greaterThanOrEqualTo(uncoveredSgst)) {
        const toCgst = Decimal.min(remIgstItc, uncoveredCgst, remCgstLiab);
        igstAgainstCgst = igstAgainstCgst.plus(toCgst);
        remIgstItc = remIgstItc.minus(toCgst);
        remCgstLiab = remCgstLiab.minus(toCgst);

        const toSgst = Decimal.min(remIgstItc, uncoveredSgst, remSgstLiab);
        igstAgainstSgst = igstAgainstSgst.plus(toSgst);
        remIgstItc = remIgstItc.minus(toSgst);
        remSgstLiab = remSgstLiab.minus(toSgst);
      } else {
        const toSgst = Decimal.min(remIgstItc, uncoveredSgst, remSgstLiab);
        igstAgainstSgst = igstAgainstSgst.plus(toSgst);
        remIgstItc = remIgstItc.minus(toSgst);
        remSgstLiab = remSgstLiab.minus(toSgst);

        const toCgst = Decimal.min(remIgstItc, uncoveredCgst, remCgstLiab);
        igstAgainstCgst = igstAgainstCgst.plus(toCgst);
        remIgstItc = remIgstItc.minus(toCgst);
        remCgstLiab = remCgstLiab.minus(toCgst);
      }

      // Phase B.2: If surplus IGST ITC remains after deficits are eliminated, split equally
      if (remIgstItc.greaterThan(0)) {
        const half = remIgstItc.dividedBy(2);
        const addCgst = Decimal.min(half, remCgstLiab);
        igstAgainstCgst = igstAgainstCgst.plus(addCgst);
        remIgstItc = remIgstItc.minus(addCgst);
        remCgstLiab = remCgstLiab.minus(addCgst);

        const addSgst = Decimal.min(remIgstItc, remSgstLiab);
        igstAgainstSgst = igstAgainstSgst.plus(addSgst);
        remIgstItc = remIgstItc.minus(addSgst);
        remSgstLiab = remSgstLiab.minus(addSgst);

        // If any remaining after filling SGST up to its liability, give remainder to CGST if it still has liability
        if (remIgstItc.greaterThan(0) && remCgstLiab.greaterThan(0)) {
          const finalCgst = Decimal.min(remIgstItc, remCgstLiab);
          igstAgainstCgst = igstAgainstCgst.plus(finalCgst);
          remIgstItc = remIgstItc.minus(finalCgst);
          remCgstLiab = remCgstLiab.minus(finalCgst);
        }
      }
    }

    // Step C: Utilize CGST ITC against CGST liability (strictly zero against SGST)
    const cgstAgainstCgst = Decimal.min(remCgstItc, remCgstLiab);
    remCgstLiab = remCgstLiab.minus(cgstAgainstCgst);
    remCgstItc = remCgstItc.minus(cgstAgainstCgst);

    // Step D: Utilize SGST ITC against SGST liability (strictly zero against CGST)
    const sgstAgainstSgst = Decimal.min(remSgstItc, remSgstLiab);
    remSgstLiab = remSgstLiab.minus(sgstAgainstSgst);
    remSgstItc = remSgstItc.minus(sgstAgainstSgst);

    // Step E: Cess ITC against Cess liability
    const cessAgainstCess = Decimal.min(remCessItc, remCessLiab);
    remCessLiab = remCessLiab.minus(cessAgainstCess);
    remCessItc = remCessItc.minus(cessAgainstCess);

    let totalItcUtilized = igstAgainstIgst
      .plus(igstAgainstCgst)
      .plus(igstAgainstSgst)
      .plus(cgstAgainstCgst)
      .plus(sgstAgainstSgst);

    // Check Rule 86B Cap
    if (rule86bApplied && totalItcUtilized.greaterThan(maxItcAllowedUnder86B)) {
      // Force cash payment of at least 1%
      const excessItc = totalItcUtilized.minus(maxItcAllowedUnder86B);
      // Reduce CGST/SGST ITC utilization by excess
      totalItcUtilized = maxItcAllowedUnder86B;
      remCgstLiab = remCgstLiab.plus(excessItc.dividedBy(2));
      remSgstLiab = remSgstLiab.plus(excessItc.dividedBy(2));
    }

    // 4. Advisory 643 Pre-Filing Ledger Validations
    const ledgerErrors: string[] = [];
    if (input.advisory643Ledgers) {
      const adv = input.advisory643Ledgers;
      // Check Reclaim Ledger: Table 4(D)(1) reclaim <= (reclaim_closing + Table 4(B)(2) reversed)
      const allowedReclaimIgst = new Decimal(adv.reclaimLedgerClosing.igst).plus(adv.table4b2Reversed.igst);
      const allowedReclaimCgst = new Decimal(adv.reclaimLedgerClosing.cgst).plus(adv.table4b2Reversed.cgst);
      const allowedReclaimSgst = new Decimal(adv.reclaimLedgerClosing.sgst).plus(adv.table4b2Reversed.sgst);

      if (new Decimal(adv.table4d1Reclaimed.igst).greaterThan(allowedReclaimIgst)) {
        ledgerErrors.push(
          `Advisory 643 Violation: Table 4(D)(1) IGST reclaim (${adv.table4d1Reclaimed.igst}) exceeds allowed limit (${allowedReclaimIgst}).`
        );
      }
      if (new Decimal(adv.table4d1Reclaimed.cgst).greaterThan(allowedReclaimCgst)) {
        ledgerErrors.push(
          `Advisory 643 Violation: Table 4(D)(1) CGST reclaim (${adv.table4d1Reclaimed.cgst}) exceeds allowed limit (${allowedReclaimCgst}).`
        );
      }
      if (new Decimal(adv.table4d1Reclaimed.sgst).greaterThan(allowedReclaimSgst)) {
        ledgerErrors.push(
          `Advisory 643 Violation: Table 4(D)(1) SGST reclaim (${adv.table4d1Reclaimed.sgst}) exceeds allowed limit (${allowedReclaimSgst}).`
        );
      }
    }

    // 5. Total Cash Payable: Outward balance + 100% RCM + Interest + Late Fees
    const totalCashPayable = remIgstLiab
      .plus(remCgstLiab)
      .plus(remSgstLiab)
      .plus(remCessLiab)
      .plus(rcmLiab.igst)
      .plus(rcmLiab.cgst)
      .plus(rcmLiab.sgst)
      .plus(rcmLiab.cess)
      .plus(interest)
      .plus(lateFee);

    return {
      itcUtilization: {
        igstAgainstIgst,
        igstAgainstCgst,
        igstAgainstSgst,
        cgstAgainstCgst,
        sgstAgainstSgst,
        cessAgainstCess,
        totalItcUtilized,
      },
      cashPayable: {
        outward: {
          igst: remIgstLiab,
          cgst: remCgstLiab,
          sgst: remSgstLiab,
          cess: remCessLiab,
        },
        rcm: rcmLiab,
        interest,
        lateFee,
        totalCashPayable,
      },
      remainingItc: {
        igst: remIgstItc,
        cgst: remCgstItc,
        sgst: remSgstItc,
        cess: remCessItc,
      },
      rule86bApplied,
      rule86bMaxItcCap: rule86bApplied ? maxItcAllowedUnder86B : undefined,
      advisory643Validation: {
        isValid: ledgerErrors.length === 0,
        errors: ledgerErrors,
      },
    };
  }
}

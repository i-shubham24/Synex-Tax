import Decimal from 'decimal.js';

export interface TaxSplit {
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess?: string;
}

export interface Gstr9OutwardInput {
  b2b?: TaxSplit;
  b2cLarge?: TaxSplit;
  b2cSmall?: TaxSplit;
  exportsWithTax?: TaxSplit;
  exportsWithoutTax?: { taxableValue: string };
  sezWithTax?: TaxSplit;
  sezWithoutTax?: { taxableValue: string };
  deemedExports?: TaxSplit;
  advancesReceived?: TaxSplit;
  creditNotesTaxable?: TaxSplit;
  debitNotesTaxable?: TaxSplit;
  exemptNilNonGst?: {
    exempt: string;
    nilRated: string;
    nonGst: string;
  };
  reverseChargeInwardTaxable?: TaxSplit;
}

export interface Gstr9ItcInput {
  gstr3bTotalItcAvailed: TaxSplit;
  inputsFraction?: number; /* default 0.70 */
  capitalGoodsFraction?: number; /* default 0.15 */
  inputServicesFraction?: number; /* default 0.15 */
  rcmRegistered?: TaxSplit;
  rcmUnregistered?: TaxSplit;
  importOfGoods?: TaxSplit;
  importOfServices?: TaxSplit;
  isdCredit?: TaxSplit;
  reversedRule37?: TaxSplit;
  reversedRule42?: TaxSplit;
  reversedRule43?: TaxSplit;
  reversedSection17_5?: TaxSplit;
  otherReversals?: TaxSplit;
  itcAsPer2b: TaxSplit;
  itcNextYearAvailed?: TaxSplit;
}

export interface Gstr9cBooksInput {
  auditedGrossTurnover: string;
  unbilledRevenueAtYearEnd?: string;
  unbilledRevenueAtBeginning?: string;
  advancesAdjustedAtYearEnd?: string;
  advancesReceivedAtBeginning?: string;
  tradeDiscountsNotAllowedInGst?: string;
  otherTurnoverAdjustments?: string;
  exemptTurnoverInBooks?: string;
  zeroRatedTurnoverInBooks?: string;
  rcmOutwardTurnoverInBooks?: string;
  auditedBooksTotalItc: string;
  auditedBooksEligibleItc: string;
}

export interface Gstr9EngineInput {
  financialYear: string;
  gstin: string;
  legalName: string;
  tradeName?: string;
  outward: Gstr9OutwardInput;
  itc: Gstr9ItcInput;
  books?: Gstr9cBooksInput;
}

export interface Gstr9Table4Output {
  b2b: TaxSplit;
  b2c: TaxSplit;
  exports: TaxSplit;
  sez: TaxSplit;
  deemedExports: TaxSplit;
  advances: TaxSplit;
  inwardRcm: TaxSplit;
  creditNotes: TaxSplit;
  debitNotes: TaxSplit;
  subTotalTaxableOutward: TaxSplit;
}

export interface Gstr9Table5Output {
  zeroRatedWithoutTax: string;
  sezWithoutTax: string;
  exempt: string;
  nilRated: string;
  nonGst: string;
  subTotalNonTaxable: string;
  totalTurnoverTable4And5: string;
}

export interface Gstr9Table6Output {
  total3bAvailed: TaxSplit;
  inputs: TaxSplit;
  capitalGoods: TaxSplit;
  inputServices: TaxSplit;
  rcmRegistered: TaxSplit;
  rcmUnregistered: TaxSplit;
  importGoods: TaxSplit;
  importServices: TaxSplit;
  isd: TaxSplit;
  totalAvailedTable6: TaxSplit;
}

export interface Gstr9Table7Output {
  rule37: TaxSplit;
  rule42: TaxSplit;
  rule43: TaxSplit;
  section17_5: TaxSplit;
  other: TaxSplit;
  totalReversed: TaxSplit;
  netItcAvailable: TaxSplit;
}

export interface Gstr9Table8Output {
  itcAsPer2bTable8A: TaxSplit;
  itcDeclaredTable8B: TaxSplit;
  itcAvailedNextFyTable8C: TaxSplit;
  difference8D: TaxSplit;
  isCreditExcessClaimed: boolean;
  lapsedItcEligible8E: TaxSplit;
}

export interface Gstr9cReconciliationOutput {
  grossTurnover: {
    auditedTurnover: string;
    additions: string;
    subtractions: string;
    reconciledTurnover: string;
    gstr9Turnover: string;
    unreconciledDifference: string;
    isBalanced: boolean;
  };
  taxableTurnover: {
    reconciledTaxableTurnover: string;
    gstr9TaxableTurnover: string;
    unreconciledTaxableDifference: string;
  };
  itcReconciliation: {
    auditedBooksItc: string;
    gstr9NetItc: string;
    difference: string;
    isBalanced: boolean;
  };
  taxLiabilityDifference: TaxSplit;
}

export interface Gstr9EngineResult {
  financialYear: string;
  gstin: string;
  legalName: string;
  tradeName: string;
  gstr9: {
    table4: Gstr9Table4Output;
    table5: Gstr9Table5Output;
    table6: Gstr9Table6Output;
    table7: Gstr9Table7Output;
    table8: Gstr9Table8Output;
  };
  gstr9c?: Gstr9cReconciliationOutput;
  auditFlags: Array<{
    code: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    message: string;
    statutorySection: string;
  }>;
}

const D = (v: string | number | undefined | null) => new Decimal(v ?? 0);
const fmt = (d: Decimal) => d.toFixed(2);

function emptySplit(): TaxSplit {
  return { taxableValue: '0.00', igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' };
}

function addSplits(a: TaxSplit, b: TaxSplit): TaxSplit {
  return {
    taxableValue: fmt(D(a.taxableValue).add(D(b.taxableValue))),
    igst: fmt(D(a.igst).add(D(b.igst))),
    cgst: fmt(D(a.cgst).add(D(b.cgst))),
    sgst: fmt(D(a.sgst).add(D(b.sgst))),
    cess: fmt(D(a.cess).add(D(b.cess))),
  };
}

function subSplits(a: TaxSplit, b: TaxSplit): TaxSplit {
  return {
    taxableValue: fmt(D(a.taxableValue).sub(D(b.taxableValue))),
    igst: fmt(D(a.igst).sub(D(b.igst))),
    cgst: fmt(D(a.cgst).sub(D(b.cgst))),
    sgst: fmt(D(a.sgst).sub(D(b.sgst))),
    cess: fmt(D(a.cess).sub(D(b.cess))),
  };
}

function scaleSplit(s: TaxSplit, fraction: number): TaxSplit {
  return {
    taxableValue: fmt(D(s.taxableValue).mul(fraction)),
    igst: fmt(D(s.igst).mul(fraction)),
    cgst: fmt(D(s.cgst).mul(fraction)),
    sgst: fmt(D(s.sgst).mul(fraction)),
    cess: fmt(D(s.cess).mul(fraction)),
  };
}

export function computeGstr9AnnualReconciliation(input: Gstr9EngineInput): Gstr9EngineResult {
  const flags: Gstr9EngineResult['auditFlags'] = [];

  /* Table 4: Outward Taxable Supplies */
  const ow = input.outward;
  const b2b = ow.b2b ?? emptySplit();
  const b2c = addSplits(ow.b2cLarge ?? emptySplit(), ow.b2cSmall ?? emptySplit());
  const exports = ow.exportsWithTax ?? emptySplit();
  const sez = ow.sezWithTax ?? emptySplit();
  const deemed = ow.deemedExports ?? emptySplit();
  const adv = ow.advancesReceived ?? emptySplit();
  const rcmInward = ow.reverseChargeInwardTaxable ?? emptySplit();
  const cn = ow.creditNotesTaxable ?? emptySplit();
  const dn = ow.debitNotesTaxable ?? emptySplit();

  /* Base additions: 4A to 4G */
  let grossTaxable = addSplits(b2b, b2c);
  grossTaxable = addSplits(grossTaxable, exports);
  grossTaxable = addSplits(grossTaxable, sez);
  grossTaxable = addSplits(grossTaxable, deemed);
  grossTaxable = addSplits(grossTaxable, adv);
  grossTaxable = addSplits(grossTaxable, rcmInward);

  /* Adjustments: 4I (Credit notes), 4J (Debit notes) */
  const subTotalTable4 = addSplits(subSplits(grossTaxable, cn), dn);

  const table4: Gstr9Table4Output = {
    b2b,
    b2c,
    exports,
    sez,
    deemedExports: deemed,
    advances: adv,
    inwardRcm: rcmInward,
    creditNotes: cn,
    debitNotes: dn,
    subTotalTaxableOutward: subTotalTable4,
  };

  /* Table 5: Outward Supplies without tax / Exempt */
  const expWithout = D(ow.exportsWithoutTax?.taxableValue);
  const sezWithout = D(ow.sezWithoutTax?.taxableValue);
  const exempt = D(ow.exemptNilNonGst?.exempt);
  const nilRated = D(ow.exemptNilNonGst?.nilRated);
  const nonGst = D(ow.exemptNilNonGst?.nonGst);
  const subTotalTable5Dec = expWithout.add(sezWithout).add(exempt).add(nilRated).add(nonGst);
  const totalTurnoverDec = D(subTotalTable4.taxableValue).add(subTotalTable5Dec);

  const table5: Gstr9Table5Output = {
    zeroRatedWithoutTax: fmt(expWithout),
    sezWithoutTax: fmt(sezWithout),
    exempt: fmt(exempt),
    nilRated: fmt(nilRated),
    nonGst: fmt(nonGst),
    subTotalNonTaxable: fmt(subTotalTable5Dec),
    totalTurnoverTable4And5: fmt(totalTurnoverDec),
  };

  /* Table 6: ITC Availed */
  const itcIn = input.itc;
  const tot3b = itcIn.gstr3bTotalItcAvailed;
  const fInputs = itcIn.inputsFraction ?? 0.70;
  const fCap = itcIn.capitalGoodsFraction ?? 0.15;
  const fServ = itcIn.inputServicesFraction ?? 0.15;

  const inputsItc = scaleSplit(tot3b, fInputs);
  const capGoodsItc = scaleSplit(tot3b, fCap);
  const servicesItc = scaleSplit(tot3b, fServ);
  const rcmReg = itcIn.rcmRegistered ?? emptySplit();
  const rcmUnreg = itcIn.rcmUnregistered ?? emptySplit();
  const impGoods = itcIn.importOfGoods ?? emptySplit();
  const impServ = itcIn.importOfServices ?? emptySplit();
  const isd = itcIn.isdCredit ?? emptySplit();

  let tot6 = addSplits(inputsItc, capGoodsItc);
  tot6 = addSplits(tot6, servicesItc);
  tot6 = addSplits(tot6, rcmReg);
  tot6 = addSplits(tot6, rcmUnreg);
  tot6 = addSplits(tot6, impGoods);
  tot6 = addSplits(tot6, impServ);
  tot6 = addSplits(tot6, isd);

  const table6: Gstr9Table6Output = {
    total3bAvailed: tot3b,
    inputs: inputsItc,
    capitalGoods: capGoodsItc,
    inputServices: servicesItc,
    rcmRegistered: rcmReg,
    rcmUnregistered: rcmUnreg,
    importGoods: impGoods,
    importServices: impServ,
    isd,
    totalAvailedTable6: tot6,
  };

  /* Table 7: ITC Reversals */
  const r37 = itcIn.reversedRule37 ?? emptySplit();
  const r42 = itcIn.reversedRule42 ?? emptySplit();
  const r43 = itcIn.reversedRule43 ?? emptySplit();
  const s17_5 = itcIn.reversedSection17_5 ?? emptySplit();
  const othRev = itcIn.otherReversals ?? emptySplit();

  let totRev = addSplits(r37, r42);
  totRev = addSplits(totRev, r43);
  totRev = addSplits(totRev, s17_5);
  totRev = addSplits(totRev, othRev);

  const netItc = subSplits(tot3b, totRev);

  const table7: Gstr9Table7Output = {
    rule37: r37,
    rule42: r42,
    rule43: r43,
    section17_5: s17_5,
    other: othRev,
    totalReversed: totRev,
    netItcAvailable: netItc,
  };

  /* Table 8: ITC Reconciliation (2B vs 3B) */
  const itc2b = itcIn.itcAsPer2b;
  const itc8B = addSplits(inputsItc, servicesItc); /* Table 8B: Inputs and input services from 6B */
  const itc8C = itcIn.itcNextYearAvailed ?? emptySplit();
  const eligibleAvailed = addSplits(itc8B, itc8C);
  const diff8D = subSplits(itc2b, eligibleAvailed);

  const isExcessClaim = D(diff8D.igst).lt(0) || D(diff8D.cgst).lt(0) || D(diff8D.sgst).lt(0);
  const lapsedEligible: TaxSplit = {
    taxableValue: '0.00',
    igst: D(diff8D.igst).gt(0) ? diff8D.igst : '0.00',
    cgst: D(diff8D.cgst).gt(0) ? diff8D.cgst : '0.00',
    sgst: D(diff8D.sgst).gt(0) ? diff8D.sgst : '0.00',
    cess: D(diff8D.cess).gt(0) ? (diff8D.cess ?? '0.00') : '0.00',
  };

  if (isExcessClaim) {
    flags.push({
      code: 'GSTR9_ITC_8D_EXCESS',
      severity: 'CRITICAL',
      message: 'Table 8D indicates ITC claimed in GSTR-3B exceeds available ITC in GSTR-2B. Ineligible credit requires reversal via DRC-03 with Section 50(3) interest.',
      statutorySection: 'Section 16(2)(aa) & Rule 88B(3)',
    });
  }

  const table8: Gstr9Table8Output = {
    itcAsPer2bTable8A: itc2b,
    itcDeclaredTable8B: itc8B,
    itcAvailedNextFyTable8C: itc8C,
    difference8D: diff8D,
    isCreditExcessClaimed: isExcessClaim,
    lapsedItcEligible8E: lapsedEligible,
  };

  /* GSTR-9C Reconciliation (If Books provided) */
  let gstr9c: Gstr9cReconciliationOutput | undefined;
  if (input.books) {
    const b = input.books;
    const auditedTurnover = D(b.auditedGrossTurnover);
    const unbilledEnd = D(b.unbilledRevenueAtYearEnd);
    const unbilledBeg = D(b.unbilledRevenueAtBeginning);
    const advEnd = D(b.advancesAdjustedAtYearEnd);
    const advBeg = D(b.advancesReceivedAtBeginning);
    const tradeDisc = D(b.tradeDiscountsNotAllowedInGst);
    const otherAdj = D(b.otherTurnoverAdjustments);

    const additions = unbilledEnd.add(advBeg).add(tradeDisc).add(otherAdj);
    const subtractions = unbilledBeg.add(advEnd);
    const reconciledTurnoverDec = auditedTurnover.add(additions).sub(subtractions);
    const gstr9TurnoverDec = totalTurnoverDec;
    const unreconciledTurnoverDiff = reconciledTurnoverDec.sub(gstr9TurnoverDec);
    const isTurnoverBalanced = unreconciledTurnoverDiff.abs().lte(1.0);

    if (!isTurnoverBalanced) {
      flags.push({
        code: 'GSTR9C_TURNOVER_MISMATCH',
        severity: 'WARNING',
        message: `Audited turnover adjusted (INR ${fmt(reconciledTurnoverDec)}) differs from GSTR-9 declared turnover (INR ${fmt(gstr9TurnoverDec)}) by INR ${fmt(unreconciledTurnoverDiff)}. Auditor reconciliation remark required in Table 6.`,
        statutorySection: 'Section 44(2) & Rule 80(3)',
      });
    }

    /* Taxable turnover reconciliation */
    const exemptBooks = D(b.exemptTurnoverInBooks);
    const zeroRatedBooks = D(b.zeroRatedTurnoverInBooks);
    const rcmOutwardBooks = D(b.rcmOutwardTurnoverInBooks);
    const nonTaxableDeductions = exemptBooks.add(zeroRatedBooks).add(rcmOutwardBooks);
    const reconciledTaxableTurnover = reconciledTurnoverDec.sub(nonTaxableDeductions);
    const gstr9Taxable = D(subTotalTable4.taxableValue);
    const unreconciledTaxableDiff = reconciledTaxableTurnover.sub(gstr9Taxable);

    /* ITC Reconciliation */
    const booksItc = D(b.auditedBooksEligibleItc);
    const gstr9NetItcTotal = D(netItc.igst).add(D(netItc.cgst)).add(D(netItc.sgst));
    const itcDiff = booksItc.sub(gstr9NetItcTotal);
    const isItcBalanced = itcDiff.abs().lte(1.0);

    if (!isItcBalanced) {
      flags.push({
        code: 'GSTR9C_ITC_MISMATCH',
        severity: 'WARNING',
        message: `Eligible ITC in audited accounts (INR ${fmt(booksItc)}) does not match net ITC declared in GSTR-9 (INR ${fmt(gstr9NetItcTotal)}). Difference: INR ${fmt(itcDiff)}.`,
        statutorySection: 'Section 44(2) & GSTR-9C Table 14',
      });
    }

    gstr9c = {
      grossTurnover: {
        auditedTurnover: fmt(auditedTurnover),
        additions: fmt(additions),
        subtractions: fmt(subtractions),
        reconciledTurnover: fmt(reconciledTurnoverDec),
        gstr9Turnover: fmt(gstr9TurnoverDec),
        unreconciledDifference: fmt(unreconciledTurnoverDiff),
        isBalanced: isTurnoverBalanced,
      },
      taxableTurnover: {
        reconciledTaxableTurnover: fmt(reconciledTaxableTurnover),
        gstr9TaxableTurnover: fmt(gstr9Taxable),
        unreconciledTaxableDifference: fmt(unreconciledTaxableDiff),
      },
      itcReconciliation: {
        auditedBooksItc: fmt(booksItc),
        gstr9NetItc: fmt(gstr9NetItcTotal),
        difference: fmt(itcDiff),
        isBalanced: isItcBalanced,
      },
      taxLiabilityDifference: {
        taxableValue: fmt(unreconciledTaxableDiff),
        igst: '0.00',
        cgst: '0.00',
        sgst: '0.00',
        cess: '0.00',
      },
    };
  }

  return {
    financialYear: input.financialYear,
    gstin: input.gstin,
    legalName: input.legalName,
    tradeName: input.tradeName ?? input.legalName,
    gstr9: {
      table4,
      table5,
      table6,
      table7,
      table8,
    },
    gstr9c,
    auditFlags: flags,
  };
}

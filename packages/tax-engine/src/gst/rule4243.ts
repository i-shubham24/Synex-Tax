import Decimal from 'decimal.js';

/**
 * CGST Rules 42 and 43: Common Credit Attribution & Reversal Engine.
 * Zero-float arithmetic via Decimal.js; all monetary outputs serialized to fixed 2 decimals.
 */

export interface TaxAmounts {
  igst: string | number;
  cgst: string | number;
  sgst: string | number;
  cess?: string | number;
}

export type InputCreditUsage =
  | 'COMMON'
  | 'TAXABLE_ONLY'
  | 'EXEMPT_ONLY'
  | 'NON_BUSINESS'
  | 'BLOCKED_17_5';

export interface Rule42InputItem {
  itcType: 'INPUT' | 'INPUT_SERVICE' | string;
  usage: InputCreditUsage | string;
  igst: string | number;
  cgst: string | number;
  sgst: string | number;
  cess?: string | number;
}

export interface Rule43CapitalAsset {
  usage: 'COMMON' | 'TAXABLE_ONLY' | 'EXEMPT_ONLY' | 'NON_BUSINESS' | 'BLOCKED_17_5' | string;
  igstItc: string | number;
  cgstItc: string | number;
  sgstItc: string | number;
  cessItc?: string | number;
  usefulLifeMonths?: number;
}

export interface Rule4243ComputeInput {
  exemptTurnoverE: string | number;
  taxableTurnover: string | number;
  inputs: Rule42InputItem[];
  capitalGoods?: Rule43CapitalAsset[];
  includeNonBusinessD2?: boolean;
}

export interface FormattedTaxAmounts {
  igst: string;
  cgst: string;
  sgst: string;
  cess?: string;
}

export interface Rule42Result {
  T: FormattedTaxAmounts;
  T1: FormattedTaxAmounts;
  T2: FormattedTaxAmounts;
  T3: FormattedTaxAmounts;
  C1: FormattedTaxAmounts;
  T4: FormattedTaxAmounts;
  C2: FormattedTaxAmounts;
  D1: FormattedTaxAmounts;
  D2: FormattedTaxAmounts;
  C3: FormattedTaxAmounts;
  eligibleFromInputs: FormattedTaxAmounts;
}

export interface Rule43Result {
  Tr: FormattedTaxAmounts;
  Te: FormattedTaxAmounts;
}

export interface Rule4243Result {
  ratioEoverF: string;
  rule42: Rule42Result;
  rule43: Rule43Result;
  gstr3b4B1Rule42Reversal: FormattedTaxAmounts;
  gstr3b4B1Rule43Reversal: FormattedTaxAmounts;
}

type HeadsDecimal = { igst: Decimal; cgst: Decimal; sgst: Decimal };

const D = (v: string | number | undefined) => new Decimal(v || 0);
const zero = (): HeadsDecimal => ({ igst: new Decimal(0), cgst: new Decimal(0), sgst: new Decimal(0) });
const HEADS = ['igst', 'cgst', 'sgst'] as const;

const fmtHeads = (h: HeadsDecimal): FormattedTaxAmounts => ({
  igst: h.igst.toFixed(2),
  cgst: h.cgst.toFixed(2),
  sgst: h.sgst.toFixed(2),
});

export function computeRule42And43(input: Rule4243ComputeInput): Rule4243Result {
  const E = D(input.exemptTurnoverE);
  const F = E.add(D(input.taxableTurnover));
  const ratio = F.gt(0) ? E.div(F) : new Decimal(0);

  const isInputOrService = (itcType: string) =>
    itcType === 'INPUT' || itcType === 'INPUT_SERVICE';

  const sumBucket = (usageFilter?: string): HeadsDecimal => {
    const out = zero();
    for (const row of input.inputs) {
      if (!isInputOrService(row.itcType)) continue;
      if (usageFilter && row.usage !== usageFilter) continue;
      for (const h of HEADS) out[h] = out[h].add(D(row[h]));
    }
    return out;
  };

  const T = sumBucket();
  const T1 = sumBucket('NON_BUSINESS');
  const T2 = sumBucket('EXEMPT_ONLY');
  const T3 = sumBucket('BLOCKED_17_5');
  const T4 = sumBucket('TAXABLE_ONLY');

  const C1 = zero();
  const C2 = zero();
  const D1 = zero();
  const D2 = zero();
  const C3 = zero();
  const eligibleFromInputs = zero();
  const rule42Reversal4B1 = zero();

  for (const h of HEADS) {
    C1[h] = Decimal.max(0, T[h].sub(T1[h]).sub(T2[h]).sub(T3[h]));
    C2[h] = Decimal.max(0, C1[h].sub(T4[h]));
    D1[h] = C2[h].mul(ratio).toDecimalPlaces(2);
    D2[h] = input.includeNonBusinessD2 ? C2[h].mul('0.05').toDecimalPlaces(2) : new Decimal(0);
    C3[h] = Decimal.max(0, C2[h].sub(D1[h]).sub(D2[h]));
    eligibleFromInputs[h] = T4[h].add(C3[h]);
    // Per GSTR-3B Table 4(B)(1): Rule 42 reversal reflects T1 + T2 + D1 + D2 (while T3 flows to 17(5) reversal line)
    rule42Reversal4B1[h] = T1[h].add(T2[h]).add(D1[h]).add(D2[h]);
  }

  // Rule 43: Capital Goods Common Credit (60 months useful life default under CGST Rule 43(1)(c))
  const Tr = zero();
  const Te = zero();
  for (const asset of input.capitalGoods ?? []) {
    if (asset.usage !== 'COMMON') continue;
    const months = asset.usefulLifeMonths && asset.usefulLifeMonths > 0 ? asset.usefulLifeMonths : 60;
    for (const h of HEADS) {
      const val = D(h === 'igst' ? asset.igstItc : h === 'cgst' ? asset.cgstItc : asset.sgstItc);
      Tr[h] = Tr[h].add(val.div(months).toDecimalPlaces(2));
    }
  }
  for (const h of HEADS) {
    Te[h] = Tr[h].mul(ratio).toDecimalPlaces(2);
  }

  return {
    ratioEoverF: ratio.toString(),
    rule42: {
      T: fmtHeads(T),
      T1: fmtHeads(T1),
      T2: fmtHeads(T2),
      T3: fmtHeads(T3),
      C1: fmtHeads(C1),
      T4: fmtHeads(T4),
      C2: fmtHeads(C2),
      D1: fmtHeads(D1),
      D2: fmtHeads(D2),
      C3: fmtHeads(C3),
      eligibleFromInputs: fmtHeads(eligibleFromInputs),
    },
    rule43: {
      Tr: fmtHeads(Tr),
      Te: fmtHeads(Te),
    },
    gstr3b4B1Rule42Reversal: fmtHeads(rule42Reversal4B1),
    gstr3b4B1Rule43Reversal: fmtHeads(Te),
  };
}

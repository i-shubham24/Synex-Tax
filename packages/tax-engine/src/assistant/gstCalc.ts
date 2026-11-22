import Decimal from 'decimal.js';
import { RATES_2025, rateFor } from '../tds/rates2025.js';
import { bestRowFor2025 } from './sections.js';

/**
 * GST on a value, from the net (tax-exclusive) or gross (tax-inclusive) amount, split into CGST and
 * SGST for a supply within a State or IGST between States.
 *
 * Rates: the structure in force from 22 September 2025 after the 56th GST Council meeting
 * (Notification No. 9/2025-Central Tax (Rate) for goods and No. 15/2025-Central Tax (Rate) for
 * services, both dated 17 September 2025): 0, 0.25, 1.5, 3, 5, 18 and 40 percent. 12% and 28% are
 * kept for supplies before 22 September 2025, and 28% for the tobacco goods that stay at that rate
 * until the compensation cess ends. The rate for a particular item comes from those notifications;
 * this calculator does not look items up.
 */

export const GST_RATES_FROM_22_SEP_2025 = [0, 0.25, 1.5, 3, 5, 18, 40] as const;
export const GST_RATES_EARLIER = [12, 28] as const;

export interface GstCalcInput {
  amount: string | number;
  rate: number;
  mode: 'NET' | 'GROSS';
  interState: boolean;
}

export interface GstCalcResult {
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  grossValue: string;
  rateNote: string | null;
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function gstCalc(i: GstCalcInput): GstCalcResult {
  const known = (GST_RATES_FROM_22_SEP_2025 as readonly number[]).includes(i.rate) || (GST_RATES_EARLIER as readonly number[]).includes(i.rate);
  if (!known) throw new Error(`${i.rate}% is not a GST rate.`);
  const amt = new Decimal(i.amount || 0);
  const taxable = r2(i.mode === 'NET' ? amt : amt.mul(100).div(100 + i.rate));
  let cgst = new Decimal(0);
  let sgst = new Decimal(0);
  let igst = new Decimal(0);
  if (i.interState) igst = r2(taxable.mul(i.rate).div(100));
  else {
    cgst = r2(taxable.mul(i.rate).div(200));
    sgst = cgst;
  }
  let tax = cgst.add(sgst).add(igst);
  // From a gross amount the parts must add back to it.
  if (i.mode === 'GROSS') {
    const diff = amt.sub(taxable).sub(tax);
    if (!diff.isZero()) {
      if (i.interState) igst = igst.add(diff);
      else cgst = cgst.add(diff);
      tax = cgst.add(sgst).add(igst);
    }
  }
  const rateNote = (GST_RATES_EARLIER as readonly number[]).includes(i.rate) ? `${i.rate}% applies to supplies before 22 September 2025${i.rate === 28 ? ', and to certain tobacco goods until the compensation cess ends' : ''}.` : null;
  return { taxableValue: taxable.toFixed(2), cgst: cgst.toFixed(2), sgst: sgst.toFixed(2), igst: igst.toFixed(2), totalTax: tax.toFixed(2), grossValue: taxable.add(tax).toFixed(2), rateNote };
}

export interface TdsCalcResult {
  code: string;
  nature: string;
  section2025: string;
  section1961: string | null;
  rate: number;
  tax: string;
  threshold: string;
  applies: boolean | null;
}

/**
 * TDS on a payment to a resident by Form 140 section code (Tax Year 2026-27 rates, tds/rates2025.ts),
 * with the 1961 Act section for the same payment beside it from SECTION_MAP.
 */
export function tdsCalc(i: { code: string; amount: string | number; yearToDate?: string | number; payeeIsCompany?: boolean }): TdsCalcResult {
  const rule = RATES_2025[i.code];
  if (!rule) throw new Error('Unknown section code.');
  const rate = rateFor(i.code, i.payeeIsCompany ? 'AAACX0000X' : 'AAAPX0000X')!;
  const amount = new Decimal(i.amount || 0);
  const ytd = new Decimal(i.yearToDate || 0).add(amount);
  const t = rule.threshold;
  let applies: boolean | null;
  let threshold: string;
  let base = amount;
  switch (t.kind) {
    case 'NONE': applies = true; threshold = 'No threshold'; break;
    case 'AGGREGATE': applies = ytd.gt(t.amount); threshold = `Year's payments above Rs ${t.amount.toLocaleString('en-IN')}`; break;
    case 'SINGLE': applies = amount.gt(t.amount); threshold = `A payment above Rs ${t.amount.toLocaleString('en-IN')}`; break;
    case 'MONTHLY': applies = amount.gt(t.amount); threshold = `Above Rs ${t.amount.toLocaleString('en-IN')} for a month`; break;
    case 'SINGLE_OR_AGGREGATE': applies = amount.gt(t.single) || ytd.gt(t.aggregate); threshold = `A payment above Rs ${t.single.toLocaleString('en-IN')} or the year's payments above Rs ${t.aggregate.toLocaleString('en-IN')}`; break;
    case 'EXCESS_ONLY': {
      const before = new Decimal(i.yearToDate || 0);
      base = Decimal.max(0, ytd.sub(Decimal.max(before, t.amount)));
      applies = base.gt(0);
      threshold = `Only on the year's amount above Rs ${t.amount.toLocaleString('en-IN')}`;
      break;
    }
    default: applies = null; threshold = t.reason;
  }
  const row = bestRowFor2025(rule.section);
  const tax = applies === false ? new Decimal(0) : base.mul(rate).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return { code: i.code, nature: rule.nature, section2025: rule.section, section1961: row && !row.act1961.includes(' to ') ? row.act1961 : null, rate, tax: tax.toFixed(2), threshold, applies };
}

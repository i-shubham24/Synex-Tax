import Decimal from 'decimal.js';
import { slabTax, surchargeFor, type AgeBand, type Regime } from '../tds/salary.js';

/**
 * Income tax of a resident individual under both regimes for FY 2024-25, FY 2025-26 and Tax Year
 * 2026-27, with income at slab rates and capital gains at special rates.
 *
 * Sources:
 *   FY 2024-25: Finance (No. 2) Act, 2024 (new regime slabs 3, 7, 10, 12, 15 lakh; standard
 *     deduction Rs 75,000; rebate up to Rs 25,000 where total income is up to Rs 7 lakh).
 *   FY 2025-26: Finance Act, 2025 (new regime slabs 4, 8, 12, 16, 20, 24 lakh; rebate up to
 *     Rs 60,000 where total income is up to Rs 12 lakh, with marginal relief).
 *   Tax Year 2026-27: the same rates, carried into the Income-tax Act, 2025 (Income Tax Department
 *     rate chart for Tax Year 2026-27; see itr/computation.ts).
 *   Old regime, all three years: nil band Rs 2.5 lakh (Rs 3 lakh at 60, Rs 5 lakh at 80), 5%, 20%,
 *     30%; standard deduction Rs 50,000; rebate up to Rs 12,500 where total income is up to Rs 5 lakh.
 *   Surcharge 10%, 15%, 25% above Rs 50 lakh, 1 crore and 2 crore, and 37% above Rs 5 crore in the
 *     old regime only; capped at 15% on capital gains at special rates. Cess 4%.
 * The rebate is not set against tax on gains at special rates in the new regime. Figures are a
 * working for the CA to check against the Department's utility.
 */

export type AssessmentYear = '2024-25' | '2025-26' | '2026-27';
export const TAX_YEARS: readonly AssessmentYear[] = ['2024-25', '2025-26', '2026-27'];

interface YearRules {
  newSlabs: Array<[number, number]>;
  newRebateLimit: number;
  newRebateMax: number;
  newStandardDeduction: number;
}

const RULES: Record<AssessmentYear, YearRules> = {
  '2024-25': {
    newSlabs: [[300000, 0], [700000, 0.05], [1000000, 0.1], [1200000, 0.15], [1500000, 0.2], [Infinity, 0.3]],
    newRebateLimit: 700000,
    newRebateMax: 25000,
    newStandardDeduction: 75000,
  },
  '2025-26': {
    newSlabs: [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]],
    newRebateLimit: 1200000,
    newRebateMax: 60000,
    newStandardDeduction: 75000,
  },
  '2026-27': {
    newSlabs: [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]],
    newRebateLimit: 1200000,
    newRebateMax: 60000,
    newStandardDeduction: 75000,
  },
};

function oldSlabs(age: AgeBand): Array<[number, number]> {
  const nil = age === 'SUPER_SENIOR' ? 500000 : age === 'SENIOR' ? 300000 : 250000;
  return [[nil, 0], [500000, 0.05], [1000000, 0.2], [Infinity, 0.3]];
}

export interface SpecialGain {
  /** Taxable gain after any exemption (the capital gains calculator gives this). */
  amount: string | number;
  /** Percent, for example 20 or 12.5. */
  rate: number;
  label: string;
}

export interface IncomeTaxInput {
  year: AssessmentYear;
  ageBand?: AgeBand;
  salary?: string | number;
  otherIncome?: string | number;
  /** Chapter VI-A and other old-regime deductions, already within their limits. */
  oldRegimeDeductions?: string | number;
  /** Deductions both regimes allow (employer NPS contribution). */
  commonDeductions?: string | number;
  specialGains?: SpecialGain[];
}

export interface IncomeTaxResult {
  regime: Regime;
  normalIncome: string;
  specialIncome: string;
  totalIncome: string;
  taxOnNormal: string;
  taxOnSpecial: string;
  rebate: string;
  surcharge: string;
  cess: string;
  totalTax: string;
  notes: string[];
}

const D = (v: string | number | undefined | null) => new Decimal(v || 0);
const r10 = (d: Decimal) => d.div(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(10);

function compute(regime: Regime, i: IncomeTaxInput): IncomeTaxResult {
  const rules = RULES[i.year];
  const age = i.ageBand ?? 'BELOW_60';
  const notes: string[] = [];
  const salary = D(i.salary);
  const std = Decimal.min(salary, regime === 'NEW' ? rules.newStandardDeduction : 50000);
  let normal = salary.sub(std).add(D(i.otherIncome)).sub(D(i.commonDeductions));
  if (regime === 'OLD') normal = normal.sub(D(i.oldRegimeDeductions));
  else if (D(i.oldRegimeDeductions).gt(0)) notes.push('Old-regime deductions are not allowed in the new regime.');
  normal = r10(Decimal.max(0, normal));

  const slabs = regime === 'NEW' ? rules.newSlabs : oldSlabs(age);
  // Unused basic exemption is set against special-rate gains, highest rate first.
  let shortfall = Decimal.max(0, new Decimal(slabs[0][0]).sub(normal));
  const gains = [...(i.specialGains ?? [])].sort((a, b) => b.rate - a.rate).map((gn) => {
    const amt = Decimal.max(0, D(gn.amount));
    const use = Decimal.min(shortfall, amt);
    shortfall = shortfall.sub(use);
    return { ...gn, amt, taxable: amt.sub(use) };
  });
  const special = gains.reduce((s, x) => s.add(x.amt), new Decimal(0));
  const total = normal.add(special);
  const taxNormal = slabTax(normal, slabs);
  const taxSpecial = gains.reduce((s, x) => s.add(x.taxable.mul(x.rate).div(100)), new Decimal(0));

  let rebate = new Decimal(0);
  if (regime === 'NEW') {
    if (total.lte(rules.newRebateLimit)) rebate = Decimal.min(taxNormal, rules.newRebateMax);
    else if (special.isZero()) {
      const excess = total.sub(rules.newRebateLimit);
      if (taxNormal.gt(excess)) {
        rebate = taxNormal.sub(excess);
        notes.push('Marginal relief on the rebate applied.');
      }
    }
    if (special.gt(0) && total.lte(rules.newRebateLimit)) notes.push('The rebate is not set against tax on gains at special rates.');
  } else if (total.lte(500000)) {
    rebate = Decimal.min(taxNormal.add(taxSpecial), 12500);
  }
  const normalAfter = Decimal.max(0, taxNormal.sub(rebate));
  const specialAfter = Decimal.max(0, taxSpecial.sub(Decimal.max(0, rebate.sub(taxNormal))));
  const cap = regime === 'NEW' ? 0.25 : 0.37;
  const sNormal = surchargeFor(total, normalAfter, regime, (x) => slabTax(x, slabs));
  let rate = 0;
  for (const [t, r] of [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]] as Array<[number, number]>) if (total.gt(t)) rate = Math.min(r, cap);
  const sSpecial = specialAfter.mul(Math.min(rate, 0.15));
  const surcharge = sNormal.add(sSpecial);
  const cess = normalAfter.add(specialAfter).add(surcharge).mul(0.04);
  const totalTax = r10(normalAfter.add(specialAfter).add(surcharge).add(cess));
  return {
    regime,
    normalIncome: normal.toFixed(2),
    specialIncome: special.toFixed(2),
    totalIncome: total.toFixed(2),
    taxOnNormal: taxNormal.toFixed(2),
    taxOnSpecial: taxSpecial.toFixed(2),
    rebate: rebate.toFixed(2),
    surcharge: surcharge.toFixed(2),
    cess: cess.toFixed(2),
    totalTax: totalTax.toFixed(2),
    notes,
  };
}

export function incomeTaxBothRegimes(input: IncomeTaxInput): { NEW: IncomeTaxResult; OLD: IncomeTaxResult; lower: Regime; saving: string } {
  const NEW = compute('NEW', input);
  const OLD = compute('OLD', input);
  const lower: Regime = new Decimal(OLD.totalTax).lt(NEW.totalTax) ? 'OLD' : 'NEW';
  return { NEW, OLD, lower, saving: new Decimal(NEW.totalTax).sub(OLD.totalTax).abs().toFixed(2) };
}

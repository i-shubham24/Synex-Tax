import Decimal from 'decimal.js';

/**
 * Salary TDS estimate (section 392 of the Income-tax Act 2025, section 192 of the 1961 Act) for one
 * employee and one tax year, under both regimes.
 *
 * Rates: Tax Year 2026-27, which the Finance Act 2026 left at the 2025 rates (new regime slabs in
 * Rs 4 lakh steps to 30% above Rs 24 lakh, standard deduction Rs 75,000, section 156 rebate up to
 * Rs 60,000 for income up to Rs 12 lakh with marginal relief; old regime standard deduction
 * Rs 50,000 and rebate up to Rs 12,500 for income up to Rs 5 lakh). Health and education cess 4%.
 * Confirm against the Income-tax Department before relying on it for a return.
 */

export type Regime = 'NEW' | 'OLD';
export type AgeBand = 'BELOW_60' | 'SENIOR' | 'SUPER_SENIOR';

export interface SalaryInput {
  grossSalary: string | number; // annual, before any exemption
  basicPlusDa: string | number; // annual, for HRA and NPS limits
  hraReceived?: string | number;
  rentPaid?: string | number;
  metroCity?: boolean;
  professionalTax?: string | number; // old regime only
  section80C?: string | number; // old regime, capped at Rs 1.5 lakh
  otherDeductions?: string | number; // old regime: 80D, 80E, 80G and others, as allowed
  employerNps?: string | number; // both regimes, within the employer contribution limit
  ageBand?: AgeBand;
  tdsAlreadyDeducted?: string | number;
  monthsRemaining?: number; // including the current month
}

export interface RegimeResult {
  regime: Regime;
  taxableIncome: string;
  slabTax: string;
  rebate: string;
  surcharge: string;
  cess: string;
  totalTax: string;
  monthlyTds: string;
}

const D = (v: string | number | undefined) => new Decimal(v ?? 0);

const NEW_SLABS: Array<[number, number]> = [
  [400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3],
];

function oldSlabs(age: AgeBand): Array<[number, number]> {
  const nil = age === 'SUPER_SENIOR' ? 500000 : age === 'SENIOR' ? 300000 : 250000;
  return [[nil, 0], [500000, 0.05], [1000000, 0.2], [Infinity, 0.3]];
}

function slabTax(income: Decimal, slabs: Array<[number, number]>): Decimal {
  let tax = new Decimal(0);
  let lower = 0;
  for (const [upper, rate] of slabs) {
    if (income.lte(lower)) break;
    const band = Decimal.min(income, upper === Infinity ? income : new Decimal(upper)).sub(lower);
    if (band.gt(0)) tax = tax.add(band.mul(rate));
    lower = upper;
  }
  return tax;
}

/** Surcharge with marginal relief: tax plus surcharge never rises by more than the income above each threshold. */
function surchargeFor(income: Decimal, tax: Decimal, regime: Regime, taxAt: (i: Decimal) => Decimal): Decimal {
  const bands: Array<[number, number]> = regime === 'NEW'
    ? [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25]]
    : [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]];
  let rate = 0;
  let threshold = 0;
  for (const [t, r] of bands) if (income.gt(t)) {
    rate = r;
    threshold = t;
  }
  if (!rate) return new Decimal(0);
  const surcharge = tax.mul(rate);
  // At the threshold, the lower surcharge rate (or none) applies.
  const lowerRate = bands.filter(([t]) => t < threshold).map(([, r]) => r).pop() ?? 0;
  const atThreshold = taxAt(new Decimal(threshold));
  const ceiling = atThreshold.mul(1 + lowerRate).add(income.sub(threshold));
  return Decimal.max(0, Decimal.min(surcharge, ceiling.sub(tax)));
}

export function hraExemption(input: Pick<SalaryInput, 'hraReceived' | 'rentPaid' | 'basicPlusDa' | 'metroCity'>): Decimal {
  const hra = D(input.hraReceived);
  const rent = D(input.rentPaid);
  if (hra.lte(0) || rent.lte(0)) return new Decimal(0);
  const basic = D(input.basicPlusDa);
  return Decimal.max(0, Decimal.min(hra, rent.sub(basic.mul(0.1)), basic.mul(input.metroCity ? 0.5 : 0.4)));
}

function computeRegime(regime: Regime, i: SalaryInput): RegimeResult {
  const gross = D(i.grossSalary);
  const age = i.ageBand ?? 'BELOW_60';
  const standard = Decimal.min(gross, regime === 'NEW' ? 75000 : 50000);
  const npsCap = D(i.basicPlusDa).mul(regime === 'NEW' ? 0.14 : 0.1);
  const nps = Decimal.min(D(i.employerNps), npsCap);
  let deductions = standard.add(nps);
  if (regime === 'OLD') {
    deductions = deductions
      .add(hraExemption(i))
      .add(Decimal.min(D(i.professionalTax), 2500))
      .add(Decimal.min(D(i.section80C), 150000))
      .add(D(i.otherDeductions));
  }
  // Taxable income is rounded to the nearest Rs 10.
  const taxable = Decimal.max(0, gross.sub(deductions)).div(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(10);
  const slabs = regime === 'NEW' ? NEW_SLABS : oldSlabs(age);
  const base = slabTax(taxable, slabs);

  // Section 156 rebate, with marginal relief just above the new regime limit.
  let rebate = new Decimal(0);
  if (regime === 'NEW') {
    if (taxable.lte(1200000)) rebate = Decimal.min(base, 60000);
    else {
      // Marginal relief: tax cannot exceed the income above Rs 12 lakh.
      const excess = taxable.sub(1200000);
      if (base.gt(excess)) rebate = base.sub(excess);
    }
  } else if (taxable.lte(500000)) rebate = Decimal.min(base, 12500);

  const afterRebate = base.sub(rebate);
  const surcharge = surchargeFor(taxable, afterRebate, regime, (x) => slabTax(x, slabs));
  const cess = afterRebate.add(surcharge).mul(0.04);
  const total = afterRebate.add(surcharge).add(cess).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const months = Math.max(1, Math.min(12, i.monthsRemaining ?? 12));
  const monthly = Decimal.max(0, total.sub(D(i.tdsAlreadyDeducted))).div(months).toDecimalPlaces(0, Decimal.ROUND_UP);
  return {
    regime,
    taxableIncome: taxable.toFixed(2),
    slabTax: base.toFixed(2),
    rebate: rebate.toFixed(2),
    surcharge: surcharge.toFixed(2),
    cess: cess.toFixed(2),
    totalTax: total.toFixed(2),
    monthlyTds: monthly.toFixed(2),
  };
}

/** Both regimes side by side; the new regime is the default unless the employee opts out. */
export function salaryTds(input: SalaryInput): { NEW: RegimeResult; OLD: RegimeResult; lower: Regime } {
  const NEW = computeRegime('NEW', input);
  const OLD = computeRegime('OLD', input);
  return { NEW, OLD, lower: new Decimal(OLD.totalTax).lt(NEW.totalTax) ? 'OLD' : 'NEW' };
}

import { NEW_SLABS, oldSlabs, type AgeBand } from '../tds/salary.js';

/**
 * Tax for a resident individual or HUF for AY 2026-27 (income of 2025-26) where part of the income is
 * capital gains at special rates. All transfers in 2025-26 are after 23 July 2024, so the rates are
 * those the Finance (No. 2) Act 2024 set: section 111A 20%, section 112A 12.5% on gains above
 * Rs 1.25 lakh, section 112 12.5% without indexation. A resident sets any unused basic exemption
 * against these gains (provisos to 111A(1), 112(1) and 112A(2)); section 115BBH has no such proviso, so
 * gains on virtual digital assets bear 30% in full. Rebate under 87A: new regime (115BAC(1A)) up to
 * Rs 60,000 where total income is not above Rs 12 lakh, not set against tax at special rates, with
 * marginal relief above Rs 12 lakh only where there is no such income (the rule the computation module
 * follows); old regime up to Rs 12,500 where total income is not above Rs 5 lakh, also against tax under
 * 111A but not 112A (112A(6)). The writers refuse virtual digital asset gains where the 87A rebate could
 * apply, since this file does not settle whether it may be set against tax under 115BBH.
 *
 * Section 112(1)(a), second proviso: for land or building acquired before 23 July 2024 the tax at 12.5%
 * without indexation is reduced by the excess over 20% with indexation (B1h of Schedule CG), which the
 * notified form takes off the 112 row of Schedule SI ("as reduced by B1h of Schedule CG").
 *
 * Agricultural income for rate purposes (Finance Act 2025, First Schedule Part I, rules for net
 * agricultural income; Part B-TTI items 2a and 2c of the notified ITR-2 and ITR-3): where net agricultural
 * income exceeds Rs 5,000 and the income at normal rates exceeds the basic exemption, tax is worked on the
 * normal income plus the agricultural income (2a), less tax on the agricultural income plus the basic
 * exemption (2c).
 *
 * Surcharge (First Schedule Part I as applied by the Finance Act 2025 for AY 2026-27): 10% above Rs 50 lakh,
 * 15% above Rs 1 crore, 25% above Rs 2 crore and 37% above Rs 5 crore (new regime capped at 25%, section
 * 115BAC(1A)); not above 15% on tax on income under 111A, 112 and 112A and on dividends. Marginal relief:
 * tax and surcharge at income above a threshold may exceed tax and surcharge at the threshold by no more
 * than the income above it. The tax at the threshold is worked by taking the excess off income at normal
 * rates first. Dividends with total income above Rs 2 crore, where the 15% cap would bite on tax at normal
 * rates, are refused (refusal below).
 */
export interface SpecialRateInput {
  regime: 'NEW' | 'OLD';
  age: AgeBand;
  totalIncome: number; // already rounded under section 288A
  st111A: number;
  lt112A: number; // gain after set-off, before the Rs 1.25 lakh exemption
  lt112: number;
  /** Section 87A gives the rebate to a resident individual only; true for a HUF. Leaving it out keeps the rebate. */
  noRebate?: boolean;
  /** Gains on transfer of virtual digital assets under section 115BBH, at 30%. */
  vda?: number;
  /** B1h of Schedule CG: excess tax ignored under the second proviso to section 112(1)(a). */
  excess112?: number;
  /** Net agricultural income for rate purposes (Schedule EI item 2, Part B-TI item 14). */
  agri?: number;
  /** Dividends included at normal rates, for the 15% surcharge cap. */
  dividends?: number;
}

type Comp = { normal: number; st: number; ltA: number; ltO: number; vda: number };

const SURCHARGE_BANDS: Array<[number, number]> = [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]];
export function surchargeRate(income: number, regime: 'NEW' | 'OLD') {
  let r = 0;
  for (const [t, rate] of SURCHARGE_BANDS) if (income > t) r = rate;
  return regime === 'NEW' ? Math.min(r, 0.25) : r;
}

function slab(income: number, slabs: Array<[number, number]>) {
  let tax = 0;
  let prev = 0;
  for (const [upto, rate] of slabs) {
    if (income > prev) tax += (Math.min(income, upto) - prev) * rate;
    prev = upto;
  }
  return Math.round(tax);
}

export function specialRateTax(i: SpecialRateInput) {
  const slabs = i.regime === 'NEW' ? NEW_SLABS : oldSlabs(i.age);
  const exemption = slabs[0][0];
  const vda = Math.max(0, i.vda ?? 0);
  const agri = Math.max(0, i.agri ?? 0);

  const taxOf = (c: Comp) => {
    let shortfall = Math.max(0, exemption - c.normal);
    const take = (v: number) => { const t = Math.min(shortfall, v); shortfall -= t; return v - t; };
    const st = take(c.st);
    const ltA = take(c.ltA - Math.min(c.ltA, 125000));
    const ltO = take(c.ltO);
    const integrate = agri > 5000 && c.normal > exemption;
    const taxNormal = slab(c.normal + (integrate ? agri : 0), slabs);
    const agriRebate = integrate ? slab(agri + exemption, slabs) : 0;
    const stTax = Math.round(st * 0.2);
    const ltATax = Math.round(ltA * 0.125);
    const ltOTax = Math.max(0, Math.round(ltO * 0.125) - Math.max(0, i.excess112 ?? 0));
    const vdaTax = Math.round(c.vda * 0.3);
    return { st, ltA, ltO, taxNormal, agriRebate, stTax, ltATax, ltOTax, vdaTax, cgTax: stTax + ltATax + ltOTax };
  };

  const special = i.st111A + i.lt112A + i.lt112 + vda;
  const full: Comp = { normal: Math.max(0, i.totalIncome - special), st: i.st111A, ltA: i.lt112A, ltO: i.lt112, vda };
  const t = taxOf(full);
  const taxNormal = t.taxNormal;
  const taxSpecial = t.cgTax + t.vdaTax;
  let rebate = 0;
  if (i.noRebate) rebate = 0;
  else if (i.regime === 'NEW') {
    if (i.totalIncome <= 1200000) rebate = Math.min(taxNormal - t.agriRebate, 60000);
    else if (special === 0 && taxNormal - t.agriRebate > i.totalIncome - 1200000) rebate = taxNormal - t.agriRebate - (i.totalIncome - 1200000);
  } else if (i.totalIncome <= 500000) rebate = Math.min(taxNormal - t.agriRebate + t.stTax, 12500);
  rebate = Math.max(0, rebate);
  const afterRebate = taxNormal + taxSpecial - t.agriRebate - rebate;

  // Surcharge: the capped part is tax on 111A, 112, 112A and (at normal rates) dividends; the rest at the full rate.
  const surchargeOn = (income: number, x: ReturnType<typeof taxOf>, after: number) => {
    const r = surchargeRate(income, i.regime);
    const capped = x.cgTax;
    return Math.round(capped * Math.min(r, 0.15) + Math.max(0, after - capped) * r);
  };
  const before = surchargeOn(i.totalIncome, t, afterRebate);
  let surcharge = before;
  const threshold = SURCHARGE_BANDS.map(([th]) => th).filter((th) => i.totalIncome > th && surchargeRate(th + 1, i.regime) !== surchargeRate(th, i.regime)).pop();
  if (threshold !== undefined && before > 0) {
    // Income at the threshold: the excess comes off income at normal rates first, then VDA, 112, 112A and 111A.
    let cut = i.totalIncome - threshold;
    const c: Comp = { ...full };
    for (const k of ['normal', 'vda', 'ltO', 'ltA', 'st'] as const) { const d = Math.min(cut, c[k]); c[k] -= d; cut -= d; }
    const tt = taxOf(c);
    const afterT = tt.taxNormal + tt.cgTax + tt.vdaTax - tt.agriRebate;
    const atThreshold = afterT + surchargeOn(threshold, tt, afterT);
    const ceiling = atThreshold + (i.totalIncome - threshold);
    if (afterRebate + surcharge > ceiling) surcharge = Math.max(0, ceiling - afterRebate);
  }
  const refusal = (i.dividends ?? 0) > 0 && surchargeRate(i.totalIncome, i.regime) > 0.15
    ? 'Dividends with total income above Rs 2 crore need the 15% surcharge cap worked on the tax on dividends; not written by this file.'
    : undefined;
  const cess = Math.round((afterRebate + surcharge) * 0.04);
  return {
    normal: full.normal, taxNormal, taxSpecial, agriRebate: t.agriRebate, rebate, afterRebate,
    surchargeBeforeRelief: before, surcharge, cess, liability: afterRebate + surcharge + cess, refusal,
    /** Schedule SI rows: section code, rate, income at that rate, tax. */
    si: [['1A', 20, t.st, t.stTax], ['2A', 12.5, t.ltA, t.ltATax], ['21', 12.5, t.ltO, t.ltOTax], ['5BBH', 30, vda, t.vdaTax]]
      .filter(([, , inc]) => (inc as number) > 0) as Array<[string, number, number, number]>,
  };
}

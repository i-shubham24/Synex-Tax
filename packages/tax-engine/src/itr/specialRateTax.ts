import { NEW_SLABS, oldSlabs, type AgeBand } from '../tds/salary.js';

/**
 * Tax for a resident individual for AY 2026-27 (income of 2025-26) where part of the income is
 * capital gains at special rates. All transfers in 2025-26 are after 23 July 2024, so the rates are
 * those the Finance (No. 2) Act 2024 set: section 111A 20%, section 112A 12.5% on gains above
 * Rs 1.25 lakh, section 112 12.5% without indexation. A resident sets any unused basic exemption
 * against these gains (provisos to 111A(1), 112(1) and 112A(2)). Rebate under 87A: new regime
 * (115BAC(1A)) up to Rs 60,000 where total income is not above Rs 12 lakh, not set against tax at
 * special rates, with marginal relief above Rs 12 lakh only where there is no such income (the rule the
 * computation module follows); old regime up to Rs 12,500 where total income is not above Rs 5 lakh,
 * also against tax under 111A but not 112A (112A(6)). Callers keep total income at or under Rs 50 lakh,
 * so no surcharge arises.
 */
export interface SpecialRateInput {
  regime: 'NEW' | 'OLD';
  age: AgeBand;
  totalIncome: number; // already rounded under section 288A
  st111A: number;
  lt112A: number; // gain after set-off, before the Rs 1.25 lakh exemption
  lt112: number;
}

export function specialRateTax(i: SpecialRateInput) {
  const slabs = i.regime === 'NEW' ? NEW_SLABS : oldSlabs(i.age);
  const special = i.st111A + i.lt112A + i.lt112;
  const normal = Math.max(0, i.totalIncome - special);
  let shortfall = Math.max(0, slabs[0][0] - normal);
  const take = (v: number) => { const t = Math.min(shortfall, v); shortfall -= t; return v - t; };
  const st = take(i.st111A);
  const exempt112A = Math.min(i.lt112A, 125000);
  const ltA = take(i.lt112A - exempt112A);
  const ltO = take(i.lt112);
  let taxNormal = 0;
  let prev = 0;
  for (const [upto, rate] of slabs) {
    if (normal > prev) taxNormal += (Math.min(normal, upto) - prev) * rate;
    prev = upto;
  }
  taxNormal = Math.round(taxNormal);
  const stTax = Math.round(st * 0.2);
  const ltATax = Math.round(ltA * 0.125);
  const ltOTax = Math.round(ltO * 0.125);
  const taxSpecial = stTax + ltATax + ltOTax;
  let rebate = 0;
  if (i.regime === 'NEW') {
    if (i.totalIncome <= 1200000) rebate = Math.min(taxNormal, 60000);
    else if (special === 0 && taxNormal > i.totalIncome - 1200000) rebate = taxNormal - (i.totalIncome - 1200000);
  } else if (i.totalIncome <= 500000) rebate = Math.min(taxNormal + stTax, 12500);
  const afterRebate = taxNormal + taxSpecial - rebate;
  const cess = Math.round(afterRebate * 0.04);
  return {
    normal, taxNormal, taxSpecial, rebate, afterRebate, cess, liability: afterRebate + cess,
    /** Schedule SI rows: section code, rate, income at that rate, tax. */
    si: [['1A', 20, st, stTax], ['2A', 12.5, ltA, ltATax], ['21', 12.5, ltO, ltOTax]].filter(([, , inc]) => (inc as number) > 0) as Array<[string, number, number, number]>,
  };
}

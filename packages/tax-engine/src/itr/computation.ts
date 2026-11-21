import Decimal from 'decimal.js';
import { NEW_SLABS, hraExemption, oldSlabs, slabTax, surchargeFor, type AgeBand, type Regime } from '../tds/salary.js';

/**
 * Income tax computation for a resident individual for Tax Year 2026-27, under both regimes,
 * with the heads a CA practice files most: salary, house property, presumptive business or
 * profession, capital gains on listed equity and other assets, and other sources.
 *
 * Rates as for the 2025 rates carried into Tax Year 2026-27: listed equity short-term gains 20%,
 * long-term gains 12.5% above Rs 1.25 lakh, other long-term gains 12.5%; presumptive income 6%
 * of digital and 8% of other turnover for business, 50% of receipts for a profession. Rebate is
 * not set against tax on equity gains at special rates. Surcharge on those gains is capped at 15%.
 * Section labels are left out on purpose: the 2025 Act renumbers them.
 *
 * Confirm against the Income-tax Department's utility before filing. The ITR JSON for Tax Year
 * 2026-27 will be written once the Department publishes its schema.
 */

const D = (v: string | number | undefined | null) => new Decimal(v || 0);
const r0 = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

export interface ItrInput {
  ageBand?: AgeBand;
  salary?: { gross: string | number; basicPlusDa?: string | number; hraReceived?: string | number; rentPaid?: string | number; metroCity?: boolean; professionalTax?: string | number; employerNps?: string | number };
  house?: { selfOccupiedInterest?: string | number; letOut?: Array<{ rent: string | number; municipalTax?: string | number; interest?: string | number }> };
  business?: { digitalTurnover?: string | number; otherTurnover?: string | number; professionalReceipts?: string | number; actualProfit?: string | number };
  capitalGains?: { equityShortTerm?: string | number; equityLongTerm?: string | number; otherLongTerm?: string | number; otherShortTerm?: string | number };
  otherSources?: { savingsInterest?: string | number; depositInterest?: string | number; dividends?: string | number; other?: string | number };
  deductions?: { section80C?: string | number; npsSelf?: string | number; healthInsurance?: string | number; other?: string | number };
  taxesPaid?: { tds?: string | number; tcs?: string | number; advanceTax?: string | number; selfAssessment?: string | number };
}

export interface ItrRegimeResult {
  regime: Regime;
  heads: { salary: string; houseProperty: string; business: string; capitalGainsNormal: string; otherSources: string };
  specialRate: { equityShortTerm: string; equityLongTermTaxable: string; otherLongTerm: string };
  grossTotalIncome: string;
  deductions: string;
  totalIncome: string;
  normalIncome: string;
  taxOnNormal: string;
  taxOnSpecial: string;
  rebate: string;
  surcharge: string;
  cess: string;
  totalTax: string;
  taxesPaid: string;
  payable: string; // positive: to pay; negative: refund
  notes: string[];
}

const LTCG_EQUITY_EXEMPT = 125000;

function computeFor(regime: Regime, i: ItrInput): ItrRegimeResult {
  const age = i.ageBand ?? 'BELOW_60';
  const notes: string[] = [];

  // Salary
  let salary = new Decimal(0);
  if (i.salary) {
    const gross = D(i.salary.gross);
    salary = gross.sub(Decimal.min(gross, regime === 'NEW' ? 75000 : 50000));
    if (regime === 'OLD') {
      salary = salary.sub(hraExemption({ hraReceived: i.salary.hraReceived, rentPaid: i.salary.rentPaid, basicPlusDa: i.salary.basicPlusDa ?? 0, metroCity: i.salary.metroCity })).sub(Decimal.min(D(i.salary.professionalTax), 2500));
    }
    salary = Decimal.max(0, salary);
  }

  // House property: let-out at 70% of (rent less municipal tax) less interest; self-occupied interest only in the old regime, up to Rs 2 lakh.
  let house = new Decimal(0);
  for (const p of i.house?.letOut ?? []) house = house.add(Decimal.max(0, D(p.rent).sub(D(p.municipalTax))).mul(0.7).sub(D(p.interest)));
  if (regime === 'OLD') house = house.sub(Decimal.min(D(i.house?.selfOccupiedInterest), 200000));
  else if (D(i.house?.selfOccupiedInterest).gt(0)) notes.push('Interest on a self-occupied home is not allowed in the new regime.');
  // A loss from house property: old regime sets off up to Rs 2 lakh against other heads; the new regime none.
  if (house.lt(0)) {
    const allowed = regime === 'OLD' ? Decimal.max(house, -200000) : new Decimal(0);
    if (!allowed.eq(house)) notes.push(`House property loss of Rs ${house.neg().sub(allowed.neg()).toFixed(0)} is carried forward, not set off this year.`);
    house = allowed;
  }

  // Business or profession: presumptive, or the actual profit when given.
  const b = i.business ?? {};
  const presumptive = D(b.digitalTurnover).mul(0.06).add(D(b.otherTurnover).mul(0.08)).add(D(b.professionalReceipts).mul(0.5));
  const business = b.actualProfit !== undefined && b.actualProfit !== '' ? D(b.actualProfit) : presumptive;

  const cg = i.capitalGains ?? {};
  const equitySt = Decimal.max(0, D(cg.equityShortTerm));
  const equityLtRaw = Decimal.max(0, D(cg.equityLongTerm));
  const otherLt = Decimal.max(0, D(cg.otherLongTerm));
  const otherSt = Decimal.max(0, D(cg.otherShortTerm));

  const os = i.otherSources ?? {};
  const otherSources = D(os.savingsInterest).add(D(os.depositInterest)).add(D(os.dividends)).add(D(os.other));

  const normalHeads = salary.add(house).add(business).add(otherSt).add(otherSources);
  const gti = normalHeads.add(equitySt).add(equityLtRaw).add(otherLt);

  // Deductions: the new regime allows only the employer's NPS contribution.
  const npsEmployer = Decimal.min(D(i.salary?.employerNps), D(i.salary?.basicPlusDa).mul(regime === 'NEW' ? 0.14 : 0.1));
  let ded = npsEmployer;
  if (regime === 'OLD') {
    const d = i.deductions ?? {};
    const interestDed = age === 'BELOW_60' ? Decimal.min(D(os.savingsInterest), 10000) : Decimal.min(D(os.savingsInterest).add(D(os.depositInterest)), 50000);
    ded = ded.add(Decimal.min(D(d.section80C), 150000)).add(Decimal.min(D(d.npsSelf), 50000)).add(D(d.healthInsurance)).add(D(d.other)).add(interestDed);
  }
  // Deductions do not reduce gains taxed at special rates.
  ded = Decimal.min(ded, Decimal.max(0, normalHeads));
  const normalIncome = r0(Decimal.max(0, normalHeads.sub(ded)).div(10)).mul(10);
  const totalIncome = normalIncome.add(equitySt).add(equityLtRaw).add(otherLt);

  // Unused basic exemption is set against equity gains (residents), short-term first.
  const slabs = regime === 'NEW' ? NEW_SLABS : oldSlabs(age);
  let shortfall = Decimal.max(0, new Decimal(slabs[0][0]).sub(normalIncome));
  const useSt = Decimal.min(shortfall, equitySt);
  shortfall = shortfall.sub(useSt);
  const equityLtAboveExempt = Decimal.max(0, equityLtRaw.sub(LTCG_EQUITY_EXEMPT));
  const useLt = Decimal.min(shortfall, equityLtAboveExempt);
  shortfall = shortfall.sub(useLt);
  const useOtherLt = Decimal.min(shortfall, otherLt);
  const stTaxable = equitySt.sub(useSt);
  const ltTaxable = equityLtAboveExempt.sub(useLt);
  const otherLtTaxable = otherLt.sub(useOtherLt);

  const taxNormal = slabTax(normalIncome, slabs);
  const taxSpecial = stTaxable.mul(0.2).add(ltTaxable.mul(0.125)).add(otherLtTaxable.mul(0.125));

  let rebate = new Decimal(0);
  if (regime === 'NEW') {
    if (totalIncome.lte(1200000)) rebate = Decimal.min(taxNormal, 60000);
    else if (normalIncome.eq(totalIncome)) {
      // Marginal relief just above Rs 12 lakh: tax cannot exceed the income above it. Applied only
      // when there is no income at special rates, where the rebate does not reach.
      const excess = totalIncome.sub(1200000);
      if (taxNormal.gt(excess)) rebate = taxNormal.sub(excess);
    }
  } else if (totalIncome.lte(500000)) {
    rebate = Decimal.min(taxNormal.add(stTaxable.mul(0.2)), 12500);
  }
  rebate = Decimal.max(0, rebate);

  const normalAfterRebate = Decimal.max(0, taxNormal.sub(rebate));
  const specialAfterRebate = Decimal.max(0, taxSpecial.sub(Decimal.max(0, rebate.sub(taxNormal))));
  // Surcharge by total income; on equity and other capital gains at special rates it is capped at 15%.
  const normalSurcharge = surchargeFor(totalIncome, normalAfterRebate, regime, (x) => slabTax(x, slabs));
  const fullRate = normalAfterRebate.gt(0) ? normalSurcharge.div(normalAfterRebate).toNumber() : surchargeRate(totalIncome, regime);
  const specialSurcharge = specialAfterRebate.mul(Math.min(fullRate, 0.15));
  const surcharge = normalSurcharge.add(specialSurcharge);
  const cess = normalAfterRebate.add(specialAfterRebate).add(surcharge).mul(0.04);
  const total = r0(normalAfterRebate.add(specialAfterRebate).add(surcharge).add(cess).div(10)).mul(10);

  const t = i.taxesPaid ?? {};
  const paid = D(t.tds).add(D(t.tcs)).add(D(t.advanceTax)).add(D(t.selfAssessment));
  if (useSt.add(useLt).add(useOtherLt).gt(0)) notes.push(`Unused basic exemption of Rs ${useSt.add(useLt).add(useOtherLt).toFixed(0)} set against capital gains.`);
  if (D(b.digitalTurnover).add(D(b.otherTurnover)).gt(0) && (b.actualProfit === undefined || b.actualProfit === '')) notes.push('Business income taken at the presumptive rate on turnover.');

  return {
    regime,
    heads: { salary: salary.toFixed(2), houseProperty: house.toFixed(2), business: business.toFixed(2), capitalGainsNormal: otherSt.toFixed(2), otherSources: otherSources.toFixed(2) },
    specialRate: { equityShortTerm: equitySt.toFixed(2), equityLongTermTaxable: equityLtAboveExempt.toFixed(2), otherLongTerm: otherLt.toFixed(2) },
    grossTotalIncome: gti.toFixed(2),
    deductions: ded.toFixed(2),
    totalIncome: totalIncome.toFixed(2),
    normalIncome: normalIncome.toFixed(2),
    taxOnNormal: taxNormal.toFixed(2),
    taxOnSpecial: taxSpecial.toFixed(2),
    rebate: rebate.toFixed(2),
    surcharge: surcharge.toFixed(2),
    cess: cess.toFixed(2),
    totalTax: total.toFixed(2),
    taxesPaid: paid.toFixed(2),
    payable: total.sub(paid).toFixed(2),
    notes,
  };
}

function surchargeRate(income: Decimal, regime: Regime): number {
  const bands: Array<[number, number]> = regime === 'NEW' ? [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25]] : [[5000000, 0.1], [10000000, 0.15], [20000000, 0.25], [50000000, 0.37]];
  let rate = 0;
  for (const [t, r] of bands) if (income.gt(t)) rate = r;
  return rate;
}

/** Both regimes; the new regime applies unless the taxpayer opts out (business income: once). */
export function itrComputation(input: ItrInput): { NEW: ItrRegimeResult; OLD: ItrRegimeResult; lower: Regime; saving: string } {
  const NEW = computeFor('NEW', input);
  const OLD = computeFor('OLD', input);
  const lower: Regime = new Decimal(OLD.totalTax).lt(NEW.totalTax) ? 'OLD' : 'NEW';
  return { NEW, OLD, lower, saving: new Decimal(NEW.totalTax).sub(OLD.totalTax).abs().toFixed(2) };
}

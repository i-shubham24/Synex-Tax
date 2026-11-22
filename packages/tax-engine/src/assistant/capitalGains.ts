import Decimal from 'decimal.js';

/**
 * Capital gains on one transfer, with the change for transfers on or after 23 July 2024 made by
 * the Finance (No. 2) Act, 2024 (sections 111A, 112 and 112A of the 1961 Act; sections 196, 197
 * and 198 of the 2025 Act carry the same rates, see SECTION_MAP):
 *
 *   Listed equity, equity fund units, business trust units with STT (111A, 112A):
 *     short term up to 12 months; short-term rate 15% before 23 July 2024, 20% on or after;
 *     long-term rate 10% before, 12.5% on or after, on gains above Rs 1 lakh (Rs 1.25 lakh from
 *     FY 2024-25; the exemption is for the year's 112A gains together, so pass `exemptionUsed`).
 *   Other assets (112): long term after 24 months from 23 July 2024 (36 months before, except
 *     unlisted shares and immovable property at 24 months; listed securities 12 months); 20% with
 *     indexation before 23 July 2024, 12.5% without indexation on or after. Land or a building
 *     bought before 23 July 2024 and sold on or after by a resident individual or HUF: the lower of
 *     12.5% without indexation and 20% with indexation.
 *   Specified mutual funds and market linked debentures bought from 1 April 2023 (50AA): always
 *     short term at slab rates.
 *
 * Cost Inflation Index: CBDT notifications under section 48 of the 1961 Act, as listed on
 * incometaxindia.gov.in (base year 2001-02 = 100).
 */

export const COST_INFLATION_INDEX: Record<string, number> = {
  '2001-02': 100, '2002-03': 105, '2003-04': 109, '2004-05': 113, '2005-06': 117, '2006-07': 122,
  '2007-08': 129, '2008-09': 137, '2009-10': 148, '2010-11': 167, '2011-12': 184, '2012-13': 200,
  '2013-14': 220, '2014-15': 240, '2015-16': 254, '2016-17': 264, '2017-18': 272, '2018-19': 280,
  '2019-20': 289, '2020-21': 301, '2021-22': 317, '2022-23': 331, '2023-24': 348, '2024-25': 363,
  '2025-26': 376,
};

export type AssetKind = 'LISTED_EQUITY_STT' | 'LAND_OR_BUILDING' | 'UNLISTED_SHARES' | 'OTHER_LISTED_SECURITY' | 'OTHER' | 'SPECIFIED_DEBT_FUND';

export interface CapitalGainInput {
  kind: AssetKind;
  acquiredOn: string; // YYYY-MM-DD
  transferredOn: string;
  saleValue: string | number;
  cost: string | number;
  expenses?: string | number;
  improvement?: string | number;
  residentIndividualOrHuf?: boolean;
  /** Part of the year's 112A exemption already used by other transfers. */
  exemptionUsed?: string | number;
}

export interface CapitalGainResult {
  term: 'SHORT' | 'LONG';
  /** 1961 Act section the rate comes from; the 2025 section is in SECTION_MAP. */
  section1961: '111A' | '112A' | '112' | 'SLAB';
  gain: string;
  exemption: string;
  taxableGain: string;
  /** Percent; null when taxed at slab rates. */
  rate: number | null;
  tax: string | null;
  indexedCost?: string;
  indexedOption?: { taxableGain: string; tax: string; chosen: boolean };
  notes: string[];
}

const CHANGE = '2024-07-23';
const D = (v: string | number | undefined) => new Decimal(v || 0);

export function financialYearOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function monthsHeld(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return m;
}

export function capitalGain(i: CapitalGainInput): CapitalGainResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.acquiredOn) || !/^\d{4}-\d{2}-\d{2}$/.test(i.transferredOn) || i.transferredOn < i.acquiredOn) {
    throw new Error('Give the dates of purchase and sale, sale on or after purchase.');
  }
  const after = i.transferredOn >= CHANGE;
  const notes: string[] = [];
  const held = monthsHeld(i.acquiredOn, i.transferredOn);
  // Held "for not more than" N months is short term.
  let limit: number;
  if (i.kind === 'LISTED_EQUITY_STT' || i.kind === 'OTHER_LISTED_SECURITY') limit = 12;
  else if (after || i.kind === 'LAND_OR_BUILDING' || i.kind === 'UNLISTED_SHARES') limit = 24;
  else limit = 36;
  const exactlyLimit = held === limit && new Date(`${i.transferredOn}T00:00:00Z`).getUTCDate() === new Date(`${i.acquiredOn}T00:00:00Z`).getUTCDate();
  let term: 'SHORT' | 'LONG' = held > limit || (held === limit && !exactlyLimit) ? 'LONG' : 'SHORT';
  if (i.kind === 'SPECIFIED_DEBT_FUND' && i.acquiredOn >= '2023-04-01') {
    term = 'SHORT';
    notes.push('Specified mutual fund bought from 1 April 2023: short term whatever the holding.');
  }
  const gain = D(i.saleValue).sub(D(i.cost)).sub(D(i.improvement)).sub(D(i.expenses));
  const base = { gain: gain.toFixed(2), notes };

  if (i.kind === 'LISTED_EQUITY_STT') {
    if (term === 'SHORT') {
      const rate = after ? 20 : 15;
      const taxable = Decimal.max(0, gain);
      return { ...base, term, section1961: '111A', exemption: '0.00', taxableGain: taxable.toFixed(2), rate, tax: taxable.mul(rate).div(100).toFixed(2) };
    }
    const fy = financialYearOf(i.transferredOn);
    const limitEx = fy >= '2024-25' ? 125000 : 100000;
    const ex = Decimal.min(Decimal.max(0, gain), Decimal.max(0, new Decimal(limitEx).sub(D(i.exemptionUsed))));
    const taxable = Decimal.max(0, gain.sub(ex));
    const rate = after ? 12.5 : 10;
    notes.push(`Exemption of Rs ${limitEx.toLocaleString('en-IN')} a year on these gains together.`);
    return { ...base, term, section1961: '112A', exemption: ex.toFixed(2), taxableGain: taxable.toFixed(2), rate, tax: taxable.mul(rate).div(100).toFixed(2) };
  }
  if (term === 'SHORT') {
    notes.push('Short-term gain: added to income and taxed at slab rates.');
    return { ...base, term, section1961: 'SLAB', exemption: '0.00', taxableGain: Decimal.max(0, gain).toFixed(2), rate: null, tax: null };
  }

  const ciiBuy = COST_INFLATION_INDEX[financialYearOf(i.acquiredOn) < '2001-02' ? '2001-02' : financialYearOf(i.acquiredOn)];
  const ciiSell = COST_INFLATION_INDEX[financialYearOf(i.transferredOn)];
  const indexed = ciiBuy && ciiSell ? D(i.cost).add(D(i.improvement)).mul(ciiSell).div(ciiBuy) : null;
  if (financialYearOf(i.acquiredOn) < '2001-02') notes.push('Bought before 1 April 2001: use the fair market value on that date as cost.');

  if (!after) {
    if (!indexed) throw new Error('Cost Inflation Index not in the table for these years.');
    const taxable = Decimal.max(0, D(i.saleValue).sub(indexed).sub(D(i.expenses)));
    return { ...base, term, section1961: '112', exemption: '0.00', taxableGain: taxable.toFixed(2), rate: 20, tax: taxable.mul(0.2).toFixed(2), indexedCost: indexed.toFixed(2) };
  }
  const taxable = Decimal.max(0, gain);
  const tax = taxable.mul(0.125);
  const result: CapitalGainResult = { ...base, term, section1961: '112', exemption: '0.00', taxableGain: taxable.toFixed(2), rate: 12.5, tax: tax.toFixed(2) };
  if (i.kind === 'LAND_OR_BUILDING' && i.residentIndividualOrHuf && i.acquiredOn < CHANGE) {
    if (indexed) {
      const idxGain = Decimal.max(0, D(i.saleValue).sub(indexed).sub(D(i.expenses)));
      const idxTax = idxGain.mul(0.2);
      const chosen = idxTax.lt(tax);
      result.indexedCost = indexed.toFixed(2);
      result.indexedOption = { taxableGain: idxGain.toFixed(2), tax: idxTax.toFixed(2), chosen };
      if (chosen) {
        result.taxableGain = idxGain.toFixed(2);
        result.rate = 20;
        result.tax = idxTax.toFixed(2);
      }
      notes.push(`Land or building bought before 23 July 2024: the lower of 12.5% without indexation and 20% with indexation (${chosen ? 'indexation' : 'no indexation'} is lower).`);
    } else notes.push('The Cost Inflation Index for the year of sale is not in the table; the 20% with indexation option was not compared.');
  }
  return result;
}

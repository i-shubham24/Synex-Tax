import Decimal from 'decimal.js';

/**
 * Advance tax instalments and interest for short payment, as in sections 208, 211, 234B and 234C
 * of the Income-tax Act, 1961 (sections 404, 408, 424 and 425 of the 2025 Act, see SECTION_MAP),
 * with rule 119A of the Income-tax Rules, 1962 (amounts rounded down to the hundred, part of a month
 * counted as a month).
 *
 *   Liability: when tax for the year, less TDS and TCS, is Rs 10,000 or more (208). A resident
 *     senior citizen with no business or professional income is not liable (207(2)).
 *   Instalments (211): 15% by 15 June, 45% by 15 September, 75% by 15 December, 100% by 15 March;
 *     presumptive business or profession (44AD, 44ADA): 100% by 15 March.
 *   234C: 1% a month for three months on the shortfall against the first three instalments, and one
 *     month for the March instalment; no interest when 12% was paid by June or 36% by September.
 *   234B: when advance tax paid is less than 90% of the assessed tax, 1% a month or part of a month
 *     from 1 April after the year to the date of payment, on the shortfall.
 * 234C relief for capital gains and first-time business income after an instalment date is not
 * computed: the CA adjusts it. Check the 2025 Act's text for Tax Year 2026-27.
 */

export interface AdvanceTaxInput {
  /** First year of the financial year, for example 2025 for FY 2025-26. */
  fyStart: number;
  /** Tax on total income for the year (after rebate, with surcharge and cess). */
  totalTax: string | number;
  tdsTcs?: string | number;
  presumptive?: boolean;
  seniorWithoutBusiness?: boolean;
  /** Advance tax paid, by date. */
  payments?: Array<{ date: string; amount: string | number }>;
  /** When the balance (self-assessment tax) is or will be paid; 234B runs to this date. */
  balancePaidOn?: string;
}

export interface Instalment {
  dueDate: string;
  cumulativePercent: number;
  due: string;
  paidByDate: string;
  shortfall: string;
  months: number;
  interest234C: string;
}

export interface AdvanceTaxResult {
  liable: boolean;
  assessedTax: string;
  instalments: Instalment[];
  interest234C: string;
  interest234B: string;
  months234B: number;
  notes: string[];
}

const D = (v: string | number | undefined) => new Decimal(v || 0);
const down100 = (d: Decimal) => Decimal.max(0, d.div(100).floor().mul(100));

/** Months or part of a month from the start date (inclusive) to the end date. */
function monthsOrPartOf(from: string, to: string): number {
  if (to < from) return 0;
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
}

export function advanceTax(i: AdvanceTaxInput): AdvanceTaxResult {
  const notes: string[] = [];
  const assessed = Decimal.max(0, D(i.totalTax).sub(D(i.tdsTcs)));
  const y = i.fyStart;
  const liable = assessed.gte(10000) && !i.seniorWithoutBusiness;
  if (i.seniorWithoutBusiness) notes.push('A resident senior citizen with no business income does not pay advance tax.');
  else if (!liable) notes.push('Tax after TDS and TCS is below Rs 10,000: no advance tax.');

  const schedule: Array<[string, number, number, number]> = i.presumptive
    ? [[`${y + 1}-03-15`, 100, 1, 100]]
    : [[`${y}-06-15`, 15, 3, 12], [`${y}-09-15`, 45, 3, 36], [`${y}-12-15`, 75, 3, 75], [`${y + 1}-03-15`, 100, 1, 100]];
  const payments = (i.payments ?? []).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  const paidBy = (date: string) => payments.filter((p) => p.date <= date).reduce((s, p) => s.add(D(p.amount)), new Decimal(0));

  let total234C = new Decimal(0);
  const instalments: Instalment[] = schedule.map(([dueDate, pct, months, safe]) => {
    const due = assessed.mul(pct).div(100);
    const paid = paidBy(dueDate);
    const shortfall = Decimal.max(0, due.sub(paid));
    const safeHarbour = paid.gte(assessed.mul(safe).div(100));
    const interest = liable && !safeHarbour ? down100(shortfall).mul(0.01).mul(months) : new Decimal(0);
    total234C = total234C.add(interest);
    return { dueDate, cumulativePercent: pct, due: due.toFixed(2), paidByDate: paid.toFixed(2), shortfall: shortfall.toFixed(2), months, interest234C: interest.toFixed(2) };
  });

  const paidInYear = paidBy(`${y + 1}-03-31`);
  let interest234B = new Decimal(0);
  let months234B = 0;
  if (liable && paidInYear.lt(assessed.mul(0.9))) {
    const end = i.balancePaidOn && /^\d{4}-\d{2}-\d{2}$/.test(i.balancePaidOn) ? i.balancePaidOn : null;
    if (end) {
      months234B = monthsOrPartOf(`${y + 1}-04-01`, end);
      interest234B = down100(assessed.sub(paidInYear)).mul(0.01).mul(months234B);
    } else notes.push('Give the date the balance is paid to work out interest for short payment of advance tax.');
  }
  return {
    liable,
    assessedTax: assessed.toFixed(2),
    instalments,
    interest234C: total234C.toFixed(2),
    interest234B: interest234B.toFixed(2),
    months234B,
    notes,
  };
}

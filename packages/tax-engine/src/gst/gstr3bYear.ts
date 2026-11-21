import Decimal from 'decimal.js';
import { daysBetween, gstDueDate, type GstCadence } from '../compliance/calendar.js';

/**
 * GSTR-3B for a financial year, month by month, against what the rest of the data says:
 *   outward tax in 3B      against tax in the sales register (GSTR-1)
 *   input credit in 3B     against credit available in GSTR-2B
 * with cash paid, filing status and days late. Differences carry over the year, so a shortfall
 * in one month that is made good in another shows up as settled.
 */

export interface Gstr3bMonthInput {
  period: string; // YYYY-MM
  gstr1Tax?: string | number | null; // from the sales register
  gstr3bTax?: string | number | null; // gross liability declared in 3B
  itc2b?: string | number | null; // credit available in GSTR-2B
  itc3b?: string | number | null; // credit claimed in 3B
  cashPaid?: string | number | null;
  status?: string | null; // workflow status of the 3B
  filedOn?: string | null;
}

export interface Gstr3bMonth {
  period: string;
  dueDate: string;
  gstr1Tax: string;
  gstr3bTax: string;
  outputDifference: string; // GSTR-1 less 3B: positive means 3B declared less
  itc2b: string;
  itc3b: string;
  itcDifference: string; // 3B less 2B: positive means more claimed than 2B shows
  cashPaid: string;
  /** NOT_RECORDED: due, but no 3B for the month is kept here (it may have been filed elsewhere). */
  state: 'FILED' | 'FILED_LATE' | 'OVERDUE' | 'NOT_DUE' | 'IN_PROGRESS' | 'NOT_RECORDED';
  daysLate: number;
}

const D = (v: string | number | null | undefined) => new Decimal(v || 0);
const FILED = new Set(['FILED', 'CLOSED']);

export function gstr3bYear(input: { fyStart: number; gstin: string; cadence: GstCadence; months: Gstr3bMonthInput[]; today: string }) {
  const byPeriod = new Map(input.months.map((m) => [m.period, m]));
  const periods: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? input.fyStart : input.fyStart + 1;
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  // QRMP returns are quarterly: only the quarter's last month has a 3B.
  const used = input.cadence === 'QRMP' ? periods.filter((p) => Number(p.slice(5, 7)) % 3 === 0) : periods;
  let outCum = new Decimal(0);
  let itcCum = new Decimal(0);
  const totals = { gstr1Tax: new Decimal(0), gstr3bTax: new Decimal(0), itc2b: new Decimal(0), itc3b: new Decimal(0), cashPaid: new Decimal(0) };
  const months: Gstr3bMonth[] = used.map((p) => {
    // For QRMP, the quarter's GSTR-1 and 2B figures are the sum of its three months.
    const span = input.cadence === 'QRMP' ? periods.slice(periods.indexOf(p) - 2, periods.indexOf(p) + 1) : [p];
    const sum = (k: keyof Gstr3bMonthInput) => span.reduce((a, q) => a.add(D(byPeriod.get(q)?.[k] as string)), new Decimal(0));
    const row = byPeriod.get(p);
    const g1 = sum('gstr1Tax');
    const g3 = D(row?.gstr3bTax);
    const i2 = sum('itc2b');
    const i3 = D(row?.itc3b);
    const cash = D(row?.cashPaid);
    const due = gstDueDate('GSTR3B', p, input.cadence, input.gstin.slice(0, 2));
    const filed = FILED.has(row?.status ?? '');
    const end = filed ? row?.filedOn ?? due : input.today;
    const daysLate = filed || row?.status ? Math.max(0, daysBetween(due, end)) : 0;
    const state: Gstr3bMonth['state'] = filed ? (daysLate > 0 ? 'FILED_LATE' : 'FILED') : input.today > due ? (row?.status ? 'OVERDUE' : 'NOT_RECORDED') : row?.status ? 'IN_PROGRESS' : 'NOT_DUE';
    outCum = outCum.add(g1.sub(g3));
    itcCum = itcCum.add(i3.sub(i2));
    totals.gstr1Tax = totals.gstr1Tax.add(g1);
    totals.gstr3bTax = totals.gstr3bTax.add(g3);
    totals.itc2b = totals.itc2b.add(i2);
    totals.itc3b = totals.itc3b.add(i3);
    totals.cashPaid = totals.cashPaid.add(cash);
    return {
      period: p, dueDate: due, gstr1Tax: g1.toFixed(2), gstr3bTax: g3.toFixed(2), outputDifference: g1.sub(g3).toFixed(2),
      itc2b: i2.toFixed(2), itc3b: i3.toFixed(2), itcDifference: i3.sub(i2).toFixed(2), cashPaid: cash.toFixed(2), state, daysLate,
    };
  });
  return {
    year: `${input.fyStart}-${String((input.fyStart + 1) % 100).padStart(2, '0')}`,
    months,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(2)])) as Record<keyof typeof totals, string>,
    // Positive: 3B declared less output tax than GSTR-1 for the year; or claimed more credit than 2B showed.
    netOutputShortfall: outCum.toFixed(2),
    netExcessCredit: itcCum.toFixed(2),
  };
}

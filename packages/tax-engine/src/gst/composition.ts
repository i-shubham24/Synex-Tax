import Decimal from 'decimal.js';
import { daysBetween, type IsoDate } from '../compliance/calendar.js';

/**
 * Composition levy: CMP-08 (quarterly statement and payment) and GSTR-4 (annual return).
 *
 * Rates under rule 7 of the CGST Rules and Notification 2/2019-CT(Rate), split equally between
 * CGST and SGST:
 *   manufacturers                         1% of turnover in the State
 *   restaurants (no alcohol)              5% of turnover in the State
 *   traders and other suppliers           1% of turnover of taxable supplies in the State
 *   section 10(2A) service providers      6% of turnover of taxable supplies in the State
 * Tax payable under reverse charge on inward supplies is added at the rates that apply to them.
 * Late payment carries interest at 18% a year for each day (section 50(1)).
 */

export type CompositionKind = 'MANUFACTURER' | 'RESTAURANT' | 'TRADER' | 'SERVICES_10_2A';

export const COMPOSITION_RATE: Record<CompositionKind, number> = { MANUFACTURER: 1, RESTAURANT: 5, TRADER: 1, SERVICES_10_2A: 6 };

/** Whether exempt supplies are part of the base (manufacturers and restaurants pay on turnover in the State). */
const EXEMPT_IN_BASE: Record<CompositionKind, boolean> = { MANUFACTURER: true, RESTAURANT: true, TRADER: false, SERVICES_10_2A: false };

export interface Cmp08Input {
  kind: CompositionKind;
  fyStart: number; // 2026 for 2026-27
  quarter: 1 | 2 | 3 | 4;
  taxableTurnover: string | number;
  exemptTurnover?: string | number;
  rcmCgst?: string | number; // tax on inward supplies under reverse charge
  rcmSgst?: string | number;
  rcmIgst?: string | number;
  rcmCess?: string | number;
  paidOn?: IsoDate | null;
}

export interface Cmp08Result {
  period: string; // e.g. "Q2 2026-27"
  dueDate: IsoDate;
  rate: number;
  base: string;
  outward: { cgst: string; sgst: string };
  reverseCharge: { igst: string; cgst: string; sgst: string; cess: string };
  total: string;
  daysLate: number;
  interest: string;
}

/** CMP-08 is due on the 18th of the month after the quarter. */
export function cmp08DueDate(fyStart: number, quarter: 1 | 2 | 3 | 4): IsoDate {
  return [`${fyStart}-07-18`, `${fyStart}-10-18`, `${fyStart + 1}-01-18`, `${fyStart + 1}-04-18`][quarter - 1];
}

const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function cmp08(input: Cmp08Input): Cmp08Result {
  const rate = COMPOSITION_RATE[input.kind];
  const base = new Decimal(input.taxableTurnover || 0).add(EXEMPT_IN_BASE[input.kind] ? input.exemptTurnover || 0 : 0);
  const half = r2(base.mul(rate).div(200));
  const rc = { igst: new Decimal(input.rcmIgst || 0), cgst: new Decimal(input.rcmCgst || 0), sgst: new Decimal(input.rcmSgst || 0), cess: new Decimal(input.rcmCess || 0) };
  const total = half.mul(2).add(rc.igst).add(rc.cgst).add(rc.sgst).add(rc.cess);
  const dueDate = cmp08DueDate(input.fyStart, input.quarter);
  const daysLate = input.paidOn ? Math.max(0, daysBetween(dueDate, input.paidOn)) : 0;
  const interest = r2(total.mul(0.18).mul(daysLate).div(365));
  return {
    period: `Q${input.quarter} ${input.fyStart}-${String((input.fyStart + 1) % 100).padStart(2, '0')}`,
    dueDate,
    rate,
    base: base.toFixed(2),
    outward: { cgst: half.toFixed(2), sgst: half.toFixed(2) },
    reverseCharge: { igst: rc.igst.toFixed(2), cgst: rc.cgst.toFixed(2), sgst: rc.sgst.toFixed(2), cess: rc.cess.toFixed(2) },
    total: total.toFixed(2),
    daysLate,
    interest: interest.toFixed(2),
  };
}

/** GSTR-4 for a year: what was declared in the four CMP-08s (table 5) and the turnover by rate (table 6). */
export function gstr4Annual(fyStart: number, quarters: Cmp08Result[], paidTax: string | number = 0) {
  const sum = (f: (q: Cmp08Result) => string) => quarters.reduce((s, q) => s.add(f(q)), new Decimal(0));
  const declared = {
    cgst: sum((q) => q.outward.cgst).add(sum((q) => q.reverseCharge.cgst)),
    sgst: sum((q) => q.outward.sgst).add(sum((q) => q.reverseCharge.sgst)),
    igst: sum((q) => q.reverseCharge.igst),
    cess: sum((q) => q.reverseCharge.cess),
  };
  const byRate = new Map<number, Decimal>();
  for (const q of quarters) byRate.set(q.rate, (byRate.get(q.rate) ?? new Decimal(0)).add(q.base));
  const total = declared.cgst.add(declared.sgst).add(declared.igst).add(declared.cess);
  return {
    year: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`,
    dueDate: `${fyStart + 1}-04-30` as IsoDate,
    quartersFound: quarters.map((q) => q.period),
    missingQuarters: [1, 2, 3, 4].filter((n) => !quarters.some((q) => q.period.startsWith(`Q${n} `))).map((n) => `Q${n}`),
    declared: { cgst: declared.cgst.toFixed(2), sgst: declared.sgst.toFixed(2), igst: declared.igst.toFixed(2), cess: declared.cess.toFixed(2), total: total.toFixed(2) },
    turnoverByRate: [...byRate.entries()].sort(([a], [b]) => a - b).map(([rate, base]) => ({ rate, turnover: base.toFixed(2), cgst: r2(base.mul(rate).div(200)).toFixed(2), sgst: r2(base.mul(rate).div(200)).toFixed(2) })),
    paid: new Decimal(paidTax || 0).toFixed(2),
    balance: Decimal.max(total.sub(paidTax || 0), 0).toFixed(2),
  };
}

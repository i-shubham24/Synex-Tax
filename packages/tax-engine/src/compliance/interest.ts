import Decimal from 'decimal.js';
import { roundInterestBaseRule269 } from '../math/rounding.js';
import type { IsoDate } from './calendar.js';

/**
 * Calendar months touched from `from` to `to`, a part of a month counting as a whole month.
 * 0 when `to` is not after `from`.
 */
export function monthsOrPart(from: IsoDate, to: IsoDate): number {
  if (to <= from) return 0;
  const [y1, m1] = from.split('-').map(Number);
  const [y2, m2] = to.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

/** Deposit due date for tax deducted on a date: the 7th of the next month, or 30 April for March. */
export function tdsDepositDueDate(deductedOn: IsoDate): IsoDate {
  const [y, m] = deductedOn.split('-').map(Number);
  if (m === 3) return `${y}-04-30`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-07`;
}

export interface TdsInterestInput {
  tax: string | number; // tax deductible, rupees
  deductibleOn: IsoDate; // date tax should have been deducted
  deductedOn: IsoDate; // date it was deducted
  depositedOn: IsoDate; // date it was paid to the government
}

export interface TdsInterestResult {
  base: string; // tax rounded down to the hundred
  lateDeductionMonths: number;
  lateDeductionInterest: string; // 1% a month
  depositDueOn: IsoDate;
  lateDepositMonths: number;
  lateDepositInterest: string; // 1.5% a month
  total: string;
}

/**
 * Interest on late deduction (1% a month, from when deductible to when deducted) and late deposit
 * (1.5% a month, from when deducted to when paid, only if paid after the due date). Section 201(1A)
 * of the 1961 Act; section 398 of the 2025 Act carries the same rates.
 */
export function tdsInterest({ tax, deductibleOn, deductedOn, depositedOn }: TdsInterestInput): TdsInterestResult {
  const base = roundInterestBaseRule269(tax);
  const lateDeductionMonths = monthsOrPart(deductibleOn, deductedOn);
  const depositDueOn = tdsDepositDueDate(deductedOn);
  const lateDepositMonths = depositedOn > depositDueOn ? monthsOrPart(deductedOn, depositedOn) : 0;
  const ded = base.mul(0.01).mul(lateDeductionMonths);
  const dep = base.mul(0.015).mul(lateDepositMonths);
  return {
    base: base.toFixed(2),
    lateDeductionMonths,
    lateDeductionInterest: ded.toFixed(2),
    depositDueOn,
    lateDepositMonths,
    lateDepositInterest: dep.toFixed(2),
    total: new Decimal(ded).add(dep).toFixed(2),
  };
}

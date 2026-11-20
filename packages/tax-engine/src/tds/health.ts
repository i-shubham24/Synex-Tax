import Decimal from 'decimal.js';
import { lateFilingFee, daysBetween, type IsoDate } from '../compliance/calendar.js';
import { tdsDepositDueDate, tdsInterest } from '../compliance/interest.js';

/**
 * TDS health for one deductor (or a whole firm): what will cost money or block filing if left.
 * Pure function over plain rows so the API can feed it from the database and tests from fixtures.
 */

export interface HealthChallan {
  id: string;
  label: string; // e.g. "BSR 0510308 / 00417, 7 Nov 2026"
  depositDate: IsoDate;
  taxDeposited: string; // income tax part of the challan
}

export interface HealthDeductee {
  id: string;
  challanId: string;
  pan: string;
  panStatus?: string; // OPERATIVE, INOPERATIVE, INVALID, UNAVAILABLE
  name: string;
  taxDeducted: string;
  taxDeposited: string;
  deductionDate: IsoDate;
}

export interface HealthReturn {
  id: string;
  label: string; // e.g. "Form 140 Q3 TY 2026-27"
  dueDate: IsoDate;
  status: string; // workflow status
  filedOn?: IsoDate | null;
  totalTax: string;
  correctionWindowEndsOn?: IsoDate | null;
}

export interface TdsHealthReport {
  challans: Array<{ id: string; label: string; deposited: string; consumed: string; balance: string; state: 'UNCONSUMED' | 'OVER_CONSUMED' | 'BALANCED' }>;
  lateDeposits: Array<{ deducteeId: string; name: string; deductedOn: IsoDate; dueOn: IsoDate; paidOn: IsoDate; months: number; interest: string }>;
  lateFees: Array<{ returnId: string; label: string; dueOn: IsoDate; daysLate: number; fee: string }>;
  panIssues: Array<{ deducteeId: string; name: string; pan: string; reason: string }>;
  correctionsClosing: Array<{ returnId: string; label: string; closesOn: IsoDate; daysLeft: number }>;
  totals: { unconsumed: string; overConsumed: string; interest: string; lateFees: string };
}

const FILED = new Set(['FILED', 'CLOSED']);

export function tdsHealth(input: { challans: HealthChallan[]; deductees: HealthDeductee[]; returns: HealthReturn[]; today: IsoDate; correctionHorizonDays?: number }): TdsHealthReport {
  const { challans, deductees, returns, today, correctionHorizonDays = 90 } = input;

  const consumedBy = new Map<string, Decimal>();
  for (const d of deductees) consumedBy.set(d.challanId, (consumedBy.get(d.challanId) ?? new Decimal(0)).add(d.taxDeposited));

  let unconsumed = new Decimal(0);
  let over = new Decimal(0);
  const challanRows = challans.map((c) => {
    const consumed = consumedBy.get(c.id) ?? new Decimal(0);
    const balance = new Decimal(c.taxDeposited).sub(consumed);
    const state = balance.gt(0) ? 'UNCONSUMED' : balance.lt(0) ? 'OVER_CONSUMED' : 'BALANCED';
    if (balance.gt(0)) unconsumed = unconsumed.add(balance);
    if (balance.lt(0)) over = over.add(balance.neg());
    return { id: c.id, label: c.label, deposited: new Decimal(c.taxDeposited).toFixed(2), consumed: consumed.toFixed(2), balance: balance.toFixed(2), state } as const;
  });

  const challanById = new Map(challans.map((c) => [c.id, c]));
  let interest = new Decimal(0);
  const lateDeposits: TdsHealthReport['lateDeposits'] = [];
  const panIssues: TdsHealthReport['panIssues'] = [];
  for (const d of deductees) {
    const ch = challanById.get(d.challanId);
    if (ch && d.deductionDate) {
      const due = tdsDepositDueDate(d.deductionDate);
      if (ch.depositDate > due) {
        const r = tdsInterest({ tax: d.taxDeducted, deductibleOn: d.deductionDate, deductedOn: d.deductionDate, depositedOn: ch.depositDate });
        interest = interest.add(r.lateDepositInterest);
        lateDeposits.push({ deducteeId: d.id, name: d.name, deductedOn: d.deductionDate, dueOn: due, paidOn: ch.depositDate, months: r.lateDepositMonths, interest: r.lateDepositInterest });
      }
    }
    if (['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(d.pan)) panIssues.push({ deducteeId: d.id, name: d.name, pan: d.pan, reason: 'No valid PAN: the higher rate applies and the payee gets no credit' });
    else if (d.panStatus === 'INOPERATIVE') panIssues.push({ deducteeId: d.id, name: d.name, pan: d.pan, reason: 'PAN is inoperative (not linked with Aadhaar): the higher rate applies' });
    else if (d.panStatus === 'INVALID') panIssues.push({ deducteeId: d.id, name: d.name, pan: d.pan, reason: 'PAN failed verification' });
  }

  let fees = new Decimal(0);
  const lateFees: TdsHealthReport['lateFees'] = [];
  const correctionsClosing: TdsHealthReport['correctionsClosing'] = [];
  for (const r of returns) {
    const filedOn = r.filedOn ?? null;
    const endsOn = FILED.has(r.status) ? filedOn : today;
    if (endsOn && endsOn > r.dueDate) {
      const fee = lateFilingFee(r.dueDate, endsOn, Number(r.totalTax) || 0);
      if (fee > 0) {
        fees = fees.add(fee);
        lateFees.push({ returnId: r.id, label: r.label, dueOn: r.dueDate, daysLate: daysBetween(r.dueDate, endsOn), fee: new Decimal(fee).toFixed(2) });
      }
    }
    if (FILED.has(r.status) && r.correctionWindowEndsOn) {
      const left = daysBetween(today, r.correctionWindowEndsOn);
      if (left >= 0 && left <= correctionHorizonDays) correctionsClosing.push({ returnId: r.id, label: r.label, closesOn: r.correctionWindowEndsOn, daysLeft: left });
    }
  }

  return {
    challans: challanRows,
    lateDeposits,
    lateFees,
    panIssues,
    correctionsClosing,
    totals: { unconsumed: unconsumed.toFixed(2), overConsumed: over.toFixed(2), interest: interest.toFixed(2), lateFees: fees.toFixed(2) },
  };
}

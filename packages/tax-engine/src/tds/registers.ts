import Decimal from 'decimal.js';
import { daysBetween, type IsoDate } from '../compliance/calendar.js';
import { monthsOrPart, tdsDepositDueDate, tdsInterest } from '../compliance/interest.js';
import { roundInterestBaseRule269 } from '../math/rounding.js';

/**
 * TDS registers and default analysis for one deductor over a period, from the rows kept in
 * SynexTax (prepared or imported statements). Pure functions over plain rows.
 *
 *  - defaultAnalysis: late deduction and late deposit interest, tax deducted but not deposited,
 *    no-PAN rows taxed below the higher rate, declaration (flag B) rows without a Form 121 on file.
 *  - depositRegister: tax deducted in each month, its due date, the challans that paid it.
 *  - sectionRegister: section-wise totals in the shape of clause 34(a) of the tax audit report.
 *  - statementRegister: due and filing dates of each quarterly statement (clause 34(b)).
 */

export interface RegisterRow {
  id: string;
  form: string; // 138, 140, 143, 144, 24Q, 26Q, 27Q, 27EQ
  challanId: string;
  pan: string;
  name: string;
  sectionCode: string;
  paidOn: IsoDate; // date paid or credited
  amountPaid: string;
  taxDeducted: string;
  taxDeposited: string;
  deductedOn?: IsoDate | null;
  ratePercent?: string | null; // e.g. "10.0000"; blank for salary
  reasonCode?: string | null;
  form121Uin?: string | null;
}

export interface RegisterChallan {
  id: string;
  label: string;
  depositDate: IsoDate;
  interestPaid: string; // interest allocated on the challan
}

export interface Form121OnFile {
  pan: string;
  uin?: string | null;
}

export interface RegisterReturn {
  id: string;
  form: string;
  quarter: string;
  dueDate: IsoDate;
  filedOn?: IsoDate | null;
  status: string;
}

const NO_PAN = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);
const SALARY_FORMS = new Set(['138', '24Q']);
const TCS_FORMS = new Set(['143', '27EQ']);
/** Purchase of goods and e-commerce: the no-PAN rate is 5%, not 20%. */
const FIVE_PERCENT_NO_PAN = new Set(['1031', '1035', '94Q', '94O']);
/** Flag B: no deduction on account of a declaration (Form 121 under the 2025 Act, 15G/15H before). */
const DECLARATION_FLAG = 'B';

const d0 = () => new Decimal(0);
const money = (v: Decimal.Value) => new Decimal(v).toFixed(2);
const month = (iso: IsoDate) => iso.slice(0, 7);

export interface DefaultAnalysis {
  lateDeductions: Array<{ rowId: string; name: string; sectionCode: string; paidOn: IsoDate; deductedOn: IsoDate; months: number; interest: string }>;
  lateDeposits: Array<{ rowId: string; name: string; deductedOn: IsoDate; dueOn: IsoDate; paidOn: IsoDate; months: number; interest: string }>;
  notDeposited: Array<{ rowId: string; name: string; sectionCode: string; deducted: string; deposited: string; shortfall: string }>;
  noPanLowRate: Array<{ rowId: string; name: string; pan: string; sectionCode: string; rate: string; floor: string; amountPaid: string; shortBy: string }>;
  declarationsMissing: Array<{ rowId: string; name: string; pan: string; sectionCode: string; reason: string }>;
  totals: { lateDeductionInterest: string; lateDepositInterest: string; notDeposited: string; noPanShortfall: string; interestPaid: string; interestDue: string };
}

export function defaultAnalysis(input: { rows: RegisterRow[]; challans: RegisterChallan[]; form121?: Form121OnFile[] }): DefaultAnalysis {
  const challanById = new Map(input.challans.map((c) => [c.id, c]));
  const declarations = new Map<string, Form121OnFile[]>();
  for (const f of input.form121 ?? []) declarations.set(f.pan.toUpperCase(), [...(declarations.get(f.pan.toUpperCase()) ?? []), f]);

  const out: DefaultAnalysis = { lateDeductions: [], lateDeposits: [], notDeposited: [], noPanLowRate: [], declarationsMissing: [], totals: { lateDeductionInterest: '0.00', lateDepositInterest: '0.00', notDeposited: '0.00', noPanShortfall: '0.00', interestPaid: '0.00', interestDue: '0.00' } };
  let lateDed = d0();
  let lateDep = d0();
  let short = d0();
  let noPanShort = d0();

  for (const r of input.rows) {
    const ded = new Decimal(r.taxDeducted || 0);
    const dep = new Decimal(r.taxDeposited || 0);
    const paid = new Decimal(r.amountPaid || 0);
    const reason = (r.reasonCode ?? '').toUpperCase();

    // Deducted (or collected) after the date of payment or credit: 1% a month or part.
    if (!TCS_FORMS.has(r.form) && ded.gt(0) && r.deductedOn && r.paidOn && r.deductedOn > r.paidOn) {
      const months = monthsOrPart(r.paidOn, r.deductedOn);
      const interest = roundInterestBaseRule269(ded).mul(0.01).mul(months);
      if (interest.gt(0)) {
        lateDed = lateDed.add(interest);
        out.lateDeductions.push({ rowId: r.id, name: r.name, sectionCode: r.sectionCode, paidOn: r.paidOn, deductedOn: r.deductedOn, months, interest: money(interest) });
      }
    }

    // Deposited after the due date for the month of deduction: 1.5% a month or part.
    const ch = challanById.get(r.challanId);
    if (ch && r.deductedOn && ded.gt(0)) {
      const due = tdsDepositDueDate(r.deductedOn);
      if (ch.depositDate > due) {
        const res = tdsInterest({ tax: ded.toFixed(2), deductibleOn: r.deductedOn, deductedOn: r.deductedOn, depositedOn: ch.depositDate });
        lateDep = lateDep.add(res.lateDepositInterest);
        out.lateDeposits.push({ rowId: r.id, name: r.name, deductedOn: r.deductedOn, dueOn: due, paidOn: ch.depositDate, months: res.lateDepositMonths, interest: res.lateDepositInterest });
      }
    }

    if (ded.gt(dep)) {
      short = short.add(ded.sub(dep));
      out.notDeposited.push({ rowId: r.id, name: r.name, sectionCode: r.sectionCode, deducted: money(ded), deposited: money(dep), shortfall: money(ded.sub(dep)) });
    }

    // Without a PAN the higher rate applies: at least 20% (5% for purchase of goods and e-commerce).
    // Salary is left out: there the higher rate is measured against the average rate for the year.
    if (NO_PAN.has(r.pan.toUpperCase()) && !SALARY_FORMS.has(r.form) && !TCS_FORMS.has(r.form) && paid.gt(0) && !['A', 'B', 'Y', 'T', 'S'].includes(reason)) {
      const floor = FIVE_PERCENT_NO_PAN.has(r.sectionCode) ? new Decimal(5) : new Decimal(20);
      const effective = ded.div(paid).mul(100);
      if (effective.lt(floor.sub(0.005))) {
        const shortBy = paid.mul(floor).div(100).sub(ded);
        noPanShort = noPanShort.add(shortBy);
        out.noPanLowRate.push({ rowId: r.id, name: r.name, pan: r.pan, sectionCode: r.sectionCode, rate: effective.toFixed(2), floor: floor.toFixed(0), amountPaid: money(paid), shortBy: money(shortBy) });
      }
    }

    if (reason === DECLARATION_FLAG) {
      const onFile = declarations.get(r.pan.toUpperCase()) ?? [];
      if (NO_PAN.has(r.pan.toUpperCase())) out.declarationsMissing.push({ rowId: r.id, name: r.name, pan: r.pan, sectionCode: r.sectionCode, reason: 'A declaration is not valid without the payee’s PAN.' });
      else if (!onFile.length) out.declarationsMissing.push({ rowId: r.id, name: r.name, pan: r.pan, sectionCode: r.sectionCode, reason: 'No declaration from this PAN is recorded in the Form 121 register.' });
      else if (r.form === '140' && r.form121Uin && !onFile.some((f) => (f.uin ?? '').toUpperCase() === r.form121Uin!.toUpperCase())) {
        out.declarationsMissing.push({ rowId: r.id, name: r.name, pan: r.pan, sectionCode: r.sectionCode, reason: `Identification number ${r.form121Uin} is not in the Form 121 register.` });
      }
    }
  }

  const interestPaid = input.challans.reduce((s, c) => s.add(c.interestPaid || 0), d0());
  const interestDue = lateDed.add(lateDep).sub(interestPaid);
  out.totals = {
    lateDeductionInterest: money(lateDed),
    lateDepositInterest: money(lateDep),
    notDeposited: money(short),
    noPanShortfall: money(noPanShort),
    interestPaid: money(interestPaid),
    interestDue: money(Decimal.max(interestDue, 0)),
  };
  return out;
}

export interface DepositMonth {
  month: string; // YYYY-MM of deduction
  deducted: string;
  dueOn: IsoDate;
  payments: Array<{ challanId: string; label: string; paidOn: IsoDate; amount: string; late: boolean }>;
  deposited: string;
  lateInterest: string;
}

/** Tax deducted in each month, when it was due and which challans paid it. */
export function depositRegister(input: { rows: RegisterRow[]; challans: RegisterChallan[] }): DepositMonth[] {
  const challanById = new Map(input.challans.map((c) => [c.id, c]));
  const months = new Map<string, { ded: Decimal; dep: Decimal; interest: Decimal; pay: Map<string, Decimal> }>();
  for (const r of input.rows) {
    const when = r.deductedOn || r.paidOn;
    if (!when) continue;
    const key = month(when);
    const m = months.get(key) ?? { ded: d0(), dep: d0(), interest: d0(), pay: new Map() };
    m.ded = m.ded.add(r.taxDeducted || 0);
    m.dep = m.dep.add(r.taxDeposited || 0);
    m.pay.set(r.challanId, (m.pay.get(r.challanId) ?? d0()).add(r.taxDeposited || 0));
    const ch = challanById.get(r.challanId);
    if (ch && r.deductedOn && new Decimal(r.taxDeducted || 0).gt(0)) {
      m.interest = m.interest.add(tdsInterest({ tax: r.taxDeducted, deductibleOn: r.deductedOn, deductedOn: r.deductedOn, depositedOn: ch.depositDate }).lateDepositInterest);
    }
    months.set(key, m);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, m]) => {
      const dueOn = tdsDepositDueDate(`${key}-01`);
      return {
        month: key,
        deducted: money(m.ded),
        dueOn,
        payments: [...m.pay.entries()]
          .map(([id, amount]) => {
            const ch = challanById.get(id);
            return { challanId: id, label: ch?.label ?? 'Challan not found', paidOn: ch?.depositDate ?? '', amount: money(amount), late: !!ch && ch.depositDate > dueOn };
          })
          .sort((a, b) => a.paidOn.localeCompare(b.paidOn)),
        deposited: money(m.dep),
        lateInterest: money(m.interest),
      };
    });
}

export interface SectionLine {
  form: string;
  sectionCode: string;
  payments: number;
  amountPaid: string;
  /** Clause 34(a) columns 6 and 7: deducted at the rate that applies. */
  fullRateAmount: string;
  fullRateTax: string;
  /** Columns 8 and 9: lower or no deduction (a reason flag, or nothing deducted). */
  lowerRateAmount: string;
  lowerRateTax: string;
  /** Column 10: deducted but not deposited. */
  notDeposited: string;
}

/**
 * Section-wise totals for the tax audit report (clause 34(a) of Form 3CD). Columns 4 and 5 (all
 * payments of that nature, and the part on which tax was required to be deducted) come from the
 * books, not from statements, so they are left to the auditor.
 */
export function sectionRegister(rows: RegisterRow[]): SectionLine[] {
  const by = new Map<string, { form: string; code: string; n: number; paid: Decimal; fa: Decimal; ft: Decimal; la: Decimal; lt: Decimal; nd: Decimal }>();
  for (const r of rows) {
    const key = `${r.form}|${r.sectionCode}`;
    const s = by.get(key) ?? { form: r.form, code: r.sectionCode, n: 0, paid: d0(), fa: d0(), ft: d0(), la: d0(), lt: d0(), nd: d0() };
    const paid = new Decimal(r.amountPaid || 0);
    const ded = new Decimal(r.taxDeducted || 0);
    const dep = new Decimal(r.taxDeposited || 0);
    s.n += 1;
    s.paid = s.paid.add(paid);
    const reason = (r.reasonCode ?? '').toUpperCase();
    // Flag C is a higher rate, not a lower one.
    if ((reason && reason !== 'C') || ded.isZero()) {
      s.la = s.la.add(paid);
      s.lt = s.lt.add(ded);
    } else {
      s.fa = s.fa.add(paid);
      s.ft = s.ft.add(ded);
    }
    if (ded.gt(dep)) s.nd = s.nd.add(ded.sub(dep));
    by.set(key, s);
  }
  return [...by.values()]
    .sort((a, b) => a.form.localeCompare(b.form) || a.code.localeCompare(b.code))
    .map((s) => ({
      form: s.form,
      sectionCode: s.code,
      payments: s.n,
      amountPaid: money(s.paid),
      fullRateAmount: money(s.fa),
      fullRateTax: money(s.ft),
      lowerRateAmount: money(s.la),
      lowerRateTax: money(s.lt),
      notDeposited: money(s.nd),
    }));
}

/** Clause 34(b): each quarterly statement, its due date and when it was furnished. */
export function statementRegister(returns: RegisterReturn[], today: IsoDate) {
  return returns
    .map((r) => {
      const done = ['FILED', 'CLOSED'].includes(r.status);
      const filed = done ? r.filedOn ?? null : null;
      // Imported history is filed, but the file does not say when.
      const state = filed ? (filed <= r.dueDate ? 'ON_TIME' : 'LATE') : done ? 'FILED_DATE_UNKNOWN' : today > r.dueDate ? 'OVERDUE' : 'NOT_DUE';
      const end = filed ?? (done ? r.dueDate : today);
      return {
        id: r.id,
        form: r.form,
        quarter: r.quarter,
        dueDate: r.dueDate,
        filedOn: filed,
        state,
        daysLate: Math.max(0, daysBetween(r.dueDate, end)),
      } as const;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.form.localeCompare(b.form));
}

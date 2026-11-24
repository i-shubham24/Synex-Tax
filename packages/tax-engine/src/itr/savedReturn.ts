import Decimal from 'decimal.js';
import { itrComputation, type ItrInput } from './computation.js';
import { advanceTax } from '../assistant/advanceTax.js';
import type { AgeBand, Regime } from '../tds/salary.js';

/**
 * Saved returns of a CA practice: the five assessment years kept per client, the summary of a saved
 * return and the challan values for e-Pay Tax worked from it.
 *
 * Only Assessment Year 2026-27 is computed here (itrComputation carries the rates for income of
 * 2025-26). For earlier years the figures are those of the return as filed, entered by the user:
 * nothing here works tax for those years.
 */

export const ITR_ASSESSMENT_YEARS = ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27'] as const;
export type ItrAssessmentYear = (typeof ITR_ASSESSMENT_YEARS)[number];
/** The year itrComputation works the tax for. */
export const ITR_ENGINE_AY: ItrAssessmentYear = '2026-27';
export const ITR_FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-U'] as const;
export type ItrFormName = (typeof ITR_FORMS)[number];
/** Forms whose figures come from the individual computation on the ITR page. */
export const ITR_ENGINE_FORMS: readonly ItrFormName[] = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-U'];

/** Figures on the ITR page, keyed like 'salary.gross'. */
export type ItrPageValues = Record<string, string>;

const D = (v: string | number | undefined | null) => {
  try { return new Decimal(v || 0); } catch { return new Decimal(0); }
};
const r0 = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

/** The ITR page's figures as the computation's input (the same mapping the page uses). */
export function itrInputFromValues(v: ItrPageValues, ageBand: AgeBand = 'BELOW_60', metroCity = false): ItrInput {
  const g = (k: string) => v[k] || undefined;
  return {
    ageBand,
    salary: g('salary.gross') ? { gross: v['salary.gross'], basicPlusDa: g('salary.basicPlusDa'), hraReceived: g('salary.hraReceived'), rentPaid: g('salary.rentPaid'), metroCity, professionalTax: g('salary.professionalTax'), employerNps: g('salary.employerNps') } : undefined,
    house: { selfOccupiedInterest: g('house.selfOccupiedInterest'), letOut: g('house.rent') ? [{ rent: v['house.rent'], municipalTax: g('house.municipalTax'), interest: g('house.interest') }] : [] },
    business: { digitalTurnover: g('business.digitalTurnover'), otherTurnover: g('business.otherTurnover'), professionalReceipts: g('business.professionalReceipts'), actualProfit: g('business.actualProfit') },
    capitalGains: { equityShortTerm: g('capitalGains.equityShortTerm'), equityLongTerm: g('capitalGains.equityLongTerm'), otherLongTerm: g('capitalGains.otherLongTerm'), otherShortTerm: g('capitalGains.otherShortTerm') },
    otherSources: { savingsInterest: g('otherSources.savingsInterest'), depositInterest: g('otherSources.depositInterest'), dividends: g('otherSources.dividends'), other: g('otherSources.other') },
    deductions: { section80C: g('deductions.section80C'), npsSelf: g('deductions.npsSelf'), healthInsurance: g('deductions.healthInsurance'), other: g('deductions.other') },
    taxesPaid: { tds: g('taxesPaid.tds'), tcs: g('taxesPaid.tcs'), advanceTax: g('taxesPaid.advanceTax'), selfAssessment: g('taxesPaid.selfAssessment') },
  };
}

export interface SavedReturnSummary {
  /** ENGINE: worked by itrComputation for AY 2026-27. ENTERED: the figures of the return as filed. */
  basis: 'ENGINE' | 'ENTERED';
  regime: Regime;
  heads?: { salary: number; houseProperty: number; business: number; capitalGainsNormal: number; capitalGainsSpecial: number; otherSources: number };
  grossTotalIncome?: number;
  deductions?: number;
  totalIncome: number;
  /** Tax after rebate, before surcharge and cess. */
  tax: number;
  rebate?: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  tdsTcs: number;
  advanceTax: number;
  selfAssessment: number;
  taxesPaid: number;
  /** Positive: to pay; negative: refund. */
  payable: number;
  presumptive: boolean;
  notes: string[];
}

/** The summary of a return on the ITR page, worked for AY 2026-27 under the regime chosen. */
export function engineSummary(values: ItrPageValues, regime: Regime, ageBand: AgeBand = 'BELOW_60', metroCity = false): SavedReturnSummary {
  const r = itrComputation(itrInputFromValues(values, ageBand, metroCity))[regime];
  const n = (k: string) => r0(D(values[k]));
  const tdsTcs = n('taxesPaid.tds') + n('taxesPaid.tcs');
  const special = D(r.specialRate.equityShortTerm).add(D(r.specialRate.equityLongTermTaxable)).add(D(r.specialRate.otherLongTerm));
  const totalTax = r0(D(r.totalTax));
  const surcharge = r0(D(r.surcharge));
  const cess = r0(D(r.cess));
  const presumptive = n('business.actualProfit') === 0 && (n('business.digitalTurnover') + n('business.otherTurnover') + n('business.professionalReceipts')) > 0;
  return {
    basis: 'ENGINE', regime,
    heads: { salary: r0(D(r.heads.salary)), houseProperty: r0(D(r.heads.houseProperty)), business: r0(D(r.heads.business)), capitalGainsNormal: r0(D(r.heads.capitalGainsNormal)), capitalGainsSpecial: r0(special), otherSources: r0(D(r.heads.otherSources)) },
    grossTotalIncome: r0(D(r.grossTotalIncome)), deductions: r0(D(r.deductions)), totalIncome: r0(D(r.totalIncome)),
    tax: totalTax - surcharge - cess, rebate: r0(D(r.rebate)), surcharge, cess, totalTax,
    tdsTcs, advanceTax: n('taxesPaid.advanceTax'), selfAssessment: n('taxesPaid.selfAssessment'), taxesPaid: r0(D(r.taxesPaid)),
    payable: r0(D(r.payable)), presumptive, notes: r.notes,
  };
}

export interface FiledFigures { totalIncome: number; totalTax: number; surcharge?: number; cess?: number; tdsTcs?: number; advanceTax?: number; selfAssessment?: number }

/** The summary of a return as filed, from the figures entered (earlier years and ITR-5 or ITR-6). */
export function enteredSummary(f: FiledFigures, regime: Regime): SavedReturnSummary {
  const w = (x: number | undefined) => Math.max(0, Math.round(x ?? 0));
  const totalTax = w(f.totalTax); const surcharge = w(f.surcharge); const cess = w(f.cess);
  const tdsTcs = w(f.tdsTcs); const advance = w(f.advanceTax); const sa = w(f.selfAssessment);
  const paid = tdsTcs + advance + sa;
  return {
    basis: 'ENTERED', regime, totalIncome: w(f.totalIncome), tax: Math.max(0, totalTax - surcharge - cess), surcharge, cess, totalTax,
    tdsTcs, advanceTax: advance, selfAssessment: sa, taxesPaid: paid, payable: totalTax - paid, presumptive: false, notes: [],
  };
}

export interface ChallanPayment { date: string; amount: number; kind: 'ADVANCE' | 'SELF' }

export interface ChallanInput {
  assessmentYear: ItrAssessmentYear;
  /** A company pays under major head 0020 (corporation tax); everyone else under 0021. */
  company: boolean;
  summary: SavedReturnSummary;
  /** Dated payments (from Form 26AS or the challans); needed for interest under 234B and 234C. */
  payments?: ChallanPayment[];
  /** Date the challan will be paid, YYYY-MM-DD. */
  payOn: string;
  /** A resident senior citizen with no business or profession income (section 207(2)). */
  seniorWithoutBusiness?: boolean;
  /** Worked outside this tool and entered as they are. */
  interest234A?: number;
  fee234F?: number;
}

export interface ChallanValues {
  majorHead: '0020' | '0021';
  majorHeadName: string;
  minorHead: '100' | '300';
  minorHeadName: string;
  tax: number; surcharge: number; cess: number; interest: number; penalty: number; fee: number; others: number; total: number;
}

export interface ChallanResult {
  /** Self-assessment tax challan for the balance, or null when nothing is due. */
  selfAssessment: ChallanValues | null;
  /** Advance tax instalments of the financial year, as the dates stood. */
  instalments: Array<{ dueDate: string; cumulativePercent: number; due: number; paidByDate: number; shortfall: number; interest234C: number }>;
  /** The next instalment still open on payOn, as an advance tax challan, or null once the year has ended. */
  nextAdvance: (ChallanValues & { dueDate: string }) | null;
  interest: { i234A: number; i234B: number; i234C: number; months234B: number };
  notes: string[];
}

/**
 * Challan values for e-Pay Tax from a saved return. Interest under 234B and 234C uses the advance tax
 * module (sections 208, 211, 234B, 234C, rule 119A); interest under 234A and the fee under 234F are taken as
 * entered. Credits (TDS, TCS, tax paid) are set against tax first, then surcharge, then cess: the split
 * among the columns does not change the total.
 */
export function itrChallans(i: ChallanInput): ChallanResult {
  const s = i.summary;
  const notes: string[] = [];
  const major = i.company ? '0020' : '0021';
  const majorHeadName = i.company ? 'Corporation tax (0020)' : 'Income tax other than corporation tax (0021)';
  const fyStart = Number(i.assessmentYear.slice(0, 4)) - 1;
  const payments = (i.payments ?? []).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.amount > 0);
  const advancePayments = payments.filter((p) => p.kind === 'ADVANCE');
  const datedAdvance = advancePayments.reduce((a, p) => a + p.amount, 0);
  if (s.advanceTax > 0 && datedAdvance === 0) notes.push('Advance tax is entered as a total without dates; import Form 26AS so interest under 234B and 234C can be worked. Interest below assumes no advance tax was paid on time.');
  else if (datedAdvance > 0 && Math.abs(datedAdvance - s.advanceTax) > 1) notes.push('The dated advance tax challans do not add up to the advance tax on the return; check both.');

  const at = advanceTax({
    fyStart, totalTax: s.totalTax, tdsTcs: s.tdsTcs, presumptive: s.presumptive, seniorWithoutBusiness: i.seniorWithoutBusiness,
    payments: advancePayments.map((p) => ({ date: p.date, amount: p.amount })), balancePaidOn: i.payOn,
  });
  notes.push(...at.notes);
  const i234B = r0(D(at.interest234B));
  const i234C = r0(D(at.interest234C));
  const i234A = Math.max(0, Math.round(i.interest234A ?? 0));
  const fee = Math.max(0, Math.round(i.fee234F ?? 0));

  // Balance of tax after every credit, split so that credits go against tax, then surcharge, then cess.
  let credit = s.tdsTcs + s.advanceTax + s.selfAssessment;
  const take = (x: number) => { const used = Math.min(x, credit); credit -= used; return x - used; };
  const tax = take(s.tax); const surcharge = take(s.surcharge); const cess = take(s.cess);
  const interest = i234A + i234B + i234C;
  const total = tax + surcharge + cess + interest + fee;
  const selfAssessment: ChallanValues | null = total > 0 ? {
    majorHead: major, majorHeadName, minorHead: '300', minorHeadName: 'Self-assessment tax (300)',
    tax, surcharge, cess, interest, penalty: 0, fee, others: 0, total,
  } : null;
  if (!selfAssessment) notes.push(s.payable < 0 ? 'The return shows a refund; no self-assessment tax is due.' : 'No self-assessment tax is due.');

  const instalments = at.instalments.map((x) => ({ dueDate: x.dueDate, cumulativePercent: x.cumulativePercent, due: r0(D(x.due)), paidByDate: r0(D(x.paidByDate)), shortfall: r0(D(x.shortfall)), interest234C: r0(D(x.interest234C)) }));
  const open = at.liable ? instalments.find((x) => x.dueDate >= i.payOn) : undefined;
  let nextAdvance: ChallanResult['nextAdvance'] = null;
  if (open) {
    const paidSoFar = advancePayments.filter((p) => p.date <= i.payOn).reduce((a, p) => a + p.amount, 0);
    const due = Math.max(0, open.due - paidSoFar);
    if (due > 0) nextAdvance = { majorHead: major, majorHeadName, minorHead: '100', minorHeadName: 'Advance tax (100)', dueDate: open.dueDate, tax: due, surcharge: 0, cess: 0, interest: 0, penalty: 0, fee: 0, others: 0, total: due };
    notes.push('The instalment is shown in the tax column as one amount; split out surcharge and cess on e-Pay Tax if you want them shown separately.');
  } else if (i.payOn > `${fyStart + 1}-03-31`) {
    notes.push(`The financial year ${fyStart}-${String(fyStart + 1).slice(2)} has ended: any balance is paid as self-assessment tax (300).`);
  }
  return { selfAssessment, instalments, nextAdvance, interest: { i234A, i234B, i234C, months234B: at.months234B }, notes };
}

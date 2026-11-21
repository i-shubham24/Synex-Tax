import Decimal from 'decimal.js';
import type { SalaryInput } from './salary.js';

/**
 * Form 124 (Form 12BB before the 2025 rules): the employee's statement of claims for salary TDS.
 * The employer needs evidence with each claim, and some claims need more than an amount:
 *   rent above Rs 1 lakh a year     the landlord's name, address and PAN
 *   leave travel concession         evidence of travel
 *   interest on a home loan         the lender's name, address and PAN (for a lender who is not a bank or institution)
 *   Chapter VI-A deductions         evidence of each investment or payment
 * Most of these count only in the old regime; under the new regime the employer's NPS
 * contribution is the main deduction left.
 */

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

export interface Form124 {
  employeeName: string;
  employeePan: string;
  taxYear: number;
  regime: 'NEW' | 'OLD';
  rent?: { annual: string | number; landlordName?: string; landlordAddress?: string; landlordPan?: string; evidence?: boolean };
  lta?: { amount: string | number; evidence?: boolean };
  homeLoan?: { interest: string | number; lenderName?: string; lenderAddress?: string; lenderPan?: string; lenderIsInstitution?: boolean; evidence?: boolean };
  chapterVIA?: Array<{ section: string; amount: string | number; evidence?: boolean }>;
}

export interface Form124Check {
  claim: string;
  level: 'error' | 'warning';
  message: string;
}

/** What the employer must have before allowing each claim. */
export function form124Checks(f: Form124): Form124Check[] {
  const out: Form124Check[] = [];
  const err = (claim: string, message: string) => out.push({ claim, level: 'error', message });
  const warn = (claim: string, message: string) => out.push({ claim, level: 'warning', message });
  if (!PAN_RE.test(f.employeePan.toUpperCase())) err('Employee', 'The employee PAN is not valid.');
  const old = f.regime === 'OLD';

  if (f.rent && new Decimal(f.rent.annual || 0).gt(0)) {
    if (!old) warn('House rent', 'House rent allowance is not exempt under the new regime.');
    if (!f.rent.landlordName || !f.rent.landlordAddress) err('House rent', 'Give the landlord’s name and address.');
    if (new Decimal(f.rent.annual).gt(100000) && !PAN_RE.test((f.rent.landlordPan ?? '').toUpperCase())) err('House rent', 'Rent above Rs 1 lakh a year needs the landlord’s PAN.');
    if (!f.rent.evidence) warn('House rent', 'Rent receipts not yet received.');
  }
  if (f.lta && new Decimal(f.lta.amount || 0).gt(0)) {
    if (!old) warn('Leave travel', 'Leave travel concession is not exempt under the new regime.');
    if (!f.lta.evidence) err('Leave travel', 'Evidence of travel is needed before the exemption is allowed.');
  }
  if (f.homeLoan && new Decimal(f.homeLoan.interest || 0).gt(0)) {
    if (!old) warn('Home loan interest', 'Interest on a self-occupied home is not allowed under the new regime.');
    if (!f.homeLoan.lenderName || !f.homeLoan.lenderAddress) err('Home loan interest', 'Give the lender’s name and address.');
    if (!f.homeLoan.lenderIsInstitution && !PAN_RE.test((f.homeLoan.lenderPan ?? '').toUpperCase())) err('Home loan interest', 'A lender who is not a bank or financial institution must give a PAN.');
    if (new Decimal(f.homeLoan.interest).gt(200000)) warn('Home loan interest', 'Only Rs 2 lakh of interest on a self-occupied home counts.');
    if (!f.homeLoan.evidence) warn('Home loan interest', 'Interest certificate not yet received.');
  }
  for (const d of f.chapterVIA ?? []) {
    if (!old) warn(`Deduction ${d.section}`, 'Not allowed under the new regime (except the employer’s NPS contribution).');
    if (!d.evidence) warn(`Deduction ${d.section}`, 'Evidence not yet received.');
  }
  return out;
}

/** The claims as salary TDS inputs. Claims still missing what they need are left out. */
export function form124ToSalaryInput(f: Form124): Pick<SalaryInput, 'rentPaid' | 'ltaExempt' | 'homeLoanInterest' | 'section80C' | 'otherDeductions'> {
  const blocked = new Set(form124Checks(f).filter((c) => c.level === 'error').map((c) => c.claim));
  const sum = (pred: (s: string) => boolean) => (f.chapterVIA ?? []).filter((d) => pred(d.section.toUpperCase())).reduce((a, d) => a.add(d.amount || 0), new Decimal(0));
  return {
    rentPaid: f.rent && !blocked.has('House rent') ? new Decimal(f.rent.annual || 0).toFixed(2) : '0',
    ltaExempt: f.lta && !blocked.has('Leave travel') ? new Decimal(f.lta.amount || 0).toFixed(2) : '0',
    homeLoanInterest: f.homeLoan && !blocked.has('Home loan interest') ? new Decimal(f.homeLoan.interest || 0).toFixed(2) : '0',
    section80C: sum((s) => /^80C(CC|CD\(1\))?$/.test(s) || s === '80C').toFixed(2),
    otherDeductions: sum((s) => !/^80C(CC|CD\(1\))?$/.test(s) && s !== '80C').toFixed(2),
  };
}

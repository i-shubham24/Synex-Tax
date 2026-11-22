import Decimal from 'decimal.js';
import { form124Checks, form124ToSalaryInput, type Form124, type Form124Check } from './form124.js';
import { salaryTds, type AgeBand, type Regime } from './salary.js';

/**
 * Salary register for one deductor and tax year: each employee's tax for the year under the
 * regime they chose (and the other, for comparison), TDS deducted so far from the Form 138 rows,
 * and what to deduct each month for the rest of the year. Months are counted from April; an
 * employee who joined during the year is paid only from the month they joined.
 */

export interface SalaryEmployee {
  id: string;
  pan: string;
  name: string;
  regime: Regime;
  ageBand: AgeBand;
  metroCity: boolean;
  monthlyGross: string;
  monthlyBasicDa: string;
  monthlyHra: string;
  monthlyEmployerNps: string;
  annualPerquisites: string;
  professionalTax: string;
  joinedOn?: string | null;
  previousEmployer?: { salary?: string | number; professionalTax?: string | number; tds?: string | number } | null;
  form124?: Form124 | null;
}

export interface SalaryRegisterLine {
  id: string;
  pan: string;
  name: string;
  regime: Regime;
  monthsWorked: number;
  annualGross: string;
  taxableIncome: string;
  annualTax: string;
  otherRegimeTax: string;
  deductedSoFar: string;
  previousEmployerTds: string;
  monthsLeft: number;
  monthlyTds: string;
  form124: Form124Check[];
}

/** Months of the tax year from April to `today` inclusive (0 to 12), and months left after this one. */
export function monthPosition(taxYear: number, today: string): { elapsed: number; left: number } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const idx = (y - taxYear) * 12 + (m - 4); // April = 0
  const elapsed = Math.max(0, Math.min(12, idx + 1));
  return { elapsed, left: Math.max(1, 12 - Math.max(0, idx)) };
}

export function salaryRegister(input: { taxYear: number; today: string; employees: SalaryEmployee[]; deducted: Record<string, string> }): SalaryRegisterLine[] {
  const { left } = monthPosition(input.taxYear, input.today);
  return input.employees.map((e) => {
    const join = e.joinedOn && e.joinedOn > `${input.taxYear}-04-01` ? e.joinedOn : `${input.taxYear}-04-01`;
    const joinIdx = (Number(join.slice(0, 4)) - input.taxYear) * 12 + (Number(join.slice(5, 7)) - 4);
    const monthsWorked = Math.max(0, 12 - Math.max(0, joinIdx));
    const claims = e.form124 ? form124ToSalaryInput(e.form124) : {};
    const base = {
      grossSalary: new Decimal(e.monthlyGross).mul(monthsWorked).toFixed(2),
      basicPlusDa: new Decimal(e.monthlyBasicDa).mul(monthsWorked).toFixed(2),
      hraReceived: new Decimal(e.monthlyHra).mul(monthsWorked).toFixed(2),
      employerNps: new Decimal(e.monthlyEmployerNps).mul(monthsWorked).toFixed(2),
      perquisites: e.annualPerquisites,
      professionalTax: e.professionalTax,
      metroCity: e.metroCity,
      ageBand: e.ageBand,
      previousEmployer: e.previousEmployer ? { salary: e.previousEmployer.salary ?? 0, professionalTax: e.previousEmployer.professionalTax ?? 0, tds: e.previousEmployer.tds ?? 0 } : undefined,
      tdsAlreadyDeducted: input.deducted[e.id] ?? '0',
      monthsRemaining: left,
      ...claims,
    };
    const both = salaryTds(base);
    const chosen = both[e.regime];
    const other = both[e.regime === 'NEW' ? 'OLD' : 'NEW'];
    return {
      id: e.id,
      pan: e.pan,
      name: e.name,
      regime: e.regime,
      monthsWorked,
      annualGross: new Decimal(base.grossSalary).add(e.annualPerquisites || 0).add(e.previousEmployer?.salary || 0).toFixed(2),
      taxableIncome: chosen.taxableIncome,
      annualTax: chosen.totalTax,
      otherRegimeTax: other.totalTax,
      deductedSoFar: new Decimal(input.deducted[e.id] ?? 0).toFixed(2),
      previousEmployerTds: new Decimal(e.previousEmployer?.tds ?? 0).toFixed(2),
      monthsLeft: left,
      monthlyTds: chosen.monthlyTds,
      form124: e.form124 ? form124Checks({ ...e.form124, regime: e.regime }) : [],
    };
  });
}

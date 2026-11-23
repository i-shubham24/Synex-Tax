import Decimal from 'decimal.js';

/*
 * Advance Tax Estimator and Section 234B / 234C Live Forecaster
 * Evaluates Advance Tax liability under Section 208, quarterly installments under Section 211,
 * interest for deferment of advance tax under Section 234C, and interest for default under Section 234B.
 *
 * Statutory Rules:
 * 1. Applicability: Net assessed tax liability >= Rs 10,000 (Section 208).
 * 2. Resident senior citizens (age >= 60) without business or profession profits are exempt (Section 207(2)).
 * 3. Regular Assessees: 4 installments:
 *    - June 15: 15% (234C safe harbour: 12%, interest for 3 months at 1%)
 *    - Sept 15: 45% (234C safe harbour: 36%, interest for 3 months at 1%)
 *    - Dec 15: 75% (interest for 3 months at 1%)
 *    - March 15: 100% (interest for 1 month at 1%)
 * 4. Presumptive Assessees (Section 44AD / 44ADA):
 *    - Single installment: 100% on or before March 15 (interest for 1 month at 1% if shortfall)
 * 5. Section 234B: 1% per month from April 1 if advance tax paid by March 31 is less than 90% of assessed tax.
 * 6. Rule 119A: Shortfall rounded down to nearest hundred.
 */

const D = (v: string | number | undefined | null) => new Decimal(v || 0);

/* Rule 119A: Round down to nearest multiple of 100 */
export function roundDown100(amt: Decimal): Decimal {
  if (amt.lte(0)) return new Decimal(0);
  return amt.div(100).floor().mul(100);
}

export type TaxpayerCategory = 'INDIVIDUAL' | 'SENIOR_CITIZEN' | 'SUPER_SENIOR' | 'HUF' | 'FIRM' | 'COMPANY' | 'LLP';

export interface AdvanceTaxForecastInput {
  financialYear: string; /* e.g. '2026-27' */
  taxpayerCategory: TaxpayerCategory;
  hasBusinessIncome: boolean;
  isPresumptive: boolean; /* Section 44AD / 44ADA */
  estimatedGrossTax: string | number; /* Gross tax before TDS, TCS, credits */
  tdsCredits?: string | number;
  tcsCredits?: string | number;
  matAmtCredits?: string | number;
  foreignTaxRelief?: string | number; /* Section 89 / 90 / 91 */
  advanceTaxPaid?: {
    upToJune15?: string | number;
    upToSept15?: string | number;
    upToDec15?: string | number;
    upToMarch15?: string | number;
    afterMarch15UpToMarch31?: string | number;
  };
  filingDate?: string; /* ISO date e.g. '2027-07-31' for 234B month calculation */
}

export interface InstallmentScheduleItem {
  installmentNumber: number;
  dueDate: string;
  statutoryPercent: number;
  safeHarbourPercent: number;
  cumulativeRequiredAmount: string;
  netInstallmentRequired: string;
  cumulativePaidAmount: string;
  isShortfall: boolean;
  shortfallAmount: string;
  interestMonths: number;
  interestRatePercent: number;
  interest234C: string;
  advice: string;
}

export interface AdvanceTaxForecastResult {
  financialYear: string;
  assessmentYear: string;
  isLiableForAdvanceTax: boolean;
  isExemptSeniorCitizen: boolean;
  estimatedGrossTax: string;
  totalCredits: string;
  assessedTax: string; /* Section 209 */
  advanceTaxPaidTotal: string;
  isPresumptive: boolean;
  installments: InstallmentScheduleItem[];
  totalInterest234C: string;
  is234BApplicable: boolean;
  advanceTaxPaidByMarch31: string;
  statutory90PercentThreshold: string;
  shortfall234B: string;
  months234B: number;
  totalInterest234B: string;
  totalInterest: string;
  netBalancePayable: string; /* (Assessed tax - Advance tax paid) + Total interest */
  statutoryCitations: {
    advanceTaxLiability: string;
    installmentSchedule: string;
    defermentInterest234C: string;
    defaultInterest234B: string;
    roundingRule: string;
  };
  recommendations: string[];
}

export function computeAdvanceTaxForecast(input: AdvanceTaxForecastInput): AdvanceTaxForecastResult {
  const grossTax = D(input.estimatedGrossTax);
  const tds = D(input.tdsCredits);
  const tcs = D(input.tcsCredits);
  const mat = D(input.matAmtCredits);
  const relief = D(input.foreignTaxRelief);
  const totalCredits = tds.add(tcs).add(mat).add(relief);

  /* Section 209 Assessed Tax */
  const assessedTax = Decimal.max(0, grossTax.sub(totalCredits));

  /* Check senior citizen exemption under Section 207(2) */
  const isSenior = input.taxpayerCategory === 'SENIOR_CITIZEN' || input.taxpayerCategory === 'SUPER_SENIOR';
  const isExemptSeniorCitizen = isSenior && !input.hasBusinessIncome;

  /* Section 208 threshold is Rs 10,000 */
  const isLiableForAdvanceTax = !isExemptSeniorCitizen && assessedTax.gte(10000);

  const paidQ1 = D(input.advanceTaxPaid?.upToJune15);
  const paidQ2 = D(input.advanceTaxPaid?.upToSept15);
  const paidQ3 = D(input.advanceTaxPaid?.upToDec15);
  const paidQ4 = D(input.advanceTaxPaid?.upToMarch15);
  const paidMarchLate = D(input.advanceTaxPaid?.afterMarch15UpToMarch31);

  /* Cumulative payments made at each milestone */
  const cumPaidQ1 = paidQ1;
  const cumPaidQ2 = cumPaidQ1.add(paidQ2);
  const cumPaidQ3 = cumPaidQ2.add(paidQ3);
  const cumPaidQ4 = cumPaidQ3.add(paidQ4);
  const paidByMarch31 = cumPaidQ4.add(paidMarchLate);

  const installments: InstallmentScheduleItem[] = [];
  let totalInterest234C = new Decimal(0);

  const fy = input.financialYear || '2026-27';
  const fyStart = parseInt(fy.slice(0, 4), 10) || 2026;
  const ay = `${fyStart + 1}-${String(fyStart + 2).slice(2)}`;

  if (input.isPresumptive) {
    /* Section 44AD / 44ADA: Single installment on or before March 15 */
    const reqAmount = assessedTax;
    const paid = cumPaidQ4;
    const shortfall = Decimal.max(0, reqAmount.sub(paid));
    const roundShortfall = roundDown100(shortfall);
    const int234C = isLiableForAdvanceTax && shortfall.gt(0) ? roundShortfall.mul(0.01) : new Decimal(0);
    totalInterest234C = int234C;

    installments.push({
      installmentNumber: 1,
      dueDate: `15 March ${fyStart + 1}`,
      statutoryPercent: 100,
      safeHarbourPercent: 100,
      cumulativeRequiredAmount: reqAmount.toFixed(2),
      netInstallmentRequired: reqAmount.toFixed(2),
      cumulativePaidAmount: paid.toFixed(2),
      isShortfall: shortfall.gt(0),
      shortfallAmount: shortfall.toFixed(2),
      interestMonths: 1,
      interestRatePercent: 1,
      interest234C: int234C.toFixed(2),
      advice: shortfall.gt(0)
        ? `Pay Rs ${shortfall.toFixed(0)} before 15 March to prevent Section 234C penal interest.`
        : 'Presumptive advance tax obligation fully met.',
    });
  } else {
    /* Regular 4 installments */
    const stages = [
      { num: 1, date: `15 June ${fyStart}`, statPct: 15, safePct: 12, months: 3, cumPaid: cumPaidQ1 },
      { num: 2, date: `15 September ${fyStart}`, statPct: 45, safePct: 36, months: 3, cumPaid: cumPaidQ2 },
      { num: 3, date: `15 December ${fyStart}`, statPct: 75, safePct: 75, months: 3, cumPaid: cumPaidQ3 },
      { num: 4, date: `15 March ${fyStart + 1}`, statPct: 100, safePct: 100, months: 1, cumPaid: cumPaidQ4 },
    ];

    let prevRequired = new Decimal(0);

    for (const st of stages) {
      const statAmount = assessedTax.mul(st.statPct).div(100);
      const safeAmount = assessedTax.mul(st.safePct).div(100);
      const netInstallment = statAmount.sub(prevRequired);
      prevRequired = statAmount;

      let isShortfall = false;
      let shortfall = new Decimal(0);
      let int234C = new Decimal(0);

      if (isLiableForAdvanceTax) {
        if (st.cumPaid.lt(safeAmount)) {
          isShortfall = true;
          shortfall = statAmount.sub(st.cumPaid);
          const roundShortfall = roundDown100(shortfall);
          int234C = roundShortfall.mul(0.01).mul(st.months);
        }
      }

      totalInterest234C = totalInterest234C.add(int234C);

      let advice = 'Threshold satisfied.';
      if (isShortfall) {
        advice = `Shortfall of Rs ${shortfall.toFixed(0)}. 234C interest of 1% per month for ${st.months} month(s) triggered.`;
      } else if (st.cumPaid.gte(statAmount)) {
        advice = `Installment fully paid (Rs ${st.cumPaid.toFixed(0)} paid vs Rs ${statAmount.toFixed(0)} statutory target).`;
      } else {
        advice = `Covered by safe harbour cushion (${st.safePct}% threshold met without penalty).`;
      }

      installments.push({
        installmentNumber: st.num,
        dueDate: st.date,
        statutoryPercent: st.statPct,
        safeHarbourPercent: st.safePct,
        cumulativeRequiredAmount: statAmount.toFixed(2),
        netInstallmentRequired: netInstallment.toFixed(2),
        cumulativePaidAmount: st.cumPaid.toFixed(2),
        isShortfall,
        shortfallAmount: shortfall.toFixed(2),
        interestMonths: st.months,
        interestRatePercent: st.months,
        interest234C: int234C.toFixed(2),
        advice,
      });
    }
  }

  /* Section 234B Default Interest Calculation */
  const threshold90 = assessedTax.mul(0.9);
  const is234BApplicable = isLiableForAdvanceTax && paidByMarch31.lt(threshold90);

  let shortfall234B = new Decimal(0);
  let totalInterest234B = new Decimal(0);
  let months234B = 0;

  if (is234BApplicable) {
    /* Base for 234B is assessed tax less advance tax paid */
    shortfall234B = assessedTax.sub(paidByMarch31);
    const roundShortfall234B = roundDown100(shortfall234B);

    /* Months from April 1 of AY to filing date */
    /* Default filing due date is July 31 (4 months: April, May, June, July) */
    months234B = 4;
    if (input.filingDate) {
      const fDate = new Date(input.filingDate);
      const ayStart = new Date(Date.UTC(fyStart + 1, 3, 1)); /* April 1 of AY */
      if (fDate > ayStart) {
        const m = (fDate.getUTCFullYear() - (fyStart + 1)) * 12 + (fDate.getUTCMonth() - 3);
        months234B = Math.max(1, m);
      }
    }

    totalInterest234B = roundShortfall234B.mul(0.01).mul(months234B);
  }

  const totalInterest = totalInterest234C.add(totalInterest234B);
  const unpaidAssessedTax = Decimal.max(0, assessedTax.sub(paidByMarch31));
  const netBalancePayable = unpaidAssessedTax.add(totalInterest);

  /* Actionable Recommendations */
  const recommendations: string[] = [];
  if (isExemptSeniorCitizen) {
    recommendations.push('Exempt from advance tax under Section 207(2) as a resident senior citizen without business income.');
  } else if (!isLiableForAdvanceTax) {
    recommendations.push('Assessed tax after TDS/TCS is below Rs 10,000 threshold (Section 208). Advance tax is not mandatory.');
  } else {
    if (paidByMarch31.lt(threshold90)) {
      const needed90 = threshold90.sub(paidByMarch31);
      recommendations.push(`Urgent: Pay at least Rs ${needed90.toFixed(0)} before 31 March to reach 90% and prevent recurring Section 234B interest of 1% per month.`);
    }
    const currentShortfall = installments.find((it) => it.isShortfall);
    if (currentShortfall) {
      recommendations.push(`Quarterly shortfall observed on ${currentShortfall.dueDate}. Prioritize clearing installment deficits.`);
    } else {
      recommendations.push('Installment targets are compliant with statutory safe harbour guidelines.');
    }
  }

  return {
    financialYear: fy,
    assessmentYear: ay,
    isLiableForAdvanceTax,
    isExemptSeniorCitizen,
    estimatedGrossTax: grossTax.toFixed(2),
    totalCredits: totalCredits.toFixed(2),
    assessedTax: assessedTax.toFixed(2),
    advanceTaxPaidTotal: paidByMarch31.toFixed(2),
    isPresumptive: input.isPresumptive,
    installments,
    totalInterest234C: totalInterest234C.toFixed(2),
    is234BApplicable,
    advanceTaxPaidByMarch31: paidByMarch31.toFixed(2),
    statutory90PercentThreshold: threshold90.toFixed(2),
    shortfall234B: shortfall234B.toFixed(2),
    months234B,
    totalInterest234B: totalInterest234B.toFixed(2),
    totalInterest: totalInterest.toFixed(2),
    netBalancePayable: netBalancePayable.toFixed(2),
    statutoryCitations: {
      advanceTaxLiability: 'Section 208 / Clause 118 of DTC 2025: Net tax payable Rs 10,000 or more',
      installmentSchedule: 'Section 211 / Clause 121 of DTC 2025: 15%, 45%, 75%, 100% installments',
      defermentInterest234C: 'Section 234C / Clause 138 of DTC 2025: 1% per month on installment deferment',
      defaultInterest234B: 'Section 234B / Clause 137 of DTC 2025: 1% per month from April 1 if payment under 90%',
      roundingRule: 'Rule 119A: Round down shortfall to nearest Rs 100',
    },
    recommendations,
  };
}

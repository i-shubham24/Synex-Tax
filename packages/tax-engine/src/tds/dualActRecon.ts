import Decimal from 'decimal.js';
import { roundInterestBaseRule269 } from '../math/rounding.js';
import { tdsInterest } from '../compliance/interest.js';
import { type IsoDate, type StatutoryRegime } from '../compliance/calendar.js';
import { RATES_2025 } from './rates2025.js';
import { form140Section } from './form140Codes.js';
import type { ConsoStatement, ConsoChallan, ConsoDeductee, CorrectionEdits, DeducteeEdit, NewDeductee } from './correction.js';

export type { StatutoryRegime };


export interface DualActSection {
  legacy1961Code: string;
  act2025Code: string;
  section1961: string;
  section2025: string;
  nature: string;
  standardRate: number;
  companyRate?: number;
  thresholdKind: string;
}

/**
 * 1961 Act code, 2025 Act code, 1961 section and a short nature for each pair this reconciler
 * maps. The 2025 section, rate and threshold are NOT kept here: they come from RATES_2025
 * (rates2025.ts), the single source, so the two cannot disagree.
 */
const DUAL_ACT_PAIRS: ReadonlyArray<readonly [legacy1961Code: string, act2025Code: string, section1961: string, nature: string]> = [
  ['94C', '1023', '194C', 'Contractor (Individual or HUF)'],
  ['94C', '1024', '194C', 'Contractor (Company or Firm)'],
  ['4JA', '1026', '194J(1)(a)', 'Technical Services or Royalty'],
  ['4JB', '1027', '194J(1)(b)', 'Professional Services'],
  ['4JB', '1028', '194J(1)(ba)', 'Director Remuneration or Fees'],
  ['4IA', '1008', '194I(a)', 'Rent: Plant, Machinery or Equipment'],
  ['4IB', '1009', '194I(b)', 'Rent: Land, Building or Furniture'],
  ['94H', '1006', '194H', 'Commission or Brokerage'],
  ['94D', '1005', '194D', 'Insurance Commission'],
  ['94A', '1022', '194A', 'Interest other than on Securities'],
  ['94Q', '1031', '194Q', 'Purchase of Goods'],
  ['94R', '1033', '194R', 'Business Perquisites or Benefits'],
  ['94S', '1037', '194S', 'Virtual Digital Assets Transfer'],
  ['194', '1029', '194', 'Dividends'],
  ['193', '1019', '193', 'Interest on Securities'],
];

function toDualActSection([legacy1961Code, act2025Code, section1961, nature]: (typeof DUAL_ACT_PAIRS)[number]): DualActSection {
  const rule = RATES_2025[act2025Code];
  if (!rule) throw new Error(`dualActRecon: code ${act2025Code} is not in RATES_2025`);
  const standardRate = typeof rule.rate === 'function' ? rule.rate(false) : rule.rate;
  const companyRate = typeof rule.rate === 'function' ? rule.rate(true) : undefined;
  return {
    legacy1961Code,
    act2025Code,
    section1961,
    section2025: rule.section,
    nature,
    standardRate,
    ...(companyRate !== undefined && companyRate !== standardRate ? { companyRate } : {}),
    thresholdKind: rule.threshold.kind,
  };
}

export const DUAL_ACT_SECTIONS: DualActSection[] = DUAL_ACT_PAIRS.map(toDualActSection);

export function resolveDualActSection(rawCode: string, pan?: string, ratePercent?: number): DualActSection | null {
  const code = (rawCode || '').trim().toUpperCase();
  const panChar4 = (pan || '').slice(3, 4).toUpperCase();
  const isCorporate = panChar4 === 'C';

  /* Direct match on 2025 code */
  const match2025 = DUAL_ACT_SECTIONS.find((s) => s.act2025Code === code);
  if (match2025) return match2025;

  /* Direct match on legacy code or prefixed 1961 code */
  const normalizedLegacy = code.startsWith('194') ? code.slice(1) : code;

  if (code === '194C' || code === '94C') {
    return isCorporate ? DUAL_ACT_SECTIONS[1] : DUAL_ACT_SECTIONS[0];
  }
  if (code === '4JA' || code === '194JA') return DUAL_ACT_SECTIONS[2];
  if (code === '4JB' || code === '194JB') return DUAL_ACT_SECTIONS[3];
  if (code === '194J' || code === '94J') {
    if (ratePercent !== undefined && ratePercent <= 2) return DUAL_ACT_SECTIONS[2];
    return DUAL_ACT_SECTIONS[3];
  }
  if (code === '4IA' || code === '194IA') return DUAL_ACT_SECTIONS[5];
  if (code === '4IB' || code === '194IB') return DUAL_ACT_SECTIONS[6];
  if (code === '194I' || code === '94I') {
    if (ratePercent !== undefined && ratePercent <= 2) return DUAL_ACT_SECTIONS[5];
    return DUAL_ACT_SECTIONS[6];
  }

  const legacyMatch = DUAL_ACT_SECTIONS.find((s) => s.legacy1961Code === code || s.section1961 === code || s.legacy1961Code === normalizedLegacy);
  if (legacyMatch) return legacyMatch;

  return null;
}

export interface ReconciledDeductee {
  recordNo: number;
  challanNo: number;
  pan: string;
  name: string;
  panStatus: 'OPERATIVE' | 'INOPERATIVE' | 'INVALID' | 'LITERAL_MISSING';
  sectionRaw: string;
  section1961: string;
  section2025: string;
  nature: string;
  paidOn: string;
  amount: string;
  deducted: string;
  deposited: string;
  deductedOn: string;
  appliedRate: string;
  statutoryRate: string;
  isShortDeduction: boolean;
  shortDeductionAmount: string;
  lateDeductionMonths: number;
  lateDeductionInterest: string;
  lateDepositMonths: number;
  lateDepositInterest: string;
  totalInterest201: string;
  totalDemandRisk: string;
  riskSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NONE';
  suggestedAction: string;
}

export interface ReconciledChallan {
  recordNo: number;
  bsr: string;
  challanNo: string;
  date: string;
  totalChallanAmount: string;
  totalTax: string;
  interest: string;
  fee: string;
  others: string;
  minorHead: string;
  totalAllocatedToDeductees: string;
  unconsumedSurplus: string;
  status: 'FULLY_CONSUMED' | 'SURPLUS_AVAILABLE' | 'OVER_ALLOCATED';
  deducteeCount: number;
}

export interface DualActReconciliationReport {
  tan: string;
  deductorName: string;
  taxYear: number | null;
  quarter: number | null;
  form: string;
  detectedRegime: StatutoryRegime;
  metrics: {
    totalChallans: number;
    totalDeductees: number;
    totalChallanDeposit: string;
    totalDeducteeTax: string;
    totalUnconsumedSurplus: string;
    totalShortDeduction: string;
    totalLateDeductionInterest: string;
    totalLateDepositInterest: string;
    totalSection201Interest: string;
    netTracesDemandRisk: string;
    criticalRiskCount: number;
  };
  sectionSummary: Array<{
    section1961: string;
    section2025: string;
    nature: string;
    deducteeCount: number;
    totalAmount: string;
    totalDeducted: string;
    shortfall: string;
  }>;
  challans: ReconciledChallan[];
  highRiskDeductees: ReconciledDeductee[];
  allDeductees: ReconciledDeductee[];
  recommendedCorrections: {
    c1Deductor: Array<{ field: string; issue: string; remedy: string }>;
    c2Challans: Array<{ recordNo: number; challanNo: string; bsr: string; issue: string; remedy: string }>;
    c3Deductees: Array<{ recordNo: number; pan: string; issue: string; remedy: string }>;
  };
}

export function reconcileConsoDualAct(
  conso: ConsoStatement,
  overrideRegime?: StatutoryRegime
): DualActReconciliationReport {
  /* Determine statutory regime */
  const detectedRegime: StatutoryRegime =
    overrideRegime ??
    (conso.taxYear && conso.taxYear >= 2026 ? 'IT_ACT_2025' : 'IT_ACT_1961');

  let totalChallanDeposit = new Decimal(0);
  let totalDeducteeTax = new Decimal(0);
  let totalUnconsumedSurplus = new Decimal(0);
  let totalShortDeduction = new Decimal(0);
  let totalLateDeductionInterest = new Decimal(0);
  let totalLateDepositInterest = new Decimal(0);
  let totalSection201Interest = new Decimal(0);
  let criticalRiskCount = 0;

  const sectionMap = new Map<string, {
    section1961: string;
    section2025: string;
    nature: string;
    deducteeCount: number;
    totalAmount: Decimal;
    totalDeducted: Decimal;
    shortfall: Decimal;
  }>();

  /* 1. Reconcile Challans */
  const challans: ReconciledChallan[] = conso.challans.map((c) => {
    const challanTax = new Decimal(c.tax || 0);
    const totalDeposit = new Decimal(c.total || 0);
    totalChallanDeposit = totalChallanDeposit.add(totalDeposit);

    const allocated = c.deductees.reduce((sum, d) => sum.add(new Decimal(d.deposited || d.deducted || 0)), new Decimal(0));
    const surplus = challanTax.minus(allocated);
    if (surplus.greaterThan(0)) {
      totalUnconsumedSurplus = totalUnconsumedSurplus.add(surplus);
    }

    let status: 'FULLY_CONSUMED' | 'SURPLUS_AVAILABLE' | 'OVER_ALLOCATED' = 'FULLY_CONSUMED';
    if (surplus.greaterThan(0)) status = 'SURPLUS_AVAILABLE';
    else if (surplus.lessThan(0)) status = 'OVER_ALLOCATED';

    return {
      recordNo: c.recordNo,
      bsr: c.bsr,
      challanNo: c.challanNo,
      date: c.date,
      totalChallanAmount: totalDeposit.toFixed(2),
      totalTax: challanTax.toFixed(2),
      interest: new Decimal(c.interest || 0).toFixed(2),
      fee: new Decimal(c.fee || 0).toFixed(2),
      others: new Decimal(c.others || 0).toFixed(2),
      minorHead: c.minorHead || '0021',
      totalAllocatedToDeductees: allocated.toFixed(2),
      unconsumedSurplus: surplus.toFixed(2),
      status,
      deducteeCount: c.deductees.length,
    };
  });

  /* 2. Reconcile Deductees & compute Section 201(1A) Exposure */
  const allDeductees: ReconciledDeductee[] = [];
  const highRiskDeductees: ReconciledDeductee[] = [];

  for (const c of conso.challans) {
    const challanDate = (c.date || '').trim();

    for (const d of c.deductees) {
      const panClean = (d.pan || '').trim().toUpperCase();
      const isLiteral = ['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID'].includes(panClean);
      const isValidPan = /^[A-Z]{5}\d{4}[A-Z]$/.test(panClean);

      let panStatus: 'OPERATIVE' | 'INOPERATIVE' | 'INVALID' | 'LITERAL_MISSING' = 'OPERATIVE';
      if (isLiteral) panStatus = 'LITERAL_MISSING';
      else if (!isValidPan) panStatus = 'INVALID';

      const amountPaid = new Decimal(d.amount || 0);
      const taxDeducted = new Decimal(d.deducted || 0);
      const taxDeposited = new Decimal(d.deposited || 0);
      totalDeducteeTax = totalDeducteeTax.add(taxDeducted);

      const parsedRate = parseFloat(d.rate || '0');
      const dualSec = resolveDualActSection(d.section, panClean, parsedRate);

      const sec1961 = dualSec ? dualSec.section1961 : d.section;
      const sec2025 = dualSec ? dualSec.act2025Code : (form140Section(d.section)?.code ?? d.section);
      const nature = dualSec ? dualSec.nature : (form140Section(d.section)?.nature ?? 'Other payment');

      /* Statutory required rate */
      let requiredRatePercent = 0;
      if (panStatus === 'LITERAL_MISSING' || panStatus === 'INVALID') {
        /* Section 206AA statutory higher deduction requirement: 20% */
        requiredRatePercent = 20;
      } else if (dualSec) {
        const isCorporate = panClean[3] === 'C';
        requiredRatePercent = (isCorporate && dualSec.companyRate !== undefined) ? dualSec.companyRate : dualSec.standardRate;
      } else {
        requiredRatePercent = parsedRate > 0 ? parsedRate : 10;
      }

      /* Short deduction calculation */
      const expectedTax = amountPaid.mul(new Decimal(requiredRatePercent).div(100));
      let shortfall = expectedTax.minus(taxDeducted);
      if (shortfall.lessThan(0)) shortfall = new Decimal(0);
      if (d.reason && ['A', 'B', 'C', 'Y'].includes(d.reason.toUpperCase())) {
        /* Valid lower/nil deduction certificate or reason under section 197 */
        shortfall = new Decimal(0);
      }

      /* Section 201(1A) Interest */
      const paymentDate = (d.paidOn || '').trim();
      const deductionDate = (d.deductedOn || d.paidOn || '').trim();
      const depositDate = challanDate;

      let lateDedMonths = 0;
      let lateDedInterest = new Decimal(0);
      let lateDepMonths = 0;
      let lateDepInterest = new Decimal(0);

      if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && /^\d{4}-\d{2}-\d{2}$/.test(deductionDate) && /^\d{4}-\d{2}-\d{2}$/.test(depositDate)) {
        const intRes = tdsInterest({
          tax: taxDeducted.toNumber(),
          deductibleOn: paymentDate as IsoDate,
          deductedOn: deductionDate as IsoDate,
          depositedOn: depositDate as IsoDate,
        });
        lateDedMonths = intRes.lateDeductionMonths;
        lateDedInterest = new Decimal(intRes.lateDeductionInterest);
        lateDepMonths = intRes.lateDepositMonths;
        lateDepInterest = new Decimal(intRes.lateDepositInterest);
      }

      const totalInterest = lateDedInterest.add(lateDepInterest);
      const totalDemand = shortfall.add(totalInterest);

      totalShortDeduction = totalShortDeduction.add(shortfall);
      totalLateDeductionInterest = totalLateDeductionInterest.add(lateDedInterest);
      totalLateDepositInterest = totalLateDepositInterest.add(lateDepInterest);
      totalSection201Interest = totalSection201Interest.add(totalInterest);

      let riskSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NONE' = 'NONE';
      let suggestedAction = 'Compliant';

      if (panStatus !== 'OPERATIVE' && shortfall.greaterThan(0)) {
        riskSeverity = 'CRITICAL';
        suggestedAction = 'Collect valid PAN and file C3 PAN correction to remove Section 206AA demand';
        criticalRiskCount++;
      } else if (shortfall.greaterThan(0)) {
        riskSeverity = 'HIGH';
        suggestedAction = 'Rate shortfall detected: Allocate unconsumed challan surplus via C3 correction';
        criticalRiskCount++;
      } else if (totalInterest.greaterThan(0)) {
        riskSeverity = 'MEDIUM';
        suggestedAction = 'Delay interest exposed under Section 201(1A): Deposit interest to prevent penalty notice';
      }

      const item: ReconciledDeductee = {
        recordNo: d.recordNo,
        challanNo: c.recordNo,
        pan: panClean,
        name: d.name || 'Unnamed Payee',
        panStatus,
        sectionRaw: d.section,
        section1961: sec1961,
        section2025: sec2025,
        nature,
        paidOn: d.paidOn,
        amount: amountPaid.toFixed(2),
        deducted: taxDeducted.toFixed(2),
        deposited: taxDeposited.toFixed(2),
        deductedOn: d.deductedOn,
        appliedRate: parsedRate ? `${parsedRate}%` : '0%',
        statutoryRate: `${requiredRatePercent}%`,
        isShortDeduction: shortfall.greaterThan(0),
        shortDeductionAmount: shortfall.toFixed(2),
        lateDeductionMonths: lateDedMonths,
        lateDeductionInterest: lateDedInterest.toFixed(2),
        lateDepositMonths: lateDepMonths,
        lateDepositInterest: lateDepInterest.toFixed(2),
        totalInterest201: totalInterest.toFixed(2),
        totalDemandRisk: totalDemand.toFixed(2),
        riskSeverity,
        suggestedAction,
      };

      allDeductees.push(item);
      if (riskSeverity !== 'NONE') {
        highRiskDeductees.push(item);
      }

      /* Section distribution summary */
      const sKey = `${sec1961}_${sec2025}`;
      const existingSec = sectionMap.get(sKey) ?? {
        section1961: sec1961,
        section2025: sec2025,
        nature,
        deducteeCount: 0,
        totalAmount: new Decimal(0),
        totalDeducted: new Decimal(0),
        shortfall: new Decimal(0),
      };
      existingSec.deducteeCount++;
      existingSec.totalAmount = existingSec.totalAmount.add(amountPaid);
      existingSec.totalDeducted = existingSec.totalDeducted.add(taxDeducted);
      existingSec.shortfall = existingSec.shortfall.add(shortfall);
      sectionMap.set(sKey, existingSec);
    }
  }

  /* 3. Build Recommended Corrections (C1, C2, C3) */
  const c1Deductor: Array<{ field: string; issue: string; remedy: string }> = [];
  const c2Challans: Array<{ recordNo: number; challanNo: string; bsr: string; issue: string; remedy: string }> = [];
  const c3Deductees: Array<{ recordNo: number; pan: string; issue: string; remedy: string }> = [];

  /* C1 Deductor Checks */
  const ded = conso.deductor;
  if (!ded.email || !ded.email.includes('@')) {
    c1Deductor.push({ field: 'email', issue: 'Missing or malformed deductor email', remedy: 'Update registered email in Batch Header via C1 correction' });
  }
  if (!ded.phone || ded.phone.length < 10) {
    c1Deductor.push({ field: 'phone', issue: 'Missing or short deductor mobile number', remedy: 'Update contact number in Batch Header via C1 correction' });
  }
  if (ded.responsible && (!ded.responsible.pan || !/^[A-Z]{5}\d{4}[A-Z]$/.test(ded.responsible.pan))) {
    c1Deductor.push({ field: 'responsible.pan', issue: 'Responsible person PAN is missing or invalid', remedy: 'Provide verified PAN of responsible person in C1 correction' });
  }

  /* C2 Challan Checks */
  for (const c of challans) {
    if (new Decimal(c.unconsumedSurplus).greaterThan(0)) {
      c2Challans.push({
        recordNo: c.recordNo,
        challanNo: c.challanNo,
        bsr: c.bsr,
        issue: `Unconsumed surplus of INR ${c.unconsumedSurplus} in challan`,
        remedy: 'Can offset short deductions or be claimed against additional deductee rows without paying new tax',
      });
    }
  }

  /* C3 Deductee Checks */
  for (const d of highRiskDeductees) {
    if (d.panStatus === 'LITERAL_MISSING' || d.panStatus === 'INVALID') {
      c3Deductees.push({
        recordNo: d.recordNo,
        pan: d.pan,
        issue: `Non-operative PAN attracting 20% Section 206AA demand (Shortfall: INR ${d.shortDeductionAmount})`,
        remedy: 'Collect genuine PAN and file C3 deductee record update',
      });
    } else if (d.isShortDeduction) {
      c3Deductees.push({
        recordNo: d.recordNo,
        pan: d.pan,
        issue: `Rate shortfall: Deducted at ${d.appliedRate} vs statutory ${d.statutoryRate} (Shortfall: INR ${d.shortDeductionAmount})`,
        remedy: 'Update deductee tax or link to surplus challan via C3 correction',
      });
    }
  }

  const netDemand = totalShortDeduction.add(totalSection201Interest);

  return {
    tan: conso.tan,
    deductorName: conso.deductorName,
    taxYear: conso.taxYear,
    quarter: conso.quarter,
    form: conso.form || '140',
    detectedRegime,
    metrics: {
      totalChallans: conso.challans.length,
      totalDeductees: allDeductees.length,
      totalChallanDeposit: totalChallanDeposit.toFixed(2),
      totalDeducteeTax: totalDeducteeTax.toFixed(2),
      totalUnconsumedSurplus: totalUnconsumedSurplus.toFixed(2),
      totalShortDeduction: totalShortDeduction.toFixed(2),
      totalLateDeductionInterest: totalLateDeductionInterest.toFixed(2),
      totalLateDepositInterest: totalLateDepositInterest.toFixed(2),
      totalSection201Interest: totalSection201Interest.toFixed(2),
      netTracesDemandRisk: netDemand.toFixed(2),
      criticalRiskCount,
    },
    sectionSummary: Array.from(sectionMap.values()).map((s) => ({
      section1961: s.section1961,
      section2025: s.section2025,
      nature: s.nature,
      deducteeCount: s.deducteeCount,
      totalAmount: s.totalAmount.toFixed(2),
      totalDeducted: s.totalDeducted.toFixed(2),
      shortfall: s.shortfall.toFixed(2),
    })),
    challans,
    highRiskDeductees,
    allDeductees,
    recommendedCorrections: {
      c1Deductor,
      c2Challans,
      c3Deductees,
    },
  };
}

/** Generates automated C1, C2, and C3 correction edits from a reconciliation report */
export function generateAutoCorrectionEdits(report: DualActReconciliationReport): CorrectionEdits {
  const deducteeEdits: DeducteeEdit[] = [];

  for (const d of report.highRiskDeductees) {
    if (d.isShortDeduction) {
      /* Update the section to the 2025 Act equivalent code if currently in legacy format */
      deducteeEdits.push({
        challanNo: d.challanNo,
        recordNo: d.recordNo,
        section: d.section2025,
      });
    }
  }

  return {
    deductees: deducteeEdits,
    added: [],
    challans: [],
    newChallans: [],
  };
}

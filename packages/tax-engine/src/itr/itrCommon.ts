import Decimal from 'decimal.js';
import type { AgeBand } from '../tds/salary.js';

/**
 * Pieces shared by the ITR-2, ITR-3 and ITR-4 writers for Assessment Year 2026-27 (income of
 * 2025-26, Income-tax Act 1961). Field names and limits come from the Department's JSON schemas
 * kept in packages/tax-engine/schemas/itr; the interest and fee rules from sections 234A, 234B,
 * 234C and 234F of the Act and rule 119A of the Income-tax Rules.
 */

export interface ItrPerson {
  firstName?: string;
  middleName?: string;
  surname: string;
  pan: string;
  dob: string; // YYYY-MM-DD
  employerCategory?: 'CGOV' | 'SGOV' | 'PSU' | 'PE' | 'PESG' | 'PEPS' | 'PEO' | 'OTH' | 'NA';
  address: { residenceNo: string; locality: string; city: string; stateCode: string; pin: string };
  mobile: string;
  email: string;
  fatherName: string;
  place: string;
}

export interface ItrFiling {
  section: 11 | 12 | 17;
  regime: 'NEW' | 'OLD';
  originalAck?: string;
  originalFiledOn?: string;
}

export interface ItrSalaryTds { tan: string; name: string; incomeChargeable: number; tds: number }
/** section is the code the schemas use for the TDS section (for example 94A for 194A, 4IA for 194-IA). */
export interface ItrOtherTds { tan: string; name: string; section: string; amount: number; tds: number; head?: 'BP' | 'HP' | 'OS' | 'NA' }
export interface ItrTcs { tan: string; name: string; tcs: number }
export interface ItrTaxPayment { bsr: string; date: string; serial: number; amount: number; kind: 'ADVANCE' | 'SELF' }
export interface ItrBank { ifsc: string; name: string; account: string; type: 'SB' | 'CA' | 'CC' | 'OD' | 'NRO' | 'OTH' }
export interface ItrIssue { field: string; message: string }

/** TDS section codes accepted by the AY 2026-27 schemas (enum TDSSection in ITR-2, ITR-3 and ITR-4; 94T is ITR-3 only). */
export const ITR_TDS_SECTIONS = ['92A', '92B', '92C', '192A', '193', '194', '94A', '94B', '94BA', '4BB', '94C', '94D', '4DA', '94E', '4EE', '4F', '4G', '4H', '4-IA', '4-IB', '4IA', '4IB', '4IC', '94J-A', '94J-B', '94K', '4LA', '4LB', '4LC1', '4LC2', '4LC3', '4BA1', '4BA2', 'LBA1', 'LBA2', 'LBA3', 'LBB', '94R', '94S', '94B-P', '94R-P', '94S-P', 'LBC', '4LD', '94M', '94N', '94N-F', '94N-C', '94N-FT', '94O', '94P', '94Q', '195', '96A', '96B', '96C', '96D', '96DA', '94BA-P'] as const;

/** TAN prefixes the schemas accept (pattern on TAN in every AY 2026-27 ITR schema). */
const TAN_RE = /^(HYD|VPN|BBN|BPL|JBP|CHE|CMB|MRI|DEL|CAL|MRT|AHM|BRD|RKT|SRT|BLR|AGR|KNP|CHN|TVD|ALD|LKN|MUM|NGP|AMR|JLD|PTL|RTK|KLP|NSK|PNE|PTN|RCH|JDH|JPR|SHL)[A-Z]\d{5}[A-Z]$/;

export const n0 = (v: Decimal.Value | undefined | null) => new Decimal(v || 0).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
/** Rule 119A: the amount on which interest is worked is rounded down to a multiple of Rs 100. */
export const floor100 = (v: number) => Math.max(0, Math.floor(v / 100) * 100);

/**
 * Age band for AY 2026-27 from the date of birth. The ITR-4 validation rules (39, 40) treat a person
 * born on or before 01.04.1966 as a senior citizen; 80 years at any time in the year means born on or
 * before 01.04.1946 on the same reckoning.
 */
export function ageBandFromDob(dob: string): AgeBand {
  if (dob <= '1946-04-01') return 'SUPER_SENIOR';
  if (dob <= '1966-04-01') return 'SENIOR';
  return 'BELOW_60';
}

/** Months or part of a month from `from` (first day counted) up to `to`, as sections 234A, 234B and 234C count them. */
export function monthsFrom(from: string, to: string): number {
  if (to < from) return 0;
  const [fy, fm] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ty, tm] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** The last day for a belated or revised return for AY 2026-27: section 139(4) and 139(5), three months before the end of the assessment year. */
export const LAST_DAY_139_4 = '2026-12-31';

export interface InterestInput {
  liability: number; // tax, surcharge and cess after relief
  tdsTcs: number;
  payments: ItrTaxPayment[];
  filedOn: string;
  dueDate: string; // ItrFilingDueDate in the schema
  totalIncome: number;
  exemption: number; // basic exemption for the regime and age
  /** 44AD or 44ADA income with no other reason to follow the instalment dates: section 211(1)(b) and 234C(1)(b). */
  presumptive234C?: boolean;
  /** An amount worked outside this file; when given it is used as it is. */
  entered234C?: number;
  /**
   * Second proviso to section 234C(1): tax on the returned income leaving out capital gains that first
   * arose after each of 15 Jun, 15 Sep, 15 Dec 2025 and 15 Mar 2026 (four amounts of tax, surcharge and cess; TDS and TCS are taken off here).
   * Left out, the whole tax counts at every instalment.
   */
  dueBeforeLaterGains?: number[];
  /** Section 207(2): a resident senior citizen with no business or profession income pays no advance tax, so 234B and 234C do not arise. */
  noAdvanceTax?: boolean;
}

/** Advance tax instalments under section 211(1)(a): date and share of the tax due, and the months of interest under 234C(1)(a). */
export const INSTALMENTS_211 = [
  { by: '2025-06-15', pct: 0.15, months: 3, floorPct: 0.12 },
  { by: '2025-09-15', pct: 0.45, months: 3, floorPct: 0.36 },
  { by: '2025-12-15', pct: 0.75, months: 3, floorPct: undefined },
  { by: '2026-03-15', pct: 1, months: 1, floorPct: undefined },
] as const;

/**
 * Interest under section 234C(1)(a), instalment by instalment: 1% a month for three months on the shortfall of
 * advance tax paid by 15 Jun, 15 Sep and 15 Dec against 15%, 45% and 75% of the tax due on the returned income,
 * and for one month on the shortfall by 15 Mar against 100%. First proviso: none for June or September where
 * the advance tax paid is at least 12% or 36%. Second proviso: capital gains arising after an instalment date
 * are left out of the tax due for that instalment (dueBeforeLaterGains). Amounts rounded down to Rs 100 (rule 119A).
 */
export function interest234CInstalments(due: number, payments: ItrTaxPayment[], dueBeforeLaterGains?: number[]) {
  const adv = payments.filter((p) => p.kind === 'ADVANCE');
  return INSTALMENTS_211.map((s, k) => {
    const base = Math.max(0, Math.min(due, dueBeforeLaterGains?.[k] ?? due));
    const paid = sum(adv.filter((p) => p.date <= s.by).map((p) => n0(p.amount)));
    const required = base * s.pct;
    const exempt = s.floorPct !== undefined && paid >= base * s.floorPct;
    const shortfall = exempt ? 0 : floor100(required - paid);
    return { by: s.by, required: n0(required), paid, shortfall, interest: n0(shortfall * 0.01 * s.months) };
  });
}

/**
 * Interest under 234A, 234B and 234C and the 234F fee.
 * 234A: 1% a month from the day after the due date to the date of filing, on the tax less advance tax, TDS and TCS.
 * 234B: where advance tax paid is under 90% of the assessed tax (and the assessee was liable under section 208, tax of
 * Rs 10,000 or more), 1% a month from 1 April 2026; under 234B(2) self-assessment tax paid earlier cuts the amount from
 * the month after it is paid. 234C: for 44AD or 44ADA income, 1% on the shortfall of advance tax paid by 15 March from
 * the tax due on the returned income (234C(1)(b)); otherwise instalment by instalment under 234C(1)(a) (see
 * interest234CInstalments). Section 207(2): none of 234B or 234C for a resident senior citizen without business income.
 * 234F: Rs 5,000 for a return after the due date, Rs 1,000 where total income does not exceed Rs 5 lakh; none where
 * total income does not exceed the basic exemption.
 */
export function interestAndFee(i: InterestInput) {
  const assessed = Math.max(0, i.liability - i.tdsTcs);
  const advance = sum(i.payments.filter((p) => p.kind === 'ADVANCE' && p.date <= '2026-03-31').map((p) => n0(p.amount)));
  const belated = i.filedOn > i.dueDate;
  const i234A = belated ? floor100(assessed - advance) * 0.01 * monthsFrom(nextDay(i.dueDate), i.filedOn) : 0;

  let i234B = 0;
  if (!i.noAdvanceTax && assessed >= 10000 && advance < assessed * 0.9) {
    const selfPaid = i.payments.filter((p) => p.kind === 'SELF' && p.date >= '2026-04-01' && p.date <= i.filedOn).sort((a, b) => a.date.localeCompare(b.date));
    let start = '2026-04-01';
    let paidSoFar = 0;
    for (const p of selfPaid) {
      const months = monthsFrom(start, p.date);
      if (months > 0) i234B += floor100(assessed - advance - paidSoFar) * 0.01 * months;
      paidSoFar += n0(p.amount);
      // The month of payment is counted in full at the higher amount; the reduced amount runs from the next month.
      const d = new Date(Date.parse(`${p.date.slice(0, 7)}-01T00:00:00Z`));
      d.setUTCMonth(d.getUTCMonth() + 1);
      start = d.toISOString().slice(0, 10) > start ? d.toISOString().slice(0, 10) : start;
    }
    i234B += floor100(assessed - advance - paidSoFar) * 0.01 * monthsFrom(start, i.filedOn);
  }

  let i234C = n0(i.entered234C);
  if (i.entered234C === undefined && !i.noAdvanceTax && assessed >= 10000) {
    if (i.presumptive234C) {
      const byMarch15 = sum(i.payments.filter((p) => p.kind === 'ADVANCE' && p.date <= '2026-03-15').map((p) => n0(p.amount)));
      i234C = floor100(assessed - byMarch15) * 0.01;
    } else {
      const net = i.dueBeforeLaterGains?.map((t) => Math.max(0, t - i.tdsTcs));
      i234C = sum(interest234CInstalments(assessed, i.payments, net).map((x) => x.interest));
    }
  }
  const fee234F = belated && i.totalIncome > i.exemption ? (i.totalIncome > 500000 ? 5000 : 1000) : 0;
  return { i234A: n0(i234A), i234B: n0(i234B), i234C: n0(i234C), fee234F, belated, advance, assessed };
}

/** Checks every return needs: software ID, PAN of an individual, dates, contact details and bank. */
export function commonChecks(o: { softwareId: string; createdOn: string; person: ItrPerson; filing: ItrFiling; bank: ItrBank; dueDate: string; form: string }): ItrIssue[] {
  const issues: ItrIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const p = o.person;
  if (!/^SW\d{8}$/.test(o.softwareId)) err('softwareId', 'The Department issues a software ID (SW and 8 digits) to registered e-return intermediaries; it is needed to write the JSON.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p.pan)) err('pan', 'PAN is not valid.');
  else if (p.pan[3] !== 'P') err('pan', `This ${o.form} file is written for individuals; the fourth letter of the PAN must be P.`);
  if (!ISO.test(p.dob) || p.dob > '2026-03-31') err('dob', 'Date of birth is required, on or before 31 Mar 2026.');
  if (!ISO.test(o.createdOn)) err('createdOn', 'Date is required.');
  if (!/^[1-9]\d{5}$/.test(p.address.pin)) err('pin', 'PIN code must be 6 digits.');
  if (!/^[1-9]\d{9}$/.test(p.mobile)) err('mobile', 'Mobile number must be 10 digits.');
  if (!/^\d{2}$/.test(p.address.stateCode)) err('stateCode', 'State code must be two digits from the Department list.');
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(o.bank.ifsc)) err('ifsc', 'IFSC is not valid.');
  if (!clean(p.fatherName, 125)) err('fatherName', "Father's name is required for the verification.");
  if (o.filing.section === 17 && (!/^\d{15}$/.test(o.filing.originalAck ?? '') || !ISO.test(o.filing.originalFiledOn ?? ''))) err('originalAck', 'A revised return needs the acknowledgement number and date of the original return.');
  if (o.filing.section !== 11 && o.createdOn > LAST_DAY_139_4) err('section', 'A belated or revised return for AY 2026-27 can be filed only up to 31 Dec 2026 (section 139(4) and 139(5)).');
  return issues;
}

export function tanIssues(rows: { tan: string }[], field: string): ItrIssue[] {
  return rows.filter((r) => !TAN_RE.test(r.tan)).map((r) => ({ field, message: `TAN ${r.tan} does not start with a city code the Department's schema accepts.` }));
}

export const creationInfo = (softwareId: string, createdOn: string, city: string) => ({
  SWVersionNo: '1.0', SWCreatedBy: softwareId, JSONCreatedBy: softwareId, JSONCreationDate: createdOn, IntermediaryCity: clean(city, 25) || 'Delhi', Digest: '-',
});

export const assesseeName = (p: ItrPerson) => ({ ...(p.firstName ? { FirstName: clean(p.firstName, 25) } : {}), ...(p.middleName ? { MiddleName: clean(p.middleName, 25) } : {}), SurNameOrOrgName: clean(p.surname, 75) });

export const address = (p: ItrPerson) => ({
  ResidenceNo: clean(p.address.residenceNo, 50), LocalityOrArea: clean(p.address.locality, 50), CityOrTownOrDistrict: clean(p.address.city, 50), StateCode: p.address.stateCode,
  CountryCode: '91', PinCode: Number(p.address.pin), CountryCodeMobile: 91, MobileNo: Number(p.mobile), EmailAddress: clean(p.email, 125),
});

export const verification = (p: ItrPerson) => ({
  Declaration: { AssesseeVerName: clean([p.firstName, p.middleName, p.surname].filter(Boolean).join(' '), 125), FatherName: clean(p.fatherName, 125), AssesseeVerPAN: p.pan },
  Capacity: 'S', Place: clean(p.place, 50),
});

export const bankRow = (b: ItrBank) => ({ IFSCCode: b.ifsc, BankName: clean(b.name, 125), BankAccountNo: clean(b.account, 20), AccountType: b.type, UseForRefund: 'true' });

/** Return section actually filed: an on-time return filed after the due date becomes belated (139(4)). */
export const returnSection = (f: ItrFiling, belated: boolean) => (belated && f.section === 11 ? 12 : f.section);

export const revisedFields = (f: ItrFiling) => (f.section === 17 ? { ReceiptNo: f.originalAck, OrigRetFiledDate: f.originalFiledOn } : {});

/** Gross salary less the standard deduction under 16(ia) (Rs 75,000 new regime, Rs 50,000 old) and professional tax under 16(iii), old regime only. */
export function salaryHead(gross: number, professionalTax: number, regime: 'NEW' | 'OLD') {
  const std = Math.min(gross, regime === 'NEW' ? 75000 : 50000);
  const pt = regime === 'OLD' ? Math.min(professionalTax, 2500, Math.max(0, gross - std)) : 0;
  return { std, pt, income: Math.max(0, gross - std - pt) };
}

export interface Insurer { name: string; policy: string; amount: number }
export interface Deduction80DInput {
  selfFamily?: { premium: number; checkup?: number; seniorCitizen?: boolean; insurers: Insurer[] };
  parents?: { premium: number; checkup?: number; seniorCitizen: boolean; insurers: Insurer[] };
}

const insurerRows = (rows: Insurer[]) => ({ Sch80DInsDtls: rows.map((r) => ({ InsurerName: clean(r.name, 125), PolicyNo: clean(r.policy, 75), HealthInsAmt: n0(r.amount) })), TotalPayments: sum(rows.map((r) => n0(r.amount))) });

/**
 * Section 80D: self and family Rs 25,000 (Rs 50,000 where the taxpayer or spouse is a senior citizen),
 * parents the same; preventive health check-up counts within these, up to Rs 5,000 in all (80D(2), (3), (5)).
 * Returns the amount claimed, the amount allowed and Schedule 80D as the schemas lay it out.
 */
export function deduction80D(d: Deduction80DInput | undefined, age: AgeBand) {
  const sf = d?.selfFamily;
  const pa = d?.parents;
  const issues: ItrIssue[] = [];
  const sfSenior = sf ? sf.seniorCitizen ?? age !== 'BELOW_60' : false;
  const checkSf = Math.min(n0(sf?.checkup), 5000);
  const checkPa = Math.min(n0(pa?.checkup), 5000 - checkSf);
  const sfAllowed = sf ? Math.min(n0(sf.premium) + checkSf, sfSenior ? 50000 : 25000) : 0;
  const paAllowed = pa ? Math.min(n0(pa.premium) + checkPa, pa.seniorCitizen ? 50000 : 25000) : 0;
  for (const r of [sf, pa]) if (r && sum(r.insurers.map((x) => n0(x.amount))) !== n0(r.premium)) issues.push({ field: 'section80D', message: 'Insurer rows must add up to the health insurance premium (Schedule 80D validation rules).' });
  const allowed = sfAllowed + paAllowed;
  const claimed = n0(sf?.premium) + checkSf + n0(pa?.premium) + checkPa;
  const schedule = {
    Sec80DSelfFamSrCtznHealth: {
      SeniorCitizenFlag: sf ? (sfSenior ? 'Y' : 'N') : 'S',
      SelfAndFamily: sf && !sfSenior ? sfAllowed : 0,
      ...(sf && !sfSenior ? { HealthInsPremSlfFam: n0(sf.premium), Sec80DSelfFamHIDtls: insurerRows(sf.insurers), PrevHlthChckUpSlfFam: checkSf } : {}),
      SelfAndFamilySeniorCitizen: sf && sfSenior ? sfAllowed : 0,
      ...(sf && sfSenior ? { HlthInsPremSlfFamSrCtzn: n0(sf.premium), Sec80DSelfFamSrCtznHIDtls: insurerRows(sf.insurers), PrevHlthChckUpSlfFamSrCtzn: checkSf, MedicalExpSlfFamSrCtzn: 0 } : {}),
      ParentsSeniorCitizenFlag: pa ? (pa.seniorCitizen ? 'Y' : 'N') : 'P',
      Parents: pa && !pa.seniorCitizen ? paAllowed : 0,
      ...(pa && !pa.seniorCitizen ? { HlthInsPremParents: n0(pa.premium), Sec80DParentsHIDtls: insurerRows(pa.insurers), PrevHlthChckUpParents: checkPa } : {}),
      ParentsSeniorCitizen: pa && pa.seniorCitizen ? paAllowed : 0,
      ...(pa && pa.seniorCitizen ? { HlthInsPremParentsSrCtzn: n0(pa.premium), Sec80DParentsSrCtznHIDtls: insurerRows(pa.insurers), PrevHlthChckUpParentsSrCtzn: checkPa, MedicalExpParentsSrCtzn: 0 } : {}),
      EligibleAmountOfDedn: allowed,
    },
  };
  return { allowed, claimed, schedule, issues };
}

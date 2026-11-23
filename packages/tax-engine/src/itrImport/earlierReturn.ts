import type { Deduction80DInput, Insurer, ItrBank } from '../itr/itrCommon.js';
import type { HouseLoan, GoodsCarriage } from '../itr/itr4Json.js';
import type { Itr2Employer, Itr2Property } from '../itr/itr2Json.js';

/**
 * Reads last year's income tax return JSON (ITR-1 to ITR-4, as downloaded from the e-filing portal or
 * written by SynexTax) and lifts out what carries into this year's return: the client's details, last
 * year's figures by head, losses brought forward (Schedule CFL and, for ITR-3, Schedule UD) and the
 * schedules that usually recur (employers, houses and their loans, bank accounts, 80C and 80D items,
 * presumptive business details).
 *
 * Field names are the Department's: they are the same in the AY 2026-27 schemas kept in
 * packages/tax-engine/schemas/itr, and in what the SynexTax writers produce. The parser is tolerant of
 * missing parts, since a portal download of an earlier year may differ in detail; anything it cannot
 * place is listed in `notes`. The file is untrusted input: only plain values are read, nothing is
 * evaluated, and strings are cut to the lengths the schemas allow.
 *
 * Carry forward rules applied (Income-tax Act 1961):
 * house property loss 8 assessment years (section 71B); business loss other than speculative 8 years
 * (72(3)); speculative business loss 4 years (73(4)); loss of a specified business under 35AD without
 * limit (73A(2)); short and long term capital loss 8 years (74(3)); loss from owning and maintaining
 * race horses 4 years (74A(3)); unabsorbed depreciation without limit (32(2)). Under section 80 a loss
 * under 72(1), 73(2), 73A(2), 74(1), 74(3) or 74A(3) is carried forward only where the return of the
 * loss year was filed within the time allowed by section 139(1); house property loss and unabsorbed
 * depreciation are not covered by section 80.
 */

export type ItrFormName = 'ITR-1' | 'ITR-2' | 'ITR-3' | 'ITR-4';

export type LossKind = 'houseProperty' | 'business' | 'speculative' | 'specifiedBusiness' | 'shortTermCapital' | 'longTermCapital' | 'raceHorses';

export const LOSS_KINDS: { kind: LossKind; field: string; years: number | null; section: string; label: string; coveredBy80: boolean }[] = [
  { kind: 'houseProperty', field: 'TotalHPPTILossCF', years: 8, section: '71B', label: 'House property loss', coveredBy80: false },
  { kind: 'business', field: 'BusLossOthThanSpecLossCF', years: 8, section: '72(3)', label: 'Business loss (other than speculative)', coveredBy80: true },
  { kind: 'speculative', field: 'LossFrmSpecBusCF', years: 4, section: '73(4)', label: 'Speculative business loss', coveredBy80: true },
  { kind: 'specifiedBusiness', field: 'LossFrmSpecifiedBusCF', years: null, section: '73A(2)', label: 'Specified business loss (35AD)', coveredBy80: true },
  { kind: 'shortTermCapital', field: 'TotalSTCGPTILossCF', years: 8, section: '74(3)', label: 'Short term capital loss', coveredBy80: true },
  { kind: 'longTermCapital', field: 'TotalLTCGPTILossCF', years: 8, section: '74(3)', label: 'Long term capital loss', coveredBy80: true },
  { kind: 'raceHorses', field: 'OthSrcLossRaceHorseCF', years: 4, section: '74A(3)', label: 'Loss from race horses', coveredBy80: true },
];

export type LossAmounts = Record<LossKind, number>;

export interface LossYearRow {
  /** Assessment year in which the loss arose, as 2024-25. */
  assessmentYear: string;
  /** Date on which the return of that year was filed, as shown in Schedule CFL. */
  dateOfFiling?: string;
  amounts: LossAmounts;
}

export interface EarlierReturnImport {
  form: ItrFormName;
  /** Assessment year of the imported return, as 2025-26. */
  assessmentYear: string;
  /** The assessment year the carried items are meant for (the next one). */
  carriesTo: string;
  writtenBy?: string;
  client: {
    firstName?: string; middleName?: string; surname: string; pan: string; dob?: string; status?: string;
    address: { residenceNo: string; locality: string; city: string; stateCode: string; pin: string };
    mobile: string; email: string; fatherName: string; place: string;
    employerCategory?: string; residentialStatus?: string;
  };
  filing: { section?: number; regime: 'NEW' | 'OLD'; dueDate?: string; form10IEA?: { assessmentYear: string; ack: string; date?: string } };
  /** Last year's figures as returned. */
  heads: {
    salary: number; houseProperty: number; capitalGains: number; business: number; otherSources: number;
    grossTotalIncome: number; deductions: number; totalIncome: number; taxLiability: number; taxesPaid: number; refund: number; payable: number;
  };
  otherSourcesDetail: { savingsInterest: number; depositInterest: number; dividends: number; other: number };
  employers: (Omit<Itr2Employer, 'gross' | 'tds' | 'nature' | 'address'> & { nature?: Itr2Employer['nature']; address?: Itr2Employer['address']; lastYearGross: number; lastYearTds: number })[];
  houses: (Itr2Property & { share?: number; lastYear: { rent: number; municipalTax: number; interest: number; income: number } })[];
  banks: ItrBank[];
  section80C: { amount: number; id: string }[];
  section80D?: Deduction80DInput;
  /** Chapter VI-A deductions allowed last year, by the schema's field name (Section80C and so on). */
  chapterVIA: Record<string, number>;
  business?: {
    natures: { code: string; tradeName?: string }[];
    ad?: { code: string; name: string; lastYearTurnover: number; lastYearIncome: number };
    ada?: { code: string; name: string; lastYearReceipts: number; lastYearIncome: number };
    ae?: { code: string; name: string; vehicles: GoodsCarriage[] };
    gstins: string[];
  };
  losses: {
    /** Rows as last year's Schedule CFL shows them: earlier years before last year's set-off, and last year's own loss. */
    rows: LossYearRow[];
    /** Brought forward losses set off last year (Schedule CFL, adjusted in Schedule BFLA). */
    setOffLastYear: LossAmounts;
    /** Total carried forward according to last year's return. */
    totalAsReturned: LossAmounts;
    /** What can be brought forward into `carriesTo`, by year of loss, after last year's set-off (oldest first) and the time limits. */
    available: LossYearRow[];
    availableTotal: LossAmounts;
    /** Amounts that run out before `carriesTo` or are barred by section 80. */
    lapsed: { assessmentYear: string; kind: LossKind; amount: number; reason: string }[];
    unabsorbedDepreciation: { assessmentYear: string; depreciation: number; allowance35: number }[];
  };
  notes: string[];
}

export class EarlierReturnError extends Error {}

// ---------- small readers for untrusted JSON ----------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : isObj(v) ? [v] : []);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const str = (v: unknown, max = 125): string => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((x, k) => (isObj(x) ? x[k] : undefined), o);
const first = (o: unknown, paths: string[]): unknown => {
  for (const p of paths) { const v = at(o, p); if (v !== undefined && v !== null) return v; }
  return undefined;
};
const ayLabel = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
const zeroLoss = (): LossAmounts => ({ houseProperty: 0, business: 0, speculative: 0, specifiedBusiness: 0, shortTermCapital: 0, longTermCapital: 0, raceHorses: 0 });
const readLoss = (o: unknown): LossAmounts => {
  const r = zeroLoss();
  for (const k of LOSS_KINDS) r[k.kind] = Math.max(0, num(obj(o)[k.field]));
  return r;
};
const anyLoss = (a: LossAmounts) => Object.values(a).some((v) => v > 0);

const MAX_DEPTH = 64;
/** Rejects deeply nested input before anything walks it. */
function depthOk(v: unknown, d = 0): boolean {
  if (d > MAX_DEPTH) return false;
  if (Array.isArray(v)) return v.every((x) => depthOk(x, d + 1));
  if (isObj(v)) return Object.values(v).every((x) => depthOk(x, d + 1));
  return true;
}

/** Accepts the parsed JSON or its text. */
export function parseEarlierReturn(input: unknown): EarlierReturnImport {
  let root: unknown = input;
  if (typeof input === 'string') {
    try { root = JSON.parse(input.replace(/^﻿/, '')); } catch { throw new EarlierReturnError('The file is not valid JSON. Upload the return JSON as downloaded from the e-filing portal.'); }
  }
  if (!depthOk(root)) throw new EarlierReturnError('The file is nested too deeply to be an income tax return.');
  const itr = isObj(obj(root).ITR) ? obj(obj(root).ITR) : obj(root);
  const formKey = Object.keys(itr).find((k) => /^ITR[1-7]$/.test(k));
  if (!formKey) throw new EarlierReturnError('No ITR form was found in the file. Upload the JSON of an ITR-1, ITR-2, ITR-3 or ITR-4.');
  if (!/^ITR[1-4]$/.test(formKey)) throw new EarlierReturnError(`${formKey.replace('ITR', 'ITR-')} is not covered: only ITR-1 to ITR-4 can be imported.`);
  const f = obj(itr[formKey]);
  const n = Number(formKey.slice(3)) as 1 | 2 | 3 | 4;
  const form = `ITR-${n}` as ItrFormName;
  const notes: string[] = [];

  const ayRaw = str(at(f, `Form_ITR${n}.AssessmentYear`), 4);
  const ayStart = /^\d{4}$/.test(ayRaw) ? Number(ayRaw) : NaN;
  if (!Number.isFinite(ayStart)) throw new EarlierReturnError('The assessment year (Form_ITR.AssessmentYear) is missing from the file.');
  if (ayStart < 2021 || ayStart > 2030) notes.push(`Assessment year ${ayLabel(ayStart)} is outside the years this import was checked against; review every figure.`);

  // ---------- client ----------
  const gen = n === 2 || n === 3 ? obj(f.PartA_GEN1) : f;
  const pi = obj(gen.PersonalInfo);
  const fs = obj(gen.FilingStatus);
  const ad = obj(pi.Address);
  const name = obj(pi.AssesseeName);
  const decl = obj(at(f, 'Verification.Declaration'));
  const pan = str(pi.PAN, 10).toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) notes.push('The PAN in the file is not in the usual form.');
  const client: EarlierReturnImport['client'] = {
    ...(str(name.FirstName) ? { firstName: str(name.FirstName, 25) } : {}),
    ...(str(name.MiddleName) ? { middleName: str(name.MiddleName, 25) } : {}),
    surname: str(name.SurNameOrOrgName, 75),
    pan,
    ...(/^\d{4}-\d{2}-\d{2}$/.test(str(pi.DOB, 10)) ? { dob: str(pi.DOB, 10) } : {}),
    ...(str(pi.Status) ? { status: str(pi.Status, 2) } : {}),
    address: { residenceNo: str(ad.ResidenceNo, 50), locality: str(ad.LocalityOrArea, 50), city: str(ad.CityOrTownOrDistrict, 50), stateCode: str(ad.StateCode, 2), pin: str(ad.PinCode, 6) },
    mobile: str(ad.MobileNo, 10),
    email: str(ad.EmailAddress, 125),
    fatherName: str(decl.FatherName, 125),
    place: str(at(f, 'Verification.Place'), 50),
    ...(str(pi.EmployerCategory) ? { employerCategory: str(pi.EmployerCategory, 4) } : {}),
    ...(str(fs.ResidentialStatus) ? { residentialStatus: str(fs.ResidentialStatus, 4) } : {}),
  };
  if (client.residentialStatus && client.residentialStatus !== 'RES') notes.push(`Last year the residential status was ${client.residentialStatus}; it is decided afresh each year under section 6.`);

  // Regime: OptOutNewTaxRegime in ITR-1 and ITR-2; Form 10-IEA flags in ITR-3 and ITR-4 (section 115BAC(6)).
  const old = fs.OptOutNewTaxRegime === 'Y' || fs.F10IEACurrAYOldRegime === 'Y' || (fs.Form10IEAEarlierAYOldRegime === 'Y' && fs.F10IEAEarlierAYNewRegime !== 'Y' && fs.F10IEACurrAYNewRegime !== 'Y');
  let form10IEA: EarlierReturnImport['filing']['form10IEA'];
  if (fs.F10IEACurrAYOldRegime === 'Y' && str(fs.F10IEAAckNoCurrAYOldTax)) form10IEA = { assessmentYear: ayLabel(ayStart), ack: str(fs.F10IEAAckNoCurrAYOldTax, 15), ...(str(fs.F10IEADateCurrAYOldTax) ? { date: str(fs.F10IEADateCurrAYOldTax, 10) } : {}) };
  else if (fs.Form10IEAEarlierAYOldRegime === 'Y' && str(fs.Form10IEAEarlierAYAckOldRegime)) form10IEA = { assessmentYear: str(fs.Form10IEAAssYear, 7), ack: str(fs.Form10IEAEarlierAYAckOldRegime, 15) };
  if (form10IEA) notes.push(`Form 10-IEA (acknowledgement ${form10IEA.ack}, AY ${form10IEA.assessmentYear}) was relied on for the old regime. Under the proviso to section 115BAC(6) a person with business income can withdraw the option only once; confirm the regime for this year.`);
  const section = num(fs.ReturnFileSec) || undefined;
  const filing: EarlierReturnImport['filing'] = { ...(section ? { section } : {}), regime: old ? 'OLD' : 'NEW', ...(str(fs.ItrFilingDueDate) ? { dueDate: str(fs.ItrFilingDueDate, 10) } : {}), ...(form10IEA ? { form10IEA } : {}) };

  // ---------- heads ----------
  const inc = n === 1 ? obj(f.ITR1_IncomeDeductions) : n === 4 ? obj(f.IncomeDeductions) : {};
  const ti = obj(f['PartB-TI']);
  const tti = obj(f.PartB_TTI);
  const heads: EarlierReturnImport['heads'] = n === 1 || n === 4
    ? {
      salary: num(inc.IncomeFromSal), houseProperty: num(inc.TotalIncomeChargeableUnHP),
      capitalGains: num(at(f, 'LTCG112A.LongCap112A')) || num(at(f, 'ScheduleLTCG112A.LongCap112A')) || Math.max(0, num(inc.GrossTotIncomeIncLTCG112A) - num(inc.GrossTotIncome)),
      business: num(inc.IncomeFromBusinessProf), otherSources: num(inc.IncomeOthSrc),
      grossTotalIncome: num(inc.GrossTotIncomeIncLTCG112A) || num(inc.GrossTotIncome), deductions: num(at(inc, 'DeductUndChapVIA.TotalChapVIADeductions')), totalIncome: num(inc.TotalIncome),
      taxLiability: num(first(f, [n === 1 ? 'ITR1_TaxComputation.GrossTaxLiability' : 'TaxComputation.GrossTaxLiability'])),
      taxesPaid: num(at(f, 'TaxPaid.TaxesPaid.TotalTaxesPaid')), refund: num(at(f, 'Refund.RefundDue')), payable: num(at(f, 'TaxPaid.BalTaxPayable')),
    }
    : {
      salary: num(first(f, ['ScheduleS.TotIncUnderHeadSalaries', 'PartB-TI.Salaries'])),
      houseProperty: num(first(f, ['ScheduleHP.TotalIncomeChargeableUnHP', 'PartB-TI.IncomeFromHP'])),
      capitalGains: num(at(ti, 'CapGain.TotalCapGains')), business: num(at(ti, 'ProfBusGain.TotProfBusGain')),
      otherSources: num(at(ti, 'IncFromOS.TotIncFromOS')), grossTotalIncome: num(ti.GrossTotalIncome), deductions: num(ti.DeductionsUnderScheduleVIA), totalIncome: num(ti.TotalIncome),
      taxLiability: num(at(tti, 'ComputationOfTaxLiability.GrossTaxLiability')), taxesPaid: num(at(tti, 'TaxPaid.TaxesPaid.TotalTaxesPaid')),
      refund: num(at(tti, 'Refund.RefundDue')), payable: num(at(tti, 'TaxPaid.BalTaxPayable')),
    };

  // Other sources split (used to suggest which kinds of income to expect again).
  const osDetail = { savingsInterest: 0, depositInterest: 0, dividends: 0, other: 0 };
  if (n === 1 || n === 4) {
    for (const r of arr(at(inc, 'OthersInc.OthersIncDtlsOthSrc'))) {
      const k = str(obj(r).OthSrcNatureDesc, 10); const v = num(obj(r).OthSrcOthAmount);
      if (k === 'SAV') osDetail.savingsInterest += v; else if (k === 'IFD') osDetail.depositInterest += v; else if (k === 'DIV') osDetail.dividends += v; else osDetail.other += v;
    }
  } else {
    const os = obj(at(f, 'ScheduleOS.IncOthThanOwnRaceHorse'));
    osDetail.savingsInterest = num(os.IntrstFrmSavingBank);
    osDetail.depositInterest = num(os.IntrstFrmTermDeposit);
    osDetail.dividends = num(os.DividendGross);
    osDetail.other = Math.max(0, num(os.GrossIncChrgblTaxAtAppRate) - osDetail.savingsInterest - osDetail.depositInterest - osDetail.dividends);
  }

  // ---------- employers ----------
  const employers: EarlierReturnImport['employers'] = [];
  const tdsByTan = new Map<string, number>();
  for (const r of arr(first(f, ['TDSonSalaries.TDSonSalary', 'ScheduleTDS1.TDSonSalary']))) {
    const o = obj(r); const tan = str(at(o, 'EmployerOrDeductorOrCollectDetl.TAN'), 10).toUpperCase();
    tdsByTan.set(tan, (tdsByTan.get(tan) ?? 0) + num(o.TotalTDSSal));
    if (n === 1 || n === 4) employers.push({ name: str(at(o, 'EmployerOrDeductorOrCollectDetl.EmployerOrDeductorOrCollecterName'), 125), ...(tan ? { tan } : {}), lastYearGross: num(o.IncChrgSal), lastYearTds: num(o.TotalTDSSal) });
  }
  if (n === 1 || n === 4) {
    if (employers.length) notes.push('ITR-1 and ITR-4 show income chargeable by employer, not gross salary; the employer figure shown is that amount.');
  } else {
    for (const r of arr(at(f, 'ScheduleS.Salaries'))) {
      const o = obj(r); const tan = str(o.TANofEmployer, 10).toUpperCase(); const a = obj(o.AddressDetail);
      const nature = str(o.NatureOfEmployment, 4) as Itr2Employer['nature'];
      employers.push({
        name: str(o.NameOfEmployer, 125), ...(tan ? { tan } : {}), ...(nature ? { nature } : {}),
        ...(str(a.AddrDetail) ? { address: { line: str(a.AddrDetail, 100), city: str(a.CityOrTownOrDistrict, 50), stateCode: str(a.StateCode, 2), pin: str(a.PinCode, 6) } } : {}),
        lastYearGross: num(at(o, 'Salarys.GrossSalary')), lastYearTds: tdsByTan.get(tan) ?? 0,
      });
    }
  }

  // ---------- houses ----------
  const houses: EarlierReturnImport['houses'] = [];
  const propRows = n === 1 || n === 4 ? arr(inc.PropertyDetails) : arr(at(f, 'ScheduleHP.PropertyDetails'));
  for (const r of propRows) {
    const o = obj(r); const a = obj(o.AddressDetailWithZipCode); const rd = obj(o.Rentdetails);
    const loans: HouseLoan[] = arr(at(rd, 'Section24B.Section24BDtls')).map((x) => {
      const l = obj(x);
      return { from: (str(l.LoanTknFrom, 1) === 'I' ? 'I' : 'B') as HouseLoan['from'], lender: str(l.BankOrInstnName, 125), account: str(l.LoanAccNoOfBankOrInstnRefNo, 20), sanctionedOn: str(l.DateofLoan, 10), amount: num(l.TotalLoanAmt), outstanding: num(l.LoanOutstndngAmt), interest: 0 };
    });
    const share = num(o.AsseseeShareProperty);
    houses.push({
      letOut: ['L', 'D'].includes(str(o.ifLetOut, 1)), address: str(a.AddrDetail, 50), city: str(a.CityOrTownOrDistrict, 50), stateCode: str(a.StateCode, 2), pin: str(a.PinCode, 6),
      ...(loans.length ? { loans } : {}), ...(share && share !== 100 ? { share } : {}),
      lastYear: { rent: num(rd.AnnualLetableValue), municipalTax: num(rd.LocalTaxes), interest: num(rd.IntOnBorwCap), income: num(rd.IncomeOfHP) },
    });
    if (str(o.ifLetOut, 1) === 'D') notes.push(`House at ${str(a.AddrDetail, 50)} was shown as deemed let out; it is carried as let out.`);
  }
  if (houses.some((h) => h.loans?.length)) notes.push('Home loans are carried with last year\'s outstanding balance; enter this year\'s interest from the lender\'s certificate.');

  // ---------- banks ----------
  const bankRows = arr(first(f, ['Refund.BankAccountDtls.AddtnlBankDetails', 'PartB_TTI.Refund.BankAccountDtls.AddtnlBankDetails']));
  const TYPES = ['SB', 'CA', 'CC', 'OD', 'NRO', 'OTH'] as const;
  const banks: ItrBank[] = bankRows.map((x) => {
    const b = obj(x); const t = str(b.AccountType, 3) as ItrBank['type'];
    return { ifsc: str(b.IFSCCode, 11).toUpperCase(), name: str(b.BankName, 125), account: str(b.BankAccountNo, 20), type: (TYPES as readonly string[]).includes(t) ? t : 'SB' };
  }).filter((b) => b.ifsc || b.account);
  // The refund account is listed first.
  bankRows.forEach((x, k) => { if (str(obj(x).UseForRefund) === 'true' && k > 0 && banks[k]) banks.unshift(...banks.splice(k, 1)); });

  // ---------- deductions ----------
  const section80C = arr(at(f, 'Schedule80C.Schedule80CDtls')).map((x) => ({ amount: num(obj(x).Amount), id: str(obj(x).IdentificationNo, 50) })).filter((r) => r.amount > 0 || r.id);
  const viaAllowed = obj(n === 1 || n === 4 ? inc.DeductUndChapVIA : at(f, 'ScheduleVIA.DeductUndChapVIA'));
  const chapterVIA: Record<string, number> = {};
  for (const [k, v] of Object.entries(viaAllowed)) if (/^Section80/.test(k) && num(v) > 0) chapterVIA[k.slice(0, 40)] = num(v);

  let section80D: Deduction80DInput | undefined;
  const d80 = obj(at(f, 'Schedule80D.Sec80DSelfFamSrCtznHealth'));
  if (Object.keys(d80).length) {
    const ins = (v: unknown): Insurer[] => arr(at(v, 'Sch80DInsDtls')).map((x) => ({ name: str(obj(x).InsurerName, 125), policy: str(obj(x).PolicyNo, 75), amount: num(obj(x).HealthInsAmt) }));
    const sfSenior = d80.SeniorCitizenFlag === 'Y';
    const paSenior = d80.ParentsSeniorCitizenFlag === 'Y';
    const sfIns = ins(sfSenior ? d80.Sec80DSelfFamSrCtznHIDtls : d80.Sec80DSelfFamHIDtls);
    const paIns = ins(paSenior ? d80.Sec80DParentsSrCtznHIDtls : d80.Sec80DParentsHIDtls);
    section80D = {
      ...(d80.SeniorCitizenFlag === 'Y' || d80.SeniorCitizenFlag === 'N' ? { selfFamily: { premium: num(sfSenior ? d80.HlthInsPremSlfFamSrCtzn : d80.HealthInsPremSlfFam), checkup: num(sfSenior ? d80.PrevHlthChckUpSlfFamSrCtzn : d80.PrevHlthChckUpSlfFam), seniorCitizen: sfSenior, insurers: sfIns } } : {}),
      ...(d80.ParentsSeniorCitizenFlag === 'Y' || d80.ParentsSeniorCitizenFlag === 'N' ? { parents: { premium: num(paSenior ? d80.HlthInsPremParentsSrCtzn : d80.HlthInsPremParents), checkup: num(paSenior ? d80.PrevHlthChckUpParentsSrCtzn : d80.PrevHlthChckUpParents), seniorCitizen: paSenior, insurers: paIns } } : {}),
    };
  }
  if (section80C.length || section80D) notes.push('80C and 80D items are carried with last year\'s amounts; confirm each with this year\'s receipts.');

  // ---------- business ----------
  let business: EarlierReturnImport['business'];
  if (n === 3 || n === 4) {
    // ITR-4 keeps them in Schedule BP; ITR-3 in Part A-P&L (presumptive items), with Schedule BP as a fallback.
    const bp = n === 4 ? obj(f.ScheduleBP) : { ...obj(f.ITR3ScheduleBP), ...obj(f.PARTA_PL) };
    const nat = (k: string, codeKey: string) => { const r = obj(arr(bp[k])[0]); return r[codeKey] ? { code: str(r[codeKey], 10), name: str(r.NameOfBusiness, 75) } : undefined; };
    const nad = nat('NatOfBus44AD', 'CodeAD'); const nada = nat('NatOfBus44ADA', 'CodeADA'); const nae = nat('NatOfBus44AE', 'CodeAE');
    const p44ad = obj(bp.PersumptiveInc44AD); const p44ada = obj(bp.PersumptiveInc44ADA);
    const vehicles: GoodsCarriage[] = arr(bp.GoodsDtlsUs44AE).map((x) => {
      const v = obj(x); const own = str(v.OwnedLeasedHiredFlag, 6);
      return { regNo: str(v.RegNumberGoodsCarriage, 11), ownership: (own === 'LEASE' || own === 'HIRED' ? own : 'OWN') as GoodsCarriage['ownership'], tonnage: num(v.TonnageCapacity), months: 12 };
    });
    const natures = arr(at(f, 'PartA_GEN2.NatOfBus.NatureOfBusiness')).map((x) => ({ code: str(obj(x).Code, 10), ...(str(obj(x).TradeName1) ? { tradeName: str(obj(x).TradeName1, 125) } : {}) })).filter((x) => x.code);
    business = {
      natures,
      ...(nad ? { ad: { ...nad, lastYearTurnover: num(p44ad.GrsTotalTrnOver) || num(p44ad.GrsTrnOverOrReceipt), lastYearIncome: num(p44ad.TotPersumptiveInc44AD) } } : {}),
      ...(nada ? { ada: { ...nada, lastYearReceipts: num(p44ada.GrsReceipt), lastYearIncome: num(p44ada.TotPersumptiveInc44ADA) } } : {}),
      ...(nae ? { ae: { ...nae, vehicles } } : {}),
      gstins: arr(bp.TurnoverGrsRcptForGSTIN).map((x) => str(obj(x).GSTINNo, 15)).filter(Boolean),
    };
    if (vehicles.length) notes.push('Goods carriages are carried with 12 months held; change the months for any vehicle bought or sold this year.');
    if (nad) notes.push('44AD was used last year. Under section 44AD(4), a person who declares profit below the presumptive rate after opting in may not use 44AD for the next five years; check the history before switching.');
  }

  // ---------- losses ----------
  const cfl = obj(f.ScheduleCFL);
  const rows: LossYearRow[] = [];
  for (const [key, v] of Object.entries(cfl)) {
    let lossAy: number | undefined;
    // Year of each row. ITR-2 keys count back from the return's year (descriptions in the AY 2026-27 ITR-2
    // schema: LossCFFromPrev8thYearFromAY is AY 2018-19). ITR-3 keys: LossCFCurrentAssmntYearYYYY is AY (YYYY-1)
    // to YYYY, and the older keys sit seven years further back (ITR-3 AY 2026-27 schema descriptions).
    let m: RegExpMatchArray | null;
    if ((m = key.match(/^LossCFCurrentAssmntYear(\d{4})$/))) lossAy = Number(m[1]) - 1;
    else if (n === 3 && key === 'LossCFCurrentAssmntYear') lossAy = ayStart - 7;
    else if (n === 3 && key === 'LossCFFromPrevYrToAY') lossAy = ayStart - 8;
    else if (n === 3 && (m = key.match(/^LossCFFromPrev(\d+)(?:st|nd|rd|th)YearFromAY$/))) lossAy = ayStart - 7 - Number(m[1]);
    else if (key === 'LossCFFromPrevYrToAY') lossAy = ayStart - 1;
    else if ((m = key.match(/^LossCFFromPrev(\d+)(?:st|nd|rd|th)YearFromAY$/))) lossAy = ayStart - Number(m[1]);
    if (lossAy === undefined) continue;
    const d = obj(obj(v).CarryFwdLossDetail);
    const amounts = readLoss(d);
    if (!anyLoss(amounts)) continue;
    rows.push({ assessmentYear: ayLabel(lossAy), ...(str(d.DateOfFiling) ? { dateOfFiling: str(d.DateOfFiling, 10) } : {}), amounts });
  }
  if (n === 3 && Object.keys(cfl).some((k) => /^LossCFCurrentAssmntYear\d{4}$/.test(k)) && ayStart !== 2026) {
    notes.push('The years of the ITR-3 loss rows were read with the AY 2026-27 key layout; check them against the return.');
  }
  const current = readLoss(at(cfl, 'CurrentAYloss.LossSummaryDetail'));
  if (anyLoss(current)) rows.push({ assessmentYear: ayLabel(ayStart), amounts: current });
  rows.sort((a, b) => a.assessmentYear.localeCompare(b.assessmentYear));
  const setOff = readLoss(at(cfl, 'AdjTotBFLossInBFLA.LossSummaryDetail'));
  const totalAsReturned = readLoss(at(cfl, 'TotalLossCFSummary.LossSummaryDetail'));

  // Last year's set-off is spread over the earlier years oldest first; the schedule does not record the split.
  const target = ayStart + 1;
  const available: LossYearRow[] = rows.map((r) => ({ ...r, amounts: { ...r.amounts } }));
  const lapsed: EarlierReturnImport['losses']['lapsed'] = [];
  for (const k of LOSS_KINDS) {
    let left = setOff[k.kind];
    for (const r of available) {
      if (r.assessmentYear === ayLabel(ayStart) || left <= 0) continue;
      const t = Math.min(left, r.amounts[k.kind]);
      r.amounts[k.kind] -= t; left -= t;
    }
    if (left > 0) notes.push(`${k.label}: last year's set-off is more than the earlier years' balance by Rs ${left}.`);
  }
  const belatedLastYear = section === 12;
  for (const r of available) {
    const lossAy = Number(r.assessmentYear.slice(0, 4));
    for (const k of LOSS_KINDS) {
      const amt = r.amounts[k.kind];
      if (amt <= 0) continue;
      if (k.years !== null && target - lossAy > k.years) {
        lapsed.push({ assessmentYear: r.assessmentYear, kind: k.kind, amount: amt, reason: `Can be carried forward for ${k.years} assessment years only (section ${k.section}).` });
        r.amounts[k.kind] = 0;
      } else if (belatedLastYear && lossAy === ayStart && k.coveredBy80) {
        lapsed.push({ assessmentYear: r.assessmentYear, kind: k.kind, amount: amt, reason: 'The return of that year was filed under section 139(4), after the due date; section 80 bars carrying this loss forward.' });
        r.amounts[k.kind] = 0;
      }
    }
  }
  const availableRows = available.filter((r) => anyLoss(r.amounts));
  const availableTotal = zeroLoss();
  for (const r of availableRows) for (const k of LOSS_KINDS) availableTotal[k.kind] += r.amounts[k.kind];
  const lapsedTotal = zeroLoss();
  for (const l of lapsed) lapsedTotal[l.kind] += l.amount;
  if (Object.keys(cfl).length) {
    for (const k of LOSS_KINDS) {
      if (availableTotal[k.kind] + lapsedTotal[k.kind] !== totalAsReturned[k.kind] && (availableTotal[k.kind] || totalAsReturned[k.kind])) {
        notes.push(`${k.label}: the year rows come to Rs ${availableTotal[k.kind] + lapsedTotal[k.kind]} but the return carries Rs ${totalAsReturned[k.kind]} forward; check Schedule CFL.`);
      }
    }
  }
  if (anyLoss(setOff) && rows.some((r) => r.assessmentYear !== ayLabel(ayStart))) notes.push('Last year\'s set-off of brought forward losses is taken against the oldest years first; the return does not record the split by year.');

  const unabsorbedDepreciation = arr(at(f, 'ITR3ScheduleUD.ScheduleUD')).map((x) => {
    const u = obj(x);
    return { assessmentYear: str(u.AssYr, 7), depreciation: num(u.BalCFNY), allowance35: num(u.AllowBalCFNY) };
  }).filter((u) => u.depreciation > 0 || u.allowance35 > 0);
  if (belatedLastYear && anyLoss(current)) notes.push('Last year\'s return was belated (section 139(4)); only its house property loss is carried forward (section 80).');

  return {
    form,
    assessmentYear: ayLabel(ayStart),
    carriesTo: ayLabel(target),
    ...(str(at(f, 'CreationInfo.SWCreatedBy')) ? { writtenBy: str(at(f, 'CreationInfo.SWCreatedBy'), 20) } : {}),
    client,
    filing,
    heads,
    otherSourcesDetail: osDetail,
    employers,
    houses,
    banks,
    section80C,
    ...(section80D ? { section80D } : {}),
    chapterVIA,
    ...(business ? { business } : {}),
    losses: { rows, setOffLastYear: setOff, totalAsReturned, available: availableRows, availableTotal, lapsed, unabsorbedDepreciation },
    notes,
  };
}

/** The parts of an import that slot straight into this year's ITR input (Itr1Input to Itr4Input field names). */
export function earlierReturnPrefill(r: EarlierReturnImport) {
  const c = r.client;
  return {
    person: {
      ...(c.firstName ? { firstName: c.firstName } : {}), ...(c.middleName ? { middleName: c.middleName } : {}), surname: c.surname, pan: c.pan, dob: c.dob ?? '',
      ...(c.employerCategory && c.employerCategory !== 'NA' ? { employerCategory: c.employerCategory } : {}),
      address: c.address, mobile: c.mobile, email: c.email, fatherName: c.fatherName, place: c.place,
    },
    filing: { regime: r.filing.regime, ...(r.filing.form10IEA ? { form10IEA: r.filing.form10IEA } : {}) },
    ...(r.banks[0] ? { bank: r.banks[0] } : {}),
    employers: r.employers.map((e) => ({ name: e.name, ...(e.tan ? { tan: e.tan } : {}), ...(e.nature ? { nature: e.nature } : {}), ...(e.address ? { address: e.address } : {}), gross: 0, tds: 0 })),
    houses: r.houses.map(({ lastYear: _l, share: _s, ...h }) => h),
    deductions: {
      ...(r.section80C.length ? { section80C: r.section80C } : {}),
      ...(r.chapterVIA.Section80CCD1B ? { section80CCD1B: r.chapterVIA.Section80CCD1B } : {}),
      ...(r.section80D ? { section80D: r.section80D } : {}),
    },
    ...(r.business ? {
      business: {
        ...(r.business.natures.length ? { natures: r.business.natures } : {}),
        ...(r.business.ad ? { ad: { code: r.business.ad.code, name: r.business.ad.name, digital: 0, cash: 0 } } : {}),
        ...(r.business.ada ? { ada: { code: r.business.ada.code, name: r.business.ada.name, digital: 0, cash: 0 } } : {}),
        ...(r.business.ae ? { ae: r.business.ae } : {}),
        ...(r.business.gstins.length ? { gstins: r.business.gstins.map((g) => ({ gstin: g, turnover: 0 })) } : {}),
      },
    } : {}),
    flags: { lossesBroughtForward: Object.values(r.losses.availableTotal).some((v) => v > 0) || r.losses.unabsorbedDepreciation.length > 0 },
  };
}

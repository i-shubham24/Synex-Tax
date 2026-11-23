import { maskPan } from '../import/clientImport.js';
import type { SectionLine } from '../tds/registers.js';
import { clean, n0 } from '../itr/itrCommon.js';
import type { Clause8Code } from './applicability.js';
import {
  CLAUSE12_SECTIONS, CLAUSE16B_DESCRIPTIONS, CLAUSE19_SECTIONS, CLAUSE20B_FUNDS, CLAUSE26_SECTIONS, CLAUSE31_MODES, CLAUSE34_FORMS, CLAUSE34_SECTIONS, ICDS_CODES,
  INDIRECT_TAX_TYPES, TAX_AUDIT_ACTS, TAX_AUDIT_BLOCKS, TAX_AUDIT_BUSINESS_CODES, TAX_AUDIT_COUNTRIES, TAX_AUDIT_OBSERVATIONS, TAX_AUDIT_SECTORS, TAX_AUDIT_STATES, TAX_AUDIT_STATUS,
} from './codes.js';

/**
 * Tax audit report JSON for the previous year 2025-26 (assessment year 2026-27): Form 3CA or Form
 * 3CB with the statement of particulars in Form 3CD, to the Income Tax Department's schema
 * FORM3CA3CD_3CB3CD_MainSchema V2.5 (released 1 Apr 2026; schema_3CA.json and schema_3CB.json, kept
 * in packages/tax-engine/schemas/taxAudit). Every test output is validated against both files.
 *
 * Where the schema leaves a choice open, the writer follows the Department's offline utility for
 * Form 3CA-3CD and 3CB-3CD (version 1.5, 2 Apr 2026): its form-to-JSON conversion and its preview
 * template, which carries the text of each clause of Form 3CD. The Department has not published
 * separate validation rules for these forms; the utility's required fields stand in for them.
 *
 * Built from structured input: Part A (clauses 1 to 8A), clauses 9 to 14, 16 to 22, 26, 31, 34, 37
 * to 40 and 44. Every other clause of Part B must be declared not applicable in the input, and is
 * then answered the way the schema allows (a "No" or "Not applicable" flag, or no rows); otherwise
 * the file is refused with the list of clauses still needed. Clauses 28, 29 and 36 are not reported
 * for AY 2026-27 (the utility's preview: clause 28 omitted from AY 2025-26, clause 29 applicable
 * till AY 2024-25, clause 36 applicable till AY 2020-21; schema change document V2.2, items 21 and 22).
 */

export const TAX_AUDIT_AY = '2026-27';
const PY_FROM = '2025-04-01';
const PY_TO = '2026-03-31';

/** Part B clauses this writer does not build. Each must be listed in notApplicable before a file is written. */
export const UNBUILT_CLAUSES = ['15', '23', '24', '25', '27', '29A', '29B', '30', '30A', '30B', '30C', '32', '33', '35', '36A', '36B', '41', '42', '43'] as const;
export type UnbuiltClause = (typeof UNBUILT_CLAUSES)[number];

/** Part B clauses built here, with the input key each one needs. Clause 9 is needed only for a firm, LLP, AOP or BOI. */
export const BUILT_CLAUSES = ['9', '10', '11', '12', '13', '14', '16', '17', '18', '19', '20', '21', '22', '26', '31', '34', '37', '38', '39', '40', '44'] as const;

export type YesNo = 'Y' | 'N';
export interface TaxAuditIssue { field: string; message: string }

export interface TaxAuditAddress {
  line1: string;
  line2?: string;
  city: string;
  /** Two-digit code from TAX_AUDIT_STATES; 99 for an address outside India. */
  stateCode: string;
  /** PIN code, or the ZIP code of a foreign address. */
  pin: string;
  /** Code from TAX_AUDIT_COUNTRIES; 91 (India) if left out. */
  countryCode?: string;
}

export interface Described { description: string; amount: number }
export interface ProfitEffect { particulars: string; increase: number; decrease: number }
export interface TaxAuditParty { name: string; address: string; pan?: string; aadhaar?: string }

export interface Payee40a {
  date: string;
  amount: number;
  nature?: string;
  name: string;
  pan?: string;
  aadhaar?: string;
  address: TaxAuditAddress;
  taxDeducted?: number;
  taxDeposited?: number;
}

export interface Payment40A3 { date: string; nature: string; amount: number; name: string; pan?: string; aadhaar?: string }

export interface DepreciationBlock {
  method?: 'WDV' | 'SLM';
  /** Code from TAX_AUDIT_BLOCKS. */
  block: string;
  rate: number;
  openingWdv: number;
  /** Signed adjustment to the written down value of intangible assets for goodwill (the utility adds it to the opening figure). */
  goodwillAdjustment?: number;
  additions: { purchaseDate: string; putToUseDate: string; value: number; cenvat?: number; exchangeRate?: number; subsidy?: number; lessThan180Days: boolean }[];
  deductions: { saleDate: string; amount: number; outOfLessThan180DayAdditions: boolean }[];
  otherAdjustments?: number;
  /** Required for SLM, and where depreciation is not the plain section 32(1)(ii) figure (additional depreciation, for example). */
  depreciationAllowable?: number;
}

export interface Liability43B { section: string; nature: string; amount: number }
export interface Clause34aRow {
  tan: string;
  /** Section from CLAUSE34_SECTIONS. */
  section: string;
  nature: string;
  /** Column 4: total payment or receipt of that nature. */
  totalAmount: number;
  /** Column 5: amount on which tax was required to be deducted or collected. */
  requiredAmount: number;
  /** Columns 6 and 7: at the specified rate. */
  specifiedRateAmount: number;
  specifiedRateTax: number;
  /** Columns 8 and 9: at less than the specified rate. */
  lowerRateAmount: number;
  lowerRateTax: number;
  /** Column 10: deducted or collected but not deposited. */
  notDeposited: number;
}
export interface Clause34bRow { tan: string; form: string; dueDate: string; filedOn?: string; allReported: boolean; notReported?: string }
export interface Clause34cRow { tan: string; interestPayable: number; interestPaid: number; paidOn?: string }
export interface RatioYear { turnover: number; grossProfit?: number; netProfit?: number; stockInTrade?: number; materialConsumed?: number; finishedGoodsProduced?: number }
export interface OtherAudit { status: 'Y' | 'N' | 'X'; details?: string }

export interface PartBInput {
  clause9?: { partners: { name: string; share: number }[]; sharesIndeterminate?: YesNo; changes: { date: string; name: string; type: 'ADD' | 'DEL' | 'CHANGE'; oldShare?: number; newShare?: number; remarks: string }[] };
  clause10?: { codes: string[]; changes: { change: 'Added' | 'Discontinued'; code: string }[] };
  clause11?: { prescribed: string[]; maintained: { books: string; address: TaxAuditAddress }[]; examined: string[] };
  clause12?: { rows: { section: (typeof CLAUSE12_SECTIONS)[number]; otherSection?: string; amount: number }[] };
  /** method: 01 cash, 02 mercantile (schema Form3cdChngMethAccDtl.Detail). */
  clause13?: { method: '01' | '02'; changes: ProfitEffect[]; icdsAdjustments: { icds: (typeof ICDS_CODES)[number]; increase: number; decrease: number }[]; disclosures: { icds?: (typeof ICDS_CODES)[number]; text: string }[] };
  /** method: 1 at cost, 2 at market rate, 3 lower of cost or market rate (schema MethodValCS.ChangeType). */
  clause14?: { method: '1' | '2' | '3'; deviations145A: ProfitEffect[] };
  clause16?: { section28: Described[]; credits: { code: string; other?: string; amount: number }[]; escalation: Described[]; otherIncome: Described[]; capitalReceipts: Described[] };
  clause17?: { properties: { details: string; address: TaxAuditAddress; consideration: number; valuation: number; provisoApplies: boolean }[] };
  clause18?: { blocks: DepreciationBlock[] };
  clause19?: { rows: { section: (typeof CLAUSE19_SECTIONS)[number]; other?: string; debited: number; admissible: number }[] };
  clause20?: { bonus: Described[]; employeeContributions: { fund: string; received: number; dueDate: string; paid: number; paidOn?: string }[] };
  clause21?: {
    debited: { type: 'CAPITAL' | 'PERSONAL' | 'ADVERTISMNT' | 'CLUBFEE' | 'CLUBSERVICE' | 'PENALTY' | 'OTHERPENALTY' | 'UNDERLAW' | 'OFFENCE' | 'SETTLE'; particulars: string; amount: number }[];
    s40a: {
      nonResidentNotDeducted: Payee40a[]; nonResidentNotPaid: Payee40a[];
      residentNotDeducted: Payee40a[]; residentNotPaid: Payee40a[];
      levyNotDeducted: Payee40a[]; levyNotPaid: Payee40a[];
      salaryOutsideIndia: Payee40a[];
      fringeBenefitTax?: number; wealthTax?: number; royaltyIib?: number; providentFundIv?: number; perquisiteTaxV?: number;
    };
    s40b: { particulars: 'Interest' | 'Salary' | 'Bonus' | 'Commission' | 'Remuneration'; section: '40b' | '40ba'; debited: number; admissible: number; inadmissible: number; remarks: string }[];
    /** Payments not made by account payee cheque, draft or electronic means: section 40A(3) and 40A(3A). Empty lists answer "Yes". */
    s40A3: Payment40A3[];
    s40A3A: Payment40A3[];
    gratuity40A7?: number;
    employer40A9?: number;
    contingent: Described[];
    section14A: Described[];
    interest36_1_iii?: number;
  };
  clause22?: { interestInadmissible: number; payableToMicroSmall: number; paidInTime: number; notPaidInTime: number };
  clause26?: { preExistingPaid: Liability43B[]; preExistingUnpaid: Liability43B[]; currentPaid: Liability43B[]; currentUnpaid: Liability43B[]; indirectTaxThroughPl: boolean; note?: string };
  clause31?: {
    loans269SS: (TaxAuditParty & { amount: number; squaredUp: YesNo; maxOutstanding: number; mode: string; specify?: string; chequeType?: 'APC' | 'APBD' | 'OM' })[];
    specifiedSums269SS: (TaxAuditParty & { amount: number; mode: string; specify?: string; chequeType?: 'APC' | 'APBD' | 'OM' })[];
    receipts269STCash: (TaxAuditParty & { nature: string; amount: number; date: string })[];
    receipts269STCheque: (TaxAuditParty & { amount: number })[];
    payments269STCash: (TaxAuditParty & { nature: string; amount: number; date: string })[];
    payments269STCheque: (TaxAuditParty & { amount: number })[];
    repayments269T: (TaxAuditParty & { amount: number; maxOutstanding: number; mode: string; specify?: string; chequeType?: 'APC' | 'APBD' | 'OM' })[];
    repaymentsReceivedCash: (TaxAuditParty & { amount: number })[];
    repaymentsReceivedCheque: (TaxAuditParty & { amount: number })[];
  };
  clause34?: { required: boolean; rows: Clause34aRow[]; statementsRequired: boolean; statements: Clause34bRow[]; interest: 'Y' | 'N' | 'X'; interestRows: Clause34cRow[] };
  clause37?: OtherAudit;
  clause38?: OtherAudit;
  clause39?: OtherAudit;
  clause40?: { previous: RatioYear; preceding: RatioYear };
  clause44?: { total: number; exempt: number; composition: number; otherRegistered: number; unregistered: number };
}

export interface TaxAuditInput {
  form: '3CA' | '3CB';
  softwareId: string;
  createdOn: string;
  intermediaryCity: string;
  assessee: {
    firstName?: string;
    middleName?: string;
    /** Surname, or the full name of a firm, company or other entity. */
    name: string;
    pan: string;
    aadhaar?: string;
    /** Code from TAX_AUDIT_STATUS. */
    status: number;
    address: TaxAuditAddress;
    indirectTax: { type: string; regNo?: string; stateCode?: string; other?: string }[];
  };
  previousYear?: { from: string; to: string };
  clause8: Clause8Code[];
  clause8A?: { opted: boolean; section?: '115BA' | '115BAA' | '115BAB' | '115BAC' | '115BAD' | '115BAE' };
  auditor: {
    firstName?: string;
    middleName?: string;
    lastName: string;
    membershipNo: string;
    firmName?: string;
    firmRegNo?: string;
    /** We, our and us in the report when signing for a firm; I, my and me otherwise. */
    signsForFirm: boolean;
    address: TaxAuditAddress;
    place: string;
    signedOn: string;
  };
  accountType: 'Profit and loss account' | 'Income and expenditure account';
  form3CA?: { act: string; otherAct?: string; auditReportDate: string; statutoryAuditor: 'SELF' | 'OTHER'; statutoryAuditorName: string };
  form3CB?: { headOffice: string; branches: number; result: 'Profit' | 'Loss' | 'Surplus' | 'Deficit'; comments?: { kind: 'Observations' | 'Comments' | 'Discrepancies' | 'Inconsistencies'; text: string } };
  observations?: { code: string; text: string }[];
  partB: PartBInput;
  notApplicable?: UnbuiltClause[];
}

export interface TaxAuditResult {
  json: Record<string, unknown> | null;
  issues: TaxAuditIssue[];
  /** Clauses with no input and not declared not applicable. */
  clausesNeeded: string[];
  summary: Record<string, unknown>;
}

// Characters the schema's nonEmptyString accepts (word characters, white space and the listed punctuation).
const OK_CHAR = /[^\w\s=!@#$%^*(){}[\]|\\:;',.?/~`+<>&"-]/g;
const txt = (v: unknown, max: number) => clean(String(v ?? '').normalize('NFKD').replace(OK_CHAR, ' '), max);
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PAN = /^[A-Z]{3}[ABCFGHLJPTE][A-Z]\d{4}[A-Z]$/; // the utility's PAN check (field f3cdPan)
const PAN_ANY = /^[A-Z]{5}\d{4}[A-Z]$/;
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;
const yn = (b: boolean): YesNo => (b ? 'Y' : 'N');
const nonEmpty = <T>(xs: T[] | undefined) => (xs && xs.length ? xs : undefined);
const MAX_ROWS = 500; // above 500 rows the utility moves a table to a CSV attachment (schema CsvDtls, change document V1.2 item 33)
const BANK_MODES = new Set(['C', 'BD', 'E', 'CC', 'DC', 'NB', 'IMPS', 'UPI', 'RTGS', 'NEFT', 'BHIM', 'AOM']);

function prune<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined || x === null || (Array.isArray(x) && x.length === 0) ? undefined : x)));
}

export function writeForm3cd(i: TaxAuditInput): TaxAuditResult {
  const issues: TaxAuditIssue[] = [];
  const err = (field: string, message: string) => issues.push({ field, message });
  const na = new Set(i.notApplicable ?? []);
  const b = i.partB ?? {};
  const clausesNeeded: string[] = [];

  const addr = (a: TaxAuditAddress | undefined, field: string) => {
    if (!a) { err(field, 'Address is required.'); return undefined; }
    const country = a.countryCode ?? '91';
    if (!clean(a.line1, 100)) err(field, 'Address line 1 is required.');
    if (!clean(a.city, 50)) err(field, 'City or district is required.');
    if (!(country in TAX_AUDIT_COUNTRIES)) err(field, `Country code ${country} is not in the Department list.`);
    if (!(a.stateCode in TAX_AUDIT_STATES)) err(field, `State code ${a.stateCode} is not in the Department list.`);
    if (country === '91' && a.stateCode === '99') err(field, 'State code 99 is for an address outside India.');
    if (country === '91' && !/^[1-9]\d{5}$/.test(a.pin)) err(field, 'PIN code must be 6 digits.');
    if (country !== '91' && !clean(a.pin, 10)) err(field, 'ZIP code is required for an address outside India.');
    return { AddrDetail1: txt(a.line1, 100), AddrDetail2: a.line2 ? txt(a.line2, 100) : undefined, CityOrTownOrDistrict: txt(a.city, 50), StateCode: country === '91' ? a.stateCode : '99', CountryCode: country, PinCode: clean(a.pin, 10) };
  };
  const date = (v: string | undefined, field: string, label: string, required = true) => {
    if (!v) { if (required) err(field, `${label} is required.`); return undefined; }
    if (!ISO_DATE.test(v)) err(field, `${label} must be a date (YYYY-MM-DD).`);
    return v;
  };
  const amt = (v: number | undefined, field: string, label: string, opts: { signed?: boolean } = {}) => {
    const x = n0(v ?? 0);
    if (!Number.isFinite(x) || Math.abs(x) > 99999999999999) err(field, `${label} is out of range.`);
    else if (!opts.signed && x < 0) err(field, `${label} cannot be negative.`);
    return x;
  };
  const panOpt = (v: string | undefined, field: string) => {
    if (!v) return undefined;
    const p = v.trim().toUpperCase();
    if (!PAN_ANY.test(p)) err(field, `PAN ${maskPan(p)} is not valid.`);
    return p;
  };
  const aadhaarOpt = (v: string | undefined, field: string) => {
    if (!v) return undefined;
    if (!/^\d{12}$/.test(v)) err(field, 'Aadhaar number must be 12 digits.');
    return v;
  };
  const rows = <T>(xs: T[] | undefined, field: string) => {
    if ((xs?.length ?? 0) > MAX_ROWS) err(field, `More than ${MAX_ROWS} rows: the Department takes larger tables as a CSV attachment through its utility.`);
    return xs ?? [];
  };
  const needed = (clause: string, present: unknown) => {
    if (present === undefined || present === null) clausesNeeded.push(clause);
    return present !== undefined && present !== null;
  };

  /* Report checks */
  if (!/^SW\d{8}$/.test(i.softwareId)) err('softwareId', 'The Department issues a software ID (SW and 8 digits) to a registered e-return intermediary; it is needed for the creation information in the file.');
  date(i.createdOn, 'createdOn', 'Date of creation');
  const a = i.assessee;
  const pan = (a?.pan ?? '').trim().toUpperCase();
  if (!PAN.test(pan)) err('assessee.pan', 'PAN of the assessee is not valid.');
  if (!clean(a?.name, 75)) err('assessee.name', 'Name of the assessee is required.');
  if (!(String(a?.status) in TAX_AUDIT_STATUS)) err('assessee.status', 'Status must be one of the codes in Part A clause 5.');
  const py = i.previousYear ?? { from: PY_FROM, to: PY_TO };
  date(py.from, 'previousYear.from', 'Start of the previous year');
  date(py.to, 'previousYear.to', 'End of the previous year');
  if (py.from < PY_FROM || py.to > PY_TO || py.from > py.to) err('previousYear', `The previous year for AY ${TAX_AUDIT_AY} runs within 1 Apr 2025 to 31 Mar 2026.`);
  if (!i.clause8?.length) err('clause8', 'Clause 8: give the clause of section 44AB under which the audit is conducted.');
  if (i.clause8A?.opted && !i.clause8A.section) err('clause8A', 'Clause 8A: give the section under which the option was exercised.');
  const au = i.auditor;
  if (!au || !clean(au.lastName, 75)) err('auditor.lastName', "Auditor's name is required.");
  if (!/^\d{6}$/.test(au?.membershipNo ?? '')) err('auditor.membershipNo', 'Membership number must be 6 digits.');
  if (au?.firmRegNo && !/^[A-Za-z0-9]{1,8}$/.test(au.firmRegNo)) err('auditor.firmRegNo', 'Firm registration number has up to 8 letters and digits.');
  if (au?.signsForFirm && !au.firmRegNo) err('auditor.firmRegNo', 'Firm registration number is required when signing for a firm.');
  date(au?.signedOn, 'auditor.signedOn', 'Date of signing the tax audit report');
  if (au && !clean(au.place, 35)) err('auditor.place', 'Place of signing is required.');
  if (au?.signedOn && au.signedOn <= PY_TO) err('auditor.signedOn', 'The tax audit report is signed after the end of the previous year.');
  const w = au?.signsForFirm ? { I: 'We', My: 'Our', Me: 'Us' } : { I: 'I', My: 'My', Me: 'Me' };

  if (i.form === '3CA') {
    const f = i.form3CA;
    if (!f) err('form3CA', 'Form 3CA needs the law under which the accounts were audited and the date of that audit report.');
    else {
      if (!(f.act in TAX_AUDIT_ACTS)) err('form3CA.act', 'Choose the law under which the accounts were audited from the Department list.');
      if (f.act === '67' && !clean(f.otherAct, 250)) err('form3CA.otherAct', 'Name the other law.');
      date(f.auditReportDate, 'form3CA.auditReportDate', 'Date of the audit report under the other law');
      if (!clean(f.statutoryAuditorName, 125)) err('form3CA.statutoryAuditorName', 'Name of the auditor who conducted the statutory audit is required.');
    }
  } else if (i.form === '3CB') {
    const f = i.form3CB;
    if (!f) err('form3CB', 'Form 3CB needs the head office location, the number of branches and the result for the year.');
    else {
      if (!clean(f.headOffice, 150)) err('form3CB.headOffice', 'Location of the head office is required.');
      if (!Number.isInteger(f.branches) || f.branches < 0 || f.branches > 999) err('form3CB.branches', 'Number of branches is a whole number up to 999.');
      if (f.comments && !clean(f.comments.text, 2000)) err('form3CB.comments', 'Describe the observations, comments, discrepancies or inconsistencies.');
    }
  } else err('form', 'Form must be 3CA or 3CB.');
  for (const [k, o] of (i.observations ?? []).entries()) {
    if (!(o.code in TAX_AUDIT_OBSERVATIONS)) err(`observations.${k}`, 'Observation type must be one of the Department codes.');
    if (!clean(o.text, 1000)) err(`observations.${k}`, 'Observation text is required.');
  }

  /* Part A */
  const partAAddress = addr(a?.address, 'assessee.address');
  for (const [k, t] of (a?.indirectTax ?? []).entries()) {
    if (!(t.type in INDIRECT_TAX_TYPES)) err(`assessee.indirectTax.${k}`, 'Indirect tax type must be one of the Department codes.');
    if (t.type === 'OIT' && !clean(t.other, 125)) err(`assessee.indirectTax.${k}`, 'Name the other indirect tax.');
    if (t.type === 'GST' && t.regNo && !/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(t.regNo)) err(`assessee.indirectTax.${k}`, 'GSTIN is not valid.');
    if (!clean(t.regNo, 25)) err(`assessee.indirectTax.${k}`, 'Registration number is required.');
  }
  const assesseeName = { FirstName: a?.firstName ? txt(a.firstName, 25) : undefined, MiddleName: a?.middleName ? txt(a.middleName, 25) : undefined, LastName: txt(a?.name, 75) };
  const aadhaar = aadhaarOpt(a?.aadhaar, 'assessee.aadhaar');
  const PartA = {
    AssesseeName: assesseeName,
    AddressDetail: partAAddress,
    PAN: pan,
    AadhaarCardNo: aadhaar,
    IndirectTaxFlag: yn((a?.indirectTax ?? []).length > 0),
    Form3cdIndirectTax: (a?.indirectTax ?? []).map((t) => ({ IndirectTaxType: t.type, StateCode: t.stateCode, OtherIndirectTaxType: t.other ? txt(t.other, 125) : undefined, RegNo: txt(t.regNo, 25) })),
    Status: Number(a?.status),
    PartAStartDate: py.from,
    PartAEndDate: py.to,
    AssessmentYear: TAX_AUDIT_AY,
    Clause: (i.clause8 ?? []).map((c) => ({ ClauseNo: c })),
  };

  /* Part B */
  const out: Record<string, unknown> = {};
  const flags: Record<string, string> = {};

  // Clause 9: firm, LLP, AOP or BOI (status 3, 4, 7, 12).
  const isFirmOrAop = [3, 4, 7, 12].includes(Number(a?.status));
  if (isFirmOrAop && needed('9', b.clause9)) {
    const c = b.clause9!;
    if (!c.partners.length) err('clause9', 'Clause 9(a): list the partners or members and their profit sharing ratios.');
    for (const [k, p] of c.partners.entries()) {
      if (!clean(p.name, 100)) err(`clause9.partners.${k}`, 'Name of the partner or member is required.');
      if (!(p.share >= 0 && p.share <= 99.99)) err(`clause9.partners.${k}`, 'Profit sharing ratio is a percentage up to 99.99 (schema FirmAopPerc).');
    }
    const total = Math.round(c.partners.reduce((s, p) => s + p.share * 100, 0)) / 100;
    if (c.partners.length && Number(a?.status) !== 7 && Math.abs(total - 100) > 0.05) err('clause9', `Clause 9(a): profit sharing ratios add up to ${total}%, not 100%.`);
    out.Form3cdFirmAopDetailNew = { Form3cdFirmAopDetailPK: c.partners.map((p) => ({ ChangeType: 'CURR_PROF_SHARE', FirmAopDesc: txt(p.name, 100), FirmAopPerc: Math.round(p.share * 100) / 100 })) };
    if (Number(a?.status) === 7 || Number(a?.status) === 12) flags.SharesOfMem = c.sharesIndeterminate ?? 'N';
    flags.ChangeInPartner = yn(c.changes.length > 0);
    out.Form3cdChangeInPartners = rows(c.changes, 'clause9.changes').map((x, k) => ({
      DateOfChange: date(x.date, `clause9.changes.${k}`, 'Date of change'), NameOfPartner: txt(x.name, 125), TypeOfChange: x.type,
      OldProfShareRatio: x.oldShare, NewProfShareRatio: x.newShare, Remarks: txt(x.remarks || 'NA', 300),
    }));
  }

  // Clause 10.
  if (needed('10', b.clause10)) {
    const c = b.clause10!;
    const sectorOf = (code: string, field: string) => {
      if (!(code in TAX_AUDIT_BUSINESS_CODES)) err(field, `Business code ${code} is not in the Department list.`);
      const s = code.slice(0, 2);
      if (!(s in TAX_AUDIT_SECTORS)) err(field, `Business code ${code} has no sector in the Department list; choose a code under a sector.`);
      return s;
    };
    if (!c.codes.length) err('clause10', 'Clause 10(a): give the nature of every business or profession.');
    out.F3cdFirmAopDtlNatOfBusiness = { Form3cdFirmAopDetailPK: c.codes.map((code, k) => ({ ChangeType: 'CURR_NATURE_BUSNS', Sector: sectorOf(code, `clause10.codes.${k}`), FirmAopDesc: code })) };
    flags.ChangeNaturBuisnes = yn(c.changes.length > 0);
    if (c.changes.length) out.F3cdFirmAopDtlChangeInNature = { Form3cdFirmAopDetailPK: c.changes.map((x, k) => ({ ChangeType: 'CHNG_NATURE_BUSNS', FirmAopBuss: x.change, Sector: sectorOf(x.code, `clause10.changes.${k}`), FirmAopDesc: x.code })) };
  }

  // Clause 11.
  if (needed('11', b.clause11)) {
    const c = b.clause11!;
    flags.BookOfAcnt = yn(c.prescribed.length > 0);
    if (!c.maintained.length) err('clause11', 'Clause 11(b): list the books of account maintained and where they are kept.');
    if (!c.examined.length) err('clause11', 'Clause 11(c): list the books of account and documents examined.');
    out.Form3cdBooksOfAccLst = [
      ...c.prescribed.map((x) => ({ Form3cdBooksOfAccLstPK: { BooksOfAccType: 'SEC44AA', BooksDetail: txt(x, 100) } })),
      ...c.examined.map((x) => ({ Form3cdBooksOfAccLstPK: { BooksOfAccType: 'LBEX', BooksDetail: txt(x, 100) } })),
    ];
    out.Form3cdBooksOfAccLstAddress = c.maintained.map((x, k) => {
      const ad = addr(x.address, `clause11.maintained.${k}`);
      return { Form3cdBooksOfAccLstPK: { BooksOfAccType: 'BOAM', BooksDetail: txt(x.books, 100), AddressDetail: ad && { AddrDetail1: ad.AddrDetail1, AddrDetail2: ad.AddrDetail2, CityOrTownOrDistrict: ad.CityOrTownOrDistrict, StateCode: ad.StateCode, CountryCode: ad.CountryCode, PinCode: ad.PinCode } } };
    });
  }

  // Clause 12.
  if (needed('12', b.clause12)) {
    const c = b.clause12!;
    flags.PrftLoassAcnt = yn(c.rows.length > 0);
    out.Form3cdProfGainsPresum = c.rows.map((x, k) => {
      if (!(CLAUSE12_SECTIONS as readonly string[]).includes(x.section)) err(`clause12.rows.${k}`, 'Section must be one the schema lists for clause 12.');
      if (x.section === 'OTHER' && !clean(x.otherSection, 100)) err(`clause12.rows.${k}`, 'Name the other section.');
      return { SectionNo: x.section, OtherSection: x.otherSection ? txt(x.otherSection, 100) : undefined, Amount: amt(x.amount, `clause12.rows.${k}`, 'Amount', { signed: true }) };
    });
  }

  // Clauses 13 and 14 share Form3cdChngMethAccVal (one row per item: schema maxItems 1).
  const methAccVal: unknown[] = [];
  const effect = (x: ProfitEffect, type: string, field: string) => {
    if (!clean(x.particulars, 100)) err(field, 'Particulars are required.');
    methAccVal.push({ Form3cdChngMethAccValPK: [{ Particulars: txt(x.particulars, 100), AccType: type, IncreaseProfits: amt(x.increase, field, 'Increase in profit'), DecreaseProfits: amt(x.decrease, field, 'Decrease in profit') }] });
  };
  if (needed('13', b.clause13)) {
    const c = b.clause13!;
    if (c.method !== '01' && c.method !== '02') err('clause13.method', 'Clause 13(a): method of accounting is cash (01) or mercantile (02).');
    out.Form3cdChngMethAccDtl = { Detail: c.method };
    flags.ChngMethodOfAcc = yn(c.changes.length > 0);
    c.changes.forEach((x, k) => effect(x, 'CHANGE_ACC', `clause13.changes.${k}`));
    flags.Sec145 = yn(c.icdsAdjustments.length > 0);
    if (c.icdsAdjustments.length) {
      const pk = c.icdsAdjustments.map((x, k) => {
        if (!(ICDS_CODES as readonly string[]).includes(x.icds)) err(`clause13.icdsAdjustments.${k}`, 'ICDS must be one of ICDS I to X.');
        const inc = amt(x.increase, `clause13.icdsAdjustments.${k}`, 'Increase in profit');
        const dec = amt(x.decrease, `clause13.icdsAdjustments.${k}`, 'Decrease in profit');
        return { AccType: 'DEVIATION_VAL', Icds: x.icds, IncreaseProfits: inc, DecreaseProfits: dec, NetEffect: inc - dec };
      });
      const ti = pk.reduce((s, x) => s + x.IncreaseProfits, 0);
      const td = pk.reduce((s, x) => s + x.DecreaseProfits, 0);
      out.Form3cdChngMethAccValChange = { Form3cdChngMethAccValChangePK: pk, Form3cdChngMethAccValTotal: [{ TotalIncProfit: ti, TotalDecProfits: td, TotalNetProfit: ti - td }] };
    }
    if (c.disclosures.length) out.Form3cdDisclVal = [{ Form3cdDisclValPK: c.disclosures.map((x) => ({ AccType: 'DEVIATION_VALUE', Icds: x.icds, Disclosure: txt(x.text, 2000) })) }];
  }
  if (needed('14', b.clause14)) {
    const c = b.clause14!;
    if (!['1', '2', '3'].includes(c.method)) err('clause14.method', 'Clause 14(a): method of valuation is at cost (1), at market rate (2) or lower of cost or market rate (3).');
    out.MethodValCS = { ChangeType: c.method };
    flags.Sec145A = yn(c.deviations145A.length > 0);
    c.deviations145A.forEach((x, k) => effect(x, 'DEVIATION_SEC145A', `clause14.deviations145A.${k}`));
  }
  if (methAccVal.length) out.Form3cdChngMethAccVal = methAccVal;

  // Clause 16.
  if (needed('16', b.clause16)) {
    const c = b.clause16!;
    const notCredit = (xs: Described[], type: string, field: string) => xs.map((x, k) => {
      if (!clean(x.description, 100)) err(`${field}.${k}`, 'Description is required.');
      return { Form3cdAmtNotCreditPk: { TableType: type, TypeOfAmt: amt(x.amount, `${field}.${k}`, 'Amount', { signed: true }), Description: txt(x.description, 100) } };
    });
    out.Form3cdAmtNotCredit = [
      ...notCredit(c.section28, 'ITEMS_SEC28', 'clause16.section28'), ...notCredit(c.escalation, 'ESCL_CLMS_PY', 'clause16.escalation'),
      ...notCredit(c.otherIncome, 'ANY_OTH_INCM', 'clause16.otherIncome'), ...notCredit(c.capitalReceipts, 'CAP_RECEIPT', 'clause16.capitalReceipts'),
    ];
    out.Form3cdDrawbackRefundetc = c.credits.map((x, k) => {
      if (!(x.code in CLAUSE16B_DESCRIPTIONS)) err(`clause16.credits.${k}`, 'Clause 16(b) description must be one of the Department codes.');
      if (x.code === '09' && !clean(x.other, 50)) err(`clause16.credits.${k}`, 'Describe the other credit or refund.');
      return { Description: x.code, DescriptionOthers: x.code === '09' ? txt(x.other, 50) : undefined, Amount: amt(x.amount, `clause16.credits.${k}`, 'Amount', { signed: true }) };
    });
  }

  // Clause 17.
  if (needed('17', b.clause17)) {
    out.Form3cdLandBuildProperty = rows(b.clause17!.properties, 'clause17').map((x, k) => {
      const f = `clause17.properties.${k}`;
      const ad = addr(x.address, f);
      if (x.consideration >= x.valuation) err(f, 'Clause 17 reports a transfer for less than the value adopted or assessed by the stamp valuation authority (sections 43CA and 50C).');
      return { Details: txt(x.details, 100), AddressDetail: ad && { AddrDetail1: ad.AddrDetail1, AddrDetail2: ad.AddrDetail2, CityOrTownOrDistrict: ad.CityOrTownOrDistrict, StateCode: ad.StateCode, CountryCode: ad.CountryCode, PinCode: ad.PinCode }, ConsiderAmt: amt(x.consideration, f, 'Consideration'), Valueadoptedassessed: yn(x.provisoApplies), AssessedAmt: amt(x.valuation, f, 'Value adopted or assessed') };
    });
  }

  // Clause 18. Totals as the utility forms them; depreciation by section 32(1)(ii) and its second proviso
  // (half the rate for an asset put to use for less than 180 days in the year) unless the auditor gives the figure.
  let depreciationTotal = 0;
  if (needed('18', b.clause18)) {
    out.Form3cdDeprAllw = b.clause18!.blocks.map((x, k) => {
      const f = `clause18.blocks.${k}`;
      const label = TAX_AUDIT_BLOCKS[x.block];
      if (!label) err(f, `Block of assets ${x.block} is not in the Department list.`);
      const listed = label?.match(/@\s*([\d.]+)%/);
      if (listed && Math.abs(Number(listed[1]) - x.rate) > 1e-9) err(f, `${label}: the rate is ${listed[1]}%, not ${x.rate}%.`);
      const adds = rows(x.additions, `${f}.additions`).map((y, j) => {
        const v = amt(y.value, `${f}.additions.${j}`, 'Purchase value');
        const cv = amt(y.cenvat, `${f}.additions.${j}`, 'CENVAT', { signed: true });
        const ex = amt(y.exchangeRate, `${f}.additions.${j}`, 'Change in rate of exchange', { signed: true });
        const sb = amt(y.subsidy, `${f}.additions.${j}`, 'Subsidy or grant', { signed: true });
        date(y.purchaseDate, `${f}.additions.${j}`, 'Date of purchase');
        date(y.putToUseDate, `${f}.additions.${j}`, 'Date put to use');
        if (y.putToUseDate && (y.putToUseDate < py.from || y.putToUseDate > py.to)) err(`${f}.additions.${j}`, 'An addition is put to use within the previous year.');
        // Utility: Total Value of Purchases (B) = (1) + (2) + (3) + (4).
        return { row: { PurchaseOrSaleDate: y.purchaseDate, DatePutToUse: y.putToUseDate, PurchaseOrSaleValue: v, Modvat: cv, ExchangeRateChange: ex, subsidyGrant: sb, TotalPurchaseValue: v + cv + ex + sb }, less: y.lessThan180Days };
      });
      const deds = rows(x.deductions, `${f}.deductions`).map((y, j) => {
        date(y.saleDate, `${f}.deductions.${j}`, 'Date of sale');
        return { PurchaseOrSaleDate: y.saleDate, PurchaseOrSaleValue: amt(y.amount, `${f}.deductions.${j}`, 'Amount'), Deletioncheckbox: String(y.outOfLessThan180DayAdditions) };
      });
      const sumOf = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
      const opening = amt(x.openingWdv, f, 'Opening WDV');
      const goodwill = amt(x.goodwillAdjustment, f, 'Goodwill adjustment', { signed: true });
      const A = opening + goodwill;
      const putLess = sumOf(adds.filter((y) => y.less).map((y) => y.row.TotalPurchaseValue));
      const putMore = sumOf(adds.filter((y) => !y.less).map((y) => y.row.TotalPurchaseValue));
      const delLess = sumOf(deds.filter((y) => y.Deletioncheckbox === 'true').map((y) => y.PurchaseOrSaleValue));
      const delMore = sumOf(deds.filter((y) => y.Deletioncheckbox !== 'true').map((y) => y.PurchaseOrSaleValue));
      const B = putLess + putMore;
      const C = delLess + delMore;
      const other = amt(x.otherAdjustments, f, 'Other adjustments', { signed: true });
      const method = x.method ?? 'WDV';
      let D: number;
      if (x.depreciationAllowable !== undefined) D = amt(x.depreciationAllowable, f, 'Depreciation allowable');
      else if (method === 'SLM') { err(f, 'Give the depreciation allowable for a block on the straight line method.'); D = 0; }
      else if (A - delMore < 0 || putLess - delLess < 0) { err(f, 'Sales exceed the opening value or the additions they came from; give the depreciation allowable.'); D = 0; }
      else D = Math.max(0, Math.round(((A - delMore + putMore) * x.rate) / 100 + ((putLess - delLess) * x.rate) / 200 + other));
      depreciationTotal += D;
      const sumAdd = (k2: 'PurchaseOrSaleValue' | 'Modvat' | 'ExchangeRateChange' | 'subsidyGrant') => sumOf(adds.map((y) => y.row[k2]));
      return {
        methodOfDepreciation: method,
        DescBlockAssets: x.block,
        RateOfDep: x.rate,
        OpeningWDV: opening,
        Intangibledjustmentwrittendown: x.goodwillAdjustment !== undefined ? goodwill : undefined,
        adjustmentwrittendown: Math.max(0, A),
        Additions: adds.map((y) => y.row),
        TotalPurchase: sumAdd('PurchaseOrSaleValue'),
        TotalModvat: sumAdd('Modvat'),
        TotalChangeExchangeRate: sumAdd('ExchangeRateChange'),
        TotalSubsidyGrant: sumAdd('subsidyGrant'),
        TotalPurchaseValue: B,
        Puttouseforlessthan180days: putLess,
        Puttousefor180daysormore: putMore,
        Deductions: deds,
        TotalDeduction: C,
        Lessthan180: delLess,
        morethan180: delMore,
        OtherAdjustmentsifAny: x.otherAdjustments !== undefined ? other : undefined,
        DepAllowable: D,
        // Form 3CD clause 18: written down value at the end of the year = A + B - C - D.
        WrittenDownVal: method === 'WDV' ? Math.max(0, A + B - C - D) : undefined,
      };
    });
  }

  // Clause 19.
  if (needed('19', b.clause19)) {
    out.Form3cdDebitPlTotAllw = b.clause19!.rows.map((x, k) => {
      if (!(CLAUSE19_SECTIONS as readonly string[]).includes(x.section)) err(`clause19.rows.${k}`, 'Section must be one the schema lists for clause 19.');
      if (x.section === 'any other relevant section' && !clean(x.other, 250)) err(`clause19.rows.${k}`, 'Name the other section.');
      return { Section: x.section, Others: x.other ? txt(x.other, 250) : undefined, Total: amt(x.debited, `clause19.rows.${k}`, 'Amount debited'), Allowable: amt(x.admissible, `clause19.rows.${k}`, 'Amount admissible') };
    });
  }

  // Clause 20.
  if (needed('20', b.clause20)) {
    const c = b.clause20!;
    out.Form3cdEmpBonusComm = c.bonus.map((x, k) => ({ DetailsUs36: txt(x.description, 100), Amount: amt(x.amount, `clause20.bonus.${k}`, 'Amount') }));
    out.Form3cdEmpPfSuperann = rows(c.employeeContributions, 'clause20.employeeContributions').map((x, k) => {
      const f = `clause20.employeeContributions.${k}`;
      if (!(x.fund in CLAUSE20B_FUNDS)) err(f, 'Nature of fund must be one of the Department codes.');
      return { NatureOfFund: x.fund, Amount: amt(x.received, f, 'Sum received'), DueDate: date(x.dueDate, f, 'Due date'), ActualAmount: amt(x.paid, f, 'Amount paid'), ActualDate: date(x.paidOn, f, 'Date of payment', false) };
    });
  }

  // Clause 21.
  if (needed('21', b.clause21)) {
    const c = b.clause21!;
    out.Form3cdDebPLExpnditure = c.debited.map((x, k) => ({ ParticularType: x.type, Particulars: txt(x.particulars, 125), Amount: amt(x.amount, `clause21.debited.${k}`, 'Amount') }));
    const payees = (xs: Payee40a[], type: string, field: string, opts: { tax?: boolean; deposited?: boolean; noNature?: boolean } = {}) => rows(xs, field).map((x, k) => {
      const f = `${field}.${k}`;
      const ad = addr(x.address, f);
      if (!clean(x.name, 125)) err(f, 'Name of the payee is required.');
      return {
        ParticularType: type, DateOfPayment: date(x.date, f, 'Date of payment'), AmtOfPayment: amt(x.amount, f, 'Amount of payment'),
        NatureOfPayment: opts.noNature ? undefined : txt(x.nature || 'NA', 100), NameOfPayee: txt(x.name, 125), PANOfPayee: panOpt(x.pan, f), AadhaarCardNo: aadhaarOpt(x.aadhaar, f),
        AddressDetails: ad, AmtTaxDeducted: opts.tax ? amt(x.taxDeducted, f, 'Tax deducted') : undefined, AmtTaxDeposited: opts.deposited ? amt(x.taxDeposited, f, 'Tax deposited') : undefined,
      };
    });
    // Schema change document V1.2, items 3 to 9: the arrays hold clause 21(b)(i)(A), (i)(B), (ii)(A), (ii)(B), (iii)(A), (iii)(B) and (vii); particular types as in the utility.
    const s = c.s40a;
    out.Form3cdAmtInadm40A = payees(s.nonResidentNotDeducted, 'SUBCLAUSEi', 'clause21.s40a.nonResidentNotDeducted');
    out.Form3cdAmtInadm40A1 = payees(s.nonResidentNotPaid, 'SEC200(1)', 'clause21.s40a.nonResidentNotPaid', { tax: true });
    out.Form3cdAmtInadm40A2 = payees(s.residentNotDeducted, 'SUBCLAUSEia', 'clause21.s40a.residentNotDeducted');
    out.Form3cdAmtInadm40A3 = payees(s.residentNotPaid, 'SEC139', 'clause21.s40a.residentNotPaid', { tax: true, deposited: true });
    out.Form3cdAmtInadm40A4 = payees(s.levyNotDeducted, 'SUBCLAUSEib', 'clause21.s40a.levyNotDeducted');
    out.Form3cdAmtInadm40A5 = payees(s.levyNotPaid, 'SEC139B', 'clause21.s40a.levyNotPaid', { tax: true, deposited: true });
    out.Form3cdAmtInadm40A6 = payees(s.salaryOutsideIndia, 'SUBCLAUSEiii', 'clause21.s40a.salaryOutsideIndia', { noNature: true });
    const one = (v: number | undefined, f: string) => (v ? [amt(v, f, 'Amount')] : undefined);
    out.Form3cdAmtInadm40ASubClauseiC = one(s.fringeBenefitTax, 'clause21.s40a.fringeBenefitTax');
    out.Form3cdAmtInadm40ASubClauseiia = one(s.wealthTax, 'clause21.s40a.wealthTax');
    out.Form3cdAmtInadm40ASubClauseiib = one(s.royaltyIib, 'clause21.s40a.royaltyIib');
    out.Form3cdAmtInadm40ASubClauseiv = one(s.providentFundIv, 'clause21.s40a.providentFundIv');
    out.Form3cdAmtInadm40ASubClausev = one(s.perquisiteTaxV, 'clause21.s40a.perquisiteTaxV');
    out.Form3cdAmtInadm40AAmtDebit = c.s40b.map((x, k) => {
      const f = `clause21.s40b.${k}`;
      const d = amt(x.debited, f, 'Amount debited');
      const ad = amt(x.admissible, f, 'Amount admissible');
      const ia = amt(x.inadmissible, f, 'Amount inadmissible');
      if (ad + ia !== d) err(f, 'Clause 21(c): admissible and inadmissible amounts should add up to the amount debited.');
      return { Particulars: x.particulars, Section: x.section, AmountDebitPl: d, AmountAdmisible: ad, AmountInAdmisible: ia, Remarks: txt(x.remarks || 'NA', 100) };
    });
    const pay40A3 = (x: Payment40A3, f: string) => ({ DateOfPayment: date(x.date, f, 'Date of payment'), NatureOfPayment: txt(x.nature, 100), AmtOfPayment: amt(x.amount, f, 'Amount'), NameOfPayee: txt(x.name, 125), PANOfPayee: panOpt(x.pan, f), AadhaarCardNo: aadhaarOpt(x.aadhaar, f) });
    flags.Sec40A3 = yn(c.s40A3.length === 0);
    flags.Sec40A3A = yn(c.s40A3A.length === 0);
    out.ExpendSec40A_3 = rows(c.s40A3, 'clause21.s40A3').map((x, k) => pay40A3(x, `clause21.s40A3.${k}`));
    out.Form3cdIncomeUnderSec40A_3 = rows(c.s40A3A, 'clause21.s40A3A').map((x, k) => ({ PaymntSec40A_3A: pay40A3(x, `clause21.s40A3A.${k}`) }));
    const expOth = (type: string, amount: number, details?: string) => ({ Form3cdExpOthPK: { ExpenditureType: type, Amount: amount, Details: details ? txt(details, 150) : undefined } });
    out.Form3cdExpOth = [
      ...(c.gratuity40A7 ? [expOth('GRATSEC40A7', amt(c.gratuity40A7, 'clause21.gratuity40A7', 'Amount'))] : []),
      ...(c.employer40A9 ? [expOth('SUMSEC409', amt(c.employer40A9, 'clause21.employer40A9', 'Amount'))] : []),
      ...c.contingent.map((x, k) => expOth('CONTGNTNAT', amt(x.amount, `clause21.contingent.${k}`, 'Amount'), x.description)),
      ...c.section14A.map((x, k) => expOth('DEDUCSEC14A', amt(x.amount, `clause21.section14A.${k}`, 'Amount'), x.description)),
      ...(c.interest36_1_iii ? [expOth('AMTINADMSEC36I', amt(c.interest36_1_iii, 'clause21.interest36_1_iii', 'Amount'))] : []),
    ];
  }

  // Clause 22 (utility: one row, particular type SEC23, particulars NA; Amount2 required, schema change document V2.1).
  if (needed('22', b.clause22)) {
    const c = b.clause22!;
    const a2 = amt(c.payableToMicroSmall, 'clause22', 'Amount payable to micro or small enterprises');
    const a3 = amt(c.paidInTime, 'clause22', 'Amount paid in time');
    const a4 = amt(c.notPaidInTime, 'clause22', 'Amount not paid in time');
    if (a3 + a4 > a2) err('clause22', 'Clause 22(iii): amounts paid and not paid in time are out of the amount in 22(ii).');
    out.Form3cdInadm = [{ ParticularType: 'SEC23', Particulars: 'NA', Amount1: amt(c.interestInadmissible, 'clause22', 'Interest inadmissible'), Amount2: a2, Amount3: a3, Amount4: a4 }];
  }

  // Clause 26: arrays for 26(i)(A)(a), (i)(A)(b), (i)(B)(a), (i)(B)(b) (schema change document V1.2, items 10 to 13).
  if (needed('26', b.clause26)) {
    const c = b.clause26!;
    const l43 = (xs: Liability43B[], type: string, field: string) => rows(xs, field).map((x, k) => {
      if (!(x.section in CLAUSE26_SECTIONS)) err(`${field}.${k}`, 'Section must be one of those in section 43B the schema lists.');
      if (type === 'PBDD' || type === 'NPBDD') if (x.section === '43Bh') err(`${field}.${k}`, 'Clause 26(i)(B) is for clauses of section 43B other than clause (h).');
      return { LiabilityType: type, Section: x.section, Description: txt(x.nature, 100), Amount: amt(x.amount, `${field}.${k}`, 'Amount') };
    });
    out.Form3cdUnpaidStrySec43b = l43(c.preExistingPaid, 'PDPY', 'clause26.preExistingPaid');
    out.Form3cdUnpaidStrySec43b1 = l43(c.preExistingUnpaid, 'NPDPY', 'clause26.preExistingUnpaid');
    out.Form3cdUnpaidStrySec43b2 = l43(c.currentPaid, 'PBDD', 'clause26.currentPaid');
    out.Form3cdUnpaidStrySec43b3 = l43(c.currentUnpaid, 'NPBDD', 'clause26.currentUnpaid');
    flags.SalesTax = yn(c.indirectTaxThroughPl);
    out.Form3cdTaxPassedThrPl = c.note ? txt(c.note, 100) : undefined;
  }

  // Clause 31.
  if (needed('31', b.clause31)) {
    const c = b.clause31!;
    const party = (x: TaxAuditParty, f: string) => {
      if (!clean(x.name, 125)) err(f, 'Name is required.');
      if (!clean(x.address, 150)) err(f, 'Address is required.');
      return { name: txt(x.name, 125), address: txt(x.address, 150), pan: panOpt(x.pan, f), aadhaar: aadhaarOpt(x.aadhaar, f) };
    };
    const mode = (m: string, f: string) => {
      if (!(m in CLAUSE31_MODES)) err(f, 'Mode must be one of the Department codes.');
      return { flag: yn(BANK_MODES.has(m)), code: m };
    };
    out.Form3cdAmtSec269ssDetail = rows(c.loans269SS, 'clause31.loans269SS').map((x, k) => {
      const f = `clause31.loans269SS.${k}`; const p = party(x, f); const m = mode(x.mode, f);
      return { PanNoLender: p.pan, AadhaarCardNo: p.aadhaar, LenderName: p.name, LenderAddress: p.address, AmtLoanDeposit: amt(x.amount, f, 'Amount'), LoanDepSqrdPyFlag: x.squaredUp, MaxAmtOsAccPy: amt(x.maxOutstanding, f, 'Maximum outstanding'), LoanDepChqDrftFlag: m.flag, NatureAmtCdeType: m.code, PleaseSpfy: x.specify ? txt(x.specify, 100) : undefined, LoanDepChqDrftType: x.chequeType };
    });
    out.Form3cdSec269SSDtls = rows(c.specifiedSums269SS, 'clause31.specifiedSums269SS').map((x, k) => {
      const f = `clause31.specifiedSums269SS.${k}`; const p = party(x, f); const m = mode(x.mode, f);
      return { ReceiverPanNo: p.pan, AadhaarCardNo: p.aadhaar, ReceiverName: p.name, ReceiverAddress: p.address, AmtAccepted: amt(x.amount, f, 'Amount'), OsAccPy: m.flag, NatureAmtCdeBType: m.code, PleaseSpfyB: x.specify ? txt(x.specify, 100) : undefined, LoanDepChqDrftType: x.chequeType };
    });
    out.Form3cdSec269ST31ba = rows(c.receipts269STCash, 'clause31.receipts269STCash').map((x, k) => {
      const f = `clause31.receipts269STCash.${k}`; const p = party(x, f);
      return { NameOfPayer: p.name, AddressOfPayer: p.address, PANOfPayer: p.pan, AadhaarCardNo: p.aadhaar, NatureOfTransaction: txt(x.nature, 100), ReceiptAmount: amt(x.amount, f, 'Amount'), ReceiptDate: date(x.date, f, 'Date of receipt') };
    });
    out.Form3cdSec269ST31bb = rows(c.receipts269STCheque, 'clause31.receipts269STCheque').map((x, k) => {
      const f = `clause31.receipts269STCheque.${k}`; const p = party(x, f);
      return { NameOfPayer: p.name, AddressOfPayer: p.address, PANOfPayer: p.pan, AadhaarCardNo: p.aadhaar, ReceiptAmount: amt(x.amount, f, 'Amount') };
    });
    out.Form3cdSec269ST31bc = rows(c.payments269STCash, 'clause31.payments269STCash').map((x, k) => {
      const f = `clause31.payments269STCash.${k}`; const p = party(x, f);
      return { NameOfPayee: p.name, AddressOfPayee: p.address, PANOfPayee: p.pan, AadhaarCardNo: p.aadhaar, NatureOfTransaction: txt(x.nature, 100), PaymentAmount: amt(x.amount, f, 'Amount'), PaymentDate: date(x.date, f, 'Date of payment') };
    });
    out.Form3cdSec269ST31bd = rows(c.payments269STCheque, 'clause31.payments269STCheque').map((x, k) => {
      const f = `clause31.payments269STCheque.${k}`; const p = party(x, f);
      return { NameOfPayee: p.name, AddressOfPayee: p.address, PANOfPayee: p.pan, AadhaarCardNo: p.aadhaar, PaymentAmount: amt(x.amount, f, 'Amount') };
    });
    out.Form3cdAmtSec269tDetail = rows(c.repayments269T, 'clause31.repayments269T').map((x, k) => {
      const f = `clause31.repayments269T.${k}`; const p = party(x, f); const m = mode(x.mode, f);
      return { PayeePanNo: p.pan, PayeeName: p.name, AadhaarCardNo: p.aadhaar, PayeeAddress: p.address, AmtRepayment: amt(x.amount, f, 'Amount'), MaxAmtOsAccPy: amt(x.maxOutstanding, f, 'Maximum outstanding'), RepaymentChqDraftFlag: m.flag, NatureAmtCdeCType: m.code, RepaymentChqDraftType: x.chequeType, PleaseSpfyC: x.specify ? txt(x.specify, 125) : undefined };
    });
    const dep = (xs: (TaxAuditParty & { amount: number })[], field: string) => rows(xs, field).map((x, k) => {
      const f = `${field}.${k}`; const p = party(x, f);
      return { DepositorPanNo: p.pan, AadhaarCardNo: p.aadhaar, DepositorName: p.name, DepositorAddress: p.address, AmtDeposit: amt(x.amount, f, 'Amount') };
    });
    out.Form3cdSec269TDtls = dep(c.repaymentsReceivedCash, 'clause31.repaymentsReceivedCash');
    out.Form3cdSec269TNewDtls = dep(c.repaymentsReceivedCheque, 'clause31.repaymentsReceivedCheque');
  }

  // Clause 34.
  if (needed('34', b.clause34)) {
    const c = b.clause34!;
    const tan = (v: string, f: string) => { const t = (v ?? '').trim().toUpperCase(); if (!TAN_RE.test(t)) err(f, 'TAN is not valid.'); return t; };
    flags.ChapXVIIFlag = yn(c.required);
    if (c.required && !c.rows.length) err('clause34.rows', 'Clause 34(a): give the section-wise details of tax deducted or collected.');
    if (!c.required && c.rows.length) err('clause34.rows', 'Clause 34(a) rows are given, but the assessee is marked as not required to deduct or collect tax.');
    out.Form3cdChapXVII = rows(c.rows, 'clause34.rows').map((x, k) => {
      const f = `clause34.rows.${k}`;
      if (!(CLAUSE34_SECTIONS as readonly string[]).includes(x.section)) err(f, `Section ${x.section} is not one the schema lists for clause 34(a).`);
      const r = {
        TAN: tan(x.tan, f), Sec: x.section, NatureOfPaymnt: txt(x.nature, 125), AmtOfNatureSpec: amt(x.totalAmount, f, 'Column 4'), TotTaxDedCollectd: amt(x.requiredAmount, f, 'Column 5'),
        TotTaxSpecRate: amt(x.specifiedRateAmount, f, 'Column 6'), AmtTaxSpecRate: amt(x.specifiedRateTax, f, 'Column 7'), TotLessThanSpecRate: amt(x.lowerRateAmount, f, 'Column 8'),
        AmtTaxDedOrCollect: amt(x.lowerRateTax, f, 'Column 9'), AmtNotDepToGovt: amt(x.notDeposited, f, 'Column 10'),
      };
      // Column headings of clause 34(a): (5) out of (4), (6) out of (5), (10) out of the tax in (7) and (9).
      if (r.TotTaxDedCollectd > r.AmtOfNatureSpec) err(f, 'Column 5 is out of column 4 and cannot exceed it.');
      if (r.TotTaxSpecRate > r.TotTaxDedCollectd) err(f, 'Column 6 is out of column 5 and cannot exceed it.');
      if (r.AmtNotDepToGovt > r.AmtTaxSpecRate + r.AmtTaxDedOrCollect) err(f, 'Column 10 cannot exceed the tax in columns 7 and 9.');
      return r;
    });
    flags.TaxPrescTime = yn(c.statementsRequired);
    out.Form3cdTaxDedCollect = rows(c.statements, 'clause34.statements').map((x, k) => {
      const f = `clause34.statements.${k}`;
      if (!(CLAUSE34_FORMS as readonly string[]).includes(x.form)) err(f, `Form ${x.form} is not one the schema lists for clause 34(b).`);
      if (!x.allReported && !clean(x.notReported, 100)) err(f, 'List the details or transactions not reported.');
      return { TAN: tan(x.tan, f), TypeOfForm: x.form, DueDateOfFurnish: date(x.dueDate, f, 'Due date'), DateOfFurnish: date(x.filedOn, f, 'Date of furnishing', false), TransactionsFlag: yn(x.allReported), ListDetailsTransactions: x.allReported ? undefined : txt(x.notReported, 100) };
    });
    flags.Sec201_1A_206_C7 = c.interest;
    if (c.interest === 'Y' && !c.interestRows.length) err('clause34.interestRows', 'Clause 34(c): give the interest payable and paid for each TAN.');
    out.Form3cdSec2011A206C7 = c.interest === 'Y' ? rows(c.interestRows, 'clause34.interestRows').map((x, k) => {
      const f = `clause34.interestRows.${k}`;
      const payable = amt(x.interestPayable, f, 'Interest payable');
      const paid = amt(x.interestPaid, f, 'Interest paid');
      if (paid > payable) err(f, 'Clause 34(c): the amount paid is out of the interest payable.');
      return { TAN: tan(x.tan, f), AmtOfIntrest: payable, AmtPaid: paid, DueDate: date(x.paidOn, f, 'Date of payment', paid > 0) };
    }) : undefined;
  }

  // Clauses 37 to 39.
  const audit = (key: 'clause37' | 'clause38' | 'clause39', clause: string) => {
    const v = b[key];
    if (!needed(clause, v)) return undefined;
    if (!['Y', 'N', 'X'].includes(v!.status)) err(key, `Clause ${clause}: answer Yes, No or Not applicable.`);
    if (v!.status === 'Y' && !clean(v!.details, 500)) err(key, `Clause ${clause}: give the details of any disqualification or disagreement, or say there is none.`);
    return v;
  };
  const c37 = audit('clause37', '37'); if (c37) out.CostAudit = { CostAuditFlag: c37.status, CostAuditDetail: c37.details ? txt(c37.details, 500) : undefined };
  const c38 = audit('clause38', '38'); if (c38) out.AuditExcise = { AuditExciseFlag: c38.status, AuditExciseDetail: c38.details ? txt(c38.details, 500) : undefined };
  const c39 = audit('clause39', '39'); if (c39) out.AuditSec72 = { AuditSec72Flag: c39.status, AuditSec72Detail: c39.details ? txt(c39.details, 500) : undefined };

  // Clause 40: ratios as percentages to two decimals, worked as the utility does (numerator / denominator x 100).
  if (needed('40', b.clause40)) {
    const ratioYear = (r: RatioYear, f: string) => {
      const t = amt(r.turnover, f, 'Turnover');
      const pct = (num: number | undefined, den: number) => (num === undefined || !den ? undefined : Number(((num / den) * 100).toFixed(2)));
      const gp = r.grossProfit !== undefined ? amt(r.grossProfit, f, 'Gross profit', { signed: true }) : undefined;
      const np = r.netProfit !== undefined ? amt(r.netProfit, f, 'Net profit', { signed: true }) : undefined;
      const st = r.stockInTrade !== undefined ? amt(r.stockInTrade, f, 'Stock-in-trade') : undefined;
      const mc = r.materialConsumed !== undefined ? amt(r.materialConsumed, f, 'Material consumed') : undefined;
      const fg = r.finishedGoodsProduced !== undefined ? amt(r.finishedGoodsProduced, f, 'Finished goods produced') : undefined;
      return {
        TotalTurnover: t,
        GrosProfNumertr: gp, GrosProfDmntr: gp !== undefined ? t : undefined, GrossprofitTurnover: pct(gp, t),
        NetProfNumertr: np, NetProfDmntr: np !== undefined ? t : undefined, NetprofitTurnover1: pct(np, t),
        StockTradeNmrtr: st, StockTradeDmntr: st !== undefined ? t : undefined, StockInTrade: pct(st, t),
        MaterialNumrtr: mc, MaterialDmntr: mc !== undefined ? fg : undefined, MaterialconsumedFinishedgoods: mc !== undefined && fg ? pct(mc, fg) : undefined,
      };
    };
    out.Form3cdAccountingRatioCalculations = { PrevYrProfTurnOvr: ratioYear(b.clause40!.previous, 'clause40.previous'), PrecPrevYrProfTurnOvr: ratioYear(b.clause40!.preceding, 'clause40.preceding') };
  }

  // Clause 44: registered = exempt + composition + other registered; total = registered + unregistered (columns of the clause).
  if (needed('44', b.clause44)) {
    const c = b.clause44!;
    const ex = amt(c.exempt, 'clause44', 'Exempt goods or services');
    const co = amt(c.composition, 'clause44', 'Composition dealers');
    const ot = amt(c.otherRegistered, 'clause44', 'Other registered entities');
    const un = amt(c.unregistered, 'clause44', 'Entities not registered');
    const tot = amt(c.total, 'clause44', 'Total expenditure');
    if (ex + co + ot + un !== tot) err('clause44', `Clause 44: the parts add up to Rs ${ex + co + ot + un}, not the total of Rs ${tot}.`);
    out.Form3cdBreakUpGST = [{ TotAmtExp: tot, GoodOrSerGST: ex, CompSchme: co, OthRegEntities: ot, RegEntities: ex + co + ot, ExpNonRegGST: un }];
  }

  // Clauses not built: answered as not applicable only when the input says so.
  for (const c of UNBUILT_CLAUSES) if (!na.has(c)) clausesNeeded.push(c);
  // Required flags (schema Form3cdFlags.required and the utility's required fields), answered for clauses declared not applicable.
  if (na.has('27')) flags.VATPY = 'N';
  if (na.has('29A')) flags.IncomeCluaseixofsubsection2 = 'N';
  if (na.has('29B')) flags.IncomeCluasexofsubsection2 = 'N';
  if (na.has('30')) flags.Section69D = 'N';
  if (na.has('30A')) flags.SubClauseeofClause22 = 'N';
  if (na.has('30B')) flags.TransferPriceSection92CE = 'N';
  if (na.has('30C')) flags.IncurredExpenditure = 'N';
  if (na.has('32')) {
    flags.ChngShareSec79 = 'X';
    out.Form3cdSpecloss73 = { Form3cdSpec73Flag: 'N' };
    out.Form3cdSpec73A = { Form3cdSpec73AFlag: 'N' };
    out.Form3cdSpecdeemdBus73 = { Form3cdSpecdeemdBusFlag: 'X' };
  }
  if (na.has('33')) flags.SectionDed = 'N';
  if (na.has('36A')) flags.ImpermissibleSec96 = 'N'; // the utility stores clause 36A (dividend under section 2(22)(e)) in this flag
  if (na.has('36B')) flags.Section36BFlag = 'N';
  if (na.has('42')) flags.FurnishStatement = 'N';
  if (na.has('43')) flags.SubSec2Sec286 = 'N';

  if (clausesNeeded.length) err('clauses', `Clauses still needed: ${[...new Set(clausesNeeded)].join(', ')}. Fill them, or mark them not applicable where the form allows.`);

  const fullName = (x: { firstName?: string; middleName?: string; lastName: string }) => ({ FirstName: x.firstName ? txt(x.firstName, 25) : undefined, MiddleName: x.middleName ? txt(x.middleName, 25) : undefined, LastName: txt(x.lastName, 75) });
  const auAddr = au ? addr(au.address, 'auditor.address') : undefined;
  const OtherInformation1 = au && {
    ...fullName(au),
    ...(auAddr ? { AddrDetail1: auAddr.AddrDetail1, AddrDetail2: auAddr.AddrDetail2, CityOrTownOrDistrict: auAddr.CityOrTownOrDistrict, StateCode: auAddr.StateCode, PinCode: auAddr.PinCode, CountryCode: auAddr.CountryCode } : {}),
    Place: txt(au.place, 35), Date: au.signedOn, MembershipNo: au.membershipNo, FirmRegNum: au.firmRegNo ? au.firmRegNo.toUpperCase() : undefined,
  };
  const obs = nonEmpty((i.observations ?? []).map((o) => ({ ObservationsCode: o.code, ObservationsVal: txt(o.text, 1000) })));

  let Declaration: Record<string, unknown> = {};
  if (i.form === '3CA' && i.form3CA) {
    const f = i.form3CA;
    const self = f.statutoryAuditor === 'SELF';
    Declaration = {
      Point1: {
        I_We1: w.I, AssesseeName: assesseeName, AddressDetail: partAAddress, PAN: pan, AadhaarCardNo: aadhaar,
        Me_Us_Ms: self ? w.Me : 'M/s', CA_FirmName: txt(f.statutoryAuditorName, 125), Act: f.act, Other_Act: f.act === '67' ? txt(f.otherAct, 250) : undefined,
        I_We2: w.I, My_Our_Their: self ? w.My : 'Their', AuditDated: f.auditReportDate, DateofsigningTaxAuditReport: au?.signedOn,
        PointA: { TypeOfAccount: i.accountType, AuditStartDate: py.from, AuditEndDate: py.to }, AuditYearDate: py.to, PointC: i.accountType,
      },
      Point3: { My_Our1: w.My, My_Our2: w.My, Me_Us: w.Me, Observations: obs },
    };
  } else if (i.form === '3CB' && i.form3CB) {
    const f = i.form3CB;
    Declaration = {
      Point1: { I_We: w.I, DateofsigningTaxAuditReport: au?.signedOn, Year: Number(py.to.slice(0, 4)), TypeOfAccount: i.accountType, StartDate: py.from, EndDate: py.to, AssesseeName: assesseeName, AddressDetail: partAAddress, AadhaarCardNo: aadhaar, PAN: pan },
      Point2: { I_We: w.I, TypeOfAccount: i.accountType, HeadOfficeLocation: txt(f.headOffice, 150), NumberOfBrances: f.branches },
      Point3: {
        PointA: f.comments ? { I_We: w.I, OCDI: f.comments.kind, OCDI_Description: txt(f.comments.text, 2000) } : undefined,
        PointB_A: { I_We: w.I, My_Our: w.My },
        PointB_B: { My_Our1: w.My, My_Our2: w.My },
        PointB_C: { My_Our1: w.My, My_Our2: w.My, Me_Us: w.Me, PointFirst: py.to.slice(0, 4), PointSecond: { typeOfAccount: i.accountType, PLSD: f.result } },
      },
      Point5: { My_Our1: w.My, My_Our2: w.My, Me_Us: w.Me, Observations: obs },
    };
  }

  const body = {
    CreationInfo: { SWVersionNo: '1.0', SWCreatedBy: i.softwareId, JSONCreatedBy: i.softwareId, JSONCreationDate: i.createdOn, IntermediaryCity: txt(i.intermediaryCity, 50) || 'Delhi' },
    // Form_Details.AssessmentYear is the first year of the assessment year (the utility writes DataStore.YEAR, 2026 for AY 2026-27).
    Form_Details: {
      FormName: i.form === '3CA' ? 'FORM3CA' : 'FORM3CB',
      Description: i.form === '3CA'
        ? 'Audit report under section 44AB of the Income-tax Act, 1961, in a case where the accounts of the business or profession of a person have been audited under any other law'
        : 'Audit report under section 44AB of the Income-tax Act, 1961, in the case of a person referred to in clause (b) of sub-rule (1) of rule 6G',
      AssessmentYear: '2026', SchemaVer: 'Ver2.5', FormVer: '1.0',
    },
    Declaration,
    PartA,
    ...out,
    Form3cdFlags: flags,
    OtherInformation1,
    assignFlag: i.clause8A ? yn(i.clause8A.opted) : 'N',
    type: i.clause8A?.opted ? i.clause8A.section : undefined,
  };
  const json = i.form === '3CA' ? { FORM3CA: { F3CA: body } } : { FORM3CB: { F3CB: body } };
  const summary = {
    form: i.form === '3CA' ? 'Form 3CA with Form 3CD' : 'Form 3CB with Form 3CD',
    assessmentYear: TAX_AUDIT_AY,
    pan: maskPan(pan),
    clause8: i.clause8 ?? [],
    clausesBuilt: BUILT_CLAUSES.filter((c) => c !== '9' || isFirmOrAop),
    clausesNotApplicable: [...na],
    depreciationAllowable: depreciationTotal,
    tdsRows: b.clause34?.rows.length ?? 0,
  };
  return { json: issues.length ? null : prune(json), issues, clausesNeeded: [...new Set(clausesNeeded)], summary };
}

/* Clause 34 from the TDS registers */

const rupees = (v: string | number | undefined) => n0(v ?? 0);

/**
 * Clause 34(a) row from a sectionRegister line (tds/registers.ts). Columns 6 to 10 come from the
 * statements; columns 4 and 5 come from the books and the section is the Act section, so the
 * auditor supplies them.
 */
export function clause34aFromSectionLine(line: SectionLine, extra: { tan: string; section: string; nature: string; totalAmount: number; requiredAmount: number }): Clause34aRow {
  return {
    tan: extra.tan, section: extra.section, nature: extra.nature, totalAmount: extra.totalAmount, requiredAmount: extra.requiredAmount,
    specifiedRateAmount: rupees(line.fullRateAmount), specifiedRateTax: rupees(line.fullRateTax),
    lowerRateAmount: rupees(line.lowerRateAmount), lowerRateTax: rupees(line.lowerRateTax), notDeposited: rupees(line.notDeposited),
  };
}

/** Clause 34(b) row from a statementRegister entry (tds/registers.ts). */
export function clause34bFromStatement(s: { form: string; dueDate: string; filedOn: string | null }, tan: string, allReported: boolean, notReported?: string): Clause34bRow {
  return { tan, form: s.form, dueDate: s.dueDate, filedOn: s.filedOn ?? undefined, allReported, notReported };
}

/** Clause 34(c) row from defaultAnalysis totals (tds/registers.ts): interest for late deduction and late deposit, and the interest paid on challans. */
export function clause34cFromDefaultAnalysis(totals: { lateDeductionInterest: string; lateDepositInterest: string; interestPaid: string }, tan: string, paidOn?: string): Clause34cRow {
  return { tan, interestPayable: rupees(Number(totals.lateDeductionInterest) + Number(totals.lateDepositInterest)), interestPaid: rupees(totals.interestPaid), paidOn };
}

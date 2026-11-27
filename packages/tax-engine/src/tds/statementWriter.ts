import Decimal from 'decimal.js';
import { form140Section } from './form140Codes.js';
import {
  DEDUCTOR_TYPES,
  GOVERNMENT_DEDUCTOR_TYPES,
  IN_KIND_SECTION_CODES,
  MINISTRY_CODES,
  MINISTRY_OPTIONAL_TYPES,
  MINISTRY_REQUIRED_TYPES,
  PROTEAN_STATE_CODES,
  REASON_FLAGS,
  STATE_GOVERNMENT_TYPES,
} from './form140Annexures.js';
import {
  COUNTRY_CODES,
  FORM_143_COLLECTION_CODES,
  FORM_143_REASON_FLAGS,
  FORM_144_REASON_FLAGS,
  FORM_144_SECTION_CODES,
  PAYEE_STATUS_CODES,
  REMITTANCE_BY_SECTION,
} from './form144and143Annexures.js';
import { FORM_138_REASON_FLAGS, FORM_138_SECTION_CODES } from './form138Annexures.js';
import { RECORD_FIELD_COUNT } from './etdsStatement.js';

/**
 * Writes regular quarterly statements under the Income-tax Act 2025 as the "^"-delimited text file
 * that Protean's FVU 1.2 validates:
 *   Form 138 (salary TDS, quarters 1 to 3), Form 140 (non-salary TDS, residents),
 *   Form 144 (TDS on payments to non-residents), Form 143 (TCS).
 * Field positions follow Protean's file formats for each form (version 1.1, Tax Year 2026-27 on).
 * The file and batch header and the challan record are the same layout in all four; the
 * deductee (or collectee) record differs. Every rule we can check without the FVU is checked first.
 */

export type StatementForm = '138' | '140' | '144' | '143';

export interface StatementAddress {
  line1: string;
  line2?: string;
  line3?: string;
  line4?: string;
  district?: string;
  stateCode: string; // Protean Annexure 1 code (Punjab = 26)
  pin: string;
}

export interface StatementParty {
  name: string;
  address: StatementAddress;
  email: string;
  phone: string; // digits, no country code
  phoneCountryCode?: string; // default 91
}

/** One deductee (Form 140/144) or collectee (Form 143) row. */
export interface StatementPayee {
  pan: string; // PAN, or PANNOTAVBL / PANAPPLIED / PANINVALID
  name: string;
  sectionCode: string;
  paidOn: string; // ISO: paid / credited (TDS) or received / debited (TCS)
  amountPaid: string | number;
  taxDeducted: string | number; // tax deducted, or tax collected for Form 143
  taxDeposited: string | number;
  deductedOn?: string; // ISO: date of deduction or collection
  ratePercent: string | number;
  reasonFlag?: string;
  certificateNo?: string;
  form121Uin?: string; // Form 140
  cashOver1Cr?: string | number; // Form 140, codes 1064 / 1065
  cashOver3Cr?: string | number;
  // Form 144 (non-residents)
  statusCode?: string; // Annexure 8
  optingOut?: boolean; // section 202(1)
  remittanceNature?: string; // Annexure 9
  countryCode?: string; // Annexure 10
  grossedUp?: boolean; // section 393(10)
  rateBasis?: 'A' | 'B'; // A: as per the Act, B: as per DTAA
  form15caAck?: string;
  residenceAddress?: string;
  residenceEmail?: string;
  residenceContact?: string;
  residenceTaxId?: string;
  // Form 143 (TCS)
  nonResident?: boolean;
  permanentEstablishment?: boolean;
  liableToTds3945?: boolean; // section 394(5), with flag F
  tdsChallanNo?: string;
  tdsPaidOn?: string; // ISO
}

export interface StatementChallanInput {
  nil?: boolean;
  mode: 'C' | 'B';
  bsrCode: string;
  challanNo?: string;
  depositedOn: string; // ISO
  tax: string | number;
  interest: string | number;
  fee: string | number;
  others: string | number;
  minorHead: '200' | '400' | '100';
  deductees: StatementPayee[];
}

export interface StatementInput {
  form: StatementForm;
  fileCreated: string;
  fileSequence: number;
  preparedWith: string;
  tan: string;
  deductorPan: string;
  deductor: StatementParty & {
    type: string;
    gstin?: string;
    /** Government deductors: state (Protean code), ministry (Annexure 3), and AIN of the PAO, TO or CDDO. */
    government?: { stateCode?: string; ministryCode?: string; ministryOther?: string; ain?: string };
  };
  responsible: StatementParty & { designation: string; pan: string };
  taxYear: number;
  quarter: 1 | 2 | 3 | 4;
  earlierRegularFiled: boolean;
  previousToken?: string;
  /** Feature-flag gate for Form 138 Q4 schema v1.0 once Protean FVU 1.2 specification is active. */
  allowForm138Q4V10?: boolean;
  challans: StatementChallanInput[];
}

export interface StatementSchemaResolution {
  fvuVersion: '1.2' | '9.5';
  schemaVersion: string;
  supported: boolean;
  note?: string;
}

const FVU_2025_SCHEMA: Record<'138' | '140' | '143' | '144', string> = {
  '138': 'v1.2',
  '140': 'v1.2',
  '143': 'v1.2',
  '144': 'v1.2',
};

const FVU_1961_SCHEMA: Record<'24Q' | '26Q' | '27Q' | '27EQ', string> = {
  '24Q': 'v7.3',
  '26Q': 'v8.0',
  '27Q': 'v7.8',
  '27EQ': 'v7.5',
};

/** Exact Protean FVU schema version matrix across Income-tax Act 2025 (v1.2) and 1961 Act (v9.5). */
export function resolveStatementSchemaVersion(params: {
  regime: 'IT_ACT_2025' | 'IT_ACT_1961';
  form: string;
  quarter: number;
  allowForm138Q4V10?: boolean;
}): StatementSchemaResolution {
  const form = params.form.toUpperCase();
  const q = Number(params.quarter);
  if (params.regime === 'IT_ACT_2025') {
    if (form === '138' && q === 4) {
      return {
        fvuVersion: '1.2',
        schemaVersion: 'v1.0',
        supported: Boolean(params.allowForm138Q4V10),
        ...(params.allowForm138Q4V10
          ? {}
          : { note: 'Form 138 Q4 file format (v1.0) is feature-flag gated until the annual salary Q4 annexure layout is enabled.' }),
      };
    }
    return {
      fvuVersion: '1.2',
      schemaVersion: FVU_2025_SCHEMA[form as keyof typeof FVU_2025_SCHEMA] ?? 'v1.2',
      supported: form in FVU_2025_SCHEMA,
    };
  }
  if (form === '24Q' && q === 4) {
    return { fvuVersion: '9.5', schemaVersion: 'v7.6', supported: true };
  }
  return {
    fvuVersion: '9.5',
    schemaVersion: FVU_1961_SCHEMA[form as keyof typeof FVU_1961_SCHEMA] ?? 'v7.3',
    supported: form in FVU_1961_SCHEMA,
  };
}

export interface WriteIssue {
  where: string;
  message: string;
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const PAN_LITERALS = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;
const EMAIL_RE = /^[^\s@^]+@[^\s@^]+\.[^\s@^]+$/;
const STATE_CODES = new Set(Object.values(PROTEAN_STATE_CODES));

const clean = (v: unknown) => String(v ?? '').replace(/[\^\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const isIso = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const money = (v: string | number) => new Decimal(v || 0).toFixed(2);
const meaningful = (s: string) => /[A-Za-z0-9]/.test(s);
const yn = (b: boolean | undefined) => (b ? 'Y' : 'N');

function quarterBounds(taxYear: number, q: 1 | 2 | 3 | 4): [string, string] {
  const starts = [`${taxYear}-04-01`, `${taxYear}-07-01`, `${taxYear}-10-01`, `${taxYear + 1}-01-01`];
  const ends = [`${taxYear}-06-30`, `${taxYear}-09-30`, `${taxYear}-12-31`, `${taxYear + 1}-03-31`];
  return [starts[q - 1], ends[q - 1]];
}

const FORM_LABEL: Record<StatementForm, string> = { '138': 'Form 138', '140': 'Form 140', '144': 'Form 144', '143': 'Form 143' };
const EARLIER_FORM: Record<StatementForm, string> = { '138': '24Q', '140': '26Q', '144': '27Q', '143': '27EQ' };
const FILE_TYPE: Record<StatementForm, string> = { '138': 'SL1', '140': 'NS1', '144': 'NS1', '143': 'TC1' };

/** Whether a section code belongs to a form's Annexure 2. Forms 140 and 144 share some codes. */
export function formHasSection(form: StatementForm, code: string): boolean {
  return sectionKnown(form, code);
}

function sectionKnown(form: StatementForm, code: string): boolean {
  if (form === '138') return code in FORM_138_SECTION_CODES;
  if (form === '140') return Boolean(form140Section(code));
  if (form === '144') return code in FORM_144_SECTION_CODES;
  return code in FORM_143_COLLECTION_CODES;
}

function reasonRule(form: StatementForm, flag: string): { sections: ReadonlySet<string>; panRequired?: boolean } | undefined {
  if (form === '138') return FORM_138_REASON_FLAGS[flag];
  return form === '140' ? REASON_FLAGS[flag] : form === '144' ? FORM_144_REASON_FLAGS[flag] : FORM_143_REASON_FLAGS[flag];
}

export function writeTdsStatement(input: StatementInput): { text: string; issues: WriteIssue[] } {
  const { form } = input;
  const issues: WriteIssue[] = [];
  const err = (where: string, message: string) => issues.push({ where, message });
  const payeeWord = form === '143' ? 'collectee' : form === '138' ? 'employee' : 'deductee';

  // ---------------------------------------------------------------- deductor and statement
  const tan = clean(input.tan).toUpperCase();
  if (!TAN_RE.test(tan)) err('TAN', 'TAN must be 4 letters, 5 digits, 1 letter.');
  const dPan = clean(input.deductorPan).toUpperCase();
  if (!PAN_RE.test(dPan) && dPan !== 'PANNOTREQD') err('Deductor PAN', 'Give the deductor PAN, or PANNOTREQD if it is not required to have one.');
  if (input.taxYear < 2026) err('Tax year', `${FORM_LABEL[form]} applies from Tax Year 2026-27. Earlier years use Form ${EARLIER_FORM[form]}.`);
  if (!DEDUCTOR_TYPES[input.deductor.type]) err('Deductor type', 'Choose a deductor category from Annexure 4.');
  // Government deductors: fields 54, 57, 58 and 68 of the batch header.
  const gov = input.deductor.government ?? {};
  const type = input.deductor.type;
  const isGov = GOVERNMENT_DEDUCTOR_TYPES.has(type);
  const govState = clean(gov.stateCode);
  const ministry = clean(gov.ministryCode).padStart(gov.ministryCode ? 2 : 0, '0');
  if (STATE_GOVERNMENT_TYPES.has(type) && !STATE_CODES.has(govState)) err('Deductor state', 'A State Government deductor must give its state (Annexure 5).');
  if (!STATE_GOVERNMENT_TYPES.has(type) && govState) err('Deductor state', 'Only State Government deductors give a state in this field.');
  if (MINISTRY_REQUIRED_TYPES.has(type) && !MINISTRY_CODES[ministry]) err('Ministry', 'A Central Government deductor must give its ministry (Annexure 3).');
  if (ministry && !MINISTRY_REQUIRED_TYPES.has(type) && !MINISTRY_OPTIONAL_TYPES.has(type)) err('Ministry', 'This deductor type gives no ministry.');
  if (ministry && !MINISTRY_CODES[ministry]) err('Ministry', `Ministry code ${ministry} is not in Annexure 3.`);
  if (ministry === '99' && !clean(gov.ministryOther)) err('Ministry', 'Name the ministry when the code is 99 (Others).');
  const bookEntry = input.challans.some((c) => c.mode === 'B' && !c.nil);
  const ain = clean(gov.ain).toUpperCase();
  if (bookEntry && !isGov) err('Challans', 'Only government deductors pay by book adjustment (transfer voucher).');
  if (bookEntry && (type === 'A' || type === 'S') && !/^[A-Z0-9]{7}$/.test(ain)) err('AIN', 'Tax paid by book adjustment needs the 7-character AIN of the PAO, TO or CDDO.');
  if (ain && !isGov) err('AIN', 'Only government deductors give an AIN.');
  const schemaRes = resolveStatementSchemaVersion({
    regime: 'IT_ACT_2025',
    form,
    quarter: input.quarter,
    allowForm138Q4V10: input.allowForm138Q4V10,
  });
  if (!schemaRes.supported) {
    err('Quarter', schemaRes.note ?? 'Protean has not yet published the Form 138 Q4 file format, which carries the annual salary details. Q4 files can be written once it is enabled.');
  }
  if (input.earlierRegularFiled && !/^\d{15}$/.test(clean(input.previousToken))) err('Previous token', `Give the 15-digit token of the previous regular ${FORM_LABEL[form]} statement.`);
  if (input.deductor.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean(input.deductor.gstin).toUpperCase())) err('Deductor GSTIN', 'GSTIN is not valid.');

  const party = (label: string, p: StatementParty) => {
    const name = clean(p.name);
    if (!name || !meaningful(name)) err(`${label} name`, 'Name is required.');
    if (name.length > 75) err(`${label} name`, 'Name can be at most 75 characters.');
    const a = p.address;
    if (!clean(a.line1) || !meaningful(clean(a.line1))) err(`${label} address`, 'Address line 1 (flat, door or block) is required.');
    for (const [k, v] of Object.entries(a)) if (k !== 'stateCode' && k !== 'pin' && clean(v).length > 25) err(`${label} address`, `Each address line can be at most 25 characters (${k}).`);
    if (!STATE_CODES.has(a.stateCode)) err(`${label} state`, 'State must be a Protean state code from Annexure 1.');
    if (!/^[1-9]\d{5}$/.test(clean(a.pin))) err(`${label} PIN`, 'PIN code must be 6 digits.');
    if (!EMAIL_RE.test(clean(p.email))) err(`${label} email`, 'A valid email is required.');
    if (!/^\d{10}$/.test(clean(p.phone))) err(`${label} phone`, 'Phone must be 10 digits without the country code.');
  };
  party('Deductor', input.deductor);
  party('Responsible person', input.responsible);
  if (!clean(input.responsible.designation) || clean(input.responsible.designation).length > 20) err('Responsible person designation', 'Designation is required, at most 20 characters.');
  if (!PAN_RE.test(clean(input.responsible.pan).toUpperCase())) err('Responsible person PAN', 'A valid PAN of the responsible person is required.');

  if (!input.challans.length) err('Challans', 'A statement needs at least one challan.');
  const [qStart, qEnd] = quarterBounds(input.taxYear, input.quarter);
  const earliestDeposit = `${input.taxYear - 1}-04-01`;

  // ---------------------------------------------------------------- challans and payees
  let payeeNo = 0;
  let batchTotal = new Decimal(0);
  const records: string[][] = [];
  const challanBlocks: string[][][] = [];

  input.challans.forEach((c, ci) => {
    const at = `Challan ${ci + 1}`;
    for (const [k, v] of Object.entries({ tax: c.tax, interest: c.interest, fee: c.fee, others: c.others })) {
      const d = new Decimal(v || 0);
      if (d.isNeg() || !d.isInteger()) err(at, `${k} must be whole rupees.`);
    }
    const total = new Decimal(c.tax || 0).add(c.interest || 0).add(c.fee || 0).add(c.others || 0);
    batchTotal = batchTotal.add(total);
    if (!c.nil) {
      if (!/^\d{7}$/.test(clean(c.bsrCode))) err(at, 'BSR code (or Form 24G receipt number) must be 7 digits.');
      if (c.mode === 'C' && !/^\d{1,5}$/.test(clean(c.challanNo))) err(at, 'Bank challan number must be up to 5 digits.');
      if (c.mode === 'B' && !/^\d{1,5}$/.test(clean(c.challanNo))) err(at, 'DDO serial number must be up to 5 digits (book adjustment).');
      if (c.mode === 'B' && c.deductees.some((d) => ['1059', '1034', '1038', '1061'].includes(clean(d.sectionCode)))) err(at, 'Codes 1059, 1034, 1038 and 1061 are paid by challan, not by book adjustment.');
    }
    if (!isIso(c.depositedOn)) err(at, 'Deposit date is missing or invalid.');
    else {
      if (c.depositedOn < earliestDeposit) err(at, `Deposit date must be on or after ${earliestDeposit}.`);
      if (c.depositedOn > input.fileCreated) err(at, 'Deposit date cannot be after the file date.');
      if (c.nil && c.depositedOn !== qEnd) err(at, 'A nil challan is dated the last day of the quarter.');
    }
    if (!['200', '400', '100'].includes(c.minorHead)) err(at, 'Minor head must be 200, 400 or 100.');
    if (!c.deductees.length) err(at, `Every challan, including a nil challan, needs at least one ${payeeWord} row.`);

    let sumDeposited = new Decimal(0);
    let sumDeducted = new Decimal(0);
    const rows: string[][] = [];
    c.deductees.forEach((d, di) => {
      const w = `${at}, ${payeeWord} ${di + 1}`;
      payeeNo += 1;
      const pan = clean(d.pan).toUpperCase();
      const code = clean(d.sectionCode);
      const inKind = (form === '140' || form === '144') && IN_KIND_SECTION_CODES.has(code);
      if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err(w, 'PAN must be valid, or PANNOTAVBL / PANAPPLIED / PANINVALID.');
      if (inKind && PAN_LITERALS.has(pan)) err(w, `Section ${code} needs the payee's actual PAN.`);
      if (!clean(d.name) || clean(d.name).length > 75) err(w, 'Name is required, at most 75 characters.');
      if (!sectionKnown(form, code)) err(w, `Code ${code || '(blank)'} is not in Annexure 2 of ${FORM_LABEL[form]}.`);
      const tyStart = `${input.taxYear}-04-01`;
      const tyEnd = `${input.taxYear + 1}-03-31`;
      if (!isIso(d.paidOn) || d.paidOn < tyStart || d.paidOn > tyEnd || d.paidOn < qStart || d.paidOn > qEnd) {
        err(w, `Date ${form === '143' ? 'received or debited' : 'paid or credited'} must fall within Q${input.quarter} (${qStart} to ${qEnd}) of active Tax Year ${input.taxYear}-${String((input.taxYear + 1) % 100).padStart(2, '0')}.`);
      }
      const paid = new Decimal(d.amountPaid || 0);
      const ded = new Decimal(d.taxDeducted || 0);
      const dep = new Decimal(d.taxDeposited || 0);
      if (!paid.gt(0)) err(w, 'Amount must be more than 0.00.');
      if (inKind && (!ded.isZero() || !dep.isZero())) err(w, `For section ${code}, tax deducted and deposited are 0.00.`);
      if (form === '143' && !ded.eq(dep)) err(w, 'Tax collected must equal tax deposited.');
      if (form === '138' && !ded.eq(dep)) err(w, 'Tax deducted must equal tax deposited.');
      if (ded.gt(0) && (!isIso(d.deductedOn) || d.deductedOn < qStart || d.deductedOn > qEnd)) err(w, `Date of ${form === '143' ? 'collection' : 'deduction'} is required and must fall within ${qStart} to ${qEnd}.`);
      const flag = clean(d.reasonFlag).toUpperCase();
      if (flag) {
        const rule = reasonRule(form, flag);
        if (!rule) err(w, `Reason flag ${flag} is not allowed in ${FORM_LABEL[form]}.`);
        else if (!rule.sections.has(code)) err(w, `Reason flag ${flag} cannot be used with code ${code}.`);
        if (rule?.panRequired && !PAN_RE.test(pan)) err(w, `Reason flag ${flag} needs the employee's PAN.`);
        if (form === '138' && flag === 'C' && ded.lt(paid.mul(0.2))) err(w, 'Flag C (no PAN) needs tax of at least 20% of the amount paid.');
        if (flag === 'A' && !/^[A-Z0-9]{10}([A-Z0-9]{5})?$/.test(clean(d.certificateNo).toUpperCase())) {
          err(w, `Flag A needs the 10 or 15 character ${input.taxYear >= 2026 ? 'Section 395 / 395(1) / 395(2)' : 'Section 197'} certificate number.`);
        }
        if (flag === 'T' && !PAN_RE.test(pan)) err(w, 'Flag T (transporter) needs the payee PAN.');
      }
      const rate = ded.isZero() || inKind ? '0.0000' : new Decimal(d.ratePercent || 0).toFixed(4);

      const f = Array<string>(RECORD_FIELD_COUNT.DD).fill('');
      f[1] = 'DD'; f[2] = '1'; f[3] = String(payeeNo); f[4] = String(ci + 1); f[5] = 'O';
      f[7] = pan; f[8] = clean(d.name); f[14] = code;
      f[17] = dep.gte(ded) ? 'Y' : 'N';
      f[18] = isIso(d.paidOn) ? ddmmyyyy(d.paidOn) : '';
      f[19] = paid.toFixed(2);
      f[23] = ded.toFixed(2); f[24] = dep.toFixed(2);
      f[26] = ded.gt(0) && isIso(d.deductedOn) ? ddmmyyyy(d.deductedOn) : '';
      f[27] = rate;
      f[31] = flag; f[32] = clean(d.certificateNo).toUpperCase();

      if (form === '138') {
        // No rate field in Form 138; field 29 carries the date of deposit (the challan date).
        f[27] = '';
        f[28] = dep.gt(0) && isIso(c.depositedOn) ? ddmmyyyy(c.depositedOn) : '';
      } else if (form === '140') {
        if (d.form121Uin && clean(d.form121Uin).length !== 26) err(w, 'Form 121 identification number must be 26 characters.');
        if (code === '1064' || code === '1065') { f[21] = money(d.cashOver1Cr ?? 0); f[22] = money(d.cashOver3Cr ?? 0); }
        f[30] = clean(d.form121Uin).toUpperCase();
      } else if (form === '144') {
        if (!d.statusCode || !PAYEE_STATUS_CODES[d.statusCode]) err(w, 'Status of the deductee must be a code from Annexure 8.');
        if (!d.countryCode || !COUNTRY_CODES[d.countryCode]) err(w, 'Country of remittance must be a code from Annexure 10.');
        if (d.countryCode === '113') err(w, 'Form 144 is for non-residents; India (113) is not a country of remittance.');
        const natures = REMITTANCE_BY_SECTION[code];
        if (natures && !natures.includes(clean(d.remittanceNature))) err(w, `Section ${code} needs a nature of remittance from Annexure 9 (${natures.join(', ')}).`);
        if (!natures && d.remittanceNature) err(w, `Section ${code} takes no nature of remittance.`);
        if (!d.rateBasis || !['A', 'B'].includes(d.rateBasis)) err(w, 'Say whether the rate is as per the Act (A) or a DTAA (B).');
        if (d.form15caAck && clean(d.form15caAck).length > 26) err(w, 'Form 15CA acknowledgement can be at most 26 characters.');
        // Lower-rate deduction without a valid PAN needs the payee's details in the country of residence.
        if (PAN_LITERALS.has(pan) && ded.gt(0) && new Decimal(d.ratePercent || 0).lt(20)) {
          if (!clean(d.residenceAddress) || !clean(d.residenceTaxId)) err(w, 'Without a PAN, a rate below 20% needs the address and tax identification number in the country of residence.');
        }
        f[11] = clean(d.statusCode); f[13] = yn(d.optingOut);
        f[15] = clean(d.remittanceNature); f[16] = clean(d.countryCode);
        f[20] = yn(d.grossedUp); f[29] = d.rateBasis ?? '';
        f[30] = clean(d.form15caAck).toUpperCase();
        f[36] = clean(d.residenceAddress).slice(0, 150); f[37] = clean(d.residenceEmail).slice(0, 75); f[38] = clean(d.residenceContact).replace(/\D/g, '').slice(0, 15);
        f[40] = clean(d.residenceTaxId).slice(0, 25);
      } else {
        if (!d.statusCode || !PAYEE_STATUS_CODES[d.statusCode]) err(w, 'Collectee code must be a code from Annexure 8.');
        if (d.liableToTds3945 !== undefined && flag !== 'F') err(w, 'The section 394(5) TDS answer applies only with reason flag F.');
        if (d.liableToTds3945 && (!/^\d{1,5}$/.test(clean(d.tdsChallanNo)) || !isIso(d.tdsPaidOn))) err(w, 'Give the TDS challan number and date of payment.');
        f[10] = yn(d.nonResident);
        f[11] = clean(d.statusCode);
        f[12] = d.nonResident ? yn(d.permanentEstablishment) : '';
        f[13] = yn(d.optingOut);
        f[17] = dep.gte(ded) ? 'Y' : 'N';
        f[33] = d.liableToTds3945 === undefined ? '' : yn(d.liableToTds3945);
        f[34] = d.liableToTds3945 ? clean(d.tdsChallanNo) : '';
        f[35] = d.liableToTds3945 && isIso(d.tdsPaidOn) ? ddmmyyyy(d.tdsPaidOn) : '';
      }
      sumDeposited = sumDeposited.add(dep);
      sumDeducted = sumDeducted.add(ded);
      rows.push(f);
    });

    if (c.mode === 'C' && !c.nil && total.lt(sumDeposited.add(c.interest || 0).add(c.others || 0).add(c.fee || 0))) {
      err(at, `Challan total is less than the tax deposited for its ${payeeWord}s plus interest, fee and other amounts.`);
    }

    const f = Array<string>(RECORD_FIELD_COUNT.CD).fill('');
    f[1] = 'CD'; f[2] = '1'; f[3] = String(ci + 1); f[4] = String(c.deductees.length); f[5] = c.nil ? 'Y' : 'N';
    f[7] = money(c.tax); f[8] = money(c.interest); f[9] = money(c.fee); f[10] = money(c.others); f[11] = total.toFixed(2);
    f[12] = c.nil ? '' : c.mode;
    f[14] = c.nil ? '' : clean(c.bsrCode); f[16] = c.nil ? '' : clean(c.challanNo);
    f[18] = isIso(c.depositedOn) ? ddmmyyyy(c.depositedOn) : '';
    f[20] = sumDeposited.toFixed(2); f[21] = sumDeducted.toFixed(2);
    f[22] = c.nil ? '' : c.minorHead;
    f[23] = money(c.interest); f[24] = money(c.others);
    challanBlocks.push([f, ...rows]);
  });

  // ---------------------------------------------------------------- header records
  const fh = Array<string>(RECORD_FIELD_COUNT.FH).fill('');
  fh[1] = 'FH'; fh[2] = FILE_TYPE[form]; fh[3] = 'R'; fh[4] = isIso(input.fileCreated) ? ddmmyyyy(input.fileCreated) : '';
  fh[5] = String(input.fileSequence); fh[6] = 'D'; fh[7] = tan; fh[8] = '1'; fh[9] = clean(input.preparedWith).slice(0, 75);

  const d = input.deductor;
  const r = input.responsible;
  const bh = Array<string>(RECORD_FIELD_COUNT.BH).fill('');
  bh[1] = 'BH'; bh[2] = '1'; bh[3] = String(input.challans.length); bh[4] = form;
  bh[8] = input.earlierRegularFiled ? clean(input.previousToken) : '';
  bh[12] = tan; bh[14] = dPan;
  bh[15] = `${input.taxYear + 1}${String((input.taxYear + 2) % 100).padStart(2, '0')}`;
  bh[16] = `${input.taxYear}${String((input.taxYear + 1) % 100).padStart(2, '0')}`;
  bh[17] = `Q${input.quarter}`;
  bh[18] = clean(d.name); bh[19] = 'INDIA';
  bh[20] = clean(d.address.line1); bh[21] = clean(d.address.line2); bh[22] = clean(d.address.line3); bh[23] = clean(d.address.line4); bh[24] = clean(d.address.district);
  bh[25] = d.address.stateCode; bh[26] = clean(d.address.pin); bh[27] = clean(d.email).toUpperCase(); bh[28] = clean(d.phoneCountryCode || '91'); bh[29] = clean(d.phone);
  bh[31] = d.type;
  bh[32] = clean(r.name); bh[33] = clean(r.designation);
  bh[34] = clean(r.address.line1); bh[35] = clean(r.address.line2); bh[36] = clean(r.address.line3); bh[37] = clean(r.address.line4); bh[38] = clean(r.address.district);
  bh[39] = r.address.stateCode; bh[40] = clean(r.address.pin); bh[41] = clean(r.email).toUpperCase(); bh[42] = 'INDIA'; bh[43] = clean(r.phoneCountryCode || '91'); bh[44] = clean(r.phone);
  bh[46] = batchTotal.toFixed(2);
  bh[51] = input.earlierRegularFiled ? 'Y' : 'N';
  bh[53] = STATE_GOVERNMENT_TYPES.has(type) ? govState : '';
  bh[56] = MINISTRY_REQUIRED_TYPES.has(type) || MINISTRY_OPTIONAL_TYPES.has(type) ? ministry : '';
  bh[57] = ministry === '99' ? clean(gov.ministryOther).slice(0, 150) : '';
  bh[58] = clean(r.pan).toUpperCase();
  bh[67] = bookEntry && (type === 'A' || type === 'S') ? ain : '';
  bh[68] = clean(d.gstin).toUpperCase();

  records.push(fh, bh);
  for (const block of challanBlocks) records.push(...block);
  const text = records.map((f, i) => ((f[0] = String(i + 1)), f.join('^'))).join('\r\n') + '\r\n';
  return { text, issues };
}

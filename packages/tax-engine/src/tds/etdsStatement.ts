import Decimal from 'decimal.js';
import { form140Section } from './form140Codes.js';
import { FORM_143_COLLECTION_CODES, FORM_144_SECTION_CODES } from './form144and143Annexures.js';
import { FORM_138_SECTION_CODES } from './form138Annexures.js';
import { LEGACY_SECTION_CODES, isLegacyForm } from './form1961Codes.js';

/**
 * Reader for Protean e-TDS regular statement text files ("^" delimited, one record per line).
 *
 * 2025 Act: Forms 138, 140, 144 and 143, file formats version 1.x (Tax Year 2026-27 on).
 * 1961 Act: Forms 24Q, 26Q, 27Q and 27EQ (24Q v6.3 and 7.5, 26Q v7.8, 27Q v7.5, 27EQ v6.9), for
 * history up to 31 March 2026. The file and batch headers share positions; the challan (41
 * fields) and deductee (54 fields) records are laid out differently, and tax is split into
 * income tax, surcharge and cess. 24Q Q4 salary detail (SD) records are skipped with a warning.
 * Field positions are the 1-based "Sr. No." of Protean's spreadsheets.
 */

export const RECORD_FIELD_COUNT = { FH: 18, BH: 72, CD: 30, DD: 45 } as const;
export const LEGACY_RECORD_FIELD_COUNT = { FH: 18, BH: 72, CD: 41, DD: 54 } as const;

export interface StatementIssue {
  line: number;
  level: 'error' | 'warning';
  message: string;
}

export interface StatementChallan {
  recordNo: number;
  deducteeCount: number;
  nil: boolean;
  totalTax: string;
  interest: string;
  fee: string;
  others: string;
  totalDeposit: string;
  mode: 'CHALLAN' | 'BOOK_ADJUSTMENT';
  bsrCode: string;
  challanNo: string;
  depositDate: string; // ISO
  minorHead: string;
}

export interface StatementDeductee {
  recordNo: number;
  challanRecordNo: number;
  pan: string;
  name: string;
  sectionCode: string;
  sectionKnown: boolean;
  paymentDate: string; // ISO
  amountPaid: string;
  taxDeducted: string;
  taxDeposited: string;
  deductionDate: string; // ISO
  rate: string;
  reasonCode: string;
  certificateNo: string;
  /** Form 144 and 143 extras (blank for Form 140). */
  statusCode: string;
  optingOut: boolean;
  remittanceNature: string;
  countryCode: string;
  grossedUp: boolean;
  rateBasis: string;
  form15caAck: string;
  form121Uin: string;
  residenceAddress: string;
  residenceEmail: string;
  residenceContact: string;
  residenceTaxId: string;
  nonResident: boolean;
  permanentEstablishment: boolean | null;
}

export interface ParsedStatement {
  form: string;
  /** Which Act the statement was filed under, from its form number. */
  regime: 'IT_ACT_2025' | 'IT_ACT_1961' | '';
  tan: string;
  deductorPan: string;
  deductorName: string;
  deductorType: string;
  taxYear: number | null; // start year, e.g. 2026 for 2026-27
  quarter: 1 | 2 | 3 | 4 | null;
  previousToken: string;
  fileCreated: string; // ISO
  preparedWith: string;
  challans: StatementChallan[];
  deductees: StatementDeductee[];
  issues: StatementIssue[];
}

const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const PAN_LITERALS = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);
const TAN_RE = /^[A-Z]{4}\d{5}[A-Z]$/;

function isoFromDdmmyyyy(v: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (d.getUTCDate() !== Number(dd) || d.getUTCMonth() !== Number(mm) - 1) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function amount(v: string): string | null {
  const t = v.trim();
  if (t === '') return '0.00';
  if (!/^-?\d+(\.\d{1,4})?$/.test(t)) return null;
  return new Decimal(t).toFixed(2);
}

export function parseEtdsStatement(text: string): ParsedStatement {
  const issues: StatementIssue[] = [];
  let fileType = '';
  let skippedSalary = false;
  // Older 1961 files carry the section on the challan (CD field 21) and leave the deductee's blank.
  const challanSection = new Map<number, string>();
  const out: ParsedStatement = {
    form: '',
    regime: '',
    tan: '',
    deductorPan: '',
    deductorName: '',
    deductorType: '',
    taxYear: null,
    quarter: null,
    previousToken: '',
    fileCreated: '',
    preparedWith: '',
    challans: [],
    deductees: [],
    issues,
  };

  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) {
    issues.push({ line: 0, level: 'error', message: 'The file is empty.' });
    return out;
  }

  const err = (line: number, message: string) => issues.push({ line, level: 'error', message });
  const warn = (line: number, message: string) => issues.push({ line, level: 'warning', message });

  lines.forEach((raw, i) => {
    const line = i + 1;
    const f = raw.split('^');
    const type = f[1];
    const legacy = out.regime === 'IT_ACT_1961';
    const counts = legacy ? LEGACY_RECORD_FIELD_COUNT : RECORD_FIELD_COUNT;
    const expected = counts[type as keyof typeof counts];
    if (!expected) {
      if (legacy && out.form === '24Q' && /^(SD|S16|C6A)$/.test(type ?? '')) {
        if (!skippedSalary) warn(line, 'Quarter 4 salary details (Annexure II) are not imported; the deductee rows are.');
        skippedSalary = true;
      } else err(line, `Unknown record type "${type ?? ''}".`);
      return;
    }
    // The batch header has 72 fields under both Acts, so it is read before the Act is known.
    if (f.length !== expected) {
      err(line, `${type} record has ${f.length} fields; the Form ${out.form || '140'} format has ${expected}.`);
      return;
    }
    const at = (n: number) => (f[n - 1] ?? '').trim();

    if (type === 'FH') {
      if (line !== 1) err(line, 'The file header must be the first line.');
      out.fileCreated = isoFromDdmmyyyy(at(5)) ?? '';
      out.tan = at(8).toUpperCase();
      out.preparedWith = at(10);
      fileType = at(3);
      if (!['NS1', 'SL1', 'TC1'].includes(fileType)) warn(line, `File type "${fileType}" is not NS1, SL1 or TC1.`);
      if (at(4) !== 'R') err(line, 'Only regular statements (upload type R) can be imported; this looks like a correction.');
      return;
    }

    if (type === 'BH') {
      out.form = at(5).toUpperCase();
      if (['138', '140', '144', '143'].includes(out.form)) out.regime = 'IT_ACT_2025';
      else if (isLegacyForm(out.form)) out.regime = 'IT_ACT_1961';
      else {
        err(line, `"${out.form || '?'}" is not a TDS or TCS statement form this reader knows (138, 140, 143, 144, 24Q, 26Q, 27Q, 27EQ).`);
        return;
      }
      const expectedType = out.form === '138' || out.form === '24Q' ? 'SL1' : out.form === '143' || out.form === '27EQ' ? 'TC1' : 'NS1';
      if (fileType && fileType !== expectedType) warn(line, `Form ${out.form} files have file type ${expectedType}, not ${fileType}.`);
      const tan = at(13).toUpperCase();
      if (out.tan && tan !== out.tan) err(line, `The batch TAN ${tan} differs from the file header TAN ${out.tan}.`);
      out.tan = tan || out.tan;
      out.previousToken = at(9);
      out.deductorPan = at(15).toUpperCase();
      const ty = at(17);
      out.taxYear = /^\d{6}$/.test(ty) ? Number(ty.slice(0, 4)) : null;
      const q = /^Q([1-4])$/.exec(at(18).toUpperCase());
      out.quarter = q ? (Number(q[1]) as 1 | 2 | 3 | 4) : null;
      out.deductorName = at(19);
      out.deductorType = at(32);
      if (!out.taxYear) err(line, `${out.regime === 'IT_ACT_1961' ? 'Financial' : 'Tax'} year "${ty}" is not in the YYYYYY form, e.g. 202627.`);
      else if (out.regime === 'IT_ACT_1961' && out.taxYear >= 2026) err(line, `Form ${out.form} covers periods up to March 2026. From Tax Year 2026-27 the 2025 Act forms apply.`);
      else if (out.regime === 'IT_ACT_2025' && out.taxYear < 2026) warn(line, `Form ${out.form} applies from Tax Year 2026-27; earlier periods use the 1961 Act forms.`);
      if (!out.quarter) err(line, `Period "${at(18)}" should be Q1 to Q4.`);
      return;
    }

    if (type === 'CD' && legacy) {
      const date = isoFromDdmmyyyy(at(18));
      const nums = [at(22), at(23), at(24), at(25), at(26), at(27), at(39)].map(amount);
      if (nums.some((n) => n === null)) err(line, 'A challan amount is not a number.');
      if (!date) err(line, `Challan date "${at(18)}" is not a valid ddmmyyyy date.`);
      const mode = at(37) === 'Y' ? 'BOOK_ADJUSTMENT' : 'CHALLAN';
      const nil = at(6) === 'Y';
      const bsr = at(16);
      if (!nil && !/^\d{7}$/.test(bsr)) err(line, `BSR code or Form 24G receipt number "${bsr}" should be 7 digits.`);
      const tax = [nums[0], nums[1], nums[2]].reduce((t: Decimal, v) => t.add(v ?? 0), new Decimal(0));
      if (at(21)) challanSection.set(Number(at(4)), at(21).toUpperCase());
      out.challans.push({
        recordNo: Number(at(4)),
        deducteeCount: Number(at(5)) || 0,
        nil,
        totalTax: tax.toFixed(2),
        interest: nums[3] ?? '0.00',
        fee: nums[6] ?? '0.00',
        others: nums[4] ?? '0.00',
        totalDeposit: nums[5] ?? '0.00',
        mode,
        bsrCode: bsr,
        challanNo: mode === 'CHALLAN' ? at(12) : at(14),
        depositDate: date ?? '',
        minorHead: at(40),
      });
      return;
    }

    if (type === 'CD') {
      const date = isoFromDdmmyyyy(at(19));
      const nums = [at(8), at(9), at(10), at(11), at(12)].map(amount);
      if (nums.some((n) => n === null)) err(line, 'A challan amount is not a number.');
      if (!date) err(line, `Challan date "${at(19)}" is not a valid ddmmyyyy date.`);
      const mode = at(13) === 'B' ? 'BOOK_ADJUSTMENT' : 'CHALLAN';
      const bsr = at(15);
      if (mode === 'CHALLAN' && !/^\d{7}$/.test(bsr)) err(line, `BSR code "${bsr}" should be 7 digits.`);
      out.challans.push({
        recordNo: Number(at(4)),
        deducteeCount: Number(at(5)) || 0,
        nil: at(6) === 'Y',
        totalTax: nums[0] ?? '0.00',
        interest: nums[1] ?? '0.00',
        fee: nums[2] ?? '0.00',
        others: nums[3] ?? '0.00',
        totalDeposit: nums[4] ?? '0.00',
        mode,
        bsrCode: bsr,
        challanNo: at(17),
        depositDate: date ?? '',
        minorHead: at(23),
      });
      return;
    }

    if (legacy) {
      const pan = at(10).toUpperCase();
      if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err(line, `Deductee PAN "${pan}" is not valid.`);
      const section = (at(33) || challanSection.get(Number(at(4))) || '').toUpperCase();
      const known = LEGACY_SECTION_CODES[out.form as keyof typeof LEGACY_SECTION_CODES].has(section);
      if (!known) warn(line, `Section code "${section}" is not in the Form ${out.form} code list.`);
      const paymentDate = isoFromDdmmyyyy(at(23));
      if (!paymentDate) err(line, `Payment date "${at(23)}" is not a valid ddmmyyyy date.`);
      const amounts = [at(22), at(17), at(19)].map(amount);
      if (amounts.some((a) => a === null)) err(line, 'A deductee amount is not a number.');
      const is27Q = out.form === '27Q';
      const is27EQ = out.form === '27EQ';
      out.deductees.push({
        recordNo: Number(at(5)),
        challanRecordNo: Number(at(4)),
        pan,
        name: at(13),
        sectionCode: section,
        sectionKnown: known,
        paymentDate: paymentDate ?? '',
        amountPaid: amounts[0] ?? '0.00',
        taxDeducted: amounts[1] ?? '0.00',
        taxDeposited: amounts[2] ?? '0.00',
        deductionDate: isoFromDdmmyyyy(at(24)) ?? '',
        rate: at(26),
        reasonCode: at(30),
        certificateNo: at(34),
        statusCode: '',
        optingOut: (is27Q || is27EQ) && at(49) === 'Y',
        remittanceNature: is27Q ? at(36) : '',
        countryCode: is27Q ? at(38) : '',
        grossedUp: is27Q && at(27) === 'Y',
        rateBasis: is27Q ? at(35) : '',
        form15caAck: is27Q ? at(37) : '',
        form121Uin: '',
        residenceAddress: is27Q ? at(41) : '',
        residenceEmail: is27Q ? at(39) : '',
        residenceContact: is27Q ? at(40) : '',
        residenceTaxId: is27Q ? at(42) : '',
        nonResident: is27EQ && at(31) === 'Y',
        permanentEstablishment: is27EQ && at(32) ? at(32) === 'Y' : null,
      });
      return;
    }

    // DD (2025 Act)
    const pan = at(8).toUpperCase();
    if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err(line, `Deductee PAN "${pan}" is not valid.`);
    const section = at(15);
    const known =
      out.form === '138' ? section in FORM_138_SECTION_CODES
      : out.form === '144' ? section in FORM_144_SECTION_CODES
      : out.form === '143' ? section in FORM_143_COLLECTION_CODES
      : Boolean(form140Section(section));
    if (!known) warn(line, `Section code "${section}" is not in the Form ${out.form} code list.`);
    const paymentDate = isoFromDdmmyyyy(at(19));
    const deductionDate = isoFromDdmmyyyy(at(27)) ?? '';
    if (!paymentDate) err(line, `Payment date "${at(19)}" is not a valid ddmmyyyy date.`);
    const amounts = [at(20), at(24), at(25)].map(amount);
    if (amounts.some((a) => a === null)) err(line, 'A deductee amount is not a number.');
    out.deductees.push({
      recordNo: Number(at(4)),
      challanRecordNo: Number(at(5)),
      pan,
      name: at(9),
      sectionCode: section,
      sectionKnown: known,
      paymentDate: paymentDate ?? '',
      amountPaid: amounts[0] ?? '0.00',
      taxDeducted: amounts[1] ?? '0.00',
      taxDeposited: amounts[2] ?? '0.00',
      deductionDate,
      rate: out.form === '138' ? '' : at(28),
      reasonCode: at(32),
      certificateNo: at(33),
      statusCode: out.form === '140' ? '' : at(12),
      optingOut: out.form !== '140' && at(14) === 'Y',
      remittanceNature: out.form === '144' ? at(16) : '',
      countryCode: out.form === '144' ? at(17) : '',
      grossedUp: out.form === '144' && at(21) === 'Y',
      rateBasis: out.form === '144' ? at(30) : '',
      form15caAck: out.form === '144' ? at(31) : '',
      form121Uin: out.form === '140' ? at(31) : '',
      residenceAddress: out.form === '144' ? at(37) : '',
      residenceEmail: out.form === '144' ? at(38) : '',
      residenceContact: out.form === '144' ? at(39) : '',
      residenceTaxId: out.form === '144' ? at(41) : '',
      nonResident: out.form === '143' && at(11) === 'Y',
      permanentEstablishment: out.form === '143' && at(13) ? at(13) === 'Y' : null,
    });
  });

  if (!out.form) err(0, 'No batch header (BH) record was found.');
  if (out.tan && !TAN_RE.test(out.tan)) err(1, `TAN "${out.tan}" is not valid.`);

  // Every deductee must point at a challan in the file, and challan counts must agree.
  const byChallan = new Map<number, number>();
  for (const d of out.deductees) byChallan.set(d.challanRecordNo, (byChallan.get(d.challanRecordNo) ?? 0) + 1);
  const challanNos = new Set(out.challans.map((c) => c.recordNo));
  for (const [ref, n] of byChallan) if (!challanNos.has(ref)) err(0, `${n} deductee row(s) point to challan ${ref}, which is not in the file.`);
  for (const c of out.challans) {
    const n = byChallan.get(c.recordNo) ?? 0;
    if (n !== c.deducteeCount) warn(0, `Challan ${c.recordNo} says ${c.deducteeCount} deductee(s) but the file has ${n}.`);
  }
  return out;
}

export interface PayeeSummary {
  pan: string;
  name: string;
  sections: string[];
  payments: number;
  amountPaid: string;
  taxDeducted: string;
}

/** Payee master from one or more statements: one line per PAN (no-PAN entries kept per name). */
export function payeesFromStatements(statements: ParsedStatement[]): PayeeSummary[] {
  const map = new Map<string, { pan: string; name: string; sections: Set<string>; payments: number; paid: Decimal; tax: Decimal }>();
  for (const s of statements) {
    for (const d of s.deductees) {
      const key = PAN_LITERALS.has(d.pan) ? `${d.pan}:${d.name.toLowerCase()}` : d.pan;
      const cur = map.get(key) ?? { pan: d.pan, name: d.name, sections: new Set<string>(), payments: 0, paid: new Decimal(0), tax: new Decimal(0) };
      cur.sections.add(d.sectionCode);
      cur.payments += 1;
      cur.paid = cur.paid.add(d.amountPaid);
      cur.tax = cur.tax.add(d.taxDeducted);
      map.set(key, cur);
    }
  }
  return [...map.values()]
    .map((v) => ({ pan: v.pan, name: v.name, sections: [...v.sections].sort(), payments: v.payments, amountPaid: v.paid.toFixed(2), taxDeducted: v.tax.toFixed(2) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

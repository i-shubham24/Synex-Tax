import Decimal from 'decimal.js';
import { form140Section } from './form140Codes.js';

/**
 * Reader for Protean e-TDS statement text files ("^" delimited, one record per line), Form 140
 * (non-salary TDS, residents, Income-tax Act 2025) regular statements, file format version 1.x.
 *
 * Field positions follow Protean's "File Format for Non-Salary TDS File - Form Number 140 (26Q)
 * - Q1 to Q4" (1-based "Sr. No." in the spreadsheet). Statements in the 1961 Act formats (24Q,
 * 26Q, 27Q, 27EQ) use different layouts and are rejected here rather than guessed.
 */

export const RECORD_FIELD_COUNT = { FH: 18, BH: 72, CD: 30, DD: 45 } as const;

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
}

export interface ParsedStatement {
  form: string;
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
  const out: ParsedStatement = {
    form: '',
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
    const expected = RECORD_FIELD_COUNT[type as keyof typeof RECORD_FIELD_COUNT];
    if (!expected) {
      if (type === 'SD' || type === 'S16') err(line, 'Salary detail records belong to Form 138; this reader handles Form 140.');
      else err(line, `Unknown record type "${type ?? ''}".`);
      return;
    }
    if (f.length !== expected) {
      err(line, `${type} record has ${f.length} fields; the Form 140 format has ${expected}.`);
      return;
    }
    const at = (n: number) => (f[n - 1] ?? '').trim();

    if (type === 'FH') {
      if (line !== 1) err(line, 'The file header must be the first line.');
      out.fileCreated = isoFromDdmmyyyy(at(5)) ?? '';
      out.tan = at(8).toUpperCase();
      out.preparedWith = at(10);
      if (at(3) !== 'NS1') warn(line, `File type "${at(3)}" is not NS1.`);
      if (at(4) !== 'R') err(line, 'Only regular statements (upload type R) can be imported; this looks like a correction.');
      return;
    }

    if (type === 'BH') {
      out.form = at(5);
      if (out.form !== '140') {
        err(line, `This is a Form ${out.form || '?'} statement. Only Form 140 (2025 Act) files can be imported for now.`);
        return;
      }
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
      if (!out.taxYear) err(line, `Tax year "${ty}" is not in the YYYYYY form, e.g. 202627.`);
      if (!out.quarter) err(line, `Period "${at(18)}" should be Q1 to Q4.`);
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

    // DD
    const pan = at(8).toUpperCase();
    if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err(line, `Deductee PAN "${pan}" is not valid.`);
    const section = at(15);
    const known = Boolean(form140Section(section));
    if (!known) warn(line, `Section code "${section}" is not in the Form 140 code list.`);
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
      rate: at(28),
      reasonCode: at(32),
      certificateNo: at(33),
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

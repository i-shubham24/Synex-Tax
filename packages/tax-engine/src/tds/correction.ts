import Decimal from 'decimal.js';
import { RECORD_FIELD_COUNT } from './etdsStatement.js';
import { formHasSection, type StatementForm } from './statementWriter.js';
import {
  DEDUCTOR_TYPES,
  GOVERNMENT_DEDUCTOR_TYPES,
  MINISTRY_CODES,
  MINISTRY_OPTIONAL_TYPES,
  MINISTRY_REQUIRED_TYPES,
  PROTEAN_STATE_CODES,
  STATE_GOVERNMENT_TYPES,
} from './form140Annexures.js';

/**
 * TDS correction statements for Forms 138 (Q1 to Q3), 140, 143 and 144, Tax Year 2026-27 onwards,
 * per Protean's correction file formats version 1.2 (files dated 04 Aug 2026).
 *
 * The starting point is the consolidated file the deductor downloads from TRACES. The formats say
 * deductee field 6 of the consolidated file carries the mode, so it is read here with the same record
 * layout (FH 18, BH 72, CD 30, DD 45 fields). Its exact contents are not published; the reader
 * reports anything it cannot place instead of guessing.
 *
 * One correction type is written per file, since the format allows one batch header per file:
 * C5 for a PAN change, C1 for deductor details in the batch header, C2 for challan details alone,
 * C3 for changes to payee rows (with their challan, and replacing PANNOTAVBL, PANAPPLIED or
 * PANINVALID), C9 for adding challans. File one, wait for its token, then prepare the next from a
 * fresh consolidated file.
 *
 * Every field follows the "REMARKS FOR CORRECTION" columns of the Protean spreadsheets for Forms
 * 138, 140, 143 and 144 (version 1.2). The spec titles C2 "deductor and/or challan" and C3
 * "deductor and/or challan and/or deductee", so deductor changes ride in a C2 or C3 batch (Batch
 * Updation Indicator 1) when that type is chosen. docs/product/protean-correction-check.md has the
 * field by field comparison.
 */

export type CorrectionType = 'C1' | 'C2' | 'C3' | 'C5' | 'C9';

export interface PartyAddress {
  line1: string;
  line2: string;
  line3: string;
  line4: string;
  district: string;
  stateCode: string;
  pin: string;
}

/** Deductor and responsible person as the consolidated file's batch header carries them. */
export interface ConsoDeductor {
  name: string;
  pan: string;
  address: PartyAddress;
  email: string;
  phoneCountryCode: string;
  phone: string;
  type: string;
  gstin: string;
  responsible: { name: string; designation: string; pan: string; address: PartyAddress; email: string; phoneCountryCode: string; phone: string };
  government: { stateCode: string; ministryCode: string; ministryOther: string; ain: string };
}

/** C1: only the fields given are changed; the rest are carried from the consolidated file. */
export interface DeductorEdit {
  name?: string;
  address?: Partial<PartyAddress>;
  email?: string;
  phoneCountryCode?: string;
  phone?: string;
  type?: string;
  gstin?: string;
  responsible?: { name?: string; designation?: string; pan?: string; address?: Partial<PartyAddress>; email?: string; phoneCountryCode?: string; phone?: string };
  government?: Partial<ConsoDeductor['government']>;
}

/** Batch header positions (0-based, field number minus one) of the C1 fields. */
const ADDRESS_KEYS = ['line1', 'line2', 'line3', 'line4', 'district', 'stateCode', 'pin'] as const;
const BH_DEDUCTOR: Array<[path: string, at: number, label: string]> = [
  ['name', 18, 'Deductor name'],
  ...ADDRESS_KEYS.map((k, i) => [`address.${k}`, 20 + i, `Deductor address ${k}`] as [string, number, string]),
  ['email', 27, 'Deductor email'],
  ['phoneCountryCode', 28, 'Deductor phone code'],
  ['phone', 29, 'Deductor phone'],
  ['type', 31, 'Deductor type'],
  ['responsible.name', 32, 'Responsible person name'],
  ['responsible.designation', 33, 'Responsible person designation'],
  ...ADDRESS_KEYS.map((k, i) => [`responsible.address.${k}`, 34 + i, `Responsible person address ${k}`] as [string, number, string]),
  ['responsible.email', 41, 'Responsible person email'],
  ['responsible.phoneCountryCode', 43, 'Responsible person phone code'],
  ['responsible.phone', 44, 'Responsible person phone'],
  ['government.stateCode', 53, 'State (government deductor)'],
  ['government.ministryCode', 56, 'Ministry'],
  ['government.ministryOther', 57, 'Ministry name (others)'],
  ['responsible.pan', 58, 'Responsible person PAN'],
  ['government.ain', 67, 'AIN'],
  ['gstin', 68, 'Deductor GSTIN'],
];
const getPath = (o: unknown, path: string): string | undefined => {
  let v: unknown = o;
  for (const k of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
  return v === undefined || v === null ? undefined : String(v);
};
const setPath = (o: Record<string, unknown>, path: string, value: string) => {
  const keys = path.split('.');
  let t = o;
  for (const k of keys.slice(0, -1)) t = (t[k] ??= {}) as Record<string, unknown>;
  t[keys[keys.length - 1]] = value;
};

export interface ConsoDeductee {
  recordNo: number;
  challanNo: number;
  mode: string;
  pan: string;
  name: string;
  section: string;
  paidOn: string;
  amount: string;
  deducted: string;
  deposited: string;
  deductedOn: string;
  rate: string;
  reason: string;
  certificate: string;
  raw: string[];
}

export interface ConsoChallan {
  recordNo: number;
  nil: boolean;
  mode: string;
  bsr: string;
  challanNo: string;
  date: string;
  tax: string;
  interest: string;
  fee: string;
  others: string;
  total: string;
  minorHead: string;
  deductees: ConsoDeductee[];
  raw: string[];
}

export interface ConsoStatement {
  form: StatementForm | null;
  tan: string;
  deductorName: string;
  taxYear: number | null;
  quarter: number | null;
  originalToken: string;
  previousToken: string;
  challans: ConsoChallan[];
  issues: string[];
  bh: string[];
  deductor: ConsoDeductor;
  /** File header of the consolidated file; field 18 carries its hash. */
  fh?: string[];
}

export interface DeducteeEdit {
  challanNo: number;
  recordNo: number;
  pan?: string;
  name?: string;
  section?: string;
  paidOn?: string;
  amount?: string;
  deducted?: string;
  deposited?: string;
  deductedOn?: string;
  rate?: string;
  reason?: string;
  certificate?: string;
}

export interface NewDeductee {
  pan: string;
  name: string;
  section: string;
  paidOn: string;
  amount: string;
  deducted: string;
  deposited?: string;
  deductedOn?: string;
  rate?: string;
  reason?: string;
  certificate?: string;
  form121Uin?: string;
}

export interface ChallanEdit {
  recordNo: number;
  bsr?: string;
  challanNo?: string;
  date?: string;
  tax?: string;
  interest?: string;
  fee?: string;
  others?: string;
  minorHead?: string;
}

export interface NewChallan {
  nil?: boolean;
  mode?: 'C' | 'B';
  bsr: string;
  challanNo: string;
  date: string;
  tax: string;
  interest?: string;
  fee?: string;
  others?: string;
  minorHead?: string;
  deductees: NewDeductee[];
}

export interface CorrectionEdits {
  deductor?: DeductorEdit;
  deductees?: DeducteeEdit[];
  added?: (NewDeductee & { challanNo: number })[];
  challans?: ChallanEdit[];
  newChallans?: NewChallan[];
}

export interface CorrectionOptions {
  type?: CorrectionType;
  fileCreated: string; // YYYY-MM-DD
  fileSequence?: number;
  preparedWith?: string;
  originalToken?: string;
  previousToken?: string;
}

export interface CorrectionIssue {
  where: string;
  message: string;
}

const FILE_TYPE: Record<StatementForm, string> = { '138': 'SL1', '140': 'NS1', '144': 'NS1', '143': 'TC1' };
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const PAN_LITERALS = new Set(['PANNOTAVBL', 'PANAPPLIED', 'PANINVALID']);
const TOKEN_RE = /^\d{15}$/;
const D = (v: string | undefined) => new Decimal(v && v.trim() ? v.trim() : 0);
const money = (v: string | undefined) => D(v).toFixed(2);
const clean = (v: unknown) => String(v ?? '').replace(/[\^\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const isIso = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const toDdmmyyyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
const fromDdmmyyyy = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(4, 8)}-${v.slice(2, 4)}-${v.slice(0, 2)}` : '');
const blank = (n: number) => Array<string>(n).fill('');
const pick = (...v: (string | undefined)[]) => v.find((x) => x && x.trim())?.trim() ?? '';
const EMAIL_RE = /^[^\s@^]+@[^\s@^]+\.[^\s@^]+$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATE_CODES = new Set(Object.values(PROTEAN_STATE_CODES));
const same = (a: string | undefined, b: string | undefined) => clean(a).toUpperCase() === clean(b).toUpperCase();

/**
 * Deductee / collectee fields (1-based) the spec says must be blank, per form, for rows in a C3
 * (modes U, F and A) and a C9 (mode O). Built from the "No value should be specified" remarks.
 */
const DD_BLANK: Record<'C3' | 'C9', Record<StatementForm, number[]>> = {
  C3: {
    '138': [10, 11, 12, 13, 14, 16, 17, 21, 22, 23, 28, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45],
    '140': [10, 11, 12, 13, 14, 16, 17, 21, 29, 30, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45],
    '143': [10, 16, 17, 21, 22, 23, 28, 29, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45],
    '144': [10, 11, 13, 29, 34, 35, 36, 40, 43, 44, 45],
  },
  C9: {
    '138': [7, 10, 11, 12, 13, 14, 16, 17, 18, 21, 22, 23, 26, 28, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
    '140': [7, 10, 11, 12, 13, 14, 16, 17, 18, 21, 22, 23, 26, 29, 30, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
    '143': [7, 10, 11, 13, 14, 16, 17, 18, 21, 22, 23, 26, 28, 29, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
    '144': [7, 10, 11, 13, 14, 18, 22, 23, 26, 29, 30, 34, 35, 36, 40, 42, 43, 44, 45],
  },
};
const blankFields = (f: string[], nums: number[]) => {
  for (const n of nums) f[n - 1] = '';
};
/** DD field 28 (rate): only Forms 140 and 144 carry it; these codes take a zero rate. */
const RATE_ZERO: Partial<Record<StatementForm, Set<string>>> = {
  '140': new Set(['1059', '1034', '1038', '1061']),
  '144': new Set(['1059', '1061']),
};
const hasRate = (form: StatementForm) => form === '140' || form === '144';

function readDeductor(bh: string[]): ConsoDeductor {
  const d: Record<string, unknown> = {};
  for (const [path, at] of BH_DEDUCTOR) setPath(d, path, bh[at] ?? '');
  setPath(d, 'pan', bh[14] ?? '');
  return d as unknown as ConsoDeductor;
}

/** Reads a TRACES consolidated file (or any statement in the correction layout). */
export function parseConsoFile(text: string): ConsoStatement {
  const issues: string[] = [];
  const out: ConsoStatement = { form: null, tan: '', deductorName: '', taxYear: null, quarter: null, originalToken: '', previousToken: '', challans: [], issues, bh: [], deductor: readDeductor([]) };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  let current: ConsoChallan | null = null;
  lines.forEach((line, i) => {
    const f = line.split('^').map((x) => x.trim());
    const type = f[1];
    const want = (RECORD_FIELD_COUNT as Record<string, number>)[type];
    if (!want) {
      issues.push(`Line ${i + 1}: record type "${type ?? ''}" is not FH, BH, CD or DD; skipped.`);
      return;
    }
    if (f.length !== want) issues.push(`Line ${i + 1}: ${type} has ${f.length} fields, the format has ${want}.`);
    while (f.length < want) f.push('');
    if (type === 'FH') {
      out.fh = f.slice(0, want);
    } else if (type === 'BH') {
      out.bh = f.slice(0, want);
      const form = f[4];
      out.form = (['138', '140', '143', '144'] as const).find((x) => x === form) ?? null;
      if (!out.form) issues.push(`Form "${form}" is not 138, 140, 143 or 144 (Tax Year 2026-27 onwards).`);
      out.tan = pick(f[12], f[11]).toUpperCase();
      out.deductorName = f[18];
      out.taxYear = /^\d{6}$/.test(f[16]) ? Number(f[16].slice(0, 4)) : null;
      out.quarter = /^Q[1-4]$/.test(f[17]) ? Number(f[17][1]) : null;
      out.originalToken = f[7];
      out.previousToken = pick(f[8], f[7]);
      out.deductor = readDeductor(out.bh);
    } else if (type === 'CD') {
      current = {
        recordNo: Number(f[3]),
        nil: f[5] === 'Y',
        mode: f[12],
        bsr: pick(f[14], f[13]),
        challanNo: pick(f[16], f[15]),
        date: fromDdmmyyyy(pick(f[18], f[17])),
        tax: money(f[7]),
        interest: money(f[8]),
        fee: money(f[9]),
        others: money(f[10]),
        total: money(pick(f[11], f[19])),
        minorHead: f[22],
        deductees: [],
        raw: f.slice(0, want),
      };
      out.challans.push(current);
    } else if (type === 'DD') {
      const challanNo = Number(f[4]);
      const ch = out.challans.find((c) => c.recordNo === challanNo) ?? current;
      if (!ch) {
        issues.push(`Line ${i + 1}: a payee row comes before any challan.`);
        return;
      }
      ch.deductees.push({
        recordNo: Number(f[3]),
        challanNo: ch.recordNo,
        mode: f[5],
        pan: pick(f[7], f[6]).toUpperCase(),
        name: f[8],
        section: f[14],
        paidOn: fromDdmmyyyy(f[18]),
        amount: money(f[19]),
        deducted: money(pick(f[23], f[25])),
        deposited: money(pick(f[24], f[41])),
        deductedOn: fromDdmmyyyy(f[26]),
        rate: f[27],
        reason: f[31],
        certificate: f[32],
        raw: f.slice(0, want),
      });
    }
  });
  if (!out.bh.length) issues.push('No batch header (BH) found.');
  if (!out.challans.length) issues.push('No challans (CD) found.');
  return out;
}

/** Which correction types a set of edits needs, in the order they should be filed. */
export function correctionTypesNeeded(conso: ConsoStatement, edits: CorrectionEdits): CorrectionType[] {
  const types = new Set<CorrectionType>();
  for (const e of edits.deductees ?? []) {
    const row = findRow(conso, e.challanNo, e.recordNo);
    if (!row) continue;
    const { pan5, other } = classify(row, e);
    if (pan5) types.add('C5');
    if (other) types.add('C3');
  }
  if ((edits.added ?? []).length) types.add('C3');
  const withPayees = challansWithPayeeChanges(conso, edits);
  for (const ce of edits.challans ?? []) {
    const ch = conso.challans.find((c) => c.recordNo === ce.recordNo);
    if (!ch) types.add('C3'); // reported as not in the file when written
    else if (challanChanges(ch, ce).length) types.add(withPayees.has(ce.recordNo) ? 'C3' : 'C2');
  }
  if (deductorChanges(conso, edits.deductor).length) types.add('C1');
  if ((edits.newChallans ?? []).length) types.add('C9');
  return (['C5', 'C1', 'C2', 'C3', 'C9'] as const).filter((t) => types.has(t));
}

/** Challans whose payee rows change in a C3 (edits other than a C5 PAN change, or rows added). */
function challansWithPayeeChanges(conso: ConsoStatement, edits: CorrectionEdits): Set<number> {
  const out = new Set<number>((edits.added ?? []).map((a) => a.challanNo));
  for (const e of edits.deductees ?? []) {
    const row = findRow(conso, e.challanNo, e.recordNo);
    if (row && classify(row, e).other) out.add(e.challanNo);
  }
  return out;
}

/** Which challan fields an edit really changes. */
export function challanChanges(ch: ConsoChallan, ce: ChallanEdit): string[] {
  const out: string[] = [];
  for (const k of ['tax', 'interest', 'fee', 'others'] as const) if (ce[k] !== undefined && ce[k] !== '' && !D(ce[k]).eq(D(ch[k]))) out.push(k);
  for (const k of ['bsr', 'challanNo', 'date', 'minorHead'] as const) if (ce[k] !== undefined && ce[k] !== '' && !same(ce[k], ch[k])) out.push(k);
  return out;
}

/** C1: the batch header fields an edit really changes, with the old and new values. */
export function deductorChanges(conso: ConsoStatement, edit: DeductorEdit | undefined): { path: string; label: string; from: string; to: string }[] {
  if (!edit) return [];
  const out: { path: string; label: string; from: string; to: string }[] = [];
  for (const [path, at, label] of BH_DEDUCTOR) {
    const v = getPath(edit, path);
    if (v === undefined) continue;
    const from = conso.bh[at] ?? '';
    if (!same(v, from)) out.push({ path, label, from, to: clean(v) });
  }
  return out;
}

function findRow(conso: ConsoStatement, challanNo: number, recordNo: number) {
  return conso.challans.find((c) => c.recordNo === challanNo)?.deductees.find((d) => d.recordNo === recordNo);
}

/** A PAN change from one real PAN to another is C5; replacing a placeholder PAN is part of C3. */
function classify(row: ConsoDeductee, e: DeducteeEdit) {
  const newPan = e.pan ? clean(e.pan).toUpperCase() : row.pan;
  const panChanged = newPan !== row.pan;
  const placeholder = PAN_LITERALS.has(row.pan) || !PAN_RE.test(row.pan);
  const otherChanged = (['name', 'section', 'paidOn', 'amount', 'deducted', 'deposited', 'deductedOn', 'rate', 'reason', 'certificate'] as const).some((k) => {
    const v = e[k];
    if (v === undefined) return false;
    if (['amount', 'deducted', 'deposited'].includes(k)) return !D(v).eq(D(row[k]));
    if (k === 'rate') return v.trim() !== '' && !D(v).eq(D(row.rate));
    return clean(v).toUpperCase() !== clean(row[k]).toUpperCase();
  });
  return { pan5: panChanged && !placeholder, other: otherChanged || (panChanged && placeholder) };
}

export function writeCorrection(conso: ConsoStatement, edits: CorrectionEdits, opts: CorrectionOptions): { type: CorrectionType | null; text: string; issues: CorrectionIssue[]; pending: CorrectionType[] } {
  const issues: CorrectionIssue[] = [];
  const err = (where: string, message: string) => issues.push({ where, message });
  const needed = correctionTypesNeeded(conso, edits);
  const type = opts.type ?? needed[0] ?? null;
  // Challan changes alone go in C2; choosing C3 carries them with an unchanged payee row instead.
  const explicitC3 = opts.type === 'C3';
  const withPayees = challansWithPayeeChanges(conso, edits);
  const changedChallans = (edits.challans ?? []).filter((ce) => {
    const ch = conso.challans.find((c) => c.recordNo === ce.recordNo);
    return !ch || challanChanges(ch, ce).length > 0;
  });
  const c3Challans = changedChallans.filter((ce) => explicitC3 || withPayees.has(ce.recordNo) || !conso.challans.some((c) => c.recordNo === ce.recordNo));
  const c2Challans = changedChallans.filter((ce) => !withPayees.has(ce.recordNo) && conso.challans.some((c) => c.recordNo === ce.recordNo));
  // BH field 7 (C2, C3): deductor changes go in the same batch with Batch Updation Indicator 1.
  const foldDeductor = (type === 'C2' || type === 'C3') && deductorChanges(conso, edits.deductor).length > 0;
  const pending = needed.filter((t) => t !== type && !(explicitC3 && t === 'C2') && !(foldDeductor && t === 'C1'));
  if (!type) return { type: null, text: '', issues: [{ where: 'Statement', message: 'Nothing has changed, so there is nothing to correct.' }], pending };
  if (!needed.includes(type) && !(explicitC3 && c3Challans.length)) err('Statement', `None of the changes needs a ${type} correction.`);
  const form = conso.form;
  if (!form) return { type, text: '', issues: [{ where: 'Statement', message: 'The file is not a Form 138, 140, 143 or 144 statement.' }], pending };
  if (form === '138' && conso.quarter === 4) err('Statement', 'Protean has not released the Form 138 fourth quarter correction format yet.');
  const original = clean(opts.originalToken ?? conso.originalToken);
  const previous = clean(opts.previousToken ?? conso.previousToken);
  if (!TOKEN_RE.test(original)) err('Statement', 'Token number of the regular statement must be 15 digits.');
  if (!TOKEN_RE.test(previous)) err('Statement', 'Token number of the last statement filed (regular or correction) must be 15 digits.');
  if (!isIso(opts.fileCreated)) err('Statement', 'File date is missing.');
  const payee = form === '143' ? 'collectee' : form === '138' ? 'employee' : 'deductee';
  const qStart = conso.taxYear && conso.quarter ? [`${conso.taxYear}-04-01`, `${conso.taxYear}-07-01`, `${conso.taxYear}-10-01`, `${conso.taxYear + 1}-01-01`][conso.quarter - 1] : '';
  const qEnd = conso.taxYear && conso.quarter ? [`${conso.taxYear}-06-30`, `${conso.taxYear}-09-30`, `${conso.taxYear}-12-31`, `${conso.taxYear + 1}-03-31`][conso.quarter - 1] : '';
  /** DD field 28: rate with 4 decimals on Forms 140 and 144, zero for no tax or the listed codes. */
  const rateFor = (section: string, ded: Decimal, rate: string | undefined) =>
    ded.isZero() || RATE_ZERO[form]?.has(clean(section)) ? '0.0000' : D(rate).toFixed(4);

  // Payee edits grouped by challan, for the chosen type.
  const byChallan = new Map<number, { row: ConsoDeductee; e: DeducteeEdit }[]>();
  if (type === 'C3' || type === 'C5') {
    for (const e of edits.deductees ?? []) {
      const row = findRow(conso, e.challanNo, e.recordNo);
      const where = `Challan ${e.challanNo}, ${payee} ${e.recordNo}`;
      if (!row) {
        err(where, 'Not in the consolidated file.');
        continue;
      }
      const { pan5, other } = classify(row, e);
      if ((type === 'C5' && pan5) || (type === 'C3' && other)) {
        if (pan5 && other) err(where, 'This row has a PAN change and other changes. File the PAN correction (C5) first, then the rest from a fresh consolidated file.');
        byChallan.set(e.challanNo, [...(byChallan.get(e.challanNo) ?? []), { row, e }]);
      }
    }
  }

  const records: string[][] = [];
  const challanBlocks: string[][][] = [];
  let batchTotal = new Decimal(0);
  const maxPayee = Math.max(0, ...conso.challans.flatMap((c) => c.deductees.map((d) => d.recordNo)));
  let nextPayee = maxPayee + 1;

  const ddForNew = (n: NewDeductee, challanRecord: number, mode: 'A' | 'O', where: string, challanDate: string) => {
    const pan = clean(n.pan).toUpperCase();
    const ded = D(n.deducted);
    const dep = n.deposited !== undefined && n.deposited !== '' ? D(n.deposited) : ded;
    if (form === '143' || form === '144') err(where, `Adding a ${payee} needs the Form ${form} details (status, codes and so on); add it in the regular statement screens instead.`);
    if (!PAN_RE.test(pan) && !PAN_LITERALS.has(pan)) err(where, 'PAN must be valid, or PANNOTAVBL / PANAPPLIED / PANINVALID.');
    if (!clean(n.name)) err(where, 'Name is required.');
    if (!formHasSection(form, clean(n.section))) err(where, `Code ${n.section || '(blank)'} is not in Annexure 2 of Form ${form}.`);
    if (!isIso(n.paidOn)) err(where, 'Date paid or credited is required.');
    if (!D(n.amount).gt(0)) err(where, 'Amount must be more than 0.00.');
    if (D(n.amount).lt(ded)) err(where, 'Amount cannot be less than the tax deducted.');
    // DD fields 24 and 25 (C3 mode A, C9): tax deducted must equal tax deposited, on every form.
    if (!ded.eq(dep)) err(where, 'Tax deducted must equal tax deposited.');
    if (ded.gt(0) && (!isIso(n.deductedOn) || (qStart && n.deductedOn < qStart))) err(where, `Date of deduction is required and cannot be before ${qStart}.`);
    if (clean(n.reason).toUpperCase() === 'A' && !/^[A-Z0-9]{10}([A-Z0-9]{5})?$/.test(clean(n.certificate).toUpperCase())) err(where, 'Reason A needs the section 395 certificate number.');
    const f = blank(RECORD_FIELD_COUNT.DD);
    f[1] = 'DD'; f[2] = '1'; f[3] = String(nextPayee++); f[4] = String(challanRecord); f[5] = mode;
    f[7] = pan; f[8] = clean(n.name).slice(0, 75); f[14] = clean(n.section);
    f[17] = dep.gte(ded) ? 'Y' : 'N';
    f[18] = isIso(n.paidOn) ? toDdmmyyyy(n.paidOn) : '';
    f[19] = money(n.amount); f[23] = ded.toFixed(2); f[24] = dep.toFixed(2);
    f[26] = ded.gt(0) && isIso(n.deductedOn) ? toDdmmyyyy(n.deductedOn) : '';
    f[31] = clean(n.reason).toUpperCase(); f[32] = clean(n.certificate).toUpperCase();
    // Form 138 DD field 29: date of deposit; in a C9 it is the challan date (CD field 19).
    if (form === '138') f[28] = isIso(challanDate) && (mode === 'O' || dep.gt(0)) ? toDdmmyyyy(challanDate) : '';
    if (hasRate(form)) f[27] = rateFor(n.section, ded, n.rate);
    if (form === '140') f[30] = clean(n.form121Uin).toUpperCase();
    // C9 DD field 18 (deposited Y/N) and the other fields listed in DD_BLANK stay blank.
    blankFields(f, DD_BLANK[mode === 'O' ? 'C9' : 'C3'][form]);
    return { f, ded, dep };
  };

  /** Challan record with its "last" values from the consolidated file. */
  const challanHeader = (ch: ConsoChallan, payeeRows: number) => {
    const cd = blank(RECORD_FIELD_COUNT.CD);
    // CD field 5: no value in a C2 (no payee rows go with it); the row count in a C3 or C5.
    cd[1] = 'CD'; cd[2] = '1'; cd[3] = String(ch.recordNo); cd[4] = type === 'C2' ? '' : String(payeeRows); cd[5] = ch.nil ? 'Y' : 'N';
    cd[12] = ch.nil ? '' : ch.mode;
    cd[13] = ch.nil ? '' : ch.bsr; cd[15] = ch.nil ? '' : ch.challanNo;
    cd[17] = isIso(ch.date) ? toDdmmyyyy(ch.date) : ''; cd[19] = ch.total;
    return cd;
  };

  /** Updated challan values (C2, and C3 with a challan change): indicator 1, current fields, new total. */
  const applyChallanEdit = (cd: string[], ch: ConsoChallan, ce: ChallanEdit, at: string) => {
    const v = { tax: ce.tax || ch.tax, interest: ce.interest || ch.interest, fee: ce.fee || ch.fee, others: ce.others || ch.others };
    for (const [k, x] of Object.entries(v)) if (!D(x).isInteger() || D(x).isNeg()) err(at, `${k[0].toUpperCase()}${k.slice(1)} must be in whole rupees.`);
    // CD field 7: Challan Updation Indicator is 1 in a C3 with a challan change; no value in a C2.
    cd[6] = type === 'C3' ? '1' : '';
    cd[7] = money(v.tax); cd[8] = money(v.interest); cd[9] = money(v.fee); cd[10] = money(v.others);
    const total = D(v.tax).add(D(v.interest)).add(D(v.fee)).add(D(v.others));
    cd[22] = ch.nil ? '' : clean(ce.minorHead || ch.minorHead);
    // CD fields 24 and 25 (interest and others allocation): C3 only; no value in a C2.
    if (type === 'C3') {
      cd[23] = money(v.interest); cd[24] = money(v.others);
    }
    const bsr = clean(ce.bsr || ch.bsr);
    const cno = clean(ce.challanNo || ch.challanNo);
    if (ch.nil && ((ce.bsr && !same(ce.bsr, ch.bsr)) || (ce.challanNo && !same(ce.challanNo, ch.challanNo)))) err(at, 'A nil challan has no BSR code or serial to correct.');
    if (!ch.nil && !/^\d{7}$/.test(bsr)) err(at, 'BSR code (or Form 24G receipt number) must be 7 digits.');
    if (!ch.nil && !/^\d{1,5}$/.test(cno)) err(at, 'Challan serial (or DDO serial) must be up to 5 digits.');
    if (ce.date && !isIso(ce.date)) err(at, 'Challan date is not a date.');
    if (ce.minorHead && !/^\d{3}$/.test(clean(ce.minorHead))) err(at, 'Minor head must be 3 digits.');
    cd[14] = ch.nil ? '' : bsr; cd[16] = ch.nil ? '' : cno;
    const date = ce.date || ch.date;
    cd[18] = isIso(date) ? toDdmmyyyy(date) : '';
    cd[11] = total.toFixed(2);
    return { total, tax: D(v.tax) };
  };

  if (type === 'C5' || type === 'C3') {
    const touched = new Set<number>([...byChallan.keys()]);
    if (type === 'C3') {
      for (const c of c3Challans) touched.add(c.recordNo);
      for (const a of edits.added ?? []) touched.add(a.challanNo);
    }
    for (const no of [...touched].sort((a, b) => a - b)) {
      const ch = conso.challans.find((c) => c.recordNo === no);
      const at = `Challan ${no}`;
      if (!ch) {
        err(at, 'Not in the consolidated file.');
        continue;
      }
      const rows: string[][] = [];
      let dDep = new Decimal(0);
      let dDed = new Decimal(0);
      for (const { row, e } of (byChallan.get(no) ?? []).sort((a, b) => a.row.recordNo - b.row.recordNo)) {
        const where = `${at}, ${payee} ${row.recordNo}`;
        const f = blank(RECORD_FIELD_COUNT.DD);
        if (type === 'C5') {
          const pan = clean(e.pan).toUpperCase();
          if (!PAN_RE.test(pan)) err(where, 'The new PAN must be a valid 10 character PAN.');
          f[1] = 'DD'; f[2] = '1'; f[3] = String(row.recordNo); f[4] = String(no);
          f[7] = pan; f[25] = row.deducted; f[41] = row.deposited;
          // Form 144 DD field 12 (status, Annexure 8) is also required in a C5.
          if (form === '144') f[11] = row.raw[11] ?? '';
        } else {
          row.raw.forEach((v, i) => (f[i] = v));
          f[2] = '1'; f[3] = String(row.recordNo); f[4] = String(no);
          f[5] = row.mode === 'F' ? 'F' : 'U';
          f[6] = row.pan; f[25] = row.deducted; f[41] = row.deposited;
          const pan = e.pan ? clean(e.pan).toUpperCase() : row.pan;
          if (pan !== row.pan && !PAN_RE.test(pan)) err(where, 'The new PAN must be a valid 10 character PAN.');
          f[7] = pan;
          if (e.name !== undefined) f[8] = clean(e.name).slice(0, 75);
          if (e.section !== undefined) {
            if (!formHasSection(form, clean(e.section))) err(where, `Code ${e.section} is not in Annexure 2 of Form ${form}.`);
            f[14] = clean(e.section);
          }
          if (e.paidOn !== undefined) f[18] = isIso(e.paidOn) ? toDdmmyyyy(e.paidOn) : (err(where, 'Date paid is not a date.'), f[18]);
          if (e.amount !== undefined) f[19] = money(e.amount);
          const ded = e.deducted !== undefined ? D(e.deducted) : D(row.deducted);
          const dep = e.deposited !== undefined ? D(e.deposited) : e.deducted !== undefined ? ded : D(row.deposited);
          if (row.reason === 'C' && (!ded.eq(D(row.deducted)) || (e.reason !== undefined && clean(e.reason).toUpperCase() !== 'C'))) {
            err(where, 'Rows filed with reason C (higher rate, no PAN): the tax deducted and the reason cannot be changed.');
          }
          // DD fields 24 and 25 (mode U): equal on every form, except rows with reason C (field 32).
          if (row.reason !== 'C' && !ded.eq(dep)) err(where, 'Tax deducted must equal tax deposited.');
          f[23] = ded.toFixed(2); f[24] = dep.toFixed(2);
          f[17] = dep.gte(ded) ? 'Y' : 'N';
          if (e.deductedOn !== undefined) f[26] = isIso(e.deductedOn) ? toDdmmyyyy(e.deductedOn) : '';
          if (ded.gt(0) && !f[26]) err(where, 'Date of deduction is required when tax is deducted.');
          if (ded.isZero()) f[26] = '';
          if (hasRate(form)) f[27] = rateFor(f[14], ded, e.rate ?? row.rate);
          if (e.reason !== undefined) f[31] = clean(e.reason).toUpperCase();
          if (e.certificate !== undefined) f[32] = clean(e.certificate).toUpperCase();
          if (f[31] === 'A' && !/^[A-Z0-9]{10}([A-Z0-9]{5})?$/.test(f[32])) err(where, 'Reason A needs the section 395 certificate number.');
          if (D(f[19]).lt(ded) && !D(f[19]).isZero()) err(where, 'Amount cannot be less than the tax deducted.');
          // Fields the consolidated file may carry but a C3 row must leave blank (remarks, fillers, hash).
          blankFields(f, DD_BLANK.C3[form]);
          dDep = dDep.add(dep.sub(D(row.deposited)));
          dDed = dDed.add(ded.sub(D(row.deducted)));
        }
        rows.push(f);
      }
      if (type === 'C3') {
        for (const a of (edits.added ?? []).filter((x) => x.challanNo === no)) {
          const r = ddForNew(a, no, 'A', `${at}, new ${payee} ${a.name || ''}`.trim(), ch.date);
          if (ch.raw.length && ch.deductees[0]) r.f[17] = r.f[17] || ch.deductees[0].raw[17];
          rows.push(r.f);
          dDep = dDep.add(r.dep);
          dDed = dDed.add(r.ded);
        }
      }
      const ce = type === 'C3' ? c3Challans.find((c) => c.recordNo === no) : undefined;
      // A challan correction needs at least one payee row; its first row goes in unchanged (mode U).
      if (ce && !rows.length && ch.deductees[0]) {
        const row = ch.deductees[0];
        const f = [...row.raw];
        f[2] = '1'; f[5] = row.mode === 'F' ? 'F' : 'U'; f[6] = row.pan; f[25] = row.deducted; f[41] = row.deposited;
        blankFields(f, DD_BLANK.C3[form]);
        rows.push(f);
      }
      const cd = challanHeader(ch, rows.length);
      if (type === 'C3') {
        let total = D(ch.total);
        if (ce) total = applyChallanEdit(cd, ch, ce, at).total;
        else {
          // CD field 7 is 0: fields 8 to 11 and 23 stay blank, 15, 17 and 19 repeat the last values
          // (14, 16, 18), field 12 is the challan total and 24 and 25 carry the allocations of 9 and 11.
          cd[6] = '0';
          cd[14] = cd[13]; cd[16] = cd[15]; cd[18] = cd[17];
          cd[11] = total.toFixed(2);
          cd[23] = ch.interest; cd[24] = ch.others;
        }
        cd[20] = dDep.toFixed(2); cd[21] = dDed.toFixed(2);
        batchTotal = batchTotal.add(total);
      }
      if (!rows.length) err(at, `A correction needs at least one ${payee} row under the challan.`);
      challanBlocks.push([cd, ...rows]);
    }
  } else if (type === 'C2') {
    // Challan details alone: no payee rows go with them.
    for (const ce of [...c2Challans].sort((a, b) => a.recordNo - b.recordNo)) {
      const ch = conso.challans.find((c) => c.recordNo === ce.recordNo)!;
      const at = `Challan ${ch.recordNo}`;
      const cd = challanHeader(ch, 0);
      const { total, tax } = applyChallanEdit(cd, ch, ce, at);
      const claimed = ch.deductees.reduce((s, d) => s.add(D(d.deposited)), new Decimal(0));
      if (!ch.nil && ch.mode !== 'B' && tax.lt(claimed)) err(at, `Tax in the challan (${tax.toFixed(2)}) would be less than the tax deposited for its ${ch.deductees.length} ${payee}s (${claimed.toFixed(2)}). Change those rows in a C3 correction first.`);
      batchTotal = batchTotal.add(total);
      challanBlocks.push([cd]);
    }
  } else if (type === 'C9') {
    // C9: new challans, numbered after the last one in the consolidated file.
    let nextChallan = Math.max(0, ...conso.challans.map((c) => c.recordNo)) + 1;
    for (const [i, nc] of (edits.newChallans ?? []).entries()) {
      const no = nextChallan++;
      const at = `New challan ${i + 1}`;
      const rows: string[][] = [];
      let sDep = new Decimal(0);
      let sDed = new Decimal(0);
      nc.deductees.forEach((n, j) => {
        const r = ddForNew(n, no, 'O', `${at}, ${payee} ${j + 1}`, nc.date);
        rows.push(r.f);
        sDep = sDep.add(r.dep);
        sDed = sDed.add(r.ded);
      });
      const nil = !!nc.nil;
      if (!nil && !/^\d{7}$/.test(clean(nc.bsr))) err(at, 'BSR code (or Form 24G receipt number) must be 7 digits.');
      if (!nil && !/^\d{1,5}$/.test(clean(nc.challanNo))) err(at, 'Challan serial must be up to 5 digits.');
      if (!isIso(nc.date)) err(at, 'Challan date is required.');
      // C9 CD field 19: a nil challan is dated the last day of the quarter.
      else if (nil && qEnd && nc.date !== qEnd) err(at, `A nil challan must be dated ${qEnd}, the last day of the quarter.`);
      for (const k of ['tax', 'interest', 'fee', 'others'] as const) if (!D(nc[k]).isInteger()) err(at, `${k} must be in whole rupees.`);
      const total = D(nc.tax).add(D(nc.interest)).add(D(nc.fee)).add(D(nc.others));
      if (!nil && sDep.gt(total)) err(at, `Tax deposited for the ${payee}s is more than the challan.`);
      const cd = blank(RECORD_FIELD_COUNT.CD);
      cd[1] = 'CD'; cd[2] = '1'; cd[3] = String(no); cd[4] = String(rows.length); cd[5] = nil ? 'Y' : 'N';
      cd[7] = money(nc.tax); cd[8] = money(nc.interest); cd[9] = money(nc.fee); cd[10] = money(nc.others); cd[11] = total.toFixed(2);
      cd[12] = nil ? '' : nc.mode ?? 'C';
      cd[14] = nil ? '' : clean(nc.bsr); cd[16] = nil ? '' : clean(nc.challanNo);
      cd[18] = isIso(nc.date) ? toDdmmyyyy(nc.date) : '';
      cd[20] = sDep.toFixed(2); cd[21] = sDed.toFixed(2);
      cd[22] = nil ? '' : clean(nc.minorHead || '200');
      cd[23] = money(nc.interest); cd[24] = money(nc.others);
      batchTotal = batchTotal.add(total);
      challanBlocks.push([cd, ...rows]);
    }
  }
  if (type !== 'C1' && !challanBlocks.length) err('Statement', `Nothing to write in a ${type} correction.`);

  const src = conso.bh;
  const fh = blank(RECORD_FIELD_COUNT.FH);
  fh[1] = 'FH'; fh[2] = FILE_TYPE[form]; fh[3] = 'C'; fh[4] = isIso(opts.fileCreated) ? toDdmmyyyy(opts.fileCreated) : '';
  fh[5] = String(opts.fileSequence ?? 1); fh[6] = 'D'; fh[7] = conso.tan; fh[8] = '1'; fh[9] = clean(opts.preparedWith ?? 'SynexTax').slice(0, 75);
  // FH field 18: Forms 138 and 144 carry the consolidated file's hash; 140 and 143 leave it blank.
  if (form === '138' || form === '144') {
    fh[17] = clean(conso.fh?.[17]);
    if (!fh[17]) err('Statement', `Form ${form} corrections must carry the consolidated file hash (file header field 18), and the consolidated file has none.`);
  }
  const withDeductor = type === 'C1' || foldDeductor;
  const bh = withDeductor ? deductorHeader(conso, edits.deductor, err) : blank(RECORD_FIELD_COUNT.BH);
  // BH field 4: no value in a C1; the challan count otherwise.
  bh[1] = 'BH'; bh[2] = '1'; bh[3] = type === 'C1' ? '' : String(challanBlocks.length); bh[4] = form; bh[5] = type;
  // BH field 7: Batch Updation Indicator 1 or 0 in a C2 or C3; no value in a C1, C5 or C9.
  bh[6] = type === 'C2' || type === 'C3' ? (foldDeductor ? '1' : '0') : '';
  bh[7] = original; bh[8] = previous;
  // BH field 13: TAN, no value in a C5.
  bh[11] = conso.tan; bh[12] = type === 'C5' ? '' : conso.tan;
  bh[15] = src[15] ?? ''; bh[16] = src[16] ?? ''; bh[17] = src[17] ?? '';
  if (!withDeductor) {
    // Indicator 0, C5 and C9: only name (19), state (26), deductor type (32), responsible PAN (59)
    // and GSTIN (69) are given, as in the last statement.
    bh[18] = src[18] ?? ''; bh[25] = src[25] ?? ''; bh[31] = src[31] ?? '';
    bh[58] = src[58] ?? ''; bh[68] = src[68] ?? '';
  }
  // BH field 47: batch total in a C2, C3 and C9; no value in a C1 or C5.
  bh[46] = type === 'C1' || type === 'C5' ? '' : batchTotal.toFixed(2);
  if (!PAN_RE.test(bh[58])) err('Statement', 'PAN of the person responsible is missing from the consolidated file.');

  records.push(fh, bh);
  for (const b of challanBlocks) records.push(...b);
  const text = records.map((f, i) => ((f[0] = String(i + 1)), f.join('^'))).join('\r\n') + '\r\n';
  return { type, text: issues.length ? '' : text, issues, pending };
}

/**
 * Batch header with the deductor block (C1, or C2 and C3 with Batch Updation Indicator 1): the
 * block carried from the consolidated file with the changes applied, and the last deductor type.
 * Fields 31 and 46 are fillers (no value), as are 55, 56 and 60 to 67.
 */
function deductorHeader(conso: ConsoStatement, edit: DeductorEdit | undefined, err: (where: string, message: string) => void): string[] {
  const src = conso.bh;
  const bh = blank(RECORD_FIELD_COUNT.BH);
  // BH fields 15 to 30 (PAN, name, address, email, phone), 32 to 45 (type, responsible person),
  // 54 (state), 57 and 58 (ministry), 59 (responsible PAN), 68 (AIN) and 69 (GSTIN).
  const carried = [...Array.from({ length: 16 }, (_, i) => 15 + i), ...Array.from({ length: 14 }, (_, i) => 32 + i), 54, 57, 58, 59, 68, 69];
  for (const n of carried) bh[n - 1] = src[n - 1] ?? '';
  const changes = deductorChanges(conso, edit);
  if (!changes.length) err('Deductor', 'None of the deductor details has changed.');
  const upper = new Set(['email', 'type', 'gstin', 'responsible.email', 'responsible.pan', 'government.ain']);
  const at = new Map(BH_DEDUCTOR.map(([p, i]) => [p, i] as const));
  for (const c of changes) bh[at.get(c.path)!] = upper.has(c.path) ? c.to.toUpperCase() : c.to;
  const changed = new Set(changes.map((c) => c.path));
  const where = (p: string) => BH_DEDUCTOR.find(([x]) => x === p)?.[2] ?? p;

  for (const p of changed) {
    const v = bh[at.get(p)!];
    const w = where(p);
    if (p === 'name' || p === 'responsible.name') {
      if (!/[A-Za-z0-9]/.test(v)) err(w, 'Name is required.');
      if (v.length > 75) err(w, 'Name can be at most 75 characters.');
    } else if (/address\.(line\d|district)$/.test(p)) {
      if (p.endsWith('line1') && !/[A-Za-z0-9]/.test(v)) err(w, 'Address line 1 (flat, door or block) is required.');
      if (v.length > 25) err(w, 'Each address line can be at most 25 characters.');
    } else if (p.endsWith('address.stateCode')) {
      if (!STATE_CODES.has(v)) err(w, 'State must be a Protean state code from Annexure 1.');
    } else if (p.endsWith('address.pin')) {
      if (!/^[1-9]\d{5}$/.test(v)) err(w, 'PIN code must be 6 digits.');
    } else if (p === 'email' || p === 'responsible.email') {
      if (!EMAIL_RE.test(v) || v.length > 75) err(w, 'A valid email is required.');
    } else if (p.endsWith('phoneCountryCode')) {
      if (!/^\d{1,5}$/.test(v)) err(w, 'Phone code must be digits only.');
    } else if (p.endsWith('phone')) {
      if (!/^\d{10}$/.test(v)) err(w, 'Phone must be 10 digits without the country code.');
    } else if (p === 'responsible.designation') {
      if (!v || v.length > 20) err(w, 'Designation is required, at most 20 characters.');
    } else if (p === 'responsible.pan') {
      if (!PAN_RE.test(v)) err(w, 'A valid PAN of the responsible person is required.');
    } else if (p === 'gstin') {
      if (v && !GSTIN_RE.test(v)) err(w, 'GSTIN is not valid.');
    } else if (p === 'government.ministryOther') {
      if (v.length > 150) err(w, 'Ministry name can be at most 150 characters.');
    } else if (p === 'government.ain') {
      if (v && !/^[A-Z0-9]{7}$/.test(v)) err(w, 'AIN is 7 letters or digits.');
    }
  }

  // Government fields follow the deductor type; ones that no longer apply are cleared.
  const type = bh[31];
  if (changed.has('type') || [...changed].some((p) => p.startsWith('government.'))) {
    if (!DEDUCTOR_TYPES[type]) err('Deductor type', 'Choose a deductor category from Annexure 4.');
    if (!STATE_GOVERNMENT_TYPES.has(type)) bh[53] = '';
    else if (!STATE_CODES.has(bh[53])) err('State (government deductor)', 'A State Government deductor must give its state (Annexure 5).');
    if (!MINISTRY_REQUIRED_TYPES.has(type) && !MINISTRY_OPTIONAL_TYPES.has(type)) bh[56] = '';
    if (MINISTRY_REQUIRED_TYPES.has(type) && !MINISTRY_CODES[bh[56]]) err('Ministry', 'A Central Government deductor must give its ministry (Annexure 3).');
    if (bh[56] && !MINISTRY_CODES[bh[56]]) err('Ministry', `Ministry code ${bh[56]} is not in Annexure 3.`);
    if (bh[56] !== '99') bh[57] = '';
    else if (!bh[57]) err('Ministry', 'Name the ministry when the code is 99 (Others).');
    if (!GOVERNMENT_DEDUCTOR_TYPES.has(type)) bh[67] = '';
  }

  // BH field 53: last deductor type, as in the last statement (regular or correction).
  bh[52] = src[31] ?? '';
  return bh;
}

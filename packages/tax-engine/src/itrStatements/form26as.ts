import { ITR_TDS_SECTIONS, type ItrOtherTds, type ItrSalaryTds, type ItrTaxPayment, type ItrTcs } from '../itr/itrCommon.js';
import { PAN_RE, TAN_RE, maskPanValue, normLabel, parseAmount, parseDate, round2, type StatementIssue } from './common.js';

/**
 * Form 26AS (Form 168 under the Income-tax Act 2025), the annual tax statement, read from the text
 * file TRACES offers under "View Tax Credit (Form 26AS)" with "View As: Text". TRACES gives it as
 * a zip protected with the taxpayer's date of birth (DDMMYYYY); the user unzips it and picks the
 * .txt here.
 *
 * Structure, and where it comes from:
 * - Fields are separated by "^". The Income Tax Department's e-tutorial "Convert Form 26AS Text
 *   File to Excel" (TRACES, mirrored at slideshare.net/slideshow/e-tutorial-convert-form-26-as-text-file-to-excel/32876975)
 *   tells users to open it with Excel's Text to Columns, delimiter "Other", "^".
 * - The first block is a heading row "File Creation Date^Permanent Account Number (PAN)^Current
 *   Status of PAN^Financial Year^Assessment Year^Name of Assessee^Address Line 1..5^Statecode^Pin
 *   Code" and a row of values. Each part starts with a title row ("PART-I - Details of Tax Deducted
 *   at Source", or "PART A - ..." in the older layout), then a deductor heading row ("Sr. No.^Name of
 *   Deductor^TAN of Deductor^^^^^Total Amount Paid / Credited(Rs.)^Total Tax Deducted(Rs.)^Total
 *   TDS Deposited(Rs.)") with one summary row per deductor, each followed by a transaction heading
 *   row that starts with an empty field ("^Sr. No.^Section^Transaction Date^Status of Booking^Date
 *   of Booking^Remarks^Amount Paid / Credited(Rs.)^Tax Deducted(Rs.)^TDS Deposited(Rs.)") and its
 *   transaction rows, which also start with an empty field. These column names are the ones used by
 *   the open-source converter github.com/shubhamshnd/26AS-to-Excel (26as2xl.py), which tells summary
 *   rows from transaction rows the same way.
 * - Booking status letters (F final, U unmatched, P provisional, O overbooked) are explained in the
 *   legend printed at the end of every Form 26AS.
 * - Minor head 100 (advance tax) and 300 (self-assessment tax) are the minor heads of challan
 *   ITNS 280.
 *
 * Unconfirmed: no official specification of the text file is published. The headings of the tax
 * paid part ("Major Head^Minor Head^Tax^Surcharge^Education Cess^Others^Total Tax^BSR Code^Date of
 * Deposit^Challan Serial Number^Remarks") and the refund part ("Assessment Year^Mode^Refund
 * Issued^Nature of Refund^Amount of Refund^Interest^Date of Payment^Remarks") are taken from
 * statements seen in practice, not from a specification, so columns are found by their heading
 * words, with the positions above only as a fallback. Since 2023 TRACES has moved tax paid and some
 * other parts to the Annual Information Statement, so a recent file may have no tax paid part; that
 * is reported, not treated as nil. The Form 168 layout under the 2025 Act (from Tax Year 2026-27)
 * has not been seen yet. The PDF of Form 26AS is not read in this phase; use the text file.
 */

export type Part26ASKind = 'TDS' | 'TDS_15GH' | 'TDS_PAN_DEDUCTOR' | 'TCS' | 'TAX_PAID' | 'REFUND' | 'DEDUCTED_BY_TAXPAYER' | 'OTHER';

export interface Form26ASTdsRow {
  part: string;
  kind: 'TDS' | 'TDS_15GH';
  tan: string;
  name: string;
  /** Section as printed, for example 192, 194A, 194JB. */
  section: string;
  /** Code the ITR schemas use, or null when the printed section has no single code. */
  sectionCode: string | null;
  amount: number;
  tds: number;
  deposited: number;
  transactions: number;
  /** Count of transactions by booking status letter. */
  status: Record<string, number>;
}

export interface Form26ASTcsRow { part: string; tan: string; name: string; section: string; amount: number; tcs: number; deposited: number; transactions: number }

export interface Form26ASChallan {
  majorHead: string; minorHead: string;
  kind: 'ADVANCE' | 'SELF' | 'OTHER';
  tax: number; surcharge: number; cess: number; others: number; total: number;
  bsr: string; date: string | null; serial: string; remarks: string;
}

export interface Form26ASRefund { assessmentYear: string; mode: string; nature: string; amount: number; interest: number; date: string | null; remarks: string }

export interface Form26ASResult {
  is26AS: boolean;
  header: { pan: string | null; panStatus: string | null; name: string | null; financialYear: string | null; assessmentYear: string | null; fileCreated: string | null };
  /** Part titles seen, with what was done with each. */
  parts: Array<{ title: string; kind: Part26ASKind; rows: number }>;
  tds: Form26ASTdsRow[];
  tcs: Form26ASTcsRow[];
  taxPaid: Form26ASChallan[];
  refunds: Form26ASRefund[];
  issues: StatementIssue[];
  totals: { tds: number; tcs: number; taxPaid: number; refunds: number };
  itr: { salaryTds: ItrSalaryTds[]; otherTds: ItrOtherTds[]; tcs: ItrTcs[]; taxPayments: ItrTaxPayment[] };
}

const SCHEMA_CODES = new Set<string>(ITR_TDS_SECTIONS);
const EXPLICIT: Record<string, string> = { '194JA': '94J-A', '194JB': '94J-B' };

/**
 * The ITR schema code for a section printed in Form 26AS. The schema writes most codes by dropping
 * the leading "1" or "19" (194A is 94A, 194BB is 4BB, 194IA is 4IA); a code is returned only when
 * exactly one such form is in the schema list. Sections printed with a bracket, like 194I(a), and
 * plain 194J are left for the user, since the schema splits them.
 */
export function tdsSectionCode(printed: string): string | null {
  const s = printed.toUpperCase().replace(/\s+/g, '').replace(/^SECTION/, '');
  if (!s || /[()]/.test(s)) return null;
  if (EXPLICIT[s]) return EXPLICIT[s];
  const options = [s, s.replace(/^1/, ''), s.replace(/^19/, '')].filter((c, i, a) => a.indexOf(c) === i && SCHEMA_CODES.has(c));
  return options.length === 1 ? options[0] : null;
}

function partKind(title: string): Part26ASKind {
  const t = title.toLowerCase();
  if (/15g|15h/.test(t)) return 'TDS_15GH';
  if (/tax deducted at source/.test(t) && /(buyer|tenant|payer)\b/.test(t) && !/seller|landlord|payee/.test(t)) return 'DEDUCTED_BY_TAXPAYER';
  if (/tax deducted at source/.test(t) && /(seller|landlord|payee|194 ?ia|194 ?ib|194 ?m\b|194 ?s\b)/.test(t)) return 'TDS_PAN_DEDUCTOR';
  if (/tax deducted at source/.test(t)) return 'TDS';
  if (/tax collected at source/.test(t)) return 'TCS';
  if (/tax paid|other than tds or tcs/.test(t)) return 'TAX_PAID';
  if (/refund/.test(t)) return 'REFUND';
  return 'OTHER';
}

const isTitle = (fields: string[]) => {
  const text = fields.filter((f) => f.trim()).join(' ').trim();
  return /^part\s*[-\s]*([ivx]+|[a-h]\d?)\b\s*[-:]?/i.test(text) ? text : null;
};

/** Index of the first heading cell whose words match. */
const col = (header: string[] | null, re: RegExp) => (header ? header.findIndex((h) => re.test(normLabel(h))) : -1);
const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
const amt = (row: string[], i: number) => parseAmount(at(row, i)) ?? 0;

export function parseForm26ASText(text: string): Form26ASResult {
  const issues: StatementIssue[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const rows = lines.map((l) => l.split('^'));
  const caretLines = lines.filter((l) => l.includes('^')).length;
  const header: Form26ASResult['header'] = { pan: null, panStatus: null, name: null, financialYear: null, assessmentYear: null, fileCreated: null };
  const parts: Form26ASResult['parts'] = [];
  const tdsMap = new Map<string, Form26ASTdsRow>();
  const tcsMap = new Map<string, Form26ASTcsRow>();
  const taxPaid: Form26ASChallan[] = [];
  const refunds: Form26ASRefund[] = [];

  let kind: Part26ASKind | null = null;
  let partTitle = '';
  let summaryHead: string[] | null = null;
  let detailHead: string[] | null = null;
  let deductor: { name: string; tan: string } | null = null;
  const deductorsWithDetail = new Set<string>();
  const summaries: Array<{ part: string; kind: 'TDS' | 'TDS_15GH' | 'TCS'; tan: string; name: string; amount: number; tax: number; deposited: number }> = [];

  for (let r = 0; r < rows.length; r++) {
    const f = rows[r];
    const joined = normLabel(f.join(' '));

    if (!header.pan && /permanent account number/.test(joined)) {
      const values = rows[r + 1] ?? [];
      const h = f;
      const get = (re: RegExp) => at(values, col(h, re));
      const pan = get(/permanent account number|^pan$/).toUpperCase();
      header.pan = PAN_RE.test(pan) ? maskPanValue(pan) : pan ? 'XXXXXXXXXX' : null;
      header.panStatus = get(/status of pan/) || null;
      header.financialYear = get(/financial year/) || null;
      header.assessmentYear = get(/assessment year/) || null;
      header.name = get(/name of assessee/) || null;
      header.fileCreated = parseDate(get(/file creation date/));
      r++;
      continue;
    }

    const title = isTitle(f);
    if (title) {
      kind = partKind(title);
      partTitle = title.replace(/\s+/g, ' ').slice(0, 200);
      parts.push({ title: partTitle, kind, rows: 0 });
      summaryHead = null;
      detailHead = null;
      deductor = null;
      continue;
    }
    if (!kind) continue;

    // Heading rows: a summary heading starts with "Sr. No.", a transaction heading with an empty field.
    if (f.some((c) => /^sr\.?\s*no\.?$/i.test(c.trim()))) {
      if (f[0].trim() === '') detailHead = f;
      else summaryHead = f;
      continue;
    }
    if (/no transactions? present|no records? found/i.test(f.join(' '))) continue;
    const hasNumber = f.some((c) => parseAmount(c) !== null);
    if (!hasNumber) continue;
    const part = parts[parts.length - 1];
    const isDetail = f[0].trim() === '' && f.length > 2;

    if (kind === 'TDS' || kind === 'TDS_15GH' || kind === 'TCS') {
      if (!isDetail) {
        const nameI = summaryHead ? col(summaryHead, /^name of (deductor|collector)/) : 1;
        const tanI = summaryHead ? col(summaryHead, /^tan of (deductor|collector)/) : 2;
        const tan = at(f, tanI).toUpperCase();
        if (!TAN_RE.test(tan)) continue;
        deductor = { name: at(f, nameI).slice(0, 125), tan };
        const paidI = summaryHead ? col(summaryHead, /total amount paid|total amount/) : 7;
        const taxI = summaryHead ? col(summaryHead, /total tax (deducted|collected)/) : 8;
        const depI = summaryHead ? col(summaryHead, /total (tds|tcs) deposited/) : 9;
        summaries.push({ part: partTitle, kind, tan, name: deductor.name, amount: amt(f, paidI), tax: amt(f, taxI), deposited: amt(f, depI) });
        part.rows++;
        continue;
      }
      if (!deductor) continue;
      const h = detailHead;
      const secI = h ? col(h, /^section$/) : 2;
      const statusI = h ? col(h, /status of booking/) : 4;
      const amountI = h ? col(h, /^amount (paid|credited|paid credited|paid debited|debited)|^amount/) : 7;
      const taxI = h ? col(h, /^tax (deducted|collected)/) : 8;
      const depI = h ? col(h, /^(tds|tcs) deposited/) : 9;
      const section = at(f, secI).toUpperCase().replace(/\s+/g, '');
      const status = at(f, statusI).toUpperCase() || '?';
      deductorsWithDetail.add(`${partTitle}|${deductor.tan}`);
      part.rows++;
      if (kind === 'TCS') {
        const key = `${deductor.tan}|${section}`;
        const row = tcsMap.get(key) ?? { part: partTitle, tan: deductor.tan, name: deductor.name, section, amount: 0, tcs: 0, deposited: 0, transactions: 0 };
        row.amount = round2(row.amount + amt(f, amountI));
        row.tcs = round2(row.tcs + amt(f, taxI));
        row.deposited = round2(row.deposited + amt(f, depI));
        row.transactions++;
        tcsMap.set(key, row);
      } else {
        const key = `${kind}|${deductor.tan}|${section}`;
        const row = tdsMap.get(key) ?? { part: partTitle, kind, tan: deductor.tan, name: deductor.name, section, sectionCode: section === '192' ? null : tdsSectionCode(section), amount: 0, tds: 0, deposited: 0, transactions: 0, status: {} };
        row.amount = round2(row.amount + amt(f, amountI));
        row.tds = round2(row.tds + amt(f, taxI));
        row.deposited = round2(row.deposited + amt(f, depI));
        row.transactions++;
        row.status[status] = (row.status[status] ?? 0) + 1;
        tdsMap.set(key, row);
      }
      continue;
    }

    if (kind === 'TAX_PAID') {
      const h = summaryHead;
      const g = (re: RegExp, fallback: number) => (h ? col(h, re) : fallback);
      const minor = at(f, g(/^minor head/, 2));
      const challan: Form26ASChallan = {
        majorHead: at(f, g(/^major head/, 1)), minorHead: minor,
        kind: minor === '100' ? 'ADVANCE' : minor === '300' ? 'SELF' : 'OTHER',
        tax: amt(f, g(/^tax$/, 3)), surcharge: amt(f, g(/^surcharge/, 4)), cess: amt(f, g(/cess/, 5)), others: amt(f, g(/^others?$/, 6)),
        total: amt(f, g(/^total tax/, 7)), bsr: at(f, g(/bsr/, 8)), date: parseDate(at(f, g(/date of deposit/, 9))), serial: at(f, g(/challan serial|serial number/, 10)), remarks: at(f, g(/^remarks/, 11)),
      };
      if (!challan.total) challan.total = round2(challan.tax + challan.surcharge + challan.cess + challan.others);
      taxPaid.push(challan);
      part.rows++;
      continue;
    }

    if (kind === 'REFUND') {
      const h = summaryHead;
      const g = (re: RegExp, fallback: number) => (h ? col(h, re) : fallback);
      refunds.push({
        assessmentYear: at(f, g(/^assessment year/, 1)), mode: at(f, g(/^mode/, 2)), nature: at(f, g(/nature of refund/, 4)),
        amount: amt(f, g(/amount of refund|^amount/, 5)), interest: amt(f, g(/^interest/, 6)), date: parseDate(at(f, g(/date of payment/, 7))), remarks: at(f, g(/^remarks/, 8)),
      });
      part.rows++;
      continue;
    }

    part.rows++;
  }

  // Deductors with a summary row but no transaction rows: keep the summary totals, section unknown.
  for (const s of summaries) {
    if (deductorsWithDetail.has(`${s.part}|${s.tan}`)) continue;
    if (s.kind === 'TCS') tcsMap.set(`${s.tan}|`, { part: s.part, tan: s.tan, name: s.name, section: '', amount: s.amount, tcs: s.tax, deposited: s.deposited, transactions: 0 });
    else tdsMap.set(`${s.kind}|${s.tan}|`, { part: s.part, kind: s.kind, tan: s.tan, name: s.name, section: '', sectionCode: null, amount: s.amount, tds: s.tax, deposited: s.deposited, transactions: 0, status: {} });
  }

  const tds = [...tdsMap.values()];
  const tcs = [...tcsMap.values()];
  const is26AS = caretLines > 0 && (parts.length > 0 || !!header.pan);
  if (!is26AS) issues.push({ field: 'file', message: 'This does not look like the Form 26AS text file from TRACES: no "^" separated parts were found. Unzip the download (the password is the date of birth as DDMMYYYY) and pick the .txt file.' });

  for (const p of parts) {
    if (p.kind === 'OTHER') issues.push({ field: p.title, message: 'This part is shown for information and is not imported.' });
    if (p.kind === 'DEDUCTED_BY_TAXPAYER') issues.push({ field: p.title, message: 'Tax deducted by the taxpayer as buyer or tenant is not a credit in their return; not imported.' });
    if (p.kind === 'TDS_PAN_DEDUCTOR' && p.rows) issues.push({ field: p.title, message: 'Tax deducted by a buyer or tenant who quotes a PAN instead of a TAN (sale of property, rent, payments to contractors) is claimed with the deductor\'s PAN; enter it by hand from this part.' });
  }
  if (is26AS && !parts.some((p) => p.kind === 'TAX_PAID')) issues.push({ field: 'taxPaid', message: 'No tax paid part was found. Recent statements show advance and self-assessment tax in the Annual Information Statement instead; add those challans by hand.' });
  for (const t of tds) {
    if (t.status.U) issues.push({ field: t.tan, message: `${t.name}: ${t.status.U} transaction(s) under ${t.section || 'an unknown section'} are unmatched (status U): the deductor has not deposited the tax or gave wrong challan details. Credit may not be allowed until it is corrected.` });
    if (t.status.P) issues.push({ field: t.tan, message: `${t.name}: ${t.status.P} transaction(s) are provisional (status P), awaiting confirmation of the government deductor's book entry.` });
    if (!t.section) issues.push({ field: t.tan, message: `${t.name}: no transaction rows were read, so the section is not known; pick it before filing.` });
    else if (t.section !== '192' && !t.sectionCode) issues.push({ field: t.tan, message: `${t.name}: section ${t.section} has more than one code in the ITR schema (or none); pick the code before filing.` });
  }

  const salaryTds: ItrSalaryTds[] = tds.filter((t) => t.kind === 'TDS' && t.section === '192').map((t) => ({ tan: t.tan, name: t.name, incomeChargeable: Math.round(t.amount), tds: Math.round(t.tds) }));
  if (salaryTds.length) issues.push({ field: 'salary', message: 'For salary (section 192), Form 26AS gives the amount paid, not the income chargeable under the head Salaries. Take that figure from Form 16.' });
  const otherTds: ItrOtherTds[] = tds.filter((t) => t.section !== '192' && t.tds > 0).map((t) => ({ tan: t.tan, name: t.name, section: t.sectionCode ?? '', amount: Math.round(t.amount), tds: Math.round(t.tds) }));
  const tcsOut: ItrTcs[] = tcs.map((t) => ({ tan: t.tan, name: t.name, tcs: Math.round(t.tcs) }));
  const taxPayments: ItrTaxPayment[] = taxPaid
    .filter((c) => c.kind !== 'OTHER' && c.date)
    .map((c) => ({ bsr: c.bsr, date: c.date!, serial: Number(c.serial) || 0, amount: Math.round(c.total), kind: c.kind as 'ADVANCE' | 'SELF' }));
  if (taxPaid.some((c) => c.kind === 'OTHER')) issues.push({ field: 'taxPaid', message: 'Some challans have a minor head other than 100 (advance tax) or 300 (self-assessment tax); they are listed but not taken as tax paid for this return.' });

  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0));
  return {
    is26AS, header, parts, tds, tcs, taxPaid, refunds, issues,
    totals: { tds: sum(tds.map((t) => t.tds)), tcs: sum(tcs.map((t) => t.tcs)), taxPaid: sum(taxPaid.map((c) => c.total)), refunds: sum(refunds.map((x) => x.amount)) },
    itr: { salaryTds, otherTds, tcs: tcsOut, taxPayments },
  };
}

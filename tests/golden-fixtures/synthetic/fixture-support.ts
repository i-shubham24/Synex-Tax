/**
 * Test-side glue for the golden fixtures. Nothing here is product code.
 *
 * The repo has no importer for a raw Tally/Busy purchase register export and no parser for the
 * GSTN GSTR-2B JSON download (see README findings F1 and F12), so these two readers turn the
 * fixture files into the engine's PurchaseRegisterInvoice / Gstr2BRecord inputs. Their rules are
 * the minimum a production importer needs, and are written down in the README.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';
import type { PurchaseRegisterInvoice, Gstr2BRecord } from '../../../workers/queue-worker/src/recon/reconciliationEngine.ts';

export const SYNTHETIC_ROOT = dirname(fileURLToPath(import.meta.url));
export const REAL_ROOT = join(SYNTHETIC_ROOT, '..', 'real');

/** The synthetic dataset, plus the real one when the team has dropped it into real/<slot>. */
export function datasets(slug: string, slot: 'a' | 'b' | 'c' | 'd' | 'e') {
  const out = [{ label: `synthetic/${slug}`, dir: join(SYNTHETIC_ROOT, slug), synthetic: true }];
  const real = join(REAL_ROOT, slot);
  if (existsSync(join(real, 'expected-results.json'))) out.push({ label: `real/${slot}`, dir: real, synthetic: false });
  return out;
}
export const readText = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8');
export const readJson = <T = any>(dir: string, file: string): T => JSON.parse(readText(dir, file));

/** RFC 4180 style CSV: quoted cells may hold commas and doubled quotes. One record per line. */
export function parseCsv(text: string): string[][] {
  return text.replace(/^﻿/, '').split(/\r?\n/).slice(0, text.endsWith('\n') ? -1 : undefined).map((line) => {
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const p2 = (n: number | string) => String(n).padStart(2, '0');
const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** Dates as Tally, Busy and Excel leave them: 05-Nov-25, 05/11/2025, 2025-11-05, 5.11.25, 45966, 05-11-2025. */
export function parseLooseDate(raw: string): string | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(s)) && MON[m[2].toLowerCase()]) return `${year(m[3])}-${p2(MON[m[2].toLowerCase()])}-${p2(m[1])}`;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) return s;
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s))) return `${year(m[3])}-${p2(m[2])}-${p2(m[1])}`;
  if (/^\d{5}$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  return null;
}
const amount = (raw: string | undefined) => {
  const s = (raw ?? '').replace(/[,\s"]/g, '');
  return new Decimal(s === '' ? 0 : s);
};
export const cleanGstin = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

export interface RegisterLoad {
  invoices: PurchaseRegisterInvoice[];
  firstHeaderLine: number;
  dataLines: number;
  skipped: Array<{ line: number; reason: string }>;
  duplicates: Array<{ line: number; duplicateOf: number }>;
  /** Every data line, duplicates included, for the "what if nobody dedupes" check. */
  allRows: PurchaseRegisterInvoice[];
}

/**
 * Reads a Tally/Busy purchase register export. Rules:
 *  - the header is the first row with a "GSTIN/UIN" cell; repeated header rows (page breaks) are skipped
 *  - a data row has both a GSTIN and a supplier invoice number; everything else is skipped and named
 *  - GSTIN: whitespace removed, upper-cased; amounts: Indian digit grouping and quotes stripped
 *  - a later row with the same GSTIN, invoice number, date and taxable value is a duplicate
 */
export function loadPurchaseRegister(csv: string): RegisterLoad {
  const rows = parseCsv(csv);
  const headerAt = rows.findIndex((r) => r.some((c) => c.trim() === 'GSTIN/UIN'));
  if (headerAt < 0) throw new Error('no GSTIN/UIN header');
  const header = rows[headerAt].map((c) => c.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`missing column ${name}`);
    return i;
  };
  const C = {
    party: col('Particulars'), vtype: col('Voucher Type'), no: col('Supplier Invoice No.'), date: col('Supplier Invoice Date'), gstin: col('GSTIN/UIN'),
    taxable: col('Taxable Value'), igst: col('Integrated Tax Amount'), cgst: col('Central Tax Amount'), sgst: col('State Tax Amount'), cess: col('Cess Amount'),
  };
  const skipped: RegisterLoad['skipped'] = [];
  const duplicates: RegisterLoad['duplicates'] = [];
  const invoices: PurchaseRegisterInvoice[] = [];
  const allRows: PurchaseRegisterInvoice[] = [];
  const seen = new Map<string, number>();
  let dataLines = 0;
  rows.forEach((r, i) => {
    const line = i + 1;
    const cell = (k: number) => (r[k] ?? '').trim();
    const nonEmpty = r.filter((c) => c.trim() !== '');
    if (nonEmpty.length === 0) return skipped.push({ line, reason: 'blank' });
    if (r.some((c) => c.trim() === 'GSTIN/UIN')) return skipped.push({ line, reason: 'header' });
    if (nonEmpty.length === 1 && nonEmpty[0].trim() === 'Tax Amount') return skipped.push({ line, reason: 'merged-header' });
    const party = cell(C.party);
    if (/^round\s*off$/i.test(party)) return skipped.push({ line, reason: 'round-off' });
    if (/^carried\s*forward$/i.test(party)) return skipped.push({ line, reason: 'carried-forward' });
    if (/^brought\s*forward$/i.test(party)) return skipped.push({ line, reason: 'brought-forward' });
    if (/^(grand\s*)?total$/i.test(party)) return skipped.push({ line, reason: 'grand-total' });
    if (!cell(C.gstin) || !cell(C.no)) return skipped.push({ line, reason: 'title' });
    dataLines++;
    const date = parseLooseDate(cell(C.date));
    if (!date) throw new Error(`line ${line}: unreadable date "${cell(C.date)}"`);
    const igst = amount(r[C.igst]);
    const cgst = amount(r[C.cgst]);
    const sgst = amount(r[C.sgst]);
    const cess = amount(r[C.cess]);
    const inv: PurchaseRegisterInvoice = {
      id: `PR-L${line}`,
      vendorGstin: cleanGstin(cell(C.gstin)),
      vendorName: party,
      invoiceNum: cell(C.no),
      invoiceDate: date,
      docType: /debit\s*note/i.test(cell(C.vtype)) ? 'CRN' : 'INV',
      taxableValue: amount(r[C.taxable]).toFixed(2),
      igstAmount: igst.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      sgstAmount: sgst.toFixed(2),
      totalTax: igst.add(cgst).add(sgst).add(cess).toFixed(2),
      itcEligibility: 'ELIGIBLE',
    };
    allRows.push(inv);
    const key = [inv.vendorGstin, inv.invoiceNum.toUpperCase(), inv.invoiceDate, inv.taxableValue].join('|');
    const first = seen.get(key);
    if (first !== undefined) return duplicates.push({ line, duplicateOf: first });
    seen.set(key, line);
    invoices.push(inv);
  });
  return { invoices, firstHeaderLine: headerAt + 1, dataLines, skipped, duplicates, allRows };
}

const ddmmyyyyDash = (s: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) throw new Error(`2B date "${s}" is not DD-MM-YYYY`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};
const money = (v: unknown) => new Decimal(String(v ?? 0)).toFixed(2);

/** GSTN GSTR-2B download (data.docdata.b2b[].inv[], data.docdata.cdnr[].nt[]) to engine records. */
export function load2b(doc: any): Gstr2BRecord[] {
  const out: Gstr2BRecord[] = [];
  const dd = doc.data?.docdata ?? {};
  const push = (section: string, ctin: string, trdnm: string, no: string, d: any, docType: Gstr2BRecord['docType']) => {
    const igst = money(d.igst), cgst = money(d.cgst), sgst = money(d.sgst), cess = money(d.cess);
    out.push({
      id: `${section}:${ctin}:${no}`,
      supplierGstin: ctin,
      supplierName: trdnm,
      docNum: no,
      docDate: ddmmyyyyDash(d.dt),
      docType,
      taxableValue: money(d.txval),
      igstAmount: igst,
      cgstAmount: cgst,
      sgstAmount: sgst,
      totalTax: new Decimal(igst).add(cgst).add(sgst).add(cess).toFixed(2),
      itcAvailable: d.itcavl === 'Y',
    });
  };
  for (const s of dd.b2b ?? []) for (const inv of s.inv ?? []) push('b2b', s.ctin, s.trdnm, inv.inum, inv, 'INV');
  for (const s of dd.cdnr ?? []) for (const nt of s.nt ?? []) push('cdnr', s.ctin, s.trdnm, nt.ntnum, nt, nt.typ === 'C' ? 'CRN' : 'DBN');
  return out;
}

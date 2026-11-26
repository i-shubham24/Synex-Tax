/**
 * Generator for the SYNTHETIC golden fixtures in this folder.
 *
 * Every identity, amount and document written here is invented. GSTINs and PANs are structurally
 * valid (the GSTIN check character comes from the repo's own Mod-36 routine) but all use the
 * ZZZ.S#### pattern and "Sample ..." names, so they cannot belong to a real taxpayer.
 *
 * The output is deterministic (fixed PRNG seed). Regenerate with:
 *   npx tsx tests/golden-fixtures/synthetic/generate.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';
import { calculateGstinChecksum, validateGstin } from '../../../packages/tax-engine/src/validators/gstin.ts';
import { normalizeInvoiceNumber } from '../../../workers/queue-worker/src/jobs/invoiceNormalizerJob.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const D = (v: Decimal.Value) => new Decimal(v);
const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const pad = (n: number | string, w: number) => String(n).padStart(w, '0');

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20251126);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** PAN in the reserved-looking pattern ZZZ + constitution + S + 4 digits + Z. */
const pan = (type: string, n: number) => `ZZZ${type}S${pad(n, 4)}Z`;
function gstin(state: string, p: string, entity = '1') {
  const f14 = `${state}${p}${entity}Z`;
  const g = f14 + calculateGstinChecksum(f14);
  if (!validateGstin(g).isValid) throw new Error(`generated GSTIN ${g} fails the repo validator`);
  return g;
}

function write(rel: string, content: string) {
  const p = join(HERE, rel);
  mkdirSync(dirname(p), { recursive: true });
  if (content.includes(String.fromCharCode(0x2014))) throw new Error(`em dash in ${rel}`);
  writeFileSync(p, content, 'utf8');
}
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvLine = (cells: Array<string | number>) => cells.map(csvCell).join(',');

/** Indian digit grouping: 1,23,456.78 */
function inr(d: Decimal) {
  const [i, f] = d.toFixed(2).split('.');
  const neg = i.startsWith('-');
  const s = neg ? i.slice(1) : i;
  let head = s.slice(0, -3);
  const tail = s.slice(-3);
  head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${head ? head + ',' : ''}${tail}.${f}`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const iso = (y: number, m: number, d: number) => `${y}-${pad(m, 2)}-${pad(d, 2)}`;
const parts = (isoDate: string) => isoDate.split('-').map(Number) as [number, number, number];
function addDays(isoDate: string, n: number) {
  const t = new Date(`${isoDate}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const excelSerial = (isoDate: string) => Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
const ddmmyyyyDash = (isoDate: string) => { const [y, m, d] = parts(isoDate); return `${pad(d, 2)}-${pad(m, 2)}-${y}`; };
const tallyDate = (isoDate: string) => { const [y, m, d] = parts(isoDate); return `${pad(d, 2)}-${MON[m - 1]}-${String(y).slice(2)}`; };

type DateFmt = 'tally' | 'slash' | 'iso' | 'dot' | 'serial' | 'dash';
function fmtDate(isoDate: string, f: DateFmt): string | number {
  const [y, m, d] = parts(isoDate);
  switch (f) {
    case 'tally': return tallyDate(isoDate);
    case 'slash': return `${pad(d, 2)}/${pad(m, 2)}/${y}`;
    case 'iso': return isoDate;
    case 'dot': return `${d}.${m}.${String(y).slice(2)}`;
    case 'serial': return excelSerial(isoDate);
    case 'dash': return ddmmyyyyDash(isoDate);
  }
}
function randomDateFmt(): DateFmt {
  const x = rand();
  return x < 0.45 ? 'tally' : x < 0.65 ? 'slash' : x < 0.75 ? 'iso' : x < 0.83 ? 'dot' : x < 0.92 ? 'serial' : 'dash';
}

/* ============================================================================================
 * (a) messy purchase register + GSTR-2B
 * ========================================================================================== */

interface Supplier { n: number; nn: string; name: string; pan: string; gstin: string; state: string; style: number }
const CLIENT_A = { name: 'Sample Client Textiles 01', pan: pan('C', 9001), state: '03' };
const CLIENT_A_GSTIN = gstin('03', CLIENT_A.pan);

const suppliers: Supplier[] = [];
for (let n = 1; n <= 37; n++) {
  const state = n <= 28 ? '03' : n <= 32 ? '07' : n <= 36 ? '06' : '03';
  const p = pan(['F', 'C', 'P'][n % 3], n);
  suppliers.push({ n, nn: pad(n, 2), name: `Sample Traders ${pad(n, 2)}`, pan: p, gstin: gstin(state, p), state, style: n % 6 });
}
const SUP = (n: number) => suppliers[n - 1];

function canonicalNo(s: Supplier, seq: number) {
  switch (s.style) {
    case 0: return `ST${s.nn}/25-26/${seq}`;
    case 1: return `INV-${pad(seq, 4)}`;
    case 2: return `${s.nn}/${seq}/25-26`;
    case 3: return `GST/2025-26/${pad(seq, 3)}`;
    case 4: return `BL/${pad(seq, 5)}`;
    default: return `SALES/25-26/${seq}`;
  }
}
function variantNo(s: Supplier, seq: number) {
  switch (s.style) {
    case 0: return `ST${s.nn}2526${seq}`;
    case 1: return `INV${seq}`;
    case 2: return `${s.nn}-${seq}-2526`;
    case 3: return `GST/25-26/${seq}`;
    case 4: return `BL${seq}`;
    default: return `SALES2526${seq}`;
  }
}

type Scenario =
  | 'exact' | 'exact_split_mismatch' | 'exact_itc_unavailable' | 'exact_prev_period_date'
  | 'fuzzy_number' | 'fuzzy_rounding' | 'fuzzy_date_typo' | 'fuzzy_wrong_month'
  | 'mismatch_value' | 'mismatch_value_variant_no' | 'mismatch_doctype'
  | 'collision'
  | 'missing_in_2b' | 'register_prev_period_late' | 'register_next_period';

interface Inv {
  key: string;
  sup: Supplier;
  scenario: Scenario;
  prNo: string;
  twoBNo: string | null;
  prDate: string;
  twoBDate: string | null;
  voucherDate: string;
  taxable: Decimal;
  rate: number;
  pr: { igst: Decimal; cgst: Decimal; sgst: Decimal };
  twoB: { taxable: Decimal; igst: Decimal; cgst: Decimal; sgst: Decimal; itcavl: 'Y' | 'N'; section: 'b2b' | 'cdnr'; ntty?: 'C' | 'D' } | null;
  orderHint?: number;
}

function taxFor(s: Supplier, taxable: Decimal, rate: number) {
  if (s.state === CLIENT_A.state) {
    const half = r2(taxable.mul(rate).div(200));
    return { igst: D(0), cgst: half, sgst: half };
  }
  return { igst: r2(taxable.mul(rate).div(100)), cgst: D(0), sgst: D(0) };
}
const sumTax = (t: { igst: Decimal; cgst: Decimal; sgst: Decimal }) => t.igst.add(t.cgst).add(t.sgst);

const invs: Inv[] = [];
for (const s of suppliers.slice(0, 36)) {
  const count = 10 + (s.n % 3 === 0 ? 1 : 0);
  let seq = int(1, 60);
  for (let k = 0; k < count; k++) {
    seq += int(1, 4);
    const taxable = D(int(5000, 350000)).add(rand() < 0.3 ? D(int(1, 99)).div(100) : 0);
    const rate = rand() < 0.7 ? 18 : 5;
    const t = taxFor(s, taxable, rate);
    const date = iso(2025, 11, int(1, 30));
    invs.push({
      key: `${s.nn}-${seq}`, sup: s, scenario: 'exact', prNo: canonicalNo(s, seq), twoBNo: canonicalNo(s, seq),
      prDate: date, twoBDate: date, voucherDate: date, taxable, rate, pr: t,
      twoB: { taxable, ...t, itcavl: 'Y', section: 'b2b' },
    });
  }
}

const order = shuffle(invs.map((_, i) => i));
const taken = new Set<number>();
function assign(scn: Scenario, count: number, ok: (x: Inv) => boolean = () => true) {
  let got = 0;
  for (const i of order) {
    if (got === count) break;
    if (taken.has(i) || !ok(invs[i])) continue;
    taken.add(i);
    invs[i].scenario = scn;
    got++;
  }
  if (got !== count) throw new Error(`could not assign ${scn}`);
}
const punjab = (x: Inv) => x.sup.state === '03';
assign('exact_split_mismatch', 3, punjab);
assign('exact_itc_unavailable', 1);
assign('exact_prev_period_date', 2);
assign('fuzzy_number', 24);
assign('fuzzy_rounding', 6);
assign('fuzzy_date_typo', 5);
assign('fuzzy_wrong_month', 2);
assign('mismatch_value', 7);
assign('mismatch_value_variant_no', 7);
assign('missing_in_2b', 12);
assign('register_prev_period_late', 2);
assign('register_next_period', 2);

let roundingFlip = 0;
for (const x of invs) {
  const seq = Number(x.key.split('-')[1]);
  const t2 = x.twoB!;
  switch (x.scenario) {
    case 'exact_split_mismatch': {
      // Register books the tax as IGST; the supplier reported CGST + SGST of the same total.
      x.pr = { igst: sumTax(x.pr), cgst: D(0), sgst: D(0) };
      break;
    }
    case 'exact_itc_unavailable': t2.itcavl = 'N'; break;
    case 'exact_prev_period_date': {
      const d = iso(2025, 10, int(24, 31));
      x.prDate = d; x.twoBDate = d; x.voucherDate = iso(2025, 11, int(1, 4));
      break;
    }
    case 'fuzzy_number': x.twoBNo = variantNo(x.sup, seq); break;
    case 'fuzzy_rounding': {
      if (roundingFlip++ % 2 === 0) t2.taxable = x.taxable.add('0.40');
      else if (t2.igst.gt(0)) t2.igst = t2.igst.add('0.50');
      else { t2.cgst = t2.cgst.add('0.25'); t2.sgst = t2.sgst.add('0.25'); }
      break;
    }
    case 'fuzzy_date_typo': {
      const [, , d] = parts(x.prDate);
      const twoBDay = Math.min(d, 28);
      x.twoBDate = iso(2025, 11, twoBDay);
      x.prDate = iso(2025, 11, twoBDay + 1);
      x.voucherDate = x.prDate;
      break;
    }
    case 'fuzzy_wrong_month': {
      const [, , d] = parts(x.prDate);
      x.twoBDate = iso(2025, 10, Math.min(d, 30));
      break;
    }
    case 'mismatch_value':
    case 'mismatch_value_variant_no': {
      if (x.scenario === 'mismatch_value_variant_no') x.twoBNo = variantNo(x.sup, seq);
      const lower = r2(x.taxable.mul('0.9'));
      const t = taxFor(x.sup, lower, x.rate);
      x.twoB = { ...t2, taxable: lower, ...t };
      break;
    }
    case 'missing_in_2b': x.twoB = null; x.twoBNo = null; x.twoBDate = null; break;
    case 'register_prev_period_late': {
      x.prDate = iso(2025, 10, int(25, 31)); x.voucherDate = iso(2025, 11, int(1, 5));
      x.twoB = null; x.twoBNo = null; x.twoBDate = null;
      break;
    }
    case 'register_next_period': {
      x.prDate = iso(2025, 12, int(1, 3)); x.voucherDate = '2025-11-30';
      x.twoB = null; x.twoBNo = null; x.twoBDate = null;
      break;
    }
    default: break;
  }
  if (x.scenario !== 'exact_prev_period_date' && x.scenario !== 'register_prev_period_late' && x.scenario !== 'register_next_period' && x.scenario !== 'fuzzy_date_typo') {
    x.voucherDate = x.prDate > '2025-11-27' ? x.prDate : addDays(x.prDate, int(0, 3));
  }
}

// Hand-built: a debit note reported in cdnr that the register booked as a purchase invoice.
{
  const s = SUP(3);
  const taxable = D('5000.00');
  const t = taxFor(s, taxable, 18);
  invs.push({ key: 'doctype', sup: s, scenario: 'mismatch_doctype', prNo: 'DN/25-26/4', twoBNo: 'DN/25-26/4', prDate: '2025-11-18', twoBDate: '2025-11-18', voucherDate: '2025-11-19', taxable, rate: 18, pr: t, twoB: { taxable, ...t, itcavl: 'Y', section: 'cdnr', ntty: 'D' } });
}
// Hand-built: two numbers that only differ by delimiter position normalize to the same key.
{
  const s = SUP(9);
  const a = D('1000.00');
  const b = D('1000.50');
  invs.push({ key: 'collision-1', sup: s, scenario: 'collision', prNo: 'A/1/12', twoBNo: 'A-1-12', prDate: '2025-11-12', twoBDate: '2025-11-12', voucherDate: '2025-11-12', taxable: a, rate: 18, pr: taxFor(s, a, 18), twoB: { taxable: a, ...taxFor(s, a, 18), itcavl: 'Y', section: 'b2b' }, orderHint: 2 });
  invs.push({ key: 'collision-2', sup: s, scenario: 'collision', prNo: 'A/11/2', twoBNo: 'A-11-2', prDate: '2025-11-12', twoBDate: '2025-11-12', voucherDate: '2025-11-13', taxable: b, rate: 18, pr: taxFor(s, b, 18), twoB: { taxable: b, ...taxFor(s, b, 18), itcavl: 'Y', section: 'b2b' }, orderHint: 1 });
}

// 2B-only documents (VENDOR_NOT_IN_PR).
interface TwoBOnly { sup: Supplier; no: string; date: string; taxable: Decimal; rate: number; tax: { igst: Decimal; cgst: Decimal; sgst: Decimal }; section: 'b2b' | 'cdnr'; ntty?: 'C' | 'D'; scenario: string }
const twoBOnly: TwoBOnly[] = [];
for (let i = 0; i < 8; i++) {
  const s = SUP(int(1, 36));
  const seq = 900 + i;
  const taxable = D(int(8000, 120000));
  twoBOnly.push({ sup: s, no: canonicalNo(s, seq), date: iso(2025, 11, int(1, 30)), taxable, rate: 18, tax: taxFor(s, taxable, 18), section: 'b2b', scenario: 'not_in_register' });
}
for (let i = 0; i < 3; i++) {
  const s = SUP(int(1, 36));
  const seq = 950 + i;
  const taxable = D(int(8000, 120000));
  twoBOnly.push({ sup: s, no: canonicalNo(s, seq), date: iso(2025, 10, int(3, 28)), taxable, rate: 18, tax: taxFor(s, taxable, 18), section: 'b2b', scenario: 'twob_prev_period_booked_in_october_register' });
}
{
  const s = SUP(37);
  const taxable = D('42000.00');
  twoBOnly.push({ sup: s, no: 'NEW/0001', date: '2025-11-21', taxable, rate: 18, tax: taxFor(s, taxable, 18), section: 'b2b', scenario: 'supplier_not_in_register_master' });
}
{
  const s = SUP(14);
  const taxable = D('7500.00');
  twoBOnly.push({ sup: s, no: 'CN/25-26/31', date: '2025-11-26', taxable, rate: 18, tax: taxFor(s, taxable, 18), section: 'cdnr', ntty: 'C', scenario: 'credit_note_not_booked' });
}

// Design check: normalized numbers are unique per supplier except the deliberate collision.
{
  const seen = new Map<string, string>();
  for (const x of invs) {
    for (const no of [x.prNo, x.twoBNo]) {
      if (!no) continue;
      const k = `${x.sup.gstin}|${normalizeInvoiceNumber(no)}`;
      const prev = seen.get(k);
      if (prev && prev !== x.key && x.scenario !== 'collision') throw new Error(`unintended normalized collision ${no} with ${prev}`);
      seen.set(k, x.key);
    }
    if (x.twoBNo && x.scenario !== 'collision' && normalizeInvoiceNumber(x.prNo) !== normalizeInvoiceNumber(x.twoBNo)) throw new Error(`variant ${x.twoBNo} does not normalize like ${x.prNo}`);
  }
  for (const y of twoBOnly) {
    const k = `${y.sup.gstin}|${normalizeInvoiceNumber(y.no)}`;
    if (seen.has(k)) throw new Error(`2B-only ${y.no} collides`);
    seen.set(k, 'twoBOnly');
  }
}

/* ---- purchase register CSV ---- */
const HEADER = ['Date', 'Particulars', 'Voucher Type', 'Voucher No.', 'Supplier Invoice No.', 'Supplier Invoice Date', 'GSTIN/UIN', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State Tax Amount', 'Cess Amount', 'Round Off', 'Gross Total'];
const NCOL = HEADER.length;
const MERGED = (() => { const r = Array(NCOL).fill(''); r[8] = 'Tax Amount'; return r; })();
const lines: string[] = [];
const skipped: Array<{ line: number; reason: string }> = [];
const push = (cells: Array<string | number>, reason?: string) => {
  lines.push(csvLine(cells));
  if (reason) skipped.push({ line: lines.length, reason });
  return lines.length;
};
const blankRow = () => push(Array(NCOL).fill(''), 'blank');
const titleRows = () => {
  push([CLIENT_A.name, ...Array(NCOL - 1).fill('')], 'title');
  push(['Sample Address Line, Sample City, Punjab', ...Array(NCOL - 1).fill('')], 'title');
  push(['Purchase Register', ...Array(NCOL - 1).fill('')], 'title');
  push(['1-Nov-25 to 30-Nov-25', ...Array(NCOL - 1).fill('')], 'title');
};
const headerRows = () => { push(MERGED, 'merged-header'); return push(HEADER, 'header'); };

function messyGstin(g: string): string {
  const x = rand();
  if (x < 0.04) return g.toLowerCase();
  if (x < 0.08) return `${g.slice(0, 2)} ${g.slice(2, 7)} ${g.slice(7, 12)} ${g.slice(12)}`;
  if (x < 0.10) return `  ${g} `;
  if (x < 0.11) return `${g.slice(0, 2)} ${g.slice(2).toLowerCase()}`;
  return g;
}
function messyNo(no: string): string {
  const x = rand();
  if (x < 0.05) return no.toLowerCase();
  if (x < 0.08) return ` ${no} `;
  return no;
}
const money = (d: Decimal) => (d.isZero() ? (rand() < 0.5 ? '' : '0.00') : rand() < 0.3 ? inr(d) : d.toFixed(2));

titleRows();
blankRow();
const firstHeaderLine = headerRows();

const prSorted = invs.slice().sort((a, b) => (a.voucherDate < b.voucherDate ? -1 : a.voucherDate > b.voucherDate ? 1 : a.key === 'collision-1' ? -1 : b.key === 'collision-1' ? 1 : 0));
const dupPick = new Set(shuffle(prSorted.filter((x) => x.scenario === 'exact').map((x) => x.key)).slice(0, 6));
const roundOffPick = new Set(shuffle(prSorted.map((x) => x.key)).slice(0, 15));
const lineOf = new Map<string, number>();
const duplicates: Array<{ line: number; duplicateOf: number }> = [];
const lateDups: Array<{ at: number; x: Inv; of: number }> = [];
let vno = 0;
let dataCount = 0;
const pageTotals = { taxable: D(0), igst: D(0), cgst: D(0), sgst: D(0), gross: D(0) };
let grand = { taxable: D(0), igst: D(0), cgst: D(0), sgst: D(0), gross: D(0) };

function emitData(x: Inv): number {
  const tax = sumTax(x.pr);
  const raw = x.taxable.add(tax);
  const gross = raw.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const ro = gross.sub(raw);
  vno++;
  const line = push([
    tallyDate(x.voucherDate), x.sup.name, 'Purchase', String(vno), messyNo(x.prNo), fmtDate(x.prDate, randomDateFmt()), messyGstin(x.sup.gstin),
    money(x.taxable), money(x.pr.igst), money(x.pr.cgst), money(x.pr.sgst), '', ro.isZero() ? '' : ro.toFixed(2), money(gross),
  ]);
  for (const k of ['taxable', 'igst', 'cgst', 'sgst'] as const) {
    const v = k === 'taxable' ? x.taxable : x.pr[k];
    pageTotals[k] = pageTotals[k].add(v);
  }
  pageTotals.gross = pageTotals.gross.add(gross);
  dataCount++;
  if (roundOffPick.has(x.key) && !ro.isZero()) {
    push(['', 'Round Off', '', '', '', '', '', '', '', '', '', '', ro.toFixed(2), ''], 'round-off');
  }
  return line;
}
function pageBreak() {
  const t = pageTotals;
  push(['', 'Carried Forward', '', '', '', '', '', inr(t.taxable), inr(t.igst), inr(t.cgst), inr(t.sgst), '', '', inr(t.gross)], 'carried-forward');
  blankRow();
  push([CLIENT_A.name, ...Array(NCOL - 1).fill('')], 'title');
  push(['', 'Brought Forward', '', '', '', '', '', inr(t.taxable), inr(t.igst), inr(t.cgst), inr(t.sgst), '', '', inr(t.gross)], 'brought-forward');
  headerRows();
}

let sinceBlank = 0;
let pageBreaks = 0;
for (const x of prSorted) {
  const line = emitData(x);
  lineOf.set(x.key, line);
  if (dupPick.has(x.key)) {
    if (lateDups.length < 3) lateDups.push({ at: dataCount + int(20, 40), x, of: line });
    else {
      const d = emitData(x);
      duplicates.push({ line: d, duplicateOf: line });
    }
  }
  for (const ld of lateDups.filter((l) => l.at === dataCount)) {
    const d = emitData(ld.x);
    duplicates.push({ line: d, duplicateOf: ld.of });
  }
  if (++sinceBlank > int(25, 45)) { blankRow(); sinceBlank = 0; }
  if (pageBreaks === 0 && dataCount >= 140) { pageBreak(); pageBreaks++; }
  else if (pageBreaks === 1 && dataCount >= 280) { pageBreak(); pageBreaks++; }
}
for (const ld of lateDups) if (!duplicates.some((d) => d.duplicateOf === ld.of)) { const d = emitData(ld.x); duplicates.push({ line: d, duplicateOf: ld.of }); }
blankRow();
grand = { ...pageTotals };
push(['', 'Grand Total', '', '', '', '', '', inr(grand.taxable), inr(grand.igst), inr(grand.cgst), inr(grand.sgst), '', '', inr(grand.gross)], 'grand-total');
const registerCsv = lines.join('\r\n') + '\r\n';
if (duplicates.length !== 6) throw new Error(`expected 6 duplicates, got ${duplicates.length}`);

/* ---- GSTR-2B JSON (GSTN download layout) ---- */
const dmy = (isoDate: string) => ddmmyyyyDash(isoDate);
const num = (d: Decimal) => Number(d.toFixed(2));
interface TwoBDoc { id: string; ctin: string; section: 'b2b' | 'cdnr'; no: string; date: string; taxable: Decimal; igst: Decimal; cgst: Decimal; sgst: Decimal; itcavl: 'Y' | 'N'; ntty?: 'C' | 'D'; orderHint: number }
const twoBDocs: TwoBDoc[] = [];
for (const x of invs) {
  if (!x.twoB || !x.twoBNo || !x.twoBDate) continue;
  twoBDocs.push({ id: `${x.twoB.section}:${x.sup.gstin}:${x.twoBNo}`, ctin: x.sup.gstin, section: x.twoB.section, no: x.twoBNo, date: x.twoBDate, taxable: x.twoB.taxable, igst: x.twoB.igst, cgst: x.twoB.cgst, sgst: x.twoB.sgst, itcavl: x.twoB.itcavl, ntty: x.twoB.ntty, orderHint: x.orderHint ?? 0 });
}
for (const y of twoBOnly) {
  twoBDocs.push({ id: `${y.section}:${y.sup.gstin}:${y.no}`, ctin: y.sup.gstin, section: y.section, no: y.no, date: y.date, taxable: y.taxable, ...y.tax, itcavl: 'Y', ntty: y.ntty, orderHint: 0 });
}
const supByGstin = new Map(suppliers.map((s) => [s.gstin, s]));
function sectionDocs(section: 'b2b' | 'cdnr') {
  const docs = twoBDocs.filter((d) => d.section === section);
  const ctins = [...new Set(docs.map((d) => d.ctin))].sort((a, b) => supByGstin.get(a)!.n - supByGstin.get(b)!.n);
  return ctins.map((ctin) => {
    const mine = docs.filter((d) => d.ctin === ctin).sort((a, b) => (a.orderHint !== b.orderHint ? a.orderHint - b.orderHint : a.date < b.date ? -1 : a.date > b.date ? 1 : a.no < b.no ? -1 : 1));
    const s = supByGstin.get(ctin)!;
    const head = { ctin, trdnm: s.name.toUpperCase(), supfildt: '11-12-2025', supprd: '112025' };
    const rows = mine.map((d) => {
      const val = num(d.taxable.add(d.igst).add(d.cgst).add(d.sgst).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
      const common = { dt: dmy(d.date), val, pos: '03', rev: 'N', itcavl: d.itcavl, rsn: d.itcavl === 'N' ? 'P' : '', diffprcnt: 1, srctyp: 'Upload', irn: '', irngendate: '', txval: num(d.taxable), igst: num(d.igst), cgst: num(d.cgst), sgst: num(d.sgst), cess: 0 };
      return section === 'b2b' ? { inum: d.no, typ: 'R', ...common } : { ntnum: d.no, typ: d.ntty, suptyp: 'R', ...common };
    });
    return section === 'b2b' ? { ...head, inv: rows } : { ...head, nt: rows };
  });
}
const gstr2b = {
  _synthetic: 'SYNTHETIC FIXTURE. Generated by tests/golden-fixtures/synthetic/generate.ts. Contains no real taxpayer data.',
  chksum: 'SYNTHETIC-NOT-A-REAL-CHECKSUM',
  data: {
    gstin: CLIENT_A_GSTIN,
    rtnprd: '112025',
    version: '2.0',
    gendt: '14-12-2025',
    docdata: { b2b: sectionDocs('b2b'), cdnr: sectionDocs('cdnr') },
  },
};

/* ---- expected results (per GstReconciliationEngine's actual passes) ---- */
type Expected = 'EXACT_MATCH' | 'FUZZY_MATCH' | 'PROBABLE_MATCH' | 'MISMATCH_VALUE' | 'MISMATCH_DOCTYPE' | 'PURCHASE_NOT_IN_2B' | 'OUT_OF_PERIOD';
const STATUS: Record<Scenario, Expected> = {
  exact: 'EXACT_MATCH', exact_split_mismatch: 'MISMATCH_VALUE', exact_itc_unavailable: 'EXACT_MATCH', exact_prev_period_date: 'EXACT_MATCH',
  fuzzy_number: 'FUZZY_MATCH', fuzzy_rounding: 'FUZZY_MATCH', fuzzy_date_typo: 'FUZZY_MATCH', fuzzy_wrong_month: 'PROBABLE_MATCH', collision: 'FUZZY_MATCH',
  mismatch_value: 'MISMATCH_VALUE', mismatch_value_variant_no: 'MISMATCH_VALUE', mismatch_doctype: 'MISMATCH_DOCTYPE',
  missing_in_2b: 'PURCHASE_NOT_IN_2B', register_prev_period_late: 'PURCHASE_NOT_IN_2B', register_next_period: 'OUT_OF_PERIOD',
};
const PASS = { EXACT_MATCH: 1, FUZZY_MATCH: 2, PROBABLE_MATCH: 2, MISMATCH_VALUE: 3, MISMATCH_DOCTYPE: 3 } as const;
const idOf = (x: Inv) => `${x.twoB!.section}:${x.sup.gstin}:${x.twoBNo}`;
const pairs: Array<Record<string, unknown>> = [];
const notIn2b: Array<Record<string, unknown>> = [];
const outOfPeriod: Array<Record<string, unknown>> = [];
let matchedItc = D(0);
let notAvailableItc = D(0);
let atRisk = D(0);
let deferred = D(0);
let unclaimed = D(0);
for (const x of prSorted) {
  const st = STATUS[x.scenario];
  const line = lineOf.get(x.key)!;
  const prTax = sumTax(x.pr);
  if (st === 'OUT_OF_PERIOD') {
    outOfPeriod.push({ prId: `PR-L${line}`, registerLine: line, invoiceNo: x.prNo, invoiceDate: x.prDate, scenario: x.scenario, totalTax: prTax.toFixed(2) });
    deferred = deferred.add(prTax);
    continue;
  }
  if (st === 'PURCHASE_NOT_IN_2B') {
    notIn2b.push({ prId: `PR-L${line}`, registerLine: line, invoiceNo: x.prNo, supplierGstin: x.sup.gstin, scenario: x.scenario, totalTax: prTax.toFixed(2) });
    atRisk = atRisk.add(prTax);
    continue;
  }
  pairs.push({ prId: `PR-L${line}`, registerLine: line, twoBId: idOf(x), status: st, pass: PASS[st], scenario: x.scenario });
  if (st === 'EXACT_MATCH' || st === 'FUZZY_MATCH') {
    if (x.twoB!.itcavl === 'N') notAvailableItc = notAvailableItc.add(prTax);
    else matchedItc = matchedItc.add(prTax);
  } else atRisk = atRisk.add(prTax);
}
const vendorNotInPr = twoBOnly.map((y) => {
  const tax = y.tax.igst.add(y.tax.cgst).add(y.tax.sgst);
  unclaimed = unclaimed.add(tax);
  return { twoBId: `${y.section}:${y.sup.gstin}:${y.no}`, scenario: y.scenario, totalTax: tax.toFixed(2) };
});
const count = (st: string) => pairs.filter((p) => p.status === st).length;
const expectedA = {
  _synthetic: 'SYNTHETIC FIXTURE. Generated by tests/golden-fixtures/synthetic/generate.ts. Contains no real taxpayer data.',
  engine: 'workers/queue-worker/src/recon/reconciliationEngine.ts GstReconciliationEngine.reconcile',
  recipientGstin: CLIENT_A_GSTIN,
  period: '2025-11',
  register: {
    file: 'purchase-register-nov-2025.csv',
    totalLines: lines.length,
    firstHeaderLine,
    dataLines: dataCount,
    uniqueInvoices: dataCount - duplicates.length,
    skipped,
    duplicates,
    idRule: 'PR-L<line>, where <line> is the 1-based CSV line of the first occurrence',
  },
  twoB: { file: 'gstr2b-112025.json', documents: twoBDocs.length, idRule: '<section>:<ctin>:<inum or ntnum>' },
  summary: {
    exactMatchesCount: count('EXACT_MATCH'),
    fuzzyMatchesCount: count('FUZZY_MATCH'),
    probableMatchesCount: count('PROBABLE_MATCH'),
    valueMismatchesCount: count('MISMATCH_VALUE'),
    docTypeMismatchesCount: count('MISMATCH_DOCTYPE'),
    purchaseNotIn2bCount: notIn2b.length,
    vendorNotInPrCount: vendorNotInPr.length,
    outOfPeriodCount: outOfPeriod.length,
    totalMatchedItc: matchedItc.toFixed(2),
    totalAtRiskItc: atRisk.toFixed(2),
    totalUnclaimedItc: unclaimed.toFixed(2),
    totalItcNotAvailable: notAvailableItc.toFixed(2),
    totalDeferredItc: deferred.toFixed(2),
  },
  summaryIfDuplicatesAreNotRemoved: {
    purchaseNotIn2bCount: notIn2b.length + duplicates.length,
    note: 'The engine has no duplicate detection: each repeated register line stays unmatched once its 2B partner is taken.',
  },
  pairs,
  purchaseNotIn2b: notIn2b,
  outOfPeriod,
  vendorNotInPr,
  scenarioLegend: {
    exact: 'Same GSTIN, type, number (case-insensitive), date, taxable and each tax head. Pass 1.',
    exact_split_mismatch: 'Register books IGST, supplier reported CGST+SGST of the same total. Tax heads differ, so MISMATCH_VALUE in pass 3 (was EXACT_MATCH before finding F2 was fixed).',
    exact_itc_unavailable: '2B itcavl = N. Still an exact match, but its tax goes to totalItcNotAvailable, not totalMatchedItc (finding F3, fixed).',
    exact_prev_period_date: 'Invoice dated October, reported by the supplier in November GSTR-1 and booked in November. Legitimate match.',
    fuzzy_number: 'Supplier uploaded a different spelling of the same number (delimiters, FY token, leading zeros). Pass 2.',
    fuzzy_rounding: 'Same number, 0.40 taxable or 0.50 tax difference. Pass 2 tolerance is Rs 1.00.',
    fuzzy_date_typo: 'Same number and values, register date one day off within the month. Pass 2, FUZZY_MATCH at 0.90.',
    fuzzy_wrong_month: 'Same number and values, 2B date one month earlier. Pass 2, PROBABLE_MATCH at 0.75; its tax is at risk until checked (finding F4, fixed).',
    collision: 'A/1/12 and A/11/2 both normalize loosely to A112; the strict key (segment boundaries kept) pairs each with its own 2B line (finding F5, fixed).',
    mismatch_value: 'Same number, 2B taxable is 90 percent of the register. Pass 3.',
    mismatch_value_variant_no: 'Different spelling and 90 percent value. Pass 3.',
    mismatch_doctype: 'Register INV, 2B cdnr debit note with the same number and value. MISMATCH_DOCTYPE (finding F6, fixed).',
    missing_in_2b: 'Supplier never reported it.',
    register_prev_period_late: 'October invoice booked in November; it sits in the October 2B, not this one.',
    register_next_period: 'December-dated invoice keyed into the November register. Set aside as out of period, tax in totalDeferredItc (finding F7, fixed).',
  },
};

write('a-messy-purchase-register/purchase-register-nov-2025.csv', registerCsv);
write('a-messy-purchase-register/gstr2b-112025.json', json(gstr2b));
write('a-messy-purchase-register/expected-results.json', json(expectedA));

/* ============================================================================================
 * (b) QRMP client pack (hand-computed expectations live in expected-results.json)
 * ========================================================================================== */
const CLIENT_B = { name: 'Sample Client Traders 02', pan: pan('F', 9002) };
const CLIENT_B_GSTIN = gstin('03', CLIENT_B.pan);
const SYN = 'SYNTHETIC FIXTURE. Generated by tests/golden-fixtures/synthetic/generate.ts. Contains no real taxpayer data.';
write('b-qrmp-client-pack/client.json', json({
  _synthetic: SYN,
  legalName: CLIENT_B.name, tradeName: CLIENT_B.name, gstin: CLIENT_B_GSTIN, pan: CLIENT_B.pan, stateCode: '03',
  cadence: 'QRMP', pmt06Method: 'SELF_ASSESSMENT', quarter: { fyStart: 2025, label: 'Q3 FY 2025-26', months: ['2025-10', '2025-11', '2025-12'] },
  previousQuarterCashPaid: { label: 'Q2 FY 2025-26 GSTR-3B, tax paid in cash', igst: '8000.00', cgst: '41000.00', sgst: '41000.00', cess: '0.00' },
}));
const monthsB = [
  { period: '2025-10', outward: { intraTaxable: '650000.00', interTaxable: '100000.00', igst: '18000.00', cgst: '58500.00', sgst: '58500.00' }, itc2b: { igst: '6400.00', cgst: '38200.00', sgst: '38200.00' }, iffFiledOn: '2025-11-12' },
  { period: '2025-11', outward: { intraTaxable: '520000.00', interTaxable: '200000.00', igst: '36000.00', cgst: '46800.00', sgst: '46800.00' }, itc2b: { igst: '41500.00', cgst: '30100.00', sgst: '30100.00' }, iffFiledOn: '2025-12-13' },
  { period: '2025-12', outward: { intraTaxable: '710000.00', interTaxable: '50000.00', igst: '9000.00', cgst: '63900.00', sgst: '63900.00' }, itc2b: { igst: '3000.00', cgst: '44000.00', sgst: '44000.00' } },
];
write('b-qrmp-client-pack/months.json', json({
  _synthetic: SYN,
  note: 'Outward tax per GSTR-1/IFF and ITC per GSTR-2B for each month of the quarter. Rate 18 percent throughout.',
  months: monthsB,
  gstr3bQuarter: {
    period: '2025-12', status: 'FILED', filedOn: '2026-01-23',
    liability: { igst: '63000.00', cgst: '169200.00', sgst: '169200.00' },
    itcClaimed: { igst: '50900.00', cgst: '112300.00', sgst: '112300.00' },
    cashPaidWithReturn: { igst: '500.00', cgst: '25400.00', sgst: '19900.00', total: '45800.00' },
  },
}));
write('b-qrmp-client-pack/pmt06-challans.csv', [
  'CPIN,Generated On,Deposit Date,CIN,BRN,Bank,Reason,Tax Period,IGST Tax,CGST Tax,SGST Tax,Cess Tax,Interest,Total',
  '25110399000001,20/11/2025,21/11/2025,251103990000019999,SYN0000001,Sample Bank Ltd,Monthly payment for quarterly return (MPQR),Oct-2025,11600.00,20300.00,20300.00,0.00,0.00,52200.00',
  '25120399000002,22/12/2025,23/12/2025,251203990000029999,SYN0000002,Sample Bank Ltd,Monthly payment for quarterly return (MPQR),Nov-2025,0.00,11200.00,16700.00,0.00,0.00,27900.00',
].join('\r\n') + '\r\n');

/* ============================================================================================
 * (c) RCM + Rule 42/43 (rice sheller)
 * ========================================================================================== */
const CLIENT_C = { name: 'Sample Rice Mills 03', pan: pan('F', 9003) };
const CLIENT_C_GSTIN = gstin('03', CLIENT_C.pan);
const gtaPb = gstin('03', pan('F', 201));
const gtaHr = gstin('06', pan('C', 202));
const packPb = gstin('03', pan('C', 203));
const jutePb = gstin('03', pan('F', 204));
const sparesPb = gstin('03', pan('F', 205));
const insurer = gstin('03', pan('C', 206));
const canteen = gstin('03', pan('P', 207));
const repairs = gstin('03', pan('P', 208));
const sorterDl = gstin('07', pan('C', 209));
const carPb = gstin('03', pan('C', 210));
const regC = [
  'Date,Supplier,Supplier GSTIN,Invoice No,HSN/SAC,Description,Taxable Value,Rate %,IGST,CGST,SGST,Reverse Charge,ITC Type,Usage',
  '03/11/2025,Sample Farmer 01,,PADDY/101,1006,Paddy (unregistered agriculturist),2500000.00,0,0.00,0.00,0.00,N,NONE,NO_ITC',
  '07/11/2025,Sample Farmer 02,,PADDY/102,1006,Paddy (unregistered agriculturist),2000000.00,0,0.00,0.00,0.00,N,NONE,NO_ITC',
  '14/11/2025,Sample Farmer 03,,PADDY/103,1006,Paddy (unregistered agriculturist),1800000.00,0,0.00,0.00,0.00,N,NONE,NO_ITC',
  '21/11/2025,Sample Farmer 04,,PADDY/104,1006,Paddy (unregistered agriculturist),1700000.00,0,0.00,0.00,0.00,N,NONE,NO_ITC',
  `08/11/2025,Sample Transport Co 01,${gtaPb},RCM/25-26/001,9965,GTA freight paddy inward (RCM 5%),140000.00,5,0.00,3500.00,3500.00,Y,INPUT_SERVICE,COMMON`,
  `22/11/2025,Sample Transport Co 01,${gtaPb},RCM/25-26/002,9965,GTA freight rice outward (RCM 5%),100000.00,5,0.00,2500.00,2500.00,Y,INPUT_SERVICE,COMMON`,
  `25/11/2025,Sample Transport Co 02,${gtaHr},RCM/25-26/003,9965,GTA freight from Haryana (RCM 5% IGST),80000.00,5,4000.00,0.00,0.00,Y,INPUT_SERVICE,COMMON`,
  '12/11/2025,Sample Advocate 01,,RCM/25-26/004,9982,Legal fees by advocate (RCM 18%),50000.00,18,0.00,4500.00,4500.00,Y,INPUT_SERVICE,COMMON',
  '30/11/2025,Sample Security Services 01,,RCM/25-26/005,9985,Security services by non-body-corporate (RCM 18%),30000.00,18,0.00,2700.00,2700.00,Y,INPUT_SERVICE,COMMON',
  '30/11/2025,Sample Landlord 01,,RCM/25-26/006,9972,Godown rent from unregistered landlord (RCM 18%),60000.00,18,0.00,5400.00,5400.00,Y,INPUT_SERVICE,COMMON',
  `05/11/2025,Sample Packaging 01,${packPb},SP/25-26/0441,3923,Printed laminated pouches for pre-packaged rice,200000.00,18,0.00,18000.00,18000.00,N,INPUT,TAXABLE_ONLY`,
  `06/11/2025,Sample Jute Works 01,${jutePb},SJW/772,6305,Jute bags for loose (unpackaged) rice,150000.00,5,0.00,3750.00,3750.00,N,INPUT,EXEMPT_ONLY`,
  `10/11/2025,Sample Mill Spares 01,${sparesPb},MS-1182,8437,Sheller rollers and spares,70000.00,18,0.00,6300.00,6300.00,N,INPUT,COMMON`,
  `19/11/2025,Sample Mill Spares 01,${sparesPb},MS-1207,8437,Repair of husker unit,50000.00,18,0.00,4500.00,4500.00,N,INPUT_SERVICE,COMMON`,
  `01/11/2025,Sample Insurance 01,${insurer},POL/88/2025,9971,Plant and stock insurance,40000.00,18,0.00,3600.00,3600.00,N,INPUT_SERVICE,COMMON`,
  `15/11/2025,Sample Caterers 01,${canteen},SC/219,996331,Staff canteen food,20000.00,5,0.00,500.00,500.00,N,INPUT_SERVICE,BLOCKED_17_5`,
  `17/11/2025,Sample Repairs 01,${repairs},SR/55,9987,Repair at partner residence (non-business),10000.00,18,0.00,900.00,900.00,N,INPUT_SERVICE,NON_BUSINESS`,
  `20/11/2025,Sample Sorter Machines 01,${sorterDl},SSM/2025/0091,8437,Optical colour sorter (capital goods),1000000.00,18,180000.00,0.00,0.00,N,CAPITAL_GOODS,COMMON`,
  `24/11/2025,Sample Motors 01,${carPb},SM/INV/3310,8703,Motor car for partner (capital goods),800000.00,18,0.00,72000.00,72000.00,N,CAPITAL_GOODS,BLOCKED_17_5`,
  '28/11/2025,Sample Fuel Station 01,,SFS/9001,2710,High speed diesel (outside GST),300000.00,0,0.00,0.00,0.00,N,NONE,NO_ITC',
].join('\r\n') + '\r\n';
write('c-rcm-rule42-43/purchase-register-nov-2025.csv', regC);
write('c-rcm-rule42-43/capital-goods-register.csv', [
  'Asset,HSN,Put To Use,Useful Life Months,IGST ITC,CGST ITC,SGST ITC,Usage',
  'Paddy dryer,8419,2024-11-15,60,0.00,45000.00,45000.00,COMMON',
  'Optical colour sorter,8437,2025-11-20,60,180000.00,0.00,0.00,COMMON',
  'Motor car for partner,8703,2025-11-24,60,0.00,72000.00,72000.00,BLOCKED_17_5',
].join('\r\n') + '\r\n');
write('c-rcm-rule42-43/client.json', json({
  _synthetic: SYN,
  legalName: CLIENT_C.name, gstin: CLIENT_C_GSTIN, pan: CLIENT_C.pan, stateCode: '03', cadence: 'MONTHLY', period: '2025-11',
  outward: {
    taxable: { description: 'Pre-packaged and labelled rice, 5 percent', taxableValue: '3600000.00', igst: '0.00', cgst: '90000.00', sgst: '90000.00' },
    exempt: { description: 'Loose (not pre-packaged and labelled) rice', value: '8400000.00' },
  },
  openingItcBalance: { igst: '0.00', cgst: '0.00', sgst: '0.00' },
}));

/* ============================================================================================
 * (d) TRACES consolidated file, Form 140, Q1 Tax Year 2026-27
 * ========================================================================================== */
const TAN = 'ZZZS90001Z';
const DEDUCTOR = { name: 'SAMPLE DEDUCTOR INDUSTRIES 04', pan: pan('F', 9004) };
const TOKEN = '990000000000001';
interface Payee { pan: string; name: string; code: string; rate: string; amount: string; reason?: string }
const recurring: Payee[] = [
  { pan: pan('P', 101), name: 'SAMPLE CONTRACTOR 01', code: '1023', rate: '1', amount: '150000.00' },
  { pan: pan('F', 102), name: 'SAMPLE CONTRACTORS 02', code: '1024', rate: '2', amount: '250000.00' },
  { pan: pan('C', 103), name: 'SAMPLE ENGINEERING 03', code: '1024', rate: '2', amount: '400000.00' },
  { pan: pan('P', 104), name: 'SAMPLE CONSULTANT 04', code: '1027', rate: '10', amount: '60000.00' },
  { pan: pan('P', 105), name: 'SAMPLE ADVOCATE 05', code: '1027', rate: '10', amount: '45000.00' },
  { pan: 'PANNOTAVBL', name: 'SAMPLE PAYEE 06', code: '1027', rate: '20', amount: '30000.00', reason: 'C' },
  { pan: pan('F', 107), name: 'SAMPLE TRANSPORT 07', code: '1024', rate: '2', amount: '120000.00' },
  { pan: pan('P', 108), name: 'SAMPLE LANDLORD 08', code: '1009', rate: '10', amount: '80000.00' },
];
const juneExtra: Payee[] = [
  { pan: pan('P', 109), name: 'SAMPLE DESIGNER 09', code: '1027', rate: '10', amount: '75000.00' },
  { pan: pan('C', 110), name: 'SAMPLE TECH SERVICES 10', code: '1026', rate: '2', amount: '90000.00' },
];
const challansD = [
  { bsr: '9990001', serial: '00011', date: '2026-05-07', payMonth: '2026-04', payees: recurring, interest: '0.00' },
  { bsr: '9990001', serial: '00011', date: '2026-06-06', payMonth: '2026-05', payees: recurring, interest: '0.00' },
  { bsr: '9990002', serial: '00005', date: '2026-07-07', payMonth: '2026-06', payees: [...recurring, ...juneExtra], interest: '150.00' },
];
const ddmmyyyy = (isoDate: string) => isoDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3$2$1');
const fields = (n: number, vals: Record<number, string>) => Array.from({ length: n }, (_, i) => vals[i] ?? '');
const consoLines: string[] = [];
let ln = 0;
consoLines.push(fields(18, { 0: String(++ln), 1: 'FH', 2: 'NS1', 3: 'R', 4: '20082026', 5: '1', 6: 'D', 7: TAN, 8: '1', 9: 'SYNTHETIC CONSO GENERATOR' }).join('^'));
const expectedChallans: Array<Record<string, unknown>> = [];
const cdBodies: string[][] = [];
let batchTotal = D(0);
challansD.forEach((c, ci) => {
  const rows = c.payees.map((p, pi) => {
    const tax = r2(D(p.amount).mul(p.rate).div(100));
    const day = pad(Math.min(28, 3 + pi * 3), 2);
    const paidOn = `${c.payMonth}-${day}`;
    return { p, tax, paidOn, recordNo: pi + 1 };
  });
  const taxTotal = rows.reduce((a, r) => a.add(r.tax), D(0));
  const total = taxTotal.add(c.interest);
  batchTotal = batchTotal.add(total);
  const cd = fields(30, { 1: 'CD', 2: '1', 3: String(ci + 1), 4: String(rows.length), 5: 'N', 7: taxTotal.toFixed(2), 8: D(c.interest).toFixed(2), 9: '0.00', 10: '0.00', 11: total.toFixed(2), 12: 'B', 14: c.bsr, 16: c.serial, 18: ddmmyyyy(c.date), 20: taxTotal.toFixed(2), 21: taxTotal.toFixed(2), 22: '200', 23: D(c.interest).toFixed(2), 24: '0.00' });
  const dds = rows.map((r) => fields(45, { 1: 'DD', 2: '1', 3: String(r.recordNo), 4: String(ci + 1), 5: 'O', 7: r.p.pan, 8: r.p.name, 14: r.p.code, 18: ddmmyyyy(r.paidOn), 19: r.p.amount, 23: r.tax.toFixed(2), 24: r.tax.toFixed(2), 26: ddmmyyyy(r.paidOn), 27: D(r.p.rate).toFixed(4).padStart(7, '0'), 31: r.p.reason ?? '' }));
  cdBodies.push(cd, ...dds);
  expectedChallans.push({
    recordNo: ci + 1, bsr: c.bsr, challanNo: c.serial, date: c.date, tax: taxTotal.toFixed(2), interest: D(c.interest).toFixed(2), total: total.toFixed(2), minorHead: '200',
    deductees: rows.map((r) => ({ recordNo: r.recordNo, pan: r.p.pan, name: r.p.name, section: r.p.code, paidOn: r.paidOn, amount: r.p.amount, deducted: r.tax.toFixed(2), deposited: r.tax.toFixed(2), rate: D(r.p.rate).toFixed(4).padStart(7, '0'), reason: r.p.reason ?? '' })),
  });
});
const bh = fields(72, { 1: 'BH', 2: '1', 3: String(challansD.length), 4: '140', 7: TOKEN, 8: TOKEN, 12: TAN, 14: DEDUCTOR.pan, 15: '202728', 16: '202627', 17: 'Q1', 18: DEDUCTOR.name, 19: 'HEAD OFFICE', 20: 'PLOT 1 SAMPLE INDUSTRIAL AREA', 24: 'SAMPLE CITY', 25: '26', 26: '999001', 27: 'DEDUCTOR04@EXAMPLE.INVALID', 28: '0183', 29: '9999900004', 31: 'F', 32: 'SAMPLE PERSON 04', 33: 'PARTNER', 34: 'PLOT 1 SAMPLE INDUSTRIAL AREA', 38: 'SAMPLE CITY', 39: '26', 40: '999001', 41: 'PERSON04@EXAMPLE.INVALID', 43: '0183', 44: '9999900104', 46: batchTotal.toFixed(2), 51: 'N', 58: pan('P', 9104) });
consoLines.push([String(++ln), ...bh.slice(1)].join('^'));
for (const body of cdBodies) consoLines.push([String(++ln), ...body.slice(1)].join('^'));
const consoText = consoLines.join('\r\n') + '\r\n';
write('d-traces-conso/ZZZS90001Z_140_Q1_202627.conso', consoText);
write('d-traces-conso/expected-results.json', json({
  _synthetic: SYN,
  parser: 'packages/tax-engine/src/tds/correction.ts parseConsoFile',
  file: 'ZZZS90001Z_140_Q1_202627.conso',
  form: '140', tan: TAN, deductorName: DEDUCTOR.name, deductorPan: DEDUCTOR.pan, taxYear: 2026, quarter: 1, originalToken: TOKEN, previousToken: TOKEN,
  recordCounts: { FH: 1, BH: 1, CD: challansD.length, DD: challansD.reduce((a, c) => a + c.payees.length, 0) },
  batchTotal: batchTotal.toFixed(2),
  issues: [],
  challans: expectedChallans,
  corrections: [
    { edit: { deductees: [{ challanNo: 1, recordNo: 6, pan: pan('P', 106) }] }, typesNeeded: ['C3'], why: 'Replacing PANNOTAVBL is a C3 per correction.ts header comment.' },
    { edit: { deductees: [{ challanNo: 1, recordNo: 1, pan: pan('P', 111) }] }, typesNeeded: ['C5'], why: 'Changing a valid PAN is a C5.' },
  ],
}));

/* ============================================================================================
 * (e) ITNS 281N challan + CSI
 * ========================================================================================== */
const ch1 = expectedChallans[0] as { deductees: Array<{ section: string; deducted: string }>; tax: string; total: string };
const bySection = new Map<string, Decimal>();
for (const d of ch1.deductees) bySection.set(d.section, (bySection.get(d.section) ?? D(0)).add(d.deducted));
const allocations = [...bySection.entries()].sort().map(([code, v]) => ({ sectionCode: code, incomeTax: v.toFixed(2), surcharge: '0.00', cess: '0.00', totalSectionAmount: v.toFixed(2) }));
write('e-itns-281n-challan/challan-281n.json', json({
  _synthetic: SYN,
  _note: 'Request body for POST /api/v1/tds/:tanId/challans (apps/api/src/modules/tds/challans.routes.ts CreateChallanSchema). Same challan as record 1 of the d-traces-conso fixture.',
  challanNo: '00011', bsrCode: '9990001', depositDate: '2026-05-07', taxYear: 2026, quarter: 'Q1', deducteeTypeHead: '0021', residencyScope: 'RESIDENT', minorHead: '200',
  totalIncomeTax: ch1.tax, totalSurcharge: '0.00', totalCess: '0.00', interestAllocation: '0.00', othersAllocation: '0.00', feeLateFiling: '0.00', totalChallanAmount: ch1.total,
  sectionAllocations: allocations,
}));
const c3 = expectedChallans[2] as { total: string };
const bookChallans = [
  { id: 'BOOK-1', bsrCode: '9990001', challanDate: '2026-05-07', challanNo: '11', totalAmount: ch1.total },
  { id: 'BOOK-2', bsrCode: '9990001', challanDate: '2026-06-06', challanNo: '11', totalAmount: ch1.total },
  { id: 'BOOK-3', bsrCode: '9990002', challanDate: '2026-07-07', challanNo: '5', totalAmount: c3.total },
  { id: 'BOOK-4', bsrCode: '9990010', challanDate: '2026-06-30', challanNo: '19', totalAmount: '25000.00' },
];
write('e-itns-281n-challan/book-challans.json', json({ _synthetic: SYN, tan: TAN, challans: bookChallans }));
write('e-itns-281n-challan/challan-list.csv', [
  'BSR Code,Challan No,Challan Date,Tax,Interest,Fee',
  `9990001,00011,07/05/2026,${ch1.tax},0.00,0.00`,
  `9990001,00011,06/06/2026,${ch1.tax},0.00,0.00`,
  `9990002,00005,07/07/2026,${(expectedChallans[2] as { tax: string }).tax},150.00,0.00`,
  '9990010,00019,30/06/2026,25000.00,0.00,0.00',
].join('\r\n') + '\r\n');
const csiRows = [
  { date: '2026-05-07', bsr: '9990001', serial: '00011', amount: ch1.total, major: '0021', minor: '200' },
  { date: '2026-06-06', bsr: '9990001', serial: '00011', amount: ch1.total, major: '0021', minor: '200' },
  { date: '2026-07-07', bsr: '9990002', serial: '00005', amount: c3.total, major: '0021', minor: '200' },
  { date: '2026-06-30', bsr: '9990001', serial: '00019', amount: '25000.00', major: '0021', minor: '200' },
  { date: '2026-06-12', bsr: '9990003', serial: '00042', amount: '3300.00', major: '0021', minor: '200' },
];
write('e-itns-281n-challan/ZZZS90001Z.csi', csiRows.map((r) => [ddmmyyyy(r.date), r.bsr, r.serial, r.amount, r.major, r.minor, TAN, 'SAMPLE BANK LTD'].join('^')).join('\r\n') + '\r\n');
write('e-itns-281n-challan/expected-results.json', json({
  _synthetic: SYN,
  csiLayoutAssumed: 'DDMMYYYY^BSR^CHALLAN_SERIAL^AMOUNT^MAJOR_HEAD^MINOR_HEAD^TAN^BANK. The repo has no CSI file parser, so this layout is a placeholder until a real file lands in tests/golden-fixtures/real/e.',
  uploadSniff: { detectedType: 'CSI_OR_DELIMITED', valid: true },
  challanList: bookChallans.map((b) => ({ bsr: b.bsrCode, challanNo: b.challanNo, depositedOn: b.challanDate })),
  routeChecks: {
    validChallan: 'passes schema and regime checks (not 400, not 422)',
    sameChallanDatedBeforeCutover: { depositDate: '2026-03-31', status: 422, error: 'STATUTORY_CHALLAN_VIOLATION' },
  },
  csiMatchExpected: {
    matched: ['BOOK-1', 'BOOK-2', 'BOOK-3'],
    unmatchedBook: ['BOOK-4'],
    unmatchedCsi: [{ bsrCode: '9990001', challanNo: '00019' }, { bsrCode: '9990003', challanNo: '00042' }],
    why: 'BOOK-4 carries a BSR typo (9990010 vs bank 9990001); 9990003/00042 is a deposit missing from the books. BOOK-1 and BOOK-2 share BSR, serial and amount but differ by date, which is normal: serials restart per branch per day.',
  },
}));

console.log(`a: ${lines.length} register lines (${dataCount} data, ${duplicates.length} duplicates), ${twoBDocs.length} 2B docs`);
console.log(`a summary: ${JSON.stringify(expectedA.summary)}`);
console.log(`d: ${consoLines.length} conso lines, batch total ${batchTotal.toFixed(2)}`);

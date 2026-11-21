import Decimal from 'decimal.js';
import { parseDelimited, parseIndianAmount } from '../import/clientImport.js';
import { GSTN_STATE_CODES, validateGstin } from '../validators/gstin.js';

/**
 * Sales register import (pasted from Excel or a CSV export of Tally, Busy, Marg or any billing
 * software) and the GSTR-1 summary built from it.
 *
 * Each row is classified the way GSTR-1 does:
 *   B2B (table 4A)     to a GSTIN
 *   B2CL (table 5)     to an unregistered buyer, inter-state, invoice value above Rs 1,00,000
 *   B2CS (table 7)     every other sale to an unregistered buyer, summarised by place of supply and rate
 *   EXPWP/EXPWOP (6A)  exports, with or without payment of IGST (place of supply 96)
 *   CDNR / CDNUR (9B)  credit and debit notes, to registered and unregistered buyers
 * Tax is checked against value x rate, and the IGST or CGST plus SGST split against the place of supply.
 */

export type SalesField = 'invoiceNo' | 'invoiceDate' | 'docType' | 'customerGstin' | 'customerName' | 'pos' | 'taxableValue' | 'rate' | 'igst' | 'cgst' | 'sgst' | 'cess' | 'invoiceValue' | 'reverseCharge' | 'exportType';

const HEADERS: Array<[SalesField, RegExp]> = [
  ['invoiceNo', /^(invoice|inv|bill|voucher|doc(ument)?)\s*(no|number|num|#)\.?$|^(invoice|bill|voucher)$/],
  ['invoiceDate', /^(invoice|inv|bill|voucher|doc(ument)?)?\s*date$/],
  ['docType', /^(doc(ument)?|voucher)\s*type$|^type$/],
  ['customerGstin', /^(party|customer|buyer|recipient|receiver)?\s*(gstin|gst\s*no|gstin\/uin|gst\s*number)$/],
  ['customerName', /^(party|customer|buyer|recipient|receiver)\s*(name)?$|^name$|^particulars$/],
  ['pos', /^(place\s*of\s*supply|pos|state)$/],
  ['taxableValue', /^(taxable\s*(value|amount)|assessable\s*value|taxable)$/],
  ['rate', /^(gst\s*)?rate\s*(%|\(%\))?$|^tax\s*rate$/],
  ['igst', /^igst(\s*amount)?$|^integrated\s*tax$/],
  ['cgst', /^cgst(\s*amount)?$|^central\s*tax$/],
  ['sgst', /^(sgst|utgst|sgst\/utgst)(\s*amount)?$|^state\s*(\/ut\s*)?tax$/],
  ['cess', /^cess(\s*amount)?$/],
  ['invoiceValue', /^(invoice|bill|total|gross)\s*(value|amount|total)$|^total$/],
  ['reverseCharge', /^(reverse\s*charge|rcm)$/],
  ['exportType', /^export\s*type$/],
];

export function matchSalesHeader(header: string): SalesField | null {
  const h = header.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [field, re] of HEADERS) if (re.test(h)) return field;
  return null;
}

/** GST rates in use (percent, total of CGST and SGST or the IGST rate), including those before September 2025. */
export const GST_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

export type Gstr1Section = 'B2B' | 'B2CL' | 'B2CS' | 'EXPWP' | 'EXPWOP' | 'CDNR' | 'CDNUR';
const TABLE: Record<Gstr1Section, string> = { B2B: '4A', B2CL: '5', B2CS: '7', EXPWP: '6A', EXPWOP: '6A', CDNR: '9B', CDNUR: '9B' };

export interface SalesInvoice {
  sourceLine: number;
  invoiceNo: string;
  invoiceDate: string; // ISO
  docType: 'INV' | 'CRN' | 'DBN';
  section: Gstr1Section;
  table: string;
  customerGstin: string | null;
  customerName: string;
  pos: string; // two-digit state code, 96 for exports
  rate: number;
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  invoiceValue: string;
  reverseCharge: boolean;
}

export interface SalesRowResult {
  sourceLine: number;
  invoice: SalesInvoice | null;
  errors: string[];
  warnings: string[];
}

const STATE_BY_NAME = new Map(Object.entries(GSTN_STATE_CODES).map(([code, name]) => [name.toUpperCase().replace(/[^A-Z]/g, ''), code]));

function parsePos(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2})\b/.exec(t);
  if (m) {
    const code = m[1].padStart(2, '0');
    return code === '96' || code === '97' || GSTN_STATE_CODES[code] ? code : null;
  }
  const name = t.replace(/^\d+\s*[-:]\s*/, '').toUpperCase().replace(/[^A-Z]/g, '');
  if (name === 'OTHERCOUNTRIES' || name === 'OTHERCOUNTRY' || name === 'EXPORT') return '96';
  return STATE_BY_NAME.get(name) ?? null;
}

function parseDate(raw: string): string | null {
  const t = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
  }
  const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})$/.exec(t);
  if (m && months[m[2].toUpperCase()]) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${months[m[2].toUpperCase()]}-${m[1].padStart(2, '0')}`;
  return null;
}

const amt = (raw: string | undefined): Decimal | null => {
  if (raw === undefined || raw.trim() === '') return new Decimal(0);
  const p = parseIndianAmount(raw);
  return p === null ? null : new Decimal(p);
};

/**
 * Reads a pasted sales register for one GSTIN and return period. `period` is YYYY-MM; invoices
 * dated outside it are warnings (they may belong to an amendment), not errors.
 */
export function parseSalesRegister(text: string, opts: { supplierGstin: string; period: string }): { rows: SalesRowResult[]; unmapped: string[]; missing: SalesField[] } {
  const table = parseDelimited(text).filter((r) => r.some((c) => c.trim() !== ''));
  let headerIndex = 0;
  let best = -1;
  for (let i = 0; i < Math.min(15, table.length); i++) {
    const hits = table[i].filter((c) => matchSalesHeader(c)).length;
    if (hits > best) { best = hits; headerIndex = i; }
  }
  const header = table[headerIndex] ?? [];
  const map = header.map((h) => matchSalesHeader(h));
  const unmapped = header.filter((h, i) => h.trim() && !map[i]);
  const required: SalesField[] = ['invoiceNo', 'invoiceDate', 'taxableValue', 'rate'];
  const missing = required.filter((f) => !map.includes(f));
  if (missing.length) return { rows: [], unmapped, missing };

  const supplierState = opts.supplierGstin.slice(0, 2);
  const rows: SalesRowResult[] = [];
  for (let r = headerIndex + 1; r < table.length; r++) {
    const raw: Partial<Record<SalesField, string>> = {};
    table[r].forEach((cell, i) => { const f = map[i]; if (f && raw[f] === undefined) raw[f] = cell.trim(); });
    const sourceLine = r + 1;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (/^(total|grand total)/i.test(raw.invoiceNo ?? '') || (!raw.invoiceNo && !raw.taxableValue)) continue;

    const invoiceNo = (raw.invoiceNo ?? '').toUpperCase();
    if (!/^[A-Z0-9\/\-]{1,16}$/.test(invoiceNo)) errors.push('Invoice number must be up to 16 letters, digits, "/" or "-".');
    const invoiceDate = parseDate(raw.invoiceDate ?? '');
    if (!invoiceDate) errors.push(`Date "${raw.invoiceDate ?? ''}" is not a date.`);
    else if (invoiceDate.slice(0, 7) !== opts.period) warnings.push(`Dated ${invoiceDate}, outside ${opts.period}.`);

    const t = (raw.docType ?? '').toUpperCase();
    const docType: SalesInvoice['docType'] = /CR|CREDIT|CRN/.test(t) ? 'CRN' : /DR|DEBIT|DBN/.test(t) ? 'DBN' : 'INV';

    let gstin: string | null = (raw.customerGstin ?? '').toUpperCase().replace(/\s/g, '') || null;
    if (gstin && ['URP', 'UNREGISTERED', 'NA', 'N/A', '-'].includes(gstin)) gstin = null;
    if (gstin) {
      const v = validateGstin(gstin);
      if (!v.isValid) errors.push(`Customer GSTIN ${gstin}: ${v.error ?? 'not valid'}.`);
      if (gstin === opts.supplierGstin.toUpperCase()) errors.push('Customer GSTIN is your own GSTIN.');
    }

    const exportRow = /^(WPAY|WOPAY|EXPWP|EXPWOP)$/i.test(raw.exportType ?? '');
    let pos = raw.pos ? parsePos(raw.pos) : gstin ? gstin.slice(0, 2) : supplierState;
    if (exportRow) pos = '96';
    if (!pos) errors.push(`Place of supply "${raw.pos}" is not a state code or name.`);

    const taxable = amt(raw.taxableValue);
    const igst = amt(raw.igst);
    const cgst = amt(raw.cgst);
    const sgst = amt(raw.sgst);
    const cess = amt(raw.cess);
    const rate = Number(String(raw.rate ?? '').replace('%', '').trim());
    if ([taxable, igst, cgst, sgst, cess].some((x) => x === null)) errors.push('An amount is not a number.');
    if (!GST_RATES.includes(rate)) errors.push(`Rate ${raw.rate ?? ''} is not a GST rate.`);
    if (taxable && taxable.lte(0)) errors.push('Taxable value must be more than zero (enter credit notes as positive values with type CRN).');

    const reverseCharge = /^(y|yes|true|1)$/i.test(raw.reverseCharge ?? '');
    const interState = pos !== null && pos !== supplierState;
    if (taxable && igst && cgst && sgst && GST_RATES.includes(rate) && pos) {
      const expected = taxable.mul(rate).div(100);
      if (exportRow && /WOPAY|EXPWOP/i.test(raw.exportType ?? '')) {
        if (!igst.add(cgst).add(sgst).isZero()) errors.push('An export without payment of tax carries no IGST.');
      } else if (!reverseCharge) {
        if (interState) {
          if (!cgst.isZero() || !sgst.isZero()) errors.push(`Place of supply ${pos} is another state: charge IGST, not CGST and SGST.`);
          if (igst.sub(expected).abs().gt(1)) errors.push(`IGST should be about ${expected.toFixed(2)} (${rate}% of ${taxable.toFixed(2)}).`);
        } else {
          if (!igst.isZero()) errors.push(`Place of supply ${pos} is your own state: charge CGST and SGST, not IGST.`);
          if (cgst.add(sgst).sub(expected).abs().gt(1)) errors.push(`CGST plus SGST should be about ${expected.toFixed(2)} (${rate}% of ${taxable.toFixed(2)}).`);
          if (cgst.sub(sgst).abs().gt(0.5)) errors.push('CGST and SGST should be equal.');
        }
      }
    }
    const tax = (igst ?? new Decimal(0)).add(cgst ?? 0).add(sgst ?? 0).add(cess ?? 0);
    const invoiceValue = raw.invoiceValue ? amt(raw.invoiceValue) : (taxable ?? new Decimal(0)).add(reverseCharge ? 0 : tax);
    if (invoiceValue === null) errors.push('Invoice value is not a number.');

    let section: Gstr1Section;
    if (docType !== 'INV') section = gstin ? 'CDNR' : 'CDNUR';
    else if (gstin) section = 'B2B';
    else if (exportRow) section = /WOPAY|EXPWOP/i.test(raw.exportType ?? '') ? 'EXPWOP' : 'EXPWP';
    else if (interState && invoiceValue && invoiceValue.gt(100000)) section = 'B2CL';
    else section = 'B2CS';
    if (reverseCharge && !gstin) errors.push('Reverse charge applies only to a registered buyer.');

    rows.push({
      sourceLine,
      errors,
      warnings,
      invoice: errors.length
        ? null
        : {
            sourceLine,
            invoiceNo,
            invoiceDate: invoiceDate!,
            docType,
            section,
            table: TABLE[section],
            customerGstin: gstin,
            customerName: (raw.customerName ?? '').slice(0, 200),
            pos: pos!,
            rate,
            taxableValue: taxable!.toFixed(2),
            igst: igst!.toFixed(2),
            cgst: cgst!.toFixed(2),
            sgst: sgst!.toFixed(2),
            cess: cess!.toFixed(2),
            invoiceValue: invoiceValue!.toFixed(2),
            reverseCharge,
          },
    });
  }

  // The same invoice number twice in one period is an error on both rows.
  const seen = new Map<string, SalesRowResult>();
  for (const r of rows) {
    if (!r.invoice) continue;
    const key = `${r.invoice.docType}|${r.invoice.invoiceNo}`;
    const first = seen.get(key);
    if (first) {
      r.errors.push(`Invoice ${r.invoice.invoiceNo} appears again (first on line ${first.sourceLine}).`);
      r.invoice = null;
    } else seen.set(key, r);
  }
  return { rows, unmapped, missing };
}

export interface Gstr1SummaryLine {
  section: Gstr1Section;
  table: string;
  pos: string | null; // only for B2CS
  rate: number;
  documents: number;
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
}

/**
 * GSTR-1 summary by table and rate (B2CS also by place of supply). Credit notes reduce the totals;
 * debit notes add to them.
 */
export function gstr1Summary(invoices: Array<Pick<SalesInvoice, 'section' | 'pos' | 'rate' | 'docType' | 'taxableValue' | 'igst' | 'cgst' | 'sgst' | 'cess'>>): { lines: Gstr1SummaryLine[]; totals: { taxableValue: string; igst: string; cgst: string; sgst: string; cess: string; tax: string } } {
  const by = new Map<string, { section: Gstr1Section; pos: string | null; rate: number; n: number; v: Decimal[] }>();
  const tot = [0, 0, 0, 0, 0].map(() => new Decimal(0));
  for (const i of invoices) {
    const pos = i.section === 'B2CS' ? i.pos : null;
    const key = `${i.section}|${pos ?? ''}|${i.rate}`;
    const cur = by.get(key) ?? { section: i.section, pos, rate: i.rate, n: 0, v: [0, 0, 0, 0, 0].map(() => new Decimal(0)) };
    const sign = i.docType === 'CRN' ? -1 : 1;
    [i.taxableValue, i.igst, i.cgst, i.sgst, i.cess].forEach((x, k) => {
      cur.v[k] = cur.v[k].add(new Decimal(x).mul(sign));
      tot[k] = tot[k].add(new Decimal(x).mul(sign));
    });
    cur.n += 1;
    by.set(key, cur);
  }
  const order: Gstr1Section[] = ['B2B', 'B2CL', 'EXPWP', 'EXPWOP', 'B2CS', 'CDNR', 'CDNUR'];
  const lines = [...by.values()]
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || (a.pos ?? '').localeCompare(b.pos ?? '') || a.rate - b.rate)
    .map((x) => ({ section: x.section, table: TABLE[x.section], pos: x.pos, rate: x.rate, documents: x.n, taxableValue: x.v[0].toFixed(2), igst: x.v[1].toFixed(2), cgst: x.v[2].toFixed(2), sgst: x.v[3].toFixed(2), cess: x.v[4].toFixed(2) }));
  return { lines, totals: { taxableValue: tot[0].toFixed(2), igst: tot[1].toFixed(2), cgst: tot[2].toFixed(2), sgst: tot[3].toFixed(2), cess: tot[4].toFixed(2), tax: tot[1].add(tot[2]).add(tot[3]).add(tot[4]).toFixed(2) } };
}

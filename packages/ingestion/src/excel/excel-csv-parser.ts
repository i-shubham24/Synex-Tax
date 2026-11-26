import { Decimal } from 'decimal.js';
import { validateGstin, validateInvoiceNumberRule46, validatePlaceOfSupply } from '@synextax/tax-engine';

export interface IngestedInvoiceRow {
  /** 1-based line in the file. */
  rowNumber: number;
  invoiceNum: string;
  invoiceDate: string; // YYYY-MM-DD
  partyGstin?: string;
  partyName?: string;
  /** Tally/Busy voucher type when the export has one ("Purchase", "Debit Note", ...). */
  voucherType?: string;
  posStateCode: string;
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  cessAmount: string;
  totalInvoiceValue: string;
  isValid: boolean;
  validationErrors: string[];
  /** Problems worth showing that do not stop the row from being used. */
  warnings: string[];
  /** Set when an earlier row has the same GSTIN, number, date and taxable value. */
  duplicateOfRow?: number;
}

export interface SkippedLine {
  rowNumber: number;
  reason: 'blank' | 'header' | 'title' | 'round-off' | 'total' | 'carried-forward';
}

export interface IngestionBatchResult {
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  duplicateRowsCount: number;
  /** 1-based line of the header row that was used. */
  headerRow: number;
  totalTaxableValue: string;
  totalIgst: string;
  totalCgst: string;
  totalSgst: string;
  rows: IngestedInvoiceRow[];
  skipped: SkippedLine[];
}

export interface ParseInvoiceCsvOptions {
  /**
   * SALES (default): our own invoices; Rule 46 numbering and place of supply are errors.
   * PURCHASE: a supplier register export; those checks become warnings, because the numbers and
   * tax heads are the supplier's and reconciliation is where they get sorted out.
   */
  kind?: 'SALES' | 'PURCHASE';
}

type Field =
  | 'invoiceNum' | 'invoiceDate' | 'partyGstin' | 'partyName' | 'voucherType' | 'posStateCode'
  | 'taxableValue' | 'igstAmount' | 'cgstAmount' | 'sgstAmount' | 'cessAmount';

/**
 * Header names per field, best first. A Tally purchase register has both "Voucher No." and
 * "Supplier Invoice No.", and both "Date" and "Supplier Invoice Date": the supplier's wins.
 * Headers are compared lower-cased with dots removed and spaces collapsed.
 */
const HEADER_ALIASES: Record<Field, RegExp[]> = {
  invoiceNum: [
    /^supplier\s*(invoice|inv|bill)\s*(no|num|number)$/,
    /^(invoice|inv|bill|doc|document)\s*(no|num|number)?$/,
    /^voucher\s*(no|number)$/,
  ],
  invoiceDate: [
    /^supplier\s*(invoice|inv|bill)\s*date$/,
    /^(invoice|inv|bill|doc|document)\s*date$/,
    /^date$/,
  ],
  partyGstin: [/^(party|buyer|customer|supplier|vendor)\s*gstin(\/uin)?$/, /^gstin(\/uin)?$/],
  partyName: [/^(party|buyer|customer|supplier|vendor|legal)\s*name$/, /^(particulars|name)$/],
  voucherType: [/^voucher\s*type$/],
  posStateCode: [/^(pos|place\s*of\s*supply|state\s*code|pos\s*code)$/],
  taxableValue: [/^(taxable\s*(value|amount)?|assessable\s*value)$/],
  igstAmount: [/^(integrated\s*tax|igst)(\s*amount|\s*amt)?$/],
  cgstAmount: [/^(central\s*tax|cgst)(\s*amount|\s*amt)?$/],
  sgstAmount: [/^(state\s*tax|ut\s*tax|sgst|utgst|sgst\/utgst)(\s*amount|\s*amt)?$/],
  cessAmount: [/^cess(\s*amount|\s*amt)?$/],
};

const normHeader = (h: string) => h.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');

/** Maps each field to the column of its best-ranked header, or undefined. */
function mapHeader(cells: string[]): Partial<Record<Field, number>> {
  const heads = cells.map(normHeader);
  const map: Partial<Record<Field, number>> = {};
  for (const [field, patterns] of Object.entries(HEADER_ALIASES) as Array<[Field, RegExp[]]>) {
    for (const re of patterns) {
      const i = heads.findIndex((h) => re.test(h));
      if (i >= 0) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

/** A header row names an invoice number and at least two of GSTIN, date and taxable value. */
function isHeaderRow(map: Partial<Record<Field, number>>): boolean {
  if (map.invoiceNum === undefined) return false;
  return [map.partyGstin, map.invoiceDate, map.taxableValue].filter((i) => i !== undefined).length >= 2;
}

/** RFC 4180 style: quoted cells may hold the delimiter and doubled quotes. One record per line. */
function splitRecord(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      cells.push(cur);
      cur = '';
    } else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n: number | string) => String(n).padStart(2, '0');
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * Dates as Tally, Busy and Excel leave them: 05-Nov-25, 5-Nov-2025, 05/11/2025, 05-11-2025,
 * 5.11.25, 2025-11-05 and Excel serial numbers (45966). Day first, as in India. Returns null when
 * the text is not a real calendar date.
 */
export function parseIndianDate(raw: string): string | null {
  const s = (raw || '').trim();
  let y: number, m: number, d: number;
  let x: RegExpExecArray | null;
  if ((x = /^(\d{1,2})[\s\-\/]([A-Za-z]{3})[A-Za-z]*[\s\-\/,]+(\d{2}|\d{4})$/.exec(s)) && MONTHS[x[2].toLowerCase()]) {
    d = Number(x[1]); m = MONTHS[x[2].toLowerCase()]; y = fullYear(x[3]);
  } else if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    y = Number(x[1]); m = Number(x[2]); d = Number(x[3]);
  } else if ((x = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s))) {
    d = Number(x[1]); m = Number(x[2]); y = fullYear(x[3]);
  } else if (/^\d{5}$/.test(s)) {
    // Excel's day count from 30 Dec 1899 (which absorbs Excel's 1900 leap-year bug for modern dates).
    return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000).toISOString().slice(0, 10);
  } else {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Amounts with Indian or western digit grouping, currency marks, and (123.00) for negatives. */
function parseAmount(raw: string | undefined): Decimal | null {
  let s = (raw ?? '').trim();
  if (s === '' || s === '-') return new Decimal(0);
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,\s₹]/g, '').replace(/^rs\.?/i, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const v = new Decimal(s);
  return negative ? v.negated() : v;
}

const SKIP_PARTY: Array<[RegExp, SkippedLine['reason']]> = [
  [/^round(ed)?\s*off$/i, 'round-off'],
  [/^(carried|brought)\s*(forward|over)$/i, 'carried-forward'],
  [/^(grand\s*|sub\s*)?total$/i, 'total'],
];

/**
 * Parses CSV or TSV text (a sales sheet, or a Tally/Busy register export with title rows, merged
 * header rows, page breaks, totals and round-off lines) into checked invoice rows.
 */
export function parseInvoiceCsv(csvText: string, defaultSupplierState: string = '03', options: ParseInvoiceCsvOptions = {}): IngestionBatchResult {
  const kind = options.kind ?? 'SALES';
  const lines = csvText.replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const empty: IngestionBatchResult = {
    totalRows: 0, validRowsCount: 0, errorRowsCount: 0, duplicateRowsCount: 0, headerRow: 0,
    totalTaxableValue: '0.00', totalIgst: '0.00', totalCgst: '0.00', totalSgst: '0.00', rows: [], skipped: [],
  };

  // The header is the first row that looks like one; rows above it are titles.
  let delimiter = ',';
  let headerIdx = -1;
  let header: Partial<Record<Field, number>> = {};
  for (let i = 0; i < lines.length && headerIdx < 0; i++) {
    for (const d of ['\t', ',']) {
      if (!lines[i].includes(d)) continue;
      const map = mapHeader(splitRecord(lines[i], d));
      if (isHeaderRow(map)) {
        delimiter = d;
        headerIdx = i;
        header = map;
        break;
      }
    }
  }
  if (headerIdx < 0) return empty;

  const skipped: SkippedLine[] = [];
  for (let i = 0; i < headerIdx; i++) skipped.push({ rowNumber: i + 1, reason: lines[i].replace(/[,\t\s]/g, '') === '' ? 'blank' : 'title' });

  const rows: IngestedInvoiceRow[] = [];
  const seen = new Map<string, number>();
  let sumTaxable = new Decimal(0);
  let sumIgst = new Decimal(0);
  let sumCgst = new Decimal(0);
  let sumSgst = new Decimal(0);

  for (let lineIdx = headerIdx + 1; lineIdx < lines.length; lineIdx++) {
    const rowNumber = lineIdx + 1;
    const cells = splitRecord(lines[lineIdx], delimiter);
    const get = (field: Field): string => {
      const idx = header[field];
      return idx !== undefined ? (cells[idx] ?? '').trim() : '';
    };

    if (cells.every((c) => c === '')) {
      skipped.push({ rowNumber, reason: 'blank' });
      continue;
    }
    if (isHeaderRow(mapHeader(cells))) {
      skipped.push({ rowNumber, reason: 'header' }); // repeated at a page break
      continue;
    }
    const partyName = get('partyName');
    const special = SKIP_PARTY.find(([re]) => re.test(partyName));
    if (special) {
      skipped.push({ rowNumber, reason: special[1] });
      continue;
    }
    const invoiceNum = get('invoiceNum');
    if (!invoiceNum) {
      // Merged header pieces ("Tax Amount"), section titles and subtotal lines carry no number.
      skipped.push({ rowNumber, reason: 'title' });
      continue;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const rawDate = get('invoiceDate');
    const invoiceDate = parseIndianDate(rawDate);
    if (!invoiceDate) errors.push(`Unreadable invoice date '${rawDate}'`);

    const amounts: Record<'taxableValue' | 'igstAmount' | 'cgstAmount' | 'sgstAmount' | 'cessAmount', Decimal> = {
      taxableValue: new Decimal(0), igstAmount: new Decimal(0), cgstAmount: new Decimal(0), sgstAmount: new Decimal(0), cessAmount: new Decimal(0),
    };
    for (const f of Object.keys(amounts) as Array<keyof typeof amounts>) {
      const v = parseAmount(get(f));
      if (v === null) errors.push(`Unreadable amount '${get(f)}' in ${f}`);
      else amounts[f] = v;
    }
    const { taxableValue: taxableDec, igstAmount: igstDec, cgstAmount: cgstDec, sgstAmount: sgstDec, cessAmount: cessDec } = amounts;
    const totalDec = taxableDec.plus(igstDec).plus(cgstDec).plus(sgstDec).plus(cessDec);

    const partyGstin = get('partyGstin').replace(/\s+/g, '').toUpperCase() || undefined;
    if (partyGstin) {
      const g = validateGstin(partyGstin);
      if (!g.isValid) errors.push(g.error || 'Invalid GSTIN');
    }

    let posStateCode = get('posStateCode') || (partyGstin ? partyGstin.slice(0, 2) : defaultSupplierState);
    if (posStateCode.length === 1) posStateCode = `0${posStateCode}`;

    const note = (msg: string) => (kind === 'SALES' ? errors : warnings).push(msg);
    const rule46 = validateInvoiceNumberRule46(invoiceNum);
    if (!rule46.isValid) note(rule46.error || 'Rule 46(b) invalid invoice number');
    const pos = validatePlaceOfSupply({ supplierStateCode: defaultSupplierState, posStateCode, igstAmount: igstDec, cgstAmount: cgstDec, sgstAmount: sgstDec });
    if (!pos.isValid) note(pos.error || 'Place of supply does not match the tax heads');

    const isValid = errors.length === 0;
    let duplicateOfRow: number | undefined;
    if (isValid) {
      const key = [partyGstin ?? '', invoiceNum.toUpperCase(), invoiceDate, taxableDec.toFixed(2)].join('|');
      duplicateOfRow = seen.get(key);
      if (duplicateOfRow !== undefined) warnings.push(`Same invoice as row ${duplicateOfRow}; counted once`);
      else {
        seen.set(key, rowNumber);
        sumTaxable = sumTaxable.plus(taxableDec);
        sumIgst = sumIgst.plus(igstDec);
        sumCgst = sumCgst.plus(cgstDec);
        sumSgst = sumSgst.plus(sgstDec);
      }
    }

    rows.push({
      rowNumber,
      invoiceNum: kind === 'SALES' ? rule46.sanitizedInvoiceNumber || invoiceNum : invoiceNum,
      invoiceDate: invoiceDate ?? rawDate,
      partyGstin,
      partyName: partyName || undefined,
      voucherType: get('voucherType') || undefined,
      posStateCode,
      taxableValue: taxableDec.toFixed(2),
      igstAmount: igstDec.toFixed(2),
      cgstAmount: cgstDec.toFixed(2),
      sgstAmount: sgstDec.toFixed(2),
      cessAmount: cessDec.toFixed(2),
      totalInvoiceValue: totalDec.toFixed(2),
      isValid,
      validationErrors: errors,
      warnings,
      ...(duplicateOfRow !== undefined ? { duplicateOfRow } : {}),
    });
  }

  const validRowsCount = rows.filter((r) => r.isValid).length;
  return {
    totalRows: rows.length,
    validRowsCount,
    errorRowsCount: rows.length - validRowsCount,
    duplicateRowsCount: rows.filter((r) => r.duplicateOfRow !== undefined).length,
    headerRow: headerIdx + 1,
    totalTaxableValue: sumTaxable.toFixed(2),
    totalIgst: sumIgst.toFixed(2),
    totalCgst: sumCgst.toFixed(2),
    totalSgst: sumSgst.toFixed(2),
    rows,
    skipped,
  };
}

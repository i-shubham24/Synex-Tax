import { Decimal } from 'decimal.js';
import { validateGstin, validateInvoiceNumberRule46, validatePlaceOfSupply } from '@synextax/tax-engine';

export interface IngestedInvoiceRow {
  rowNumber: number;
  invoiceNum: string;
  invoiceDate: string; // YYYY-MM-DD
  partyGstin?: string;
  partyName?: string;
  posStateCode: string;
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  cessAmount: string;
  totalInvoiceValue: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface IngestionBatchResult {
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  totalTaxableValue: string;
  totalIgst: string;
  totalCgst: string;
  totalSgst: string;
  rows: IngestedInvoiceRow[];
}

// Column header aliases for smart auto-detection
const HEADER_ALIASES: Record<string, RegExp> = {
  invoiceNum: /^(invoice\s*(no|num|number)?|inv\s*(no|num)?|bill\s*(no|number)?|doc\s*(no|num)?|voucher\s*(no)?)$/i,
  invoiceDate: /^(invoice\s*date|inv\s*date|bill\s*date|doc\s*date|date)$/i,
  partyGstin: /^(party\s*gstin|buyer\s*gstin|customer\s*gstin|supplier\s*gstin|vendor\s*gstin|gstin(\/uin)?)$/i,
  partyName: /^(party\s*name|buyer\s*name|customer\s*name|supplier\s*name|vendor\s*name|legal\s*name|name)$/i,
  posStateCode: /^(pos|place\s*of\s*supply|state\s*code|pos\s*code)$/i,
  taxableValue: /^(taxable\s*(value|amount)?|assessable\s*value|taxable)$/i,
  igstAmount: /^(integrated\s*tax(\s*amount)?|igst(\s*amount)?)$/i,
  cgstAmount: /^(central\s*tax(\s*amount)?|cgst(\s*amount)?)$/i,
  sgstAmount: /^(state\s*tax(\s*amount)?|ut\s*tax|sgst(\s*amount)?|utgst(\s*amount)?)$/i,
  cessAmount: /^(cess(\s*amount)?)$/i,
};

function normalizeDate(raw: string): string {
  const trimmed = (raw || '').trim();
  // Handle DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

function parseDecimalString(raw: string | undefined): Decimal {
  if (!raw) return new Decimal(0);
  const clean = raw.toString().replace(/[^0-9.\-]/g, '').trim();
  if (!clean || isNaN(Number(clean))) return new Decimal(0);
  return new Decimal(clean);
}

/**
 * Parses raw CSV text or TSV text into validated statutory invoice rows.
 */
export function parseInvoiceCsv(csvText: string, defaultSupplierState: string = '03'): IngestionBatchResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      totalTaxableValue: '0.00',
      totalIgst: '0.00',
      totalCgst: '0.00',
      totalSgst: '0.00',
      rows: [],
    };
  }

  // Parse header line (detect delimiter: comma or tab)
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));

  // Map header indices
  const headerMap: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (const [key, regex] of Object.entries(HEADER_ALIASES)) {
      if (regex.test(h) && headerMap[key as keyof typeof HEADER_ALIASES] === undefined) {
        headerMap[key as keyof typeof HEADER_ALIASES] = i;
        break;
      }
    }
  }

  const rows: IngestedInvoiceRow[] = [];
  let sumTaxable = new Decimal(0);
  let sumIgst = new Decimal(0);
  let sumCgst = new Decimal(0);
  let sumSgst = new Decimal(0);

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const cells = rawLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));

    const getVal = (field: keyof typeof HEADER_ALIASES): string => {
      const idx = headerMap[field];
      return idx !== undefined && cells[idx] !== undefined ? cells[idx] : '';
    };

    const invoiceNum = getVal('invoiceNum');
    const invoiceDate = normalizeDate(getVal('invoiceDate'));
    const partyGstin = getVal('partyGstin').toUpperCase() || undefined;
    const partyName = getVal('partyName');

    const taxableDec = parseDecimalString(getVal('taxableValue'));
    const igstDec = parseDecimalString(getVal('igstAmount'));
    const cgstDec = parseDecimalString(getVal('cgstAmount'));
    const sgstDec = parseDecimalString(getVal('sgstAmount'));
    const cessDec = parseDecimalString(getVal('cessAmount'));
    const totalDec = taxableDec.plus(igstDec).plus(cgstDec).plus(sgstDec).plus(cessDec);

    let posStateCode = getVal('posStateCode') || (partyGstin ? partyGstin.slice(0, 2) : defaultSupplierState);
    if (posStateCode.length === 1) posStateCode = `0${posStateCode}`;

    // Validations
    const errors: string[] = [];

    // Rule 46(b)
    const rule46 = validateInvoiceNumberRule46(invoiceNum);
    if (!rule46.isValid) errors.push(rule46.error || 'Rule 46(b) invalid invoice number');

    // Date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      errors.push(`Invalid invoice date format: '${invoiceDate}' (expected YYYY-MM-DD or DD/MM/YYYY)`);
    }

    // GSTIN
    if (partyGstin) {
      const gstinRes = validateGstin(partyGstin);
      if (!gstinRes.isValid) errors.push(gstinRes.error || 'Invalid GSTIN');
    }

    // Place of Supply
    const posRes = validatePlaceOfSupply({
      supplierStateCode: defaultSupplierState,
      posStateCode,
      igstAmount: igstDec,
      cgstAmount: cgstDec,
      sgstAmount: sgstDec,
    });
    if (!posRes.isValid) errors.push(posRes.error || 'Place of Supply mismatch');

    const isValid = errors.length === 0;

    if (isValid) {
      sumTaxable = sumTaxable.plus(taxableDec);
      sumIgst = sumIgst.plus(igstDec);
      sumCgst = sumCgst.plus(cgstDec);
      sumSgst = sumSgst.plus(sgstDec);
    }

    rows.push({
      rowNumber: lineIdx + 1,
      invoiceNum: rule46.sanitizedInvoiceNumber || invoiceNum,
      invoiceDate,
      partyGstin,
      partyName: partyName || undefined,
      posStateCode,
      taxableValue: taxableDec.toFixed(2),
      igstAmount: igstDec.toFixed(2),
      cgstAmount: cgstDec.toFixed(2),
      sgstAmount: sgstDec.toFixed(2),
      cessAmount: cessDec.toFixed(2),
      totalInvoiceValue: totalDec.toFixed(2),
      isValid,
      validationErrors: errors,
    });
  }

  const validRowsCount = rows.filter((r) => r.isValid).length;

  return {
    totalRows: rows.length,
    validRowsCount,
    errorRowsCount: rows.length - validRowsCount,
    totalTaxableValue: sumTaxable.toFixed(2),
    totalIgst: sumIgst.toFixed(2),
    totalCgst: sumCgst.toFixed(2),
    totalSgst: sumSgst.toFixed(2),
    rows,
  };
}

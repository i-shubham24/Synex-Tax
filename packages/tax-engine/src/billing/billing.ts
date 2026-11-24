import Decimal from 'decimal.js';
import { GST_RATES } from '../gst/salesRegister.js';
import { GSTN_STATE_CODES, validateGstin } from '../validators/gstin.js';

/**
 * Billing for a firm's small clients: tax invoices, credit notes and debit notes, the stock
 * register and the GSTR-1 tables built from them.
 *
 * Sources:
 *   Tax invoice particulars           CGST Rules 2017, rule 46 (serial number under rule 46(b):
 *                                     up to 16 characters, letters, digits, "-" and "/", unique for a
 *                                     financial year).
 *   Credit and debit note particulars CGST Rules 2017, rule 53(1A).
 *   Intra or inter state              IGST Act 2017, sections 7 and 8: supplier state equal to the
 *                                     place of supply is intra-state (CGST plus SGST), otherwise IGST.
 *   Document number for the IRP       e-invoice validations published with the INV-01 schema
 *                                     (einvoice1.gst.gov.in, EINVOICE_SCHEMA.xlsx, sheet Validations,
 *                                     item 6): no leading 0, "/" or "-", and no lower case letters.
 *   HSN code format                   INV-01 v1.1 schema, ItemList.HsnCd: 4, 6 or 8 digits.
 *   Units (UQC)                       NIC e-way bill master codes (EWB_Attributes_new.xlsx, sheet
 *                                     Master Codes), the same list the GST portal uses.
 *   GSTR-1 tables                     B2B 4A (4B under reverse charge), B2CL 5 (unregistered,
 *                                     inter-state, invoice value above Rs 1,00,000 as in the existing
 *                                     sales register import), B2CS 7, CDNR and CDNUR 9B, HSN 12,
 *                                     documents issued 13.
 */

export type BillingDocType = 'INV' | 'CRN' | 'DBN';
export type BillingSection = 'B2B' | 'B2CL' | 'B2CS' | 'CDNR' | 'CDNUR';

/** Unit quantity codes from the NIC master (EWB_Attributes_new.xlsx, Master Codes). */
export const BILLING_UQC: Record<string, string> = {
  BAG: 'Bags', BAL: 'Bale', BDL: 'Bundles', BKL: 'Buckles', BOU: 'Billion of units', BOX: 'Box', BTL: 'Bottles', BUN: 'Bunches',
  CAN: 'Cans', CBM: 'Cubic meters', CCM: 'Cubic centimeters', CMS: 'Centimeters', CTN: 'Cartons', DOZ: 'Dozens', DRM: 'Drums',
  GGK: 'Great gross', GMS: 'Grammes', GRS: 'Gross', GYD: 'Gross yards', KGS: 'Kilograms', KLR: 'Kilolitre', KME: 'Kilometre',
  LTR: 'Litres', MLT: 'Millilitre', MTR: 'Meters', MTS: 'Metric ton', NOS: 'Numbers', OTH: 'Others', PAC: 'Packs', PCS: 'Pieces',
  PRS: 'Pairs', QTL: 'Quintal', ROL: 'Rolls', SET: 'Sets', SQF: 'Square feet', SQM: 'Square meters', SQY: 'Square yards',
  TBS: 'Tablets', TGM: 'Ten gross', THD: 'Thousands', TON: 'Tonnes', TUB: 'Tubes', UGS: 'US gallons', UNT: 'Units', YDS: 'Yards',
};

/** GST rates accepted on a line (percent; the IGST rate, or CGST plus SGST). */
export const BILLING_GST_RATES = GST_RATES;

/** B2CL and CDNUR: unregistered buyer, inter-state, invoice value above this (as in the sales register import). */
export const B2CL_LIMIT = new Decimal(100000);

const HSN_RE = /^(?!0+$)([0-9]{4}|[0-9]{6}|[0-9]{8})$/;
const DOC_NO_RE = /^[A-Z1-9][A-Z0-9/-]{0,15}$/;

export interface BillingLineInput {
  itemId?: string | null;
  description: string;
  hsn: string;
  isService: boolean;
  unit: string; // UQC
  quantity: string;
  unitPrice: string;
  discount?: string;
  gstRate: number;
  cessRate?: number;
}

export interface BillingDocInput {
  docType: BillingDocType;
  docNo: string;
  docDate: string; // YYYY-MM-DD
  supplierGstin: string;
  customerGstin: string | null;
  placeOfSupply: string; // two-digit state code
  reverseCharge: boolean;
  lines: BillingLineInput[];
  originalDocNo?: string | null;
  originalDocDate?: string | null;
  /** Round the amount payable to the nearest rupee (default true). */
  roundOff?: boolean;
}

export interface BillingLine extends BillingLineInput {
  lineNo: number;
  gross: string;
  discount: string;
  taxable: string;
  igstRate: number;
  cgstRate: number;
  sgstRate: number;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  total: string;
}

export interface BillingTotals {
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  tax: string;
  roundOff: string;
  /** Taxable value plus all tax plus round off: the invoice value for GSTR-1, the IRP and the e-way bill. */
  invoiceValue: string;
  /** What the buyer pays the supplier: the invoice value less the tax when the buyer pays it under reverse charge. */
  amountPayable: string;
}

export interface BillingDoc {
  input: BillingDocInput;
  interState: boolean;
  section: BillingSection;
  table: string;
  lines: BillingLine[];
  totals: BillingTotals;
  errors: string[];
  warnings: string[];
}

const D0 = new Decimal(0);
const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const dec = (s: string | undefined | null): Decimal | null => {
  if (s === undefined || s === null || String(s).trim() === '') return D0;
  try {
    const d = new Decimal(String(s).replace(/,/g, '').trim());
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
};
const isIsoDate = (s: string | null | undefined): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Start year of the Indian financial year (April to March) a date falls in. */
export function billingFinancialYear(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return Number(isoDate.slice(5, 7)) >= 4 ? y : y - 1;
}

/** "2026-27" for 2026. */
export const billingFyLabel = (fy: number) => `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;

/** Why a document number fails rule 46(b) or the IRP's rules, or null when it is fine. */
export function billingDocNoError(docNo: string): string | null {
  if (!docNo) return 'Document number is required.';
  if (docNo.length > 16) return `Document number ${docNo} is longer than 16 characters (rule 46(b)).`;
  if (!DOC_NO_RE.test(docNo)) return `Document number ${docNo} may use only capital letters, digits, "-" and "/", and may not start with 0, "-" or "/".`;
  return null;
}

/** Next number of a series: prefix followed by the number padded to `pad` digits. */
export function formatSeriesNumber(prefix: string, n: number, pad: number): string {
  return `${prefix}${String(n).padStart(Math.max(1, pad), '0')}`;
}

/** Why a series prefix cannot be used (it must leave room for the number within 16 characters). */
export function seriesPrefixError(prefix: string, pad: number): string | null {
  if (prefix && !/^[A-Z1-9][A-Z0-9/-]*$/.test(prefix)) return 'The prefix may use capital letters, digits, "-" and "/", and may not start with 0, "-" or "/".';
  if (!prefix && pad < 1) return 'Give a prefix or a number width.';
  if (prefix.length + pad > 16) return `Prefix and number together exceed 16 characters (rule 46(b)).`;
  return null;
}

export function billingSectionFor(docType: BillingDocType, customerGstin: string | null, interState: boolean, invoiceValue: Decimal, reverseCharge: boolean): { section: BillingSection; table: string } {
  if (docType === 'INV') {
    if (customerGstin) return { section: 'B2B', table: reverseCharge ? '4B' : '4A' };
    if (interState && invoiceValue.gt(B2CL_LIMIT)) return { section: 'B2CL', table: '5' };
    return { section: 'B2CS', table: '7' };
  }
  if (customerGstin) return { section: 'CDNR', table: '9B' };
  // A note to an unregistered buyer is reported in 9B only against a large inter-state (B2CL) sale;
  // otherwise it adjusts the B2CS figures of table 7.
  if (interState && invoiceValue.gt(B2CL_LIMIT)) return { section: 'CDNUR', table: '9B' };
  return { section: 'B2CS', table: '7' };
}

/** Computes the lines, the tax split and the totals of an invoice or note, and checks it. */
export function computeBillingDoc(input: BillingDocInput): BillingDoc {
  const errors: string[] = [];
  const warnings: string[] = [];
  const noErr = billingDocNoError(input.docNo);
  if (noErr) errors.push(noErr);
  if (!['INV', 'CRN', 'DBN'].includes(input.docType)) errors.push('Document type must be INV, CRN or DBN.');
  if (!isIsoDate(input.docDate)) errors.push('Document date is not a date.');

  const sup = validateGstin(input.supplierGstin ?? '');
  if (!sup.isValid) errors.push(`Supplier GSTIN: ${sup.error ?? 'not valid'}.`);
  const supplierState = (input.supplierGstin ?? '').slice(0, 2);

  const customerGstin = input.customerGstin ? input.customerGstin.toUpperCase() : null;
  if (customerGstin) {
    const v = validateGstin(customerGstin);
    if (!v.isValid) errors.push(`Customer GSTIN: ${v.error ?? 'not valid'}.`);
    if (customerGstin === input.supplierGstin) errors.push('The customer GSTIN is the supplier GSTIN.');
  }
  const pos = input.placeOfSupply;
  if (!GSTN_STATE_CODES[pos] || pos === '96') errors.push(`Place of supply ${pos} is not an Indian state or union territory code (exports are not billed here).`);
  if (input.reverseCharge && !customerGstin) errors.push('Reverse charge applies only to a registered buyer.');

  if (input.docType !== 'INV') {
    const hasRef = !!input.originalDocNo && isIsoDate(input.originalDocDate ?? null);
    if (input.originalDocDate && !isIsoDate(input.originalDocDate)) errors.push('Original invoice date is not a date.');
    // The sales table refuses a credit note dated before 1 November 2026 without the original invoice (migration 0006).
    if (!hasRef && input.docType === 'CRN' && isIsoDate(input.docDate) && input.docDate < '2026-11-01') errors.push('A credit note dated before 1 November 2026 needs the original invoice number and date.');
    else if (!hasRef) warnings.push('No original invoice number and date: rule 53(1A) lists them among the particulars of a note.');
    if (input.originalDocNo && billingDocNoError(input.originalDocNo.toUpperCase())) errors.push('Original invoice number is not a valid document number.');
  }

  const interState = pos !== supplierState;
  if (!input.lines?.length) errors.push('Add at least one line.');
  if ((input.lines?.length ?? 0) > 1000) errors.push('An invoice can carry at most 1,000 lines (IRP limit).');

  const lines: BillingLine[] = [];
  const t = { taxable: D0, igst: D0, cgst: D0, sgst: D0, cess: D0 };
  (input.lines ?? []).forEach((l, i) => {
    const n = i + 1;
    const qty = dec(l.quantity);
    const price = dec(l.unitPrice);
    const disc = dec(l.discount ?? '0');
    if (!l.description || l.description.trim().length < 3) errors.push(`Line ${n}: describe the goods or service (at least 3 characters).`);
    if (!HSN_RE.test(l.hsn ?? '')) errors.push(`Line ${n}: HSN or SAC ${l.hsn ?? ''} must be 4, 6 or 8 digits.`);
    if (!l.isService && !BILLING_UQC[l.unit]) errors.push(`Line ${n}: unit ${l.unit} is not a GST unit code (UQC).`);
    if (qty === null || qty.lte(0) || qty.decimalPlaces() > 3) errors.push(`Line ${n}: quantity must be more than zero, up to 3 decimals.`);
    if (price === null || price.lt(0) || price.decimalPlaces() > 3) errors.push(`Line ${n}: rate must be zero or more, up to 3 decimals.`);
    if (!BILLING_GST_RATES.includes(l.gstRate)) errors.push(`Line ${n}: ${l.gstRate}% is not a GST rate.`);
    const cessRate = l.cessRate ?? 0;
    if (!(cessRate >= 0 && cessRate <= 999)) errors.push(`Line ${n}: cess rate is not valid.`);
    const gross = r2((qty ?? D0).mul(price ?? D0));
    if (disc === null || disc.lt(0) || disc.gt(gross)) errors.push(`Line ${n}: discount must be between zero and the line amount.`);
    const discount = r2(disc ?? D0);
    const taxable = gross.sub(discount);
    const rate = new Decimal(BILLING_GST_RATES.includes(l.gstRate) ? l.gstRate : 0);
    const igst = interState ? r2(taxable.mul(rate).div(100)) : D0;
    const cgst = interState ? D0 : r2(taxable.mul(rate).div(200));
    const sgst = cgst;
    const cess = r2(taxable.mul(cessRate).div(100));
    t.taxable = t.taxable.add(taxable);
    t.igst = t.igst.add(igst);
    t.cgst = t.cgst.add(cgst);
    t.sgst = t.sgst.add(sgst);
    t.cess = t.cess.add(cess);
    lines.push({
      ...l,
      lineNo: n,
      gross: gross.toFixed(2),
      discount: discount.toFixed(2),
      taxable: taxable.toFixed(2),
      igstRate: interState ? l.gstRate : 0,
      cgstRate: interState ? 0 : l.gstRate / 2,
      sgstRate: interState ? 0 : l.gstRate / 2,
      igst: igst.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      cess: cess.toFixed(2),
      total: taxable.add(igst).add(cgst).add(sgst).add(cess).toFixed(2),
    });
  });

  const tax = t.igst.add(t.cgst).add(t.sgst).add(t.cess);
  const payableBeforeRound = input.reverseCharge ? t.taxable : t.taxable.add(tax);
  const roundOff = input.roundOff === false ? D0 : payableBeforeRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).sub(payableBeforeRound);
  const invoiceValue = t.taxable.add(tax).add(roundOff);
  const amountPayable = payableBeforeRound.add(roundOff);
  const { section, table } = billingSectionFor(input.docType, customerGstin, interState, invoiceValue, input.reverseCharge);

  return {
    input: { ...input, customerGstin },
    interState,
    section,
    table,
    lines,
    totals: {
      taxable: t.taxable.toFixed(2),
      igst: t.igst.toFixed(2),
      cgst: t.cgst.toFixed(2),
      sgst: t.sgst.toFixed(2),
      cess: t.cess.toFixed(2),
      tax: tax.toFixed(2),
      roundOff: roundOff.toFixed(2),
      invoiceValue: invoiceValue.toFixed(2),
      amountPayable: amountPayable.toFixed(2),
    },
    errors,
    warnings,
  };
}


/* GSTR-1 from billing documents */


/** A stored document as the GSTR-1 builders read it. */
export interface BillingStoredDoc {
  docType: BillingDocType;
  docNo: string;
  docDate: string;
  seriesPrefix?: string | null;
  seriesNo?: number | null;
  cancelled: boolean;
  customerGstin: string | null;
  customerName: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  interState: boolean;
  invoiceValue: string;
  originalDocNo?: string | null;
  originalDocDate?: string | null;
  lines: Array<{ hsn: string; isService: boolean; unit: string; quantity: string; gstRate: number; taxable: string; igst: string; cgst: string; sgst: string; cess: string }>;
}

/** One row of public.gst_invoices_sales: one per document and GST rate. */
export interface BillingSalesRow {
  invoiceNo: string;
  invoiceDate: string;
  docType: BillingDocType;
  supplyType: 'B2B' | 'B2CL' | 'B2CS';
  section: BillingSection;
  table: string;
  customerGstin: string | null;
  customerName: string;
  pos: string;
  reverseCharge: boolean;
  rate: number;
  igstRate: string;
  cgstRate: string;
  sgstRate: string;
  taxableValue: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  invoiceValue: string;
  originalInvoiceNo: string | null;
  originalInvoiceDate: string | null;
  /** 0 for the first rate of a document, 1 for the second, and so on. */
  rateIndex: number;
}

const SUPPLY_TYPE: Record<BillingSection, BillingSalesRow['supplyType']> = { B2B: 'B2B', B2CL: 'B2CL', B2CS: 'B2CS', CDNR: 'B2B', CDNUR: 'B2CL' };

/** Splits active documents into sales register rows by GST rate, the shape GSTR-1 reports them in. */
export function billingSalesRows(docs: BillingStoredDoc[]): BillingSalesRow[] {
  const out: BillingSalesRow[] = [];
  for (const d of docs) {
    if (d.cancelled) continue;
    const { section, table } = billingSectionFor(d.docType, d.customerGstin, d.interState, new Decimal(d.invoiceValue), d.reverseCharge);
    const byRate = new Map<number, Decimal[]>();
    for (const l of d.lines) {
      const v = byRate.get(l.gstRate) ?? [D0, D0, D0, D0, D0];
      [l.taxable, l.igst, l.cgst, l.sgst, l.cess].forEach((x, k) => (v[k] = v[k].add(new Decimal(x))));
      byRate.set(l.gstRate, v);
    }
    [...byRate.entries()].sort((a, b) => a[0] - b[0]).forEach(([rate, v], i) => {
      const fraction = new Decimal(rate).div(100);
      out.push({
        invoiceNo: d.docNo,
        invoiceDate: d.docDate,
        docType: d.docType,
        supplyType: SUPPLY_TYPE[section],
        section,
        table,
        customerGstin: d.customerGstin,
        customerName: d.customerName,
        pos: d.placeOfSupply,
        reverseCharge: d.reverseCharge,
        rate,
        igstRate: (d.interState ? fraction : D0).toFixed(4),
        cgstRate: (d.interState ? D0 : fraction.div(2)).toFixed(4),
        sgstRate: (d.interState ? D0 : fraction.div(2)).toFixed(4),
        taxableValue: v[0].toFixed(2),
        igst: v[1].toFixed(2),
        cgst: v[2].toFixed(2),
        sgst: v[3].toFixed(2),
        cess: v[4].toFixed(2),
        invoiceValue: d.invoiceValue,
        originalInvoiceNo: d.originalDocNo ?? null,
        originalInvoiceDate: d.originalDocDate ?? null,
        rateIndex: i,
      });
    });
  }
  return out;
}

export interface BillingHsnRow {
  /** Table 12 is reported separately for supplies to registered (B2B) and unregistered (B2C) buyers. */
  tab: 'B2B' | 'B2C';
  hsn: string;
  uqc: string;
  rate: number;
  quantity: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  totalValue: string;
}

/** GSTR-1 table 12 (HSN-wise summary). Credit notes reduce the figures; services carry UQC NA. */
export function billingHsnSummary(docs: BillingStoredDoc[]): BillingHsnRow[] {
  const by = new Map<string, { tab: 'B2B' | 'B2C'; hsn: string; uqc: string; rate: number; v: Decimal[] }>();
  for (const d of docs) {
    if (d.cancelled) continue;
    const sign = d.docType === 'CRN' ? -1 : 1;
    const tab = d.customerGstin ? 'B2B' : 'B2C';
    for (const l of d.lines) {
      const uqc = l.isService ? 'NA' : l.unit;
      const key = `${tab}|${l.hsn}|${uqc}|${l.gstRate}`;
      const cur = by.get(key) ?? { tab, hsn: l.hsn, uqc, rate: l.gstRate, v: [D0, D0, D0, D0, D0, D0] };
      const qty = l.isService ? D0 : new Decimal(l.quantity);
      [qty, l.taxable, l.igst, l.cgst, l.sgst, l.cess].forEach((x, k) => (cur.v[k] = cur.v[k].add(new Decimal(x).mul(sign))));
      by.set(key, cur);
    }
  }
  return [...by.values()]
    .sort((a, b) => a.tab.localeCompare(b.tab) || a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
    .map((x) => ({
      tab: x.tab,
      hsn: x.hsn,
      uqc: x.uqc,
      rate: x.rate,
      quantity: x.v[0].toFixed(3),
      taxable: x.v[1].toFixed(2),
      igst: x.v[2].toFixed(2),
      cgst: x.v[3].toFixed(2),
      sgst: x.v[4].toFixed(2),
      cess: x.v[5].toFixed(2),
      totalValue: x.v[1].add(x.v[2]).add(x.v[3]).add(x.v[4]).add(x.v[5]).toFixed(2),
    }));
}

export interface BillingDocsIssuedRow {
  nature: 'Invoices for outward supply' | 'Debit note' | 'Credit note';
  docType: BillingDocType;
  series: string;
  from: string;
  to: string;
  total: number;
  cancelled: number;
  netIssued: number;
}

const NATURE: Record<BillingDocType, BillingDocsIssuedRow['nature']> = { INV: 'Invoices for outward supply', DBN: 'Debit note', CRN: 'Credit note' };

/** GSTR-1 table 13 (documents issued), by document type and series, cancelled documents counted. */
export function billingDocumentsIssued(docs: BillingStoredDoc[]): BillingDocsIssuedRow[] {
  const by = new Map<string, { docType: BillingDocType; series: string; items: BillingStoredDoc[] }>();
  for (const d of docs) {
    const series = d.seriesPrefix ?? '';
    const key = `${d.docType}|${series}`;
    const cur = by.get(key) ?? { docType: d.docType, series, items: [] };
    cur.items.push(d);
    by.set(key, cur);
  }
  const order: BillingDocType[] = ['INV', 'DBN', 'CRN'];
  return [...by.values()]
    .sort((a, b) => order.indexOf(a.docType) - order.indexOf(b.docType) || a.series.localeCompare(b.series))
    .map((g) => {
      const sorted = [...g.items].sort((a, b) => (a.seriesNo ?? 0) - (b.seriesNo ?? 0) || a.docNo.localeCompare(b.docNo));
      const cancelled = g.items.filter((d) => d.cancelled).length;
      return {
        nature: NATURE[g.docType],
        docType: g.docType,
        series: g.series,
        from: sorted[0].docNo,
        to: sorted[sorted.length - 1].docNo,
        total: g.items.length,
        cancelled,
        netIssued: g.items.length - cancelled,
      };
    });
}

export interface BillingGstr1SectionRow {
  section: BillingSection;
  table: string;
  documents: number;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
}

/** Totals by GSTR-1 section (B2B, B2CL, B2CS, CDNR, CDNUR). Credit notes reduce the totals. */
export function billingGstr1Sections(docs: BillingStoredDoc[]): BillingGstr1SectionRow[] {
  const by = new Map<string, { section: BillingSection; table: string; docs: Set<string>; v: Decimal[] }>();
  for (const r of billingSalesRows(docs)) {
    const key = `${r.section}|${r.table}`;
    const cur = by.get(key) ?? { section: r.section, table: r.table, docs: new Set<string>(), v: [D0, D0, D0, D0, D0] };
    const sign = r.docType === 'CRN' ? -1 : 1;
    [r.taxableValue, r.igst, r.cgst, r.sgst, r.cess].forEach((x, k) => (cur.v[k] = cur.v[k].add(new Decimal(x).mul(sign))));
    cur.docs.add(`${r.docType}|${r.invoiceNo}`);
    by.set(key, cur);
  }
  const order: BillingSection[] = ['B2B', 'B2CL', 'B2CS', 'CDNR', 'CDNUR'];
  return [...by.values()]
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.table.localeCompare(b.table))
    .map((x) => ({ section: x.section, table: x.table, documents: x.docs.size, taxable: x.v[0].toFixed(2), igst: x.v[1].toFixed(2), cgst: x.v[2].toFixed(2), sgst: x.v[3].toFixed(2), cess: x.v[4].toFixed(2) }));
}


/* Stock register */


export interface StockItemInput {
  id: string;
  name: string;
  unit: string;
  isService: boolean;
  openingQty: string;
  openingValue: string;
}

export interface StockMovement {
  itemId: string;
  date: string;
  kind: 'PURCHASE' | 'SALE' | 'SALES_RETURN';
  reference: string;
  quantity: string;
  value?: string; // purchases only
}

export interface StockRow {
  itemId: string;
  name: string;
  unit: string;
  openingQty: string;
  openingValue: string;
  inwardQty: string;
  inwardValue: string;
  outwardQty: string;
  returnedQty: string;
  closingQty: string;
  averageCost: string;
  closingValue: string;
  short: boolean;
}

/**
 * Quantity and value by item: opening stock, purchases in, sales out and sales returns (credit
 * notes with quantities) back in. Closing stock is valued at the weighted average cost of the
 * opening stock and the purchases.
 */
export function billingStockRegister(items: StockItemInput[], movements: StockMovement[]): StockRow[] {
  return items
    .filter((i) => !i.isService)
    .map((i) => {
      const mine = movements.filter((m) => m.itemId === i.id);
      const sum = (kind: StockMovement['kind'], f: (m: StockMovement) => string | undefined) => mine.filter((m) => m.kind === kind).reduce((s, m) => s.add(new Decimal(f(m) ?? 0)), D0);
      const oq = new Decimal(i.openingQty || 0);
      const ov = new Decimal(i.openingValue || 0);
      const iq = sum('PURCHASE', (m) => m.quantity);
      const iv = sum('PURCHASE', (m) => m.value);
      const sq = sum('SALE', (m) => m.quantity);
      const rq = sum('SALES_RETURN', (m) => m.quantity);
      const baseQty = oq.add(iq);
      const avg = baseQty.gt(0) ? ov.add(iv).div(baseQty) : D0;
      const closingQty = baseQty.sub(sq).add(rq);
      return {
        itemId: i.id,
        name: i.name,
        unit: i.unit,
        openingQty: oq.toFixed(3),
        openingValue: ov.toFixed(2),
        inwardQty: iq.toFixed(3),
        inwardValue: iv.toFixed(2),
        outwardQty: sq.toFixed(3),
        returnedQty: rq.toFixed(3),
        closingQty: closingQty.toFixed(3),
        averageCost: avg.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
        closingValue: closingQty.gt(0) ? r2(closingQty.mul(avg)).toFixed(2) : '0.00',
        short: closingQty.lt(0),
      };
    });
}

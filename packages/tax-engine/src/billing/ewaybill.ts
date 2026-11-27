import Decimal from 'decimal.js';
import type { BillingDoc } from './billing.js';
import type { EinvParty } from './einvoice.js';

/**
 * e-way bill bulk generation JSON (NIC, docs.ewaybillgst.gov.in, Bulk Generation Attributes and
 * Tools: EWB_Attributes_new.xlsx, attributes version 1.0.0621, sheets Schema, Validations and
 * Master Codes). A copy of the schema is in schemas/gst/EWB_Bulk_JSON_Schema_1.0.0621.json and the
 * tests validate against it.
 *
 * Threshold: CGST Rules 2017, rule 138(1), movement of goods of consignment value exceeding
 * Rs 50,000. The consignment value includes the tax and leaves out exempt supplies (rule 138,
 * Explanation 2); nil rated lines are exempt supplies under section 2(47) of the CGST Act, and
 * services do not move. Some states notify a higher limit for movement within the state; the
 * caller can pass that limit.
 *
 * Master codes used: supplyType O (outward), subSupplyType 1 (supply), docType INV (tax invoice),
 * transMode 1 road, 2 rail, 3 air, 4 ship or road cum ship, vehicleType R regular or O over
 * dimensional cargo, transType 1 (regular: no bill to ship to or dispatch from party), toGstin URP
 * for an unregistered buyer. Validations sheet: road needs a vehicle number or a transporter id;
 * rail, air and ship need the transport document number and date, not earlier than the invoice;
 * distance at most 4,000 km.
 */

export const EWAY_BILL_JSON_VERSION = '1.0.0621';
export const EWAY_BILL_LIMIT = new Decimal(50000);

/** Transport mode enum including GSTN Nov 21, 2026 Metro Rail mode (code 5). */
export const EWAY_TRANSPORT_MODES = {
  ROAD: 1,
  RAIL: 2,
  AIR: 3,
  SHIP: 4,
  METRO_RAIL: 5,
} as const;

export type EwayTransportModeInput = 1 | 2 | 3 | 4 | 5 | 'ROAD' | 'RAIL' | 'AIR' | 'SHIP' | 'METRO' | 'METRO_RAIL';

export function normalizeEwayTransportMode(mode: EwayTransportModeInput): 1 | 2 | 3 | 4 | 5 | null {
  if (mode === 1 || mode === 'ROAD') return 1;
  if (mode === 2 || mode === 'RAIL') return 2;
  if (mode === 3 || mode === 'AIR') return 3;
  if (mode === 4 || mode === 'SHIP') return 4;
  if (mode === 5 || mode === 'METRO' || mode === 'METRO_RAIL') return 5;
  return null;
}

/**
 * Dual-length E-Way Bill validator: supports 12-digit legacy and 14-digit Jan 2027 numbers,
 * plus variable-length alphanumeric EWB numbers when GSTN Advisory 687 flag is enabled.
 */
export function validateEwayBillNumber(ewbNo: string, options?: { allowVariableAdv687?: boolean }): boolean {
  const cleanEwb = (ewbNo ?? '').trim();
  if (/^(\d{12}|\d{14})$/.test(cleanEwb)) return true;
  if (options?.allowVariableAdv687) return /^[0-9A-Za-z]{10,32}$/.test(cleanEwb);
  return false;
}

export interface EwayTransport {
  mode: 1 | 2 | 3 | 4 | 5;
  distanceKm: number;
  vehicleNo?: string | null;
  vehicleType?: 'R' | 'O' | null;
  transporterId?: string | null;
  transporterName?: string | null;
  transDocNo?: string | null;
  transDocDate?: string | null; // YYYY-MM-DD
}

const num = (s: string | Decimal) => new Decimal(s).toNumber();
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const clean = (s: string | null | undefined, max: number) => (s ?? '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Consignment value of the goods on a document under rule 138: taxable value plus tax of the taxable goods lines. */
export function ewayConsignmentValue(doc: BillingDoc): Decimal {
  return doc.lines
    .filter((l) => !l.isService && l.gstRate > 0)
    .reduce((s, l) => s.add(new Decimal(l.total)), new Decimal(0));
}

/** True when the goods on an invoice need an e-way bill. */
export function ewayBillRequired(doc: BillingDoc, limit: Decimal = EWAY_BILL_LIMIT): boolean {
  return doc.input.docType === 'INV' && ewayConsignmentValue(doc).gt(limit);
}

export function ewayTransportErrors(t: EwayTransport, docDate: string): string[] {
  const e: string[] = [];
  if (![1, 2, 3, 4, 5].includes(t.mode)) e.push('Mode of transport must be road, rail, air, ship or metro rail.');
  if (!Number.isInteger(t.distanceKm) || t.distanceKm < 1 || t.distanceKm > 4000) e.push('Distance must be a whole number of kilometres from 1 to 4,000.');
  const vehicle = (t.vehicleNo ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (vehicle && !/^[A-Z0-9]{7,15}$/.test(vehicle)) e.push('Vehicle number should be letters and digits, as on the registration (for example PB10AB1234).');
  if (t.transporterId && !/^[0-9]{2}[0-9A-Z]{13}$/.test(t.transporterId)) e.push('Transporter id must be a 15 character GSTIN or TRANSIN.');
  if (t.mode === 1 && !vehicle && !t.transporterId) e.push('For road transport give the vehicle number or the transporter id.');
  if (t.mode !== 1) {
    if (!t.transDocNo) e.push('For rail, air, ship or metro rail give the transport document number.');
    if (!t.transDocDate) e.push('For rail, air, ship or metro rail give the transport document date.');
  }
  if (t.transDocNo && (t.transDocNo.length > 15 || !/^[A-Za-z0-9/-]+$/.test(t.transDocNo))) e.push('Transport document number: up to 15 letters, digits, "/" or "-".');
  if (t.transDocDate && t.transDocDate < docDate) e.push('The transport document date cannot be before the invoice date.');
  return e;
}

/** One entry of billLists for a tax invoice. */
export function buildEwayBillEntry(doc: BillingDoc, seller: EinvParty, buyer: EinvParty, transport: EwayTransport): { entry: Record<string, unknown>; errors: string[] } {
  const d = doc.input;
  const errors = [...doc.errors];
  if (d.docType !== 'INV') errors.push('An e-way bill is prepared here only for a tax invoice.');
  errors.push(...ewayTransportErrors(transport, d.docDate));
  const goods = doc.lines.filter((l) => !l.isService);
  if (!goods.length) errors.push('The invoice has no goods, so no e-way bill is needed.');
  for (const [label, p] of [['Seller', seller], ['Buyer', buyer]] as const) {
    if (!/^[1-9][0-9]{5}$/.test(p.pincode ?? '')) errors.push(`${label}: PIN code must be 6 digits.`);
  }
  const vehicle = (transport.vehicleNo ?? '').toUpperCase().replace(/[\s-]/g, '');
  const toState = Number(d.customerGstin ? d.customerGstin.slice(0, 2) : d.placeOfSupply);
  const sum = (f: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'cess') => goods.reduce((s, l) => s.add(new Decimal(l[f])), new Decimal(0));
  const taxable = sum('taxable');
  const tax = sum('igst').add(sum('cgst')).add(sum('sgst')).add(sum('cess'));
  const mainHsn = [...goods].sort((a, b) => new Decimal(b.taxable).cmp(new Decimal(a.taxable)))[0]?.hsn ?? '';

  const entry: Record<string, unknown> = {
    userGstin: d.supplierGstin,
    supplyType: 'O',
    subSupplyType: 1,
    subSupplyDesc: '',
    docType: 'INV',
    docNo: d.docNo,
    docDate: ddmmyyyy(d.docDate),
    transType: 1,
    fromGstin: d.supplierGstin,
    fromTrdName: clean(seller.tradeName || seller.legalName, 100),
    fromAddr1: clean(seller.address1, 120),
    fromAddr2: clean(seller.address2, 120),
    fromPlace: clean(seller.place, 50),
    fromPincode: Number(seller.pincode),
    fromStateCode: Number(d.supplierGstin.slice(0, 2)),
    actualFromStateCode: Number(d.supplierGstin.slice(0, 2)),
    toGstin: d.customerGstin ?? 'URP',
    toTrdName: clean(buyer.tradeName || buyer.legalName, 100),
    toAddr1: clean(buyer.address1, 120),
    toAddr2: clean(buyer.address2, 120),
    toPlace: clean(buyer.place, 50),
    toPincode: Number(buyer.pincode),
    toStateCode: toState,
    actualToStateCode: Number(d.placeOfSupply),
    totalValue: num(taxable),
    cgstValue: num(sum('cgst')),
    sgstValue: num(sum('sgst')),
    igstValue: num(sum('igst')),
    cessValue: num(sum('cess')),
    TotNonAdvolVal: 0,
    OthValue: num(new Decimal(doc.totals.invoiceValue).sub(taxable).sub(tax)),
    totInvValue: num(doc.totals.invoiceValue),
    transMode: transport.mode,
    transDistance: transport.distanceKm,
    transporterName: clean(transport.transporterName, 100),
    transporterId: transport.transporterId ?? '',
    transDocNo: transport.transDocNo ?? '',
    transDocDate: transport.transDocDate ? ddmmyyyy(transport.transDocDate) : '',
    vehicleNo: vehicle,
    vehicleType: transport.mode === 1 ? (transport.vehicleType ?? 'R') : transport.mode === 4 ? 'O' : 'R',
    mainHsnCode: mainHsn,
    itemList: goods.map((l, i) => ({
      itemNo: i + 1,
      productName: clean(l.description, 100),
      productDesc: clean(l.description, 100),
      hsnCode: l.hsn,
      quantity: num(l.quantity),
      qtyUnit: l.unit,
      taxableAmount: num(l.taxable),
      sgstRate: l.sgstRate,
      cgstRate: l.cgstRate,
      igstRate: l.igstRate,
      cessRate: l.cessRate ?? 0,
      cessNonAdvol: 0,
    })),
  };
  return { entry, errors };
}

/** The bulk file: {version, billLists}. */
export function buildEwayBillJson(entries: Array<Record<string, unknown>>): { version: string; billLists: Array<Record<string, unknown>> } {
  return { version: EWAY_BILL_JSON_VERSION, billLists: entries };
}

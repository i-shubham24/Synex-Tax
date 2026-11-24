import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import {
  billingDocNoError,
  billingDocumentsIssued,
  billingGstr1Sections,
  billingHsnSummary,
  billingSalesRows,
  billingStockRegister,
  computeBillingDoc,
  billingFinancialYear,
  formatSeriesNumber,
  seriesPrefixError,
  type BillingDocInput,
  type BillingStoredDoc,
} from './billing.js';
import { buildEinvoiceJson, type EinvParty } from './einvoice.js';
import { buildEwayBillEntry, buildEwayBillJson, ewayBillRequired } from './ewaybill.js';

const schemaPath = (f: string) => join(__dirname, '..', '..', 'schemas', 'gst', f);

/**
 * The INV-01 v1.1 schema as NIC publishes it is not a usable JSON schema as it stands: the
 * top-level attributes sit beside "$schema" instead of under "properties", some arrays are written
 * as a bare list holding the item schema, one "required" list sits inside "properties", one type
 * is written "String", some names and type values carry spaces, and patterns start with the .NET "(?i)" flag.
 * These are rewritten into standard form; no constraint is added or loosened except the "(?i)"
 * flag (documents use capitals, which the case-sensitive pattern still accepts).
 */
function einvoiceSchema() {
  const raw = JSON.parse(readFileSync(schemaPath('E-Invoice_INV-01_Schema_V1.1.json'), 'utf-8'));
  const fix = (n: any): any => {
    if (Array.isArray(n)) return n.map(fix);
    if (!n || typeof n !== 'object') return n;
    const out: any = {};
    for (const [k0, v] of Object.entries(n)) {
      const k = k0.trim();
      if (k === 'type' && typeof v === 'string') out.type = v.trim().toLowerCase();
      else if (k === 'pattern' && typeof v === 'string') out.pattern = v.replace(/^\(\?i\)/, '');
      else if (k === 'required' && Array.isArray(v)) out.required = v.map((x: string) => x.trim());
      else if (k === 'properties' && v && typeof v === 'object') {
        out.properties = {};
        for (const [pk0, pv] of Object.entries(v as object)) {
          const pk = pk0.trim();
          if (pk === 'required' && Array.isArray(pv) && pv.every((x) => typeof x === 'string')) continue;
          out.properties[pk] = Array.isArray(pv) ? { type: 'array', items: fix(pv[0]) } : fix(pv);
        }
      } else out[k] = fix(v);
    }
    return out;
  };
  const { $schema, Title, Description, required, ...props } = raw;
  const properties: any = {};
  for (const [k, v] of Object.entries(props)) properties[k.trim()] = Array.isArray(v) ? { type: 'array', items: fix(v[0]) } : fix(v);
  return { type: 'object', properties, required };
}

/**
 * The NIC bulk e-way bill schema (draft-04) declares transType as a number with an enum of
 * strings, which no value can satisfy; the attributes sheet and NIC's sample JSON send it as the
 * number 1 to 4, so the enum is read as numbers. GSTIN fields also accept URP. itemList uses the draft-04 tuple form with one
 * entry; it is read as "every item".
 */
function ewayBillSchema() {
  const raw = JSON.parse(readFileSync(schemaPath('EWB_Bulk_JSON_Schema_1.0.0621.json'), 'utf-8'));
  delete raw.$schema;
  const item = raw.properties.billLists.items;
  item.properties.transType.enum = [1, 2, 3, 4];
  // Validations sheet, item 8: "In case of unregistered person involved in the transaction, pass
  // URP in these fields", which the 15 character length in the schema does not allow for.
  for (const k of ['fromGstin', 'toGstin']) item.properties[k] = { type: 'string', pattern: '^([0-9]{2}[0-9A-Z]{13}|URP)$' };
  const il = item.properties.itemList;
  if (Array.isArray(il.items)) il.items = il.items[0];
  return raw;
}

const ajv = new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 6, unicodeRegExp: false });
const validateEinvoice = ajv.compile(einvoiceSchema());
const validateEway = ajv.compile(ewayBillSchema());

// 03 is Punjab. GSTINs with valid check digits.
const SUPPLIER = validGstin('03', 'AAACA1234K');
const seller: EinvParty = { gstin: SUPPLIER, legalName: 'Amrit Traders Private Limited', tradeName: 'Amrit Traders', address1: 'Shop 12, Hall Bazaar', place: 'Amritsar', pincode: '143001', stateCode: '03', phone: '0183-2555555', email: 'accounts@amrit.example' };

function validGstin(state: string, pan: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = `${state}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(base[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return base + chars[(36 - (sum % 36)) % 36];
}
const BUYER_PB = validGstin('03', 'AABCB5678Q');
const BUYER_DL = validGstin('07', 'AABCD9012R');

const buyer = (gstin: string | null, state: string): EinvParty => ({ gstin, legalName: 'Bharat Fabrics LLP', address1: '22 Lawrence Road', place: 'New Delhi', pincode: state === '07' ? '110001' : '143001', stateCode: state });

const base = (over: Partial<BillingDocInput> = {}): BillingDocInput => ({
  docType: 'INV',
  docNo: 'AT/26-27/0001',
  docDate: '2026-11-20',
  supplierGstin: SUPPLIER,
  customerGstin: BUYER_DL,
  placeOfSupply: '07',
  reverseCharge: false,
  lines: [
    { description: 'Cotton shirting fabric', hsn: '5208', isService: false, unit: 'MTR', quantity: '1200', unitPrice: '85.50', gstRate: 5 },
    { description: 'Stitching charges', hsn: '998821', isService: true, unit: 'OTH', quantity: '1', unitPrice: '15000', gstRate: 18 },
  ],
  ...over,
});

test('own check: the test GSTINs are valid', () => {
  const sup = computeBillingDoc(base());
  assert.deepEqual(sup.errors, []);
});

test('inter-state invoice charges IGST line by line and rounds the invoice to the rupee', () => {
  const d = computeBillingDoc(base());
  assert.equal(d.interState, true);
  assert.equal(d.lines[0].taxable, '102600.00');
  assert.equal(d.lines[0].igst, '5130.00');
  assert.equal(d.lines[1].igst, '2700.00');
  assert.equal(d.totals.cgst, '0.00');
  assert.equal(d.totals.taxable, '117600.00');
  assert.equal(d.totals.invoiceValue, '125430.00');
  assert.equal(d.section, 'B2B');
  assert.equal(d.table, '4A');
});

test('intra-state invoice splits CGST and SGST equally', () => {
  const d = computeBillingDoc(base({ customerGstin: BUYER_PB, placeOfSupply: '03', lines: [{ description: 'Woollen shawl', hsn: '6214', isService: false, unit: 'PCS', quantity: '3', unitPrice: '333.33', gstRate: 5 }] }));
  assert.equal(d.interState, false);
  assert.equal(d.lines[0].taxable, '999.99');
  assert.equal(d.lines[0].cgst, '25.00');
  assert.equal(d.lines[0].sgst, '25.00');
  assert.equal(d.totals.roundOff, '0.01');
  assert.equal(d.totals.invoiceValue, '1050.00');
});

test('reverse charge: tax is shown but not collected, and only for a registered buyer', () => {
  const d = computeBillingDoc(base({ reverseCharge: true }));
  assert.equal(d.table, '4B');
  assert.equal(d.totals.amountPayable, '117600.00');
  assert.equal(d.totals.invoiceValue, '125430.00');
  const u = computeBillingDoc(base({ reverseCharge: true, customerGstin: null }));
  assert.ok(u.errors.some((e) => /registered buyer/.test(e)));
});

test('GSTR-1 section: B2CL above Rs 1,00,000 inter-state to an unregistered buyer, B2CS otherwise', () => {
  assert.equal(computeBillingDoc(base({ customerGstin: null })).section, 'B2CL');
  assert.equal(computeBillingDoc(base({ customerGstin: null, placeOfSupply: '03' })).section, 'B2CS');
  const small = computeBillingDoc(base({ customerGstin: null, lines: [{ description: 'Cotton fabric', hsn: '5208', isService: false, unit: 'MTR', quantity: '10', unitPrice: '100', gstRate: 5 }] }));
  assert.equal(small.section, 'B2CS');
});

test('rule 46(b) document numbers and series', () => {
  assert.equal(billingDocNoError('AT/26-27/0001'), null);
  assert.match(billingDocNoError('AT/2026-27/000001')!, /16 characters/);
  assert.match(billingDocNoError('at/1')!, /capital/);
  assert.match(billingDocNoError('0001')!, /start with 0/);
  assert.match(billingDocNoError('INV 1')!, /capital letters/);
  assert.equal(formatSeriesNumber('AT/26-27/', 7, 4), 'AT/26-27/0007');
  assert.match(seriesPrefixError('AT/2026-2027/', 4)!, /16 characters/);
  assert.equal(billingFinancialYear('2027-03-31'), 2026);
  assert.equal(billingFinancialYear('2027-04-01'), 2027);
});

test('line checks: HSN digits, unit code and GST rate', () => {
  const d = computeBillingDoc(base({ lines: [{ description: 'Fabric', hsn: '52', isService: false, unit: 'METRE', quantity: '1', unitPrice: '10', gstRate: 13 }] }));
  assert.ok(d.errors.some((e) => /HSN/.test(e)));
  assert.ok(d.errors.some((e) => /UQC/.test(e)));
  assert.ok(d.errors.some((e) => /not a GST rate/.test(e)));
});

test('credit note before 1 November 2026 needs the original invoice; later it is a warning', () => {
  const early = computeBillingDoc(base({ docType: 'CRN', docNo: 'CN/0001', docDate: '2026-10-15' }));
  assert.ok(early.errors.some((e) => /original invoice/.test(e)));
  const late = computeBillingDoc(base({ docType: 'CRN', docNo: 'CN/0001' }));
  assert.equal(late.errors.length, 0);
  assert.ok(late.warnings.length > 0);
  assert.equal(late.section, 'CDNR');
});

test('e-invoice JSON for a B2B invoice validates against the INV-01 v1.1 schema', () => {
  const d = computeBillingDoc(base());
  const { json, errors } = buildEinvoiceJson(d, seller, buyer(BUYER_DL, '07'));
  assert.deepEqual(errors, []);
  const ok = validateEinvoice(json);
  assert.ok(ok, JSON.stringify(validateEinvoice.errors, null, 1));
  assert.equal((json.TranDtls as any).SupTyp, 'B2B');
  assert.equal((json.DocDtls as any).Dt, '20/11/2026');
  assert.equal((json.BuyerDtls as any).Pos, '7');
  assert.equal((json.ValDtls as any).TotInvVal, 125430);
  // Services carry no unit; goods do.
  assert.equal((json.ItemList as any[])[1].Unit, undefined);
  assert.equal((json.ItemList as any[])[0].Unit, 'MTR');
});

test('e-invoice JSON for a credit note references the original invoice and validates', () => {
  const d = computeBillingDoc(base({ docType: 'CRN', docNo: 'CN/26-27/0001', reverseCharge: true, originalDocNo: 'AT/26-27/0001', originalDocDate: '2026-11-02', customerGstin: BUYER_PB, placeOfSupply: '03' }));
  const { json, errors } = buildEinvoiceJson(d, seller, buyer(BUYER_PB, '03'));
  assert.deepEqual(errors, []);
  assert.ok(validateEinvoice(json), JSON.stringify(validateEinvoice.errors, null, 1));
  assert.equal((json.TranDtls as any).RegRev, 'Y');
  assert.deepEqual((json.RefDtls as any).PrecDocDtls, [{ InvNo: 'AT/26-27/0001', InvDt: '02/11/2026' }]);
});

test('no e-invoice for an unregistered buyer', () => {
  const d = computeBillingDoc(base({ customerGstin: null }));
  const { errors } = buildEinvoiceJson(d, seller, buyer(null, '07'));
  assert.ok(errors.some((e) => /registered buyer/.test(e)));
});

test('the schema check itself catches a bad document', () => {
  const d = computeBillingDoc(base());
  const { json } = buildEinvoiceJson(d, seller, buyer(BUYER_DL, '07'));
  (json.DocDtls as any).Dt = '2026-11-20';
  assert.equal(validateEinvoice(json), false);
});

test('e-way bill: required above Rs 50,000 of taxable goods; bulk JSON validates against the NIC schema', () => {
  const d = computeBillingDoc(base());
  assert.equal(ewayBillRequired(d), true);
  const small = computeBillingDoc(base({ lines: [{ description: 'Cotton fabric', hsn: '5208', isService: false, unit: 'MTR', quantity: '10', unitPrice: '100', gstRate: 5 }] }));
  assert.equal(ewayBillRequired(small), false);
  const services = computeBillingDoc(base({ lines: [{ description: 'Stitching charges', hsn: '998821', isService: true, unit: 'OTH', quantity: '1', unitPrice: '90000', gstRate: 18 }] }));
  assert.equal(ewayBillRequired(services), false);

  const { entry, errors } = buildEwayBillEntry(d, seller, buyer(BUYER_DL, '07'), { mode: 1, distanceKm: 460, vehicleNo: 'PB 02 AB 1234', vehicleType: 'R' });
  assert.deepEqual(errors, []);
  const file = buildEwayBillJson([entry]);
  assert.ok(validateEway(file), JSON.stringify(validateEway.errors, null, 1));
  assert.equal(entry.vehicleNo, 'PB02AB1234');
  assert.equal((entry.itemList as any[]).length, 1, 'services are not on the e-way bill');
  assert.equal(entry.totalValue, 102600);
  assert.equal(entry.igstValue, 5130);
});

test('e-way bill: unregistered buyer is URP; rail needs the transport document', () => {
  const d = computeBillingDoc(base({ customerGstin: null }));
  const rail = buildEwayBillEntry(d, seller, buyer(null, '07'), { mode: 2, distanceKm: 450 });
  assert.ok(rail.errors.some((e) => /transport document number/.test(e)));
  const ok = buildEwayBillEntry(d, seller, buyer(null, '07'), { mode: 2, distanceKm: 450, transDocNo: 'RR/5521', transDocDate: '2026-11-21' });
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.entry.toGstin, 'URP');
  assert.equal(ok.entry.toStateCode, 7);
  assert.ok(validateEway(buildEwayBillJson([ok.entry])), JSON.stringify(validateEway.errors, null, 1));
});

const stored = (d: ReturnType<typeof computeBillingDoc>, extra: Partial<BillingStoredDoc> = {}): BillingStoredDoc => ({
  docType: d.input.docType,
  docNo: d.input.docNo,
  docDate: d.input.docDate,
  cancelled: false,
  customerGstin: d.input.customerGstin,
  customerName: 'Buyer',
  placeOfSupply: d.input.placeOfSupply,
  reverseCharge: d.input.reverseCharge,
  interState: d.interState,
  invoiceValue: d.totals.invoiceValue,
  originalDocNo: d.input.originalDocNo,
  originalDocDate: d.input.originalDocDate,
  lines: d.lines,
  ...extra,
});

test('GSTR-1 from invoices: rows by rate, sections, HSN summary and documents issued', () => {
  const inv1 = computeBillingDoc(base());
  const inv2 = computeBillingDoc(base({ docNo: 'AT/26-27/0002', customerGstin: null, placeOfSupply: '03', lines: [{ description: 'Cotton fabric', hsn: '5208', isService: false, unit: 'MTR', quantity: '100', unitPrice: '80', gstRate: 5 }] }));
  const inv3 = computeBillingDoc(base({ docNo: 'AT/26-27/0003' }));
  const cn = computeBillingDoc(base({ docType: 'CRN', docNo: 'CN/26-27/0001', originalDocNo: 'AT/26-27/0001', originalDocDate: '2026-11-20', lines: [{ description: 'Cotton shirting fabric returned', hsn: '5208', isService: false, unit: 'MTR', quantity: '100', unitPrice: '85.50', gstRate: 5 }] }));
  const docs = [
    stored(inv1, { seriesPrefix: 'AT/26-27/', seriesNo: 1 }),
    stored(inv2, { seriesPrefix: 'AT/26-27/', seriesNo: 2 }),
    stored(inv3, { seriesPrefix: 'AT/26-27/', seriesNo: 3, cancelled: true }),
    stored(cn, { seriesPrefix: 'CN/26-27/', seriesNo: 1 }),
  ];

  const rows = billingSalesRows(docs);
  assert.equal(rows.length, 4, 'two rates on the first invoice, one each on the second and the note; the cancelled one is left out');
  assert.deepEqual(rows.filter((r) => r.invoiceNo === 'AT/26-27/0001').map((r) => [r.rate, r.rateIndex, r.igstRate]), [[5, 0, '0.0500'], [18, 1, '0.1800']]);
  assert.equal(rows.find((r) => r.invoiceNo === 'AT/26-27/0002')!.cgstRate, '0.0250');

  const sections = billingGstr1Sections(docs);
  assert.deepEqual(sections.map((s) => [s.section, s.table, s.documents, s.taxable]), [
    ['B2B', '4A', 1, '117600.00'],
    ['B2CS', '7', 1, '8000.00'],
    ['CDNR', '9B', 1, '-8550.00'],
  ]);

  const hsn = billingHsnSummary(docs);
  const fabric = hsn.find((h) => h.tab === 'B2B' && h.hsn === '5208')!;
  assert.equal(fabric.quantity, '1100.000');
  assert.equal(fabric.taxable, '94050.00');
  assert.equal(hsn.find((h) => h.hsn === '998821')!.uqc, 'NA');
  assert.equal(hsn.find((h) => h.tab === 'B2C')!.taxable, '8000.00');

  const issued = billingDocumentsIssued(docs);
  assert.deepEqual(issued.map((r) => [r.nature, r.from, r.to, r.total, r.cancelled, r.netIssued]), [
    ['Invoices for outward supply', 'AT/26-27/0001', 'AT/26-27/0003', 3, 1, 2],
    ['Credit note', 'CN/26-27/0001', 'CN/26-27/0001', 1, 0, 1],
  ]);
});

test('stock register: opening plus purchases less sales plus returns, valued at weighted average cost', () => {
  const rows = billingStockRegister(
    [
      { id: 'i1', name: 'Cotton fabric', unit: 'MTR', isService: false, openingQty: '500', openingValue: '30000' },
      { id: 'i2', name: 'Stitching', unit: 'OTH', isService: true, openingQty: '0', openingValue: '0' },
    ],
    [
      { itemId: 'i1', date: '2026-11-01', kind: 'PURCHASE', reference: 'B-1', quantity: '1000', value: '75000' },
      { itemId: 'i1', date: '2026-11-20', kind: 'SALE', reference: 'AT/26-27/0001', quantity: '1200' },
      { itemId: 'i1', date: '2026-11-22', kind: 'SALES_RETURN', reference: 'CN/26-27/0001', quantity: '100' },
    ],
  );
  assert.equal(rows.length, 1, 'services hold no stock');
  assert.equal(rows[0].closingQty, '400.000');
  assert.equal(rows[0].averageCost, '70.0000');
  assert.equal(rows[0].closingValue, '28000.00');
  assert.equal(rows[0].short, false);
});

import Decimal from 'decimal.js';
import type { BillingDoc } from './billing.js';

/**
 * IRP request JSON for a B2B tax invoice, credit note or debit note: e-invoice schema INV-01
 * version 1.1 as notified (CGST notification 60/2020) and published by NIC with the IRP API
 * (einv-apisandbox.nic.in, version1.03/generate-irn.html, section JSON Schema). A copy of that
 * schema is in schemas/gst/E-Invoice_INV-01_Schema_V1.1.json and the tests validate against it.
 *
 * The IRP is not called from here: that needs GSP or IRP API credentials. The JSON is downloaded
 * and uploaded on the IRP (bulk upload), and the IRN and acknowledgement are recorded back.
 *
 * Validations applied from the IRP's published list (EINVOICE_SCHEMA.xlsx, sheet Validations):
 * B2C invoices get no IRN (item 5); reverse charge only for B2B (item 14); Qty and Unit are
 * mandatory for goods and optional for services (items, 5); intra-state lines carry CGST and SGST,
 * inter-state lines IGST, and GstRt is the total rate (items, 7 and 8).
 */

export interface EinvParty {
  gstin: string | null;
  legalName: string;
  tradeName?: string | null;
  address1: string;
  address2?: string | null;
  place: string;
  pincode: string;
  stateCode: string;
  phone?: string | null;
  email?: string | null;
}

export const EINVOICE_SCHEMA_VERSION = '1.1';
export const RCM_EINV_VOLUNTARY_START = '2026-12-15';

export type RcmSelfInvoiceType = 'RCMDOM' | 'RCMIMP';

/**
 * Notifications 04/2026-CT & 05/2026-CT + GSTN Nov 17, 2026 advisory:
 * Production IRN generation for RCMDOM (domestic unregistered RCM) and RCMIMP (import of services)
 * opens for voluntary adoption only for documents dated on or after 2026-12-15 (IRP sandboxes allow prior testing).
 */
export function validateRcmIrnEligibility(params: {
  docDate: string;
  rcmType: RcmSelfInvoiceType;
  environment?: 'PRODUCTION' | 'SANDBOX';
}): { allowed: boolean; error?: string } {
  const env = params.environment ?? 'PRODUCTION';
  if (env === 'PRODUCTION' && params.docDate < RCM_EINV_VOLUNTARY_START) {
    return {
      allowed: false,
      error: `Production IRN requests for ${params.rcmType} self-invoices require document date >= ${RCM_EINV_VOLUNTARY_START} (Notifications 04/2026-CT & 05/2026-CT).`,
    };
  }
  return { allowed: true };
}

const num = (s: string) => new Decimal(s).toNumber();
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const clean = (s: string | null | undefined) => (s ?? '').replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
const opt = (s: string | null | undefined, min: number, max: number) => {
  const c = clean(s).slice(0, max);
  return c.length >= min ? c : undefined;
};

function party(p: EinvParty, label: string, errors: string[]) {
  const legal = opt(p.legalName, 3, 100);
  if (!legal) errors.push(`${label}: legal name needs at least 3 characters.`);
  const addr1 = opt(p.address1, 1, 100);
  if (!addr1) errors.push(`${label}: address line 1 is required.`);
  const loc = opt(p.place, 3, 50);
  if (!loc) errors.push(`${label}: place needs at least 3 characters.`);
  const pin = Number(p.pincode);
  if (!/^[1-9][0-9]{5}$/.test(p.pincode ?? '')) errors.push(`${label}: PIN code must be 6 digits.`);
  const phone = (p.phone ?? '').replace(/\D/g, '');
  const email = clean(p.email);
  return {
    Gstin: p.gstin ?? 'URP',
    LglNm: legal ?? '',
    ...(opt(p.tradeName, 3, 100) ? { TrdNm: opt(p.tradeName, 3, 100) } : {}),
    Addr1: addr1 ?? '',
    ...(opt(p.address2, 3, 100) ? { Addr2: opt(p.address2, 3, 100) } : {}),
    Loc: loc ?? '',
    Pin: pin,
    Stcd: String(Number(p.stateCode)),
    ...(/^[0-9]{6,12}$/.test(phone) ? { Ph: phone } : {}),
    ...(email.length >= 6 && /^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(email) ? { Em: email } : {}),
  };
}

/** Builds the INV-01 v1.1 JSON for one document. `errors` lists what stops the IRP accepting it. */
export function buildEinvoiceJson(doc: BillingDoc, seller: EinvParty, buyer: EinvParty): { json: Record<string, unknown>; errors: string[] } {
  const errors = [...doc.errors];
  const d = doc.input;
  if (d.rcmSelfInvoiceType) {
    const rcmCheck = validateRcmIrnEligibility({
      docDate: d.docDate,
      rcmType: d.rcmSelfInvoiceType,
      environment: d.irnEnvironment ?? 'PRODUCTION',
    });
    if (!rcmCheck.allowed && rcmCheck.error) errors.push(rcmCheck.error);
  }
  if (!d.customerGstin && !d.rcmSelfInvoiceType) {
    errors.push('An e-invoice is generated only for a registered buyer (B2B); this buyer has no GSTIN.');
  }
  if (!d.rcmSelfInvoiceType && buyer.gstin !== d.customerGstin) errors.push('The buyer GSTIN does not match the document.');
  if (seller.gstin !== d.supplierGstin) errors.push('The seller GSTIN does not match the document.');

  const sellerDtls = party({ ...seller, stateCode: d.supplierGstin.slice(0, 2) }, 'Seller', errors);
  const { Pin: buyerPin, Stcd: buyerStcd, ...buyerRest } = party({ ...buyer, stateCode: (d.customerGstin ?? '').slice(0, 2) || buyer.stateCode }, 'Buyer', errors);
  const buyerDtls = { ...buyerRest, Pos: String(Number(d.placeOfSupply)), Pin: buyerPin, Stcd: buyerStcd };

  const items = doc.lines.map((l) => {
    const igst = num(l.igst);
    const cgst = num(l.cgst);
    const sgst = num(l.sgst);
    const cess = num(l.cess);
    return {
      SlNo: String(l.lineNo),
      PrdDesc: clean(l.description).slice(0, 300),
      IsServc: l.isService ? 'Y' : 'N',
      HsnCd: l.hsn,
      Qty: num(l.quantity),
      ...(l.isService ? {} : { Unit: l.unit }),
      UnitPrice: num(l.unitPrice),
      TotAmt: num(l.gross),
      Discount: num(l.discount),
      AssAmt: num(l.taxable),
      GstRt: l.gstRate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: l.cessRate ?? 0,
      CesAmt: cess,
      TotItemVal: num(l.total),
    };
  });

  const t = doc.totals;
  const roundOff = num(t.roundOff);
  const json: Record<string, unknown> = {
    Version: EINVOICE_SCHEMA_VERSION,
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: d.rcmSelfInvoiceType ?? 'B2B',
      RegRev: d.reverseCharge || Boolean(d.rcmSelfInvoiceType) ? 'Y' : 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: { Typ: d.docType, No: d.docNo, Dt: ddmmyyyy(d.docDate) },
    SellerDtls: sellerDtls,
    BuyerDtls: buyerDtls,
    ItemList: items,
    ValDtls: {
      AssVal: num(t.taxable),
      CgstVal: num(t.cgst),
      SgstVal: num(t.sgst),
      IgstVal: num(t.igst),
      CesVal: num(t.cess),
      ...(roundOff !== 0 ? { RndOffAmt: roundOff } : {}),
      TotInvVal: num(t.invoiceValue),
    },
  };
  if (d.docType !== 'INV' && d.originalDocNo && d.originalDocDate) {
    json.RefDtls = { PrecDocDtls: [{ InvNo: d.originalDocNo, InvDt: ddmmyyyy(d.originalDocDate) }] };
  }
  return { json, errors };
}

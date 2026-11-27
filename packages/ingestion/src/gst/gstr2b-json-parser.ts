import { Decimal } from 'decimal.js';

/**
 * Reads the GSTR-2B JSON a taxpayer downloads from the GST portal (Returns > GSTR-2B > Download
 * JSON) into one record per document, in the shape the reconciliation engine takes
 * (workers/queue-worker/src/recon/reconciliationEngine.ts, Gstr2BRecord).
 *
 * Sections read: b2b (invoices), cdnr (credit and debit notes), b2ba and cdnra (amendments, with
 * the original number kept), impg/impgsez (Bill of Entry import IGST credits), and isd (Input Service Distributor).
 * Dates in the file are DD-MM-YYYY. itcavl "N" means 2B itself says the credit is not available
 * (for example place-of-supply or section 16(4) cases); the engine keeps such documents out of matched ITC.
 *
 * IMPG and ISD documents carry creditCategory ('IMPG' | 'ISD') so domestic B2B matching keeps them segregated.
 */

export interface Gstr2bDocument {
  id: string;
  supplierGstin: string;
  supplierName?: string;
  docNum: string;
  docDate: string; // YYYY-MM-DD
  docType: 'INV' | 'CRN' | 'DBN' | 'IMPG' | 'ISD';
  creditCategory: 'B2B' | 'IMPG' | 'ISD';
  portCode?: string;
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  cessAmount: string;
  totalTax: string;
  itcAvailable: boolean;
  /** 2B's reason code when credit is not available or is reduced. */
  itcReason?: string;
  gstr1FilingDate?: string;
  /** The supplier's return period that reported it, MMYYYY. */
  supplierPeriod?: string;
  section: 'b2b' | 'cdnr' | 'b2ba' | 'cdnra' | 'impg' | 'impgsez' | 'isd';
  /** For amendments: the number of the document being amended. */
  originalInvoiceRef?: string;
  /** Original value if amended in Table 9A / B2BA / CDNRA. */
  originalTotalTax?: string;
}

export interface Gstr2bParseResult {
  recipientGstin: string;
  /** Return period, MMYYYY as in the file. */
  returnPeriod: string;
  /** The same period as YYYY-MM. */
  period: string;
  generatedOn?: string;
  documents: Gstr2bDocument[];
  /** Sections present in the file that this parser does not read yet. */
  unreadSections: string[];
}

const READ = new Set(['b2b', 'cdnr', 'b2ba', 'cdnra', 'impg', 'impgsez', 'isd']);

function isoDate(raw: unknown, where: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw ?? ''));
  if (!m) throw new Error(`GSTR-2B: date '${String(raw)}' in ${where} is not DD-MM-YYYY`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const money = (v: unknown) => new Decimal(v === undefined || v === null || v === '' ? 0 : String(v));

/** Parses the downloaded JSON (as text or already parsed). Throws on a file that is not a 2B. */
export function parseGstr2bJson(input: string | unknown): Gstr2bParseResult {
  const doc = (typeof input === 'string' ? JSON.parse(input.replace(/^﻿/, '')) : input) as any;
  const data = doc?.data ?? doc;
  if (!data || typeof data !== 'object' || !data.docdata || !data.gstin || !data.rtnprd) {
    throw new Error('GSTR-2B: not a GSTR-2B download (needs data.gstin, data.rtnprd and data.docdata)');
  }
  const rtnprd = String(data.rtnprd);
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(rtnprd)) throw new Error(`GSTR-2B: return period '${rtnprd}' is not MMYYYY`);

  const documents: Gstr2bDocument[] = [];
  const push = (
    section: Gstr2bDocument['section'],
    supplier: any,
    no: string,
    d: any,
    docType: Gstr2bDocument['docType'],
    originalInvoiceRef?: string,
    creditCategory: Gstr2bDocument['creditCategory'] = 'B2B',
    portCode?: string,
  ) => {
    const igst = money(d.igst), cgst = money(d.cgst), sgst = money(d.sgst), cess = money(d.cess);
    const ctin = String(supplier.ctin ?? portCode ?? 'ICEGATE').toUpperCase();
    documents.push({
      id: `${section}:${ctin}:${no}`,
      supplierGstin: ctin,
      supplierName: supplier.trdnm || (creditCategory === 'IMPG' ? `ICEGATE Import (${portCode || 'Port'})` : undefined),
      docNum: String(no),
      docDate: isoDate(d.dt ?? d.boedt ?? d.docdt, `${section} ${ctin} ${no}`),
      docType,
      creditCategory,
      ...(portCode ? { portCode } : {}),
      taxableValue: money(d.txval).toFixed(2),
      igstAmount: igst.toFixed(2),
      cgstAmount: cgst.toFixed(2),
      sgstAmount: sgst.toFixed(2),
      cessAmount: cess.toFixed(2),
      totalTax: igst.plus(cgst).plus(sgst).plus(cess).toFixed(2),
      itcAvailable: String(d.itcavl ?? d.itcelg ?? 'Y').toUpperCase() !== 'N',
      ...(d.rsn ? { itcReason: String(d.rsn) } : {}),
      ...(supplier.supfildt ? { gstr1FilingDate: isoDate(supplier.supfildt, `${section} ${ctin} filing date`) } : {}),
      ...(supplier.supprd ? { supplierPeriod: String(supplier.supprd) } : {}),
      section,
      ...(originalInvoiceRef ? { originalInvoiceRef } : {}),
      ...(d.oigst !== undefined || d.ocgst !== undefined || d.osgst !== undefined
        ? { originalTotalTax: money(d.oigst).plus(money(d.ocgst)).plus(money(d.osgst)).toFixed(2) }
        : {}),
    });
  };
  const noteType = (typ: unknown): Gstr2bDocument['docType'] => (String(typ).toUpperCase() === 'D' ? 'DBN' : 'CRN');

  const dd = data.docdata;
  for (const s of dd.b2b ?? []) for (const inv of s.inv ?? []) push('b2b', s, inv.inum, inv, 'INV');
  for (const s of dd.b2ba ?? []) for (const inv of s.inv ?? []) push('b2ba', s, inv.inum, inv, 'INV', inv.oinum);
  for (const s of dd.cdnr ?? []) for (const nt of s.nt ?? []) push('cdnr', s, nt.ntnum, nt, noteType(nt.typ));
  for (const s of dd.cdnra ?? []) for (const nt of s.nt ?? []) push('cdnra', s, nt.ntnum, nt, noteType(nt.typ), nt.ontnum);
  for (const imp of dd.impg ?? []) push('impg', {}, String(imp.boenum ?? ''), imp, 'IMPG', imp.isamd === 'Y' ? imp.oboenum : undefined, 'IMPG', String(imp.portcd ?? 'PORT'));
  for (const s of dd.impgsez ?? []) {
    for (const imp of s.boes ?? s.inv ?? []) {
      push('impgsez', s, String(imp.boenum ?? imp.inum ?? ''), imp, 'IMPG', imp.isamd === 'Y' ? imp.oboenum : undefined, 'IMPG', String(imp.portcd ?? 'SEZ'));
    }
  }
  for (const s of dd.isd ?? []) {
    for (const d of s.doclist ?? []) {
      push('isd', s, String(d.docnum ?? ''), d, 'ISD', undefined, 'ISD');
    }
  }

  return {
    recipientGstin: String(data.gstin).toUpperCase(),
    returnPeriod: rtnprd,
    period: `${rtnprd.slice(2)}-${rtnprd.slice(0, 2)}`,
    ...(data.gendt ? { generatedOn: isoDate(data.gendt, 'gendt') } : {}),
    documents,
    unreadSections: Object.keys(dd).filter((k) => !READ.has(k) && Array.isArray(dd[k]) && dd[k].length > 0),
  };
}

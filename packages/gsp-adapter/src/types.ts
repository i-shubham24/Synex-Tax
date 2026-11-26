export type PortalStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface TaxpayerDetails {
  gstin: string;
  legalName: string;
  tradeName?: string;
  stateCode: string;
  constitution: string;
  filingCategory: 'REGULAR_MONTHLY' | 'QRMP_QUARTERLY' | 'COMPOSITION';
  portalStatus: PortalStatus;
}

export interface OtpRequestResult {
  success: boolean;
  txnId: string;
  message: string;
}

export interface AuthTokenPayload {
  authToken: string;
  sek: string;
  expiresAt: string;
}

export type ReturnProcessStatus = 'P' | 'S' | 'PE' | 'REVOKED_BY_TAXPAYER';

export interface SaveReturnResult {
  referenceId: string;
  status: ReturnProcessStatus;
  submittedAt: string;
}

export interface ReturnStatusResult {
  referenceId: string;
  status: ReturnProcessStatus;
  errorReport?: Array<{
    code: string;
    message: string;
    field?: string;
  }>;
}

export interface Gstr2bInvoiceItem {
  id: string;
  supplierGstin: string;
  supplierName?: string;
  docNum: string;
  docDate: string;
  docType: 'INV' | 'CRN' | 'DBN';
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  totalTax: string;
  itcAvailable: boolean;
  imsActionStatus: 'A' | 'R' | 'P' | 'NONE';
  isAmendedPostAcceptance?: boolean;
  section17_5?: boolean;
  originalInvoiceRef?: string;
}

export interface Gstr2bPayload {
  gstin: string;
  returnPeriod: string;
  b2b: Gstr2bInvoiceItem[];
  b2ba: Gstr2bInvoiceItem[];
  cdnr: Gstr2bInvoiceItem[];
  cdnra: Gstr2bInvoiceItem[];
  isd: Gstr2bInvoiceItem[];
  impg: Gstr2bInvoiceItem[];
}

export interface ImsAction {
  invoiceRef: string;
  supplierGstin: string;
  docType: 'INV' | 'CRN' | 'DBN';
  action: 'A' | 'R' | 'P' | 'NONE';
  itcReductionRequired?: boolean;
  partialReversalAmount?: string;
}

export interface ImsActionBatchResult {
  success: boolean;
  processedCount: number;
  batchId: string;
  lastImsModifiedAt: string;
}

export interface ImsInvoiceListResult {
  gstin: string;
  period: string;
  view: 'RECIPIENT' | 'SUPPLIER';
  items: Gstr2bInvoiceItem[];
}

export interface Gstr3bAutoDraftData {
  gstin: string;
  period: string;
  taxableOutward: string;
  igstLiability: string;
  cgstLiability: string;
  sgstLiability: string;
  itcIgst: string;
  itcCgst: string;
  itcSgst: string;
  itcReversed: string;
}

export interface Gstr3bOffsetPayload {
  igstLiability: string;
  cgstLiability: string;
  sgstLiability: string;
  igstItcUtilized: { igst: string; cgst: string; sgst: string };
  cgstItcUtilized: { cgst: string };
  sgstItcUtilized: { sgst: string };
  cashPaid: { igst: string; cgst: string; sgst: string };
}

export interface FileReturnResult {
  arn: string;
  filedAt: string;
  returnType: 'GSTR1' | 'IFF' | 'GSTR1A' | 'GSTR3B';
  gstin: string;
  period: string;
}

import type {
  TaxpayerDetails,
  OtpRequestResult,
  AuthTokenPayload,
  SaveReturnResult,
  ReturnStatusResult,
  Gstr2bPayload,
  ImsAction,
  ImsActionBatchResult,
  ImsInvoiceListResult,
  Gstr3bAutoDraftData,
  Gstr3bOffsetPayload,
  FileReturnResult,
} from './types.js';

export interface GspGatewayAdapter {
  requestOtp(gstin: string, portalUsername: string): Promise<OtpRequestResult>;
  verifyOtp(gstin: string, otp: string): Promise<AuthTokenPayload>;
  getTaxpayerDetails(gstin: string): Promise<TaxpayerDetails>;
  saveGstr1(gstin: string, period: string, payload: unknown): Promise<SaveReturnResult>;
  saveIff(gstin: string, period: string, payload: unknown): Promise<SaveReturnResult>;
  saveGstr1a(gstin: string, period: string, payload: unknown): Promise<SaveReturnResult>;
  getReturnStatus(gstin: string, period: string, referenceId: string): Promise<ReturnStatusResult>;
  downloadGstr2b(gstin: string, period: string): Promise<Gstr2bPayload>;
  saveImsActions(gstin: string, period: string, actions: ImsAction[]): Promise<ImsActionBatchResult>;
  getImsInvoices(gstin: string, period: string, view: 'RECIPIENT' | 'SUPPLIER'): Promise<ImsInvoiceListResult>;
  recomputeGstr2b(gstin: string, period: string): Promise<{ success: boolean; recomputedAt: string }>;
  getGstr3bAutoDraft(gstin: string, period: string): Promise<Gstr3bAutoDraftData>;
  saveGstr3b(gstin: string, period: string, payload: unknown): Promise<SaveReturnResult>;
  offsetGstr3bLiability(gstin: string, period: string, offsetPayload: Gstr3bOffsetPayload): Promise<{ success: boolean; balanceRemaining: string }>;
  fileReturn(
    gstin: string,
    period: string,
    returnType: 'GSTR1' | 'IFF' | 'GSTR1A' | 'GSTR3B',
    signedPayload: string,
    signMethod: 'DSC' | 'EVC',
  ): Promise<FileReturnResult>;
}

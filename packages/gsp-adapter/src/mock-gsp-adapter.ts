import Decimal from 'decimal.js';
import type { GspGatewayAdapter } from './interface.js';
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

export class MockGspAdapter implements GspGatewayAdapter {
  private pollCounts = new Map<string, number>();
  private imsStore = new Map<string, Map<string, ImsAction>>();
  private recomputeTimes = new Map<string, string>();
  private testFlagRevoked = false;
  private testFlagError = false;

  public setTestFlagRevoked(val: boolean) {
    this.testFlagRevoked = val;
  }

  public setTestFlagError(val: boolean) {
    this.testFlagError = val;
  }

  async requestOtp(gstin: string, portalUsername: string): Promise<OtpRequestResult> {
    return {
      success: true,
      txnId: `TXN-${gstin.slice(0, 6)}-${Date.now()}`,
      message: `OTP sent to mobile registered with GSTIN ${gstin} (${portalUsername}).`,
    };
  }

  async verifyOtp(gstin: string, otp: string): Promise<AuthTokenPayload> {
    if (otp === '000000') {
      throw new Error('INVALID_OTP: Entered OTP does not match portal session.');
    }
    const expires = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    return {
      authToken: `mock-auth-token-${gstin}-${Date.now()}`,
      sek: `mock-sek-key-${gstin.slice(0, 8)}`,
      expiresAt: expires,
    };
  }

  async getTaxpayerDetails(gstin: string): Promise<TaxpayerDetails> {
    return {
      gstin,
      legalName: 'Amritsar Silk Mills Private Limited',
      tradeName: 'Amritsar Silk Mills',
      stateCode: gstin.slice(0, 2),
      constitution: 'PRIVATE_LIMITED',
      filingCategory: 'REGULAR_MONTHLY',
      portalStatus: 'ACTIVE',
    };
  }

  async saveGstr1(gstin: string, period: string, _payload: unknown): Promise<SaveReturnResult> {
    const ref = `REF-G1-${gstin.slice(0, 4)}-${period}-${Date.now()}`;
    this.pollCounts.set(ref, 0);
    return {
      referenceId: ref,
      status: 'P',
      submittedAt: new Date().toISOString(),
    };
  }

  async saveIff(gstin: string, period: string, _payload: unknown): Promise<SaveReturnResult> {
    const ref = `REF-IFF-${gstin.slice(0, 4)}-${period}-${Date.now()}`;
    this.pollCounts.set(ref, 0);
    return {
      referenceId: ref,
      status: 'P',
      submittedAt: new Date().toISOString(),
    };
  }

  async saveGstr1a(gstin: string, period: string, _payload: unknown): Promise<SaveReturnResult> {
    const ref = `REF-G1A-${gstin.slice(0, 4)}-${period}-${Date.now()}`;
    this.pollCounts.set(ref, 0);
    return {
      referenceId: ref,
      status: 'P',
      submittedAt: new Date().toISOString(),
    };
  }

  async getReturnStatus(_gstin: string, _period: string, referenceId: string): Promise<ReturnStatusResult> {
    if (this.testFlagRevoked) {
      return {
        referenceId,
        status: 'REVOKED_BY_TAXPAYER',
      };
    }
    if (this.testFlagError) {
      return {
        referenceId,
        status: 'PE',
        errorReport: [
          {
            code: 'ERR_DUP_DOC',
            message: 'Duplicate document reference found in GSTR-1 register.',
            field: 'docNum',
          },
        ],
      };
    }

    const currentCount = this.pollCounts.get(referenceId) ?? 0;
    if (currentCount === 0) {
      this.pollCounts.set(referenceId, 1);
      return { referenceId, status: 'P' };
    }

    return { referenceId, status: 'S' };
  }

  async downloadGstr2b(gstin: string, period: string): Promise<Gstr2bPayload> {
    return {
      gstin,
      returnPeriod: period,
      b2b: [
        {
          id: '2b-inv-1',
          supplierGstin: '03BBBBB9999B1Z1',
          supplierName: 'Jalandhar Forgings Ltd',
          docNum: 'INV-26-27/084',
          docDate: '2026-11-04',
          docType: 'INV',
          taxableValue: '150000.00',
          igstAmount: '0.00',
          cgstAmount: '13500.00',
          sgstAmount: '13500.00',
          totalTax: '27000.00',
          itcAvailable: true,
          imsActionStatus: 'NONE',
        },
        {
          id: '2b-inv-2',
          supplierGstin: '07BBBPG4512D1ZR',
          supplierName: 'Apex Cloud Solutions Delhi',
          docNum: 'INV-4512',
          docDate: '2026-11-06',
          docType: 'INV',
          taxableValue: '250000.00',
          igstAmount: '45000.00',
          cgstAmount: '0.00',
          sgstAmount: '0.00',
          totalTax: '45000.00',
          itcAvailable: true,
          imsActionStatus: 'NONE',
        },
        {
          id: '2b-inv-3',
          supplierGstin: '03CCCPM8891B1Z2',
          supplierName: 'Golden Temple Roadways Transport',
          docNum: 'SALES25261',
          docDate: '2026-11-08',
          docType: 'INV',
          taxableValue: '95000.00',
          igstAmount: '0.00',
          cgstAmount: '8550.00',
          sgstAmount: '8550.00',
          totalTax: '17100.00',
          itcAvailable: true,
          imsActionStatus: 'NONE',
        },
      ],
      b2ba: [
        {
          id: '2b-inv-amend-1',
          supplierGstin: '03BBBBB9999B1Z1',
          supplierName: 'Jalandhar Forgings Ltd',
          docNum: 'INV-26-27/084A',
          originalInvoiceRef: 'INV-26-27/084',
          docDate: '2026-11-10',
          docType: 'INV',
          taxableValue: '160000.00',
          igstAmount: '0.00',
          cgstAmount: '14400.00',
          sgstAmount: '14400.00',
          totalTax: '28800.00',
          itcAvailable: true,
          imsActionStatus: 'NONE',
          isAmendedPostAcceptance: true,
        },
      ],
      cdnr: [
        {
          id: '2b-crn-1',
          supplierGstin: '03BBBBB9999B1Z1',
          supplierName: 'Jalandhar Forgings Ltd',
          docNum: 'CRN/26-27/003',
          docDate: '2026-11-12',
          docType: 'CRN',
          taxableValue: '15000.00',
          igstAmount: '0.00',
          cgstAmount: '1350.00',
          sgstAmount: '1350.00',
          totalTax: '2700.00',
          itcAvailable: true,
          imsActionStatus: 'NONE',
        },
      ],
      cdnra: [],
      isd: [],
      impg: [],
    };
  }

  async saveImsActions(gstin: string, period: string, actions: ImsAction[]): Promise<ImsActionBatchResult> {
    const key = `${gstin}:${period}`;
    let firmIms = this.imsStore.get(key);
    if (!firmIms) {
      firmIms = new Map<string, ImsAction>();
      this.imsStore.set(key, firmIms);
    }

    for (const act of actions) {
      firmIms.set(act.invoiceRef, act);
    }

    const modified = new Date().toISOString();
    return {
      success: true,
      processedCount: actions.length,
      batchId: `IMS-BATCH-${Date.now()}`,
      lastImsModifiedAt: modified,
    };
  }

  async getImsInvoices(gstin: string, period: string, view: 'RECIPIENT' | 'SUPPLIER'): Promise<ImsInvoiceListResult> {
    const gstr2b = await this.downloadGstr2b(gstin, period);
    const key = `${gstin}:${period}`;
    const stored = this.imsStore.get(key);

    const merged = gstr2b.b2b.map((inv) => {
      const act = stored?.get(inv.docNum);
      return {
        ...inv,
        imsActionStatus: act?.action ?? inv.imsActionStatus,
      };
    });

    return {
      gstin,
      period,
      view,
      items: merged,
    };
  }

  async recomputeGstr2b(gstin: string, period: string): Promise<{ success: boolean; recomputedAt: string }> {
    const now = new Date().toISOString();
    this.recomputeTimes.set(`${gstin}:${period}`, now);
    return {
      success: true,
      recomputedAt: now,
    };
  }

  async getGstr3bAutoDraft(gstin: string, period: string): Promise<Gstr3bAutoDraftData> {
    return {
      gstin,
      period,
      taxableOutward: '495000.00',
      igstLiability: '45000.00',
      cgstLiability: '22050.00',
      sgstLiability: '22050.00',
      itcIgst: '45000.00',
      itcCgst: '22050.00',
      itcSgst: '22050.00',
      itcReversed: '0.00',
    };
  }

  async saveGstr3b(gstin: string, period: string, _payload: unknown): Promise<SaveReturnResult> {
    const ref = `REF-3B-${gstin.slice(0, 4)}-${period}-${Date.now()}`;
    return {
      referenceId: ref,
      status: 'S',
      submittedAt: new Date().toISOString(),
    };
  }

  async offsetGstr3bLiability(
    _gstin: string,
    _period: string,
    _offsetPayload: Gstr3bOffsetPayload,
  ): Promise<{ success: boolean; balanceRemaining: string }> {
    return {
      success: true,
      balanceRemaining: '0.00',
    };
  }

  async fileReturn(
    gstin: string,
    period: string,
    returnType: 'GSTR1' | 'IFF' | 'GSTR1A' | 'GSTR3B',
    _signedPayload: string,
    _signMethod: 'DSC' | 'EVC',
  ): Promise<FileReturnResult> {
    const state = gstin.slice(0, 2);
    const mmyy = period.replace('-', '').slice(2, 6);
    const randomSeq = Math.floor(100000 + Math.random() * 900000);
    const arn = `AA${state}${mmyy}${randomSeq}1`;
    return {
      arn,
      filedAt: new Date().toISOString(),
      returnType,
      gstin,
      period,
    };
  }
}

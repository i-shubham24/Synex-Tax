import { Decimal } from 'decimal.js';

export interface ImsRecordForScan {
  id: string;
  firmId: string;
  gstRegistrationId: string;
  gstin: string;
  supplierGstin: string;
  supplierName: string;
  invoiceNum: string;
  invoiceDate: string;
  taxableValue: string | number;
  totalTax: string | number;
  imsActionStatus: 'A' | 'R' | 'P' | 'NONE';
  itcAvailable: boolean;
  isSection17_5Blocked: boolean;
}

export interface ImsAlertPayload {
  alertType: 'PRE_14TH_DEEMED_ACCEPTANCE_RISK';
  severity: 'HIGH' | 'CRITICAL';
  firmId: string;
  gstin: string;
  unactionedCount: number;
  totalAtRiskTax: string;
  blockedCreditCount: number;
  highValueCount: number;
  flaggedInvoices: Array<{
    invoiceNum: string;
    supplierGstin: string;
    supplierName: string;
    taxableValue: string;
    riskReason: string;
  }>;
  deadlineTimestamp: string;
}

export class ImsPre14AlertEngine {
  private static readonly DEFAULT_HIGH_VALUE_THRESHOLD = new Decimal(25000);

  /**
   * Scans a batch of IMS records for high-risk unactioned ('NONE') records
   * that would otherwise be auto-accepted by GSTN on the 14th.
   */
  public static scan(
    firmId: string,
    gstin: string,
    records: ImsRecordForScan[],
    targetPeriod: string, // YYYY-MM
    threshold: Decimal = ImsPre14AlertEngine.DEFAULT_HIGH_VALUE_THRESHOLD
  ): ImsAlertPayload | null {
    const unactioned = records.filter((r) => r.imsActionStatus === 'NONE');
    if (unactioned.length === 0) return null;

    let totalAtRiskTax = new Decimal(0);
    let blockedCreditCount = 0;
    let highValueCount = 0;
    const flaggedInvoices: ImsAlertPayload['flaggedInvoices'] = [];

    for (const record of unactioned) {
      const tax = new Decimal(record.totalTax || 0);
      const val = new Decimal(record.taxableValue || 0);
      totalAtRiskTax = totalAtRiskTax.plus(tax);

      let isRisk = false;
      let riskReason = '';

      if (record.isSection17_5Blocked || !record.itcAvailable) {
        blockedCreditCount++;
        isRisk = true;
        riskReason = 'Ineligible / Blocked Credit under Section 17(5) - Will improperly claim ITC if deemed accepted!';
      } else if (val.greaterThanOrEqualTo(threshold)) {
        highValueCount++;
        isRisk = true;
        riskReason = `High Value Inward Supply (>= Rs ${threshold.toString()}) requires CA review`;
      }

      if (isRisk) {
        flaggedInvoices.push({
          invoiceNum: record.invoiceNum,
          supplierGstin: record.supplierGstin,
          supplierName: record.supplierName,
          taxableValue: val.toFixed(2),
          riskReason,
        });
      }
    }

    if (flaggedInvoices.length === 0) return null;

    // Deadline is strictly the 13th midnight (prior to 14th 00:00 GSTN lock)
    const [year, month] = targetPeriod.split('-');
    const deadlineTimestamp = `${year}-${month}-13T23:59:59+05:30`;

    return {
      alertType: 'PRE_14TH_DEEMED_ACCEPTANCE_RISK',
      severity: blockedCreditCount > 0 ? 'CRITICAL' : 'HIGH',
      firmId,
      gstin,
      unactionedCount: unactioned.length,
      totalAtRiskTax: totalAtRiskTax.toFixed(2),
      blockedCreditCount,
      highValueCount,
      flaggedInvoices,
      deadlineTimestamp,
    };
  }
}

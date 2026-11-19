import { Decimal } from 'decimal.js';
import { normalizeInvoiceNumber } from '../jobs/invoiceNormalizerJob.js';

export interface PurchaseRegisterInvoice {
  id: string;
  vendorGstin: string;
  vendorName?: string;
  invoiceNum: string;
  invoiceDate: string; // YYYY-MM-DD
  docType: 'INV' | 'CRN' | 'DBN';
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  totalTax: string;
  itcEligibility: 'ELIGIBLE' | 'INELIGIBLE_17_5' | 'INELIGIBLE_OTHER';
}

export interface Gstr2BRecord {
  id: string;
  supplierGstin: string;
  supplierName?: string;
  docNum: string;
  docDate: string; // YYYY-MM-DD
  docType: 'INV' | 'CRN' | 'DBN';
  taxableValue: string;
  igstAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  totalTax: string;
  itcAvailable: boolean;
  gstr1FilingDate?: string;
  // IMS Lineage attributes
  imsActionStatus?: 'A' | 'R' | 'P' | 'NONE';
  isAmendedPostAcceptance?: boolean;
  originalInvoiceRef?: string;
  originalTaxableValue?: string;
  originalTotalTax?: string;
}

export type ReconMatchStatus =
  | 'EXACT_MATCH'
  | 'FUZZY_MATCH'
  | 'PROBABLE_MATCH'
  | 'MISMATCH_VALUE'
  | 'PURCHASE_NOT_IN_2B'
  | 'VENDOR_NOT_IN_PR';

export interface ReconMatchPair {
  status: ReconMatchStatus;
  confidenceScore: number;
  purchaseInvoice?: PurchaseRegisterInvoice;
  portal2bRecord?: Gstr2BRecord;
  differenceTaxable?: string;
  differenceTax?: string;
  isAmendedPostAcceptance?: boolean;
  amendmentDelta?: {
    deltaTaxable: string;
    deltaTax: string;
  };
  notes: string;
}

export interface ReconReport {
  period: string;
  totalPurchaseInvoices: number;
  total2bRecords: number;
  exactMatchesCount: number;
  fuzzyMatchesCount: number;
  valueMismatchesCount: number;
  purchaseNotIn2bCount: number;
  vendorNotInPrCount: number;
  totalMatchedItc: string;
  totalAtRiskItc: string;
  totalUnclaimedItc: string;
  matchedPairs: ReconMatchPair[];
  unmatchedPurchase: PurchaseRegisterInvoice[];
  unmatchedPortal2b: Gstr2BRecord[];
}

export class GstReconciliationEngine {
  /**
   * Executes the full 4-Pass statutory reconciliation between accounting books
   * (Purchase Register) and GSTN auto-drafted GSTR-2B inward supplies.
   */
  public static reconcile(
    period: string,
    purchaseInvoices: PurchaseRegisterInvoice[],
    portalRecords: Gstr2BRecord[]
  ): ReconReport {
    const unmatchedPR = new Map<string, PurchaseRegisterInvoice>();
    for (const pr of purchaseInvoices) {
      unmatchedPR.set(pr.id, pr);
    }

    const unmatched2B = new Map<string, Gstr2BRecord>();
    for (const rec of portalRecords) {
      unmatched2B.set(rec.id, rec);
    }

    const matchedPairs: ReconMatchPair[] = [];

    // -------------------------------------------------------------------
    // PASS 1: Exact Match (Exact GSTIN + Case-insensitive InvNum + Date + Amounts)
    // -------------------------------------------------------------------
    for (const [prId, pr] of unmatchedPR.entries()) {
      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (
          pr.vendorGstin.toUpperCase() === b2.supplierGstin.toUpperCase() &&
          pr.docType === b2.docType &&
          pr.invoiceNum.trim().toUpperCase() === b2.docNum.trim().toUpperCase() &&
          pr.invoiceDate === b2.docDate &&
          new Decimal(pr.taxableValue).equals(new Decimal(b2.taxableValue)) &&
          new Decimal(pr.totalTax).equals(new Decimal(b2.totalTax))
        ) {
          matchedPairs.push({
            status: 'EXACT_MATCH',
            confidenceScore: 1.0,
            purchaseInvoice: pr,
            portal2bRecord: b2,
            notes: 'Exact match across invoice number, date, taxable value, and tax split.',
          });
          unmatchedPR.delete(prId);
          unmatched2B.delete(b2Id);
          break;
        }
      }
    }

    // -------------------------------------------------------------------
    // PASS 2: Fuzzy Invoice Normalization Match (delimiters + FY tokens + leading zeros)
    // Tolerance: Section 170 rounding difference (<= Rs 1.00)
    // -------------------------------------------------------------------
    for (const [prId, pr] of unmatchedPR.entries()) {
      const normPrNum = normalizeInvoiceNumber(pr.invoiceNum);

      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (pr.vendorGstin.toUpperCase() !== b2.supplierGstin.toUpperCase()) continue;
        if (pr.docType !== b2.docType) continue;

        const normB2Num = normalizeInvoiceNumber(b2.docNum);

        if (normPrNum === normB2Num && normPrNum.length > 0) {
          const diffTaxable = new Decimal(pr.taxableValue).minus(new Decimal(b2.taxableValue)).abs();
          const diffTax = new Decimal(pr.totalTax).minus(new Decimal(b2.totalTax)).abs();

          // Section 170 rounding tolerance (<= 1.00)
          if (diffTaxable.lessThanOrEqualTo(1.0) && diffTax.lessThanOrEqualTo(1.0)) {
            matchedPairs.push({
              status: 'FUZZY_MATCH',
              confidenceScore: 0.95,
              purchaseInvoice: pr,
              portal2bRecord: b2,
              differenceTaxable: diffTaxable.toFixed(2),
              differenceTax: diffTax.toFixed(2),
              notes: `Fuzzy matched invoice number format (${pr.invoiceNum} vs ${b2.docNum}) within statutory Section 170 rounding tolerance.`,
            });
            unmatchedPR.delete(prId);
            unmatched2B.delete(b2Id);
            break;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // PASS 3: Probable Match / Value Mismatches (Normalized number matches, amounts differ)
    // -------------------------------------------------------------------
    for (const [prId, pr] of unmatchedPR.entries()) {
      const normPrNum = normalizeInvoiceNumber(pr.invoiceNum);

      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (pr.vendorGstin.toUpperCase() !== b2.supplierGstin.toUpperCase()) continue;

        const normB2Num = normalizeInvoiceNumber(b2.docNum);

        if (normPrNum === normB2Num && normPrNum.length > 0) {
          const diffTaxable = new Decimal(pr.taxableValue).minus(new Decimal(b2.taxableValue));
          const diffTax = new Decimal(pr.totalTax).minus(new Decimal(b2.totalTax));

          matchedPairs.push({
            status: 'MISMATCH_VALUE',
            confidenceScore: 0.8,
            purchaseInvoice: pr,
            portal2bRecord: b2,
            differenceTaxable: diffTaxable.toFixed(2),
            differenceTax: diffTax.toFixed(2),
            notes: `Invoice number matches (${pr.invoiceNum}), but values differ: PR Taxable ₹${pr.taxableValue} vs 2B Taxable ₹${b2.taxableValue}.`,
          });
          unmatchedPR.delete(prId);
          unmatched2B.delete(b2Id);
          break;
        }
      }
    }

    // -------------------------------------------------------------------
    // PASS 4: Handle "Amended Post-Acceptance" Lineage on 2B records
    // -------------------------------------------------------------------
    for (const pair of matchedPairs) {
      if (pair.portal2bRecord?.isAmendedPostAcceptance && pair.portal2bRecord.originalTaxableValue) {
        const origTaxable = new Decimal(pair.portal2bRecord.originalTaxableValue);
        const origTax = new Decimal(pair.portal2bRecord.originalTotalTax || 0);
        const curTaxable = new Decimal(pair.portal2bRecord.taxableValue);
        const curTax = new Decimal(pair.portal2bRecord.totalTax);

        pair.isAmendedPostAcceptance = true;
        pair.amendmentDelta = {
          deltaTaxable: curTaxable.minus(origTaxable).toFixed(2),
          deltaTax: curTax.minus(origTax).toFixed(2),
        };
        pair.notes += ` [Amended Post-Acceptance: Supplier revised value via Table 9A. Net ITC Delta: ₹${pair.amendmentDelta.deltaTax}]`;
      }
    }

    // Totals Computation
    let sumMatchedItc = new Decimal(0);
    for (const pair of matchedPairs) {
      if (pair.status === 'EXACT_MATCH' || pair.status === 'FUZZY_MATCH') {
        sumMatchedItc = sumMatchedItc.plus(new Decimal(pair.purchaseInvoice?.totalTax || 0));
      }
    }

    let sumAtRiskItc = new Decimal(0);
    for (const pr of unmatchedPR.values()) {
      sumAtRiskItc = sumAtRiskItc.plus(new Decimal(pr.totalTax || 0));
    }

    let sumUnclaimedItc = new Decimal(0);
    for (const b2 of unmatched2B.values()) {
      sumUnclaimedItc = sumUnclaimedItc.plus(new Decimal(b2.totalTax || 0));
    }

    return {
      period,
      totalPurchaseInvoices: purchaseInvoices.length,
      total2bRecords: portalRecords.length,
      exactMatchesCount: matchedPairs.filter((p) => p.status === 'EXACT_MATCH').length,
      fuzzyMatchesCount: matchedPairs.filter((p) => p.status === 'FUZZY_MATCH').length,
      valueMismatchesCount: matchedPairs.filter((p) => p.status === 'MISMATCH_VALUE').length,
      purchaseNotIn2bCount: unmatchedPR.size,
      vendorNotInPrCount: unmatched2B.size,
      totalMatchedItc: sumMatchedItc.toFixed(2),
      totalAtRiskItc: sumAtRiskItc.toFixed(2),
      totalUnclaimedItc: sumUnclaimedItc.toFixed(2),
      matchedPairs,
      unmatchedPurchase: Array.from(unmatchedPR.values()),
      unmatchedPortal2b: Array.from(unmatched2B.values()),
    };
  }
}

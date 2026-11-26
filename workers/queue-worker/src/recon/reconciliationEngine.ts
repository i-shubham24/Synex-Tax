import { Decimal } from 'decimal.js';
import { normalizeInvoiceNumber, strictInvoiceKey } from '../jobs/invoiceNormalizerJob.js';

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
  itcEligibility: 'ELIGIBLE' | 'INELIGIBLE_17_5' | 'INELIGIBLE_RULE_42_43' | 'INELIGIBLE_OTHER';
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
  /** Same number and values, but 2B dates it in another month: check before claiming. */
  | 'PROBABLE_MATCH'
  /** Same number; taxable value, total tax or the tax heads (IGST vs CGST+SGST) differ. */
  | 'MISMATCH_VALUE'
  /** Same number; the register has one document type and 2B another (invoice vs debit note). */
  | 'MISMATCH_DOCTYPE'
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
  probableMatchesCount: number;
  valueMismatchesCount: number;
  docTypeMismatchesCount: number;
  purchaseNotIn2bCount: number;
  vendorNotInPrCount: number;
  /** Register rows dated after the period: they belong to a later month's 2B. */
  outOfPeriodCount: number;
  /** Exact and fuzzy matches whose 2B line has ITC available. */
  totalMatchedItc: string;
  /** Book tax that needs work: not in 2B, value or type mismatch, or dated in another month. */
  totalAtRiskItc: string;
  /** 2B documents the register does not have. */
  totalUnclaimedItc: string;
  /** Matched, but 2B marks the credit as not available (itcavl N). */
  totalItcNotAvailable: string;
  /** Book tax on rows dated after the period, left for that later period. */
  totalDeferredItc: string;
  matchedPairs: ReconMatchPair[];
  unmatchedPurchase: PurchaseRegisterInvoice[];
  unmatchedPortal2b: Gstr2BRecord[];
  outOfPeriodPurchase: PurchaseRegisterInvoice[];
}

/** 'YYYY-MM' (or the GSTN 'MMYYYY') to 'YYYY-MM'; null when it is neither. */
function periodKey(period: string): string | null {
  const p = (period || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) return p;
  if (/^(0[1-9]|1[0-2])\d{4}$/.test(p)) return `${p.slice(2)}-${p.slice(0, 2)}`;
  return null;
}

const D = (v: string | number | undefined) => new Decimal(v || 0);
const sameGstin = (a: string, b: string) => a.replace(/\s+/g, '').toUpperCase() === b.replace(/\s+/g, '').toUpperCase();

/** Each tax head (IGST, CGST, SGST) within the tolerance. */
function headsAgree(pr: PurchaseRegisterInvoice, b2: Gstr2BRecord, tolerance: number): boolean {
  return (
    D(pr.igstAmount).minus(D(b2.igstAmount)).abs().lessThanOrEqualTo(tolerance) &&
    D(pr.cgstAmount).minus(D(b2.cgstAmount)).abs().lessThanOrEqualTo(tolerance) &&
    D(pr.sgstAmount).minus(D(b2.sgstAmount)).abs().lessThanOrEqualTo(tolerance)
  );
}

/** Taxable value, total tax and every tax head within the tolerance. */
function valuesAgree(pr: PurchaseRegisterInvoice, b2: Gstr2BRecord, tolerance: number): boolean {
  return (
    D(pr.taxableValue).minus(D(b2.taxableValue)).abs().lessThanOrEqualTo(tolerance) &&
    D(pr.totalTax).minus(D(b2.totalTax)).abs().lessThanOrEqualTo(tolerance) &&
    headsAgree(pr, b2, tolerance)
  );
}

function headsText(x: { igstAmount: string; cgstAmount: string; sgstAmount: string }): string {
  const parts: string[] = [];
  if (!D(x.igstAmount).isZero()) parts.push(`IGST ${x.igstAmount}`);
  if (!D(x.cgstAmount).isZero() || !D(x.sgstAmount).isZero()) parts.push(`CGST ${x.cgstAmount} + SGST ${x.sgstAmount}`);
  return parts.join(', ') || 'no tax';
}

export class GstReconciliationEngine {
  /**
   * Reconciles the purchase register with GSTR-2B for one return period.
   *
   *  0. Register rows dated after the period are set aside (they belong to a later 2B).
   *  1. Exact: same GSTIN, document type, number (ignoring case), date, taxable value and each tax head.
   *  2. Fuzzy: same GSTIN and type, number equal after normalising (segment boundaries kept first,
   *     then dropped), values within Rs 1.00 per head. Same date 0.95; same month 0.90; another
   *     month is only a PROBABLE_MATCH (0.75).
   *  3. Value mismatch: same GSTIN, type and normalised number, values or tax heads differ.
   *     Then type mismatch: same GSTIN and normalised number, different document type.
   *  4. Amendments: 2B lines amended after acceptance get their ITC delta.
   */
  public static reconcile(
    period: string,
    purchaseInvoices: PurchaseRegisterInvoice[],
    portalRecords: Gstr2BRecord[]
  ): ReconReport {
    const key = periodKey(period);
    const outOfPeriod: PurchaseRegisterInvoice[] = [];
    const unmatchedPR = new Map<string, PurchaseRegisterInvoice>();
    for (const pr of purchaseInvoices) {
      if (key && (pr.invoiceDate || '').slice(0, 7) > key) outOfPeriod.push(pr);
      else unmatchedPR.set(pr.id, pr);
    }

    const unmatched2B = new Map<string, Gstr2BRecord>();
    for (const rec of portalRecords) {
      unmatched2B.set(rec.id, rec);
    }

    const matchedPairs: ReconMatchPair[] = [];
    const take = (prId: string, b2Id: string, pair: ReconMatchPair) => {
      matchedPairs.push(pair);
      unmatchedPR.delete(prId);
      unmatched2B.delete(b2Id);
    };

    // PASS 1: exact.
    for (const [prId, pr] of unmatchedPR.entries()) {
      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (
          sameGstin(pr.vendorGstin, b2.supplierGstin) &&
          pr.docType === b2.docType &&
          pr.invoiceNum.trim().toUpperCase() === b2.docNum.trim().toUpperCase() &&
          pr.invoiceDate === b2.docDate &&
          valuesAgree(pr, b2, 0)
        ) {
          take(prId, b2Id, {
            status: 'EXACT_MATCH',
            confidenceScore: 1.0,
            purchaseInvoice: pr,
            portal2bRecord: b2,
            notes: 'Exact match across invoice number, date, taxable value and each tax head.',
          });
          break;
        }
      }
    }

    // PASS 2: fuzzy number, values within Rs 1.00 per head (rounding).
    // First with segment boundaries kept (A/1/12 = A-1-12), then without (SALES/25-26/1 = SALES25261).
    for (const keyOf of [strictInvoiceKey, normalizeInvoiceNumber]) {
      for (const [prId, pr] of unmatchedPR.entries()) {
        const prKey = keyOf(pr.invoiceNum);
        if (!prKey) continue;
        for (const [b2Id, b2] of unmatched2B.entries()) {
          if (!sameGstin(pr.vendorGstin, b2.supplierGstin) || pr.docType !== b2.docType) continue;
          if (keyOf(b2.docNum) !== prKey || !valuesAgree(pr, b2, 1)) continue;
          const sameDate = pr.invoiceDate === b2.docDate;
          const sameMonth = (pr.invoiceDate || '').slice(0, 7) === (b2.docDate || '').slice(0, 7);
          take(prId, b2Id, {
            status: sameMonth ? 'FUZZY_MATCH' : 'PROBABLE_MATCH',
            confidenceScore: sameDate ? 0.95 : sameMonth ? 0.9 : 0.75,
            purchaseInvoice: pr,
            portal2bRecord: b2,
            differenceTaxable: D(pr.taxableValue).minus(D(b2.taxableValue)).abs().toFixed(2),
            differenceTax: D(pr.totalTax).minus(D(b2.totalTax)).abs().toFixed(2),
            notes: sameDate
              ? `Same invoice written differently (${pr.invoiceNum} vs ${b2.docNum}), values within Rs 1.00.`
              : sameMonth
                ? `Same invoice (${pr.invoiceNum} vs ${b2.docNum}); dates differ within the month (${pr.invoiceDate} vs ${b2.docDate}).`
                : `Same number and values, but 2B dates it ${b2.docDate} and the register ${pr.invoiceDate}. Check it is the same document before claiming.`,
          });
          break;
        }
      }
    }

    // PASS 3a: same number and type, values or tax heads differ.
    for (const [prId, pr] of unmatchedPR.entries()) {
      const prKey = normalizeInvoiceNumber(pr.invoiceNum);
      if (!prKey) continue;
      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (!sameGstin(pr.vendorGstin, b2.supplierGstin) || pr.docType !== b2.docType) continue;
        if (normalizeInvoiceNumber(b2.docNum) !== prKey) continue;
        const diffTaxable = D(pr.taxableValue).minus(D(b2.taxableValue));
        const diffTax = D(pr.totalTax).minus(D(b2.totalTax));
        const headsOnly = diffTaxable.abs().lessThanOrEqualTo(1) && diffTax.abs().lessThanOrEqualTo(1);
        take(prId, b2Id, {
          status: 'MISMATCH_VALUE',
          confidenceScore: 0.8,
          purchaseInvoice: pr,
          portal2bRecord: b2,
          differenceTaxable: diffTaxable.toFixed(2),
          differenceTax: diffTax.toFixed(2),
          notes: headsOnly
            ? `Invoice ${pr.invoiceNum}: same total, different tax heads. Register ${headsText(pr)}; 2B ${headsText(b2)}. Check the place of supply.`
            : `Invoice number matches (${pr.invoiceNum}), but values differ: register taxable ₹${pr.taxableValue} vs 2B ₹${b2.taxableValue}.`,
        });
        break;
      }
    }

    // PASS 3b: same number, different document type.
    for (const [prId, pr] of unmatchedPR.entries()) {
      const prKey = normalizeInvoiceNumber(pr.invoiceNum);
      if (!prKey) continue;
      for (const [b2Id, b2] of unmatched2B.entries()) {
        if (!sameGstin(pr.vendorGstin, b2.supplierGstin) || normalizeInvoiceNumber(b2.docNum) !== prKey) continue;
        take(prId, b2Id, {
          status: 'MISMATCH_DOCTYPE',
          confidenceScore: 0.5,
          purchaseInvoice: pr,
          portal2bRecord: b2,
          differenceTaxable: D(pr.taxableValue).minus(D(b2.taxableValue)).toFixed(2),
          differenceTax: D(pr.totalTax).minus(D(b2.totalTax)).toFixed(2),
          notes: `${pr.invoiceNum} is booked as ${pr.docType} but the supplier reported it as ${b2.docType}.`,
        });
        break;
      }
    }

    // PASS 4: Handle "Amended Post-Acceptance" Lineage on 2B records
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

    // Totals. Each register row's tax lands in exactly one bucket.
    let sumMatchedItc = new Decimal(0);
    let sumNotAvailable = new Decimal(0);
    let sumAtRiskItc = new Decimal(0);
    for (const pair of matchedPairs) {
      const tax = D(pair.purchaseInvoice?.totalTax);
      if (pair.status === 'EXACT_MATCH' || pair.status === 'FUZZY_MATCH') {
        if (pair.portal2bRecord?.itcAvailable === false) sumNotAvailable = sumNotAvailable.plus(tax);
        else sumMatchedItc = sumMatchedItc.plus(tax);
      } else {
        sumAtRiskItc = sumAtRiskItc.plus(tax);
      }
    }
    for (const pr of unmatchedPR.values()) {
      sumAtRiskItc = sumAtRiskItc.plus(D(pr.totalTax));
    }

    let sumUnclaimedItc = new Decimal(0);
    for (const b2 of unmatched2B.values()) {
      sumUnclaimedItc = sumUnclaimedItc.plus(D(b2.totalTax));
    }
    const sumDeferred = outOfPeriod.reduce((a, pr) => a.plus(D(pr.totalTax)), new Decimal(0));
    const count = (st: ReconMatchStatus) => matchedPairs.filter((p) => p.status === st).length;

    return {
      period,
      totalPurchaseInvoices: purchaseInvoices.length,
      total2bRecords: portalRecords.length,
      exactMatchesCount: count('EXACT_MATCH'),
      fuzzyMatchesCount: count('FUZZY_MATCH'),
      probableMatchesCount: count('PROBABLE_MATCH'),
      valueMismatchesCount: count('MISMATCH_VALUE'),
      docTypeMismatchesCount: count('MISMATCH_DOCTYPE'),
      purchaseNotIn2bCount: unmatchedPR.size,
      vendorNotInPrCount: unmatched2B.size,
      outOfPeriodCount: outOfPeriod.length,
      totalMatchedItc: sumMatchedItc.toFixed(2),
      totalAtRiskItc: sumAtRiskItc.toFixed(2),
      totalUnclaimedItc: sumUnclaimedItc.toFixed(2),
      totalItcNotAvailable: sumNotAvailable.toFixed(2),
      totalDeferredItc: sumDeferred.toFixed(2),
      matchedPairs,
      unmatchedPurchase: Array.from(unmatchedPR.values()),
      unmatchedPortal2b: Array.from(unmatched2B.values()),
      outOfPeriodPurchase: outOfPeriod,
    };
  }
}

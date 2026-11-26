import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GstReconciliationEngine, PurchaseRegisterInvoice, Gstr2BRecord } from './reconciliationEngine.js';

test('GstReconciliationEngine: 4-Pass Full Reconciliation Workflow', () => {
  const purchaseInvoices: PurchaseRegisterInvoice[] = [
    // 1. Exact Match candidate
    {
      id: 'pr-001',
      vendorGstin: '03AABCA1234F1ZJ',
      invoiceNum: 'INV-2026/001',
      invoiceDate: '2026-11-04',
      docType: 'INV',
      taxableValue: '100000.00',
      igstAmount: '0.00',
      cgstAmount: '9000.00',
      sgstAmount: '9000.00',
      totalTax: '18000.00',
      itcEligibility: 'ELIGIBLE',
    },
    // 2. Fuzzy Match candidate (Tally format vs Portal format + 40 paise rounding)
    {
      id: 'pr-002',
      vendorGstin: '03BBBBB9999B1Z1',
      invoiceNum: 'SALES/25-26/1', // Tally style with slashes and FY
      invoiceDate: '2026-11-06',
      docType: 'INV',
      taxableValue: '50000.00',
      igstAmount: '0.00',
      cgstAmount: '4500.00',
      sgstAmount: '4500.00',
      totalTax: '9000.00',
      itcEligibility: 'ELIGIBLE',
    },
    // 3. Value Mismatch candidate (Book has 20,000 taxable, portal has 15,000)
    {
      id: 'pr-003',
      vendorGstin: '07CCCCC8888C1Z2',
      invoiceNum: 'DEL-88',
      invoiceDate: '2026-11-10',
      docType: 'INV',
      taxableValue: '20000.00',
      igstAmount: '3600.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      totalTax: '3600.00',
      itcEligibility: 'ELIGIBLE',
    },
    // 4. Purchase Not in 2B (Supplier hasn't filed GSTR-1, ITC at risk!)
    {
      id: 'pr-004',
      vendorGstin: '03DDDDD7777D1Z3',
      invoiceNum: 'UNFILED-99',
      invoiceDate: '2026-11-12',
      docType: 'INV',
      taxableValue: '30000.00',
      igstAmount: '0.00',
      cgstAmount: '2700.00',
      sgstAmount: '2700.00',
      totalTax: '5400.00',
      itcEligibility: 'ELIGIBLE',
    },
  ];

  const portalRecords: Gstr2BRecord[] = [
    // 1. Matches pr-001 exactly
    {
      id: '2b-001',
      supplierGstin: '03AABCA1234F1ZJ',
      docNum: 'INV-2026/001',
      docDate: '2026-11-04',
      docType: 'INV',
      taxableValue: '100000.00',
      igstAmount: '0.00',
      cgstAmount: '9000.00',
      sgstAmount: '9000.00',
      totalTax: '18000.00',
      itcAvailable: true,
    },
    // 2. Matches pr-002 fuzzy (Supplier entered SALES25261 without slashes)
    {
      id: '2b-002',
      supplierGstin: '03BBBBB9999B1Z1',
      docNum: 'SALES25261',
      docDate: '2026-11-06',
      docType: 'INV',
      taxableValue: '50000.40', // 40 paise difference within statutory tolerance
      igstAmount: '0.00',
      cgstAmount: '4500.00',
      sgstAmount: '4500.00',
      totalTax: '9000.00',
      itcAvailable: true,
    },
    // 3. Matches pr-003 with Value Mismatch
    {
      id: '2b-003',
      supplierGstin: '07CCCCC8888C1Z2',
      docNum: 'DEL-88',
      docDate: '2026-11-10',
      docType: 'INV',
      taxableValue: '15000.00', // differs from 20000.00
      igstAmount: '2700.00',
      cgstAmount: '0.00',
      sgstAmount: '0.00',
      totalTax: '2700.00',
      itcAvailable: true,
    },
    // 4. Vendor in 2B but not in PR (Unclaimed ITC!)
    {
      id: '2b-004',
      supplierGstin: '03EEEEE6666E1Z4',
      docNum: 'RAW-001',
      docDate: '2026-11-02',
      docType: 'INV',
      taxableValue: '75000.00',
      igstAmount: '0.00',
      cgstAmount: '6750.00',
      sgstAmount: '6750.00',
      totalTax: '13500.00',
      itcAvailable: true,
      // Amended Post-Acceptance test attribute
      isAmendedPostAcceptance: true,
      originalTaxableValue: '60000.00',
      originalTotalTax: '10800.00',
    },
  ];

  const report = GstReconciliationEngine.reconcile('2026-11', purchaseInvoices, portalRecords);

  assert.equal(report.exactMatchesCount, 1, 'Expected 1 exact match');
  assert.equal(report.fuzzyMatchesCount, 1, 'Expected 1 fuzzy match');
  assert.equal(report.valueMismatchesCount, 1, 'Expected 1 value mismatch');
  assert.equal(report.purchaseNotIn2bCount, 1, 'Expected 1 purchase invoice not in 2B');
  assert.equal(report.vendorNotInPrCount, 1, 'Expected 1 vendor invoice not in PR');

  // Verify Total ITC Buckets
  assert.equal(report.totalMatchedItc, '27000.00'); // 18000 + 9000
  assert.equal(report.totalAtRiskItc, '9000.00');   // pr-004 not in 2B (5400) + pr-003 value mismatch (3600)
  assert.equal(report.totalItcNotAvailable, '0.00');
  assert.equal(report.outOfPeriodCount, 0);
  assert.equal(report.totalUnclaimedItc, '13500.00'); // 2b-004

  // Verify Fuzzy match pair details
  const fuzzyPair = report.matchedPairs.find((p) => p.status === 'FUZZY_MATCH');
  assert.ok(fuzzyPair);
  assert.equal(fuzzyPair.purchaseInvoice?.invoiceNum, 'SALES/25-26/1');
  assert.equal(fuzzyPair.portal2bRecord?.docNum, 'SALES25261');
  assert.equal(fuzzyPair.confidenceScore, 0.95);

  // Verify Unmatched buckets
  assert.equal(report.unmatchedPurchase[0].id, 'pr-004');
  assert.equal(report.unmatchedPortal2b[0].id, '2b-004');

  // Verify Amended Post-Acceptance lineage badge and net ITC delta
  const amendedRecord = report.unmatchedPortal2b[0];
  assert.equal(amendedRecord.isAmendedPostAcceptance, true);
});

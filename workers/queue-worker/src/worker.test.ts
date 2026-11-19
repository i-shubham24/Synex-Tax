import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvoiceNumber, compareInvoices } from './jobs/invoiceNormalizerJob.js';
import { ImsPre14AlertEngine, ImsRecordForScan } from './jobs/imsPre14AlertJob.js';

test('InvoiceNormalizerJob: Pass 2 Fuzzy Matching Normalization', () => {
  // Case 1: Tally format vs Portal format
  // Book has: SALES/25-26/1 vs Portal has: SALES25261
  const norm1 = normalizeInvoiceNumber('SALES/25-26/1');
  const norm2 = normalizeInvoiceNumber('SALES25261');
  assert.equal(norm1, 'SALES25261');
  assert.equal(norm2, 'SALES25261');

  const match1 = compareInvoices('SALES/25-26/1', 'SALES25261');
  assert.equal(match1.isExactMatch, false);
  assert.equal(match1.isFuzzyMatch, true);
  assert.equal(match1.confidenceScore, 0.95);

  // Case 2: Leading zeros and 4-digit FY token
  // INV-2025-26/0042 vs INV252642
  assert.equal(normalizeInvoiceNumber('INV-2025-26/0042'), 'INV252642');
  assert.equal(normalizeInvoiceNumber('INV252642'), 'INV252642');
  assert.equal(compareInvoices('INV-2025-26/0042', 'INV252642').isFuzzyMatch, true);

  // Case 3: Next FY 2026-27
  // EXP/26-27/00099 vs EXP262799
  assert.equal(normalizeInvoiceNumber('EXP/26-27/00099'), 'EXP262799');
  assert.equal(compareInvoices('EXP/26-27/00099', 'EXP262799').isFuzzyMatch, true);
});

test('ImsPre14AlertJob: 48-Hour Pre-14th Deemed Acceptance Risk Scan', () => {
  const records: ImsRecordForScan[] = [
    {
      id: 'rec-1',
      firmId: 'firm-01',
      gstRegistrationId: 'gst-01',
      gstin: '03AABCA1234F1Z5',
      supplierGstin: '03BBBBB9999B1Z1',
      supplierName: 'Punjab Logistics',
      invoiceNum: 'PL/2526/100',
      invoiceDate: '2026-11-05',
      taxableValue: '80000.00', // > 25,000 threshold
      totalTax: '14400.00',
      imsActionStatus: 'NONE',
      itcAvailable: true,
      isSection17_5Blocked: false,
    },
    {
      id: 'rec-2',
      firmId: 'firm-01',
      gstRegistrationId: 'gst-01',
      gstin: '03AABCA1234F1Z5',
      supplierGstin: '03CCCCC8888C1Z2',
      supplierName: 'Amritsar Club & Catering',
      invoiceNum: 'ACC-091',
      invoiceDate: '2026-11-08',
      taxableValue: '12000.00',
      totalTax: '2160.00',
      imsActionStatus: 'NONE',
      itcAvailable: false,
      isSection17_5Blocked: true, // Section 17(5) blocked!
    },
    {
      id: 'rec-3',
      firmId: 'firm-01',
      gstRegistrationId: 'gst-01',
      gstin: '03AABCA1234F1Z5',
      supplierGstin: '03DDDDD7777D1Z3',
      supplierName: 'Office Stationary Mart',
      invoiceNum: 'OSM-12',
      invoiceDate: '2026-11-10',
      taxableValue: '5000.00', // Low value, normal
      totalTax: '900.00',
      imsActionStatus: 'NONE',
      itcAvailable: true,
      isSection17_5Blocked: false,
    },
    {
      id: 'rec-4',
      firmId: 'firm-01',
      gstRegistrationId: 'gst-01',
      gstin: '03AABCA1234F1Z5',
      supplierGstin: '03EEEEE6666E1Z4',
      supplierName: 'Raw Cotton Traders',
      invoiceNum: 'RCT-55',
      invoiceDate: '2026-11-02',
      taxableValue: '500000.00',
      totalTax: '25000.00',
      imsActionStatus: 'A', // Already Accepted by CA, not unactioned
      itcAvailable: true,
      isSection17_5Blocked: false,
    },
  ];

  const alert = ImsPre14AlertEngine.scan('firm-01', '03AABCA1234F1Z5', records, '2026-11');
  assert.ok(alert !== null);
  assert.equal(alert.severity, 'CRITICAL', 'Blocked 17(5) credit must elevate to CRITICAL');
  assert.equal(alert.unactionedCount, 3);
  assert.equal(alert.blockedCreditCount, 1);
  assert.equal(alert.highValueCount, 1);
  assert.equal(alert.flaggedInvoices.length, 2);
  assert.equal(alert.deadlineTimestamp, '2026-11-13T23:59:59+05:30');
});

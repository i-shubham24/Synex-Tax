import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TdsChallanCreateSchema,
  SalesInvoiceCreateSchema,
  PanStringSchema,
  GstinStringSchema,
  FirmCreateSchema,
  PiiRevealRequestSchema,
} from './index.js';

test('TdsChallanCreateSchema: ITNS 281 (1961) vs ITNS 281N (2025)', () => {
  const baseChallan = {
    entityId: '11111111-1111-1111-1111-111111111111',
    tanRegistrationId: '22222222-2222-2222-2222-222222222222',
    taxYear: 2026,
    quarter: 'Q1' as const,
    challanNo: 'CH-001',
    bsrCode: '0123456',
    depositDate: '2026-05-07',
    deducteeTypeHead: '0020' as const,
    minorHead: '200' as const,
    interestAllocation: '0.00',
    othersAllocation: '0.00',
    feeLateFiling: '0.00',
    totalChallanAmount: '50000.00',
  };

  // Valid 1961 challan with 1 section
  const valid1961 = TdsChallanCreateSchema.safeParse({
    ...baseChallan,
    statutoryRegime: 'IT_ACT_1961',
    sectionAllocations: [
      { sectionCode: '194C', incomeTax: '50000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '50000.00' },
    ],
  });
  assert.equal(valid1961.success, true);

  // Invalid 1961 challan with 2 sections (violates single section constraint)
  const invalid1961 = TdsChallanCreateSchema.safeParse({
    ...baseChallan,
    statutoryRegime: 'IT_ACT_1961',
    sectionAllocations: [
      { sectionCode: '194C', incomeTax: '30000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '30000.00' },
      { sectionCode: '194J', incomeTax: '20000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '20000.00' },
    ],
  });
  assert.equal(invalid1961.success, false);

  // Valid 2025 challan with 3 sections (ITNS 281N multi-section allowed up to 20)
  const valid2025 = TdsChallanCreateSchema.safeParse({
    ...baseChallan,
    statutoryRegime: 'IT_ACT_2025',
    sectionAllocations: [
      { sectionCode: '194C', incomeTax: '20000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '20000.00' },
      { sectionCode: '194J', incomeTax: '20000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '20000.00' },
      { sectionCode: '194I', incomeTax: '10000.00', surcharge: '0.00', cess: '0.00', totalSectionAmount: '10000.00' },
    ],
  });
  assert.equal(valid2025.success, true);
});

test('SalesInvoiceCreateSchema: Rule 46(b) invoice numbering', () => {
  const baseInvoice = {
    entityId: '11111111-1111-1111-1111-111111111111',
    gstRegistrationId: '22222222-2222-2222-2222-222222222222',
    invoiceDate: '2026-11-15',
    docType: 'INV' as const,
    supplyType: 'B2B' as const,
    posStateCode: '03',
    taxableValue: '10000.00',
    igstRate: '0.1800',
    igstAmount: '1800.00',
    cgstRate: '0.0000',
    cgstAmount: '0.00',
    sgstRate: '0.0000',
    sgstAmount: '0.00',
    cessRate: '0.0000',
    cessAmount: '0.00',
    totalInvoiceValue: '11800.00',
    returnPeriod: '2026-11',
  };

  // Valid invoice number (letters, digits, slash, hyphen, <= 16 chars)
  assert.equal(SalesInvoiceCreateSchema.safeParse({ ...baseInvoice, invoiceNum: 'INV-2026/001' }).success, true);

  // Invalid: exceeds 16 chars
  assert.equal(SalesInvoiceCreateSchema.safeParse({ ...baseInvoice, invoiceNum: 'INV-2026-2027-00001' }).success, false);

  // Invalid: contains disallowed special character (e.g. underscore)
  assert.equal(SalesInvoiceCreateSchema.safeParse({ ...baseInvoice, invoiceNum: 'INV_001' }).success, false);
});

test('PiiRevealRequestSchema: requires min 10 chars explanation', () => {
  assert.equal(
    PiiRevealRequestSchema.safeParse({
      targetTable: 'users',
      targetColumn: 'mobile_encrypted',
      recordId: '11111111-1111-1111-1111-111111111111',
      accessReason: 'Checking', // too short (< 10)
    }).success,
    false
  );

  assert.equal(
    PiiRevealRequestSchema.safeParse({
      targetTable: 'users',
      targetColumn: 'mobile_encrypted',
      recordId: '11111111-1111-1111-1111-111111111111',
      accessReason: 'Statutory GST notice compliance verification by partner',
    }).success,
    true
  );
});

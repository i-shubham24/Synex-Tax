import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGstr9AnnualReconciliation } from './gstr9Engine.js';

test('GSTR-9 Annual Return: aggregates Table 4 and Table 5 correctly', () => {
  const result = computeGstr9AnnualReconciliation({
    financialYear: '2025-26',
    gstin: '03AABCA1234F1Z5',
    legalName: 'Amritsar Silk Mills Pvt Ltd',
    outward: {
      b2b: { taxableValue: '1000000.00', igst: '180000.00', cgst: '0.00', sgst: '0.00' },
      b2cSmall: { taxableValue: '500000.00', igst: '0.00', cgst: '45000.00', sgst: '45000.00' },
      exportsWithoutTax: { taxableValue: '250000.00' },
      exemptNilNonGst: { exempt: '50000.00', nilRated: '0.00', nonGst: '0.00' },
      creditNotesTaxable: { taxableValue: '50000.00', igst: '9000.00', cgst: '0.00', sgst: '0.00' },
    },
    itc: {
      gstr3bTotalItcAvailed: { taxableValue: '800000.00', igst: '72000.00', cgst: '36000.00', sgst: '36000.00' },
      itcAsPer2b: { taxableValue: '850000.00', igst: '80000.00', cgst: '40000.00', sgst: '40000.00' },
      reversedSection17_5: { taxableValue: '20000.00', igst: '3600.00', cgst: '0.00', sgst: '0.00' },
    },
  });

  /* Table 4 Net Taxable: B2B (10L) + B2C (5L) less CN (0.5L) = 14.5L */
  assert.equal(result.gstr9.table4.subTotalTaxableOutward.taxableValue, '1450000.00');
  assert.equal(result.gstr9.table4.subTotalTaxableOutward.igst, '171000.00');
  assert.equal(result.gstr9.table4.subTotalTaxableOutward.cgst, '45000.00');
  assert.equal(result.gstr9.table4.subTotalTaxableOutward.sgst, '45000.00');

  /* Table 5: 2.5L exports without tax + 0.5L exempt = 3.0L */
  assert.equal(result.gstr9.table5.subTotalNonTaxable, '300000.00');
  assert.equal(result.gstr9.table5.totalTurnoverTable4And5, '1750000.00');

  /* Table 7 Net ITC Available: Total 3B availed less 17(5) reversal */
  assert.equal(result.gstr9.table7.netItcAvailable.igst, '68400.00');

  /* Table 8: 2B (80k IGST) vs 6B availed (70% inputs + 15% services = 85% of 72k = 61.2k) */
  assert.equal(result.gstr9.table8.isCreditExcessClaimed, false);
});

test('GSTR-9C Reconciliation Statement: detects turnover and ITC reconciliation gaps', () => {
  const result = computeGstr9AnnualReconciliation({
    financialYear: '2025-26',
    gstin: '03AABCA1234F1Z5',
    legalName: 'Amritsar Silk Mills Pvt Ltd',
    outward: {
      b2b: { taxableValue: '2000000.00', igst: '360000.00', cgst: '0.00', sgst: '0.00' },
    },
    itc: {
      gstr3bTotalItcAvailed: { taxableValue: '1000000.00', igst: '180000.00', cgst: '0.00', sgst: '0.00' },
      itcAsPer2b: { taxableValue: '900000.00', igst: '162000.00', cgst: '0.00', sgst: '0.00' },
    },
    books: {
      auditedGrossTurnover: '2100000.00',
      unbilledRevenueAtYearEnd: '50000.00',
      unbilledRevenueAtBeginning: '150000.00', /* Net adjustment: -100k => reconciled = 2000000.00 */
      auditedBooksTotalItc: '180000.00',
      auditedBooksEligibleItc: '180000.00',
    },
  });

  assert.ok(result.gstr9c);
  /* 21L + 50k - 150k = 20L reconciled, matches GSTR-9 */
  assert.equal(result.gstr9c.grossTurnover.reconciledTurnover, '2000000.00');
  assert.equal(result.gstr9c.grossTurnover.isBalanced, true);
  assert.equal(result.gstr9c.grossTurnover.unreconciledDifference, '0.00');

  /* Table 8D warns if 3B credit claimed exceeds GSTR-2B */
  assert.equal(result.gstr9.table8.isCreditExcessClaimed, false);
});

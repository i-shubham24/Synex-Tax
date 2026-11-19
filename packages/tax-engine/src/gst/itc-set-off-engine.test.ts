import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GstItcSetOffEngine } from './itc-set-off-engine.js';

test('GstItcSetOffEngine: Basic Rule 88A set-off', () => {
  const result = GstItcSetOffEngine.compute({
    liability: {
      outward: { igst: 1000, cgst: 500, sgst: 500, cess: 0 },
      rcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
    },
    itcAvailable: {
      igst: 1200,
      cgst: 400,
      sgst: 400,
      cess: 0,
    },
    turnover: {
      domesticTaxable: 100000, // < 50 Lakhs, Rule 86B does not apply
    },
  });

  // IGST ITC (1200) offsets IGST liability (1000), leaving 200 IGST ITC.
  // The remaining 200 IGST ITC is split across CGST and SGST liabilities (100 each).
  // Remaining CGST liability = 400. Offset by CGST ITC (400) -> 0 cash payable.
  // Remaining SGST liability = 400. Offset by SGST ITC (400) -> 0 cash payable.
  assert.equal(result.cashPayable.totalCashPayable.toString(), '0');
  assert.equal(result.itcUtilization.igstAgainstIgst.toString(), '1000');
  assert.equal(result.itcUtilization.totalItcUtilized.toString(), '2000');
  assert.equal(result.rule86bApplied, false);
});

test('GstItcSetOffEngine: Rule 86B (1% mandatory cash payment)', () => {
  // Taxable turnover > 50 Lakhs (e.g. 60,00,000) and no exemption
  const result = GstItcSetOffEngine.compute({
    liability: {
      outward: { igst: 0, cgst: 50000, sgst: 50000, cess: 0 }, // Total outward liability = 1,00,000
      rcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
    },
    itcAvailable: {
      igst: 0,
      cgst: 100000,
      sgst: 100000,
      cess: 0,
    },
    turnover: {
      domesticTaxable: 6000000, // 60 Lakhs
    },
    rule86bExemptions: {
      itPaid1LakhLast2Fy: false,
      refund1LakhPrevFy: false,
      cumulativeCash1PctMet: false,
      isGovernmentOrPsu: false,
    },
  });

  assert.equal(result.rule86bApplied, true);
  // Max ITC is 99% of 100,000 = 99,000.
  // Minimum 1% cash must be paid = 1,000.
  assert.equal(result.rule86bMaxItcCap?.toString(), '99000');
  assert.equal(result.cashPayable.totalCashPayable.toString(), '1000');
});

test('GstItcSetOffEngine: Advisory 643 reclaim ledger guard', () => {
  const result = GstItcSetOffEngine.compute({
    liability: {
      outward: { igst: 1000, cgst: 0, sgst: 0, cess: 0 },
      rcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
    },
    itcAvailable: {
      igst: 1000,
      cgst: 0,
      sgst: 0,
      cess: 0,
    },
    turnover: {
      domesticTaxable: 50000,
    },
    advisory643Ledgers: {
      reclaimLedgerClosing: { igst: 500, cgst: 0, sgst: 0 },
      rcmLedgerClosing: { igst: 0, cgst: 0, sgst: 0 },
      table4b2Reversed: { igst: 200, cgst: 0, sgst: 0 },
      // Attempting to reclaim 800 when closing (500) + reversed (200) = 700!
      table4d1Reclaimed: { igst: 800, cgst: 0, sgst: 0 },
    },
  });

  assert.equal(result.advisory643Validation.isValid, false);
  assert.match(result.advisory643Validation.errors[0], /Advisory 643 Violation/);
});

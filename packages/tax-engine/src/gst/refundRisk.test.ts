import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInputType, computeInvertedDutyRefundWorkpaper } from './refundRisk.js';

test('classifyInputType distinguishes Goods HSN, 99xxxx SAC services, and Capital Goods', () => {
  assert.equal(classifyInputType({ hsnOrSac: '5208', description: 'Cotton grey fabric' }), 'INPUT_GOODS');
  assert.equal(classifyInputType({ hsnOrSac: '998821', description: 'Dyeing and job work charges' }), 'INPUT_SERVICES');
  assert.equal(classifyInputType({ hsnOrSac: '8445', description: 'Rapier loom weaving machinery' }), 'CAPITAL_GOODS');
  assert.equal(classifyInputType({ hsnOrSac: '5208', isCapitalGoods: true, description: 'Yarn' }), 'CAPITAL_GOODS');
});

test('computeInvertedDutyRefundWorkpaper enforces Nov 1 service cutover, blocks unmatched 2B rows, and computes 90% cap', () => {
  const res = computeInvertedDutyRefundWorkpaper({
    gstin: '03AABCS1429B1Z2',
    periodFrom: '2026-10',
    periodTo: '2026-11',
    today: '2026-11-27',
    lutArn: 'AD031126000123A',
    lutValidTo: '2027-03-31',
    gstr1OutwardTax: '50000.00',
    gstr3bOutwardTax: '50000.00',
    gstr2bAvailableItc: '30000.00',
    gstr3bClaimedItc: '30000.00',
    purchases: [
      {
        id: 'p1',
        vendorGstin: '03AAACR1111A1Z1',
        invoiceNum: 'INV-101',
        invoiceDate: '2026-10-18',
        hsnSacCode: '998821',
        description: 'Job work before Nov 1',
        taxableValue: '20000.00',
        igstAmount: '1000.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        reconStatus: 'EXACT_MATCH',
        itcEligibility: 'ELIGIBLE',
      },
      {
        id: 'p2',
        vendorGstin: '03AAACR1111A1Z1',
        invoiceNum: 'INV-102',
        invoiceDate: '2026-11-05',
        hsnSacCode: '996511',
        description: 'Freight on inputs post Nov 1',
        taxableValue: '40000.00',
        igstAmount: '2000.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        reconStatus: 'EXACT_MATCH',
        itcEligibility: 'ELIGIBLE',
      },
      {
        id: 'p3',
        vendorGstin: '03AAACR2222B1Z2',
        invoiceNum: 'INV-103',
        invoiceDate: '2026-11-10',
        hsnSacCode: '5205',
        description: 'Cotton yarn',
        taxableValue: '100000.00',
        igstAmount: '5000.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        reconStatus: 'EXACT_MATCH',
        itcEligibility: 'ELIGIBLE',
      },
      {
        id: 'p4',
        vendorGstin: '03AAACR3333C1Z3',
        invoiceNum: 'INV-104',
        invoiceDate: '2026-11-12',
        hsnSacCode: '5208',
        description: 'Unmatched supplier bill',
        taxableValue: '10000.00',
        igstAmount: '500.00',
        cgstAmount: '0.00',
        sgstAmount: '0.00',
        reconStatus: 'VENDOR_NOT_IN_2B',
        itcEligibility: 'ELIGIBLE',
      },
    ],
  });

  assert.equal(res.breakdown.preNov1ServicesExcludedItc, '1000.00');
  assert.equal(res.breakdown.postNov1ServicesEligibleItc, '2000.00');
  assert.equal(res.breakdown.inputGoodsEligibleItc, '5000.00');
  assert.equal(res.breakdown.totalEligibleRefundPool, '7000.00');
  assert.equal(res.breakdown.provisional90PercentRefund, '6300.00');
  assert.equal(res.blockedRows.length, 1);
  assert.equal(res.blockedRows[0].invoiceNum, 'INV-104');
  assert.equal(res.provisionalSanctionEligible, false);
  assert.ok(res.riskFlags.some((f) => f.code === 'UNMATCHED_2B_BLOCKED'));
});

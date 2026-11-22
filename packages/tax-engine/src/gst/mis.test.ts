import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gstMis } from './mis.js';

test('GST MIS: months, net tax after blocked credit, parties merged by GSTIN with validity', () => {
  const r = gstMis(2026, [
    { side: 'SALE', period: '2026-10', partyGstin: '03AABCL1234F1Z8', partyName: 'Ludhiana Traders', docType: 'INV', taxable: '100000', tax: '18000' },
    { side: 'SALE', period: '2026-10', partyGstin: '03AABCL1234F1Z8', partyName: 'Ludhiana Traders', docType: 'CRN', taxable: '10000', tax: '1800' },
    { side: 'SALE', period: '2026-11', partyGstin: null, partyName: 'Walk-in', docType: 'INV', taxable: '5000', tax: '900' },
    { side: 'PURCHASE', period: '2026-10', partyGstin: '03AABCL1234F1Z8', partyName: 'Ludhiana Traders', docType: 'INV', taxable: '40000', tax: '7200', ineligibleTax: '1200' },
    { side: 'PURCHASE', period: '2026-10', partyGstin: '03AABCL1234F1ZB', partyName: 'Bad GSTIN Co', docType: 'INV', taxable: '1000', tax: '180' },
    { side: 'SALE', period: '2025-10', partyGstin: null, partyName: 'Last year', docType: 'INV', taxable: '1', tax: '0' },
  ]);
  const oct = r.months.find((m) => m.period === '2026-10')!;
  assert.deepEqual([oct.sales, oct.outputTax, oct.purchases, oct.inputTax, oct.netTax], ['90000.00', '16200.00', '41000.00', '6180.00', '10020.00']);
  assert.equal(r.months.length, 12);
  assert.equal(r.totals.sales, '95000.00');
  const lt = r.parties.find((p) => p.gstin === '03AABCL1234F1Z8')!;
  assert.deepEqual([lt.side, lt.sales, lt.purchases, lt.gstinValid, lt.state], ['BOTH', '90000.00', '40000.00', true, 'Punjab']);
  assert.equal(r.parties.find((p) => p.name === 'Bad GSTIN Co')!.gstinValid, false);
  assert.equal(r.topCustomers[0].name, 'Ludhiana Traders');
});

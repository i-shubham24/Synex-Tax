import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORM_140_SECTION_CODES } from './form140Codes.js';
import { RATES_2025, checkRates, rateFor } from './rates2025.js';

test('every Form 140 code has a rate rule', () => {
  const missing = FORM_140_SECTION_CODES.map((c) => c.code).filter((c) => !RATES_2025[c]);
  assert.deepEqual(missing, []);
});

test('rates from the department’s chart: insurance commission turns on the payee being a company', () => {
  assert.equal(rateFor('1005', 'ABCPK1234L'), 2);
  assert.equal(rateFor('1005', 'AAACL1234F'), 10);
  assert.equal(rateFor('1027', 'ABCPK1234L'), 10);
  assert.equal(rateFor('1026', 'ABCPK1234L'), 2);
  assert.equal(rateFor('1023', 'ABCPK1234L'), 1);
  assert.equal(rateFor('9999', 'ABCPK1234L'), null);
});

const row = (id: string, over: Partial<Parameters<typeof checkRates>[0][number]>) => ({ id, pan: 'ABCPK1234L', name: 'Payee', sectionCode: '1027', paidOn: '2026-10-01', amountPaid: '10000', taxDeducted: '1000', ...over });

test('short rate, missing deduction once the year passes the threshold, and a wrong below-threshold claim', () => {
  const f = checkRates([
    // Professional fees 10%: 60,000 at 5% is short by 3,000.
    row('short', { amountPaid: '60000', taxDeducted: '3000' }),
    // Contractor (1%): two payments of 25,000 and 80,000; the second crosses Rs 1 lakh for the year.
    row('c1', { pan: 'BQRPS4410K', sectionCode: '1023', amountPaid: '25000', taxDeducted: '0', reasonCode: 'Y' }),
    row('c2', { pan: 'BQRPS4410K', sectionCode: '1023', amountPaid: '80000', taxDeducted: '0' }),
    // Rent 10%: 45,000 a month is under Rs 50,000; fine without tax.
    row('rent', { pan: 'AAKFR2290D', sectionCode: '1009', amountPaid: '45000', taxDeducted: '0' }),
    // Purchase of goods: tax is on the excess over Rs 50 lakh, so only the rate is looked at.
    row('goods', { pan: 'AAKFR2290D', sectionCode: '1031', amountPaid: '6000000', taxDeducted: '1000' }),
    // Lower certificate (flag A) is judged by the certificate, not here.
    row('cert', { amountPaid: '100000', taxDeducted: '2000', reasonCode: 'A' }),
    // No PAN: left to the higher-rate check.
    row('nopan', { pan: 'PANNOTAVBL', amountPaid: '100000', taxDeducted: '0' }),
  ]);
  assert.deepEqual(f.map((x) => [x.rowId, x.kind, x.shortBy]), [
    ['short', 'SHORT_RATE', '3000.00'],
    ['c1', 'THRESHOLD_CLAIM_WRONG', '250.00'],
    ['c2', 'NOT_DEDUCTED', '800.00'],
  ]);
});

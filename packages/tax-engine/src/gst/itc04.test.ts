import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itc04Period, itc04Statement, parseJobWorkReceived, parseJobWorkSent } from './itc04.js';

const SENT = [
  'Challan No\tDate\tJob Worker GSTIN\tState\tDescription\tUQC\tQty\tValue\tType',
  'JW/1\t10/04/2025\t03AABCL1234F1Z8\t\tGrey fabric\tMTR\t1000\t2,00,000\tInputs',
  'JW/2\t05/10/2026\t\t03\tYarn\tKGS\t500\t1,00,000\tInputs',
  'JW/3\t01/06/2024\t03AABCL1234F1Z8\t\tDyeing machine\tNOS\t1\t5,00,000\tCapital goods',
  'JW/4\t01/06/2026\t03AABCL1234F1ZB\t\tBad GSTIN\tNOS\t1\t100\tInputs',
].join('\n');
const RECEIVED = [
  'Original Challan No\tReceived On\tQty\tLoss\tNature',
  'JW/1\t15/06/2025\t600\t20\tDyeing',
  'JW/2\t01/11/2026\t500\t\tTwisting',
  'JW/9\t01/11/2026\t10\t\tUnknown',
].join('\n');

test('ITC-04: what is still out, what has become a supply, and returns without a challan', () => {
  const { sent, errors } = parseJobWorkSent(SENT);
  assert.deepEqual(errors.map((e) => e.line), [5]); // JW/4, the fifth line counting the heading
  const { received } = parseJobWorkReceived(RECEIVED);
  const s = itc04Statement(sent, received, '2026-11-21');
  assert.deepEqual(s.lines.map((l) => [l.challanNo, l.pending, l.returnBy, l.deemedSupply]), [
    ['JW/1', '380.000', '2026-04-10', true],
    ['JW/2', '0.000', '2027-10-05', false],
    ['JW/3', '1.000', '2027-06-01', false],
  ]);
  // 380 of 1,000 metres still out after a year: 76,000 of value treated as supplied.
  assert.equal(s.deemedValue, '76000.00');
  assert.deepEqual(s.unmatched.map((u) => u.originalChallanNo), ['JW/9']);
});

test('ITC-04 periods: half-yearly above Rs 5 crore, yearly otherwise', () => {
  assert.deepEqual(itc04Period('2026-08-10', true), { period: 'April to September 2026-27', dueDate: '2026-10-25' });
  assert.deepEqual(itc04Period('2027-02-10', true), { period: 'October to March 2026-27', dueDate: '2027-04-25' });
  assert.deepEqual(itc04Period('2026-08-10', false), { period: 'April to March 2026-27', dueDate: '2027-04-25' });
});

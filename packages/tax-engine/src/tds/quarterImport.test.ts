import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuarterSheet } from './quarterImport.js';

const SHEET = [
  'BSR Code\tChallan No\tChallan Date\tInterest\tSection\tPAN\tName\tAmount Paid\tPaid On\tTDS\tDeducted On',
  '0510308\t00417\t07/11/2026\t\t1027\tABCPK1234L\tDr Kaur\t60,000\t15/10/2026\t6,000\t15/10/2026',
  '0510308\t00417\t07/11/2026\t120\t1023\tBQRPS4410K\tSingh Transport\t1,00,000\t20/10/2026\t1,000\t20/10/2026',
  '0510308\t00418\t07/12/2026\t\t1009\tAAKFR2290D\tRana Estates\t75,000\t05/11/2026\t7,500\t05/11/2026',
  '0510308\t00419\t07/12/2026\t\t194J\tAAKFR2290D\tOld code\t1000\t05/11/2026\t100\t05/11/2026',
  '0510308\t00419\t07/12/2026\t\t1009\tAAKFR2290D\tOut of quarter\t1000\t05/01/2027\t100\t05/01/2027',
].join('\n');

test('a quarter sheet groups rows into challans and checks each row', () => {
  const r = parseQuarterSheet(SHEET, { form: '140', taxYear: 2026, quarter: 3 });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.challans.map((c) => [c.challanNo, c.depositedOn, c.rows.length, c.tax, c.interest]), [
    ['417', '2026-11-07', 2, '7000.00', '120.00'],
    ['418', '2026-12-07', 1, '7500.00', '0.00'],
  ]);
  assert.equal(r.challans[0].rows[0].ratePercent, '10.0000');
  assert.deepEqual(r.errors.map((e) => e.line), [5, 6]);
  assert.match(r.errors[0].message, /not in Annexure 2 of Form 140/);
  assert.match(r.errors[1].message, /within Q3/);
});

test('missing columns are named', () => {
  assert.deepEqual(parseQuarterSheet('PAN\tName\n', { form: '140', taxYear: 2026, quarter: 3 }).missing, ['bsr', 'challanNo', 'depositedOn', 'section', 'amountPaid', 'paidOn', 'tax']);
});

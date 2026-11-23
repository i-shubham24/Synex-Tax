import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm26ASText, tdsSectionCode } from './form26as.js';

// Synthetic: typed for this test in the "^" separated layout described at the top of form26as.ts
// (heading names as in the TRACES text download). Not a real statement: the names, PAN, TANs,
// challans and figures are invented and only match the formats.

const SAMPLE = [
  'File Creation Date^Permanent Account Number (PAN)^Current Status of PAN^Financial Year^Assessment Year^Name of Assessee^Address Line 1^Address Line 2^Address Line 3^Address Line 4^Address Line 5^Statecode^Pin Code',
  '15-06-2025^ABCPK1234L^Active^2024-25^2025-26^RAVI KUMAR^45^LAKE VIEW^^BENGALURU^^15^560001',
  '',
  '^PART-I - Details of Tax Deducted at Source^',
  'Sr. No.^Name of Deductor^TAN of Deductor^^^^^Total Amount Paid / Credited(Rs.)^Total Tax Deducted(Rs.)^Total TDS Deposited(Rs.)',
  '1^SAMPLE SOFTWARE PRIVATE LIMITED^BLRS12345B^^^^^1200000.00^50000.00^50000.00',
  '^Sr. No.^Section^Transaction Date^Status of Booking^Date of Booking^Remarks^Amount Paid / Credited(Rs.)^Tax Deducted(Rs.)^TDS Deposited(Rs.)',
  '^1^192^30-Jun-2024^F^20-Aug-2024^-^300000.00^12000.00^12000.00',
  '^2^192^30-Sep-2024^F^20-Nov-2024^-^300000.00^12000.00^12000.00',
  '^3^192^31-Dec-2024^F^20-Feb-2025^-^300000.00^12000.00^12000.00',
  '^4^192^31-Mar-2025^F^20-May-2025^-^300000.00^14000.00^14000.00',
  '2^EXAMPLE BANK LIMITED^MUMS54321C^^^^^85000.00^8500.00^8500.00',
  '^Sr. No.^Section^Transaction Date^Status of Booking^Date of Booking^Remarks^Amount Paid / Credited(Rs.)^Tax Deducted(Rs.)^TDS Deposited(Rs.)',
  '^1^194A^31-Mar-2025^F^20-May-2025^-^60000.00^6000.00^6000.00',
  '^2^194A^31-Dec-2024^U^-^-^25000.00^2500.00^2500.00',
  '3^DEMO CONSULTANTS LLP^DELD11111D^^^^^40000.00^4000.00^4000.00',
  '^Sr. No.^Section^Transaction Date^Status of Booking^Date of Booking^Remarks^Amount Paid / Credited(Rs.)^Tax Deducted(Rs.)^TDS Deposited(Rs.)',
  '^1^194I(b)^31-Jan-2025^F^20-Mar-2025^-^40000.00^4000.00^4000.00',
  '',
  '^PART-II - Details of Tax Deducted at Source for 15G / 15H^',
  'Sr. No.^Name of Deductor^TAN of Deductor^^^^^Total Amount Paid / Credited(Rs.)^Total Tax Deducted(Rs.)^Total TDS Deposited(Rs.)',
  '^No Transactions Present^',
  '',
  '^PART-VI - Details of Tax Collected at Source^',
  'Sr. No.^Name of Collector^TAN of Collector^^^^^Total Amount Paid/ Debited(Rs.)^Total Tax Collected(Rs.)^Total TCS Deposited(Rs.)',
  '1^SAMPLE MOTORS PRIVATE LIMITED^PNES22222E^^^^^1200000.00^12000.00^12000.00',
  '^Sr. No.^Section^Transaction Date^Status of Booking^Date of Booking^Remarks^Amount Paid/ Debited(Rs.)^Tax Collected(Rs.)^TCS Deposited(Rs.)',
  '^1^206CL^15-Oct-2024^F^20-Jan-2025^-^1200000.00^12000.00^12000.00',
  '',
  '^PART C - Details of Tax Paid (other than TDS or TCS)^',
  'Sr. No.^Major Head^Minor Head^Tax(Rs.)^Surcharge(Rs.)^Education Cess(Rs.)^Others(Rs.)^Total Tax(Rs.)^BSR Code^Date of Deposit^Challan Serial Number^Remarks',
  '1^0021^100^10000.00^0.00^0.00^0.00^10000.00^0510308^15-03-2025^12345^-',
  '2^0021^300^2500.00^0.00^0.00^0.00^2500.00^0510308^20-07-2025^54321^-',
  '',
  '^PART-VII - Details of Paid Refund^',
  'Sr. No.^Assessment Year^Mode^Refund Issued^Nature of Refund^Amount of Refund(Rs.)^Interest(Rs.)^Date of Payment^Remarks',
  '1^2024-25^ECS^CPC^-^4200.00^126.00^10-Sep-2024^-',
  '',
  '^PART-X - TDS/TCS Defaults* (Processing of Defaults)^',
  'Sr. No.^Financial Year^Short Payment^Short Deduction/Collection^Interest on TDS/TCS Payments Default^Interest on TDS/TCS Deduction/Collection Default^Late Filing Fee u/s 234E^Interest u/s 220(2)^Total Default',
  '^No Transactions Present^',
].join('\r\n');

test('Form 26AS text (synthetic): header masked, TDS by deductor and section', () => {
  const r = parseForm26ASText(SAMPLE);
  assert.equal(r.is26AS, true);
  assert.equal(r.header.pan, 'XXXXX1234L');
  assert.equal(r.header.assessmentYear, '2025-26');
  assert.equal(r.header.fileCreated, '2025-06-15');
  assert.ok(!JSON.stringify(r).includes('ABCPK1234L'));

  const salary = r.tds.find((t) => t.section === '192')!;
  assert.equal(salary.tan, 'BLRS12345B');
  assert.equal(salary.amount, 1200000);
  assert.equal(salary.tds, 50000);
  assert.equal(salary.transactions, 4);

  const bank = r.tds.find((t) => t.tan === 'MUMS54321C')!;
  assert.equal(bank.section, '194A');
  assert.equal(bank.sectionCode, '94A');
  assert.equal(bank.tds, 8500);
  assert.deepEqual(bank.status, { F: 1, U: 1 });
  assert.ok(r.issues.some((i) => i.field === 'MUMS54321C' && /unmatched/.test(i.message)));

  const rent = r.tds.find((t) => t.tan === 'DELD11111D')!;
  assert.equal(rent.sectionCode, null); // 194I(b) is left for the user
  assert.equal(r.totals.tds, 62500);
});

test('Form 26AS text (synthetic): TCS, tax paid challans, refunds and parts not imported', () => {
  const r = parseForm26ASText(SAMPLE);
  assert.deepEqual(r.tcs.map((t) => [t.tan, t.section, t.tcs]), [['PNES22222E', '206CL', 12000]]);
  assert.equal(r.taxPaid.length, 2);
  assert.equal(r.taxPaid[0].kind, 'ADVANCE');
  assert.equal(r.taxPaid[1].kind, 'SELF');
  assert.equal(r.taxPaid[1].date, '2025-07-20');
  assert.deepEqual(r.refunds.map((x) => [x.assessmentYear, x.amount, x.interest, x.date]), [['2024-25', 4200, 126, '2024-09-10']]);
  assert.ok(r.parts.some((p) => p.kind === 'OTHER' && /Defaults/.test(p.title)));
  assert.equal(r.parts.find((p) => p.kind === 'TDS_15GH')?.rows, 0);

  assert.deepEqual(r.itr.salaryTds, [{ tan: 'BLRS12345B', name: 'SAMPLE SOFTWARE PRIVATE LIMITED', incomeChargeable: 1200000, tds: 50000 }]);
  assert.deepEqual(r.itr.otherTds.map((t) => [t.tan, t.section, t.amount, t.tds]), [['MUMS54321C', '94A', 85000, 8500], ['DELD11111D', '', 40000, 4000]]);
  assert.deepEqual(r.itr.tcs, [{ tan: 'PNES22222E', name: 'SAMPLE MOTORS PRIVATE LIMITED', tcs: 12000 }]);
  assert.deepEqual(r.itr.taxPayments, [
    { bsr: '0510308', date: '2025-03-15', serial: 12345, amount: 10000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-07-20', serial: 54321, amount: 2500, kind: 'SELF' },
  ]);
});

test('Form 26AS text (synthetic): no tax paid part is reported, not taken as nil', () => {
  const noC = SAMPLE.split('\r\n').filter((l) => !/PART C|Major Head|\^0021\^/.test(l)).join('\n');
  const r = parseForm26ASText(noC);
  assert.equal(r.taxPaid.length, 0);
  assert.ok(r.issues.some((i) => i.field === 'taxPaid'));
});

test('Schema codes for printed sections', () => {
  assert.equal(tdsSectionCode('194A'), '94A');
  assert.equal(tdsSectionCode('194BB'), '4BB');
  assert.equal(tdsSectionCode('194IA'), '4IA');
  assert.equal(tdsSectionCode('194JB'), '94J-B');
  assert.equal(tdsSectionCode('193'), '193');
  assert.equal(tdsSectionCode('194J'), null);
  assert.equal(tdsSectionCode('194I(a)'), null);
});

test('Not a 26AS text file', () => {
  const r = parseForm26ASText('Date,Narration,Debit\n01/04/2025,UPI,100');
  assert.equal(r.is26AS, false);
});

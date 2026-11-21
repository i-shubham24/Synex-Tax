import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAnalysis, depositRegister, sectionRegister, statementRegister, type RegisterRow } from './registers.js';

const challans = [
  { id: 'c1', label: 'BSR 0510308 / 418', depositDate: '2026-11-07', interestPaid: '0' },
  { id: 'c2', label: 'BSR 0510308 / 519', depositDate: '2026-12-20', interestPaid: '50' },
];

const row = (over: Partial<RegisterRow>): RegisterRow => ({
  id: 'r', form: '140', challanId: 'c1', pan: 'ABCPK1234L', name: 'Payee', sectionCode: '1027', paidOn: '2026-10-10',
  amountPaid: '100000', taxDeducted: '10000', taxDeposited: '10000', deductedOn: '2026-10-10', ratePercent: '10.0000', ...over,
});

const rows: RegisterRow[] = [
  row({ id: 'ok' }),
  // Credited 20 Sep, deducted 5 Oct: September and October, 2 months at 1% on 10,000.
  row({ id: 'lateDed', name: 'Late deducted', paidOn: '2026-09-20', deductedOn: '2026-10-05' }),
  // Deducted 10 Nov, due 7 Dec, paid 20 Dec on challan c2: November and December at 1.5% on 3,000.
  row({ id: 'lateDep', name: 'Late deposit', challanId: 'c2', amountPaid: '30000', taxDeducted: '3000', taxDeposited: '3000', paidOn: '2026-11-10', deductedOn: '2026-11-10' }),
  row({ id: 'short', name: 'Short deposit', taxDeducted: '5000', taxDeposited: '4000', amountPaid: '50000' }),
  row({ id: 'nopan', name: 'No PAN', pan: 'PANNOTAVBL', amountPaid: '20000', taxDeducted: '2000', taxDeposited: '2000' }),
  row({ id: 'nopanGoods', name: 'No PAN goods', pan: 'PANNOTAVBL', sectionCode: '1031', amountPaid: '100000', taxDeducted: '5000', taxDeposited: '5000' }),
  row({ id: 'declared', name: 'Declared', pan: 'AAAPZ1234C', sectionCode: '1020', amountPaid: '40000', taxDeducted: '0', taxDeposited: '0', deductedOn: null, reasonCode: 'B' }),
  row({ id: 'onFile', name: 'On file', pan: 'AAAPY1234D', sectionCode: '1020', amountPaid: '40000', taxDeducted: '0', taxDeposited: '0', deductedOn: null, reasonCode: 'B' }),
];

test('default analysis: late deduction, late deposit, not deposited, no-PAN rate, declarations', () => {
  const a = defaultAnalysis({ rows, challans, form121: [{ pan: 'AAAPY1234D', uin: null }] });
  assert.deepEqual(a.lateDeductions.map((x) => [x.rowId, x.months, x.interest]), [['lateDed', 2, '200.00']]);
  assert.deepEqual(a.lateDeposits.map((x) => [x.rowId, x.months, x.interest]), [['lateDep', 2, '90.00']]);
  assert.deepEqual(a.notDeposited.map((x) => [x.rowId, x.shortfall]), [['short', '1000.00']]);
  // 10% without a PAN on a 20% floor: 2,000 short. Goods at 5% is fine.
  assert.deepEqual(a.noPanLowRate.map((x) => [x.rowId, x.rate, x.floor, x.shortBy]), [['nopan', '10.00', '20', '2000.00']]);
  assert.deepEqual(a.declarationsMissing.map((x) => x.rowId), ['declared']);
  assert.deepEqual(a.totals, { lateDeductionInterest: '200.00', lateDepositInterest: '90.00', notDeposited: '1000.00', noPanShortfall: '2000.00', interestPaid: '50.00', interestDue: '240.00' });
});

test('salary rows are not judged against the 20% no-PAN floor', () => {
  const a = defaultAnalysis({ rows: [row({ form: '138', sectionCode: '1002', pan: 'PANNOTAVBL', amountPaid: '50000', taxDeducted: '1000', taxDeposited: '1000' })], challans });
  assert.equal(a.noPanLowRate.length, 0);
});

test('deposit register: each month, its due date and the challans that paid it', () => {
  const reg = depositRegister({ rows, challans });
  assert.deepEqual(reg.map((m) => [m.month, m.dueOn, m.deducted, m.deposited, m.lateInterest]), [
    // 10,000 + 10,000 + 5,000 + 2,000 + 5,000 deducted; the short row deposited 1,000 less.
    ['2026-10', '2026-11-07', '32000.00', '31000.00', '0.00'],
    ['2026-11', '2026-12-07', '3000.00', '3000.00', '90.00'],
  ]);
  assert.deepEqual(reg[1].payments.map((p) => [p.label, p.late]), [['BSR 0510308 / 519', true]]);
  // March deductions are due on 30 April.
  assert.equal(depositRegister({ rows: [row({ deductedOn: '2027-03-15', paidOn: '2027-03-15' })], challans })[0].dueOn, '2027-04-30');
});

test('section register in clause 34(a) shape', () => {
  const s = sectionRegister(rows);
  const c1020 = s.find((x) => x.sectionCode === '1020')!;
  assert.deepEqual([c1020.payments, c1020.fullRateAmount, c1020.lowerRateAmount, c1020.lowerRateTax], [2, '0.00', '80000.00', '0.00']);
  const c1027 = s.find((x) => x.sectionCode === '1027')!;
  assert.deepEqual([c1027.payments, c1027.amountPaid, c1027.fullRateTax, c1027.notDeposited], [5, '300000.00', '30000.00', '1000.00']);
});

test('statement register: on time, late, overdue, and imported history with no filing date', () => {
  const r = statementRegister(
    [
      { id: 'a', form: '140', quarter: 'Q1', dueDate: '2026-07-31', filedOn: '2026-07-30', status: 'FILED' },
      { id: 'b', form: '140', quarter: 'Q2', dueDate: '2026-10-31', filedOn: '2026-11-05', status: 'FILED' },
      { id: 'c', form: '140', quarter: 'Q3', dueDate: '2027-01-31', status: 'DRAFT' },
      { id: 'd', form: '26Q', quarter: 'Q4', dueDate: '2026-05-31', status: 'CLOSED' },
    ],
    '2027-02-10',
  );
  assert.deepEqual(r.map((x) => [x.id, x.state, x.daysLate]), [['d', 'FILED_DATE_UNKNOWN', 0], ['a', 'ON_TIME', 0], ['b', 'LATE', 5], ['c', 'OVERDUE', 10]]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsOrPart, tdsDepositDueDate, tdsInterest } from './interest.js';

test('monthsOrPart counts each calendar month touched', () => {
  assert.equal(monthsOrPart('2026-05-25', '2026-06-03'), 2);
  assert.equal(monthsOrPart('2026-05-10', '2026-05-28'), 1);
  assert.equal(monthsOrPart('2026-12-20', '2027-01-05'), 2);
  assert.equal(monthsOrPart('2026-05-10', '2026-05-10'), 0);
});

test('deposit due: 7th of next month, 30 April for March, January for December', () => {
  assert.equal(tdsDepositDueDate('2026-05-10'), '2026-06-07');
  assert.equal(tdsDepositDueDate('2027-03-15'), '2027-04-30');
  assert.equal(tdsDepositDueDate('2026-12-31'), '2027-01-07');
});

test('on time costs nothing', () => {
  const r = tdsInterest({ tax: 50000, deductibleOn: '2026-05-10', deductedOn: '2026-05-10', depositedOn: '2026-06-07' });
  assert.equal(r.total, '0.00');
});

test('late deposit: 1.5% a month from deduction to payment on a base rounded down to the hundred', () => {
  const r = tdsInterest({ tax: '12345.67', deductibleOn: '2026-05-10', deductedOn: '2026-05-10', depositedOn: '2026-06-20' });
  assert.equal(r.base, '12300.00');
  assert.equal(r.lateDepositMonths, 2);
  assert.equal(r.lateDepositInterest, '369.00');
  assert.equal(r.total, '369.00');
});

test('late deduction and late deposit add up', () => {
  const r = tdsInterest({ tax: 10000, deductibleOn: '2026-04-20', deductedOn: '2026-06-02', depositedOn: '2026-07-15' });
  assert.equal(r.lateDeductionMonths, 3); // Apr, May, Jun
  assert.equal(r.lateDeductionInterest, '300.00');
  assert.equal(r.lateDepositMonths, 2); // Jun, Jul (due 7 Jul, paid 15 Jul)
  assert.equal(r.lateDepositInterest, '300.00');
  assert.equal(r.total, '600.00');
});

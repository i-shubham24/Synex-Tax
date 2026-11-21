import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrComputation } from './computation.js';
import { salaryTds } from '../tds/salary.js';

test('salary only: the ITR computation agrees with the salary TDS engine in both regimes', () => {
  const r = itrComputation({ salary: { gross: 1800000, basicPlusDa: 900000, hraReceived: 360000, rentPaid: 300000 }, deductions: { section80C: 150000 } });
  const s = salaryTds({ grossSalary: 1800000, basicPlusDa: 900000, hraReceived: 360000, rentPaid: 300000, section80C: 150000 });
  assert.equal(r.NEW.totalTax, s.NEW.totalTax);
  assert.equal(r.OLD.totalTax, s.OLD.totalTax);
});

test('income of Rs 12 lakh from salary and interest pays nothing in the new regime', () => {
  const r = itrComputation({ salary: { gross: 1175000 }, otherSources: { depositInterest: 100000 } });
  // 11,75,000 - 75,000 + 1,00,000 = 12,00,000: rebate covers the slab tax of 60,000.
  assert.equal(r.NEW.totalIncome, '1200000.00');
  assert.equal(r.NEW.totalTax, '0.00');
});

test('equity gains: Rs 1.25 lakh exempt, 12.5% above it, 20% short term, no rebate against them', () => {
  const r = itrComputation({ salary: { gross: 900000 }, capitalGains: { equityLongTerm: 325000, equityShortTerm: 100000 } });
  // Normal income 8,25,000; total income with the gains is 12,50,000.
  assert.equal(r.NEW.totalIncome, '1250000.00');
  // Total income above 12 lakh: no rebate. Normal tax 22,500; LTCG 2,00,000 x 12.5% = 25,000; STCG 1,00,000 x 20% = 20,000.
  assert.equal(r.NEW.taxOnNormal, '22500.00');
  assert.equal(r.NEW.taxOnSpecial, '45000.00');
  assert.equal(r.NEW.rebate, '0.00');
  // (22,500 + 45,000) x 1.04 = 70,200.
  assert.equal(r.NEW.totalTax, '70200.00');
});

test('presumptive business, let-out property, old-regime deductions and the refund', () => {
  const r = itrComputation({
    ageBand: 'SENIOR',
    business: { digitalTurnover: 5000000, otherTurnover: 1000000 },
    house: { letOut: [{ rent: 240000, municipalTax: 20000, interest: 50000 }] },
    otherSources: { savingsInterest: 20000, depositInterest: 60000 },
    deductions: { section80C: 200000, healthInsurance: 50000 },
    taxesPaid: { tds: 20000, advanceTax: 30000 },
  });
  // Business 3,00,000 + 80,000 = 3,80,000; house (2,20,000 x 70%) - 50,000 = 1,04,000; other 80,000.
  assert.deepEqual([r.OLD.heads.business, r.OLD.heads.houseProperty, r.OLD.grossTotalIncome], ['380000.00', '104000.00', '564000.00']);
  // Old: 80C 1,50,000 + health 50,000 + senior interest 50,000 = 2,50,000; income 3,14,000.
  assert.equal(r.OLD.deductions, '250000.00');
  assert.equal(r.OLD.totalIncome, '314000.00');
  // Senior nil band 3 lakh: 14,000 x 5% = 700, rebated in full; 50,000 paid comes back.
  assert.equal(r.OLD.totalTax, '0.00');
  assert.equal(r.OLD.payable, '-50000.00');
  // The new regime also comes to nil (income under Rs 12 lakh); a tie keeps the default new regime.
  assert.equal(r.NEW.totalTax, '0.00');
  assert.equal(r.lower, 'NEW');
});

test('new regime refuses home-loan interest on a self-occupied home and keeps a house loss', () => {
  const r = itrComputation({ salary: { gross: 1500000 }, house: { selfOccupiedInterest: 200000 } });
  assert.equal(r.NEW.heads.houseProperty, '0.00');
  assert.match(r.NEW.notes.join(' '), /not allowed in the new regime/);
  assert.equal(r.OLD.heads.houseProperty, '-200000.00');
});

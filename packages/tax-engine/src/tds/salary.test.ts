import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hraExemption, salaryTds } from './salary.js';

test('new regime: Rs 12.75 lakh salary is tax free after the standard deduction and rebate', () => {
  const r = salaryTds({ grossSalary: 1275000, basicPlusDa: 600000 });
  assert.equal(r.NEW.taxableIncome, '1200000.00');
  assert.equal(r.NEW.slabTax, '60000.00');
  assert.equal(r.NEW.rebate, '60000.00');
  assert.equal(r.NEW.totalTax, '0.00');
});

test('new regime marginal relief just above Rs 12 lakh: tax limited to the excess, plus cess', () => {
  const r = salaryTds({ grossSalary: 1285000, basicPlusDa: 600000 }); // taxable 12.1 lakh
  assert.equal(r.NEW.taxableIncome, '1210000.00');
  assert.equal(r.NEW.slabTax, '61500.00');
  assert.equal(r.NEW.totalTax, '10400.00');
});

test('new regime above the relief band uses slabs fully', () => {
  const r = salaryTds({ grossSalary: 2075000, basicPlusDa: 1000000 }); // taxable 20 lakh
  // 4-8 at 5% = 20000, 8-12 at 10% = 40000, 12-16 at 15% = 60000, 16-20 at 20% = 80000 => 200000
  assert.equal(r.NEW.slabTax, '200000.00');
  assert.equal(r.NEW.rebate, '0.00');
  assert.equal(r.NEW.totalTax, '208000.00');
});

test('old regime with HRA, 80C and professional tax', () => {
  const r = salaryTds({
    grossSalary: 1200000, basicPlusDa: 600000, hraReceived: 240000, rentPaid: 300000, metroCity: true,
    professionalTax: 2500, section80C: 200000,
  });
  // HRA exempt = min(240000, 300000 - 60000, 300000) = 240000
  assert.equal(hraExemption({ hraReceived: 240000, rentPaid: 300000, basicPlusDa: 600000, metroCity: true }).toFixed(0), '240000');
  // taxable = 1200000 - 50000 - 240000 - 2500 - 150000 = 757500
  assert.equal(r.OLD.taxableIncome, '757500.00');
  // 2.5-5 at 5% = 12500; 5-7.575 at 20% = 51500 => 64000; cess 2560 => 66560
  assert.equal(r.OLD.totalTax, '66560.00');
  assert.equal(r.lower, 'NEW');
});

test('monthly TDS spreads what is left over the remaining months', () => {
  const r = salaryTds({ grossSalary: 2075000, basicPlusDa: 1000000, tdsAlreadyDeducted: 108000, monthsRemaining: 5 });
  assert.equal(r.NEW.monthlyTds, '20000.00');
});

test('surcharge with marginal relief just above Rs 50 lakh', () => {
  const r = salaryTds({ grossSalary: 5085000, basicPlusDa: 2000000 }); // taxable 50.1 lakh
  const s = Number(r.NEW.surcharge);
  // Without relief surcharge would be 10% of tax; relief caps the rise at the Rs 10,000 above 50 lakh.
  assert.ok(s > 0 && s <= 10000, `surcharge ${s}`);
});

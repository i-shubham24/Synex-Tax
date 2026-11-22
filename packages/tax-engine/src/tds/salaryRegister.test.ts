import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthPosition, salaryRegister } from './salaryRegister.js';
import { salaryTds } from './salary.js';

test('month position in the tax year', () => {
  assert.deepEqual(monthPosition(2026, '2026-04-15'), { elapsed: 1, left: 12 });
  assert.deepEqual(monthPosition(2026, '2026-11-21'), { elapsed: 8, left: 5 });
  assert.deepEqual(monthPosition(2026, '2027-03-10'), { elapsed: 12, left: 1 });
});

test('register: full-year employee matches the salary engine; a mid-year joiner is paid from joining; Form 124 claims count only when complete', () => {
  const reg = salaryRegister({
    taxYear: 2026,
    today: '2026-11-21',
    deducted: { e1: '40000' },
    employees: [
      { id: 'e1', pan: 'ABCPK1234L', name: 'Harpreet Kaur', regime: 'NEW', ageBand: 'BELOW_60', metroCity: false, monthlyGross: '150000', monthlyBasicDa: '75000', monthlyHra: '0', monthlyEmployerNps: '0', annualPerquisites: '0', professionalTax: '0' },
      {
        id: 'e2', pan: 'BQRPS4410K', name: 'Simran Singh', regime: 'OLD', ageBand: 'BELOW_60', metroCity: false, monthlyGross: '100000', monthlyBasicDa: '50000', monthlyHra: '20000', monthlyEmployerNps: '0', annualPerquisites: '0', professionalTax: '2500', joinedOn: '2026-07-01',
        previousEmployer: { salary: 250000, tds: 5000 },
        form124: { employeeName: 'Simran Singh', employeePan: 'BQRPS4410K', taxYear: 2026, regime: 'OLD', rent: { annual: 180000, landlordName: 'S. Singh', landlordAddress: 'Amritsar' }, chapterVIA: [{ section: '80C', amount: 150000, evidence: true }] },
      },
    ],
  });
  const expected = salaryTds({ grossSalary: '1800000.00', basicPlusDa: '900000.00', hraReceived: '0.00', employerNps: '0.00', perquisites: '0', professionalTax: '0', metroCity: false, ageBand: 'BELOW_60', tdsAlreadyDeducted: '40000', monthsRemaining: 5 });
  assert.deepEqual([reg[0].monthsWorked, reg[0].annualTax, reg[0].monthlyTds], [12, expected.NEW.totalTax, expected.NEW.monthlyTds]);
  // Joined in July: 9 months of salary, plus 2.5 lakh from the earlier employer.
  assert.equal(reg[1].monthsWorked, 9);
  assert.equal(reg[1].annualGross, '1150000.00');
  // Rent above Rs 1 lakh without the landlord's PAN is held back: an error in the Form 124 report.
  assert.ok(reg[1].form124.some((c) => c.level === 'error' && /landlord/.test(c.message)));
});

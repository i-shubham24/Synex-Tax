import { test } from 'node:test';
import assert from 'node:assert/strict';
import { form124Checks, form124ToSalaryInput, type Form124 } from './form124.js';

const decl: Form124 = {
  employeeName: 'Harpreet Kaur', employeePan: 'ABCPK1234L', taxYear: 2026, regime: 'OLD',
  rent: { annual: 180000, landlordName: 'S. Singh', landlordAddress: 'Ranjit Avenue, Amritsar', evidence: true },
  lta: { amount: 25000, evidence: true },
  homeLoan: { interest: 150000, lenderName: 'Punjab National Bank', lenderAddress: 'Hall Bazaar, Amritsar', lenderIsInstitution: true, evidence: true },
  chapterVIA: [{ section: '80C', amount: 150000, evidence: true }, { section: '80D', amount: 25000, evidence: false }],
};

test('Form 124: rent above Rs 1 lakh needs the landlord PAN; that claim is held back until given', () => {
  const checks = form124Checks(decl);
  assert.deepEqual(checks.filter((c) => c.level === 'error').map((c) => c.message), ['Rent above Rs 1 lakh a year needs the landlord’s PAN.']);
  assert.ok(checks.some((c) => c.claim === 'Deduction 80D' && c.level === 'warning'));
  const input = form124ToSalaryInput(decl);
  assert.deepEqual(input, { rentPaid: '0', ltaExempt: '25000.00', homeLoanInterest: '150000.00', section80C: '150000.00', otherDeductions: '25000.00' });
  const fixed = form124ToSalaryInput({ ...decl, rent: { ...decl.rent!, landlordPan: 'AAAPS1234Q' } });
  assert.equal(fixed.rentPaid, '180000.00');
});

test('Form 124 under the new regime: old-regime claims are flagged', () => {
  const checks = form124Checks({ ...decl, regime: 'NEW' });
  assert.ok(checks.some((c) => /not exempt under the new regime/.test(c.message)));
});

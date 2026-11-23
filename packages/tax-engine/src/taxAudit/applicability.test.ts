import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxAuditApplicability } from './applicability.js';

const CR = 1_00_00_000;
const L = 1_00_000;

test('44AB(a): Rs 8 crore with cash within 5% each way is under the Rs 10 crore limit; above 5% it is audited', () => {
  const low = taxAuditApplicability({ business: { turnover: 8 * CR, totalReceipts: 8.2 * CR, cashReceipts: 0.03 * 8.2 * CR, totalPayments: 7.5 * CR, cashPayments: 0.04 * 7.5 * CR } });
  assert.equal(low.required, false);
  assert.deepEqual(low.clauses, []);

  // Cash receipts of 7% of all receipts: the Rs 1 crore limit applies (first proviso not met).
  const high = taxAuditApplicability({ business: { turnover: 8 * CR, totalReceipts: 8 * CR, cashReceipts: 0.07 * 8 * CR }, auditedUnderOtherLaw: false });
  assert.equal(high.required, true);
  assert.deepEqual(high.clauses, ['44ABa']);
  assert.equal(high.form, '3CB');

  // Exactly 5% "does not exceed" five per cent.
  const edge = taxAuditApplicability({ business: { turnover: 5 * CR, totalReceipts: 100, cashReceipts: 5, totalPayments: 100, cashPayments: 5 } });
  assert.equal(edge.required, false);
});

test('44AB(a): above Rs 10 crore is audited under the proviso clause when cash is within 5%; a company files Form 3CA', () => {
  const r = taxAuditApplicability({ business: { turnover: 12 * CR, totalReceipts: 12 * CR, cashReceipts: 0, totalPayments: 11 * CR, cashPayments: 0 }, auditedUnderOtherLaw: true });
  assert.equal(r.required, true);
  assert.deepEqual(r.clauses, ['44ABAA']);
  assert.equal(r.form, '3CA');
});

test('44AB(a): between Rs 1 crore and Rs 10 crore without cash figures the answer waits for input', () => {
  const r = taxAuditApplicability({ business: { turnover: 3 * CR } });
  assert.equal(r.required, null);
  assert.deepEqual(r.missing.sort(), ['business.cashPayments', 'business.cashReceipts']);
});

test('44AD: Rs 2.5 crore with cash receipts of 4% and profits at 6% and 8% needs no audit; at 8% cash it falls to 44AB(a)', () => {
  // Deemed profit: 6% of 2,40,00,000 = 14,40,000; 8% of 10,00,000 = 80,000; total 15,20,000.
  const ok = taxAuditApplicability({ business: { turnover: 2.5 * CR, totalReceipts: 2.5 * CR, cashReceipts: 0.04 * 2.5 * CR, presumptive44AD: { declaredIncome: 15_20_000, digitalTurnover: 2.4 * CR } } });
  assert.equal(ok.required, false);
  assert.match(ok.findings[0].message, /15,20,000|1520000/);

  const below = taxAuditApplicability({ business: { turnover: 2.5 * CR, totalReceipts: 2.5 * CR, cashReceipts: 0.04 * 2.5 * CR, totalPayments: 2 * CR, cashPayments: 0, presumptive44AD: { declaredIncome: 15_19_999, digitalTurnover: 2.4 * CR } } });
  assert.equal(below.required, false, 'not under 44AD, but within the Rs 10 crore limit of 44AB(a)');

  // ITR-3 validation rule 135: 44AD turnover above Rs 2 crore with cash receipts above 5% needs an audit.
  const cash = taxAuditApplicability({ business: { turnover: 2.5 * CR, totalReceipts: 2.5 * CR, cashReceipts: 0.08 * 2.5 * CR, presumptive44AD: { declaredIncome: 30 * L, digitalTurnover: 2.3 * CR } } });
  assert.equal(cash.required, true);
  assert.deepEqual(cash.clauses, ['44ABa']);
});

test('44AD(4) and 44AB(e): audited only if income is above the exemption limit', () => {
  const r = taxAuditApplicability({ business: { turnover: 60 * L, section44AD4Applies: true }, incomeAboveExemption: true });
  assert.deepEqual(r.clauses, ['44ABe']);
  const n = taxAuditApplicability({ business: { turnover: 60 * L, section44AD4Applies: true } });
  assert.equal(n.required, null);
  assert.deepEqual(n.missing, ['incomeAboveExemption']);
});

test('Profession: 44ADA up to Rs 75 lakh with low cash; 44AB(b) above Rs 50 lakh otherwise; 44AB(d) below 50% income', () => {
  const ada = taxAuditApplicability({ profession: { grossReceipts: 70 * L, cashReceipts: 1 * L, presumptive44ADA: { declaredIncome: 36 * L } } });
  assert.equal(ada.required, false);

  // Cash receipts of 10%: 44ADA is limited to Rs 50 lakh (ITR-3 rule 134), so section 44AB(b) applies.
  const cash = taxAuditApplicability({ profession: { grossReceipts: 70 * L, cashReceipts: 7 * L, presumptive44ADA: { declaredIncome: 36 * L } } });
  assert.deepEqual(cash.clauses, ['44ABb']);

  const books = taxAuditApplicability({ profession: { grossReceipts: 55 * L } });
  assert.deepEqual(books.clauses, ['44ABb']);

  const low = taxAuditApplicability({ profession: { grossReceipts: 40 * L, cashReceipts: 0, presumptive44ADA: { declaredIncome: 15 * L } }, incomeAboveExemption: true });
  assert.deepEqual(low.clauses, ['44ABd']);
});

test('44AB(c): goods carriages claimed below the 44AE figure', () => {
  const r = taxAuditApplicability({ business: { turnover: 40 * L, lowerThanDeemed44AE: true } });
  assert.deepEqual(r.clauses, ['44ABci']);
});

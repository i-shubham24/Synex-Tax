import { test } from 'node:test';
import assert from 'node:assert/strict';
import { engineSummary, enteredSummary, itrChallans, itrInputFromValues, ITR_ASSESSMENT_YEARS } from './savedReturn.js';
import { itrComputation } from './computation.js';

test('five assessment years, 2022-23 to 2026-27', () => {
  assert.deepEqual([...ITR_ASSESSMENT_YEARS], ['2022-23', '2023-24', '2024-25', '2025-26', '2026-27']);
});

test('engine summary matches the computation on the page', () => {
  const values = { 'salary.gross': '2400000', 'otherSources.depositInterest': '50000', 'taxesPaid.tds': '300000', 'taxesPaid.advanceTax': '20000' };
  const s = engineSummary(values, 'NEW');
  const r = itrComputation(itrInputFromValues(values)).NEW;
  assert.equal(s.basis, 'ENGINE');
  assert.equal(s.totalIncome, Number(r.totalIncome));
  assert.equal(s.totalTax, Math.round(Number(r.totalTax)));
  assert.equal(s.tax + s.surcharge + s.cess, s.totalTax);
  assert.equal(s.tdsTcs, 300000);
  assert.equal(s.advanceTax, 20000);
  assert.equal(s.payable, Math.round(Number(r.payable)));
});

test('entered summary: payable is tax less credits, refund negative', () => {
  const s = enteredSummary({ totalIncome: 900000, totalTax: 40000, cess: 1538, tdsTcs: 50000 }, 'OLD');
  assert.equal(s.basis, 'ENTERED');
  assert.equal(s.payable, -10000);
  assert.equal(s.tax, 40000 - 1538);
});

test('self-assessment challan: major head 0021, minor 300, credits set against tax first', () => {
  const summary = enteredSummary({ totalIncome: 2000000, totalTax: 300000, surcharge: 0, cess: 11538, tdsTcs: 250000 }, 'NEW');
  const c = itrChallans({ assessmentYear: '2026-27', company: false, summary, payOn: '2026-07-20' });
  assert.ok(c.selfAssessment);
  assert.equal(c.selfAssessment!.majorHead, '0021');
  assert.equal(c.selfAssessment!.minorHead, '300');
  assert.equal(c.selfAssessment!.tax, 300000 - 11538 - 250000);
  assert.equal(c.selfAssessment!.cess, 11538);
  // 50,000 assessed after TDS, none paid in advance: 234B from April to July (4 months) on 50,000 = 2,000.
  assert.equal(c.interest.i234B, 2000);
  assert.ok(c.interest.i234C > 0);
  assert.equal(c.selfAssessment!.total, 50000 + c.interest.i234B + c.interest.i234C);
  assert.equal(c.nextAdvance, null);
});

test('company pays under 0020; refund means no challan', () => {
  const summary = enteredSummary({ totalIncome: 100000, totalTax: 10000, tdsTcs: 20000 }, 'NEW');
  const c = itrChallans({ assessmentYear: '2025-26', company: true, summary, payOn: '2025-08-01' });
  assert.equal(c.selfAssessment, null);
  const due = itrChallans({ assessmentYear: '2025-26', company: true, summary: { ...summary, tdsTcs: 0, taxesPaid: 0, payable: 10000 }, payOn: '2025-08-01', fee234F: 1000 });
  assert.equal(due.selfAssessment!.majorHead, '0020');
  assert.equal(due.selfAssessment!.fee, 1000);
});

test('advance tax instalment still open is offered under minor head 100', () => {
  const summary = enteredSummary({ totalIncome: 2000000, totalTax: 200000 }, 'NEW');
  const c = itrChallans({ assessmentYear: '2026-27', company: false, summary, payOn: '2025-09-01', payments: [{ date: '2025-06-10', amount: 30000, kind: 'ADVANCE' }] });
  assert.equal(c.nextAdvance!.minorHead, '100');
  assert.equal(c.nextAdvance!.dueDate, '2025-09-15');
  assert.equal(c.nextAdvance!.total, 200000 * 0.45 - 30000);
});

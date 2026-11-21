import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gstr3bYear } from './gstr3bYear.js';

test('3B year: output against GSTR-1, credit against 2B, filing state, differences carried over the year', () => {
  const r = gstr3bYear({
    fyStart: 2026, gstin: '03AAACG1234B1ZM', cadence: 'MONTHLY', today: '2026-11-21',
    months: [
      { period: '2026-04', gstr1Tax: 10000, gstr3bTax: 9000, itc2b: 5000, itc3b: 5000, cashPaid: 4000, status: 'FILED', filedOn: '2026-05-20' },
      { period: '2026-05', gstr1Tax: 8000, gstr3bTax: 9000, itc2b: 4000, itc3b: 4500, cashPaid: 4500, status: 'FILED', filedOn: '2026-06-25' },
      { period: '2026-10', gstr1Tax: 12000, status: 'DRAFT' },
    ],
  });
  assert.equal(r.months.length, 12);
  assert.deepEqual(r.months.slice(0, 2).map((m) => [m.period, m.outputDifference, m.itcDifference, m.state, m.daysLate]), [
    ['2026-04', '1000.00', '0.00', 'FILED', 0],
    ['2026-05', '-1000.00', '500.00', 'FILED_LATE', 5],
  ]);
  // October's 3B was due on 20 November and is still a draft.
  assert.deepEqual([r.months[6].period, r.months[6].state, r.months[6].daysLate], ['2026-10', 'OVERDUE', 1]);
  assert.equal(r.months[7].state, 'NOT_DUE');
  // June has nothing kept here: not called overdue, as it may have been filed elsewhere.
  assert.deepEqual([r.months[2].state, r.months[2].daysLate], ['NOT_RECORDED', 0]);
  // April's shortfall is made good in May; October's 12,000 is not in a 3B yet.
  assert.equal(r.netOutputShortfall, '12000.00');
  assert.equal(r.netExcessCredit, '500.00');
});

test('QRMP: one 3B a quarter, with the quarter’s GSTR-1 and 2B added up', () => {
  const r = gstr3bYear({
    fyStart: 2026, gstin: '03AAACG1234B1ZM', cadence: 'QRMP', today: '2026-11-21',
    months: [{ period: '2026-04', gstr1Tax: 1000 }, { period: '2026-05', gstr1Tax: 2000 }, { period: '2026-06', gstr1Tax: 3000, gstr3bTax: 6000, status: 'FILED', filedOn: '2026-07-24' }],
  });
  assert.equal(r.months.length, 4);
  assert.deepEqual([r.months[0].period, r.months[0].gstr1Tax, r.months[0].outputDifference, r.months[0].dueDate, r.months[0].state], ['2026-06', '6000.00', '0.00', '2026-07-24', 'FILED']);
});

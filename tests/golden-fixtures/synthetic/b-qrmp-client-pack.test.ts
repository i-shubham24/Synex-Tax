/**
 * Golden fixture (b): QRMP quarterly client with monthly PMT-06 deposits.
 * Findings referenced as F<n> are described in README.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { gstDueDate } from '../../../packages/tax-engine/src/compliance/calendar.ts';
import { GstItcSetOffEngine } from '../../../packages/tax-engine/src/gst/itc-set-off-engine.ts';
import { gstr3bYear } from '../../../packages/tax-engine/src/gst/gstr3bYear.ts';
import { validateGstin } from '../../../packages/tax-engine/src/validators/gstin.ts';
import { datasets, parseCsv, readJson, readText } from './fixture-support.ts';

const f2 = (d: Decimal) => d.toFixed(2);
const sum = (...v: Array<string | number>) => v.reduce((a: Decimal, x) => a.add(x), new Decimal(0));

for (const ds of datasets('b-qrmp-client-pack', 'b')) {
  const client = readJson(ds.dir, 'client.json');
  const { months, gstr3bQuarter } = readJson(ds.dir, 'months.json');
  const exp = readJson(ds.dir, 'expected-results.json');
  const [head, ...challanRows] = parseCsv(readText(ds.dir, 'pmt06-challans.csv'));
  const challans = challanRows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  const state = client.gstin.slice(0, 2);

  test(`${ds.label}: client GSTIN is valid and QRMP`, () => {
    assert.ok(validateGstin(client.gstin).isValid);
    assert.equal(client.cadence, 'QRMP');
  });

  test(`${ds.label}: IFF, GSTR-1 and GSTR-3B due dates`, () => {
    assert.equal(gstDueDate('IFF', '2025-10', 'QRMP', state), exp.dueDates['IFF 2025-10']);
    assert.equal(gstDueDate('IFF', '2025-11', 'QRMP', state), exp.dueDates['IFF 2025-11']);
    assert.equal(gstDueDate('GSTR1', '2025-12', 'QRMP', state), exp.dueDates['GSTR1 2025-12 (quarter)']);
    assert.equal(gstDueDate('GSTR3B', '2025-12', 'QRMP', state), exp.dueDates['GSTR3B 2025-12 (quarter, Punjab)']);
  });

  const cashFor = (liab: { igst: string; cgst: string; sgst: string }, itc: { igst: string; cgst: string; sgst: string }, taxable: string) => {
    const r = GstItcSetOffEngine.compute({
      liability: { outward: { ...liab, cess: 0 }, rcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 } },
      itcAvailable: { ...itc, cess: 0 },
      turnover: { domesticTaxable: taxable },
    });
    const o = r.cashPayable.outward;
    return { igst: f2(o.igst), cgst: f2(o.cgst), sgst: f2(o.sgst), total: f2(r.cashPayable.totalCashPayable) };
  };

  test(`${ds.label}: PMT-06 self-assessment amounts equal the set-off engine's cash for months 1 and 2`, () => {
    for (const m of months.slice(0, 2)) {
      const taxable = f2(sum(m.outward.intraTaxable, m.outward.interTaxable));
      const cash = cashFor(m.outward, m.itc2b, taxable);
      assert.deepEqual(cash, exp.pmt06SelfAssessment[m.period], m.period);
      const label = `${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[Number(m.period.slice(5, 7)) - 1]}-${m.period.slice(0, 4)}`;
      const ch = challans.find((c) => c['Tax Period'] === label);
      assert.ok(ch, `PMT-06 challan for ${m.period}`);
      assert.deepEqual({ igst: ch['IGST Tax'], cgst: ch['CGST Tax'], sgst: ch['SGST Tax'], total: ch['Total'] }, cash);
    }
  });

  test(`${ds.label}: quarter set-off cash, less PMT-06 by head, is what was paid with the return`, () => {
    const taxable = f2(sum(...months.map((m: any) => sum(m.outward.intraTaxable, m.outward.interTaxable).toString())));
    const cash = cashFor(gstr3bQuarter.liability, gstr3bQuarter.itcClaimed, taxable);
    assert.deepEqual(cash, exp.quarter.setOffCash);
    const paid = exp.quarter.pmt06PaidByHead;
    for (const h of ['igst', 'cgst', 'sgst'] as const) {
      assert.equal(f2(new Decimal(cash[h]).sub(paid[h])), gstr3bQuarter.cashPaidWithReturn[h], h);
    }
  });

  const year = gstr3bYear({
    fyStart: client.quarter.fyStart,
    gstin: client.gstin,
    cadence: 'QRMP',
    today: exp.today,
    months: months.map((m: any) => {
      const pmt = exp.pmt06SelfAssessment[m.period];
      const base = { period: m.period, gstr1Tax: f2(sum(m.outward.igst, m.outward.cgst, m.outward.sgst)), itc2b: f2(sum(m.itc2b.igst, m.itc2b.cgst, m.itc2b.sgst)), cashPaid: pmt?.total ?? null };
      if (m.period !== gstr3bQuarter.period) return base;
      const l = gstr3bQuarter.liability;
      const c = gstr3bQuarter.itcClaimed;
      return { ...base, gstr3bTax: f2(sum(l.igst, l.cgst, l.sgst)), itc3b: f2(sum(c.igst, c.cgst, c.sgst)), cashPaid: gstr3bQuarter.cashPaidWithReturn.total, status: gstr3bQuarter.status, filedOn: gstr3bQuarter.filedOn };
    }),
  });
  const qRow = year.months.find((m) => m.period === exp.quarter.gstr3bYearRow.period)!;

  test(`${ds.label}: gstr3bYear sums the quarter's GSTR-1 and 2B into the quarter-end row`, () => {
    assert.deepEqual(year.months.map((m) => m.period), ['2025-06', '2025-09', '2025-12', '2026-03']);
    const e = exp.quarter.gstr3bYearRow;
    assert.deepEqual(
      { period: qRow.period, dueDate: qRow.dueDate, gstr1Tax: qRow.gstr1Tax, gstr3bTax: qRow.gstr3bTax, outputDifference: qRow.outputDifference, itc2b: qRow.itc2b, itc3b: qRow.itc3b, itcDifference: qRow.itcDifference, state: qRow.state, daysLate: qRow.daysLate },
      { period: e.period, dueDate: e.dueDate, gstr1Tax: e.gstr1Tax, gstr3bTax: e.gstr3bTax, outputDifference: e.outputDifference, itc2b: e.itc2b, itc3b: e.itc3b, itcDifference: e.itcDifference, state: e.state, daysLate: e.daysLate },
    );
    for (const [p, st] of Object.entries(exp.quarter.otherQuarterStates)) assert.equal(year.months.find((m) => m.period === p)!.state, st, p);
  });

  if (!ds.synthetic) continue;

  test(`${ds.label}: F9 quarter cash paid includes the PMT-06 deposits`, () => {
    assert.equal(qRow.cashPaid, exp.quarter.gstr3bYearRow.cashPaidIncludingPmt06);
  });

  test(`${ds.label}: F10 PMT-06 due date is the 25th`, () => {
    assert.equal(gstDueDate('PMT06', '2025-10', 'QRMP', state), exp.dueDates['PMT06 2025-10']);
  });
}

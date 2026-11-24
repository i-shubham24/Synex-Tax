import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CII, financialYear, indexed, propertySale } from './capitalGainsProperty.js';
import { setOffBroughtForward } from './broughtForward.js';
import { amt, scheduleVda } from './otherSchedules.js';
import { specialRateTax } from '../specialRateTax.js';
import { interest234CInstalments } from '../itrCommon.js';
import { blockDepreciation } from '../itr3Json.js';

test('Cost Inflation Index: base 2001-02 = 100, 2025-26 = 376 (CBDT Notification 70/2025)', () => {
  assert.equal(CII['2001-02'], 100);
  assert.equal(CII['2025-26'], 376);
  assert.equal(financialYear('2010-05-10'), '2010-11');
  assert.equal(financialYear('2011-03-31'), '2010-11');
  assert.equal(financialYear('1995-06-01'), '2001-02');
  // 30,00,000 x 376 / 167 = 67,54,491.
  assert.equal(indexed(3000000, '2010-11'), 6754491);
});

test('Land or building: 50C, 54EC and the second proviso to 112(1)(a)', () => {
  const r = propertySale({
    asset: 'RESIDENTIAL_HOUSE', acquiredOn: '2010-05-10', soldOn: '2025-09-20', consideration: 9000000, stampValue: 9500000, cost: 3000000,
    improvements: [{ year: '2015-16', amount: 500000 }], expenses: 100000,
    claims: [{ section: '54EC', invested: 1000000, investedOn: '2026-01-15' }],
    address: 'Flat 4, Baner', stateCode: '19', pin: '411045', buyers: [{ name: 'R Shah', pan: 'ABCPS1234D', share: 100, amount: 9000000 }],
  }, true, 0);
  assert.deepEqual(r.issues, []);
  assert.equal(r.longTerm, true);
  // Stamp value 95,00,000 is within 110% of 90,00,000, so the consideration stands (50C third proviso).
  assert.equal(r.fullValue, 9000000);
  // Without indexation 90,00,000 - 30,00,000 - 5,00,000 - 1,00,000 = 54,00,000; less 54EC 10,00,000 = 44,00,000 (B1e).
  assert.equal(r.gain, 4400000);
  const row = r.row as any;
  // Indexed: 67,54,491 + 5,00,000 x 376 / 254 = 7,40,157 + 1,00,000 = 75,94,648; 1ca = 14,05,352; 1ea = 4,05,352.
  assert.equal(row.TotalDednForEiB, 7594648);
  assert.equal(row.BalanceForEiB, 1405352);
  assert.equal(row.LTCGonImmvblPrprtyBE, 405352);
  // A = 44,00,000 x 12.5% = 5,50,000; B = 4,05,352 x 20% = 81,070; excess ignored 4,68,930.
  assert.deepEqual([row.TaxSec1121aiiB, row.TaxSec1121a, row.ExcessAmtSec1121a], [550000, 81070, 468930]);
  assert.equal(r.excess, 468930);
  // Stamp value above 110% of the consideration replaces it.
  const s = propertySale({ asset: 'OTHER', acquiredOn: '2024-09-01', soldOn: '2025-08-01', consideration: 1000000, stampValue: 1200000, cost: 900000, address: 'Plot 2', stateCode: '19', pin: '411001', buyers: [{ name: 'A B', share: 100, amount: 1000000 }] }, true, 1);
  assert.equal(s.longTerm, false);
  assert.equal(s.gain, 300000);
});

test('Schedule VDA: a loss row is refused; gains add up', () => {
  const ok = scheduleVda([{ acquiredOn: '2024-01-10', transferredOn: '2026-02-15', cost: 100000, consideration: 180000 }]);
  assert.equal(ok.total, 80000);
  const loss = scheduleVda([{ acquiredOn: '2024-01-10', transferredOn: '2026-02-15', cost: 100000, consideration: 60000 }]);
  assert.ok(loss.issues.some((x) => /115BBH\(2\)\(b\)/.test(x.message)));
});

test('Brought forward: oldest year first, LTCL only against long-term gain, 8-year and 4-year limits', () => {
  const inc = { sal: 500000, hp: 0, bp: 400000, spec: 20000, st20: 100000, stApp: 0, ltO: 0, ltA: 300000, os: 50000 };
  const r = setOffBroughtForward(inc, [
    { ay: '2018-19', filedOn: '2018-07-31', filedInTime: true, ltcl: 150000, business: 100000 },
    { ay: '2023-24', filedOn: '2023-07-31', filedInTime: true, stcl: 50000, hp: 30000, speculation: 30000 },
  ], [{ ay: '2015-16', amount: 500000 }], 'ITR-3');
  assert.deepEqual(r.issues, []);
  assert.deepEqual([r.setOff.ltA, r.setOff.st20, r.setOff.bp, r.setOff.spec, r.setOff.hp], [150000, 50000, 100000, 20000, 0]);
  // Unabsorbed depreciation 5,00,000: business 3,00,000 left, then other sources 50,000, then capital gains (not salary).
  assert.equal(r.depSet.bp, 300000);
  assert.equal(r.depSet.os, 50000);
  assert.equal(r.left.sal, 500000);
  const old = setOffBroughtForward(inc, [{ ay: '2017-18', filedOn: '2017-07-31', filedInTime: true, stcl: 1000 }, { ay: '2021-22', filedOn: '2021-12-31', filedInTime: true, speculation: 5000 }], [], 'ITR-3');
  assert.ok(old.issues.some((x) => /8 assessment years/.test(x.message)));
  assert.ok(old.issues.some((x) => /73\(4\)/.test(x.message)));
});

test('234C(1)(a) instalment by instalment, with the 12% and 36% floors', () => {
  const pay = (date: string, amount: number) => ({ bsr: '0510308', date, serial: 1, amount, kind: 'ADVANCE' as const });
  // Tax due 1,00,000: 12,000 by 15 Jun and 36,000 by 15 Sep meet the floors; 60,000 by 15 Dec is short of 75,000: 15,000 x 3% = 450;
  // 90,000 by 15 Mar: 10,000 x 1% = 100.
  const r = interest234CInstalments(100000, [pay('2025-06-15', 12000), pay('2025-09-15', 24000), pay('2025-12-15', 24000), pay('2026-03-15', 30000)]);
  assert.deepEqual(r.map((x) => x.interest), [0, 0, 450, 100]);
});

test('Surcharge with marginal relief just above Rs 50 lakh (new regime)', () => {
  // Tax on 50,10,000: 20,000 + 40,000 + 60,000 + 80,000 + 1,00,000 + 26,10,000 x 30% = 10,83,000; surcharge 10% = 1,08,300.
  // At 50,00,000 the tax is 10,80,000 with no surcharge; ceiling 10,80,000 + 10,000: surcharge cut to 7,000.
  const t = specialRateTax({ regime: 'NEW', age: 'BELOW_60', totalIncome: 5010000, st111A: 0, lt112A: 0, lt112: 0 });
  assert.equal(t.taxNormal, 1083000);
  assert.equal(t.surchargeBeforeRelief, 108300);
  assert.equal(t.surcharge, 7000);
  assert.equal(t.liability, 1090000 + 43600);
  // Above Rs 2 crore with dividends the 15% cap on tax on dividends is refused.
  assert.ok(specialRateTax({ regime: 'OLD', age: 'BELOW_60', totalIncome: 25000000, st111A: 0, lt112A: 0, lt112: 0, dividends: 100000 }).refusal);
});

test('Agricultural income for rate purposes (partial integration, Part B-TTI 2a and 2c)', () => {
  // Old regime, normal income 6,00,000, agricultural 2,00,000: tax on 8,00,000 = 12,500 + 60,000 = 72,500; less tax on 4,50,000 = 10,000.
  const t = specialRateTax({ regime: 'OLD', age: 'BELOW_60', totalIncome: 600000, st111A: 0, lt112A: 0, lt112: 0, agri: 200000 });
  assert.equal(t.taxNormal, 72500);
  assert.equal(t.agriRebate, 10000);
  assert.equal(t.afterRebate, 62500);
});

test('AMT under 115JC and the 115JD credit', () => {
  // Total income 19,00,000 with 80QQB 3,00,000: adjusted 22,00,000 x 18.5% = 4,07,000 + cess 16,280 = 4,23,280; regular tax 4,00,000.
  const a = amt(1900000, 300000, 400000, [], true);
  assert.equal(a.deemed, 423280);
  assert.equal(a.currentCredit, 23280);
  // Adjusted income not above Rs 20 lakh: no AMT, and a credit of 40,000 brought forward is used against regular tax.
  const b = amt(1500000, 200000, 300000, [{ ay: '2020-21', gross: 50000, setOffEarlier: 10000 }], true);
  assert.equal(b.deemed, 0);
  assert.equal(b.utilised, 40000);
  assert.equal(amt(1500000, 200000, 300000, [{ ay: '2020-21', gross: 50000, setOffEarlier: 10000 }], false).utilised, 0);
});

test('Additional depreciation under 32(1)(iia) with the balance 10% of last year', () => {
  const d = blockDepreciation({ block: 'PM15', wdvOpening: 400000, additionsFull: 100000, additionsHalf: 80000, additional: { full: 100000, half: 80000, previousYearHalf: 50000 } });
  // Normal 75,000 + 6,000; additional 20,000 + 8,000 + 5,000 = 33,000.
  assert.equal(d.additional, 33000);
  assert.equal(d.total, 114000);
  assert.equal(d.wdvClosing, 580000 - 114000);
});

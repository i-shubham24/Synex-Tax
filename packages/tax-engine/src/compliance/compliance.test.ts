import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addYears,
  gstDueDate,
  gstReturnExpiry,
  lateFilingFee,
  regimeFor,
  tdsCorrectionDeadline,
  tdsStatementDueDate,
  taxYearStart,
} from './calendar.js';
import { dscExpiryRadar, isdRadar, pre14ImsGuard, tokenWatch } from './radar.js';

test('Dual-Act cutover routes 31 Mar 2026 to 1961 and 1 Apr 2026 to 2025', () => {
  assert.equal(regimeFor('2026-03-31'), 'IT_ACT_1961');
  assert.equal(regimeFor('2026-04-01'), 'IT_ACT_2025');
});

test('tax year boundaries', () => {
  assert.equal(taxYearStart('2026-03-31'), 2025);
  assert.equal(taxYearStart('2026-04-01'), 2026);
});

test('GST due dates: monthly, QRMP Punjab on the 24th, QRMP Gujarat on the 22nd', () => {
  assert.equal(gstDueDate('GSTR1', '2026-11', 'MONTHLY', '03'), '2026-12-11');
  assert.equal(gstDueDate('GSTR3B', '2026-11', 'MONTHLY', '03'), '2026-12-20');
  assert.equal(gstDueDate('GSTR3B', '2026-12', 'QRMP', '03'), '2027-01-24');
  assert.equal(gstDueDate('GSTR3B', '2026-12', 'QRMP', '24'), '2027-01-22');
  assert.equal(gstDueDate('GSTR1', '2026-12', 'QRMP', '03'), '2027-01-13');
  assert.equal(gstDueDate('IFF', '2026-10', 'QRMP', '03'), '2026-11-13');
});

test('3-year GST bar: FY 2022-23 GSTR-9 (due 31 Dec 2023) is barred after 31 Dec 2026', () => {
  const e = gstReturnExpiry('2023-12-31', '2026-11-19');
  assert.equal(e.barDate, '2026-12-31');
  assert.equal(e.daysLeft, 42);
  assert.equal(e.level, 'CRITICAL');
  assert.equal(gstReturnExpiry('2023-10-11', '2026-11-19').level, 'BARRED');
  assert.equal(addYears('2024-02-29', 3), '2027-02-28');
});

test('TDS statement due dates: legacy 27EQ on the 15th, everything else on the 31st', () => {
  assert.equal(tdsStatementDueDate('27EQ', 2025, 2), '2025-10-15');
  assert.equal(tdsStatementDueDate('143', 2026, 2), '2026-10-31');
  assert.equal(tdsStatementDueDate('140', 2026, 3), '2027-01-31');
  assert.equal(tdsStatementDueDate('26Q', 2025, 4), '2026-05-31');
});

test('2-year correction window anchors on the tax year in which the original was due', () => {
  assert.equal(tdsCorrectionDeadline('2026-05-31'), '2029-03-31'); // FY 2025-26 Q4
  assert.equal(tdsCorrectionDeadline('2024-07-31'), '2027-03-31'); // FY 2024-25 Q1
  assert.equal(tdsCorrectionDeadline('2025-05-31'), '2028-03-31'); // FY 2024-25 Q4
});

test('Sec 427 / 234E fee: Rs 200 per day, capped at the TDS amount', () => {
  assert.equal(lateFilingFee('2026-10-31', '2026-10-31', 50_000), 0);
  assert.equal(lateFilingFee('2026-10-31', '2026-11-10', 50_000), 2_000);
  assert.equal(lateFilingFee('2026-07-31', '2026-11-19', 4_500), 4_500);
});

test('DSC radar buckets and FIPS 140-2 renewal flag', () => {
  const r = dscExpiryRadar(
    [
      { id: 'a', holder: 'A', entityName: 'X', validTo: '2026-11-24', fips: 'FIPS_140_2' },
      { id: 'b', holder: 'B', entityName: 'Y', validTo: '2026-12-01', fips: 'FIPS_140_3' },
      { id: 'c', holder: 'C', entityName: 'Z', validTo: '2027-06-01', fips: 'FIPS_140_3' },
    ],
    '2026-11-19',
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].bucket, 7);
  assert.equal(r[0].needsNewToken, true);
  assert.equal(r[1].bucket, 15);
  assert.equal(r[1].needsNewToken, false);
});

test('token watch orders revoked first and catches tokens expiring within 24h', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  const w = tokenWatch(
    [
      { gstin: '1', entityName: 'A', state: 'ACTIVE', expiresAt: '2026-11-20T02:00:00Z' },
      { gstin: '2', entityName: 'B', state: 'REVOKED', expiresAt: null },
      { gstin: '3', entityName: 'C', state: 'ACTIVE', expiresAt: '2026-12-10T00:00:00Z' },
    ],
    now,
  );
  assert.deepEqual(w.map((x) => x.reason), ['REVOKED', 'EXPIRING']);
});

test('pre-14th IMS guard opens 48h before 2B generation and flags high-value or 17(5) records', () => {
  const records = [
    { id: '1', gstin: 'g', entityName: 'e', supplierName: 's', taxableValue: 30_000, section17_5: false, action: 'NONE' as const },
    { id: '2', gstin: 'g', entityName: 'e', supplierName: 's', taxableValue: 5_000, section17_5: true, action: 'NONE' as const },
    { id: '3', gstin: 'g', entityName: 'e', supplierName: 's', taxableValue: 90_000, section17_5: false, action: 'A' as const },
    { id: '4', gstin: 'g', entityName: 'e', supplierName: 's', taxableValue: 2_000, section17_5: false, action: 'NONE' as const },
  ];
  const g = pre14ImsGuard(records, '2026-10', Date.parse('2026-11-12T12:00:00+05:30'));
  assert.equal(g.cutoff, '2026-11-14');
  assert.equal(g.inWindow, true);
  assert.deepEqual(g.flagged.map((r) => r.id), ['1', '2']);
  assert.equal(pre14ImsGuard(records, '2026-10', Date.parse('2026-11-05T12:00:00+05:30')).inWindow, false);
});

test('ISD radar flags multi-state PANs without an ISD registration', () => {
  const res = isdRadar([
    { entityId: 'a', entityName: 'Multi', pan: 'P', gstins: [
      { gstin: '1', stateCode: '03', type: 'REGULAR', active: true },
      { gstin: '2', stateCode: '07', type: 'REGULAR', active: true },
    ] },
    { entityId: 'b', entityName: 'HasIsd', pan: 'Q', gstins: [
      { gstin: '3', stateCode: '03', type: 'REGULAR', active: true },
      { gstin: '4', stateCode: '07', type: 'REGULAR', active: true },
      { gstin: '5', stateCode: '03', type: 'ISD', active: true },
    ] },
    { entityId: 'c', entityName: 'Single', pan: 'R', gstins: [{ gstin: '6', stateCode: '03', type: 'REGULAR', active: true }] },
  ]);
  assert.deepEqual(res.map((e) => e.entityId), ['a']);
});

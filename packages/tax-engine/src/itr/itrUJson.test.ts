import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { itrUPeriod, writeItrU, type ItrUInput } from './itrUJson.js';
import type { Itr2Input } from './itr2Json.js';

/**
 * The AY 2026-27 schemas do not yet carry the updated-return parts, so Part A (139(8A)) and Part B-ATI are
 * checked against their definitions in the AY 2025-26 ITR-2 schema (V1.2, release of 01 Jan 2026), the
 * latest the Department has published. Only the assessment year pattern ("2025") is changed for the check.
 */
function partValidator(def: string) {
  const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'schemas', 'itr', 'ITR-2_2025_Main_V1.2.json'), 'utf-8'));
  const fix = (n: any): any => {
    if (Array.isArray(n)) return n.map(fix);
    if (n && typeof n === 'object') {
      for (const k of ['exclusiveMinimum', 'exclusiveMaximum'] as const) {
        if (typeof n[k] === 'boolean') {
          const bound = k === 'exclusiveMinimum' ? 'minimum' : 'maximum';
          if (n[k] && n[bound] !== undefined) { n[k] = n[bound]; delete n[bound]; } else delete n[k];
        }
      }
      for (const key of Object.keys(n)) n[key] = fix(n[key]);
    }
    return n;
  };
  const defs = fix(raw.definitions);
  defs.PartA_139_8A.properties.AssessmentYear.pattern = '2026';
  return new Ajv({ strict: false, allErrors: true }).compile({ definitions: defs, $ref: `#/definitions/${def}` });
}
const vA = partValidator('PartA_139_8A');
const vB = partValidator('PartB-ATI');

const itr2: Itr2Input = {
  softwareId: 'SW12345678', createdOn: '2026-07-25', intermediaryCity: 'Pune',
  person: {
    firstName: 'Meera', surname: 'Kulkarni', pan: 'ABCPK1234L', dob: '1975-09-10',
    address: { residenceNo: 'B-12', locality: 'Kothrud', city: 'Pune', stateCode: '19', pin: '411038' },
    mobile: '9822012345', email: 'meera@example.com', fatherName: 'Vasant Kulkarni', place: 'Pune',
  },
  filing: { section: 11, regime: 'NEW' },
  salary: { employers: [{ tan: 'PNEA12345B', name: 'Pune Tech Pvt Ltd', nature: 'OTH', address: { line: 'Hinjewadi Phase 1', city: 'Pune', stateCode: '19', pin: '411057' }, gross: 2400000, tds: 212000 }] },
  // The updated return adds deposit interest of Rs 3,00,000 left out of the original.
  otherSources: { savingsInterest: 15000, depositInterest: 360000 },
  taxPayments: [{ bsr: '0002390', date: '2025-12-12', serial: 11, amount: 100000, kind: 'ADVANCE' }],
  bank: { ifsc: 'SBIN0001234', name: 'State Bank of India', account: '30012345678', type: 'SB' },
};

const updated: ItrUInput = {
  base: { form: 'ITR2', input: itr2 },
  filedOn: '2027-05-10',
  eligible: true,
  reasons: ['2'],
  previous: { section: '139(1)', form: 'ITR2', ack: '123456789012345', filedOn: '2026-07-25', totalIncome: 2400000, heads: { salary: 2325000, otherSources: 75000 }, amountPayable: 0, refundClaimed: 0 },
};

test('ITR-U over ITR-2: Part A and Part B-ATI worked, valid against their published definitions, JSON withheld until the AY 2026-27 schema', () => {
  const out = writeItrU(updated);
  assert.equal(out.json, null);
  assert.deepEqual(out.issues.map((x) => x.field).filter((f) => f !== 'payments140B'), ['schema']);
  const a: any = (out.parts as any).PartA_139_8A;
  const b: any = (out.parts as any)['PartB-ATI'];
  assert.ok(vA(a), JSON.stringify(vA.errors));
  assert.ok(vB(b), JSON.stringify(vB.errors));
  const partA = a as Record<string, any>;
  const partB = b as Record<string, any>;
  assert.equal(partA.UpdatedReturnDuringPeriod, '1');
  assert.equal(partB.HeadOfInc.IncomeFromOS, 300000);
  // Item 9 = 3 + 6(i) - (5 + 8 + 4); item 10 = 25% of (9 - 7); 11 = 9 + 10.
  const l9 = partB.AmtPayable + partB.Refund - (partB.LastAmtPayable + partB.RegAssessementTAX + partB.AmtRefundable);
  assert.equal(partB.AggrLiabilityNoRefund, l9);
  assert.equal(partB.AddtnlIncTax, Math.round((l9 - partB.FeeIncUS234F) * 0.25));
  assert.equal(partB.NetPayable, l9 + partB.AddtnlIncTax);
  assert.equal(out.summary.taxDue, partB.NetPayable);
});

test('ITR-U: with 140B tax paid the only issue left is the schema release', () => {
  const first = writeItrU(updated);
  const due = first.summary.taxDue;
  const out = writeItrU({ ...updated, payments140B: [{ bsr: '0002390', date: '2027-05-09', serial: 5, amount: due }] });
  assert.deepEqual(out.issues.map((x) => x.field), ['schema']);
  const b: any = (out.parts as any)['PartB-ATI'];
  assert.equal(b.TaxDue10_11, 0);
  assert.equal(b.ScheduleIT1.Total, due);
  assert.ok(vB(b), JSON.stringify(vB.errors));
});

test('ITR-U: periods, the 139(4) window and refund increases are refused', () => {
  assert.deepEqual(itrUPeriod('2028-03-31'), { period: '1', rate: 0.25 });
  assert.deepEqual(itrUPeriod('2028-04-01'), { period: '2', rate: 0.5 });
  assert.deepEqual(itrUPeriod('2029-06-01'), { period: '3', rate: 0.6 });
  assert.deepEqual(itrUPeriod('2031-03-31'), { period: '4', rate: 0.7 });
  assert.equal(itrUPeriod('2031-04-01'), null);
  const early = writeItrU({ ...updated, filedOn: '2026-12-15' });
  assert.ok(early.issues.some((x) => /139\(4\)/.test(x.message)));
  const lower = writeItrU({ ...updated, previous: { ...updated.previous!, amountPayable: 5000000 } });
  assert.ok(lower.issues.some((x) => /lower liability/.test(x.message)));
});

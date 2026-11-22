import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { writeItr1, type Itr1Input } from './itr1Json.js';

// The Department's schema is draft-04: boolean exclusiveMinimum/Maximum are turned into the
// draft-06 form so Ajv 8 can read it. Nothing else is changed.
function loadSchema() {
  // src/itr or dist/itr: the package root is two levels up.
  const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'schemas', 'itr', 'ITR-1_2026_Main_V1.1.json'), 'utf-8'));
  delete raw.$schema;
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
  return fix(raw);
}
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(loadSchema());

const base: Itr1Input = {
  softwareId: 'SW12345678',
  createdOn: '2026-07-20',
  intermediaryCity: 'Ludhiana',
  person: {
    firstName: 'Asha', surname: 'Verma', pan: 'ABCPV1234K', dob: '1985-04-12', employerCategory: 'OTH',
    address: { residenceNo: '12', locality: 'Model Town', city: 'Ludhiana', stateCode: '26', pin: '141002' },
    mobile: '9876543210', email: 'asha@example.com', fatherName: 'R K Verma', place: 'Ludhiana',
  },
  filing: { section: 11, regime: 'NEW' },
  salary: { gross: 1500000, employers: [{ tan: 'DELA12345B', name: 'Acme Pvt Ltd', incomeChargeable: 1425000, tds: 95000 }] },
  otherSources: { savingsInterest: 8000, depositInterest: 20000 },
  tdsOther: [{ tan: 'DELB12345C', name: 'Bank', section: '94A', amount: 20000, tds: 2000 }],
  bank: { ifsc: 'HDFC0001234', name: 'HDFC Bank', account: '50100123456789', type: 'SB' },
};

test('ITR-1, new regime: valid against the Department schema, figures as computed', () => {
  const out = writeItr1(base);
  assert.deepEqual(out.issues, []);
  const ok = validate(out.json);
  assert.ok(ok, JSON.stringify(validate.errors?.slice(0, 5), null, 1));
  const r = (out.json as any).ITR.ITR1;
  // Salary 15,00,000 less 75,000 standard deduction; other sources 28,000.
  assert.equal(r.ITR1_IncomeDeductions.IncomeFromSal, 1425000);
  assert.equal(r.ITR1_IncomeDeductions.GrossTotIncome, 1453000);
  assert.equal(r.ITR1_IncomeDeductions.TotalIncome, 1453000);
  // New regime: 20,000 + 40,000 + 2,53,000 x 15% = 97,950; cess 3,918.
  assert.deepEqual([r.ITR1_TaxComputation.TotalTaxPayable, r.ITR1_TaxComputation.Rebate87A, r.ITR1_TaxComputation.EducationCess, r.ITR1_TaxComputation.GrossTaxLiability], [97950, 0, 3918, 101868]);
  assert.equal(r.TaxPaid.TaxesPaid.TDS, 97000);
  // Assessed tax 4,868 is under 10,000: no 234B. Filed on time: no 234A or fee.
  assert.equal(r.ITR1_TaxComputation.TotalIntrstPay, 0);
  assert.equal(r.TaxPaid.BalTaxPayable, 4868);
  assert.equal(r.FilingStatus.OptOutNewTaxRegime, 'N');
  // The validator does reject what the Department would: a wrong state code, a missing section.
  const bad = structuredClone(out.json) as any;
  bad.ITR.ITR1.PersonalInfo.Address.StateCode = '77';
  delete bad.ITR.ITR1.Verification;
  assert.equal(validate(bad), false);
  assert.ok((validate.errors ?? []).length >= 2);
});

test('ITR-1, old regime, belated, with house property and deductions: interest and fee', () => {
  const out = writeItr1({
    ...base,
    createdOn: '2026-11-21',
    filing: { section: 12, regime: 'OLD' },
    salary: { gross: 1500000, professionalTax: 2500, employers: [{ tan: 'DELA12345B', name: 'Acme Pvt Ltd', incomeChargeable: 1447500, tds: 150000 }] },
    house: { letOut: true, address: 'Flat 4, Sector 7', city: 'Ludhiana', stateCode: '26', pin: '141003', rent: 240000, municipalTax: 10000, interest: 50000 },
    deductions: { section80C: 200000, section80D: 25000 },
    tdsOther: [],
  });
  assert.deepEqual(out.issues, []);
  assert.ok(validate(out.json), JSON.stringify(validate.errors?.slice(0, 5), null, 1));
  const r = (out.json as any).ITR.ITR1;
  const inc = r.ITR1_IncomeDeductions;
  // Salary 15,00,000 - 50,000 - 2,500; house (2,40,000 - 10,000) x 70% - 50,000 = 1,11,000.
  assert.deepEqual([inc.IncomeFromSal, inc.TotalIncomeChargeableUnHP, inc.IncomeOthSrc], [1447500, 111000, 28000]);
  // 80C capped at 1,50,000, 80D 25,000, 80TTA 8,000.
  assert.deepEqual([inc.UsrDeductUndChapVIA.Section80C, inc.DeductUndChapVIA.Section80C, inc.DeductUndChapVIA.TotalChapVIADeductions], [200000, 150000, 183000]);
  assert.equal(inc.TotalIncome, 1403500);
  const t = r.ITR1_TaxComputation;
  // Old regime: 1,12,500 + 4,03,500 x 30% = 2,33,550; cess 9,342; liability 2,42,892; TDS 1,50,000.
  assert.equal(t.GrossTaxLiability, 242892);
  // Assessed 92,892 -> 92,800 at 1%: 234A Aug to Nov 4 months = 3,712; 234B Apr to Nov 8 months = 7,424. Fee 5,000.
  assert.deepEqual([t.IntrstPay.IntrstPayUs234A, t.IntrstPay.IntrstPayUs234B, t.IntrstPay.LateFilingFee234F], [3712, 7424, 5000]);
  assert.equal(r.FilingStatus.ReturnFileSec, 12);
  assert.equal(r.FilingStatus.OptOutNewTaxRegime, 'Y');
});

test('ITR-1: no JSON without a software ID, and outside its limits', () => {
  const noId = writeItr1({ ...base, softwareId: '' });
  assert.equal(noId.json, null);
  assert.match(noId.issues[0].message, /software ID/);
  const big = writeItr1({ ...base, ltcg112A: { saleValue: 500000, cost: 100000 } });
  assert.ok(big.issues.some((i) => /ITR-2/.test(i.message)));
  const firm = writeItr1({ ...base, person: { ...base.person, pan: 'ABCFV1234K' } });
  assert.ok(firm.issues.some((i) => /individuals/.test(i.message)));
});

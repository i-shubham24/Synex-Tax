import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrValidator } from './schemaValidator.js';
import { writeItr4, min44AE, type Itr4Input } from './itr4Json.js';

const validate = itrValidator('ITR-4_2026_Main_V1.1.json');
const check = (json: unknown) => assert.ok(validate(json), JSON.stringify(validate.errors?.slice(0, 6), null, 1));

const base: Itr4Input = {
  softwareId: 'SW12345678',
  createdOn: '2026-08-20',
  intermediaryCity: 'Ludhiana',
  person: {
    firstName: 'Harpreet', surname: 'Singh', pan: 'ABCPS1234K', dob: '1980-06-01',
    address: { residenceNo: '45', locality: 'Sarabha Nagar', city: 'Ludhiana', stateCode: '26', pin: '141001' },
    mobile: '9876543210', email: 'hs@example.com', fatherName: 'Gurdev Singh', place: 'Ludhiana',
  },
  filing: { section: 11, regime: 'NEW' },
  business: {
    ad: { code: '09028', name: 'Singh Hardware', digital: 4000000, cash: 500000, otherMode: 0 },
    financials: { capital: 800000, sundryCreditors: 200000, inventories: 600000, sundryDebtors: 250000, bank: 100000, cashInHand: 50000 },
  },
  otherSources: { savingsInterest: 12000, depositInterest: 40000 },
  bank: { ifsc: 'PUNB0123400', name: 'Punjab National Bank', account: '1234000100056789', type: 'SB' },
};

test('ITR-4, 44AD in the new regime: valid against the schema, 6% and 8% income, rebate', () => {
  const out = writeItr4(base);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR4;
  // 6% of 40,00,000 = 2,40,000; 8% of 5,00,000 = 40,000.
  assert.equal(r.ScheduleBP.PersumptiveInc44AD.TotPersumptiveInc44AD, 280000);
  assert.equal(r.IncomeDeductions.IncomeFromBusinessProf, 280000);
  // GTI 2,80,000 + 52,000 = 3,32,000: below the Rs 4 lakh nil slab.
  assert.equal(r.IncomeDeductions.TotalIncome, 332000);
  assert.equal(r.TaxComputation.GrossTaxLiability, 0);
  assert.equal(r.FilingStatus.ItrFilingDueDate, '2026-08-31');
  assert.equal(r.FilingStatus.F10IEACurrAYOldRegime, 'N');
  assert.equal(r.ScheduleBP.FinanclPartclrOfBusiness.TotCapLiabilities, 1000000);
});

test('ITR-4, 44ADA and 44AE with salary, old regime, belated: interest 234A, 234B and fee', () => {
  const out = writeItr4({
    ...base,
    createdOn: '2026-10-15',
    filing: { section: 12, regime: 'OLD', form10IEA: { assessmentYear: '2026-27', ack: '123456789012345', date: '2026-07-10' } },
    person: { ...base.person, employerCategory: 'OTH' },
    salary: { gross: 600000, professionalTax: 2500, employers: [{ tan: 'AMRA12345B', name: 'Acme', incomeChargeable: 547500, tds: 20000 }] },
    business: {
      ada: { code: '16001', name: 'Practice', digital: 3000000, cash: 0 },
      ae: { code: '08001', name: 'Transport', vehicles: [{ regNo: 'PB10AB1234', ownership: 'OWN', tonnage: 15, months: 12 }, { regNo: 'PB10AB9999', ownership: 'OWN', tonnage: 8, months: 6 }] },
      financials: { capital: 500000, cashInHand: 500000 },
    },
    house: { letOut: true, address: 'Shop 2, Mall Road', city: 'Ludhiana', stateCode: '26', pin: '141001', rent: 300000, municipalTax: 10000, loans: [{ from: 'B', lender: 'SBI', account: 'HL12345', sanctionedOn: '2019-05-01', amount: 2000000, outstanding: 1200000, interest: 100000 }] },
    deductions: { section80C: [{ amount: 150000, id: 'PPF-1234' }, { amount: 20000, id: 'LIC-998' }], section80D: { selfFamily: { premium: 30000, insurers: [{ name: 'Star Health', policy: 'P-1', amount: 30000 }] } } },
    taxPayments: [{ bsr: '0510308', date: '2026-03-10', serial: 12345, amount: 200000, kind: 'ADVANCE' }],
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR4;
  // 44AE: 1,000 x 15 x 12 = 1,80,000 and 7,500 x 6 = 45,000.
  assert.equal(min44AE({ tonnage: 15, months: 12 }), 180000);
  assert.equal(r.ScheduleBP.PersumptiveInc44AE.TotPersumInc44AE, 225000);
  // 44ADA 15,00,000 + 44AE 2,25,000.
  assert.equal(r.IncomeDeductions.IncomeFromBusinessProf, 1725000);
  // Salary 6,00,000 - 50,000 - 2,500; house (3,00,000 - 10,000) x 70% - 1,00,000 = 1,03,000; other 52,000.
  assert.equal(r.IncomeDeductions.IncomeFromSal, 547500);
  assert.equal(r.IncomeDeductions.TotalIncomeChargeableUnHP, 103000);
  const gti = 1725000 + 547500 + 103000 + 52000;
  assert.equal(r.IncomeDeductions.GrossTotIncome, gti);
  // 80C 1,50,000 (claimed 1,70,000), 80D 25,000, 80TTA 10,000.
  assert.equal(r.IncomeDeductions.UsrDeductUndChapVIA.Section80C, 170000);
  assert.equal(r.IncomeDeductions.DeductUndChapVIA.TotalChapVIADeductions, 185000);
  assert.equal(r.IncomeDeductions.TotalIncome, gti - 185000);
  // Old regime on 22,42,500: 1,12,500 + 12,42,500 x 30% = 4,85,250; cess 19,410.
  assert.equal(r.TaxComputation.TotalTaxPayable, 485250);
  assert.equal(r.TaxComputation.GrossTaxLiability, 504660);
  // Assessed 4,84,660; advance 2,00,000. 234A Sep and Oct on 2,84,600 = 5,692. 234B Apr to Oct, 7 months = 19,922.
  const ip = r.TaxComputation.IntrstPay;
  assert.deepEqual([ip.IntrstPayUs234A, ip.IntrstPayUs234B, ip.LateFilingFee234F], [5692, 19922, 5000]);
  // 44AE and salary income: 234C(1)(a) instalment by instalment on 4,84,660 with 2,00,000 paid on 10 Mar:
  // Jun 72,600 x 3% = 2,178; Sep 2,18,000 x 3% = 6,540; Dec 3,63,400 x 3% = 10,902; Mar 2,84,600 x 1% = 2,846.
  assert.equal(ip.IntrstPayUs234C, 22466);
  assert.equal(r.FilingStatus.F10IEACurrAYOldRegime, 'Y');
  assert.equal(r.Schedule80C.TotalAmt, 170000);
  assert.equal(r.ScheduleBP.GoodsDtlsUs44AE.length, 2);
});

test('ITR-4: 234C for 44AD-only income is 1% of the shortfall by 15 March', () => {
  const out = writeItr4({ ...base, business: { ...base.business, ad: { ...base.business.ad!, digital: 25000000, cash: 0 } }, otherSources: {} });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR4;
  // 6% of 2.5 crore = 15,00,000. New regime: 20,000 + 40,000 + 45,000 = 1,05,000; cess 4,200.
  assert.equal(r.TaxComputation.GrossTaxLiability, 109200);
  // No advance tax: 234C 1% of 1,09,200 = 1,092; 234B Apr to Aug, 5 months on 1,09,200 = 5,460.
  assert.equal(r.TaxComputation.IntrstPay.IntrstPayUs234C, 1092);
  assert.equal(r.TaxComputation.IntrstPay.IntrstPayUs234B, 5460);
});

test('ITR-4: limits and missing details are reported, no JSON written', () => {
  const big = writeItr4({ ...base, business: { ...base.business, ad: { ...base.business.ad!, digital: 25000000, cash: 6000000 } } });
  assert.equal(big.json, null);
  assert.ok(big.issues.some((i) => /44AD limit/.test(i.message)));
  const old = writeItr4({ ...base, filing: { section: 11, regime: 'OLD' } });
  assert.ok(old.issues.some((i) => /10-IEA/.test(i.message)));
  const noFin = writeItr4({ ...base, business: { ad: base.business.ad } });
  assert.ok(noFin.issues.some((i) => /rule 139/.test(i.message)));
  const noId = writeItr4({ ...base, softwareId: '' });
  assert.match(noId.issues[0].message, /software ID/);
});

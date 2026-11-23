import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrValidator } from './schemaValidator.js';
import { companyTax, matTax, writeItr6, type Itr6Input } from './itr6Json.js';

const validate = itrValidator('ITR-6_2026_Main_V1.0.json');
const check = (json: unknown) => assert.ok(validate(json), JSON.stringify(validate.errors?.slice(0, 8), null, 1));

const addr = { line: '5 FC Road', city: 'Pune', stateCode: '19', pin: '411004' };
const company: Itr6Input = {
  softwareId: 'SW12345678',
  createdOn: '2026-10-20',
  intermediaryCity: 'Pune',
  companyType: 'PRIVATE',
  unlisted: true,
  regime: { option: '115BAA', form10IC: { assessmentYear: '2021-22', ack: '987654321012345', date: '2021-11-20' } },
  entity: { name: 'Sahyadri Softworks Private Limited', pan: 'AAJCS1234K', formedOn: '2016-06-01', address: { residenceNo: 'Office 301', locality: 'Shivajinagar', city: 'Pune', stateCode: '19', pin: '411005' }, mobile: '9822012345', email: 'finance@example.com' },
  signatory: { name: 'Anil Deshpande', fatherName: 'Prakash Deshpande', pan: 'ABCPD1234E', capacity: 'DR', place: 'Pune' },
  keyPersons: [{ name: 'Anil Deshpande', designation: 'DIR', pan: 'ABCPD1234E', din: '01234567', address: addr }],
  filing: { section: 11 },
  natures: [{ code: '14001', tradeName: 'Software development' }],
  books: {
    trading: { salesServices: 18000000 },
    otherIncome: { interest: 200000 },
    expenses: { salaries: 10000000, rent: 1200000, professionalFees: 800000, other: [{ nature: 'Administrative expenses', amount: 1000000 }] },
    bookDepreciation: 500000,
    depreciation: [{ block: 'PM40', wdvOpening: 1000000, additionsFull: 200000 }],
    currentTax: 1200000,
    cashReceiptsWithin5Pct: true, cashPaymentsWithin5Pct: true,
  },
  balanceSheet: {
    shareCapital: 1000000, reserves: 6000000, longTermBorrowingsBank: 2000000, tradePayables: 1500000, incomeTaxProvision: 1200000,
    tangibleGross: 3000000, tangibleDepreciation: 1800000, tradeReceivables: 4000000, bankBalances: 6000000, cashInHand: 100000, shortTermLoansAdvances: 400000,
  },
  otherSources: { depositInterest: 200000 },
  tdsOther: [{ tan: 'PNEA12345B', name: 'HDFC Bank', section: '94A', amount: 200000, tds: 20000, head: 'OS' }],
  taxPayments: [
    { bsr: '0510308', date: '2025-06-13', serial: 11, amount: 180000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-09-12', serial: 12, amount: 360000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-12-12', serial: 13, amount: 360000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2026-03-13', serial: 14, amount: 300000, kind: 'ADVANCE' },
  ],
  bank: { ifsc: 'HDFC0001234', name: 'HDFC Bank', account: '50200012345678', type: 'CA' },
};

test('ITR-6, company under section 115BAA: valid against the schema', () => {
  const out = writeItr6(company);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR6;
  // Profit before tax 1,82,00,000 - 1,30,00,000 - 5,00,000 = 47,00,000; less interest 2,00,000 (other sources), + 5,00,000 book - 4,80,000 tax depreciation.
  assert.equal(r.PARTA_PL.DebitsToPL.DebitPlAcnt.PBT, 4700000);
  assert.equal(r.CorpScheduleBP.IncChrgUnHdProftGain, 4520000);
  assert.equal(r['PartB-TI'].TotalIncome, 4720000);
  // 22% = 10,38,400; surcharge 10% with no threshold = 1,03,840; cess 4% = 45,690.
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TaxPayableOnTI.TaxAtNormalRates, 1038400);
  assert.equal(t.TaxPayableOnTI.SurchargeOnTaxPayable, 103840);
  assert.equal(t.TaxPayableOnTI.GrossTaxLiability, 1187930);
  assert.equal(t.IntrstPay.IntrstPayUs234C, 0);
  assert.equal(r.PartA_GEN1.FilingStatus.Section115BA, '115BAA');
  assert.equal(r.ScheduleMAT, undefined);
  assert.equal(r.PartB_TTI.Refund.RefundDue, 1220000 - 1187930);
});

test('ITR-6, company at normal rates with MAT below the normal tax: Schedule MAT filled', () => {
  const out = writeItr6({ ...company, regime: { option: 'NORMAL', turnover2023_24UpTo400Cr: true, mat: {} } });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR6;
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  // 25% of 47,20,000 = 11,80,000 + cess 47,200. Book profit 35,00,000 + 12,00,000 = 47,00,000: MAT 7,05,000 + cess 28,200.
  assert.equal(t.TaxPayableOnTI.GrossTaxLiability, 1227200);
  assert.equal(r.ScheduleMAT.BookProfUs115JB, 4700000);
  assert.equal(t.TaxPayableOnDeemedTI.TotalTax, 733200);
  assert.equal(r.PartA_GEN1.FilingStatus.GrossReceipt, 'Y');
});

test('ITR-6: MAT above the normal tax and a missing Form 10-IC are refused', () => {
  const mat = writeItr6({ ...company, regime: { option: 'NORMAL', turnover2023_24UpTo400Cr: true, mat: { otherAdditions: 10000000 } } });
  assert.equal(mat.json, null);
  assert.ok(mat.issues.some((x) => /115JB/.test(x.message)));
  const baa = writeItr6({ ...company, regime: { option: '115BAA', form10IC: { assessmentYear: '', ack: '', date: '' } } });
  assert.ok(baa.issues.some((x) => /10-IC/.test(x.message)));
});

test('company tax helpers: surcharge with marginal relief just above Rs 1 crore at 25%', () => {
  const t = companyTax('NORMAL25', 10100000, { st111A: 0, lt112A: 0, lt112: 0 }, 10100000);
  // 25,25,000 + 7% = 1,76,750 before relief; cap 25,00,000 + 1,00,000, so surcharge 75,000.
  assert.equal(t.surcharge, 75000);
  assert.equal(matTax(1000000).total, Math.round(150000 * 1.04));
});

test('ITR-6 with a 112A gain and a let-out property: valid against the schema', () => {
  const out = writeItr6({
    ...company,
    books: { ...company.books, otherIncome: { interest: 200000, profitOnInvestments: 300000, rent: 600000 } },
    capitalGains: [{ kind: '112A', date: '2025-07-01', saleValue: 800000, cost: 500000, isin: 'INE002A01018', name: 'Reliance Industries' }],
    houses: [{ address: 'Unit 4, Baner', city: 'Pune', stateCode: '19', pin: '411045', rent: 600000, municipalTax: 20000 }],
    interest234C: 0,
    balanceSheet: { ...company.balanceSheet, reserves: 6900000, bankBalances: 6900000 },
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR6;
  // 112A: 3,00,000 less Rs 1.25 lakh at 12.5% = 21,875. House: (6,00,000 - 20,000) x 70% = 4,06,000.
  assert.equal(r.ScheduleSI.SplCodeRateTax[0].SplRateIncTax, 21875);
  assert.equal(r.ScheduleHP.TotalIncomeChargeableUnHP, 406000);
  assert.equal(r.ScheduleCG.AccruOrRecOfCG.LongTermUnder12_5Per.DateRange.Up16Of6To15Of9, 300000);
});

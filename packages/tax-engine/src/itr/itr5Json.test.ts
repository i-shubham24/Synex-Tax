import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrValidator } from './schemaValidator.js';
import { firmTax, writeItr5, type Itr5Input } from './itr5Json.js';
import { interest234C, surchargeWithRelief } from './itrEntity.js';

const validate = itrValidator('ITR-5_2026_Main_V1.1.json');
const check = (json: unknown) => assert.ok(validate(json), JSON.stringify(validate.errors?.slice(0, 8), null, 1));

const addr = { line: '12 MG Road', city: 'Pune', stateCode: '19', pin: '411001' };
export const firm: Itr5Input = {
  softwareId: 'SW12345678',
  createdOn: '2026-08-20',
  intermediaryCity: 'Pune',
  kind: 'FIRM',
  entity: { name: 'Kulkarni Traders', pan: 'AAKFK1234L', formedOn: '2015-04-01', address: { residenceNo: 'Shop 4', locality: 'Camp', city: 'Pune', stateCode: '19', pin: '411001' }, mobile: '9822012345', email: 'accounts@example.com' },
  signatory: { name: 'Meera Kulkarni', fatherName: 'Vasant Kulkarni', pan: 'ABCPK1234L', capacity: 'MP', place: 'Pune' },
  filing: { section: 11 },
  natures: [{ code: '09028', tradeName: 'Kulkarni Traders' }],
  partners: [
    { name: 'Meera Kulkarni', pan: 'ABCPK1234L', address: addr, share: 50, working: true, interest: 200000, rate: 12, remuneration: 400000 },
    { name: 'Ravi Kulkarni', pan: 'ABCPK5678M', address: addr, share: 50, working: true, interest: 150000, rate: 15, remuneration: 400000 },
  ],
  books: {
    trading: { salesGoods: 8000000, openingStock: 500000, purchases: 6000000, directExpenses: 200000, closingStock: 700000 },
    otherIncome: { rent: 240000, interest: 50000, profitOnInvestments: 100000 },
    expenses: { salaries: 400000, rent: 120000, telephone: 30000, other: [{ nature: 'Office expenses', amount: 100000 }] },
    interestOthers: 50000,
    bookDepreciation: 100000,
    depreciation: [{ block: 'PM15', wdvOpening: 600000, additionsFull: 100000 }],
    currentTax: 100000,
  },
  balanceSheet: {
    partnersCapital: 1250000, securedLoansBank: 500000,
    grossBlock: 1000000, accumulatedDepreciation: 300000, investmentsLongTerm: 200000,
    stock: 700000, debtors: 500000, bank: 300000, cashInHand: 50000, creditors: 600000, incomeTaxProvision: 100000,
  },
  houses: [{ address: 'Flat 7, Baner', city: 'Pune', stateCode: '19', pin: '411045', rent: 240000 }],
  capitalGains: [{ kind: '111A', date: '2025-11-10', saleValue: 300000, cost: 200000 }],
  otherSources: { depositInterest: 50000 },
  tdsOther: [{ tan: 'PNEA12345B', name: 'State Bank of India', section: '94A', amount: 50000, tds: 5000, head: 'OS' }],
  taxPayments: [
    { bsr: '0002390', date: '2025-06-14', serial: 1, amount: 25000, kind: 'ADVANCE' },
    { bsr: '0002390', date: '2025-09-12', serial: 2, amount: 40000, kind: 'ADVANCE' },
    { bsr: '0002390', date: '2025-12-12', serial: 3, amount: 40000, kind: 'ADVANCE' },
    { bsr: '0002390', date: '2026-03-12', serial: 4, amount: 40000, kind: 'ADVANCE' },
  ],
  interest234C: 0,
  bank: { ifsc: 'SBIN0001234', name: 'State Bank of India', account: '30012345678', type: 'CA' },
};

test('ITR-5, partnership firm with 40(b) limits, house property and a 111A gain: valid against the schema', () => {
  const out = writeItr5(firm);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR5;
  // Gross profit 80,00,000 + 7,00,000 - 5,00,000 - 60,00,000 - 2,00,000 = 20,00,000; other income 3,90,000.
  // Debits before interest 4,00,000 + 1,20,000 + 30,000 + 8,00,000 remuneration + 1,00,000 = 14,50,000; interest 4,00,000; depreciation 1,00,000.
  assert.equal(r.PARTA_PL.DebitsToPL.DebitPlAcnt.PBT, 440000);
  // BP: 4,40,000 less rent 2,40,000, interest 50,000 and profit on shares 1,00,000 = 50,000; + 1,00,000 book - 1,05,000 tax depreciation = 45,000.
  // 40(b): interest above 12% to the second partner 1,50,000 x 3/15 = 30,000; book profit 45,000 + 30,000 + 8,00,000 = 8,75,000;
  // limit max(3,00,000, 90% of 6,00,000) + 60% of 2,75,000 = 7,05,000; remuneration disallowed 95,000.
  assert.equal(r.CorpScheduleBP.BusinessIncOthThanSpec.AmtDebPLDisallowUs40, 125000);
  assert.equal(r.PARTA_OI.AmtDisallUs40.TotAmtDisallUs40, 125000);
  assert.equal(r.CorpScheduleBP.IncChrgUnHdProftGain, 170000);
  assert.equal(r.ScheduleHP.TotalIncomeChargeableUnHP, 168000);
  assert.equal(r['PartB-TI'].GrossTotalIncome, 170000 + 168000 + 100000 + 50000);
  // Tax: 3,88,000 x 30% = 1,16,400; 1,00,000 x 20% = 20,000; cess 4%.
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TaxPayableOnTI.TaxAtNormalRates, 116400);
  assert.equal(t.TaxPayableOnTI.TaxAtSpecialRates, 20000);
  assert.equal(t.TaxPayableOnTI.GrossTaxLiability, 136400 + 5456);
  assert.equal(r.ScheduleSI.SplCodeRateTax[0].SecCode, '1');
  assert.equal(r.PartA_GEN1.FilingStatus.ItrFilingDueDate, '2026-08-31');
  assert.equal(r.PartB_TTI.Refund.RefundDue, 150000 - 141856);
  assert.equal(out.summary.disallowed40b, 125000);
});

test('ITR-5, LLP above Rs 1 crore with a tax audit: surcharge with marginal relief, 31 Oct due date', () => {
  const big: Itr5Input = {
    ...firm,
    kind: 'LLP', llpin: 'AAB-1234',
    entity: { ...firm.entity, name: 'Kulkarni Exports LLP', pan: 'AAKFK9876Q' },
    signatory: { ...firm.signatory, capacity: 'DP' },
    partners: firm.partners.map((p) => ({ ...p, interest: 0, rate: 0, remuneration: 0 })),
    books: { ...firm.books, trading: { salesGoods: 150000000, openingStock: 500000, purchases: 140000000, closingStock: 700000 }, otherIncome: {}, expenses: {}, interestOthers: 0, bookDepreciation: 0, depreciation: [], currentTax: 0 },
    houses: [], capitalGains: [], otherSources: {}, tdsOther: [], taxPayments: [{ bsr: '0002390', date: '2026-03-12', serial: 9, amount: 3500000, kind: 'ADVANCE' }],
    interest234C: undefined,
    audit: { firmName: 'Joshi and Co', firmPan: 'AAFFJ1234K', reportDate: '2026-09-25', ack3CD: '123456789012345' },
    createdOn: '2026-10-15',
    balanceSheet: { partnersCapital: 11200000, stock: 700000, bank: 10500000 },
  };
  const out = writeItr5(big);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR5;
  // Profit 15,00,00,000 + 7,00,000 - 5,00,000 - 14,00,00,000 = 1,02,00,000. Tax 30,60,000; surcharge 12% = 3,67,200 before relief;
  // relief caps tax and surcharge at 30,00,000 + 2,00,000 = 32,00,000, so the surcharge is 1,40,000.
  const t = r.PartB_TTI.ComputationOfTaxLiability.TaxPayableOnTI;
  assert.equal(t.TaxAtNormalRates, 3060000);
  assert.equal(t.SurchargeOnTaxPayableBeforeMarginal, 367200);
  assert.equal(t.SurchargeOnTaxPayable, 140000);
  assert.equal(t.GrossTaxLiability, Math.round(3200000 * 1.04));
  assert.equal(r.PartA_GEN1.FilingStatus.ItrFilingDueDate, '2026-10-31');
  assert.equal(r.PartA_GEN2.LiableSec44ABflg, 'Y');
  // 234C: nothing paid by 15 Jun, 15 Sep or 15 Dec; 35,00,000 by 15 Mar against 33,28,000.
  const due = 3328000;
  const expected = Math.floor((due * 0.15) / 100) * 100 * 0.03 + Math.floor((due * 0.45) / 100) * 100 * 0.03 + Math.floor((due * 0.75) / 100) * 100 * 0.03;
  assert.equal(r.PartB_TTI.ComputationOfTaxLiability.IntrstPay.IntrstPayUs234C, Math.round(expected));
});

test('ITR-5: cases it does not write are reported', () => {
  const out = writeItr5({ ...firm, books: { ...firm.books, trading: { salesGoods: 15000000, purchases: 14000000 } }, partners: [firm.partners[0]] });
  assert.equal(out.json, null);
  assert.ok(out.issues.some((x) => /44AB/.test(x.message)));
  assert.ok(out.issues.some((x) => /two partners/.test(x.message)));
  assert.ok(out.issues.some((x) => /loss/.test(x.message)));
});

test('surcharge relief and 234C helpers', () => {
  assert.deepEqual(surchargeWithRelief(9000000, 2700000, [[10000000, 0.12]], () => 0), { surcharge: 0, beforeRelief: 0, relief: 0 });
  assert.equal(interest234C(9999, []), 0);
  // 12% paid by 15 Jun and 36% by 15 Sep: no interest on those instalments.
  assert.equal(interest234C(100000, [{ bsr: '0002390', date: '2025-06-15', serial: 1, amount: 12000, kind: 'ADVANCE' }, { bsr: '0002390', date: '2025-09-15', serial: 2, amount: 24000, kind: 'ADVANCE' }, { bsr: '0002390', date: '2025-12-15', serial: 3, amount: 39000, kind: 'ADVANCE' }, { bsr: '0002390', date: '2026-03-15', serial: 4, amount: 25000, kind: 'ADVANCE' }]), 0);
  assert.equal(firmTax(1000000, { st111A: 0, lt112A: 200000, lt112: 0 }, 1200000).special, Math.round(75000 * 0.125));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrValidator } from './schemaValidator.js';
import { blockDepreciation, writeItr3, type Itr3Input } from './itr3Json.js';

const validate = itrValidator('ITR-3_2026_Main_V1.1.json');
// Errors are listed once per field path (array indexes folded) so a failure shows every distinct problem.
const check = (json: unknown) => assert.ok(validate(json), [...new Set((validate.errors ?? []).map((e) => `${e.instancePath.replace(/\/\d+/g, '/n')} ${e.message} ${JSON.stringify(e.params)}`))].slice(0, 40).join('\n'));

const person = {
  firstName: 'Anita', surname: 'Rao', pan: 'ABCPR1234K', dob: '1984-02-14',
  address: { residenceNo: '12', locality: 'Indiranagar', city: 'Bengaluru', stateCode: '15', pin: '560038' },
  mobile: '9845012345', email: 'anita@example.com', fatherName: 'Suresh Rao', place: 'Bengaluru',
};
const bank = { ifsc: 'HDFC0001234', name: 'HDFC Bank', account: '50100012345678', type: 'SB' as const };

// Case 1: a software consultant under section 44ADA, new regime, no books.
const professional: Itr3Input = {
  softwareId: 'SW12345678', createdOn: '2026-07-25', intermediaryCity: 'Bengaluru', person, status: 'I', bank,
  filing: { section: 11, regime: 'NEW' },
  business: {
    natures: [{ code: '14001', tradeName: 'Anita Rao Consulting' }],
    ada: { code: '14001', name: 'Anita Rao Consulting', digital: 4000000, cash: 0 },
    noAccounts: { debtors: 300000, creditors: 50000, stock: 0, cash: 25000 },
  },
  otherSources: { savingsInterest: 20000 },
  tdsOther: [{ tan: 'BLRA12345B', name: 'Client Tech Pvt Ltd', section: '94J-B', amount: 1500000, tds: 150000, head: 'BP' }],
  taxPayments: [{ bsr: '0510308', date: '2026-03-10', serial: 21, amount: 63200, kind: 'ADVANCE' }],
};

test('ITR-3, profession under 44ADA in the new regime: valid against the schema', () => {
  const out = writeItr3(professional);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR3;
  // 44ADA(1): 50% of Rs 40,00,000 = Rs 20,00,000, at P&L item 62 and Schedule BP items 4a and 35(ii).
  assert.equal(r.PARTA_PL.PersumptiveInc44ADA.TotPersumptiveInc44ADA, 2000000);
  assert.equal(r.ITR3ScheduleBP.BusinessIncOthThanSpec.ProfBfrTaxPL, 2000000);
  assert.equal(r.ITR3ScheduleBP.BusinessIncOthThanSpec.PLUs44sChapXIIG, 2000000);
  assert.equal(r.ITR3ScheduleBP.BusinessIncOthThanSpec.DeemedProfitBusUs.Section44ADA, 2000000);
  assert.equal(r.ITR3ScheduleBP.IncChrgUnHdProftGain, 2000000);
  assert.equal(r.PARTA_BS.NoBooksOfAccBS.TotSundryDbtAmt, 300000);
  assert.equal(r.PartA_GEN2.AuditInfo.IncDclrdUs, 'Y');
  // GTI 20,00,000 + 20,000 = 20,20,000. New regime: 20,000 + 40,000 + 60,000 + 80,000 + 20,000 x 25% = 2,05,000; cess 8,200.
  assert.equal(r['PartB-TI'].TotalIncome, 2020000);
  assert.equal(r.PartB_TTI.ComputationOfTaxLiability.TaxPayableOnTI.TaxAtNormalRatesOnAggrInc, 205000);
  assert.equal(r.PartB_TTI.ComputationOfTaxLiability.NetTaxLiability, 213200);
  // TDS 1,50,000 and advance tax 63,200 by 15 March (234C(1)(b)): no interest, nothing payable.
  assert.equal(r.PartB_TTI.ComputationOfTaxLiability.IntrstPay.TotalIntrstPay, 0);
  assert.equal(r.PartB_TTI.TaxPaid.BalTaxPayable, 0);
  assert.equal(r.PartB_TTI.Refund.RefundDue, 0);
});

// Case 2: a HUF trader keeping regular books, new regime.
const trader: Itr3Input = {
  softwareId: 'SW12345678', createdOn: '2026-07-28', intermediaryCity: 'Mysuru', status: 'H', bank: { ...bank, type: 'CA' },
  person: { ...person, firstName: undefined, surname: 'Venkatesh Rao HUF', pan: 'AAAHV1234M', dob: '1995-05-20', fatherName: 'Krishna Rao' },
  karta: { name: 'Venkatesh Rao', pan: 'ABCPV1234Q' },
  filing: { section: 11, regime: 'NEW' },
  business: {
    natures: [{ code: '09028', tradeName: 'Rao Hardware' }],
    books: {
      kind: 'BUSINESS',
      trading: { salesGoods: 8000000, openingStock: 600000, purchases: 6200000, directExpenses: 300000, closingStock: 800000 },
      otherIncome: 50000,
      expenses: { salaries: 400000, rent: 180000, powerFuel: 60000, telephone: 20000, travel: 40000, advertisement: 30000, professionalFees: 25000, interest: 120000, other: [{ nature: 'Office expenses', amount: 45000 }] },
      bookDepreciation: 100000,
      depreciation: [
        { block: 'FURN10', wdvOpening: 200000 },
        { block: 'PM15', wdvOpening: 400000, additionsFull: 100000, additionsHalf: 80000 },
        { block: 'PM40', wdvOpening: 50000 },
      ],
      balanceSheet: {
        capital: 1100000, securedLoansBank: 1000000, unsecuredLoansOthers: 200000,
        grossBlock: 1500000, accumulatedDepreciation: 600000, stock: 800000, debtors: 700000, cashInHand: 50000, bank: 350000, loansAdvances: 100000, creditors: 600000,
      },
    },
  },
  otherSources: { savingsInterest: 12000, depositInterest: 40000 },
  taxPayments: [
    { bsr: '0510308', date: '2025-06-10', serial: 1, amount: 3000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-09-10', serial: 2, amount: 6000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-12-10', serial: 3, amount: 6000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2026-03-10', serial: 4, amount: 4000, kind: 'ADVANCE' },
  ],
  interest234C: 0,
};

test('ITR-3, HUF trader with regular books: trading account, P&L, balance sheet and depreciation', () => {
  const out = writeItr3(trader);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR3;
  // Trading: credits 80,00,000 + closing 8,00,000 = 88,00,000; gross profit 88,00,000 - 6,00,000 - 62,00,000 - 3,00,000 = 17,00,000.
  assert.equal(r.TradingAccount.GrossProfitFrmBusProf, 1700000);
  // P&L: 17,00,000 + 50,000 = 17,50,000; expenses before interest 8,00,000; PBIDTA 9,50,000; PBT 9,50,000 - 1,20,000 - 1,00,000 = 7,30,000.
  assert.equal(r.PARTA_PL.DebitsToPL.PBIDTA, 950000);
  assert.equal(r.PARTA_PL.DebitsToPL.PBT, 730000);
  // Depreciation under section 32: furniture 2,00,000 x 10% = 20,000; plant 5,00,000 x 15% = 75,000 and 80,000 x 7.5% = 6,000;
  // computers 50,000 x 40% = 20,000. Total 1,21,000.
  assert.equal(r.ScheduleDEP.SummaryFromDeprSch.TotalDepreciation, 121000);
  assert.equal(r.ScheduleDPM.PlantMachinery.Rate15.DepreciationDetail.WDVLastDay, 580000 - 81000);
  // Schedule BP: 7,30,000 + 1,00,000 (books) - 1,21,000 (Act) = 7,09,000.
  assert.equal(r.ITR3ScheduleBP.BusinessIncOthThanSpec.AdjustPLAfterDeprOthSpecInc, 709000);
  assert.equal(r.ITR3ScheduleBP.IncChrgUnHdProftGain, 709000);
  // Balance sheet: sources 11,00,000 + 10,00,000 + 2,00,000 = 23,00,000; application 9,00,000 + (19,00,000 + 1,00,000 - 6,00,000) = 23,00,000.
  assert.equal(r.PARTA_BS.FundSrc.TotFundSrc, 2300000);
  assert.equal(r.PARTA_BS.FundApply.TotFundApply, 2300000);
  // GTI 7,09,000 + 52,000 = 7,61,000. Tax 3,61,000 x 5% = 18,050; no 87A rebate for a HUF; cess 722.
  assert.equal(r['PartB-TI'].TotalIncome, 761000);
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TaxPayableOnTI.Rebate87A, 0);
  assert.equal(t.NetTaxLiability, 18772);
  // Advance tax 19,000 met every instalment: refund of 228.
  assert.equal(t.IntrstPay.TotalIntrstPay, 0);
  assert.equal(r.PartB_TTI.Refund.RefundDue, 228);
  assert.equal(r.PartA_GEN1.PersonalInfo.Status, 'H');
  assert.equal(r.Verification.Capacity, 'K');
  assert.equal(r.PartA_GEN2.AuditInfo.TotalSalesExcOneCr, 'Upto1CR');
});

// Case 3: salaried individual with a 44AD business and capital gains, old regime by Form 10-IEA.
const mixed: Itr3Input = {
  softwareId: 'SW12345678', createdOn: '2026-07-30', intermediaryCity: 'Bengaluru', person, status: 'I', bank,
  filing: { section: 11, regime: 'OLD', form10IEA: { assessmentYear: '2026-27', ack: '123456789012345', date: '2026-07-01' } },
  salary: { professionalTax: 2500, employers: [{ tan: 'BLRA54321C', name: 'Infra Systems Ltd', nature: 'OTH', address: { line: 'Whitefield', city: 'Bengaluru', stateCode: '15', pin: '560066' }, gross: 1200000, tds: 80000 }] },
  business: {
    natures: [{ code: '09028', tradeName: 'Rao Stores' }],
    ad: { code: '09028', name: 'Rao Stores', digital: 3000000, cash: 500000 },
    noAccounts: { debtors: 150000, creditors: 120000, stock: 400000, cash: 30000 },
  },
  capitalGains: [
    { kind: '111A', date: '2025-10-15', saleValue: 300000, cost: 240000 },
    { kind: '112A', date: '2026-01-20', saleValue: 400000, cost: 200000, isin: 'INE009A01021', name: 'Infosys' },
  ],
  otherSources: { depositInterest: 30000 },
  deductions: { section80C: [{ amount: 150000, id: 'PPF-77' }], section80D: { selfFamily: { premium: 20000, insurers: [{ name: 'Star Health', policy: 'SH-9', amount: 20000 }] } } },
  taxPayments: [
    { bsr: '0510308', date: '2025-06-14', serial: 1, amount: 20000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-09-14', serial: 2, amount: 40000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2025-12-14', serial: 3, amount: 40000, kind: 'ADVANCE' },
    { bsr: '0510308', date: '2026-03-14', serial: 4, amount: 30210, kind: 'ADVANCE' },
  ],
  interest234C: 0,
};

test('ITR-3, salary, 44AD and capital gains in the old regime', () => {
  const out = writeItr3(mixed);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR3;
  // Salary 12,00,000 - 50,000 - 2,500 = 11,47,500. 44AD: 6% of 30,00,000 + 8% of 5,00,000 = 2,20,000.
  assert.equal(r.ScheduleS.TotIncUnderHeadSalaries, 1147500);
  assert.equal(r.ITR3ScheduleBP.IncChrgUnHdProftGain, 220000);
  // GTI 11,47,500 + 2,20,000 + 60,000 (111A) + 2,00,000 (112A) + 30,000 = 16,57,500; VI-A 1,50,000 + 20,000.
  assert.equal(r['PartB-TI'].GrossTotalIncome, 1657500);
  assert.equal(r['PartB-TI'].TotalIncome, 1487500);
  // Normal income 12,27,500: 12,500 + 1,00,000 + 2,27,500 x 30% = 1,80,750. Special: 60,000 x 20% = 12,000; (2,00,000 - 1,25,000) x 12.5% = 9,375.
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TaxPayableOnTI.TaxAtNormalRatesOnAggrInc, 180750);
  assert.equal(t.TaxPayableOnTI.TaxAtSpecialRates, 21375);
  // 2,02,125 + 4% cess 8,085 = 2,10,210; TDS 80,000 and advance tax 1,30,210 settle it.
  assert.equal(t.NetTaxLiability, 210210);
  assert.equal(r.PartB_TTI.TaxPaid.BalTaxPayable, 0);
  assert.equal(r.PartA_GEN1.FilingStatus.F10IEACurrAYOldRegime, 'Y');
});

test('ITR-3, old regime house property loss set off against salary and business', () => {
  const out = writeItr3({
    ...mixed,
    capitalGains: undefined,
    houses: [
      { letOut: true, address: 'Flat 3, Jayanagar', city: 'Bengaluru', stateCode: '15', pin: '560041', rent: 120000 },
      { letOut: false, address: '12, Indiranagar', city: 'Bengaluru', stateCode: '15', pin: '560038', loans: [{ from: 'B', lender: 'SBI', account: 'HL4455', sanctionedOn: '2019-04-01', amount: 4000000, outstanding: 3000000, interest: 250000 }] },
    ],
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR3;
  // Let out: 1,20,000 less 30% = 84,000. Self-occupied: interest capped at 2,00,000 (24(b)). Head: -1,16,000, all set off against salary (71(3A)).
  assert.equal(r.ScheduleHP.TotalIncomeChargeableUnHP, -116000);
  assert.equal(r.ScheduleCYLA.Salary.IncCYLA.HPlossCurYrSetoff, 116000);
  // GTI 11,47,500 - 1,16,000 + 2,20,000 + 30,000 = 12,81,500.
  assert.equal(r['PartB-TI'].GrossTotalIncome, 1281500);
});

test('ITR-3, 44ADA with goods carriages under 44AE', () => {
  const out = writeItr3({
    ...professional,
    business: {
      natures: [{ code: '16019_1', tradeName: 'Rao Associates' }, { code: '11008', tradeName: 'Rao Transport' }],
      ada: { code: '16019_1', name: 'Rao Associates', digital: 3000000, cash: 0 },
      ae: { code: '11008', name: 'Rao Transport', vehicles: [{ regNo: 'KA01AB1234', ownership: 'OWN', tonnage: 16, months: 12 }, { regNo: 'KA01AB9999', ownership: 'OWN', tonnage: 8, months: 6 }] },
      noAccounts: { debtors: 200000, creditors: 0, stock: 0, cash: 20000 },
    },
    tdsOther: undefined, taxPayments: undefined,
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR3;
  // 44ADA 50% of 30,00,000 = 15,00,000. 44AE(2): 16 t x Rs 1,000 x 12 months = 1,92,000; 8 t at Rs 7,500 x 6 months = 45,000.
  assert.equal(r.PARTA_PL.TotalPrsumptvIncUs44E, 237000);
  assert.equal(r.ITR3ScheduleBP.IncChrgUnHdProftGain, 1737000);
});

test('ITR-3: audit cases, a partner share and an unbalanced balance sheet are refused', () => {
  const big = writeItr3({ ...mixed, business: { ...mixed.business, ad: { code: '09028', name: 'Rao Stores', digital: 32000000, cash: 0 } } });
  assert.equal(big.json, null);
  assert.ok(big.issues.some((x) => /tax audit forms/.test(x.message) && /rule 138/.test(x.message)));
  const books = trader.business.books!;
  const crore = writeItr3({ ...trader, business: { ...trader.business, books: { ...books, trading: { ...books.trading, salesGoods: 15000000 } } } });
  assert.ok(crore.issues.some((x) => /44AB\(a\)/.test(x.message)));
  const firm = writeItr3({ ...professional, flags: { partnerInFirm: true } });
  assert.ok(firm.issues.some((x) => /Schedule IF/.test(x.message)));
  const unbalanced = writeItr3({ ...trader, business: { ...trader.business, books: { ...books, balanceSheet: { ...books.balanceSheet, capital: 1000000 } } } });
  assert.ok(unbalanced.issues.some((x) => /does not balance/.test(x.message)));
});

test('blockDepreciation: half rate on additions used under 180 days', () => {
  const d = blockDepreciation({ block: 'PM15', wdvOpening: 100000, additionsHalf: 40000 });
  // 1,00,000 x 15% = 15,000; 40,000 x 7.5% = 3,000; closing 1,40,000 - 18,000.
  assert.deepEqual([d.atFull, d.atHalf, d.wdvClosing], [15000, 3000, 122000]);
});

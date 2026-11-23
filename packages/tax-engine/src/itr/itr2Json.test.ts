import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itrValidator } from './schemaValidator.js';
import { writeItr2, type Itr2Input } from './itr2Json.js';

const validate = itrValidator('ITR-2_2026_Main_V1.2.json');
const check = (json: unknown) => assert.ok(validate(json), JSON.stringify(validate.errors?.slice(0, 8), null, 1));

const base: Itr2Input = {
  softwareId: 'SW12345678',
  createdOn: '2026-07-25',
  intermediaryCity: 'Pune',
  person: {
    firstName: 'Meera', surname: 'Kulkarni', pan: 'ABCPK1234L', dob: '1975-09-10',
    address: { residenceNo: 'B-12', locality: 'Kothrud', city: 'Pune', stateCode: '19', pin: '411038' },
    mobile: '9822012345', email: 'meera@example.com', fatherName: 'Vasant Kulkarni', place: 'Pune',
  },
  filing: { section: 11, regime: 'NEW' },
  salary: { employers: [{ tan: 'PNEA12345B', name: 'Pune Tech Pvt Ltd', nature: 'OTH', address: { line: 'Hinjewadi Phase 1', city: 'Pune', stateCode: '19', pin: '411057' }, gross: 2400000, tds: 330000 }] },
  houses: [
    { letOut: true, address: 'Flat 7, Baner', city: 'Pune', stateCode: '19', pin: '411045', rent: 360000, municipalTax: 12000 },
    { letOut: false, address: 'B-12, Kothrud', city: 'Pune', stateCode: '19', pin: '411038' },
  ],
  capitalGains: [
    { kind: '111A', date: '2025-08-12', saleValue: 500000, cost: 400000 },
    { kind: '112A', date: '2025-11-03', saleValue: 900000, cost: 300000, isin: 'INE002A01018', name: 'Reliance Industries', acquiredBefore1Feb2018: true, fmv31Jan2018: 500000 },
    { kind: '112A', date: '2026-02-20', saleValue: 300000, cost: 200000, isin: 'INE009A01021', name: 'Infosys' },
    { kind: 'STCG', date: '2025-12-01', saleValue: 200000, cost: 250000, expenses: 2000 },
    { kind: 'LTCG', date: '2026-01-15', saleValue: 600000, cost: 450000, expenses: 10000 },
  ],
  otherSources: { savingsInterest: 15000, depositInterest: 60000, dividends: 25000 },
  taxPayments: [{ bsr: '0002390', date: '2025-12-12', serial: 11, amount: 100000, kind: 'ADVANCE' }, { bsr: '0002390', date: '2026-03-12', serial: 12, amount: 50000, kind: 'ADVANCE' }],
  bank: { ifsc: 'SBIN0001234', name: 'State Bank of India', account: '30012345678', type: 'SB' },
};

test('ITR-2, new regime with house property and capital gains: valid against the schema', () => {
  const out = writeItr2(base);
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR2;
  // Salary 24,00,000 - 75,000. House: (3,60,000 - 12,000) x 70% = 2,43,600; self-occupied nil.
  assert.equal(r.ScheduleS.TotIncUnderHeadSalaries, 2325000);
  assert.equal(r.ScheduleHP.TotalIncomeChargeableUnHP, 243600);
  // 111A gain 1,00,000; STCG other loss 52,000 set against it: 48,000 at 20%.
  // 112A: Reliance cost max(3,00,000, min(5,00,000, 9,00,000)) = 5,00,000, gain 4,00,000; Infosys 1,00,000. 112: 1,40,000.
  assert.equal(r['PartB-TI'].CapGain.ShortTerm.ShortTerm20Per, 48000);
  assert.equal(r['PartB-TI'].CapGain.LongTerm.LongTerm12_5Per, 640000);
  assert.equal(r.ScheduleCGFor23.CurrYrLosses.InStcg20Per.StclSetoffAppRate, 52000);
  const gti = 2325000 + 243600 + 48000 + 640000 + 100000;
  assert.equal(r['PartB-TI'].GrossTotalIncome, gti);
  assert.equal(r['PartB-TI'].TotalIncome, 3356600);
  // Normal 26,68,600: 4,00,000 x 0 + 20,000 + 40,000 + 60,000 + 80,000 + 1,00,000 + 2,68,600 x 30% = 3,80,580.
  // Special: 48,000 x 20% = 9,600; (5,00,000 - 1,25,000) x 12.5% = 46,875; 1,40,000 x 12.5% = 17,500.
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TaxPayableOnTI.TaxAtNormalRatesOnAggrInc, 380580);
  assert.equal(t.TaxPayableOnTI.TaxAtSpecialRates, 73975);
  assert.equal(t.GrossTaxLiability, Math.round(454555 * 1.04));
  assert.equal(r.ScheduleSI.TotSplRateIncTax, 73975);
  assert.equal(r.ScheduleCGFor23.AccruOrRecOfCG.ShortTermUnder20Per.DateRange.Upto15Of9, 48000);
  // Liability 4,72,737 less TDS 3,30,000 = 1,42,737; advance tax 1,50,000 covers it: no 234A or 234B, and a refund.
  assert.equal(t.IntrstPay.IntrstPayUs234A + t.IntrstPay.IntrstPayUs234B, 0);
  // 234C(1)(a), instalment by instalment, gains taken from the quarter they arose (second proviso):
  // 15 Jun: tax on income other than gains 3,95,803 less TDS = 65,803; 15% = 9,870, nothing paid, 9,800 x 1% x 3 = 294.
  // 15 Sep: with the 111A gain of Aug, 4,05,787 less TDS = 75,787; 45% = 34,104, 34,100 x 1% x 3 = 1,023.
  // 15 Dec and 15 Mar: advance tax of 1,00,000 and 1,50,000 covers 75% and 100%.
  assert.equal(t.IntrstPay.IntrstPayUs234C, 1317);
  assert.equal(r.PartB_TTI.Refund.RefundDue, 480000 - 472737 - 1317);
});

test('ITR-2, old regime: house loss set off up to Rs 2 lakh, the rest and a capital loss carried forward', () => {
  const out = writeItr2({
    ...base,
    filing: { section: 11, regime: 'OLD' },
    salary: { professionalTax: 2500, employers: base.salary!.employers },
    houses: [{ letOut: false, address: 'B-12, Kothrud', city: 'Pune', stateCode: '19', pin: '411038', loans: [{ from: 'B', lender: 'HDFC Bank', account: 'HL998877', sanctionedOn: '2020-02-01', amount: 6000000, outstanding: 4500000, interest: 350000 }] }],
    capitalGains: [{ kind: 'LTCG', date: '2026-01-15', saleValue: 300000, cost: 450000 }, { kind: '111A', date: '2025-05-10', saleValue: 100000, cost: 160000 }],
    deductions: { section80C: [{ amount: 150000, id: 'PPF-11' }], section80D: { selfFamily: { premium: 20000, insurers: [{ name: 'HDFC Ergo', policy: 'H-1', amount: 20000 }] } } },
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR2;
  // Self-occupied interest capped at 2,00,000; the loss of 2,00,000 is set off against salary in full.
  assert.equal(r.ScheduleHP.TotalIncomeChargeableUnHP, -200000);
  assert.equal(r.ScheduleCYLA.TotalLossSetOff.TotHPlossCurYrSetoff, 200000);
  // Long-term loss 1,50,000 and short-term loss 60,000 are carried forward (nothing to set them against).
  assert.deepEqual(r.ScheduleCFL.CurrentAYloss.LossSummaryDetail, { TotalHPPTILossCF: 0, TotalSTCGPTILossCF: 60000, TotalLTCGPTILossCF: 150000 });
  // Salary 24,00,000 - 50,000 - 2,500 - 2,00,000 + other sources 1,00,000 = 22,47,500; VI-A 1,50,000 + 20,000 + 10,000.
  assert.equal(r['PartB-TI'].GrossTotalIncome, 2247500);
  assert.equal(r['PartB-TI'].TotalIncome, 2067500);
  assert.equal(r.PartA_GEN1.FilingStatus.OptOutNewTaxRegime, 'Y');
});

test('ITR-2: cases it does not write are reported', () => {
  const out = writeItr2({ ...base, flags: { landOrBuildingSold: true }, capitalGains: [{ kind: '112A', date: '2025-06-01', saleValue: 10, cost: 5 }] });
  assert.equal(out.json, null);
  assert.ok(out.issues.some((x) => /land or building/.test(x.message)));
  assert.ok(out.issues.some((x) => /ISIN/.test(x.message)));
});

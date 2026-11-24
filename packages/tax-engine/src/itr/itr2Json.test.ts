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

test('ITR-2, land sold with the indexation comparison, 54EC, surcharge and Schedule AL', () => {
  const out = writeItr2({
    ...base,
    salary: { employers: [{ ...base.salary!.employers[0], gross: 1075000, tds: 42000 }] },
    houses: undefined, capitalGains: undefined, otherSources: undefined,
    propertySales: [{
      asset: 'RESIDENTIAL_HOUSE', acquiredOn: '2010-05-10', soldOn: '2025-09-20', consideration: 9000000, stampValue: 9500000, cost: 3000000,
      improvements: [{ year: '2015-16', amount: 500000 }], expenses: 100000, claims: [{ section: '54EC', invested: 1000000, investedOn: '2026-01-15' }],
      address: 'Flat 4, Baner', stateCode: '19', pin: '411045', buyers: [{ name: 'R Shah', pan: 'ABCPS1234D', share: 100, amount: 9000000 }],
    }],
    assetsLiabilities: { bankDeposits: 2000000, sharesSecurities: 0, insurance: 0, loansGiven: 0, cash: 20000, jewellery: 300000, artwork: 0, vehicles: 500000, liabilities: 0 },
    taxPayments: [{ bsr: '0002390', date: '2025-12-10', serial: 11, amount: 100000, kind: 'ADVANCE' }],
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR2;
  const b1 = r.ScheduleCGFor23.LongTermCapGain23.SaleofLandBuild;
  assert.equal(b1.TotalLTCGImmblPrprty, 4400000);
  assert.equal(b1.TotalExcessTax, 468930);
  assert.equal(r.ScheduleCGFor23.DeducClaimInfo.TotDeductClaim, 1000000);
  // Total income 10,00,000 + 44,00,000 = 54,00,000. Normal tax 40,000; 112 at 12.5% = 5,50,000 less B1h 4,68,930 = 81,070 (SI row 21).
  assert.equal(r['PartB-TI'].TotalIncome, 5400000);
  assert.deepEqual(r.ScheduleSI.SplCodeRateTax[0], { SecCode: '21', SplRatePercent: 12.5, SplRateInc: 4400000, SplRateIncTax: 81070 });
  // Surcharge 10% of 1,21,070 = 12,107 (marginal relief ceiling at Rs 50 lakh is 4,91,070, not reached); cess 5,327.
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  assert.equal(t.TotalSurcharge, 12107);
  assert.equal(t.GrossTaxLiability, 138504);
  // TDS 42,000; tax due 96,504. Gains arose after 15 Sep, so June and September need only the tax on salary (covered by TDS);
  // 1,00,000 paid by 15 Dec covers 75% and 100%: no 234C, no 234B; refund 3,496.
  assert.equal(t.IntrstPay.TotalIntrstPay, 0);
  assert.equal(r.PartB_TTI.Refund.RefundDue, 3496);
  assert.equal(r.ScheduleAL.MovableAsset.DepositsInBank, 2000000);
});

test('ITR-2, old regime: VDA, losses brought forward, agricultural income, SPI, FA, 80QQB and AMT credit', () => {
  const out = writeItr2({
    ...base,
    filing: { section: 11, regime: 'OLD' },
    salary: { employers: [{ ...base.salary!.employers[0], gross: 1550000, tds: 279930 }] },
    houses: undefined,
    capitalGains: [
      { kind: '111A', date: '2025-05-20', saleValue: 500000, cost: 400000 },
      { kind: '112A', date: '2025-11-10', saleValue: 800000, cost: 500000, isin: 'INE002A01018', name: 'Reliance Industries' },
    ],
    vda: [{ acquiredOn: '2024-01-10', transferredOn: '2026-02-15', cost: 100000, consideration: 180000 }],
    otherSources: { savingsInterest: 20000, other: 200000, otherDescription: 'Royalty on books' },
    lossesBroughtForward: [
      { ay: '2018-19', filedOn: '2018-07-31', filedInTime: true, ltcl: 150000 },
      { ay: '2023-24', filedOn: '2023-07-31', filedInTime: true, stcl: 50000, hp: 30000 },
    ],
    exemptIncome: { agriculture: { grossReceipts: 300000, expenses: 100000 } },
    clubbedIncome: [{ name: 'Aarav Kulkarni', relationship: 'Minor son', amount: 10000, head: 'OS' }],
    foreignAssets: { bankAccounts: [{ countryName: 'United States', countryCode: '2', zip: '10001', bank: 'Chase', address: 'New York', account: '1234567', status: 'OWNER', openedOn: '2019-04-01', peak: 500000, closing: 400000, interest: 2000 }] },
    deductions: { section80C: [{ amount: 150000, id: 'PPF-11' }], section80QQB: { amount: 200000, form10CCDAck: '123456789012345' } },
    amtCredit: [{ ay: '2020-21', gross: 50000, setOffEarlier: 10000 }],
    taxPayments: undefined,
  });
  assert.deepEqual(out.issues, []);
  check(out.json);
  const r = (out.json as any).ITR.ITR2;
  // B/f: LTCL 1,50,000 (AY 2018-19) against the 112A gain of 3,00,000; STCL 50,000 against the 111A gain of 1,00,000. House loss 30,000 waits for house income.
  assert.equal(r.ScheduleBFLA.LTCG12_5Per.IncBFLA.BFlossPrevYrUndSameHeadSetoff, 150000);
  assert.equal(r.ScheduleBFLA.STCG20Per.IncBFLA.BFlossPrevYrUndSameHeadSetoff, 50000);
  assert.equal(r.ScheduleBFLA.TotalBFLossSetOff.TotBFLossSetoff, 200000);
  assert.deepEqual(r.ScheduleCFL.TotalLossCFSummary.LossSummaryDetail, { TotalHPPTILossCF: 30000, TotalSTCGPTILossCF: 0, TotalLTCGPTILossCF: 0 });
  // GTI 15,00,000 + 2,20,000 + 50,000 + 1,50,000 + VDA 80,000 = 20,00,000; VI-A 1,50,000 + 10,000 + 2,00,000; total income 16,40,000.
  assert.equal(r['PartB-TI'].GrossTotalIncome, 2000000);
  assert.equal(r['PartB-TI'].TotalIncome, 1640000);
  assert.equal(r['PartB-TI'].CapGain.CapGains30Per115BBH, 80000);
  assert.equal(r['PartB-TI'].NetAgricultureIncomeOrOtherIncomeForRate, 200000);
  const t = r.PartB_TTI.ComputationOfTaxLiability;
  // Normal 13,60,000 + agricultural 2,00,000: tax on 15,60,000 = 2,80,500; rebate on 4,50,000 = 10,000.
  assert.equal(t.TaxPayableOnTI.TaxAtNormalRatesOnAggrInc, 280500);
  assert.equal(t.TaxPayableOnTI.RebateOnAgriInc, 10000);
  // Special: 50,000 x 20% = 10,000; 25,000 x 12.5% = 3,125; VDA 80,000 x 30% = 24,000.
  assert.equal(t.TaxPayableOnTI.TaxAtSpecialRates, 37125);
  assert.equal(t.GrossTaxLiability, 319930);
  // Adjusted total income 18,40,000 is not above Rs 20 lakh: no AMT; the credit of 40,000 is used.
  assert.equal(r.ScheduleAMT.TaxPayableUnderSec115JC, 0);
  assert.equal(t.CreditUS115JD, 40000);
  assert.equal(t.NetTaxLiability, 279930);
  assert.equal(r.ScheduleVDA.TotIncCapGain, 80000);
  assert.equal(r.ScheduleSPI.SpecifiedPerson[0].HeadIncIncluded, 'OS');
  assert.equal(r.PartB_TTI.AssetOutIndiaFlag, 'YES');
  assert.equal(r.PartB_TTI.TaxPaid.BalTaxPayable, 0);
});

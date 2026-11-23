import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeItr1 } from '../itr/itr1Json.js';
import { writeItr2, type Itr2Input } from '../itr/itr2Json.js';
import { writeItr3, type Itr3Input } from '../itr/itr3Json.js';
import { writeItr4 } from '../itr/itr4Json.js';
import { parseEarlierReturn, earlierReturnPrefill, EarlierReturnError } from './earlierReturn.js';

const person = {
  firstName: 'Meera', surname: 'Kulkarni', pan: 'ABCPK1234L', dob: '1975-09-10', employerCategory: 'OTH' as const,
  address: { residenceNo: 'B-12', locality: 'Kothrud', city: 'Pune', stateCode: '19', pin: '411038' },
  mobile: '9822012345', email: 'meera@example.com', fatherName: 'Vasant Kulkarni', place: 'Pune',
};
const bank = { ifsc: 'SBIN0001234', name: 'State Bank of India', account: '30012345678', type: 'SB' as const };

const itr2: Itr2Input = {
  softwareId: 'SW12345678', createdOn: '2026-07-25', intermediaryCity: 'Pune', person, filing: { section: 11, regime: 'OLD' }, bank,
  salary: { professionalTax: 2500, employers: [{ tan: 'PNEA12345B', name: 'Pune Tech Pvt Ltd', nature: 'OTH', address: { line: 'Hinjewadi', city: 'Pune', stateCode: '19', pin: '411057' }, gross: 2400000, tds: 330000 }] },
  houses: [{ letOut: true, address: 'Flat 7, Baner', city: 'Pune', stateCode: '19', pin: '411045', rent: 360000, municipalTax: 12000, loans: [{ from: 'B', lender: 'HDFC', account: 'HL1', sanctionedOn: '2019-01-01', amount: 3000000, outstanding: 2000000, interest: 150000 }] }],
  otherSources: { savingsInterest: 15000, depositInterest: 60000, dividends: 25000 },
  deductions: { section80C: [{ amount: 100000, id: 'PPF1' }, { amount: 50000, id: 'LIC9' }], section80D: { selfFamily: { premium: 20000, insurers: [{ name: 'Star Health', policy: 'P1', amount: 20000 }] } } },
};

test('ITR-2 written by SynexTax: client, heads, employers, house loan, 80C, 80D, bank', () => {
  const out = writeItr2(itr2);
  assert.deepEqual(out.issues, []);
  const r = parseEarlierReturn(JSON.stringify(out.json));
  assert.equal(r.form, 'ITR-2');
  assert.equal(r.assessmentYear, '2026-27');
  assert.equal(r.carriesTo, '2027-28');
  assert.equal(r.client.pan, 'ABCPK1234L');
  assert.equal(r.client.fatherName, 'Vasant Kulkarni');
  assert.equal(r.client.address.pin, '411038');
  assert.equal(r.filing.regime, 'OLD');
  // 24,00,000 less 50,000 and 2,500.
  assert.equal(r.heads.salary, 2347500);
  // (3,60,000 - 12,000) x 70% - 1,50,000 = 93,600.
  assert.equal(r.heads.houseProperty, 93600);
  assert.equal(r.heads.otherSources, 100000);
  assert.equal(r.heads.totalIncome, out.summary.totalIncome);
  assert.deepEqual(r.otherSourcesDetail, { savingsInterest: 15000, depositInterest: 60000, dividends: 25000, other: 0 });
  assert.equal(r.employers.length, 1);
  assert.equal(r.employers[0].tan, 'PNEA12345B');
  assert.equal(r.employers[0].lastYearGross, 2400000);
  assert.equal(r.employers[0].lastYearTds, 330000);
  assert.equal(r.houses[0].letOut, true);
  assert.deepEqual(r.houses[0].loans, [{ from: 'B', lender: 'HDFC', account: 'HL1', sanctionedOn: '2019-01-01', amount: 3000000, outstanding: 2000000, interest: 0 }]);
  assert.equal(r.houses[0].lastYear.rent, 360000);
  assert.deepEqual(r.section80C, [{ amount: 100000, id: 'PPF1' }, { amount: 50000, id: 'LIC9' }]);
  assert.equal(r.section80D?.selfFamily?.premium, 20000);
  assert.equal(r.section80D?.selfFamily?.insurers[0].name, 'Star Health');
  assert.equal(r.chapterVIA.Section80C, 150000);
  assert.deepEqual(r.banks, [bank]);
  assert.equal(r.losses.rows.length, 0);

  const p = earlierReturnPrefill(r);
  assert.equal(p.person.pan, 'ABCPK1234L');
  assert.equal(p.employers[0].gross, 0);
  assert.equal(p.houses[0].pin, '411045');
  assert.equal(p.deductions.section80C?.length, 2);
  assert.equal(p.flags.lossesBroughtForward, false);
});

test('ITR-2 with a current year loss written by SynexTax: carried to next year', () => {
  const out = writeItr2({ ...itr2, filing: { section: 11, regime: 'NEW' }, capitalGains: [{ kind: 'STCG', date: '2025-12-01', saleValue: 200000, cost: 250000 }] });
  assert.deepEqual(out.issues, []);
  const r = parseEarlierReturn(out.json);
  assert.equal(r.filing.regime, 'NEW');
  const stcl = out.summary.lossCarriedForward;
  assert.ok(stcl > 0);
  assert.equal(r.losses.availableTotal.shortTermCapital, stcl);
  assert.equal(r.losses.available[0].assessmentYear, '2026-27');
});

test('ITR-1 written by SynexTax: self-occupied house, employer, 80C total', () => {
  const out = writeItr1({
    softwareId: 'SW12345678', createdOn: '2026-07-20', intermediaryCity: 'Pune', person, filing: { section: 11, regime: 'OLD' }, bank,
    salary: { gross: 900000, professionalTax: 2400, employers: [{ tan: 'PNEA12345B', name: 'Acme', incomeChargeable: 847600, tds: 30000 }] },
    house: { letOut: false, address: 'B-12', city: 'Pune', stateCode: '19', pin: '411038', interest: 150000 },
    otherSources: { savingsInterest: 8000, depositInterest: 20000 }, deductions: { section80C: 150000, section80D: 25000 },
  });
  const r = parseEarlierReturn(out.json);
  assert.equal(r.form, 'ITR-1');
  assert.equal(r.client.employerCategory, 'OTH');
  assert.equal(r.heads.salary, 847600);
  assert.equal(r.heads.houseProperty, -150000);
  assert.equal(r.houses[0].letOut, false);
  assert.equal(r.employers[0].name, 'Acme');
  assert.equal(r.employers[0].lastYearGross, 847600);
  assert.equal(r.otherSourcesDetail.depositInterest, 20000);
  assert.equal(r.chapterVIA.Section80C, 150000);
  assert.equal(r.chapterVIA.Section80D, 25000);
  assert.equal(r.section80C.length, 0);
});

test('ITR-4 written by SynexTax: 44AD business details carried', () => {
  const out = writeItr4({
    softwareId: 'SW12345678', createdOn: '2026-08-20', intermediaryCity: 'Ludhiana', person, filing: { section: 11, regime: 'NEW' }, bank,
    business: { ad: { code: '09028', name: 'Singh Hardware', digital: 4000000, cash: 500000, otherMode: 0 }, gstins: [{ gstin: '03ABCPK1234L1Z5', turnover: 4500000 }], financials: { capital: 800000, sundryCreditors: 200000, inventories: 600000, sundryDebtors: 250000, bank: 100000, cashInHand: 50000 } },
    otherSources: { savingsInterest: 12000 },
  });
  assert.deepEqual(out.issues, []);
  const r = parseEarlierReturn(out.json);
  assert.equal(r.form, 'ITR-4');
  assert.equal(r.heads.business, 280000);
  assert.equal(r.business?.ad?.code, '09028');
  assert.equal(r.business?.ad?.lastYearTurnover, 4500000);
  assert.deepEqual(r.business?.gstins, ['03ABCPK1234L1Z5']);
  const p = earlierReturnPrefill(r);
  assert.equal(p.business?.ad?.name, 'Singh Hardware');
  assert.equal(p.business?.ad?.digital, 0);
});

test('ITR-3 written by SynexTax: nature of business and 44ADA', () => {
  const input: Itr3Input = {
    softwareId: 'SW12345678', createdOn: '2026-07-25', intermediaryCity: 'Bengaluru', person: { ...person, pan: 'ABCPR1234K' }, status: 'I', bank,
    filing: { section: 11, regime: 'NEW' },
    business: { natures: [{ code: '14001', tradeName: 'Rao Consulting' }], ada: { code: '14001', name: 'Rao Consulting', digital: 4000000, cash: 0 }, noAccounts: { debtors: 300000, creditors: 50000, stock: 0, cash: 25000 } },
    otherSources: { savingsInterest: 20000 },
  };
  const out = writeItr3(input);
  assert.deepEqual(out.issues, []);
  const r = parseEarlierReturn(out.json);
  assert.equal(r.form, 'ITR-3');
  assert.equal(r.heads.business, 2000000);
  assert.deepEqual(r.business?.natures, [{ code: '14001', tradeName: 'Rao Consulting' }]);
  assert.equal(r.business?.ada?.lastYearReceipts, 4000000);
});

// A hand-built AY 2025-26 ITR-2 in the portal layout with losses from several years.
const handBuilt = (section: number) => ({
  ITR: {
    ITR2: {
      CreationInfo: { SWCreatedBy: 'SW99999999' },
      Form_ITR2: { FormName: 'ITR-2', AssessmentYear: '2025' },
      PartA_GEN1: {
        PersonalInfo: { AssesseeName: { FirstName: 'Ravi', SurNameOrOrgName: 'Iyer' }, PAN: 'AAAPI1234Q', DOB: '1970-01-05', Address: { ResidenceNo: '4', LocalityOrArea: 'Adyar', CityOrTownOrDistrict: 'Chennai', StateCode: '33', PinCode: 600020, MobileNo: 9840012345, EmailAddress: 'ravi@example.com' } },
        FilingStatus: { ReturnFileSec: section, OptOutNewTaxRegime: 'N', ResidentialStatus: 'RES' },
      },
      ScheduleHP: { PropertyDetails: [{ AddressDetailWithZipCode: { AddrDetail: '9 Beach Rd', CityOrTownOrDistrict: 'Chennai', StateCode: '33', PinCode: 600041 }, ifLetOut: 'D', AsseseeShareProperty: 50, Rentdetails: { AnnualLetableValue: '240000', LocalTaxes: 0, IntOnBorwCap: 0, IncomeOfHP: 168000 } }], TotalIncomeChargeableUnHP: 168000 },
      ScheduleCFL: {
        LossCFFromPrev8thYearFromAY: { CarryFwdLossDetail: { DateOfFiling: '2017-07-30', TotalHPPTILossCF: 50000, TotalSTCGPTILossCF: 0, TotalLTCGPTILossCF: 0 } },
        LossCFFromPrev3rdYearFromAY: { CarryFwdLossDetail: { DateOfFiling: '2022-07-20', TotalHPPTILossCF: 0, TotalSTCGPTILossCF: 100000, TotalLTCGPTILossCF: 0, OthSrcLossRaceHorseCF: 0 } },
        LossCFFromPrevYrToAY: { CarryFwdLossDetail: { DateOfFiling: '2024-07-15', TotalHPPTILossCF: 0, TotalSTCGPTILossCF: 0, TotalLTCGPTILossCF: 40000 } },
        AdjTotBFLossInBFLA: { LossSummaryDetail: { TotalHPPTILossCF: 0, TotalSTCGPTILossCF: 30000, TotalLTCGPTILossCF: 0 } },
        CurrentAYloss: { LossSummaryDetail: { TotalHPPTILossCF: 20000, TotalSTCGPTILossCF: 10000, TotalLTCGPTILossCF: 0 } },
        TotalLossCFSummary: { LossSummaryDetail: { TotalHPPTILossCF: 70000, TotalSTCGPTILossCF: 80000, TotalLTCGPTILossCF: 40000 } },
      },
      PartB_TTI: { Refund: { BankAccountDtls: { AddtnlBankDetails: [{ IFSCCode: 'ICIC0000001', BankName: 'ICICI', BankAccountNo: '1111', AccountType: 'SB', UseForRefund: 'false' }, { IFSCCode: 'HDFC0000001', BankName: 'HDFC', BankAccountNo: '2222', AccountType: 'SB', UseForRefund: 'true' }] } } },
      Verification: { Declaration: { FatherName: 'K Iyer' }, Place: 'Chennai' },
    },
  },
});

test('Hand-built AY 2025-26 ITR-2: years of losses, set-off oldest first, time limits', () => {
  const r = parseEarlierReturn(handBuilt(11));
  assert.equal(r.assessmentYear, '2025-26');
  assert.equal(r.carriesTo, '2026-27');
  assert.equal(r.writtenBy, 'SW99999999');
  assert.deepEqual(r.losses.rows.map((x) => x.assessmentYear), ['2017-18', '2022-23', '2024-25', '2025-26']);
  // AY 2017-18 house property loss: 2026-27 is the ninth year, beyond the eight allowed by section 71B.
  assert.equal(r.losses.lapsed.length, 1);
  assert.equal(r.losses.lapsed[0].kind, 'houseProperty');
  assert.equal(r.losses.lapsed[0].amount, 50000);
  const byYear = Object.fromEntries(r.losses.available.map((x) => [x.assessmentYear, x.amounts]));
  assert.equal(byYear['2022-23'].shortTermCapital, 70000);
  assert.equal(byYear['2024-25'].longTermCapital, 40000);
  assert.equal(byYear['2025-26'].houseProperty, 20000);
  assert.equal(byYear['2025-26'].shortTermCapital, 10000);
  assert.equal(r.losses.availableTotal.shortTermCapital, 80000);
  // Totals agree with the return, so no mismatch note.
  assert.ok(!r.notes.some((x) => x.includes('the year rows come to')), r.notes.join('\n'));
  // House: deemed let out is carried as let out, 50% share; refund account first; numbers as text are read.
  assert.equal(r.houses[0].letOut, true);
  assert.equal(r.houses[0].share, 50);
  assert.equal(r.houses[0].lastYear.rent, 240000);
  assert.equal(r.banks[0].ifsc, 'HDFC0000001');
  assert.equal(r.client.address.pin, '600020');
  assert.equal(earlierReturnPrefill(r).flags.lossesBroughtForward, true);
});

test('Belated return last year: section 80 bars the capital loss of that year, not the house property loss', () => {
  const r = parseEarlierReturn(handBuilt(12));
  const own = r.losses.available.find((x) => x.assessmentYear === '2025-26');
  assert.equal(own?.amounts.houseProperty, 20000);
  assert.equal(own?.amounts.shortTermCapital, 0);
  assert.ok(r.losses.lapsed.some((l) => l.assessmentYear === '2025-26' && l.kind === 'shortTermCapital' && l.reason.includes('section 80')));
});

test('ITR-3 loss rows and unabsorbed depreciation (hand-built)', () => {
  const r = parseEarlierReturn({
    ITR: { ITR3: {
      Form_ITR3: { AssessmentYear: '2026' },
      PartA_GEN1: { PersonalInfo: { PAN: 'ABCPR1234K', AssesseeName: { SurNameOrOrgName: 'Rao' } }, FilingStatus: { ReturnFileSec: 11, F10IEACurrAYOldRegime: 'Y', F10IEAAckNoCurrAYOldTax: 123456789012345, F10IEADateCurrAYOldTax: '2026-07-10' } },
      ScheduleCFL: {
        LossCFCurrentAssmntYear2024: { CarryFwdLossDetail: { BusLossOthThanSpecLossCF: 300000, LossFrmSpecBusCF: 5000 } },
        LossCFCurrentAssmntYear2022: { CarryFwdLossDetail: { LossFrmSpecifiedBusCF: 9000 } },
        CurrentAYloss: { LossSummaryDetail: { BusLossOthThanSpecLossCF: 100000 } },
        TotalLossCFSummary: { LossSummaryDetail: { BusLossOthThanSpecLossCF: 400000, LossFrmSpecBusCF: 5000, LossFrmSpecifiedBusCF: 9000 } },
      },
      ITR3ScheduleUD: { ScheduleUD: [{ AssYr: '2023-24', BalCFNY: 75000, AllowBalCFNY: 0 }] },
    } },
  });
  assert.equal(r.filing.regime, 'OLD');
  assert.equal(r.filing.form10IEA?.ack, '123456789012345');
  const byYear = Object.fromEntries(r.losses.available.map((x) => [x.assessmentYear, x.amounts]));
  // LossCFCurrentAssmntYear2024 holds AY 2023-24 (AY 2026-27 ITR-3 schema). Speculative loss of AY 2023-24 runs to AY 2027-28 (section 73(4)).
  assert.equal(byYear['2023-24'].business, 300000);
  assert.equal(byYear['2023-24'].speculative, 5000);
  assert.equal(byYear['2021-22'].specifiedBusiness, 9000);
  assert.equal(byYear['2026-27'].business, 100000);
  assert.deepEqual(r.losses.unabsorbedDepreciation, [{ assessmentYear: '2023-24', depreciation: 75000, allowance35: 0 }]);
});

test('Speculative loss older than four years lapses', () => {
  const r = parseEarlierReturn({ ITR: { ITR3: { Form_ITR3: { AssessmentYear: '2026' }, PartA_GEN1: { PersonalInfo: { PAN: 'ABCPR1234K' } }, ScheduleCFL: { LossCFCurrentAssmntYear2024: { CarryFwdLossDetail: { LossFrmSpecBusCF: 5000 } }, LossCFCurrentAssmntYear2023: { CarryFwdLossDetail: { LossFrmSpecBusCF: 7000 } } } } } });
  // AY 2022-23 loss: AY 2027-28 is the fifth year after it.
  assert.ok(r.losses.lapsed.some((l) => l.assessmentYear === '2022-23' && l.amount === 7000));
  assert.equal(r.losses.availableTotal.speculative, 5000);
});

test('Rejects what is not an ITR-1 to ITR-4 return', () => {
  assert.throws(() => parseEarlierReturn('not json'), EarlierReturnError);
  assert.throws(() => parseEarlierReturn({ foo: 1 }), /No ITR form/);
  assert.throws(() => parseEarlierReturn({ ITR: { ITR5: {} } }), /not covered/);
  assert.throws(() => parseEarlierReturn({ ITR: { ITR1: { Form_ITR1: {} } } }), /assessment year/);
  let deep: unknown = 1;
  for (let k = 0; k < 100; k++) deep = { a: deep };
  assert.throws(() => parseEarlierReturn({ ITR: { ITR1: deep } }), /nested/);
});

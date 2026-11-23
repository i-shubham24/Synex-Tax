import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taxAuditValidator } from './schemaValidator.js';
import { UNBUILT_CLAUSES, clause34aFromSectionLine, clause34bFromStatement, clause34cFromDefaultAnalysis, writeForm3cd, type TaxAuditInput } from './form3cdWriter.js';
import { defaultAnalysis, sectionRegister, statementRegister, type RegisterRow } from '../tds/registers.js';

const v3CA = taxAuditValidator('3CA');
const v3CB = taxAuditValidator('3CB');
const check = (form: '3CA' | '3CB', json: unknown) => {
  const v = form === '3CA' ? v3CA : v3CB;
  assert.ok(v(json), JSON.stringify(v.errors?.slice(0, 6), null, 1));
};

const office = { line1: '12 Mall Road', city: 'Ludhiana', stateCode: '26', pin: '141001' };

/** A proprietor trading in hardware, Form 3CB, every built clause filled and the rest declared not applicable. */
const proprietor = (): TaxAuditInput => ({
  form: '3CB',
  softwareId: 'SW12345678',
  createdOn: '2026-09-20',
  intermediaryCity: 'Ludhiana',
  assessee: { firstName: 'Harpreet', name: 'Singh', pan: 'ABCPS1234K', status: 1, address: office, indirectTax: [{ type: 'GST', regNo: '03ABCPS1234K1Z5', stateCode: '26' }] },
  clause8: ['44ABa'],
  clause8A: { opted: false },
  auditor: { firstName: 'Meera', lastName: 'Kapoor', membershipNo: '512345', firmName: 'Kapoor and Co', firmRegNo: '012345N', signsForFirm: true, address: { line1: '4 Civil Lines', city: 'Ludhiana', stateCode: '26', pin: '141001' }, place: 'Ludhiana', signedOn: '2026-09-18' },
  accountType: 'Profit and loss account',
  form3CB: { headOffice: '12 Mall Road, Ludhiana', branches: 0, result: 'Profit' },
  observations: [{ code: '04', text: 'Stock records are kept for principal items only.' }],
  partB: {
    clause10: { codes: ['09028'], changes: [] },
    clause11: { prescribed: [], maintained: [{ books: 'Cash book, ledger, purchase and sales registers (Tally)', address: office }], examined: ['Cash book', 'Ledger', 'Bank statements', 'GST returns'] },
    clause12: { rows: [] },
    clause13: { method: '02', changes: [], icdsAdjustments: [{ icds: 'ICDSII', increase: 25000, decrease: 0 }], disclosures: [{ icds: 'ICDSII', text: 'Inventories valued at cost or net realisable value, whichever is lower.' }] },
    clause14: { method: '3', deviations145A: [] },
    clause16: { section28: [], credits: [], escalation: [], otherIncome: [], capitalReceipts: [] },
    clause17: { properties: [] },
    clause18: {
      blocks: [
        // Opening 4,00,000; addition 1,00,000 used 180 days or more; addition 60,000 used less than 180 days; sale 20,000 out of the opening block.
        // Depreciation at 15%: (4,00,000 - 20,000 + 1,00,000) x 15% = 72,000; 60,000 x 7.5% = 4,500; total 76,500.
        { block: '1', rate: 15, openingWdv: 400000, additions: [{ purchaseDate: '2025-06-10', putToUseDate: '2025-06-15', value: 100000, lessThan180Days: false }, { purchaseDate: '2026-01-05', putToUseDate: '2026-01-10', value: 60000, lessThan180Days: true }], deductions: [{ saleDate: '2025-11-01', amount: 20000, outOfLessThan180DayAdditions: false }] },
        { block: '11', rate: 10, openingWdv: 150000, additions: [], deductions: [] },
      ],
    },
    clause19: { rows: [] },
    clause20: { bonus: [], employeeContributions: [{ fund: 'PROVIDENT', received: 18000, dueDate: '2025-05-15', paid: 18000, paidOn: '2025-05-12' }] },
    clause21: {
      debited: [{ type: 'PERSONAL', particulars: 'Personal travel', amount: 12000 }],
      s40a: { nonResidentNotDeducted: [], nonResidentNotPaid: [], residentNotDeducted: [{ date: '2025-08-01', amount: 120000, nature: 'Contract work', name: 'Raj Builders', pan: 'AAAFR1234Q', address: office }], residentNotPaid: [], levyNotDeducted: [], levyNotPaid: [], salaryOutsideIndia: [] },
      s40b: [],
      s40A3: [],
      s40A3A: [{ date: '2025-10-10', nature: 'Purchase of goods', amount: 15000, name: 'Local supplier' }],
      contingent: [],
      section14A: [],
    },
    clause22: { interestInadmissible: 0, payableToMicroSmall: 800000, paidInTime: 780000, notPaidInTime: 20000 },
    clause26: { preExistingPaid: [], preExistingUnpaid: [], currentPaid: [{ section: '43Ba', nature: 'GST payable for March 2026', amount: 54000 }], currentUnpaid: [], indirectTaxThroughPl: false, note: 'GST is not passed through the profit and loss account.' },
    clause31: { loans269SS: [{ name: 'Gurdev Singh', address: 'Model Town, Ludhiana', pan: 'ABCPS9876L', amount: 500000, squaredUp: 'N', maxOutstanding: 500000, mode: 'NEFT' }], specifiedSums269SS: [], receipts269STCash: [], receipts269STCheque: [], payments269STCash: [], payments269STCheque: [], repayments269T: [], repaymentsReceivedCash: [], repaymentsReceivedCheque: [] },
    clause34: { required: true, rows: [{ tan: 'PTLA12345B', section: '194C', nature: 'Contract work', totalAmount: 900000, requiredAmount: 780000, specifiedRateAmount: 660000, specifiedRateTax: 6600, lowerRateAmount: 0, lowerRateTax: 0, notDeposited: 0 }], statementsRequired: true, statements: [{ tan: 'PTLA12345B', form: '26Q', dueDate: '2025-07-31', filedOn: '2025-07-28', allReported: true }], interest: 'N', interestRows: [] },
    clause37: { status: 'X' },
    clause38: { status: 'X' },
    clause39: { status: 'X' },
    clause40: { previous: { turnover: 52000000, grossProfit: 6240000, netProfit: 1820000, stockInTrade: 7800000 }, preceding: { turnover: 47000000, grossProfit: 5400000, netProfit: 1550000, stockInTrade: 7100000 } },
    clause44: { total: 46000000, exempt: 400000, composition: 1200000, otherRegistered: 42000000, unregistered: 2400000 },
  },
  notApplicable: [...UNBUILT_CLAUSES],
});

test('Form 3CB for a proprietor: valid against schema V2.5, depreciation and flags as worked', () => {
  const out = writeForm3cd(proprietor());
  assert.deepEqual(out.issues, []);
  check('3CB', out.json);
  const f = (out.json as any).FORM3CB.F3CB;
  assert.equal(f.Form_Details.AssessmentYear, '2026');
  assert.equal(f.PartA.AssessmentYear, '2026-27');
  assert.equal(f.PartA.Status, 1);
  assert.equal(f.Declaration.Point1.I_We, 'We');
  assert.equal(f.Declaration.Point1.Year, 2026);
  assert.equal(f.Declaration.Point3.PointB_C.PointSecond.PLSD, 'Profit');
  // Clause 18: 72,000 + 4,500; WDV = 4,00,000 + 1,60,000 - 20,000 - 76,500 = 4,63,500.
  assert.equal(f.Form3cdDeprAllw[0].DepAllowable, 76500);
  assert.equal(f.Form3cdDeprAllw[0].WrittenDownVal, 463500);
  assert.equal(f.Form3cdDeprAllw[0].Puttouseforlessthan180days, 60000);
  assert.equal(f.Form3cdDeprAllw[0].morethan180, 20000);
  assert.equal(f.Form3cdDeprAllw[1].DepAllowable, 15000);
  assert.equal(out.summary.depreciationAllowable, 91500);
  // Clause 21(d): no 40A(3) payments, one 40A(3A) payment.
  assert.equal(f.Form3cdFlags.Sec40A3, 'Y');
  assert.equal(f.Form3cdFlags.Sec40A3A, 'N');
  assert.equal(f.Form3cdAmtInadm40A2[0].ParticularType, 'SUBCLAUSEia');
  // Clause 13(e) totals; clause 40 ratios to two decimals.
  assert.deepEqual(f.Form3cdChngMethAccValChange.Form3cdChngMethAccValTotal, [{ TotalIncProfit: 25000, TotalDecProfits: 0, TotalNetProfit: 25000 }]);
  assert.equal(f.Form3cdAccountingRatioCalculations.PrevYrProfTurnOvr.GrossprofitTurnover, 12);
  assert.equal(f.Form3cdAccountingRatioCalculations.PrevYrProfTurnOvr.NetprofitTurnover1, 3.5);
  assert.equal(f.Form3cdAccountingRatioCalculations.PrecPrevYrProfTurnOvr.GrossprofitTurnover, 11.49);
  // Clause 44: registered = 4,00,000 + 12,00,000 + 4,20,00,000.
  assert.equal(f.Form3cdBreakUpGST[0].RegEntities, 43600000);
  // Clauses declared not applicable.
  assert.equal(f.Form3cdFlags.ChngShareSec79, 'X');
  assert.equal(f.Form3cdFlags.FurnishStatement, 'N');
  assert.equal(f.Form3cdFlags.Form3cdSec562viiaFlag, undefined);
  assert.equal(out.summary.pan, 'XXXXX1234K');
});

test('Form 3CA for a company, clause 34 taken from the TDS registers, firm and partners not asked', () => {
  const rows: RegisterRow[] = [
    { id: '1', form: '26Q', challanId: 'c1', pan: 'AAACR1111A', name: 'Ravi Transport', sectionCode: '94C', paidOn: '2025-06-10', amountPaid: '500000.00', taxDeducted: '10000.00', taxDeposited: '10000.00', deductedOn: '2025-06-10', ratePercent: '2.0000' },
    { id: '2', form: '26Q', challanId: 'c2', pan: 'AAACK2222B', name: 'Kiran Logistics', sectionCode: '94C', paidOn: '2025-09-15', amountPaid: '300000.00', taxDeducted: '3000.00', taxDeposited: '0.00', deductedOn: '2025-09-15', ratePercent: '1.0000', reasonCode: 'A' },
  ];
  const line = sectionRegister(rows)[0];
  const da = defaultAnalysis({ rows, challans: [{ id: 'c1', label: 'c1', depositDate: '2025-07-05', interestPaid: '0' }, { id: 'c2', label: 'c2', depositDate: '2025-12-01', interestPaid: '0' }] });
  const stmt = statementRegister([{ id: 'r1', form: '26Q', quarter: 'Q2', dueDate: '2025-10-31', filedOn: '2025-11-20', status: 'FILED' }], '2026-09-01')[0];
  const base = proprietor();
  const input: TaxAuditInput = {
    ...base,
    form: '3CA',
    form3CB: undefined,
    assessee: { name: 'Acme Steel Private Limited', pan: 'AAACA1234C', status: 5, address: office, indirectTax: [{ type: 'GST', regNo: '03AAACA1234C1Z9', stateCode: '26' }] },
    clause8: ['44ABAA', '44AB3'],
    clause8A: { opted: true, section: '115BAA' },
    form3CA: { act: '14', auditReportDate: '2026-08-30', statutoryAuditor: 'SELF', statutoryAuditorName: 'Kapoor and Co' },
    partB: {
      ...base.partB,
      clause34: {
        required: true,
        rows: [clause34aFromSectionLine(line, { tan: 'PTLA12345B', section: '194C', nature: 'Payments to contractors', totalAmount: 900000, requiredAmount: 800000 })],
        statementsRequired: true,
        statements: [clause34bFromStatement(stmt, 'PTLA12345B', true)],
        interest: 'Y',
        interestRows: [clause34cFromDefaultAnalysis(da.totals, 'PTLA12345B')],
      },
    },
  };
  const out = writeForm3cd(input);
  assert.deepEqual(out.issues, []);
  check('3CA', out.json);
  const f = (out.json as any).FORM3CA.F3CA;
  assert.equal(f.Declaration.Point1.Me_Us_Ms, 'Us');
  assert.equal(f.Declaration.Point1.My_Our_Their, 'Our');
  assert.equal(f.assignFlag, 'Y');
  assert.equal(f.type, '115BAA');
  const r34 = f.Form3cdChapXVII[0];
  // Ravi at the full rate; Kiran at a lower rate (flag A), 3,000 deducted and not deposited.
  assert.equal(r34.TotTaxSpecRate, 500000);
  assert.equal(r34.AmtTaxSpecRate, 10000);
  assert.equal(r34.TotLessThanSpecRate, 300000);
  assert.equal(r34.AmtTaxDedOrCollect, 3000);
  assert.equal(r34.AmtNotDepToGovt, 3000);
  assert.equal(f.Form3cdTaxDedCollect[0].DateOfFurnish, '2025-11-20');
  assert.equal(f.Form3cdSec2011A206C7[0].AmtPaid, 0);
  assert.ok(f.Form3cdSec2011A206C7[0].AmtOfIntrest > 0);
  assert.equal(f.Form3cdFirmAopDetailNew, undefined);
  // The 3CA file does not pass the 3CB schema, and the other way round.
  assert.equal(v3CB(out.json), false);
});

test('A firm needs clause 9; partners must add to 100%', () => {
  const base = proprietor();
  const firm: TaxAuditInput = { ...base, assessee: { ...base.assessee, firstName: undefined, name: 'Singh Traders', pan: 'AAKFS1234M', status: 3 } };
  const missing = writeForm3cd(firm);
  assert.equal(missing.json, null);
  assert.deepEqual(missing.clausesNeeded, ['9']);
  const bad = writeForm3cd({ ...firm, partB: { ...firm.partB, clause9: { partners: [{ name: 'A', share: 60 }, { name: 'B', share: 30 }], changes: [] } } });
  assert.ok(bad.issues.some((x) => /100%/.test(x.message)));
  const good = writeForm3cd({ ...firm, partB: { ...firm.partB, clause9: { partners: [{ name: 'A', share: 66.67 }, { name: 'B', share: 33.33 }], changes: [{ date: '2025-10-01', name: 'B', type: 'CHANGE', oldShare: 50, newShare: 33.33, remarks: 'Retirement deed dated 1 Oct 2025' }] } } });
  assert.deepEqual(good.issues, []);
  check('3CB', good.json);
  assert.equal((good.json as any).FORM3CB.F3CB.Form3cdFlags.ChangeInPartner, 'Y');
});

test('Refused with the list of clauses still needed when clauses are neither filled nor declared not applicable', () => {
  const base = proprietor();
  const out = writeForm3cd({ ...base, partB: { ...base.partB, clause18: undefined, clause34: undefined }, notApplicable: ['15', '23'] });
  assert.equal(out.json, null);
  assert.ok(out.clausesNeeded.includes('18'));
  assert.ok(out.clausesNeeded.includes('34'));
  assert.ok(out.clausesNeeded.includes('27'));
  assert.ok(!out.clausesNeeded.includes('15'));
  const msg = out.issues.find((x) => x.field === 'clauses')!.message;
  assert.match(msg, /Clauses still needed: .*18.*34/);
});

test('Checks: software ID, PAN, clause 44 total, clause 34(a) columns, rate of the block', () => {
  const base = proprietor();
  const out = writeForm3cd({
    ...base,
    softwareId: '',
    assessee: { ...base.assessee, pan: 'ABCDE1234' },
    partB: {
      ...base.partB,
      clause18: { blocks: [{ block: '1', rate: 10, openingWdv: 1000, additions: [], deductions: [] }] },
      clause34: { ...base.partB.clause34!, rows: [{ ...base.partB.clause34!.rows[0], specifiedRateAmount: 800000 }] },
      clause44: { ...base.partB.clause44!, total: 1 },
    },
  });
  assert.equal(out.json, null);
  const fields = out.issues.map((x) => x.field);
  for (const f of ['softwareId', 'assessee.pan', 'clause18.blocks.0', 'clause34.rows.0', 'clause44']) assert.ok(fields.includes(f), f);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForm16, amountsOnLine } from './form16.js';
import { textLines } from './common.js';

// Synthetic: these lines were typed for this test to follow the Form 16 labels of rule 31 and the
// TRACES Part A layout. They are not taken from a real certificate; names, PAN, TAN and figures are
// invented (the PAN and TAN only match the format).

const TRACES_FORM16 = [
  'FORM NO. 16',
  '[See rule 31(1)(a)]',
  'PART A',
  'Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source on salary',
  'Certificate No.  ABCDEFG   Last updated on  10-Jun-2025',
  'Name and address of the Employer/Specified Bank   Name and address of the Employee/Specified senior citizen',
  'SAMPLE SOFTWARE PRIVATE LIMITED  RAVI KUMAR',
  '12 MG ROAD, BENGALURU - 560001  45 LAKE VIEW, BENGALURU',
  'PAN of the Deductor  TAN of the Deductor  PAN of the Employee/Specified senior citizen  Employee Reference No.',
  'AAACS1234K  BLRS12345B  ABCPK1234L  E1001',
  'CIT (TDS)  Assessment Year  Period with the Employer',
  'Bengaluru  2025-26  From  To',
  '01-Apr-2024  31-Mar-2025',
  'Summary of amount paid/credited and tax deducted at source thereon in respect of the employee',
  'Quarter(s)  Receipt Numbers of original quarterly statements of TDS under sub-section (3) of section 200  Amount paid/credited  Amount of tax deducted (Rs.)  Amount of tax deposited / remitted (Rs.)',
  'Q1  QQAABBCC  3,00,000.00  12,000.00  12,000.00',
  'Q2  QQDDEEFF  3,00,000.00  12,000.00  12,000.00',
  'Q3  QQGGHHII  3,00,000.00  12,000.00  12,000.00',
  'Q4  QQJJKKLL  3,00,000.00  14,000.00  14,000.00',
  'Total (Rs.)  12,00,000.00  50,000.00  50,000.00',
  'PART B (Annexure)',
  'Details of Salary Paid and any other income and tax deducted',
  'Whether opting out of taxation u/s 115BAC(1A)?  No',
  '1. Gross Salary',
  '(a) Salary as per provisions contained in section 17(1)  11,50,000.00',
  '(b) Value of perquisites under section 17(2) (as per Form No. 12BA, wherever applicable)  50,000.00',
  '(c) Profits in lieu of salary under section 17(3) (as per Form No. 12BA, wherever applicable)  0.00',
  '(d) Total  12,00,000.00',
  '(e) Reported total amount of salary received from other employer(s)  0.00',
  '2. Less: Allowances to the extent exempt under section 10',
  '(e) House rent allowance under section 10(13A)  0.00',
  '(h) Total amount of exemption claimed under section 10',
  '0.00',
  '3. Total amount of salary received from current employer [1(d)-2(h)]  12,00,000.00',
  '4. Less: Deductions under section 16',
  '(a) Standard deduction under section 16(ia)  75,000.00',
  '(b) Entertainment allowance under section 16(ii)  0.00',
  '(c) Tax on employment under section 16(iii)  2,400.00',
  '5. Total amount of deductions under section 16 [4(a)+4(b)+4(c)]  77,400.00',
  '6. Income chargeable under the head "Salaries" [(3+1(e)-5]  11,22,600.00',
  '9. Gross total income (6+8)  11,22,600.00',
  '10. Deductions under Chapter VI-A  Gross Amount  Deductible Amount',
  '(a) Deduction in respect of life insurance premia, contributions to provident fund etc. under section 80C  1,50,000.00  0.00',
  '(d) Total deduction under section 80C, 80CCC and 80CCD(1)  1,50,000.00  0.00',
  '(e) Deductions in respect of amount paid/deposited to notified pension scheme under section 80CCD (1B)  50,000.00  0.00',
  '12. Total taxable income (9-11)  11,22,600.00',
  '13. Tax on total income  57,260.00',
  '14. Rebate under section 87A, if applicable  0.00',
  '15. Surcharge, wherever applicable  0.00',
  '16. Health and education cess  2,290.00',
  '17. Tax payable (13+15+16-14)  59,550.00',
  '18. Less: Relief under section 89 (attach details)  0.00',
  '19. Net tax payable (17-18)  50,000.00',
];

test('Form 16 (synthetic TRACES layout): Part A quarters, TAN and masked PANs', () => {
  const r = parseForm16(TRACES_FORM16);
  assert.equal(r.isForm16, true);
  assert.equal(r.form, 'FORM16');
  assert.equal(r.partA.employerTan, 'BLRS12345B');
  assert.equal(r.partA.employeePan, 'XXXXX1234L');
  assert.equal(r.partA.employerPan, 'XXXXX1234K');
  assert.equal(r.partA.employerName, 'SAMPLE SOFTWARE PRIVATE LIMITED');
  assert.equal(r.partA.assessmentYear, '2025-26');
  assert.equal(r.partA.periodFrom, '2024-04-01');
  assert.equal(r.partA.periodTo, '2025-03-31');
  assert.equal(r.partA.certificateNo, 'ABCDEFG');
  assert.equal(r.partA.quarters.length, 4);
  assert.deepEqual(r.partA.quarters[3], { quarter: 'Q4', receipt: 'QQJJKKLL', paid: 300000, deducted: 14000, deposited: 14000 });
  assert.equal(r.partA.totalDeducted, 50000);
  // The full PAN never leaves the parser.
  assert.ok(!JSON.stringify(r).includes('ABCPK1234L'));
});

test('Form 16 (synthetic): Part B figures by label, wrapped figure, regime and ITR shape', () => {
  const r = parseForm16(TRACES_FORM16);
  const f = r.partB.figures;
  assert.equal(f.salary171, 1150000);
  assert.equal(f.perquisites172, 50000);
  assert.equal(f.grossSalary, 1200000);
  assert.equal(f.exemptTotal, 0); // figure on the next line
  assert.equal(f.salaryCurrentEmployer, 1200000);
  assert.equal(f.standardDeduction, 75000);
  assert.equal(f.professionalTax, 2400);
  assert.equal(f.chargeableSalary, 1122600);
  assert.equal(f.ded80C, 0); // deductible column, new regime
  assert.equal(f.ded80CCD1B, 0);
  assert.equal(f.cess, 2290);
  assert.equal(f.taxPayable, 59550);
  assert.equal(f.netTaxPayable, 50000);
  assert.equal(r.partB.regime, 'NEW');
  assert.deepEqual(r.itr.salaryTds, { tan: 'BLRS12345B', name: 'SAMPLE SOFTWARE PRIVATE LIMITED', incomeChargeable: 1122600, tds: 50000 });
  assert.equal(r.itr.gross, 1200000);
  assert.equal(r.itr.professionalTax, 2400);
  assert.equal(r.missing.length, 0, JSON.stringify(r.missing));
  // Part A deducted 50,000 and Part B net tax 50,000 agree, so no difference is flagged.
  assert.ok(!r.issues.some((i) => i.field === 'tds'));
});

test('Form 16 (synthetic): an employer Part B with other wording, and what is missing', () => {
  const lines = [
    'Form 16 Part B',
    'Gross Salary  9,00,000',
    'Less: HRA  1,20,000',
    'Professional Tax  2,500',
    'Income chargeable under the head Salaries  7,27,500',
    'Net tax payable  40,000',
  ];
  const r = parseForm16(lines);
  assert.equal(r.partB.figures.grossSalary, 900000);
  assert.equal(r.partB.figures.exemptHra, 120000);
  assert.equal(r.partB.figures.professionalTax, 2500);
  assert.equal(r.partB.figures.chargeableSalary, 727500);
  const missing = r.missing.map((m) => m.field);
  assert.ok(missing.includes('standardDeduction'));
  assert.ok(missing.includes('employerTan'));
  assert.ok(missing.includes('regime'));
});

test('Section numbers are not read as amounts', () => {
  assert.deepEqual(amountsOnLine('(a) Salary as per provisions contained in section 17(1)  5,00,000.00'), [500000]);
  assert.deepEqual(amountsOnLine('Standard deduction under section 16(ia)'), []);
  assert.deepEqual(amountsOnLine('2. Less: Allowances to the extent exempt under section 10'), []);
});

test('Not a Form 16', () => {
  const r = parseForm16(['Bank statement', 'Date Narration Debit Credit']);
  assert.equal(r.isForm16, false);
});

test('textLines joins pdf.js items into lines with gaps kept', () => {
  const lines = textLines([
    { text: 'Q1', x: 10, y: 100, w: 12, h: 8, page: 1 },
    { text: '1,000.00', x: 200, y: 100.5, w: 40, h: 8, page: 1 },
    { text: 'Total', x: 10, y: 120, w: 20, h: 8, page: 1 },
    { text: 'PART B', x: 10, y: 20, w: 30, h: 8, page: 2 },
  ]);
  assert.deepEqual(lines, ['Q1  1,000.00', 'Total', 'PART B']);
});

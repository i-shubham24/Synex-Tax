import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeTdsStatement, type StatementInput } from './statementWriter.js';
import { parseEtdsStatement } from './etdsStatement.js';

const address = { line1: 'SCO 12', district: 'Amritsar', stateCode: '26', pin: '143001' };
const header = {
  fileCreated: '2027-01-20', fileSequence: 1, preparedWith: 'SynexTax', tan: 'AMRG04217D', deductorPan: 'AAJCG7392L',
  deductor: { name: 'Golden Gate Hardware Pvt Ltd', address, email: 'accounts@goldengate.example', phone: '9814012345', type: 'K' },
  responsible: { name: 'Harpreet Kaur', designation: 'Director', pan: 'ABCPK1234L', address, email: 'hk@goldengate.example', phone: '9814012346' },
  taxYear: 2026, quarter: 3 as const, earlierRegularFiled: false,
};

const form144 = (): StatementInput => ({
  ...header,
  form: '144',
  challans: [{
    mode: 'C', bsrCode: '0510308', challanNo: '418', depositedOn: '2026-11-07', tax: 20800, interest: 0, fee: 0, others: 0, minorHead: '200',
    deductees: [{
      pan: 'AAACF1234X', name: 'Foreign Tech LLC', sectionCode: '1057', paidOn: '2026-10-20', amountPaid: 100000, taxDeducted: 20800, taxDeposited: 20800,
      deductedOn: '2026-10-20', ratePercent: 20.8, statusCode: '1', optingOut: false, remittanceNature: '21', countryCode: '267', grossedUp: false, rateBasis: 'A',
    }],
  }],
});

const form143 = (): StatementInput => ({
  ...header,
  form: '143',
  challans: [{
    mode: 'C', bsrCode: '0510308', challanNo: '419', depositedOn: '2026-11-07', tax: 1000, interest: 0, fee: 0, others: 0, minorHead: '200',
    deductees: [{
      pan: 'ABCPS1234K', name: 'Scrap Buyer', sectionCode: '1073', paidOn: '2026-10-12', amountPaid: 100000, taxDeducted: 1000, taxDeposited: 1000,
      deductedOn: '2026-10-12', ratePercent: 1, statusCode: '2', nonResident: false, optingOut: false,
    }],
  }],
});

test('Form 144: writes the non-resident fields in their places and reads back', () => {
  const { text, issues } = writeTdsStatement(form144());
  assert.deepEqual(issues, []);
  const dd = text.split('\r\n')[3].split('^');
  assert.equal(dd.length, 45);
  assert.deepEqual([dd[11], dd[13], dd[15], dd[16], dd[20], dd[29]], ['1', 'N', '21', '267', 'N', 'A']);
  assert.equal(text.split('\r\n')[1].split('^')[4], '144');
  const s = parseEtdsStatement(text);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  assert.equal(s.deductees[0].sectionKnown, true);
});

test('Form 144: Annexure 9, Annexure 10 and the no-PAN lower-rate rule', () => {
  const msgs = (mut: (i: StatementInput) => void) => {
    const i = form144();
    mut(i);
    return writeTdsStatement(i).issues.map((x) => x.message).join(' | ');
  };
  assert.match(msgs((i) => (i.challans[0].deductees[0].remittanceNature = '71')), /nature of remittance from Annexure 9/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].sectionCode = '1047')), /takes no nature of remittance/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].countryCode = '113')), /non-residents/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].sectionCode = '1023')), /not in Annexure 2 of Form 144/);
  assert.match(
    msgs((i) => Object.assign(i.challans[0].deductees[0], { pan: 'PANNOTAVBL', ratePercent: 10, taxDeducted: 10000, taxDeposited: 10000 })),
    /country of residence/,
  );
});

test('Form 143 (TCS): collectee fields, equal collected and deposited, flag F rule', () => {
  const { text, issues } = writeTdsStatement(form143());
  assert.deepEqual(issues, []);
  assert.equal(text.split('\r\n')[0].split('^')[2], 'TC1', 'Form 143 files are file type TC1');
  const dd = text.split('\r\n')[3].split('^');
  assert.deepEqual([dd[10], dd[11], dd[12], dd[13], dd[14]], ['N', '2', '', 'N', '1073']);
  const s = parseEtdsStatement(text);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  const msgs = (mut: (i: StatementInput) => void) => {
    const i = form143();
    mut(i);
    return writeTdsStatement(i).issues.map((x) => x.message).join(' | ');
  };
  assert.match(msgs((i) => (i.challans[0].deductees[0].taxDeposited = 900)), /must equal tax deposited/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].reasonFlag = 'F')), /cannot be used with code 1073/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].liableToTds3945 = true)), /only with reason flag F/);
});

test('Form 144 and 143 extras read back from the file', () => {
  const s = parseEtdsStatement(writeTdsStatement(form144()).text);
  assert.deepEqual(
    [s.deductees[0].statusCode, s.deductees[0].remittanceNature, s.deductees[0].countryCode, s.deductees[0].rateBasis],
    ['1', '21', '267', 'A'],
  );
  const t = parseEtdsStatement(writeTdsStatement(form143()).text);
  assert.deepEqual([t.deductees[0].statusCode, t.deductees[0].nonResident], ['2', false]);
});

// Protean's published Form 138 Q1 sample (tinpan.proteantech.in/downloads/e-tds/138RQ1.txt).
const PROTEAN_138_SAMPLE = [
  '1^FH^SL1^R^06052026^1^D^BLRF02329F^1^Protean RPU 1.0^^^^^^^^',
  '2^BH^1^1^138^^^^^^^^BLRF02329F^^BRNPA7678H^202627^202526^Q1^FAMILY DEVELOPMENT SERVICES^INDIA^9I^^^^^28^567898^ABCDD@TESTT.COM^56789^8765789777^^S^ABCD^CA^9I^^^^^28^567898^BACD@TETSTT.COM^^67897^8768987887^^24100.00^^0^^^N^^18^^^^^BRNPA7678Y^^^^^^^^^1091650^^^^',
  '3^CD^1^1^2^N^^22000.00^1000.00^1000.00^100.00^24100.00^B^^2000090^^^^30042025^^4000.00^4000.00^^^^^^^^',
  '4^DD^1^1^1^O^^BRNPA7789J^ABCD^^^^^^1001^^^^06052025^2100.00^^^^2000.00^2000.00^^06052025^^09052025^^^A^767890987657898^^^^^^^^^^^^',
  '5^DD^1^2^1^O^^BRNPA3344H^EFGH^^^^^^1003^^^^06052025^2100.00^^^^2000.00^2000.00^^06052025^^09052025^^^^767890987657890^^^^^^^^^^^^',
].join('\r\n') + '\r\n';

const form138 = (): StatementInput => ({
  ...header,
  form: '138',
  quarter: 2,
  challans: [{
    mode: 'C', bsrCode: '0510308', challanNo: '611', depositedOn: '2026-09-07', tax: 15000, interest: 0, fee: 0, others: 0, minorHead: '200',
    deductees: [
      { pan: 'ABCPK1234L', name: 'Harpreet Kaur', sectionCode: '1002', paidOn: '2026-08-31', amountPaid: 120000, taxDeducted: 12000, taxDeposited: 12000, deductedOn: '2026-08-31', ratePercent: 0 },
      { pan: 'PANNOTAVBL', name: 'New Joinee', sectionCode: '1002', paidOn: '2026-08-31', amountPaid: 15000, taxDeducted: 3000, taxDeposited: 3000, deductedOn: '2026-08-31', ratePercent: 0, reasonFlag: 'C' },
    ],
  }],
});

test("Form 138: Protean's sample reads with no errors", () => {
  const s = parseEtdsStatement(PROTEAN_138_SAMPLE);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  assert.equal(s.form, '138');
  assert.deepEqual(s.deductees.map((d) => [d.sectionCode, d.sectionKnown, d.taxDeposited, d.rate]), [['1001', true, '2000.00', ''], ['1003', true, '2000.00', '']]);
});

test('Form 138: salary rows are written with SL1, no rate and the deposit date, and read back', () => {
  const { text, issues } = writeTdsStatement(form138());
  assert.deepEqual(issues, []);
  const lines = text.split('\r\n');
  assert.equal(lines[0].split('^')[2], 'SL1');
  assert.equal(lines[1].split('^')[4], '138');
  const dd = lines[3].split('^');
  assert.equal(dd.length, 45);
  assert.deepEqual([dd[14], dd[17], dd[27], dd[28]], ['1002', 'Y', '', '07092026']);
  const s = parseEtdsStatement(text);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  assert.equal(s.deductees.length, 2);
});

test('Form 138: Annexure 2 and 6 rules, deducted equals deposited, and no Q4 until Protean publishes it', () => {
  const msgs = (change: (i: StatementInput) => void) => {
    const i = form138();
    change(i);
    return writeTdsStatement(i).issues.map((x) => x.message).join(' | ');
  };
  assert.match(msgs((i) => (i.challans[0].deductees[0].sectionCode = '1027')), /not in Annexure 2 of Form 138/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].taxDeposited = 11000)), /deducted must equal tax deposited/);
  assert.match(msgs((i) => (i.challans[0].deductees[1].taxDeducted = i.challans[0].deductees[1].taxDeposited = 2000)), /at least 20% of the amount paid/);
  assert.match(msgs((i) => (i.challans[0].deductees[1].reasonFlag = 'A')), /needs the employee's PAN/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].reasonFlag = 'B')), /not allowed in Form 138/);
  assert.match(msgs((i) => { i.quarter = 4; }), /Q4 file format/);
});

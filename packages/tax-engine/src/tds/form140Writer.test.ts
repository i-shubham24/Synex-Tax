import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeForm140, type Form140Input } from './form140Writer.js';
import { parseEtdsStatement } from './etdsStatement.js';
import { proteanStateCode } from './form140Annexures.js';

const address = { line1: 'SCO 12', line3: 'Lawrence Road', district: 'Amritsar', stateCode: '26', pin: '143001' };
const base = (): Form140Input => ({
  fileCreated: '2027-01-20',
  fileSequence: 1,
  preparedWith: 'SynexTax',
  tan: 'AMRG04217D',
  deductorPan: 'AAJCG7392L',
  deductor: { name: 'Golden Gate Hardware Pvt Ltd', address, email: 'accounts@goldengate.example', phone: '9814012345', type: 'K' },
  responsible: { name: 'Harpreet Kaur', designation: 'Director', pan: 'ABCPK1234L', address, email: 'hk@goldengate.example', phone: '9814012346' },
  taxYear: 2026,
  quarter: 3,
  earlierRegularFiled: false,
  challans: [
    {
      mode: 'C', bsrCode: '0510308', challanNo: '417', depositedOn: '2026-11-07', tax: 13700, interest: 0, fee: 0, others: 0, minorHead: '200',
      deductees: [
        { pan: 'BQRPS4410K', name: 'Sukhwinder Singh', sectionCode: '1023', paidOn: '2026-10-13', amountPaid: 150000, taxDeducted: 1500, taxDeposited: 1500, deductedOn: '2026-10-13', ratePercent: 1 },
        { pan: 'PANNOTAVBL', name: 'Labour contractor', sectionCode: '1023', paidOn: '2026-10-16', amountPaid: 40000, taxDeducted: 8000, taxDeposited: 8000, deductedOn: '2026-10-16', ratePercent: 20, reasonFlag: 'C' },
        { pan: 'ACMPK8812B', name: 'Kiran Mehta', sectionCode: '1027', paidOn: '2026-10-22', amountPaid: 42000, taxDeducted: 4200, taxDeposited: 4200, deductedOn: '2026-10-22', ratePercent: 10 },
      ],
    },
  ],
});

test('a valid statement writes with no issues and reads back exactly', () => {
  const { text, issues } = writeForm140(base());
  assert.deepEqual(issues, []);
  const s = parseEtdsStatement(text);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  assert.equal(s.form, '140');
  assert.equal(s.tan, 'AMRG04217D');
  assert.equal(s.taxYear, 2026);
  assert.equal(s.quarter, 3);
  assert.equal(s.challans[0].totalDeposit, '13700.00');
  assert.deepEqual(s.deductees.map((d) => [d.pan, d.sectionCode, d.taxDeducted, d.rate]), [
    ['BQRPS4410K', '1023', '1500.00', '1.0000'],
    ['PANNOTAVBL', '1023', '8000.00', '20.0000'],
    ['ACMPK8812B', '1027', '4200.00', '10.0000'],
  ]);
});

test('records follow the layout: field counts, CRLF, header values in their places', () => {
  const { text } = writeForm140(base());
  assert.ok(text.endsWith('\r\n'));
  const lines = text.trimEnd().split('\r\n').map((l) => l.split('^'));
  assert.deepEqual(lines.map((l) => [l[0], l[1], l.length]), [['1', 'FH', 18], ['2', 'BH', 72], ['3', 'CD', 30], ['4', 'DD', 45], ['5', 'DD', 45], ['6', 'DD', 45]]);
  const bh = lines[1];
  assert.equal(bh[15], '202728'); // assessment year
  assert.equal(bh[16], '202627'); // tax year
  assert.equal(bh[25], '26'); // Punjab in Protean codes
  assert.equal(bh[46], '13700.00'); // batch total of challan deposits
  assert.equal(bh[51], 'N');
  const cd = lines[2];
  assert.deepEqual([cd[20], cd[21], cd[22], cd[23], cd[24]], ['13700.00', '13700.00', '200', '0.00', '0.00']);
  assert.equal(lines[3][17], 'Y'); // deducted amount deposited
  assert.equal(lines[4][31], 'C'); // higher rate for no PAN
});

test('rules from the file format are enforced', () => {
  const msgs = (mut: (i: Form140Input) => void) => {
    const i = base();
    mut(i);
    return writeForm140(i).issues.map((x) => x.message).join(' | ');
  };
  assert.match(msgs((i) => (i.deductor.email = 'not-an-email')), /valid email/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].paidOn = '2026-09-30')), /within Q3/);
  assert.match(msgs((i) => (i.challans[0].deductees[2].reasonFlag = 'T')), /cannot be used with code 1027/);
  assert.match(msgs((i) => (i.challans[0].deductees[0].reasonFlag = 'A')), /certificate number/);
  assert.match(msgs((i) => (i.challans[0].tax = 13000)), /less than the tax deposited/);
  assert.match(msgs((i) => (i.challans[0].tax = 13700.5)), /whole rupees/);
  assert.match(msgs((i) => (i.deductor.type = 'A')), /Government deductors/);
  assert.match(msgs((i) => (i.earlierRegularFiled = true)), /15-digit token/);
  assert.match(msgs((i) => (i.taxYear = 2025)), /Form 26Q/);
});

test('delimiters and line breaks in names cannot break the file', () => {
  const i = base();
  i.challans[0].deductees[0].name = 'Bad^Name\r\nInjected';
  const { text } = writeForm140(i);
  const dd = text.split('\r\n')[3].split('^');
  assert.equal(dd.length, 45);
  assert.equal(dd[8], 'Bad Name Injected');
});

test('Protean state codes are not GST codes', () => {
  assert.equal(proteanStateCode('Punjab'), '26');
  assert.equal(proteanStateCode('Orissa'), '24');
  assert.equal(proteanStateCode('Atlantis'), undefined);
});

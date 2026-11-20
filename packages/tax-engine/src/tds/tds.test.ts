import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORM_140_SECTION_CODES, form140Section } from './form140Codes.js';
import { parseEtdsStatement, payeesFromStatements } from './etdsStatement.js';
import { tdsHealth } from './health.js';

// Protean's published sample statement for Form 140 (tinpan.proteantech.in/downloads/e-tds/140RQ1.txt).
const PROTEAN_SAMPLE = [
  '1^FH^NS1^R^06052026^1^D^BLRF02329F^1^Protean RPU 1.0^^^^^^^^',
  '2^BH^1^1^140^^^^^^^^BLRF02329F^^BRNPA6677G^202728^202627^Q1^FAMILY DEVELOPMENT SERVICES^INDIA^7U^^^^^19^789098^ABCD@TEST.COM^56789^6789087657^^S^BHAGYASHREE^CEO^7U^^^^^19^789098^ABCD@TESTYOUP.COM^^56789^0987678909^^11200.00^^^^^N^^04^^^^^BRNPA8898H^^^^^^^^^1060872^^^^',
  '3^CD^1^1^1^N^^10000.00^1000.00^100.00^100.00^11200.00^B^^3000012^^^^30042026^^900.00^900.00^^^^^^^^',
  '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^E^^^^^^^^^^^^^',
].join('\r\n') + '\r\n';

test('section code registry is the published Form 140 list', () => {
  assert.equal(FORM_140_SECTION_CODES.length, 40);
  assert.equal(form140Section('1027')?.section, '393(1) [Table: Sl. No. 6(iii).D(b)]');
  assert.equal(form140Section('9999'), undefined);
});

test("Protean's Form 140 sample parses with no errors", () => {
  const s = parseEtdsStatement(PROTEAN_SAMPLE);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  assert.equal(s.form, '140');
  assert.equal(s.tan, 'BLRF02329F');
  assert.equal(s.deductorPan, 'BRNPA6677G');
  assert.equal(s.taxYear, 2026);
  assert.equal(s.quarter, 1);
  assert.equal(s.deductorName, 'FAMILY DEVELOPMENT SERVICES');
  assert.equal(s.challans.length, 1);
  assert.deepEqual(
    { mode: s.challans[0].mode, bsr: s.challans[0].bsrCode, date: s.challans[0].depositDate, total: s.challans[0].totalDeposit, tax: s.challans[0].totalTax },
    { mode: 'BOOK_ADJUSTMENT', bsr: '3000012', date: '2026-04-30', total: '11200.00', tax: '10000.00' },
  );
  const d = s.deductees[0];
  assert.deepEqual(
    { pan: d.pan, name: d.name, section: d.sectionCode, known: d.sectionKnown, paid: d.amountPaid, ded: d.taxDeducted, dep: d.taxDeposited, on: d.paymentDate, rate: d.rate },
    { pan: 'BRNPA6778G', name: 'ABCD', section: '1008', known: true, paid: '1000.00', ded: '900.00', dep: '900.00', on: '2026-05-02', rate: '03.0000' },
  );
});

test('1961 Act statements and corrections are refused, not guessed', () => {
  const as26q = PROTEAN_SAMPLE.replace('^140^', '^26Q^');
  assert.match(parseEtdsStatement(as26q).issues.map((i) => i.message).join(' '), /Only Form 140/);
  const correction = PROTEAN_SAMPLE.replace('^NS1^R^', '^NS1^C^');
  assert.match(parseEtdsStatement(correction).issues.map((i) => i.message).join(' '), /regular statements/);
});

test('a record with the wrong number of fields is an error with its line', () => {
  const broken = PROTEAN_SAMPLE.replace('^1008^', '^1008^^');
  const issue = parseEtdsStatement(broken).issues.find((i) => i.level === 'error');
  assert.equal(issue?.line, 4);
  assert.match(issue!.message, /46 fields/);
});

test('payee master merges a PAN across statements', () => {
  const s = parseEtdsStatement(PROTEAN_SAMPLE);
  const payees = payeesFromStatements([s, s]);
  assert.equal(payees.length, 1);
  assert.equal(payees[0].payments, 2);
  assert.equal(payees[0].amountPaid, '2000.00');
});

test('TDS health: challan balances, late deposit interest, late fees, PAN issues, corrections closing', () => {
  const r = tdsHealth({
    today: '2027-02-20',
    challans: [
      { id: 'c1', label: 'C1', depositDate: '2026-11-07', taxDeposited: '1000.00' },
      { id: 'c2', label: 'C2', depositDate: '2026-12-20', taxDeposited: '500.00' },
    ],
    deductees: [
      { id: 'd1', challanId: 'c1', pan: 'ABCPK1234L', name: 'On time', taxDeducted: '800', taxDeposited: '800', deductionDate: '2026-10-15' },
      { id: 'd2', challanId: 'c2', pan: 'PANNOTAVBL', name: 'Late payer', taxDeducted: '600', taxDeposited: '600', deductionDate: '2026-11-10' },
    ],
    returns: [
      { id: 'r1', label: 'Form 140 Q3', dueDate: '2027-01-31', status: 'DRAFT', totalTax: '1400' },
      { id: 'r2', label: 'Form 140 Q1 TY 2024-25', dueDate: '2024-07-31', status: 'FILED', filedOn: '2024-07-30', totalTax: '100', correctionWindowEndsOn: '2027-03-31' },
    ],
  });
  assert.deepEqual(r.challans.map((c) => [c.state, c.balance]), [['UNCONSUMED', '200.00'], ['OVER_CONSUMED', '-100.00']]);
  // Deducted 10 Nov, due 7 Dec, paid 20 Dec: Nov and Dec at 1.5% on 600.
  assert.equal(r.lateDeposits.length, 1);
  assert.equal(r.lateDeposits[0].interest, '18.00');
  // Due 31 Jan, not filed by 20 Feb: 20 days at Rs 200, capped at Rs 1,400.
  assert.deepEqual(r.lateFees.map((f) => [f.daysLate, f.fee]), [[20, '1400.00']]);
  assert.equal(r.panIssues.length, 1);
  assert.deepEqual(r.correctionsClosing.map((c) => c.daysLeft), [39]);
  assert.deepEqual(r.totals, { unconsumed: '200.00', overConsumed: '100.00', interest: '18.00', lateFees: '1400.00' });
});

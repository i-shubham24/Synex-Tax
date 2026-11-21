import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEtdsStatement, payeesFromStatements } from './etdsStatement.js';

// Protean's published 1961 Act sample statements (tinpan.proteantech.in/downloads/e-tds, "Sample file for Form No. ...").
const join = (lines: string[]) => lines.join('\r\n') + '\r\n';

const SAMPLE_26Q = join([
  '1^FH^NS1^R^11062020^1^D^MUMN77777A^1^NSDL RPU 3.2^^^^^^^^',
  '2^BH^1^1^26Q^^^^^^^^MUMN77777A^^BHSFB5213G^200809^200708^Q2^ABC^IT^45^BHVAN^N M MARG^BANDRA^MUMBAI^19^425006^KIRAN@GMAIL.COM^022^7456859^N^F^KIRAN^AM^45^BHVAN^N M MARG^BANDRA^MUMBAI^19^425006^KIRAN@GMAIL.COM^^022^7485963^N^1000.00^^^^N^N^^^^^^^VGSPL8523K^^^^^^^^^^^^^',
  '3^CD^1^1^1^N^^^^^^00015^^^^0000096^^05082007^^^194^1000.00^0.00^0.00^0.00^0.00^1000.00^^100.00^100.00^0.00^0.00^100.00^0.00^0.00^00001^N^^^^',
  '4^DD^1^1^1^O^^2^^NJSPL8523K^^^HIMANI^100.00^0.00^0.00^100.00^^100.00^^^1000.00^05082007^15082007^^10.0000^^N^^^^^^^^^^^^^^^^^^^^^^^^^^',
]);

const SAMPLE_27Q = join([
  '1^FH^NS1^R^02012015^1^D^MUMN77777A^1^NSDLRPU3.1^^^^^^^^',
  '2^BH^1^1^27Q^^^^^^^^MUMN77777A^^AAAAA1111A^200809^200708^Q1^ABC^123^ABC APT^S V ROAD^KAMALA MILL COMPOUND^MUMBAI^^19^400013^ABC@GMAIL.COM^022^2504650604^N^K^VINAY RAO^MANAGER^123^ABC APT^S V ROAD^KAMALA MILL COMPOUND^MUMBAI^19^400013^ABC@YAHOO.COM^^022^6504504564^N^4080.00^^^^N^N^^^^^^^AAAPA1111A^^^^^^^^^^^^^',
  '3^CD^1^1^2^N^^^^^^12345^^^^6545646^^01052007^^^96A^4000.00^0.00^80.00^0.00^0.00^4080.00^^4080.00^4000.00^0.00^80.00^4080.00^0.00^0.00^123456^N^^^^',
  '4^DD^1^1^1^O^^2^^PANAPPLIED^^^ABC^2000.00^0.00^40.00^2040.00^^2040.00^^^10000.00^30042007^30042007^^20.0000^N^N^^^^^^^^^^^^^^^^^^^^^^^^^^',
  '5^DD^1^1^2^O^^2^^AAAPA1234A^^^GURU THAKUR^2000.00^0.00^40.00^2040.00^^2040.00^^^10000.00^30042007^30042007^^20.0000^N^N^^^^^^^^^^^^^^^^^^^^^^^^^^',
]);

const SAMPLE_27EQ = join([
  '1^FH^TC1^R^02012015^1^D^MUMN77777A^1^NSDLRPU3.1^^^^^^^^',
  '2^BH^1^1^27EQ^^^^^^^^MUMN77777A^^AAAAA1111A^200809^200708^Q1^ABC^123^SAURABH APT^S V ROAD^KAMALA MILLS COMPOUND^MUMBAI^^19^400013^ABC@YAHOO.COM^022^0564065406^N^K^AJAY ALWE^MANAGER^123^SAURABH APT^S V ROAD^KAMALA MILLS COMPOUND^MUMBAI^19^400013^XYZ@GMAIL.COM^^022^0546045604^N^4080.00^^^^N^N^^^^^^^AAAPA1111A^^^^^^^^^^^^^',
  '3^CD^1^1^2^N^^^^^^12345^^^^4564645^^01052007^^^A^4000.00^0.00^80.00^0.00^0.00^4080.00^^4080.00^4000.00^0.00^80.00^4080.00^0.00^0.00^123456^N^^^^',
  '4^DD^1^1^1^O^^2^^AAAPA1234A^^^GURU THAKUR^2000.00^0.00^40.00^2040.00^^2040.00^^10000.00^10000.00^30042007^30042007^^20.0000^^N^^^^^^^^^^^^^^^^^^^^^^^^^^',
  '5^DD^1^1^2^O^^2^^AAAPA1234A^^^GURU THAKUR^2000.00^0.00^40.00^2040.00^^2040.00^^10000.00^10000.00^30042007^30042007^^20.0000^^N^^^^^^^^^^^^^^^^^^^^^^^^^^',
]);

const SAMPLE_24Q_Q4 = join([
  '1^FH^SL1^R^15032021^1^D^AGRF10161E^1^NSDL RPU 3.6^^^^^^^^',
  '2^BH^1^1^24Q^^^^^^^^AGRF10161E^^AAAPA1234A^200910^200809^Q4^FINANCE & ACCOUNTS DEPARTMENT ALIGARH MUSLIM UNIVERSITY ALIGARH^IT^74^HARSHADA APT^GANDHI ROAD^DANTEWADI^JAIPUR^27^745002^ABC@GMAIL.COM^0294^8456322^N^P^NEE SIRITHAAI ILLAI POOKALUKKU VAGUPEDUHAAI^MANAGER^74^HARSHADA APT^GANDHI ROAD^DANTEWADI^JAIPUR^27^745002^ABC@GMAIL.COM^^0294^8456322^N^500.00^^1^50980.00^N^N^^^^^^^AAAPA1234A^^^^^^^^^^^^^',
  '3^CD^1^1^2^N^^^^^^00969^^^^0000199^^01042008^^^92A^500.00^0.00^0.00^0.00^0.00^500.00^^150.00^150.00^0.00^0.00^150.00^0.00^0.00^00078^N^^^^',
  '4^DD^1^1^1^O^1^^^AAAPA1234A^^^ABC^100.00^0.00^0.00^100.00^^100.00^^^1000.00^01012009^01012009^01042008^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
  '5^DD^1^1^2^O^2^^^AAAPA1234A^^^ABC^50.00^0.00^0.00^50.00^^50.00^^^500.00^01012009^01012009^01042008^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
  '6^SD^1^1^A^^AAAPA1234A^^ABC^W^10102005^10012007^50000.00^^2^20.00^49980.00^1000.00^50980.00^^2^200.00^50780.00^100.00^0.00^0.00^0.00^100.00^1000.00^-900.00^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
  '7^S16^1^1^1^16(ii)^10.00^',
  '8^C6A^1^1^1^80CCE^100.00^^^',
]);

const errors = (t: string) => parseEtdsStatement(t).issues.filter((i) => i.level === 'error');

test('26Q: 1961 layout, tax as income tax plus surcharge plus cess, section from the challan', () => {
  const s = parseEtdsStatement(SAMPLE_26Q);
  assert.deepEqual(errors(SAMPLE_26Q), []);
  assert.equal(s.form, '26Q');
  assert.equal(s.regime, 'IT_ACT_1961');
  assert.equal(s.taxYear, 2007);
  assert.equal(s.quarter, 2);
  assert.deepEqual(
    { bsr: s.challans[0].bsrCode, no: s.challans[0].challanNo, date: s.challans[0].depositDate, tax: s.challans[0].totalTax, total: s.challans[0].totalDeposit, mode: s.challans[0].mode },
    { bsr: '0000096', no: '00015', date: '2007-08-05', tax: '1000.00', total: '1000.00', mode: 'CHALLAN' },
  );
  const d = s.deductees[0];
  assert.deepEqual(
    [d.challanRecordNo, d.recordNo, d.pan, d.name, d.sectionCode, d.sectionKnown, d.amountPaid, d.taxDeducted, d.taxDeposited, d.paymentDate, d.deductionDate, d.rate],
    [1, 1, 'NJSPL8523K', 'HIMANI', '194', true, '1000.00', '100.00', '100.00', '2007-08-05', '2007-08-15', '10.0000'],
  );
});

test('27Q and 27EQ: non-resident and collectee rows read, TC1 file type accepted', () => {
  const q = parseEtdsStatement(SAMPLE_27Q);
  assert.deepEqual(errors(SAMPLE_27Q), []);
  assert.deepEqual(q.deductees.map((d) => [d.pan, d.sectionCode, d.taxDeducted]), [['PANAPPLIED', '96A', '2040.00'], ['AAAPA1234A', '96A', '2040.00']]);
  assert.equal(q.challans[0].totalTax, '4080.00', 'income tax 4000 + cess 80');
  const eq = parseEtdsStatement(SAMPLE_27EQ);
  assert.deepEqual(errors(SAMPLE_27EQ), []);
  assert.equal(eq.issues.filter((i) => /file type/i.test(i.message)).length, 0);
  assert.deepEqual(eq.deductees.map((d) => [d.sectionCode, d.sectionKnown, d.amountPaid]), [['A', true, '10000.00'], ['A', true, '10000.00']]);
});

test('24Q Q4: deductee rows read, salary detail records skipped with one warning', () => {
  const s = parseEtdsStatement(SAMPLE_24Q_Q4);
  assert.deepEqual(errors(SAMPLE_24Q_Q4), []);
  assert.equal(s.deductees.length, 2);
  assert.deepEqual(s.deductees.map((d) => [d.sectionCode, d.taxDeposited, d.deductionDate]), [['92A', '100.00', '2009-01-01'], ['92A', '50.00', '2009-01-01']]);
  const warnings = s.issues.filter((i) => i.level === 'warning').map((i) => i.message);
  assert.equal(warnings.filter((m) => /salary details/.test(m)).length, 1);
  assert.equal(payeesFromStatements([s])[0].taxDeducted, '150.00');
});

test('a 1961 form for a 2026-27 period is refused', () => {
  const late = SAMPLE_26Q.replace('^200809^200708^', '^202728^202627^');
  assert.match(errors(late).map((i) => i.message).join(' '), /covers periods up to March 2026/);
});

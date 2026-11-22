import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConsoFile, writeCorrection, correctionTypesNeeded } from './correction.js';

// Built from Protean's Form 140 sample statement (140RQ1.txt), with the regular statement's token
// in the batch header as a consolidated file would carry it, and a second payee added.
const TOKEN = '123456789012345';
const CONSO = [
  '1^FH^NS1^R^06052026^1^D^BLRF02329F^1^Protean RPU 1.0^^^^^^^^',
  `2^BH^1^1^140^^^${TOKEN}^${TOKEN}^^^^BLRF02329F^^BRNPA6677G^202728^202627^Q1^FAMILY DEVELOPMENT SERVICES^INDIA^7U^^^^^19^789098^ABCD@TEST.COM^56789^6789087657^^S^BHAGYASHREE^CEO^7U^^^^^19^789098^ABCD@TESTYOUP.COM^^56789^0987678909^^11200.00^^^^^N^^04^^^^^BRNPA8898H^^^^^^^^^1060872^^^^`,
  '3^CD^1^1^2^N^^10000.00^1000.00^100.00^100.00^11200.00^B^^3000012^^00123^^30042026^^1900.00^1900.00^200^1000.00^100.00^^^^^',
  '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^E^^^^^^^^^^^^^',
  '5^DD^1^2^1^O^^PANNOTAVBL^WXYZ^^^^^^1027^^^Y^10052026^5000.00^^^^1000.00^1000.00^^10052026^20.0000^^^^C^^^^^^^^^^^^^',
].join('\r\n');

const fields = (text: string) => text.trim().split('\r\n').map((l) => l.split('^'));
const opts = { fileCreated: '2026-11-21', preparedWith: 'SynexTax' };

test('reads the consolidated file', () => {
  const c = parseConsoFile(CONSO);
  assert.deepEqual([c.form, c.tan, c.taxYear, c.quarter, c.originalToken, c.previousToken], ['140', 'BLRF02329F', 2026, 1, TOKEN, TOKEN]);
  assert.equal(c.challans.length, 1);
  assert.deepEqual(c.challans[0].deductees.map((d) => [d.recordNo, d.pan, d.deducted, d.paidOn]), [[1, 'BRNPA6778G', '900.00', '2026-05-02'], [2, 'PANNOTAVBL', '1000.00', '2026-05-10']]);
  assert.deepEqual([c.challans[0].bsr, c.challans[0].challanNo, c.challans[0].date, c.challans[0].total], ['3000012', '00123', '2026-04-30', '11200.00']);
  assert.deepEqual(c.issues, []);
});

test('C5: a PAN changed from one valid PAN to another', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H' }] }, opts);
  assert.deepEqual(out.issues, []);
  assert.equal(out.type, 'C5');
  const [fh, bh, cd, dd] = fields(out.text);
  assert.deepEqual([fh.length, bh.length, cd.length, dd.length], [18, 72, 30, 45]);
  assert.deepEqual([fh[2], fh[3]], ['NS1', 'C']);
  assert.deepEqual([bh[5], bh[6], bh[7], bh[8], bh[11], bh[12], bh[46]], ['C5', '', TOKEN, TOKEN, 'BLRF02329F', '', '']);
  assert.deepEqual([cd[3], cd[4], cd[6], cd[13], cd[15], cd[17], cd[19], cd[7]], ['1', '1', '', '3000012', '00123', '30042026', '11200.00', '']);
  assert.deepEqual([dd[3], dd[4], dd[5], dd[6], dd[7], dd[8], dd[25], dd[41]], ['1', '1', '', '', 'BRNPA6779H', '', '900.00', '900.00']);
});

test('C3: tax on a row raised, and a placeholder PAN replaced', () => {
  const c = parseConsoFile(CONSO);
  const edits = { deductees: [{ challanNo: 1, recordNo: 1, deducted: '1000', deposited: '1000' }, { challanNo: 1, recordNo: 2, pan: 'ABCPE1234F' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C3']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  const [, bh, cd, d1, d2] = fields(out.text);
  assert.deepEqual([bh[5], bh[6], bh[12], bh[46]], ['C3', '0', 'BLRF02329F', '11200.00']);
  // Challan not changed: indicator 0, current values repeat the last ones, deltas cover the rows.
  assert.deepEqual([cd[4], cd[6], cd[7], cd[11], cd[13], cd[14], cd[15], cd[16], cd[20], cd[21]], ['2', '0', '', '11200.00', '3000012', '3000012', '00123', '00123', '100.00', '100.00']);
  assert.deepEqual([d1[5], d1[6], d1[7], d1[23], d1[24], d1[25], d1[41], d1[27]], ['U', 'BRNPA6778G', 'BRNPA6778G', '1000.00', '1000.00', '900.00', '900.00', '3.0000']);
  assert.deepEqual([d2[5], d2[6], d2[7], d2[31]], ['U', 'PANNOTAVBL', 'ABCPE1234F', 'C']);
});

test('C3 chosen for a challan change: an unchanged row is carried', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { challans: [{ recordNo: 1, interest: '1500', date: '2026-04-29' }] }, { ...opts, type: 'C3' });
  assert.deepEqual(out.issues, []);
  assert.deepEqual(out.pending, [], 'the challan change is covered, so no C2 is left');
  const [, bh, cd, dd] = fields(out.text);
  assert.deepEqual([cd[6], cd[7], cd[8], cd[11], cd[17], cd[18], cd[22], cd[23], cd[24]], ['1', '10000.00', '1500.00', '11700.00', '30042026', '29042026', '200', '1500.00', '100.00']);
  assert.equal(bh[46], '11700.00');
  assert.deepEqual([dd[5], dd[3], dd[23], dd[25]], ['U', '1', '900.00', '900.00']);
});

test('C2: challan details alone, with the last values and no payee rows', () => {
  const c = parseConsoFile(CONSO);
  const edits = { challans: [{ recordNo: 1, bsr: '3000013', challanNo: '124', date: '2026-04-29', interest: '1500' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C2']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  assert.equal(out.type, 'C2');
  const recs = fields(out.text);
  assert.equal(recs.length, 3, 'FH, BH and one CD; no DD');
  const [, bh, cd] = recs;
  assert.deepEqual([bh[3], bh[5], bh[6], bh[11], bh[12], bh[46], bh[58]], ['1', 'C2', '', 'BLRF02329F', 'BLRF02329F', '11700.00', 'BRNPA8898H']);
  assert.equal(cd.length, 30);
  assert.deepEqual(
    [cd[3], cd[4], cd[6], cd[7], cd[8], cd[11], cd[12], cd[13], cd[14], cd[15], cd[16], cd[17], cd[18], cd[19], cd[20], cd[21], cd[22]],
    ['1', '0', '1', '10000.00', '1500.00', '11700.00', 'B', '3000012', '3000013', '00123', '124', '30042026', '29042026', '11200.00', '', '', '200'],
  );
});

test('C2: an edit that changes nothing is ignored, and tax cannot fall below what the payees claim', () => {
  const c = parseConsoFile(CONSO);
  assert.deepEqual(correctionTypesNeeded(c, { challans: [{ recordNo: 1, tax: '10000.00', bsr: '3000012' }] }), []);
  // Mode C: the challan tax must cover the 1,900 deposited for its two rows.
  const bank = parseConsoFile(CONSO.replace('^11200.00^B^', '^11200.00^C^'));
  const low = writeCorrection(bank, { challans: [{ recordNo: 1, tax: '1000' }] }, opts);
  assert.match(low.issues.map((i) => i.message).join(' '), /less than the tax deposited/);
  const frac = writeCorrection(c, { challans: [{ recordNo: 1, fee: '100.50' }] }, opts);
  assert.match(frac.issues.map((i) => i.message).join(' '), /whole rupees/);
});

test('a challan change goes with C3 when rows under it change too', () => {
  const c = parseConsoFile(CONSO);
  const edits = { challans: [{ recordNo: 1, interest: '1500' }], deductees: [{ challanNo: 1, recordNo: 1, name: 'ABCD LTD' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C3']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  const [, , cd, dd] = fields(out.text);
  assert.deepEqual([cd[4], cd[6], cd[8], cd[11], dd[8]], ['1', '1', '1500.00', '11700.00', 'ABCD LTD']);
});

test('C1: deductor and responsible person details', () => {
  const c = parseConsoFile(CONSO);
  assert.deepEqual(
    [c.deductor.name, c.deductor.type, c.deductor.address.stateCode, c.deductor.responsible.name, c.deductor.responsible.pan, c.deductor.government.stateCode],
    ['FAMILY DEVELOPMENT SERVICES', 'S', '19', 'BHAGYASHREE', 'BRNPA8898H', '04'],
  );
  const edits = { deductor: { name: 'Family Development Services Trust', address: { line1: 'Plot 7U', line2: 'Sector 4' }, email: 'accounts@fds.example', responsible: { name: 'Bhagyashree Rao', pan: 'brnpa8898h' } } };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C1']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  const recs = fields(out.text);
  assert.equal(recs.length, 2, 'FH and BH only');
  const [fh, bh] = recs;
  assert.deepEqual([fh[3], bh.length], ['C', 72]);
  assert.deepEqual([bh[3], bh[5], bh[6], bh[7], bh[8], bh[11], bh[12], bh[14], bh[46]], ['0', 'C1', '', TOKEN, TOKEN, 'BLRF02329F', 'BLRF02329F', 'BRNPA6677G', '']);
  assert.deepEqual([bh[18], bh[20], bh[21], bh[25], bh[27], bh[32], bh[58]], ['Family Development Services Trust', 'Plot 7U', 'Sector 4', '19', 'ACCOUNTS@FDS.EXAMPLE', 'Bhagyashree Rao', 'BRNPA8898H']);
  // Address changed flags (fields 31 and 46), and the last deductor type (field 53).
  assert.deepEqual([bh[30], bh[45], bh[52], bh[31], bh[53]], ['Y', 'N', 'S', 'S', '04']);
});

test('C1: rules for the changed fields and the deductor type', () => {
  const c = parseConsoFile(CONSO);
  const bad = writeCorrection(c, { deductor: { address: { pin: '12345', stateCode: '99' }, phone: '98765', responsible: { pan: 'ABC' } } }, opts);
  const msgs = bad.issues.map((i) => i.message).join(' ');
  assert.match(msgs, /PIN code must be 6 digits/);
  assert.match(msgs, /Protean state code/);
  assert.match(msgs, /10 digits/);
  assert.match(msgs, /valid PAN of the responsible person/);
  assert.equal(bad.text, '');
  // From State Government to a company: the state field no longer applies and is cleared.
  const company = writeCorrection(c, { deductor: { type: 'K' } }, opts);
  assert.deepEqual(company.issues, []);
  const [, bh] = fields(company.text);
  assert.deepEqual([bh[31], bh[52], bh[53]], ['K', 'S', '']);
  // To Central Government without a ministry.
  const central = writeCorrection(c, { deductor: { type: 'A' } }, opts);
  assert.match(central.issues.map((i) => i.message).join(' '), /ministry/);
  assert.equal(writeCorrection(c, { deductor: { name: 'family development services' } }, opts).type, null, 'a change of case alone is not a correction');
});

test('the order of the files when several types are needed', () => {
  const c = parseConsoFile(CONSO);
  const edits = {
    deductor: { email: 'new@fds.example' },
    challans: [{ recordNo: 1, fee: '200' }],
    deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H' }],
  };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C5', 'C1', 'C2']);
  const out = writeCorrection(c, edits, { ...opts, type: 'C1' });
  assert.deepEqual(out.issues, []);
  assert.deepEqual(out.pending, ['C5', 'C2']);
});

test('C3: adding a payee row to an existing challan', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { added: [{ challanNo: 1, pan: 'ABCPE1234F', name: 'New Payee', section: '1027', paidOn: '2026-06-01', amount: '1000', deducted: '100', deductedOn: '2026-06-01', rate: '10' }] }, opts);
  assert.deepEqual(out.issues, []);
  const [, , cd, dd] = fields(out.text);
  assert.deepEqual([cd[20], cd[21]], ['100.00', '100.00']);
  assert.deepEqual([dd[3], dd[5], dd[6], dd[7], dd[14], dd[27], dd[25]], ['3', 'A', '', 'ABCPE1234F', '1027', '10.0000', '']);
});

test('C9: a new challan numbered after the last one', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { newChallans: [{ bsr: '0510308', challanNo: '45', date: '2026-06-07', tax: '100', deductees: [{ pan: 'ABCPE1234F', name: 'New Payee', section: '1027', paidOn: '2026-06-01', amount: '1000', deducted: '100', deductedOn: '2026-06-01', rate: '10' }] }] }, opts);
  assert.deepEqual(out.issues, []);
  const [, bh, cd, dd] = fields(out.text);
  assert.deepEqual([bh[5], bh[6], bh[12], bh[46]], ['C9', '', 'BLRF02329F', '100.00']);
  assert.deepEqual([cd[3], cd[11], cd[12], cd[13], cd[14], cd[16], cd[18], cd[19], cd[22]], ['2', '100.00', 'C', '', '0510308', '45', '07062026', '', '200']);
  assert.deepEqual([dd[3], dd[4], dd[5]], ['3', '2', 'O']);
});

test('one type per file; rules the formats set are enforced', () => {
  const c = parseConsoFile(CONSO);
  const both = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H', deducted: '1000', deposited: '1000' }] }, opts);
  assert.deepEqual(both.pending, ['C3']);
  assert.match(both.issues.map((i) => i.message).join(' '), /PAN correction \(C5\) first/);
  const reasonC = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 2, deducted: '500', deposited: '500' }] }, opts);
  assert.match(reasonC.issues.map((i) => i.message).join(' '), /reason C/);
  assert.equal(reasonC.text, '');
  const none = writeCorrection(c, {}, opts);
  assert.equal(none.type, null);
  const badToken = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, name: 'ABCD LTD' }] }, { ...opts, previousToken: '12' });
  assert.match(badToken.issues[0].message, /15 digits/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConsoFile, writeCorrection, correctionTypesNeeded } from './correction.js';

// Built from Protean's Form 140 sample statement (140RQ1.txt), with the regular statement's token
// in the batch header as a consolidated file would carry it, and a second payee added.
const TOKEN = '123456789012345';
const TAN = 'BLRF02329F';
const CONSO = [
  '1^FH^NS1^R^06052026^1^D^BLRF02329F^1^Protean RPU 1.0^^^^^^^^',
  `2^BH^1^1^140^^^${TOKEN}^${TOKEN}^^^^BLRF02329F^^BRNPA6677G^202728^202627^Q1^FAMILY DEVELOPMENT SERVICES^INDIA^7U^^^^^19^789098^ABCD@TEST.COM^56789^6789087657^^S^BHAGYASHREE^CEO^7U^^^^^19^789098^ABCD@TESTYOUP.COM^^56789^0987678909^^11200.00^^^^^N^^04^^^^^BRNPA8898H^^^^^^^^^1060872^^^^`,
  '3^CD^1^1^2^N^^10000.00^1000.00^100.00^100.00^11200.00^B^^3000012^^00123^^30042026^^1900.00^1900.00^200^1000.00^100.00^^^^^',
  '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^E^^^^^^^^^^^^^',
  '5^DD^1^2^1^O^^PANNOTAVBL^WXYZ^^^^^^1027^^^Y^10052026^5000.00^^^^1000.00^1000.00^^10052026^20.0000^^^^C^^^^^^^^^^^^^',
].join('\r\n');

const fields = (text: string) => text.trim().split('\r\n').map((l) => l.split('^'));
const opts = { fileCreated: '2026-11-21', preparedWith: 'SynexTax' };
const COUNT = { FH: 18, BH: 72, CD: 30, DD: 45 } as const;

/** A record with the given 1-based fields filled and every other field blank. */
const rec = (type: keyof typeof COUNT, vals: Record<number, string>) => Array.from({ length: COUNT[type] }, (_, i) => vals[i + 1] ?? '').join('^');

/**
 * Field by field check against the spec: the record has the format's field count, the listed
 * fields carry exactly these values and every other field is blank.
 */
function expectRecord(f: string[], expected: Record<number, string>, label: string) {
  assert.equal(f.length, COUNT[f[1] as keyof typeof COUNT], `${label}: field count`);
  const filled = Object.fromEntries(f.map((v, i) => [i + 1, v] as const).filter(([, v]) => v !== ''));
  assert.deepEqual(filled, Object.fromEntries(Object.entries(expected).filter(([, v]) => v !== '')), label);
}

// FH fields 1 to 10 for every Form 140 correction; 11 to 18 blank (18 is blank on Form 140).
const FH_140 = (line = '1') => ({ 1: line, 2: 'FH', 3: 'NS1', 4: 'C', 5: '21112026', 6: '1', 7: 'D', 8: TAN, 9: '1', 10: 'SynexTax' });
// BH fields given whatever the type: 8, 9 (tokens), 12 (last TAN), 16 to 18 (verification keys).
const BH_KEYS = { 2: 'BH', 3: '1', 8: TOKEN, 9: TOKEN, 12: TAN, 16: '202728', 17: '202627', 18: 'Q1' };
// With Batch Updation Indicator 0, and in C5 and C9: name (19), state (26), type (32), responsible PAN (59).
const BH_LAST = { 19: 'FAMILY DEVELOPMENT SERVICES', 26: '19', 32: 'S', 59: 'BRNPA8898H' };

test('reads the consolidated file', () => {
  const c = parseConsoFile(CONSO);
  assert.deepEqual([c.form, c.tan, c.taxYear, c.quarter, c.originalToken, c.previousToken], ['140', TAN, 2026, 1, TOKEN, TOKEN]);
  assert.equal(c.challans.length, 1);
  assert.deepEqual(c.challans[0].deductees.map((d) => [d.recordNo, d.pan, d.deducted, d.paidOn]), [[1, 'BRNPA6778G', '900.00', '2026-05-02'], [2, 'PANNOTAVBL', '1000.00', '2026-05-10']]);
  assert.deepEqual([c.challans[0].bsr, c.challans[0].challanNo, c.challans[0].date, c.challans[0].total], ['3000012', '00123', '2026-04-30', '11200.00']);
  assert.equal(c.fh?.[2], 'NS1');
  assert.deepEqual(c.issues, []);
});

test('Form 140 C5: every field of FH, BH, CD and DD against the spec', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H' }] }, opts);
  assert.deepEqual(out.issues, []);
  assert.equal(out.type, 'C5');
  const [fh, bh, cd, dd] = fields(out.text);
  expectRecord(fh, FH_140(), 'FH');
  // BH: 4 challan count, 6 C5, 7 and 13 (TAN) and 15 (PAN) and 47 (batch total) blank.
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '140', 6: 'C5', ...BH_LAST }, 'BH');
  // CD: 5 row count, 6 nil, 7 blank, 13 mode, last BSR, serial, date and total (14, 16, 18, 20) only.
  expectRecord(cd, { 1: '3', 2: 'CD', 3: '1', 4: '1', 5: '1', 6: 'N', 13: 'B', 14: '3000012', 16: '00123', 18: '30042026', 20: '11200.00' }, 'CD');
  // DD: record and challan numbers, mode and last PAN blank, new PAN (8), last tax deducted (26) and deposited (42).
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '1', 5: '1', 8: 'BRNPA6779H', 26: '900.00', 42: '900.00' }, 'DD');
});

test('Form 140 C3: rows updated, challan not changed', () => {
  const c = parseConsoFile(CONSO);
  const edits = { deductees: [{ challanNo: 1, recordNo: 1, deducted: '1000', deposited: '1000' }, { challanNo: 1, recordNo: 2, pan: 'ABCPE1234F' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C3']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  const [fh, bh, cd, d1, d2] = fields(out.text);
  expectRecord(fh, FH_140(), 'FH');
  // BH: indicator 0 (field 7), batch total (47) of the challans in the file.
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '140', 6: 'C3', 7: '0', 13: TAN, ...BH_LAST, 47: '11200.00' }, 'BH');
  // CD: indicator 0, so 8 to 11 and 23 are blank, 15, 17 and 19 repeat the last values, 12 is the
  // challan total, 21 and 22 are the deltas of the U rows, 24 and 25 the allocations of fields 9 and 11.
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '1', 5: '2', 6: 'N', 7: '0', 12: '11200.00', 13: 'B', 14: '3000012', 15: '3000012', 16: '00123', 17: '00123',
    18: '30042026', 19: '30042026', 20: '11200.00', 21: '100.00', 22: '100.00', 24: '1000.00', 25: '100.00',
  }, 'CD');
  const row = { 2: 'DD', 3: '1', 5: '1', 6: 'U' };
  expectRecord(d1, { 1: '4', ...row, 4: '1', 7: 'BRNPA6778G', 8: 'BRNPA6778G', 9: 'ABCD', 15: '1008', 18: 'Y', 19: '02052026', 20: '1000.00', 24: '1000.00', 25: '1000.00', 26: '900.00', 27: '02052026', 28: '3.0000', 32: 'E', 42: '900.00' }, 'DD 1');
  expectRecord(d2, { 1: '5', ...row, 4: '2', 7: 'PANNOTAVBL', 8: 'ABCPE1234F', 9: 'WXYZ', 15: '1027', 18: 'Y', 19: '10052026', 20: '5000.00', 24: '1000.00', 25: '1000.00', 26: '1000.00', 27: '10052026', 28: '20.0000', 32: 'C', 42: '1000.00' }, 'DD 2');
});

test('Form 140 C3 with a challan change: indicator 1 and an unchanged row carried', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { challans: [{ recordNo: 1, interest: '1500', date: '2026-04-29' }] }, { ...opts, type: 'C3' });
  assert.deepEqual(out.issues, []);
  assert.deepEqual(out.pending, [], 'the challan change is covered, so no C2 is left');
  const [, bh, cd, dd] = fields(out.text);
  assert.deepEqual([bh[6], bh[46]], ['0', '11700.00']);
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '1', 5: '1', 6: 'N', 7: '1', 8: '10000.00', 9: '1500.00', 10: '100.00', 11: '100.00', 12: '11700.00', 13: 'B',
    14: '3000012', 15: '3000012', 16: '00123', 17: '00123', 18: '30042026', 19: '29042026', 20: '11200.00', 21: '0.00', 22: '0.00', 23: '200', 24: '1500.00', 25: '100.00',
  }, 'CD');
  assert.deepEqual([dd[5], dd[3], dd[23], dd[25]], ['U', '1', '900.00', '900.00']);
});

test('Form 140 C2: challan details alone, every field against the spec', () => {
  const c = parseConsoFile(CONSO);
  const edits = { challans: [{ recordNo: 1, bsr: '3000013', challanNo: '124', date: '2026-04-29', interest: '1500' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C2']);
  const out = writeCorrection(c, edits, opts);
  assert.deepEqual(out.issues, []);
  assert.equal(out.type, 'C2');
  const recs = fields(out.text);
  assert.equal(recs.length, 3, 'FH, BH and one CD; no DD');
  const [fh, bh, cd] = recs;
  expectRecord(fh, FH_140(), 'FH');
  // BH field 7 is 0 (no deductor change), 47 the new challan total.
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '140', 6: 'C2', 7: '0', 13: TAN, ...BH_LAST, 47: '11700.00' }, 'BH');
  // CD: 5 (row count), 7 (challan indicator), 21, 22, 24 and 25 have no value in a C2.
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '1', 6: 'N', 8: '10000.00', 9: '1500.00', 10: '100.00', 11: '100.00', 12: '11700.00', 13: 'B',
    14: '3000012', 15: '3000013', 16: '00123', 17: '124', 18: '30042026', 19: '29042026', 20: '11200.00', 23: '200',
  }, 'CD');
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
  assert.deepEqual([cd[4], cd[6], cd[8], cd[11], cd[23], dd[8]], ['1', '1', '1500.00', '11700.00', '1500.00', 'ABCD LTD']);
});

test('Form 140 C1: every field of the batch header against the spec', () => {
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
  expectRecord(fh, FH_140(), 'FH');
  // Field 4 (challan count), 7 (indicator), 31 and 46 (fillers) and 47 (batch total) have no value;
  // 53 is the last deductor type; the deductor block (15 to 30, 32 to 45, 54, 59) is the new one.
  expectRecord(bh, {
    1: '2', ...BH_KEYS, 5: '140', 6: 'C1', 13: TAN, 15: 'BRNPA6677G', 19: 'Family Development Services Trust', 20: 'INDIA', 21: 'Plot 7U', 22: 'Sector 4',
    26: '19', 27: '789098', 28: 'ACCOUNTS@FDS.EXAMPLE', 29: '56789', 30: '6789087657', 32: 'S', 33: 'Bhagyashree Rao', 34: 'CEO', 35: '7U', 40: '19', 41: '789098',
    42: 'ABCD@TESTYOUP.COM', 44: '56789', 45: '0987678909', 53: 'S', 54: '04', 59: 'BRNPA8898H', 68: '1060872',
  }, 'BH');
});

test('C1: fillers carried in the consolidated file are dropped', () => {
  // Values in BH fields 31, 46, 55, 56 and 60 of the consolidated file must not reach the C1.
  const src = CONSO.split('\r\n');
  const bh = src[1].split('^');
  for (const n of [31, 46, 55, 56, 60]) bh[n - 1] = 'X';
  const c = parseConsoFile([src[0], bh.join('^'), ...src.slice(2)].join('\r\n'));
  const out = writeCorrection(c, { deductor: { email: 'new@fds.example' } }, opts);
  assert.deepEqual(out.issues, []);
  const [, b] = fields(out.text);
  assert.deepEqual([b[30], b[45], b[54], b[55], b[59]], ['', '', '', '', '']);
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

test('C2 chosen with a deductor change: Batch Updation Indicator 1 and the deductor block', () => {
  const c = parseConsoFile(CONSO);
  const edits = { deductor: { email: 'new@fds.example' }, challans: [{ recordNo: 1, fee: '200' }] };
  assert.deepEqual(correctionTypesNeeded(c, edits), ['C1', 'C2']);
  const out = writeCorrection(c, edits, { ...opts, type: 'C2' });
  assert.deepEqual(out.issues, []);
  assert.deepEqual(out.pending, [], 'the deductor change rides in the C2');
  const [, bh, cd] = fields(out.text);
  assert.deepEqual([bh[3], bh[5], bh[6], bh[14], bh[27], bh[32], bh[46], bh[52]], ['1', 'C2', '1', 'BRNPA6677G', 'NEW@FDS.EXAMPLE', 'BHAGYASHREE', '11300.00', 'S']);
  assert.deepEqual([cd[4], cd[6], cd[9], cd[11]], ['', '', '200.00', '11300.00']);
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

test('Form 140 C3: adding a payee row to an existing challan', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { added: [{ challanNo: 1, pan: 'ABCPE1234F', name: 'New Payee', section: '1027', paidOn: '2026-06-01', amount: '1000', deducted: '100', deductedOn: '2026-06-01', rate: '10' }] }, opts);
  assert.deepEqual(out.issues, []);
  const [, , cd, dd] = fields(out.text);
  assert.deepEqual([cd[20], cd[21]], ['100.00', '100.00']);
  // Mode A: numbered after the last row, no last PAN (7) or last tax (26, 42).
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '3', 5: '1', 6: 'A', 8: 'ABCPE1234F', 9: 'New Payee', 15: '1027', 18: 'Y', 19: '01062026', 20: '1000.00', 24: '100.00', 25: '100.00', 27: '01062026', 28: '10.0000' }, 'DD');
});

test('Form 140 C9: a new challan, every field against the spec', () => {
  const c = parseConsoFile(CONSO);
  const out = writeCorrection(c, { newChallans: [{ bsr: '0510308', challanNo: '45', date: '2026-06-07', tax: '100', deductees: [{ pan: 'ABCPE1234F', name: 'New Payee', section: '1060', paidOn: '2026-06-01', amount: '1000', deducted: '100', deductedOn: '2026-06-01', rate: '30' }] }] }, opts);
  assert.deepEqual(out.issues, []);
  const [fh, bh, cd, dd] = fields(out.text);
  expectRecord(fh, FH_140(), 'FH');
  // BH: 7 (indicator), 13 is the TAN, 15 (PAN) and 53 blank, 47 the batch total.
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '140', 6: 'C9', 13: TAN, ...BH_LAST, 47: '100.00' }, 'BH');
  // CD: numbered after the last challan; 7 and the last values (14, 16, 18, 20) blank.
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '2', 5: '1', 6: 'N', 8: '100.00', 9: '0.00', 10: '0.00', 11: '0.00', 12: '100.00', 13: 'C', 15: '0510308', 17: '45', 19: '07062026',
    21: '100.00', 22: '100.00', 23: '200', 24: '0.00', 25: '0.00',
  }, 'CD');
  // DD: mode O; 7, 18 (deposited Y/N), 26 and 42 blank.
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '3', 5: '2', 6: 'O', 8: 'ABCPE1234F', 9: 'New Payee', 15: '1060', 19: '01062026', 20: '1000.00', 24: '100.00', 25: '100.00', 27: '01062026', 28: '30.0000' }, 'DD');
});

test('Form 140: rate 0 for the listed codes, deducted equals deposited, nil C9 dated at quarter end', () => {
  const c = parseConsoFile(CONSO);
  const row = { pan: 'ABCPE1234F', name: 'Winner', section: '1059', paidOn: '2026-06-01', amount: '1000', deducted: '300', deductedOn: '2026-06-01', rate: '30' };
  const zero = writeCorrection(c, { added: [{ challanNo: 1, ...row }] }, opts);
  assert.deepEqual(zero.issues, []);
  assert.equal(fields(zero.text)[3][27], '0.0000');
  const unequal = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, deducted: '1000', deposited: '900' }] }, opts);
  assert.match(unequal.issues.map((i) => i.message).join(' '), /must equal tax deposited/);
  const nil = writeCorrection(c, { newChallans: [{ nil: true, bsr: '', challanNo: '', date: '2026-06-07', tax: '0', deductees: [{ ...row, section: '1027', deducted: '0', reason: 'B' }] }] }, opts);
  assert.match(nil.issues.map((i) => i.message).join(' '), /2026-06-30/);
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

// Form 138 (salary, Q1 to Q3): no rate (DD 28), a date of deposit (DD 29), the consolidated file
// hash in FH 18. Field 12 of a row carries a value the correction must drop.
const HASH = 'A1B2C3D4E5F6';
const CONSO_138 = [
  rec('FH', { 1: '1', 2: 'FH', 3: 'SL1', 4: 'R', 5: '06052026', 6: '1', 7: 'D', 8: TAN, 9: '1', 10: 'Protean RPU 1.0', 18: HASH }),
  rec('BH', { 1: '2', 2: 'BH', 3: '1', 4: '1', 5: '138', 8: TOKEN, 9: TOKEN, 13: TAN, 15: 'AAACF1234K', 16: '202728', 17: '202627', 18: 'Q1', 19: 'FDS PRIVATE LIMITED', 20: 'INDIA', 21: '7U', 26: '19', 27: '789098', 28: 'HR@FDS.EXAMPLE', 29: '91', 30: '6789087657', 32: 'K', 33: 'BHAGYASHREE', 34: 'CEO', 35: '7U', 40: '19', 41: '789098', 42: 'HR@FDS.EXAMPLE', 44: '91', 45: '0987678909', 47: '6000.00', 59: 'BRNPA8898H', 69: '27AAACF1234K1Z5' }),
  rec('CD', { 1: '3', 2: 'CD', 3: '1', 4: '1', 5: '1', 6: 'N', 8: '6000.00', 9: '0.00', 10: '0.00', 11: '0.00', 12: '6000.00', 13: 'C', 15: '0510308', 17: '00045', 19: '07052026', 21: '6000.00', 22: '6000.00', 23: '200', 24: '0.00', 25: '0.00' }),
  rec('DD', { 1: '4', 2: 'DD', 3: '1', 4: '1', 5: '1', 6: 'O', 8: 'ABCPE1234F', 9: 'ASHA RAO', 12: 'Z', 15: '1002', 18: 'Y', 19: '30042026', 20: '60000.00', 24: '6000.00', 25: '6000.00', 27: '30042026', 29: '07052026' }),
].join('\r\n');
const FH_138 = (line = '1') => ({ 1: line, 2: 'FH', 3: 'SL1', 4: 'C', 5: '21112026', 6: '1', 7: 'D', 8: TAN, 9: '1', 10: 'SynexTax', 18: HASH });
const BH_LAST_138 = { 19: 'FDS PRIVATE LIMITED', 26: '19', 32: 'K', 59: 'BRNPA8898H', 69: '27AAACF1234K1Z5' };

test('Form 138: reads the consolidated file', () => {
  const c = parseConsoFile(CONSO_138);
  assert.deepEqual(c.issues, []);
  assert.deepEqual([c.form, c.fh?.[17], c.challans[0].deductees[0].pan], ['138', HASH, 'ABCPE1234F']);
});

test('Form 138 C5: every field against the spec, with the consolidated file hash', () => {
  const c = parseConsoFile(CONSO_138);
  const out = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'ABCPE1235G' }] }, opts);
  assert.deepEqual(out.issues, []);
  const [fh, bh, cd, dd] = fields(out.text);
  expectRecord(fh, FH_138(), 'FH');
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '138', 6: 'C5', ...BH_LAST_138 }, 'BH');
  expectRecord(cd, { 1: '3', 2: 'CD', 3: '1', 4: '1', 5: '1', 6: 'N', 13: 'C', 14: '0510308', 16: '00045', 18: '07052026', 20: '6000.00' }, 'CD');
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '1', 5: '1', 8: 'ABCPE1235G', 26: '6000.00', 42: '6000.00' }, 'DD');
});

test('Form 138 C3: a salary row updated, no rate, date of deposit kept, field 12 dropped', () => {
  const c = parseConsoFile(CONSO_138);
  const out = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, amount: '65000' }] }, opts);
  assert.deepEqual(out.issues, []);
  const [fh, bh, cd, dd] = fields(out.text);
  expectRecord(fh, FH_138(), 'FH');
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '138', 6: 'C3', 7: '0', 13: TAN, ...BH_LAST_138, 47: '6000.00' }, 'BH');
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '1', 5: '1', 6: 'N', 7: '0', 12: '6000.00', 13: 'C', 14: '0510308', 15: '0510308', 16: '00045', 17: '00045',
    18: '07052026', 19: '07052026', 20: '6000.00', 21: '0.00', 22: '0.00', 24: '0.00', 25: '0.00',
  }, 'CD');
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '1', 5: '1', 6: 'U', 7: 'ABCPE1234F', 8: 'ABCPE1234F', 9: 'ASHA RAO', 15: '1002', 18: 'Y', 19: '30042026', 20: '65000.00', 24: '6000.00', 25: '6000.00', 26: '6000.00', 27: '30042026', 29: '07052026', 42: '6000.00' }, 'DD');
});

test('Form 138 C2 and C1: every field against the spec', () => {
  const c = parseConsoFile(CONSO_138);
  const c2 = writeCorrection(c, { challans: [{ recordNo: 1, challanNo: '46' }] }, opts);
  assert.deepEqual(c2.issues, []);
  const [fh, bh, cd] = fields(c2.text);
  expectRecord(fh, FH_138(), 'FH');
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '138', 6: 'C2', 7: '0', 13: TAN, ...BH_LAST_138, 47: '6000.00' }, 'C2 BH');
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '1', 6: 'N', 8: '6000.00', 9: '0.00', 10: '0.00', 11: '0.00', 12: '6000.00', 13: 'C', 14: '0510308', 15: '0510308',
    16: '00045', 17: '46', 18: '07052026', 19: '07052026', 20: '6000.00', 23: '200',
  }, 'C2 CD');
  const out = writeCorrection(c, { deductor: { responsible: { designation: 'DIRECTOR' } } }, opts);
  assert.deepEqual(out.issues, []);
  const [, b1] = fields(out.text);
  expectRecord(b1, {
    1: '2', ...BH_KEYS, 5: '138', 6: 'C1', 13: TAN, 15: 'AAACF1234K', 19: 'FDS PRIVATE LIMITED', 20: 'INDIA', 21: '7U', 26: '19', 27: '789098', 28: 'HR@FDS.EXAMPLE',
    29: '91', 30: '6789087657', 32: 'K', 33: 'BHAGYASHREE', 34: 'DIRECTOR', 35: '7U', 40: '19', 41: '789098', 42: 'HR@FDS.EXAMPLE', 44: '91', 45: '0987678909',
    53: 'K', 59: 'BRNPA8898H', 69: '27AAACF1234K1Z5',
  }, 'C1 BH');
});

test('Form 138 C9: date of deposit is the challan date, no rate, no deposited flag', () => {
  const c = parseConsoFile(CONSO_138);
  const out = writeCorrection(c, { newChallans: [{ bsr: '0510308', challanNo: '50', date: '2026-06-07', tax: '500', deductees: [{ pan: 'ABCPE1236H', name: 'RAVI', section: '1002', paidOn: '2026-05-31', amount: '50000', deducted: '500', deductedOn: '2026-05-31', rate: '10' }] }] }, opts);
  assert.deepEqual(out.issues, []);
  const [fh, bh, cd, dd] = fields(out.text);
  expectRecord(fh, FH_138(), 'FH');
  expectRecord(bh, { 1: '2', ...BH_KEYS, 4: '1', 5: '138', 6: 'C9', 13: TAN, ...BH_LAST_138, 47: '500.00' }, 'BH');
  expectRecord(cd, {
    1: '3', 2: 'CD', 3: '1', 4: '2', 5: '1', 6: 'N', 8: '500.00', 9: '0.00', 10: '0.00', 11: '0.00', 12: '500.00', 13: 'C', 15: '0510308', 17: '50', 19: '07062026',
    21: '500.00', 22: '500.00', 23: '200', 24: '0.00', 25: '0.00',
  }, 'CD');
  expectRecord(dd, { 1: '4', 2: 'DD', 3: '1', 4: '2', 5: '2', 6: 'O', 8: 'ABCPE1236H', 9: 'RAVI', 15: '1002', 19: '31052026', 20: '50000.00', 24: '500.00', 25: '500.00', 27: '31052026', 29: '07062026' }, 'DD');
});

test('Form 138 and 144 need the consolidated file hash', () => {
  const c = parseConsoFile(CONSO_138.replace(`^${HASH}\r\n`, '^\r\n'));
  const out = writeCorrection(c, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'ABCPE1235G' }] }, opts);
  assert.match(out.issues.map((i) => i.message).join(' '), /consolidated file hash/);
});

test('Form 144 C5 carries the status (DD 12); Form 143 C3 rows carry no rate (DD 28)', () => {
  const c144 = parseConsoFile(CONSO_138.replace('^SL1^', '^NS1^').replace('^138^', '^144^').replace('^Z^', '^02^'));
  const out = writeCorrection(c144, { deductees: [{ challanNo: 1, recordNo: 1, pan: 'ABCPE1235G' }] }, opts);
  assert.deepEqual(out.issues, []);
  expectRecord(fields(out.text)[3], { 1: '4', 2: 'DD', 3: '1', 4: '1', 5: '1', 8: 'ABCPE1235G', 12: '02', 26: '6000.00', 42: '6000.00' }, '144 DD');
  const lines = CONSO_138.replace('^SL1^', '^TC1^').replace('^138^', '^143^').split('\r\n');
  const dd = lines[3].split('^');
  dd[27] = '1.0000';
  const c143 = parseConsoFile([...lines.slice(0, 3), dd.join('^')].join('\r\n'));
  const c3 = writeCorrection(c143, { deductees: [{ challanNo: 1, recordNo: 1, amount: '65000' }] }, opts);
  assert.deepEqual(c3.issues, []);
  const [fh, , , row] = fields(c3.text);
  assert.deepEqual([fh[2], fh[17], row[11], row[27]], ['TC1', '', 'Z', '']);
});

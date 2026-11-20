import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGstinChecksum } from '../validators/gstin.js';
import {
  detectHeaderRow,
  mapColumns,
  maskPan,
  normalizeMobile,
  parseConstitution,
  parseDelimited,
  parseGstinPaste,
  parseIndianAmount,
  rowsFromTable,
  validateImportRows,
} from './clientImport.js';

const gstin = (state: string, pan: string) => {
  const f = `${state}${pan}1Z`;
  return f + calculateGstinChecksum(f);
};
const G1 = gstin('03', 'AAFCP4821K'); // company
const G2 = gstin('24', 'AAFCP4821K'); // same company, Gujarat
const G3 = gstin('03', 'BQRPS4410K'); // individual

test('parseDelimited: CSV with quotes, commas inside quotes and CRLF', () => {
  const rows = parseDelimited('Name,GSTIN\r\n"Verma, Sons","03ABC"\r\n"He said ""hi""",x\r\n');
  assert.deepEqual(rows, [['Name', 'GSTIN'], ['Verma, Sons', '03ABC'], ['He said "hi"', 'x']]);
});

test('parseDelimited: a paste from Excel is tab separated', () => {
  assert.deepEqual(parseDelimited('Name\tPAN\nA\tB'), [['Name', 'PAN'], ['A', 'B']]);
});

test('detectHeaderRow skips title rows above the real header', () => {
  const rows = parseDelimited('Client list FY 2026-27,,\nPrinted from desktop software,,\nParty Name,GST No.,Mobile No.\nA,B,C');
  assert.equal(detectHeaderRow(rows), 2);
  assert.deepEqual(mapColumns(rows[2]), ['legalName', 'gstins', 'mobile']);
});

test('parseIndianAmount handles lakh grouping, rupee signs, brackets and units', () => {
  assert.equal(parseIndianAmount('₹ 1,25,000.50'), '125000.50');
  assert.equal(parseIndianAmount('(1,000)'), '-1000.00');
  assert.equal(parseIndianAmount('1.5 Cr'), '15000000.00');
  assert.equal(parseIndianAmount('12 lakh'), '1200000.00');
  assert.equal(parseIndianAmount('abc'), null);
});

test('normalizeMobile and maskPan', () => {
  assert.equal(normalizeMobile('098140 12345'), '+919814012345');
  assert.equal(normalizeMobile('+91-98140-12345'), '+919814012345');
  assert.equal(normalizeMobile('12345'), null);
  assert.equal(maskPan('AAFCP4821K'), 'XXXXX4821K');
});

test('parseConstitution reads common spellings', () => {
  assert.equal(parseConstitution('Pvt. Ltd.'), 'PRIVATE_LIMITED');
  assert.equal(parseConstitution('Partnership Firm'), 'PARTNERSHIP');
  assert.equal(parseConstitution('Sole Proprietor'), 'PROPRIETORSHIP');
  assert.equal(parseConstitution('OPC'), 'ONE_PERSON_COMPANY');
  assert.equal(parseConstitution('L.L.P.'), null); // dotted abbreviations need the word form
});

function validate(csv: string, opts = {}) {
  const rows = parseDelimited(csv);
  const h = detectHeaderRow(rows);
  return validateImportRows(rowsFromTable(rows, h, mapColumns(rows[h])), opts);
}

test('a clean row is GREEN; PAN taken from the GSTIN makes it AMBER', () => {
  const [a, b] = validate(`Name,PAN,GSTIN,Constitution\nPhulkari Textiles,AAFCP4821K,${G1},Pvt Ltd\nSukhwinder Singh,,${G3},Proprietor`);
  assert.equal(a.status, 'GREEN', JSON.stringify(a.issues));
  assert.equal(b.status, 'AMBER');
  assert.equal(b.record.pan, 'BQRPS4410K');
  assert.equal(b.record.gstins[0].stateName, 'Punjab');
});

test('a mistyped GSTIN check digit is RED with a plain message', () => {
  const bad = G1.slice(0, 14) + (G1[14] === 'A' ? 'B' : 'A');
  const [r] = validate(`Name,GSTIN\nX,${bad}`);
  assert.equal(r.status, 'RED');
  assert.match(r.issues.find((i) => i.field === 'gstins')!.message, /check digit/);
});

test('GSTIN of another PAN and constitution against PAN type are caught', () => {
  const [r] = validate(`Name,PAN,GSTIN,Constitution\nX,AAFCP4821K,${G3},Pvt Ltd`);
  assert.ok(r.issues.some((i) => i.field === 'gstins' && /belongs to PAN/.test(i.message)));
  const [c] = validate(`Name,PAN,Constitution\nX,BQRPS4410K,Private Limited`);
  assert.equal(c.status, 'RED');
  assert.match(c.issues[0].message, /individual/);
});

test('same PAN on two rows joins into one client; a different name is RED', () => {
  const ok = validate(`Name,GSTIN\nPhulkari,${G1}\nPhulkari,${G2}`);
  assert.equal(ok[1].status, 'AMBER');
  assert.ok(ok[1].issues.some((i) => /Joined with line/.test(i.message)));
  const clash = validate(`Name,GSTIN\nPhulkari,${G1}\nSomeone Else,${G2}`);
  assert.equal(clash[1].status, 'RED');
});

test('duplicates in the file and in the workspace', () => {
  const dup = validate(`Name,GSTIN\nA,${G1}\nA,${G1}`);
  assert.equal(dup[1].status, 'RED');
  const existing = validate(`Name,GSTIN\nA,${G1}`, { existingGstins: [G1] });
  assert.match(existing[0].issues[0].message, /already in Client Master/);
  const merge = validate(`Name,GSTIN\nA,${G2}`, { existingPans: ['AAFCP4821K'] });
  assert.equal(merge[0].mergesIntoExisting, true);
  assert.notEqual(merge[0].status, 'RED');
});

test('mobile, email and TAN are cleaned or flagged', () => {
  const [r] = validate(`Name,PAN,Mobile,Email,TAN\nA,AAFCP4821K,98140 12345,Accounts@Firm.IN,amrg04217d`);
  assert.equal(r.record.mobile, '+919814012345');
  assert.equal(r.record.email, 'accounts@firm.in');
  assert.equal(r.record.tan, 'AMRG04217D');
  assert.equal(r.status, 'AMBER');
  const [bad] = validate(`Name,PAN,Mobile,TAN\nA,AAFCP4821K,12345,AMR123`);
  assert.equal(bad.status, 'RED');
});

test('parseGstinPaste validates, derives PAN and state, flags repeats', () => {
  const { results } = parseGstinPaste(`${G1}\n${G3}, ${G1} 03AAAAA0000A1Z0`);
  assert.equal(results.length, 4);
  assert.equal(results[0].valid, true);
  assert.equal(results[0].constitutionHint, 'PRIVATE_LIMITED');
  assert.equal(results[1].stateName, 'Punjab');
  assert.equal(results[2].duplicate, true);
  assert.equal(results[3].valid, false);
  assert.equal(parseGstinPaste(Array(3).fill(G1).join(' '), 2).truncated, true);
});

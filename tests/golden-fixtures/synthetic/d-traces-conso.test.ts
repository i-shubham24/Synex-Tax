/**
 * Golden fixture (d): TRACES consolidated file (Form 140, Q1 Tax Year 2026-27) through the real
 * conso reader and correction-type logic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionTypesNeeded, parseConsoFile, writeCorrection } from '../../../packages/tax-engine/src/tds/correction.ts';
import { RECORD_FIELD_COUNT } from '../../../packages/tax-engine/src/tds/etdsStatement.ts';
import { validatePan } from '../../../packages/tax-engine/src/validators/pan.ts';
import { datasets, readJson, readText } from './fixture-support.ts';

for (const ds of datasets('d-traces-conso', 'd')) {
  const exp = readJson(ds.dir, 'expected-results.json');
  const text = readText(ds.dir, exp.file);
  const conso = parseConsoFile(text);

  test(`${ds.label}: record layout is caret-delimited with the format's field counts`, () => {
    const recs = text.split(/\r?\n/).filter(Boolean).map((l) => l.split('^'));
    const counts: Record<string, number> = {};
    for (const f of recs) {
      counts[f[1]] = (counts[f[1]] ?? 0) + 1;
      assert.equal(f.length, (RECORD_FIELD_COUNT as Record<string, number>)[f[1]], `line ${f[0]} ${f[1]}`);
    }
    assert.deepEqual(counts, exp.recordCounts);
  });

  test(`${ds.label}: parseConsoFile reads header, challans and payees with no issues`, () => {
    assert.deepEqual(conso.issues, exp.issues);
    assert.deepEqual(
      [conso.form, conso.tan, conso.deductorName, conso.deductor.pan, conso.taxYear, conso.quarter, conso.originalToken, conso.previousToken],
      [exp.form, exp.tan, exp.deductorName, exp.deductorPan, exp.taxYear, exp.quarter, exp.originalToken, exp.previousToken],
    );
    assert.equal(conso.challans.length, exp.challans.length);
    conso.challans.forEach((c, i) => {
      const e = exp.challans[i];
      assert.deepEqual(
        { recordNo: c.recordNo, bsr: c.bsr, challanNo: c.challanNo, date: c.date, tax: c.tax, interest: c.interest, total: c.total, minorHead: c.minorHead },
        { recordNo: e.recordNo, bsr: e.bsr, challanNo: e.challanNo, date: e.date, tax: e.tax, interest: e.interest, total: e.total, minorHead: e.minorHead },
        `challan ${i + 1}`,
      );
      assert.deepEqual(
        c.deductees.map((d) => ({ recordNo: d.recordNo, pan: d.pan, name: d.name, section: d.section, paidOn: d.paidOn, amount: d.amount, deducted: d.deducted, deposited: d.deposited, rate: d.rate, reason: d.reason })),
        e.deductees,
        `challan ${i + 1} payees`,
      );
    });
  });

  test(`${ds.label}: payee PANs are valid or a Protean literal`, () => {
    for (const c of conso.challans) for (const d of c.deductees) assert.ok(d.pan === 'PANNOTAVBL' || validatePan(d.pan).isValid, d.pan);
  });

  test(`${ds.label}: correction types for a PANNOTAVBL fix and a PAN change`, () => {
    for (const c of exp.corrections) assert.deepEqual(correctionTypesNeeded(conso, c.edit), c.typesNeeded, c.why);
  });

  test(`${ds.label}: a C5 written from this conso has no issues`, () => {
    const c5 = exp.corrections.find((c: any) => c.typesNeeded[0] === 'C5');
    const out = writeCorrection(conso, c5.edit, { fileCreated: '2026-11-26', preparedWith: 'GOLDEN FIXTURE' });
    assert.equal(out.type, 'C5');
    assert.deepEqual(out.issues, []);
  });
}

/**
 * Golden fixture (a): messy purchase register + GSTR-2B through the real 4-pass matcher.
 * Findings referenced as F<n> are described in README.md; F1 to F8 and F12 are fixed and
 * pinned here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { GstReconciliationEngine } from '../../../workers/queue-worker/src/recon/reconciliationEngine.ts';
import { validateGstin } from '../../../packages/tax-engine/src/validators/gstin.ts';
import { parseInvoiceCsv } from '../../../packages/ingestion/src/excel/excel-csv-parser.ts';
import { parseGstr2bJson } from '../../../packages/ingestion/src/gst/gstr2b-json-parser.ts';
import { datasets, load2b, loadPurchaseRegister, readJson, readText } from './fixture-support.ts';

for (const ds of datasets('a-messy-purchase-register', 'a')) {
  const exp = readJson(ds.dir, 'expected-results.json');
  const csv = readText(ds.dir, exp.register.file);
  const reg = loadPurchaseRegister(csv);
  const twoBRaw = readJson(ds.dir, exp.twoB.file);
  const twoB = load2b(twoBRaw);
  const report = GstReconciliationEngine.reconcile(exp.period, reg.invoices, twoB);
  const pairKey = (p: { prId: string; twoBId: string; status: string }) => `${p.prId} | ${p.twoBId} | ${p.status}`;
  const actualPairs = report.matchedPairs.map((p) => ({ prId: p.purchaseInvoice!.id, twoBId: p.portal2bRecord!.id, status: p.status, pair: p }));
  const byPr = new Map(actualPairs.map((p) => [p.prId, p]));
  const taxOf = (prId: string) => reg.invoices.find((i) => i.id === prId)!.totalTax;
  const sum = (xs: string[]) => xs.reduce((a, t) => a.add(t), new Decimal(0)).toFixed(2);

  test(`${ds.label}: register loader finds header, junk rows and duplicates`, () => {
    assert.equal(csv.split(/\r?\n/).filter((_, i, a) => i < a.length - 1 || a[i] !== '').length, exp.register.totalLines);
    assert.equal(reg.firstHeaderLine, exp.register.firstHeaderLine);
    assert.equal(reg.dataLines, exp.register.dataLines);
    assert.equal(reg.invoices.length, exp.register.uniqueInvoices);
    assert.deepEqual(reg.skipped, exp.register.skipped);
    assert.deepEqual(reg.duplicates, exp.register.duplicates);
    assert.equal(twoB.length, exp.twoB.documents);
  });

  test(`${ds.label}: every GSTIN passes the repo validator once cleaned`, () => {
    for (const g of new Set([...reg.invoices.map((i) => i.vendorGstin), ...twoB.map((b) => b.supplierGstin)])) {
      assert.ok(validateGstin(g).isValid, `${g}: ${validateGstin(g).error}`);
    }
  });

  test(`${ds.label}: reconcile summary`, () => {
    const actual = Object.fromEntries(Object.keys(exp.summary).map((k) => [k, (report as any)[k]]));
    assert.deepEqual(actual, exp.summary);
  });

  test(`${ds.label}: every pair lands in the expected pass`, () => {
    const expected = exp.pairs.map(pairKey).sort();
    const actual = actualPairs.map(pairKey).sort();
    assert.deepEqual(actual, expected);
    const pass = { EXACT_MATCH: 1, FUZZY_MATCH: 2, PROBABLE_MATCH: 2, MISMATCH_VALUE: 3, MISMATCH_DOCTYPE: 3 } as Record<string, number>;
    for (const p of exp.pairs) assert.equal(pass[p.status], p.pass, `${p.prId}: pass number`);
  });

  test(`${ds.label}: unmatched on each side, and rows set aside as out of period`, () => {
    assert.deepEqual(report.unmatchedPurchase.map((p) => p.id).sort(), exp.purchaseNotIn2b.map((p: any) => p.prId).sort());
    assert.deepEqual(report.unmatchedPortal2b.map((p) => p.id).sort(), exp.vendorNotInPr.map((p: any) => p.twoBId).sort());
    assert.deepEqual(report.outOfPeriodPurchase.map((p) => p.id).sort(), (exp.outOfPeriod ?? []).map((p: any) => p.prId).sort());
  });

  test(`${ds.label}: without de-duplication every repeated line is reported as not in 2B`, () => {
    const r = GstReconciliationEngine.reconcile(exp.period, reg.allRows, twoB);
    assert.equal(r.purchaseNotIn2bCount, exp.summaryIfDuplicatesAreNotRemoved.purchaseNotIn2bCount);
  });

  test(`${ds.label}: F1 the production importer reads the raw register export like the reference reader`, () => {
    const r = parseInvoiceCsv(csv, '03', { kind: 'PURCHASE' });
    assert.equal(r.headerRow, exp.register.firstHeaderLine);
    assert.equal(r.totalRows, exp.register.dataLines);
    assert.equal(r.validRowsCount, exp.register.dataLines);
    assert.deepEqual(
      r.rows.filter((x) => x.duplicateOfRow !== undefined).map((x) => ({ line: x.rowNumber, duplicateOf: x.duplicateOfRow })),
      exp.register.duplicates,
    );
    const ref = new Map(reg.allRows.map((i) => [Number(i.id.slice(4)), i]));
    for (const row of r.rows) {
      const x = ref.get(row.rowNumber)!;
      assert.ok(x, `row ${row.rowNumber} not a data line in the reference reader`);
      assert.deepEqual(
        [row.partyGstin, row.invoiceNum, row.invoiceDate, row.taxableValue, row.igstAmount, row.cgstAmount, row.sgstAmount],
        [x.vendorGstin, x.invoiceNum, x.invoiceDate, x.taxableValue, x.igstAmount, x.cgstAmount, x.sgstAmount],
        `row ${row.rowNumber}`,
      );
    }
  });

  test(`${ds.label}: F12 the production 2B parser reads the download like the reference reader`, () => {
    const parsed = parseGstr2bJson(JSON.stringify(twoBRaw));
    assert.equal(parsed.period, exp.period);
    assert.deepEqual(parsed.unreadSections, []);
    const ref = new Map(twoB.map((b) => [b.id, b]));
    assert.equal(parsed.documents.length, twoB.length);
    for (const d of parsed.documents) {
      const b = ref.get(d.id)!;
      assert.ok(b, d.id);
      assert.deepEqual(
        [d.supplierGstin, d.docNum, d.docDate, d.docType, d.taxableValue, d.igstAmount, d.cgstAmount, d.sgstAmount, d.totalTax, d.itcAvailable],
        [b.supplierGstin, b.docNum, b.docDate, b.docType, b.taxableValue, b.igstAmount, b.cgstAmount, b.sgstAmount, b.totalTax, b.itcAvailable],
        d.id,
      );
    }
  });

  if (!ds.synthetic) continue;
  const byScenario = (s: string) => exp.pairs.filter((p: any) => p.scenario === s);

  test(`${ds.label}: F2 an IGST booking against a CGST+SGST upload is a value mismatch, not exact`, () => {
    const rows = byScenario('exact_split_mismatch');
    assert.ok(rows.length > 0);
    for (const p of rows) {
      const a = byPr.get(p.prId)!;
      assert.equal(a.status, 'MISMATCH_VALUE', p.prId);
      assert.match(a.pair.notes, /tax heads/);
    }
  });

  test(`${ds.label}: F3 credit that 2B marks itcavl=N is kept out of matched ITC`, () => {
    const unavailable = byScenario('exact_itc_unavailable').map((p: any) => taxOf(p.prId));
    assert.ok(unavailable.length > 0);
    assert.equal(report.totalItcNotAvailable, sum(unavailable));
  });

  test(`${ds.label}: F4 a 2B date in another month is only a probable match`, () => {
    for (const p of byScenario('fuzzy_wrong_month')) {
      const a = byPr.get(p.prId)!;
      assert.equal(a.status, 'PROBABLE_MATCH', p.prId);
      assert.ok(a.pair.confidenceScore < 0.95, p.prId);
    }
  });

  test(`${ds.label}: F5 A/1/12 pairs with A-1-12, not A-11-2`, () => {
    for (const p of byScenario('collision')) {
      const reg1 = reg.invoices.find((i) => i.id === p.prId)!;
      const want = `:${reg1.invoiceNum.toUpperCase().replace(/\//g, '-')}`;
      assert.ok(byPr.get(p.prId)!.twoBId.toUpperCase().endsWith(want), `${reg1.invoiceNum} -> ${byPr.get(p.prId)!.twoBId}`);
    }
  });

  test(`${ds.label}: F6 a document type clash is its own status`, () => {
    for (const p of byScenario('mismatch_doctype')) assert.equal(byPr.get(p.prId)!.status, 'MISMATCH_DOCTYPE', p.prId);
  });

  test(`${ds.label}: F7 the period argument sets aside rows dated after it`, () => {
    const other = GstReconciliationEngine.reconcile('1999-01', reg.invoices, twoB);
    assert.equal(other.outOfPeriodCount, reg.invoices.length);
    assert.equal(other.matchedPairs.length, 0);
    assert.ok(report.outOfPeriodCount > 0);
  });

  test(`${ds.label}: F8 every register row's tax lands in exactly one bucket`, () => {
    const atRisk = [
      ...exp.purchaseNotIn2b.map((p: any) => p.totalTax),
      ...exp.pairs.filter((p: any) => !['EXACT_MATCH', 'FUZZY_MATCH'].includes(p.status)).map((p: any) => taxOf(p.prId)),
    ];
    assert.equal(report.totalAtRiskItc, sum(atRisk));
    const all = sum(reg.invoices.map((i) => i.totalTax));
    const buckets = [report.totalMatchedItc, report.totalItcNotAvailable, report.totalAtRiskItc, report.totalDeferredItc];
    assert.equal(sum(buckets), all);
  });
}

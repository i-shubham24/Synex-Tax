/**
 * Golden fixture (e): ITNS 281N challan, the deductor's challan list, and a CSI bank file.
 * The repo has no CSI file parser (finding F13); readCsi below is test glue for the assumed
 * layout. The matching itself runs through the real POST /csi-match route (apps/api tds.routes.ts)
 * and the challan through the real POST /:tanId/challans route up to its regime checks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { tdsRoutes } from '../../../apps/api/src/routes/tds.routes.ts';
import { challansRoutes } from '../../../apps/api/src/modules/tds/challans.routes.ts';
import { validateUploadedFile } from '../../../apps/api/src/security/fileUploadValidator.ts';
import { parseChallanList, parseCsiFile } from '../../../packages/tax-engine/src/tds/quarterImport.ts';
import { datasets, readJson, readText } from './fixture-support.ts';

function readCsi(text: string) {
  const { records, errors } = parseCsiFile(text);
  assert.deepEqual(errors, []);
  return records.map((r) => ({
    bsrCode: r.bsrCode,
    challanDate: r.challanDate,
    challanNo: r.challanNo,
    amount: r.amount,
    majorHead: r.majorHead,
  }));
}

async function api() {
  const app = Fastify();
  await app.register(jwt, { secret: 'golden-fixture-only-secret-not-used-anywhere-else' });
  await app.register(tdsRoutes, { prefix: '/tds' });
  await app.register(challansRoutes, { prefix: '/tds-module' });
  await app.ready();
  return { app, auth: { authorization: `Bearer ${app.jwt.sign({ firmId: '00000000-0000-0000-0000-000000000001', userId: '00000000-0000-0000-0000-000000000002', role: 'ADMIN' })}` } };
}

for (const ds of datasets('e-itns-281n-challan', 'e')) {
  const exp = readJson(ds.dir, 'expected-results.json');
  const challan = readJson(ds.dir, 'challan-281n.json');
  const books = readJson(ds.dir, 'book-challans.json');
  const csiName = `${books.tan}.csi`;
  const csiText = readText(ds.dir, csiName);
  const csi = readCsi(csiText);

  test(`${ds.label}: upload validator accepts the .csi file`, () => {
    const v = validateUploadedFile(Buffer.from(csiText, 'utf8'), csiName, { allowedExtensions: ['.csi'], expectedType: 'CSI' });
    assert.deepEqual({ valid: v.valid, detectedType: v.detectedType }, exp.uploadSniff, v.error);
  });

  test(`${ds.label}: parseChallanList reads the deductor's challan list`, () => {
    const r = parseChallanList(readText(ds.dir, 'challan-list.csv'));
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.challans.map((c) => ({ bsr: c.bsr, challanNo: c.challanNo, depositedOn: c.depositedOn })), exp.challanList);
  });

  test(`${ds.label}: 281N challan adds up and passes the route's schema and regime checks`, async () => {
    const alloc = challan.sectionAllocations as Array<{ incomeTax: string; surcharge: string; cess: string; totalSectionAmount: string }>;
    const s = (k: keyof (typeof alloc)[number]) => alloc.reduce((a, x) => a.add(x[k]), new Decimal(0)).toFixed(2);
    assert.equal(s('incomeTax'), challan.totalIncomeTax);
    assert.equal(s('totalSectionAmount'), new Decimal(challan.totalIncomeTax).add(challan.totalSurcharge).add(challan.totalCess).toFixed(2));
    assert.equal(
      new Decimal(challan.totalIncomeTax).add(challan.totalSurcharge).add(challan.totalCess).add(challan.interestAllocation).add(challan.othersAllocation).add(challan.feeLateFiling).toFixed(2),
      challan.totalChallanAmount,
    );
    assert.ok(challan.depositDate >= '2026-04-01' && alloc.length > 1 && alloc.length <= 20, '281N: deposit after cutover, several sections');
    const { app, auth } = await api();
    try {
      // A 422 is only reachable after CreateChallanSchema accepted the body, so both probes also prove the shape.
      const pre = await app.inject({ method: 'POST', url: `/tds-module/${books.tan}/challans`, headers: auth, payload: { ...challan, _synthetic: undefined, _note: undefined, depositDate: exp.routeChecks.sameChallanDatedBeforeCutover.depositDate } });
      assert.equal(pre.statusCode, exp.routeChecks.sameChallanDatedBeforeCutover.status, pre.body);
      assert.equal(pre.json().error, exp.routeChecks.sameChallanDatedBeforeCutover.error);
      const many = await app.inject({ method: 'POST', url: `/tds-module/${books.tan}/challans`, headers: auth, payload: { ...challan, sectionAllocations: Array.from({ length: 21 }, (_, i) => alloc[i % alloc.length]) } });
      assert.equal(many.statusCode, 422, many.body);
    } finally {
      await app.close();
    }
  });

  test(`${ds.label}: CSI match finds the clean challans and both sides of the BSR typo`, async () => {
    const { app, auth } = await api();
    try {
      const r = await app.inject({ method: 'POST', url: '/tds/csi-match', headers: auth, payload: { tan: books.tan, challans: books.challans, csiFileRecords: csi } });
      assert.equal(r.statusCode, 200, r.body);
      const d = r.json().data;
      const matched = d.matched.map((m: any) => m.challanId);
      for (const id of ['BOOK-1', 'BOOK-3']) assert.ok(matched.includes(id), id);
      assert.ok(d.unmatchedBook.includes('BOOK-4'));
      const unCsi = d.unmatchedCsi.map((u: any) => ({ bsrCode: u.bsrCode, challanNo: u.challanNo }));
      for (const u of exp.csiMatchExpected.unmatchedCsi) assert.ok(unCsi.some((x: any) => x.bsrCode === u.bsrCode && x.challanNo === u.challanNo), JSON.stringify(u));
    } finally {
      await app.close();
    }
  });

  if (!ds.synthetic) continue;

  test(`${ds.label}: F11 two challans with the same BSR, serial and amount on different dates both match`, async () => {
    const { app, auth } = await api();
    try {
      const r = await app.inject({ method: 'POST', url: '/tds/csi-match', headers: auth, payload: { tan: books.tan, challans: books.challans, csiFileRecords: csi } });
      const d = r.json().data;
      assert.deepEqual(d.matched.map((m: any) => m.challanId).sort(), exp.csiMatchExpected.matched);
      assert.deepEqual(d.unmatchedBook, exp.csiMatchExpected.unmatchedBook);
    } finally {
      await app.close();
    }
  });
}

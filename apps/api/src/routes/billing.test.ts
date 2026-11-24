import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, so auth and RLS run for real.
let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
before(async () => {
  devDb = await startDevDatabase({ port: 0 });
  Object.assign(process.env, {
    POSTGRES_HOST: devDb.host,
    POSTGRES_PORT: String(devDb.port),
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_DB: 'postgres',
    POSTGRES_POOL_MAX: '1',
  });
});
after(async () => {
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

/** A GSTIN with a correct check digit. */
function validGstin(state: string, pan: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = `${state}${pan}1Z`;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = chars.indexOf(base[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return base + chars[(36 - (sum % 36)) % 36];
}

async function setup() {
  const app = buildApp();
  await app.ready();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const token = JSON.parse(demo.body).accessToken;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const auth = { authorization: `Bearer ${token}` };
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const r = await app.inject({ method, url: `/api/v1/billing${url}`, headers: { ...auth, ...headers }, ...(payload !== undefined ? { payload: payload as any } : {}) });
    let body: any = null;
    try {
      body = JSON.parse(r.body);
    } catch {
      body = r.body;
    }
    return { status: r.statusCode, body, headers: r.headers };
  };
  return { app, claims, call };
}

test('Billing: items, customers, series, invoice, e-invoice and e-way bill JSON, IRN, stock, GSTR-1 push, cancel', async () => {
  const { app, claims, call } = await setup();

  const regs = await call('GET', '/registrations');
  assert.equal(regs.status, 200);
  assert.ok(regs.body.registrations.length >= 1, 'the demo firm has a regular GSTIN');
  const gstin: string = regs.body.registrations[0].gstin;
  const ownState = gstin.slice(0, 2);
  const otherState = ownState === '07' ? '27' : '07';

  // Seller address (rule 46(a)).
  const seller = await call('PUT', '/seller', { gstin, address1: '12 Hall Bazaar', place: 'Amritsar', pincode: '143001', phone: '9876543210' });
  assert.equal(seller.status, 200, JSON.stringify(seller.body));

  const item = await call('POST', '/items', { gstin, name: 'Cotton shirting fabric', hsn: '5208', isService: false, unit: 'MTR', gstRate: 5, salePrice: '85.50', openingQty: '500', openingValue: '30000' });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  const service = await call('POST', '/items', { gstin, name: 'Stitching charges', hsn: '998821', isService: true, unit: 'OTH', gstRate: 18, salePrice: '15000' });
  assert.equal(service.status, 201);
  const badRate = await call('POST', '/items', { gstin, name: 'Odd item', hsn: '5208', isService: false, unit: 'MTR', gstRate: 13 });
  assert.equal(badRate.status, 400);

  // Optimistic locking on edits.
  const edit = await call('PUT', `/items/${item.body.item.id}`, { ...item.body.item, salePrice: '90' }, { 'if-match': `"${item.body.item.version}"` });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  const stale = await call('PUT', `/items/${item.body.item.id}`, { ...item.body.item, salePrice: '95' }, { 'if-match': `"${item.body.item.version}"` });
  assert.equal(stale.status, 409);

  const buyerGstin = validGstin(otherState, 'AABCB5678Q');
  const customer = await call('POST', '/customers', { clientGstin: gstin, legalName: 'Bharat Fabrics LLP', gstin: buyerGstin, stateCode: otherState, address1: '22 Lawrence Road', place: 'New Delhi', pincode: '110001' });
  assert.equal(customer.status, 201, JSON.stringify(customer.body));
  const wrongState = await call('POST', '/customers', { clientGstin: gstin, legalName: 'Wrong State Ltd', gstin: buyerGstin, stateCode: ownState, address1: 'Road', place: 'Somewhere' });
  assert.equal(wrongState.status, 422);

  const tooLong = await call('POST', '/series', { gstin, fy: 2026, docType: 'INV', prefix: 'AT/2026-2027/', padWidth: 4 });
  assert.equal(tooLong.status, 422);
  const series = await call('POST', '/series', { gstin, fy: 2026, docType: 'INV', prefix: 'AT/26-27/', padWidth: 4 });
  assert.equal(series.status, 201, JSON.stringify(series.body));
  assert.equal(series.body.series.nextDocNo, 'AT/26-27/0001');
  const cnSeries = await call('POST', '/series', { gstin, fy: 2026, docType: 'CRN', prefix: 'CN/26-27/', padWidth: 4 });
  assert.equal(cnSeries.status, 201);

  const docBody = {
    gstin,
    seriesId: series.body.series.id,
    docDate: '2026-11-20',
    customerId: customer.body.customer.id,
    placeOfSupply: otherState,
    lines: [
      { itemId: item.body.item.id, description: 'Cotton shirting fabric', hsn: '5208', isService: false, unit: 'MTR', quantity: '1200', unitPrice: '85.50', gstRate: 5 },
      { itemId: service.body.item.id, description: 'Stitching charges', hsn: '998821', isService: true, unit: 'OTH', quantity: '1', unitPrice: '15000', gstRate: 18 },
    ],
  };
  const preview = await call('POST', '/documents/preview', docBody);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.errors, []);
  assert.equal(preview.body.totals.invoiceValue, '125430.00');

  const wrongFy = await call('POST', '/documents', { ...docBody, docDate: '2027-04-02' });
  assert.equal(wrongFy.status, 422);

  const inv = await call('POST', '/documents', docBody);
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const doc = inv.body.document;
  assert.equal(doc.docNo, 'AT/26-27/0001');
  assert.equal(doc.interState, true);
  assert.equal(doc.totals.igst, '7830.00');
  assert.equal(doc.ewayBillRequired, true);

  const inv2 = await call('POST', '/documents', { ...docBody, lines: [docBody.lines[0]] });
  assert.equal(inv2.status, 201);
  assert.equal(inv2.body.document.docNo, 'AT/26-27/0002', 'the series moves on');

  // e-invoice JSON download, then the IRN recorded from the portal.
  const ej = await call('GET', `/documents/${doc.id}/einvoice`);
  assert.equal(ej.status, 200, JSON.stringify(ej.body));
  assert.match(String(ej.headers['content-disposition']), /attachment; filename="einvoice-AT-26-27-0001.json"/);
  assert.equal(ej.body[0].Version, '1.1');
  assert.equal(ej.body[0].DocDtls.No, 'AT/26-27/0001');
  assert.equal(ej.body[0].ValDtls.TotInvVal, 125430);

  const irn = 'a'.repeat(64);
  const rec = await call('PUT', `/documents/${doc.id}/irn`, { irn, ackNo: '112610012345678', ackDate: '2026-11-20T10:15:00+05:30' }, { 'if-match': `"${doc.version}"` });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
  const recStale = await call('PUT', `/documents/${doc.id}/irn`, { irn, ackNo: '112610012345678', ackDate: '2026-11-20T10:15:00+05:30' }, { 'if-match': `"${doc.version}"` });
  assert.equal(recStale.status, 409);

  // e-way bill JSON with transport details.
  const noVehicle = await call('POST', `/documents/${doc.id}/ewaybill-json`, { mode: 1, distanceKm: 460 });
  assert.equal(noVehicle.status, 422);
  const ewb = await call('POST', `/documents/${doc.id}/ewaybill-json`, { mode: 1, distanceKm: 460, vehicleNo: 'PB02AB1234' });
  assert.equal(ewb.status, 200, JSON.stringify(ewb.body));
  assert.equal(ewb.body.version, '1.0.0621');
  assert.equal(ewb.body.billLists[0].docNo, 'AT/26-27/0001');
  assert.equal(ewb.body.billLists[0].itemList.length, 1);
  const ewbRec = await call('PUT', `/documents/${doc.id}/ewb`, { ewbNo: '351234567890', ewbDate: '2026-11-20T11:00:00+05:30' });
  assert.equal(ewbRec.status, 200);

  // Purchases and the stock register.
  const pur = await call('POST', '/purchases', { gstin, itemId: item.body.item.id, supplierName: 'Mill Supplier', billNo: 'B-77', billDate: '2026-11-01', quantity: '2000', value: '150000' });
  assert.equal(pur.status, 201, JSON.stringify(pur.body));
  const stock = await call('GET', `/stock?gstin=${gstin}&to=2026-11-30`);
  assert.equal(stock.status, 200);
  const fabric = stock.body.rows.find((r: any) => r.itemId === item.body.item.id);
  assert.equal(fabric.inwardQty, '2000.000');
  assert.equal(fabric.outwardQty, '2400.000');
  assert.equal(fabric.closingQty, '100.000');
  assert.equal(fabric.averageCost, '72.0000');

  // Credit note against the first invoice.
  const cn = await call('POST', '/documents', {
    ...docBody,
    seriesId: cnSeries.body.series.id,
    docDate: '2026-11-22',
    originalDocNo: 'AT/26-27/0001',
    originalDocDate: '2026-11-20',
    lines: [{ itemId: item.body.item.id, description: 'Cotton shirting fabric returned', hsn: '5208', isService: false, unit: 'MTR', quantity: '100', unitPrice: '85.50', gstRate: 5 }],
  });
  assert.equal(cn.status, 201, JSON.stringify(cn.body));
  assert.equal(cn.body.document.section, 'CDNR');
  const cnJson = await call('GET', `/documents/${cn.body.document.id}/einvoice`);
  assert.equal(cnJson.status, 200);
  assert.equal(cnJson.body[0].RefDtls.PrecDocDtls[0].InvNo, 'AT/26-27/0001');

  // GSTR-1 from the invoices, pushed into the sales register used by the GSTR-1 screens.
  const g1 = await call('GET', `/gstr1?gstin=${gstin}&period=2026-11`);
  assert.equal(g1.status, 200);
  assert.deepEqual(g1.body.sections.map((s: any) => [s.section, s.documents]), [['B2B', 2], ['CDNR', 1]]);
  assert.equal(g1.body.documentsIssued.length, 2);
  const push = await call('POST', '/gstr1/push', { gstin, period: '2026-11' });
  assert.equal(push.status, 201, JSON.stringify(push.body));
  assert.equal(push.body.documents, 3);
  assert.equal(push.body.rows, 4, 'the two-rate invoice is two rows');
  const sales = await devDb.db.query(`SELECT count(*)::int AS n FROM public.gst_invoices_sales s JOIN public.gst_registrations g ON g.id = s.gst_registration_id WHERE g.gstin = $1 AND s.return_period = '2026-11'`, [gstin]);
  assert.equal((sales.rows[0] as any).n, 4);

  // Cancel, never delete; a second push replaces the first.
  const cancel = await call('POST', `/documents/${inv2.body.document.id}/cancel`, { reason: 'Raised in error' });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  const again = await call('POST', `/documents/${inv2.body.document.id}/cancel`, { reason: 'Raised in error' });
  assert.equal(again.status, 409);
  const push2 = await call('POST', '/gstr1/push', { gstin, period: '2026-11' });
  assert.equal(push2.status, 201);
  assert.equal(push2.body.replaced, 1);
  assert.equal(push2.body.rows, 3);
  const sales2 = await devDb.db.query(`SELECT count(*)::int AS n FROM public.gst_invoices_sales s JOIN public.gst_registrations g ON g.id = s.gst_registration_id WHERE g.gstin = $1 AND s.return_period = '2026-11'`, [gstin]);
  assert.equal((sales2.rows[0] as any).n, 3);
  const issued = (await call('GET', `/gstr1?gstin=${gstin}&period=2026-11`)).body.documentsIssued;
  assert.deepEqual(issued.map((r: any) => [r.docType, r.total, r.cancelled]), [['INV', 2, 1], ['CRN', 1, 0]]);

  // A client login is refused.
  const clientToken = app.jwt.sign({ ...claims, role: 'CLIENT' });
  const refused = await app.inject({ method: 'GET', url: '/api/v1/billing/registrations', headers: { authorization: `Bearer ${clientToken}` } });
  assert.equal(refused.statusCode, 403);
  const anon = await app.inject({ method: 'GET', url: '/api/v1/billing/registrations' });
  assert.equal(anon.statusCode, 401);
});

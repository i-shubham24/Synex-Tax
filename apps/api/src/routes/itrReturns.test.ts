import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
import { buildApp } from '../app.js';
import { itrReturnsRoutes } from './itrReturns.routes.js';

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

/** The app as built for production, with the saved-returns plugin registered at the prefix the lead mounts it on. */
function appWithReturns() {
  return buildApp();
}

async function login(app: ReturnType<typeof buildApp>) {
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf }, });
  assert.equal(demo.statusCode, 200, demo.body);
  return { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
}

test('Saved ITR returns: save, If-Match, five years, register, CSV for partners, challan', async () => {
  const app = appWithReturns();
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/clients' })).statusCode, 401);
  const auth = await login(app);

  const clients = await app.inject({ method: 'GET', url: '/api/v1/itr-returns/clients', headers: auth });
  assert.equal(clients.statusCode, 200, clients.body);
  const list = JSON.parse(clients.body).clients as Array<{ id: string; pan: string; isCompany: boolean }>;
  assert.ok(list.length > 0);
  assert.ok(list.every((c) => /^X{5}\d{4}[A-Z]$/.test(c.pan)), 'PANs are masked');
  // An individual client of the demo firm, for the individual forms.
  const ref = (await devDb.db.query<{ firm_id: string; client_group_id: string }>(`SELECT firm_id, client_group_id FROM public.entities WHERE id = $1`, [list[0].id])).rows[0];
  await devDb.db.query(`INSERT INTO public.entities (firm_id, client_group_id, legal_name, pan, constitution) VALUES ($1, $2, 'Asha Mehra', 'AKLPM4821Q', 'INDIVIDUAL')`, [ref.firm_id, ref.client_group_id]);
  const all = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/clients', headers: auth })).body).clients as Array<{ id: string; name: string; pan: string; isCompany: boolean }>;
  const client = all.find((c) => c.name === 'Asha Mehra')!;
  assert.equal(client.pan, 'XXXXX4821Q');
  const company = all.find((c) => c.isCompany);

  const body = {
    entityId: client.id, assessmentYear: '2026-27', form: 'ITR-1', regime: 'NEW',
    input: { values: { 'salary.gross': '1800000', 'taxesPaid.tds': '100000' }, ageBand: 'BELOW_60', metroCity: false, payments: [] },
    status: 'DRAFT', notes: 'Salary as per Form 16.',
  };
  const created = await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: body });
  assert.equal(created.statusCode, 201, created.body);
  const { id, summary } = JSON.parse(created.body);
  assert.equal(summary.basis, 'ENGINE');
  assert.ok(summary.totalTax > 0);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: body })).statusCode, 409, 'one return per client and year');

  // A PAN or other detail is refused in the input; only the page figures are kept.
  const bad = await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: { ...body, assessmentYear: '2025-26', input: { ...body.input, pan: 'ABCDE1234F' } } });
  assert.equal(bad.statusCode, 400);
  // A year outside the five is refused.
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: { ...body, assessmentYear: '2021-22' } })).statusCode, 400);

  const got = await app.inject({ method: 'GET', url: `/api/v1/itr-returns/${id}`, headers: auth });
  assert.equal(got.statusCode, 200);
  const etag = got.headers.etag as string;
  const one = JSON.parse(got.body);
  assert.match(one.pan, /^XXXXX/);
  assert.equal(one.notes, 'Salary as per Form 16.');
  assert.ok(one.firmName);

  // FILED needs the acknowledgement and date.
  const noAck = await app.inject({ method: 'PUT', url: `/api/v1/itr-returns/${id}`, headers: { ...auth, 'if-match': etag }, payload: { ...body, status: 'FILED' } });
  assert.equal(noAck.statusCode, 400);
  assert.match(JSON.parse(noAck.body).message, /acknowledgement/);
  const filed = await app.inject({ method: 'PUT', url: `/api/v1/itr-returns/${id}`, headers: { ...auth, 'if-match': etag }, payload: { ...body, status: 'FILED', ackNumber: '123456789012345', filedOn: '2026-07-25' } });
  assert.equal(filed.statusCode, 200, filed.body);
  // The old version is stale now.
  const stale = await app.inject({ method: 'PUT', url: `/api/v1/itr-returns/${id}`, headers: { ...auth, 'if-match': etag }, payload: { ...body, notes: 'late edit' } });
  assert.equal(stale.statusCode, 409);

  // An earlier year keeps the figures as filed.
  const ay24 = await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: { ...body, assessmentYear: '2024-25', form: 'ITR-2', input: { values: {}, filed: { totalIncome: 1500000, totalTax: 150000, cess: 5769, tdsTcs: 160000 } } } });
  assert.equal(ay24.statusCode, 201, ay24.body);
  assert.equal(JSON.parse(ay24.body).summary.basis, 'ENTERED');
  assert.equal(JSON.parse(ay24.body).summary.payable, -10000);

  const years = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/itr-returns?entityId=${client.id}`, headers: auth })).body).returns;
  assert.deepEqual(years.map((r: { assessmentYear: string }) => r.assessmentYear), ['2024-25', '2026-27']);

  const reg = await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register?assessmentYear=2026-27&status=FILED', headers: auth });
  assert.equal(reg.statusCode, 200, reg.body);
  const rows = JSON.parse(reg.body).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ackNumber, '123456789012345');
  assert.match(rows[0].pan, /^XXXXX/);
  const none = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register?assessmentYear=2026-27&status=NONE', headers: auth })).body).rows;
  assert.ok(none.every((r: { returnId: string | null }) => r.returnId === null));

  const csv = await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register.csv?assessmentYear=2026-27', headers: auth });
  assert.equal(csv.statusCode, 200);
  assert.match(csv.headers['content-type'] as string, /text\/csv/);
  assert.ok(!/[A-Z]{5}\d{4}[A-Z]/.test(csv.body.replace(/XXXXX\d{4}[A-Z]/g, '')), 'no full PAN in the CSV');

  const challan = await app.inject({ method: 'GET', url: `/api/v1/itr-returns/${id}/challan?payOn=2026-07-20`, headers: auth });
  assert.equal(challan.statusCode, 200, challan.body);
  const c = JSON.parse(challan.body);
  assert.equal(c.selfAssessment.majorHead, '0021');
  assert.equal(c.selfAssessment.minorHead, '300');
  assert.equal(c.selfAssessment.tax + c.selfAssessment.surcharge + c.selfAssessment.cess + c.selfAssessment.interest + c.selfAssessment.fee, c.selfAssessment.total);

  // Rule 12: a company files ITR-6 only, and pays under major head 0020.
  if (company) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: { ...body, entityId: company.id } })).statusCode, 422);
    const co = await app.inject({ method: 'POST', url: '/api/v1/itr-returns', headers: auth, payload: { ...body, entityId: company.id, form: 'ITR-6', input: { values: {}, filed: { totalIncome: 1000000, totalTax: 251680 } } } });
    assert.equal(co.statusCode, 201, co.body);
    const cc = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/itr-returns/${JSON.parse(co.body).id}/challan?payOn=2026-10-01`, headers: auth })).body);
    assert.equal(cc.selfAssessment.majorHead, '0020');
  }

  const pan = await app.inject({ method: 'GET', url: `/api/v1/itr-returns/${id}/pan`, headers: auth });
  assert.match(JSON.parse(pan.body).pan, /^[A-Z]{5}\d{4}[A-Z]$/);

  // Staff see the register but cannot export it.
  const { iat: _i, exp: _e, iss: _s, aud: _a, ...claims } = JSON.parse(Buffer.from(auth.authorization.split('.')[1], 'base64url').toString());
  const staff = { authorization: `Bearer ${app.jwt.sign({ ...claims, role: 'STAFF' })}` };
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register?assessmentYear=2026-27', headers: staff })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register.csv?assessmentYear=2026-27', headers: staff })).statusCode, 403);
  // Client logins are refused outright.
  const clientLogin = { authorization: `Bearer ${app.jwt.sign({ ...claims, role: 'CLIENT' })}` };
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/itr-returns/register', headers: clientLogin })).statusCode, 403);
  await app.close();
});

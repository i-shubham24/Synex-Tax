import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, as in app.test.ts.
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

const person = {
  firstName: 'Harpreet', surname: 'Singh', pan: 'ABCPS1234K', dob: '1980-06-01',
  address: { residenceNo: '45', locality: 'Sarabha Nagar', city: 'Ludhiana', stateCode: '26', pin: '141001' },
  mobile: '9876543210', email: 'hs@example.com', fatherName: 'Gurdev Singh', place: 'Ludhiana',
};
const bank = { ifsc: 'PUNB0123400', name: 'Punjab National Bank', account: '1234000100056789', type: 'SB' };
const itr4 = {
  person, filing: { section: 11, regime: 'NEW' }, bank,
  business: { ad: { code: '09028', name: 'Singh Hardware', digital: 4000000, cash: 500000 }, financials: { capital: 800000, cashInHand: 200000 } },
};
const itr2 = {
  person, filing: { section: 11, regime: 'NEW' }, bank,
  salary: { employers: [{ tan: 'AMRA12345B', name: 'Acme', nature: 'OTH', address: { line: 'GT Road', city: 'Ludhiana', stateCode: '26', pin: '141003' }, gross: 1800000, tds: 150000 }] },
  capitalGains: [{ kind: '112A', date: '2025-10-01', saleValue: 500000, cost: 200000, isin: 'INE002A01018', name: 'Reliance Industries' }],
};

function staffAuth(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT' = 'STAFF') {
  return { authorization: `Bearer ${app.jwt.sign({ userId: '22222222-2222-2222-2222-222222222222', firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', identityId: '22222222-2222-2222-2222-222222222221', role, email: 'staff@example.test', displayName: 'Staff' })}` };
}

test('ITR-2 and ITR-4 over the API: checked without a software ID, written with one', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);
  const prev = process.env.ITR_SOFTWARE_ID;
  try {
    // No token: refused (CSRF or JWT check, whichever runs first).
    assert.ok([401, 403].includes((await app.inject({ method: 'POST', url: '/api/v1/itr/itr4', payload: itr4 })).statusCode));
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr4', headers: staffAuth(app, 'CLIENT'), payload: itr4 })).statusCode, 403);

    delete process.env.ITR_SOFTWARE_ID;
    const status = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/itr/status', headers: auth })).body);
    assert.deepEqual(status, { softwareIdConfigured: false, forms: ['ITR-1', 'ITR-2', 'ITR-4'] });
    const noId = await app.inject({ method: 'POST', url: '/api/v1/itr/itr4', headers: auth, payload: itr4 });
    assert.equal(noId.statusCode, 422, noId.body);
    assert.match(JSON.parse(noId.body).issues[0].message, /software ID/);
    assert.equal(JSON.parse(noId.body).summary.businessIncome, 280000);

    process.env.ITR_SOFTWARE_ID = 'SW12345678';
    const r4 = await app.inject({ method: 'POST', url: '/api/v1/itr/itr4', headers: auth, payload: itr4 });
    assert.equal(r4.statusCode, 200, r4.body);
    const b4 = JSON.parse(r4.body);
    assert.equal(b4.fileName, 'ITR4_AY2026-27_ABCPS1234K.json');
    assert.equal(b4.json.ITR.ITR4.ScheduleBP.PersumptiveInc44AD.TotPersumptiveInc44AD, 280000);

    const r2 = await app.inject({ method: 'POST', url: '/api/v1/itr/itr2', headers: auth, payload: itr2 });
    assert.equal(r2.statusCode, 200, r2.body);
    const b2 = JSON.parse(r2.body);
    assert.equal(b2.json.ITR.ITR2['PartB-TI'].CapGain.LongTerm.LongTerm12_5Per, 300000);

    const bad = await app.inject({ method: 'POST', url: '/api/v1/itr/itr2', headers: auth, payload: { ...itr2, person: { ...person, pan: 'BAD' } } });
    assert.equal(bad.statusCode, 400);
    assert.match(JSON.parse(bad.body).message, /PAN/);

    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: {} })).statusCode, 501);
  } finally {
    if (prev) process.env.ITR_SOFTWARE_ID = prev; else delete process.env.ITR_SOFTWARE_ID;
    await app.close();
  }
});

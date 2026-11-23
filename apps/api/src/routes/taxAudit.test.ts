import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, as in app.test.ts.
let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
before(async () => {
  process.env.NODE_ENV = 'test';
  devDb = await startDevDatabase({ port: 0 });
  Object.assign(process.env, {
    NODE_ENV: 'test',
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

function auth(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT' = 'STAFF') {
  return { authorization: `Bearer ${app.jwt.sign({ userId: '22222222-2222-2222-2222-222222222222', firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', identityId: '22222222-2222-2222-2222-222222222221', role, email: 'staff@example.test', displayName: 'Staff' })}` };
}

const office = { line1: '12 Mall Road', city: 'Ludhiana', stateCode: '26', pin: '141001' };
const NOT_BUILT = ['15', '23', '24', '25', '27', '29A', '29B', '30', '30A', '30B', '30C', '32', '33', '35', '36A', '36B', '41', '42', '43'];
const body = {
  form: '3CB',
  assessee: { firstName: 'Harpreet', name: 'Singh', pan: 'ABCPS1234K', status: 1, address: office, indirectTax: [{ type: 'GST', regNo: '03ABCPS1234K1Z5', stateCode: '26' }] },
  clause8: ['44ABa'],
  auditor: { firstName: 'Meera', lastName: 'Kapoor', membershipNo: '512345', firmRegNo: '012345N', signsForFirm: true, address: office, place: 'Ludhiana', signedOn: '2026-09-18' },
  accountType: 'Profit and loss account',
  form3CB: { headOffice: '12 Mall Road, Ludhiana', branches: 0, result: 'Profit' },
  partB: {
    clause10: { codes: ['09028'], changes: [] },
    clause11: { prescribed: [], maintained: [{ books: 'Cash book and ledger', address: office }], examined: ['Cash book', 'Ledger'] },
    clause12: { rows: [] },
    clause13: { method: '02', changes: [], icdsAdjustments: [], disclosures: [] },
    clause14: { method: '3', deviations145A: [] },
    clause16: { section28: [], credits: [], escalation: [], otherIncome: [], capitalReceipts: [] },
    clause17: { properties: [] },
    clause18: { blocks: [{ block: '1', rate: 15, openingWdv: 400000, additions: [], deductions: [] }] },
    clause19: { rows: [] },
    clause20: { bonus: [], employeeContributions: [] },
    clause21: { debited: [], s40a: { nonResidentNotDeducted: [], nonResidentNotPaid: [], residentNotDeducted: [], residentNotPaid: [], levyNotDeducted: [], levyNotPaid: [], salaryOutsideIndia: [] }, s40b: [], s40A3: [], s40A3A: [], contingent: [], section14A: [] },
    clause22: { interestInadmissible: 0, payableToMicroSmall: 0, paidInTime: 0, notPaidInTime: 0 },
    clause26: { preExistingPaid: [], preExistingUnpaid: [], currentPaid: [], currentUnpaid: [], indirectTaxThroughPl: false },
    clause31: { loans269SS: [], specifiedSums269SS: [], receipts269STCash: [], receipts269STCheque: [], payments269STCash: [], payments269STCheque: [], repayments269T: [], repaymentsReceivedCash: [], repaymentsReceivedCheque: [] },
    clause34: { required: false, rows: [], statementsRequired: false, statements: [], interest: 'X', interestRows: [] },
    clause37: { status: 'X' }, clause38: { status: 'X' }, clause39: { status: 'X' },
    clause40: { previous: { turnover: 52000000, grossProfit: 6240000, netProfit: 1820000 }, preceding: { turnover: 47000000 } },
    clause44: { total: 46000000, exempt: 400000, composition: 1200000, otherRegistered: 42000000, unregistered: 2400000 },
  },
  notApplicable: NOT_BUILT,
};

test('Tax audit over the API: applicability, checks without a software ID, file with one, PAN masked', async () => {
  const app = buildApp();
  await app.ready();
  const staff = auth(app);
  const prev = process.env.ITR_SOFTWARE_ID;
  try {
    assert.ok([401, 403].includes((await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', payload: body })).statusCode));
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', headers: auth(app, 'CLIENT'), payload: body })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tax-audit/applicability', headers: auth(app, 'CLIENT'), payload: { business: { turnover: 1 } } })).statusCode, 403);

    const ap = await app.inject({ method: 'POST', url: '/api/v1/tax-audit/applicability', headers: staff, payload: { business: { turnover: 80000000, totalReceipts: 80000000, cashReceipts: 5600000 } } });
    assert.equal(ap.statusCode, 200, ap.body);
    assert.deepEqual(JSON.parse(ap.body).clauses, ['44ABa']);
    assert.equal(JSON.parse(ap.body).form, '3CB');
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/tax-audit/applicability', headers: staff, payload: { business: { turnover: -1 } } })).statusCode, 400);

    delete process.env.ITR_SOFTWARE_ID;
    const st = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/tax-audit/status', headers: staff })).body);
    assert.equal(st.softwareIdConfigured, false);
    const noId = await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', headers: staff, payload: body });
    assert.equal(noId.statusCode, 422, noId.body);
    assert.match(JSON.parse(noId.body).issues[0].message, /software ID/);

    process.env.ITR_SOFTWARE_ID = 'SW12345678';
    const ok = await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', headers: staff, payload: body });
    assert.equal(ok.statusCode, 200, ok.body);
    const r = JSON.parse(ok.body);
    assert.equal(r.fileName, 'Form3CB_3CD_AY2026-27_XXXXX1234K.json');
    assert.equal(r.summary.pan, 'XXXXX1234K');
    assert.equal(r.json.FORM3CB.F3CB.CreationInfo.SWCreatedBy, 'SW12345678');
    assert.equal(r.json.FORM3CB.F3CB.Form3cdDeprAllw[0].DepAllowable, 60000);
    // Outside the file itself the PAN does not appear.
    const { json: _file, ...rest } = r;
    assert.doesNotMatch(JSON.stringify(rest), /ABCPS1234K/);

    // Clauses neither filled nor declared not applicable: 422 with the list.
    const short = await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', headers: staff, payload: { ...body, notApplicable: [], partB: { ...body.partB, clause44: undefined } } });
    assert.equal(short.statusCode, 422);
    const s = JSON.parse(short.body);
    assert.ok(s.clausesNeeded.includes('44'));
    assert.ok(s.clausesNeeded.includes('43'));
    assert.doesNotMatch(short.body, /ABCPS1234K/);

    const bad = await app.inject({ method: 'POST', url: '/api/v1/tax-audit/form3cd', headers: staff, payload: { ...body, form: '3CD' } });
    assert.equal(bad.statusCode, 400);
  } finally {
    if (prev) process.env.ITR_SOFTWARE_ID = prev;
    else delete process.env.ITR_SOFTWARE_ID;
    await app.close();
  }
});

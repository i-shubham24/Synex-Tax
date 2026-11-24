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
    assert.deepEqual(status, { softwareIdConfigured: false, forms: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'] });
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

    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: {} })).statusCode, 400);
  } finally {
    if (prev) process.env.ITR_SOFTWARE_ID = prev; else delete process.env.ITR_SOFTWARE_ID;
    await app.close();
  }
});

// 44ADA professional: 50% of Rs 30,00,000 = Rs 15,00,000.
const itr3 = {
  person, status: 'I', filing: { section: 11, regime: 'NEW' }, bank,
  business: {
    natures: [{ code: '16019_1', tradeName: 'Singh Associates' }],
    ada: { code: '16019_1', name: 'Singh Associates', digital: 3000000, cash: 0 },
    noAccounts: { debtors: 200000, creditors: 0, stock: 0, cash: 20000 },
  },
};

test('ITR-3 over the API: checks without a software ID, masked file name, audit and HUF refusals', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);
  const prev = process.env.ITR_SOFTWARE_ID;
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: staffAuth(app, 'CLIENT'), payload: itr3 })).statusCode, 403);
    delete process.env.ITR_SOFTWARE_ID;
    const noId = await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: itr3 });
    assert.equal(noId.statusCode, 422, noId.body);
    assert.match(JSON.parse(noId.body).issues[0].message, /software ID/);
    assert.equal(JSON.parse(noId.body).summary.businessIncome, 1500000);

    process.env.ITR_SOFTWARE_ID = 'SW12345678';
    const ok = await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: itr3 });
    assert.equal(ok.statusCode, 200, ok.body);
    const body = JSON.parse(ok.body);
    assert.equal(body.fileName, 'ITR3_AY2026-27_XXXXX1234K.json');
    assert.equal(body.json.ITR.ITR3.ITR3ScheduleBP.IncChrgUnHdProftGain, 1500000);

    // Receipts of Rs 80 lakh under 44ADA need a tax audit (validation rule 137).
    const audit = await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: { ...itr3, business: { ...itr3.business, ada: { ...itr3.business.ada, digital: 8000000 } } } });
    assert.equal(audit.statusCode, 422);
    assert.ok(JSON.parse(audit.body).issues.some((x: { message: string }) => /tax audit forms/.test(x.message)));
    // A HUF cannot use 44ADA (rule 130).
    const huf = await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: { ...itr3, status: 'H', person: { ...person, pan: 'AAAHS1234K' }, karta: { name: 'Harpreet Singh', pan: 'ABCPS1234K' } } });
    assert.equal(huf.statusCode, 422);
    assert.ok(JSON.parse(huf.body).issues.some((x: { message: string }) => /44ADA/.test(x.message)));
    // Out of range amounts are refused by the body check.
    const bad = await app.inject({ method: 'POST', url: '/api/v1/itr/itr3', headers: auth, payload: { ...itr3, business: { ...itr3.business, ada: { ...itr3.business.ada, digital: -5 } } } });
    assert.equal(bad.statusCode, 400);
  } finally {
    if (prev) process.env.ITR_SOFTWARE_ID = prev; else delete process.env.ITR_SOFTWARE_ID;
    await app.close();
  }
});

const partnerAddr = { line: 'Ferozepur Road', city: 'Ludhiana', stateCode: '26', pin: '141001' };
const entityBase = {
  entity: { name: 'Singh Traders', pan: 'AAKFS1234L', formedOn: '2015-04-01', address: { residenceNo: 'Shop 4', locality: 'Ghumar Mandi', city: 'Ludhiana', stateCode: '26', pin: '141001' }, mobile: '9876543210', email: 'accounts@example.com' },
  filing: { section: 11 }, bank: { ...bank, type: 'CA' },
  natures: [{ code: '09028', tradeName: 'Singh Traders' }],
  books: { trading: { salesGoods: 8000000, openingStock: 500000, purchases: 6000000, closingStock: 700000 }, expenses: { salaries: 600000 } },
};
const itr5 = {
  ...entityBase, kind: 'FIRM',
  signatory: { name: 'Harpreet Singh', fatherName: 'Gurdev Singh', pan: 'ABCPS1234K', capacity: 'MP', place: 'Ludhiana' },
  partners: [
    { name: 'Harpreet Singh', pan: 'ABCPS1234K', address: partnerAddr, share: 60, working: true, remuneration: 300000 },
    { name: 'Simran Kaur', pan: 'ABCPK5678M', address: partnerAddr, share: 40, working: true, remuneration: 300000 },
  ],
  // Profit 15,00,000; the balance sheet: capital 15,00,000 against stock 7,00,000 and bank 8,00,000.
  balanceSheet: { partnersCapital: 1500000, stock: 700000, bank: 800000 },
};
const itr6 = {
  ...entityBase, entity: { ...entityBase.entity, name: 'Singh Agro Private Limited', pan: 'AAJCS1234K' },
  companyType: 'PRIVATE', unlisted: true,
  regime: { option: '115BAA', form10IC: { assessmentYear: '2021-22', ack: '987654321012345', date: '2021-11-20' } },
  signatory: { name: 'Harpreet Singh', fatherName: 'Gurdev Singh', pan: 'ABCPS1234K', capacity: 'DR', place: 'Ludhiana' },
  keyPersons: [{ name: 'Harpreet Singh', designation: 'DIR', pan: 'ABCPS1234K', address: partnerAddr }],
  books: { ...entityBase.books, expenses: { salaries: 1200000 } },
  balanceSheet: { shareCapital: 100000, reserves: 1400000, inventories: 700000, bankBalances: 800000 },
};

test('ITR-5, ITR-6 and ITR-U over the API: masked file names, refusals and the 140B working', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);
  const prev = process.env.ITR_SOFTWARE_ID;
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr5', headers: staffAuth(app, 'CLIENT'), payload: itr5 })).statusCode, 403);
    process.env.ITR_SOFTWARE_ID = 'SW12345678';
    const r5 = await app.inject({ method: 'POST', url: '/api/v1/itr/itr5', headers: auth, payload: itr5 });
    assert.equal(r5.statusCode, 200, r5.body);
    const b5 = JSON.parse(r5.body);
    assert.equal(b5.fileName.includes('AAKFS1234L'), false);
    assert.equal(b5.json.ITR.ITR5.PartA_GEN1.OrgFirmInfo.PAN, 'AAKFS1234L');
    // Gross profit 22,00,000 less salaries 6,00,000 and partners' remuneration 6,00,000 (within the 40(b) limit of 11,40,000).
    assert.equal(b5.summary.businessIncome, 1000000);

    const one = await app.inject({ method: 'POST', url: '/api/v1/itr/itr5', headers: auth, payload: { ...itr5, partners: [itr5.partners[0]] } });
    assert.equal(one.statusCode, 422);
    assert.ok(JSON.parse(one.body).issues.some((x: { message: string }) => /two partners/.test(x.message)));

    const r6 = await app.inject({ method: 'POST', url: '/api/v1/itr/itr6', headers: auth, payload: itr6 });
    assert.equal(r6.statusCode, 200, r6.body);
    const b6 = JSON.parse(r6.body);
    assert.equal(b6.fileName.includes('AAJCS1234K'), false);
    assert.equal(b6.json.ITR.ITR6.PartA_GEN1.FilingStatus.Section115BA, '115BAA');
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/itr/itr6', headers: auth, payload: { ...itr6, regime: { option: 'X' } } })).statusCode, 400);

    const ru = await app.inject({
      method: 'POST', url: '/api/v1/itr/itru', headers: auth,
      payload: { base: { form: 'ITR2', input: itr2 }, filedOn: '2027-06-01', eligible: true, reasons: ['1'] },
    });
    assert.equal(ru.statusCode, 422, ru.body);
    const bu = JSON.parse(ru.body);
    assert.ok(bu.issues.some((x: { field: string }) => x.field === 'schema'));
    assert.equal(bu.parts.PartA_139_8A.UpdatedReturnDuringPeriod, '1');
    assert.equal(bu.summary.additionalTaxRate, 25);
  } finally {
    if (prev) process.env.ITR_SOFTWARE_ID = prev; else delete process.env.ITR_SOFTWARE_ID;
    await app.close();
  }
});

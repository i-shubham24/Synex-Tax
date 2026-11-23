import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { writeItr2 } from '@synextax/tax-engine';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, as the other route tests use.
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

function auth(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF' | 'CLIENT' = 'STAFF') {
  return { authorization: `Bearer ${app.jwt.sign({ userId: '22222222-2222-2222-2222-222222222222', firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', identityId: '22222222-2222-2222-2222-222222222221', role, email: 'staff@example.test', displayName: 'Staff' })}` };
}

const lastYear = writeItr2({
  softwareId: 'SW12345678', createdOn: '2026-07-25', intermediaryCity: 'Pune',
  person: {
    firstName: 'Meera', surname: 'Kulkarni', pan: 'ABCPK1234L', dob: '1975-09-10',
    address: { residenceNo: 'B-12', locality: 'Kothrud', city: 'Pune', stateCode: '19', pin: '411038' },
    mobile: '9822012345', email: 'meera@example.com', fatherName: 'Vasant Kulkarni', place: 'Pune',
  },
  filing: { section: 11, regime: 'OLD' },
  salary: { employers: [{ tan: 'PNEA12345B', name: 'Pune Tech Pvt Ltd', nature: 'OTH', address: { line: 'Hinjewadi', city: 'Pune', stateCode: '19', pin: '411057' }, gross: 2400000, tds: 330000 }] },
  deductions: { section80C: [{ amount: 150000, id: 'PPF1' }] },
  bank: { ifsc: 'SBIN0001234', name: 'State Bank of India', account: '30012345678', type: 'SB' },
}).json;

const ais = {
  PAN: 'ABCPK1234L',
  FinancialYear: '2025-26',
  TDS: [
    { InformationCode: 'TDS-192', InformationDescription: 'Salary', InformationSource: 'PUNE TECH PVT LTD', TAN: 'PNEA12345B', Amount: 2400000, TDSDeducted: 330000 },
    { InformationCode: 'TDS-194', InformationDescription: 'Dividend', InformationSource: 'INFOSYS LIMITED', TAN: 'BLRI12345D', Amount: 30000, TDSDeducted: 3000 },
  ],
  SFT: [{ SFTCode: 'SFT-016(SB)', InformationDescription: 'Interest from savings bank', InformationSource: 'STATE BANK OF INDIA', ReporterPAN: 'AAACS8577K', Amount: 15500 }],
};

test('earlier return: parses an uploaded ITR-2, masks the PAN, never prefills it, checks it against the client', async () => {
  const app = buildApp();
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app), payload: { text: JSON.stringify(lastYear), clientPan: 'ABCPK1234L' } });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.form, 'ITR-2');
  assert.equal(body.client.pan, 'XXXXX1234L');
  assert.equal(body.prefill.person.pan, undefined);
  assert.equal(body.panMatchesClient, true);
  assert.equal(body.heads.salary, 2350000);
  assert.deepEqual(body.section80C, [{ amount: 150000, id: 'PPF1' }]);
  assert.ok(!res.body.includes('ABCPK1234L'));

  // The file posted as is, and as plain text.
  const bare = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app, 'PARTNER'), payload: lastYear as object });
  assert.equal(bare.statusCode, 200, bare.body);
  const plain = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: { ...auth(app), 'content-type': 'text/plain' }, payload: JSON.stringify(lastYear) });
  assert.equal(plain.statusCode, 200, plain.body);

  // Another client's PAN is flagged.
  const other = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app), payload: { json: lastYear, clientPan: 'ZZZPZ9999Z' } });
  assert.equal(other.json().panMatchesClient, false);
  await app.close();
});

test('earlier return: bad files are refused with a plain message; clients and anonymous callers are refused', async () => {
  const app = buildApp();
  await app.ready();
  const bad = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app), payload: { text: 'not json' } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().message, /not valid JSON/);
  const itr5 = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app), payload: { json: { ITR: { ITR5: {} } } } });
  assert.equal(itr5.statusCode, 400);
  assert.match(itr5.json().message, /only ITR-1 to ITR-4/);
  const big = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: { ...auth(app), 'content-type': 'text/plain' }, payload: 'x'.repeat(5 * 1024 * 1024 + 10) });
  assert.equal(big.statusCode, 413, big.body);
  const bigJson = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app), payload: { text: 'x'.repeat(5 * 1024 * 1024 + 10) } });
  assert.equal(bigJson.statusCode, 400);
  const client = await app.inject({ method: 'POST', url: '/api/v1/itr-import/earlier-return', headers: auth(app, 'CLIENT'), payload: { json: lastYear } });
  assert.equal(client.statusCode, 403);
  const anon = await app.inject({ method: 'POST', url: '/api/v1/itr-import/ais', payload: { json: ais } });
  // Without a bearer token the CSRF guard or the JWT check refuses it.
  assert.ok([401, 403].includes(anon.statusCode));
  await app.close();
});

test('AIS: parsed and matched with the return sent with it', async () => {
  const app = buildApp();
  await app.ready();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/itr-import/ais', headers: auth(app),
    payload: {
      text: JSON.stringify(ais), clientPan: 'ABCPK1234L',
      return: { salary: { employers: [{ tan: 'PNEA12345B', name: 'Pune Tech', gross: 2400000, tds: 330000 }] }, otherSources: { savingsInterest: 15000 } },
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json();
  assert.equal(body.ais.taxpayer.pan, 'XXXXX1234L');
  assert.equal(body.panMatchesClient, true);
  assert.ok(!res.body.includes('ABCPK1234L') && !res.body.includes('AAACS8577K'));
  const row = (key: string) => body.match.rows.find((r: { key: string }) => r.key === key);
  assert.equal(row('sal:PNEA12345B').status, 'MATCHED');
  assert.equal(row('inc:savingsInterest').status, 'DIFFERENT');
  assert.equal(row('inc:dividend').status, 'MISSING_IN_RETURN');
  assert.deepEqual(row('tds:BLRI12345D').add, { type: 'tdsOther', tan: 'BLRI12345D', name: 'INFOSYS LIMITED', section: '194', amount: 30000, tds: 3000, head: 'OS' });

  // Without a return only the parsed lines come back.
  const only = await app.inject({ method: 'POST', url: '/api/v1/itr-import/ais', headers: auth(app), payload: { json: ais } });
  assert.equal(only.statusCode, 200);
  assert.equal(only.json().match, undefined);

  // A malformed return body is refused.
  const badReturn = await app.inject({ method: 'POST', url: '/api/v1/itr-import/ais', headers: auth(app), payload: { json: ais, return: { otherSources: { savingsInterest: 'lots' } } } });
  assert.equal(badReturn.statusCode, 400);
  const encrypted = await app.inject({ method: 'POST', url: '/api/v1/itr-import/ais', headers: { ...auth(app), 'content-type': 'text/plain' }, payload: 'U2FsdGVkX1' + 'Q'.repeat(4000) });
  assert.equal(encrypted.statusCode, 400);
  assert.match(encrypted.json().message, /password protected/);
  await app.close();
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';

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

const TOKEN = '123456789012345';
const CONSO = [
  '1^FH^NS1^R^06052026^1^D^AMRG04217D^1^RPU^^^^^^^^',
  `2^BH^1^1^140^^^${TOKEN}^${TOKEN}^^^^AMRG04217D^^AAJCG7392L^202728^202627^Q3^GOLDEN GATE^INDIA^7U^^^^^19^789098^tax@goldengate.com^91^9876543210^^K^R SHARMA^DIRECTOR^7U^^^^^19^789098^rsharma@goldengate.com^^91^9876543210^^11200.00^^^^^N^^^^^^^ABCPS1234K^^^^^^^^^^^^^^`,
  '3^CD^1^1^2^N^^35000.00^0.00^0.00^0.00^35000.00^C^^0510308^^00123^^20112026^^35000.00^35000.00^200^1000.00^100.00^^^^^',
  '4^DD^1^1^1^O^^BRNPA6778G^Sukhwinder Singh^^^^^^1023^^^^10102026^100000.00^^^^1000.00^1000.00^^10102026^01.0000^^^^^^^^^^^^^^^^^^',
  '5^DD^1^2^1^O^^PANNOTAVBL^Hardware Vendor^^^^^^1024^^^^15102026^200000.00^^^^4000.00^4000.00^^15102026^02.0000^^^^^^^^^^^^^^^^^^',
].join('\r\n');

async function getAuth(app: ReturnType<typeof buildApp>) {
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  assert.equal(demo.statusCode, 200, demo.body);
  return {
    headers: {
      authorization: `Bearer ${JSON.parse(demo.body).accessToken}`,
      'x-csrf-token': csrf,
    },
  };
}

test('POST /api/v1/tds/dual-act-recon/analyze performs dual-act audit on raw TRACES conso file', async () => {
  const app = buildApp();
  const auth = await getAuth(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tds/dual-act-recon/analyze',
    headers: auth.headers,
    payload: {
      text: CONSO,
      overrideRegime: 'IT_ACT_2025',
    },
  });

  assert.equal(res.statusCode, 200, res.body);
  const data = JSON.parse(res.body);
  assert.equal(data.success, true);
  assert.ok(data.report);

  const report = data.report;
  assert.equal(report.tan, 'AMRG04217D');
  assert.equal(report.metrics.totalChallans, 1);
  assert.equal(report.metrics.totalDeductees, 2);

  /* Challan surplus verification: 35,000 deposited vs (1,000 + 4,000 = 5,000 deducted) => 30,000 surplus */
  assert.equal(report.metrics.totalUnconsumedSurplus, '30000.00');

  /* Short deduction verification: 200,000 * 20% Section 206AA = 40,000 - 4,000 deducted = 36,000 shortfall */
  assert.equal(report.metrics.totalShortDeduction, '36000.00');

  /* Recommended corrections */
  assert.ok(report.recommendedCorrections.c2Challans.length >= 1);
  assert.ok(report.recommendedCorrections.c3Deductees.length >= 1);
});

test('POST /api/v1/tds/dual-act-recon/analyze returns demo report when queried by TAN', async () => {
  const app = buildApp();
  const auth = await getAuth(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tds/dual-act-recon/analyze',
    headers: auth.headers,
    payload: {
      tan: 'MUMB12345A',
      taxYear: 2026,
      quarter: 3,
    },
  });

  assert.equal(res.statusCode, 200, res.body);
  const data = JSON.parse(res.body);
  assert.equal(data.success, true);
  assert.ok(data.report);
  assert.ok(data.report.metrics.netTracesDemandRisk);
});

test('POST /api/v1/tds/dual-act-recon/auto-correct generates batch correction edits', async () => {
  const app = buildApp();
  const auth = await getAuth(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tds/dual-act-recon/auto-correct',
    headers: auth.headers,
    payload: {
      text: CONSO,
      title: 'Auto Section Remap',
    },
  });

  assert.equal(res.statusCode, 200, res.body);
  const data = JSON.parse(res.body);
  assert.equal(data.success, true);
  assert.ok(data.recommendedEdits);
});

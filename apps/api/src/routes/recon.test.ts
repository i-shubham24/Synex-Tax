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

function staffAuth(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT' = 'STAFF') {
  return {
    authorization: `Bearer ${app.jwt.sign({
      userId: '22222222-2222-2222-2222-222222222222',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      identityId: '22222222-2222-2222-2222-222222222221',
      role,
      email: 'staff@example.test',
      displayName: 'Staff',
    })}`,
  };
}

test('Recon: active reconciliation data returns matched and unmatched pairs', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);

  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/recon/active',
    headers: auth,
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.data);
});

test('Recon: IMS action records acceptance, rejection, or pending on GSTR-2B line items', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/recon/ims-action',
    headers: auth,
    payload: {
      invoiceId: 'g2b-201',
      gstin: '03AABCP1332L1Z4',
      action: 'A',
      reason: 'Verified in books',
    },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.equal(body.data.imsActionStatus, 'A');
  assert.equal(body.data.effectiveItcStatus, 'CLAIMABLE');
});

test('Recon: pre14-risk scans unactioned records for deemed acceptance before 14th cutoff', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);

  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/recon/pre14-risk',
    headers: auth,
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.data.riskScan !== undefined);
  assert.ok(body.data.statutoryAdvice.includes('Section 38 / IMS Rules'));
});

test('Recon: automated vendor chaser generates Section 16(2)(aa) notice and WhatsApp link', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/recon/chaser',
    headers: auth,
    payload: {
      supplierGstin: '03AAACR4821L1Z4',
      supplierName: 'Ranjit Logistics Amritsar',
      supplierPhone: '9876543210',
      invoiceNum: 'RL/2026/0991',
      invoiceDate: '2026-10-18',
      taxableValue: '125000.00',
      totalTax: '22500.00',
      period: 'October 2026',
    },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.data.noticeText.includes('Section 16(2)(aa)'));
  assert.ok(body.data.noticeText.includes('RL/2026/0991'));
  assert.ok(body.data.whatsappUrl.includes('919876543210'));
  assert.equal(body.data.statutoryGround, 'Section 16(2)(aa) CGST Act & Rule 36(4)');
});

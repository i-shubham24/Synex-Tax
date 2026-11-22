import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';
import { AuthService } from '../modules/auth/authService.js';

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
  await AuthService.ensureDemoPartner();

  // Seed staff user for maker-checker tests
  await devDb.db.query(`
    INSERT INTO auth.identities (id, email, password_hash, mfa_required, status)
    VALUES ('22222222-2222-2222-2222-222222222221', 'staff@example.test', 'n/a', false, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);
  await devDb.db.query(`
    INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status)
    VALUES ('22222222-2222-2222-2222-222222222222', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222221', 'Staff Member', 'STAFF', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);
});

after(async () => {
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

function staffAuth(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF' | 'MANAGER' | 'CLIENT' = 'STAFF') {
  const userId = role === 'PARTNER' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222';
  const identityId = role === 'PARTNER' ? '00000000-0000-0000-0000-000000000001' : '22222222-2222-2222-2222-222222222221';
  return {
    authorization: `Bearer ${app.jwt.sign({
      userId,
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      identityId,
      role,
      email: role === 'PARTNER' ? 'ca.verma@synextax.com' : 'staff@example.test',
      displayName: role === 'PARTNER' ? 'CA Amrinder Verma, FCA' : 'Staff Member',
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

test('GSTR-3B Cockpit: practice multi-GSTIN position aggregates liability, eligible 2B ITC, and Rule 88A set-off', async () => {
  const app = buildApp();
  await app.ready();
  const auth = staffAuth(app, 'PARTNER');

  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/gst/gstr3b/cockpit?period=2026-10',
    headers: auth,
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.data.summary);
  assert.ok(body.data.summary.totalGstins >= 1);
  assert.ok(Array.isArray(body.data.registrations));
  assert.ok(body.data.registrations.length >= 1);

  const first = body.data.registrations[0];
  assert.ok(first.gstin);
  assert.ok(first.outwardTaxable !== undefined);
  assert.ok(first.grossLiability !== undefined);
  assert.ok(first.eligibleItc !== undefined);
  assert.ok(first.cashPayable !== undefined);
  assert.ok(first.cashBreakdown);
});

test('GSTR-3B Bulk Autofill: partner performs 1-click batch generation with Rule 88A and Rule 86B guards', async () => {
  const app = buildApp();
  await app.ready();
  const partnerAuth = staffAuth(app, 'PARTNER');
  const staffAuthHeader = staffAuth(app, 'STAFF');

  // Staff is blocked by Maker-Checker
  const blocked = await app.inject({
    method: 'POST',
    url: '/api/v1/gst/gstr3b/bulk-autofill',
    headers: staffAuthHeader,
    payload: { period: '2026-10' },
  });
  assert.equal(blocked.statusCode, 403);

  // Partner succeeds
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/gst/gstr3b/bulk-autofill',
    headers: partnerAuth,
    payload: { period: '2026-10' },
  });

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.ok(body.count >= 1);
  assert.ok(body.totalLiabilityAutofilled !== undefined);
  assert.ok(body.totalCashPayable !== undefined);
});

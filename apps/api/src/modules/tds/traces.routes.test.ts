import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../../app.js';
import { AuthService } from '../auth/authService.js';

let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
let seeded: { tan: string; entityId: string; returnId: string; token: string };

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

  // Seed a STAFF user for maker-checker & PII role verification
  await devDb.db.query(`
    INSERT INTO auth.identities (id, email, password_hash, mfa_required, status)
    VALUES ('33333333-3333-3333-3333-333333333331', 'staff-traces@example.test', 'n/a', false, 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);
  await devDb.db.query(`
    INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status)
    VALUES ('33333333-3333-3333-3333-333333333332', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-3333-3333-3333-333333333331', 'Staff Traces', 'STAFF', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING
  `);

  const tanRow = (
    await devDb.db.query<{ id: string; entity_id: string; tan: string }>(
      `SELECT id, entity_id, tan FROM public.tan_registrations WHERE tan = 'AMRG04217D' LIMIT 1`,
    )
  ).rows[0];
  assert.ok(tanRow, 'Demo TAN AMRG04217D should be seeded');

  const challanId = '44444444-4444-4444-4444-444444444401';
  const allocId = '44444444-4444-4444-4444-444444444402';
  const deducteeId = '44444444-4444-4444-4444-444444444403';
  const returnId = '44444444-4444-4444-4444-444444444404';
  const token = '010260400099999';

  await devDb.db.query(
    `INSERT INTO public.tds_challans (
       id, firm_id, entity_id, tan_registration_id, challan_no, bsr_code,
       deposit_date, statutory_regime, tax_year, quarter, deductee_type_head,
       total_income_tax, total_challan_amount
     ) VALUES (
       $1, 'ffffffff-ffff-ffff-ffff-ffffffffffff', $2, $3, '00777', '0510308',
       '2026-05-07', 'IT_ACT_2025', 2026, 'Q1', '0021', '24150.00', '24150.00'
     ) ON CONFLICT (id) DO NOTHING`,
    [challanId, tanRow.entity_id, tanRow.id],
  );

  await devDb.db.query(
    `INSERT INTO public.tds_challan_section_allocations (
       id, firm_id, entity_id, challan_id, section_code, income_tax, total_section_amount
     ) VALUES (
       $1, 'ffffffff-ffff-ffff-ffff-ffffffffffff', $2, $3, '393(1)-194C', '24150.00', '24150.00'
     ) ON CONFLICT (id) DO NOTHING`,
    [allocId, tanRow.entity_id, challanId],
  );

  await devDb.db.query(
    `INSERT INTO public.tds_deductees (
       id, firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id,
       deductee_pan, deductee_name, payment_credit_date, amount_paid, tds_rate,
       tds_deducted, total_tds_deposited, deduction_date
     ) VALUES (
       $1, 'ffffffff-ffff-ffff-ffff-ffffffffffff', $2, $3, $4, $5,
       'BQRPS4410K', 'Sukhwinder Contractor', '2026-05-05', '150000.00', 1.0000,
       '1500.00', '1500.00', '2026-05-05'
     ) ON CONFLICT (id) DO NOTHING`,
    [deducteeId, tanRow.entity_id, tanRow.id, challanId, allocId],
  );

  await devDb.db.query(
    `INSERT INTO public.tds_returns (
       id, firm_id, entity_id, tan_registration_id, statutory_regime, tax_year, quarter,
       form_code, return_type, correction_no, workflow_status, statutory_due_date,
       correction_window_expires_at, latest_accepted_token_15digit, version
     ) VALUES (
       $1, 'ffffffff-ffff-ffff-ffff-ffffffffffff', $2, $3, 'IT_ACT_2025', 2026, 'Q1',
       '140', 'ORIGINAL', 0, 'PORTAL_SAVED', '2026-07-31', '2029-03-31', $4, 1
     ) ON CONFLICT (id) DO NOTHING`,
    [returnId, tanRow.entity_id, tanRow.id, token],
  );

  seeded = { tan: tanRow.tan, entityId: tanRow.entity_id, returnId, token };
});

after(async () => {
  const { db } = await import('../../db/pool.js');
  await db.close();
  await devDb.stop();
});

function authHeaders(app: ReturnType<typeof buildApp>, role: 'PARTNER' | 'STAFF') {
  const userId = role === 'PARTNER' ? '11111111-1111-1111-1111-111111111111' : '33333333-3333-3333-3333-333333333332';
  const identityId = role === 'PARTNER' ? '00000000-0000-0000-0000-000000000001' : '33333333-3333-3333-3333-333333333331';
  return {
    authorization: `Bearer ${app.jwt.sign({
      userId,
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      identityId,
      role,
      email: role === 'PARTNER' ? 'ca.verma@synextax.com' : 'staff-traces@example.test',
      displayName: role === 'PARTNER' ? 'CA Amrinder Verma, FCA' : 'Staff Traces',
    })}`,
  };
}

test('TRACES KYC masks deductee PANs on GET and logs PARTNER reveals', async () => {
  const app = buildApp();
  try {
    await app.ready();
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/tds/${seeded.tan}/traces/kyc-cheat-sheet/${seeded.token}`,
    headers: authHeaders(app, 'PARTNER'),
  });
  assert.equal(res.statusCode, 200, res.body);
    const body = res.json();
    assert.equal(body.cheatSheet.panCombinations.length, 1);
    assert.equal(body.cheatSheet.panCombinations[0].pan, 'XXXXX4410K');
    assert.equal(body.cheatSheet.panCombinations[0].masked, true);

    // Staff cannot reveal raw PANs
    const staffReveal = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/traces/kyc-cheat-sheet/${seeded.token}/reveal`,
      headers: authHeaders(app, 'STAFF'),
      payload: { accessReason: 'TRACES login check' },
    });
    assert.equal(staffReveal.statusCode, 403);

    // Partner reveal requires a reason >= 5 chars
    const shortReason = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/traces/kyc-cheat-sheet/${seeded.token}/reveal`,
      headers: authHeaders(app, 'PARTNER'),
      payload: { accessReason: 'kyc' },
    });
    assert.equal(shortReason.statusCode, 400);

    // Partner reveal succeeds and writes audit PII access log
    const okReveal = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/traces/kyc-cheat-sheet/${seeded.token}/reveal`,
      headers: authHeaders(app, 'PARTNER'),
      payload: { accessReason: 'TRACES portal KYC authentication' },
    });
    assert.equal(okReveal.statusCode, 200, okReveal.body);
    const revealJson = okReveal.json();
    assert.equal(revealJson.logged, true);
    assert.equal(revealJson.panCombinations[0].pan, 'BQRPS4410K');
    assert.equal(revealJson.panCombinations[0].masked, false);
  } finally {
    await app.close();
  }
});

test('PRN token recording enforces Maker-Checker and optimistic If-Match version lock', async () => {
  const app = buildApp();
  try {
    await app.ready();
    // STAFF cannot mark return FILED via PRN
    const staffTry = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/returns/${seeded.returnId}/prn-token`,
      headers: authHeaders(app, 'STAFF'),
      payload: { tokenNumber: '123456789012345', version: 1 },
    });
    assert.equal(staffTry.statusCode, 403);

    // PARTNER without If-Match/version gets 428
    const missingVersion = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/returns/${seeded.returnId}/prn-token`,
      headers: authHeaders(app, 'PARTNER'),
      payload: { tokenNumber: '123456789012345' },
    });
    assert.equal(missingVersion.statusCode, 428, missingVersion.body);

    // PARTNER with stale version gets 409
    const staleVersion = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/returns/${seeded.returnId}/prn-token`,
      headers: { ...authHeaders(app, 'PARTNER'), 'if-match': '"99"' },
      payload: { tokenNumber: '123456789012345' },
    });
    assert.equal(staleVersion.statusCode, 409, staleVersion.body);

    // PARTNER with matching version updates and increments version
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/returns/${seeded.returnId}/prn-token`,
      headers: { ...authHeaders(app, 'PARTNER'), 'if-match': '"1"' },
      payload: { tokenNumber: '123456789012345' },
    });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().returnStatement.workflow_status, 'FILED');
    assert.equal(ok.json().returnStatement.version, 2);
  } finally {
    await app.close();
  }
});

test('conso-diff parses real Protean .conso files, flags placeholders, and never fakes padesReady', async () => {
  const app = buildApp();
  try {
    await app.ready();
    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/traces/conso-diff`,
      headers: authHeaders(app, 'PARTNER'),
      payload: { consoContent: 'not a valid traces conso file at all' },
    });
    assert.equal(bad.statusCode, 422, bad.body);

    const consoPath = path.resolve(
      process.cwd(),
      '../../tests/golden-fixtures/synthetic/d-traces-conso/ZZZS90001Z_140_Q1_202627.conso',
    );
    const consoContent = fs.readFileSync(consoPath, 'utf8');
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/tds/${seeded.tan}/traces/conso-diff`,
      headers: authHeaders(app, 'PARTNER'),
      payload: { consoContent },
    });
    assert.equal(ok.statusCode, 200, ok.body);
    const json = ok.json();
    assert.equal(json.consoSummary.totalChallans, 3);
    assert.equal(json.consoSummary.totalDeductees, 26);
    assert.equal(json.batchSigningPayload.padesReady, false);
    assert.ok(json.diffs.some((d: { recordType: string; status: string }) => d.recordType === 'C1' && d.status === 'DISCREPANCY'));
    for (const pan of json.consoSummary.sampleDeducteePans as string[]) {
      assert.ok(pan.startsWith('XXXXX'), `expected masked sample PAN, got ${pan}`);
    }
  } finally {
    await app.close();
  }
});

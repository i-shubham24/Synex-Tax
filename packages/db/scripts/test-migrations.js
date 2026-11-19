import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');

async function run() {
  console.log('Initializing in-memory PostgreSQL instance with PGlite...');
  const db = new PGlite();
  await db.waitReady;
  console.log('PostgreSQL instance ready.');

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migration files:`, files);

  for (const file of files) {
    console.log(`Applying migration: ${file}...`);
    const fullPath = path.join(migrationsDir, file);
    let sql = fs.readFileSync(fullPath, 'utf8');

    // In PGlite WASM environment:
    // mock extensions.hmac and extensions.digest with exact sha256 logic
    if (file === '0001_roles_schemas_types.sql') {
      sql = sql.replace(
        'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;',
        () => `-- PGlite WASM mock for pgcrypto
         CREATE OR REPLACE FUNCTION extensions.hmac(data bytea, key bytea, type text) RETURNS bytea LANGUAGE sql AS $$ SELECT sha256(key || data) $$;
         CREATE OR REPLACE FUNCTION extensions.digest(data bytea, type text) RETURNS bytea LANGUAGE sql AS $$ SELECT sha256(data) $$;`
      );
    }

    try {
      await db.exec(sql);
    } catch (err) {
      console.error(`✖ Error in ${file}:`, err.message);
      throw err;
    }
  }

  console.log('\n======================================================');
  console.log('🎉 ALL 10 MIGRATIONS EXECUTED CLEANLY ON POSTGRESQL!');
  console.log('======================================================\n');

  console.log('Running Deep Security & Statutory RLS Tests...');

  // Setup: Insert HMAC signing key into app.context_keys
  const kid = 'test-kid-01';
  const secretKey = crypto.randomBytes(32);
  await db.query(
    `INSERT INTO app.context_keys (kid, secret, active) VALUES ($1, $2, true)`,
    [kid, secretKey]
  );

  // Helper to compute HMAC signature for context
  function signContext(firmId, userId, actorKind, exp) {
    const payload = `${firmId}:${userId || ''}:${actorKind}:${exp}`;
    // In our mock: sha256(key || data)
    const combined = Buffer.concat([secretKey, Buffer.from(payload, 'utf8')]);
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  const firmA_id = crypto.randomUUID();
  const firmB_id = crypto.randomUUID();
  const identA_id = crypto.randomUUID();
  const identB_id = crypto.randomUUID();
  const userA_id = crypto.randomUUID();
  const userB_id = crypto.randomUUID();

  // Insert Identities, Firms, and Users as synextax_owner (bypasses RLS)
  await db.exec(`
    INSERT INTO auth.identities (id, email, mfa_required, status)
    VALUES
      ('${identA_id}', 'ca.verma@synextax.com', true, 'ACTIVE'),
      ('${identB_id}', 'adv.gupta@synextax.com', true, 'ACTIVE');

    INSERT INTO public.firms (id, legal_name, trade_name, firm_kind, pan, status)
    VALUES
      ('${firmA_id}', 'Verma & Associates CA', 'Verma Tax', 'CA_FIRM', 'AABCV1234F', 'ACTIVE'),
      ('${firmB_id}', 'Gupta & Co Advocates', 'Gupta Legal', 'TAX_ADVOCATE', 'AABCG5678F', 'ACTIVE');

    INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status)
    VALUES
      ('${userA_id}', '${firmA_id}', '${identA_id}', 'Amrinder Verma', 'PARTNER', 'ACTIVE'),
      ('${userB_id}', '${firmB_id}', '${identB_id}', 'Suresh Gupta', 'PARTNER', 'ACTIVE');
  `);

  console.log('✔ Seeded test firms and partner accounts.');

  // TEST 1: Cross-Tenant Isolation for synextax_app under RLS
  await db.exec(`SET ROLE synextax_app;`);

  // Without verified context, app.current_firm_id() returns NULL, RLS blocks all rows
  const unauthFirms = await db.query(`SELECT id, legal_name FROM public.firms;`);
  assert.equal(unauthFirms.rows.length, 0, 'Unauthenticated query must return 0 firms');
  console.log('✔ Fail-closed verified: Unsigned context sees 0 rows.');

  // Set context for Firm A inside an explicit transaction block
  const expA = Math.floor(Date.now() / 1000) + 3600;
  const sigA = signContext(firmA_id, userA_id, 'USER', expA);

  const txResults = await db.exec(`
    BEGIN;
    SELECT app.set_request_context(
      '${firmA_id}'::uuid,
      '${userA_id}'::uuid,
      'USER',
      '127.0.0.1'::inet,
      'req-01',
      'TestRunner',
      ${expA}::bigint,
      '${kid}',
      '${sigA}'
    ) AS verified;
    SELECT id, legal_name FROM public.firms;
    COMMIT;
  `);

  // In PGlite exec(), an array of results is returned for multi-statement execution
  const setCtxRes = txResults[1];
  const queryRes = txResults[2];

  assert.equal(setCtxRes.rows[0].verified, true, 'HMAC context verification must succeed');
  assert.equal(queryRes.rows.length, 1, 'Firm A query must return exactly 1 firm');
  assert.equal(queryRes.rows[0].id, firmA_id, 'Must only see Firm A');
  console.log('✔ Cross-tenant isolation verified: Firm A sees ONLY Firm A data.');

  // Set context for Firm B inside an explicit transaction block
  const expB = Math.floor(Date.now() / 1000) + 3600;
  const sigB = signContext(firmB_id, userB_id, 'USER', expB);

  const txB_Results = await db.exec(`
    BEGIN;
    SELECT app.set_request_context(
      '${firmB_id}'::uuid,
      '${userB_id}'::uuid,
      'USER',
      '127.0.0.1'::inet,
      'req-02',
      'TestRunner',
      ${expB}::bigint,
      '${kid}',
      '${sigB}'
    ) AS verified;
    SELECT id, legal_name FROM public.firms;
    COMMIT;
  `);

  const queryB_Res = txB_Results[2];
  assert.equal(queryB_Res.rows.length, 1, 'Firm B query must return exactly 1 firm');
  assert.equal(queryB_Res.rows[0].id, firmB_id, 'Must only see Firm B');
  console.log('✔ Cross-tenant isolation verified: Firm B sees ONLY Firm B data.');

  // TEST 2: Defense-in-Depth Audit Protection
  // Layer 1: synextax_app has no UPDATE/DELETE privileges
  try {
    await db.exec(`UPDATE audit.immutable_audit_logs SET action = 'TAMPERED' WHERE 1=1;`);
    assert.fail('Updating audit log as synextax_app must fail at permission check');
  } catch (err) {
    assert.match(err.message, /permission denied for table immutable_audit_logs/, 'Expected permission denied');
    console.log('✔ Audit privilege lockdown verified: synextax_app cannot UPDATE audit tables.');
  }

  // Layer 2: Even table owner (synextax_owner) is blocked by the statutory trigger
  await db.exec(`SET ROLE synextax_owner;`);
  try {
    await db.exec(`UPDATE audit.immutable_audit_logs SET action = 'TAMPERED' WHERE 1=1;`);
    assert.fail('Updating audit log as owner must be rejected by statutory trigger');
  } catch (err) {
    assert.match(err.message, /STATUTORY_AUDIT_IMMUTABLE/, 'Expected STATUTORY_AUDIT_IMMUTABLE violation');
    console.log('✔ Audit trigger tamper guard verified: Even synextax_owner cannot UPDATE audit records.');
  }

  try {
    await db.exec(`DELETE FROM audit.immutable_audit_logs WHERE 1=1;`);
    assert.fail('Deleting audit log as owner must be rejected by statutory trigger');
  } catch (err) {
    assert.match(err.message, /STATUTORY_AUDIT_IMMUTABLE/, 'Expected STATUTORY_AUDIT_IMMUTABLE violation');
    console.log('✔ Audit trigger tamper guard verified: Even synextax_owner cannot DELETE audit records.');
  }

  console.log('\n======================================================');
  console.log('🎉 ALL SECURITY & RLS VERIFICATION TESTS PASSED!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});

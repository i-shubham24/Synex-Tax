// SynexTax database verification suite.
//
// Applies packages/db/migrations/0001..0010 to a real PostgreSQL 17 engine (PGlite 0.4.x is
// PostgreSQL 17.5 compiled to WASM) with the real pgcrypto extension, then proves the
// Checkpoint 1 invariants as the application role would meet them:
//   HMAC request context (forged, missing, expired, replayed settings), tenant RLS including
//   audit.*, maker-checker and FILED period locks, ITNS 281 / 281N section limits, and the
//   read-only global tables.
//
// Run: npm run migrate:test -w @synextax/db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../migrations');

let db;
const KID = 'test-kid-01';
const SECRET = crypto.randomBytes(32);
const id = () => crypto.randomUUID();

// Fixture ids
const F = { A: id(), B: id() };
const U = { pA: id(), sA: id(), mA: id(), pB: id() };
const G = { A1: id(), A2: id(), B1: id() };
const E = { A1: id(), A2: id(), B1: id() };
const R = { A1: id() };
const T = { A1: id() };

function sign(firmId, userId, actorKind, exp, key = SECRET) {
  return crypto.createHmac('sha256', key).update(`${firmId}:${userId ?? ''}:${actorKind}:${exp}`, 'utf8').digest('hex');
}

function ctx(firmId, userId, { actorKind = 'USER', ttl = 300, key, kid = KID, sig, exp } = {}) {
  const e = exp ?? Math.floor(Date.now() / 1000) + ttl;
  return { firmId, userId, actorKind, exp: e, kid, sig: sig === undefined ? sign(firmId, userId, actorKind, e, key) : sig };
}

/** Runs fn inside one transaction as synextax_app, after presenting a signed context (or none). */
async function asApp(context, fn) {
  return db.transaction(async (tx) => {
    await tx.query('SET LOCAL ROLE synextax_app');
    if (context) {
      const r = await tx.query(
        `SELECT app.set_request_context($1::uuid, $2::uuid, $3::text, $4::inet, $5::text, $6::text, $7::bigint, $8::varchar, $9::text) AS ok`,
        [context.firmId, context.userId ?? null, context.actorKind, '10.0.0.7', 'req-test', 'verify-suite', context.exp, context.kid, context.sig],
      );
      if (r.rows[0].ok !== true) throw new Error('CONTEXT_REJECTED');
    }
    return fn(tx);
  });
}

/** True when the database accepted the context and exposed the firm's own row. */
async function contextGrantsAccess(context) {
  try {
    return await asApp(context, async (tx) => (await tx.query('SELECT count(*)::int AS n FROM public.firms')).rows[0].n === 1);
  } catch {
    return false;
  }
}

before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
  }

  // Seed as the bootstrap superuser (platform provisioning path).
  await db.query(`INSERT INTO app.context_keys (kid, secret, active) VALUES ($1, $2, true), ('retired-kid', $3, false)`, [KID, SECRET, crypto.randomBytes(32)]);
  const idents = Object.fromEntries(Object.keys(U).map((k) => [k, id()]));
  await db.exec(`
    INSERT INTO auth.identities (id, email) VALUES
      ('${idents.pA}', 'partner.a@example.test'), ('${idents.sA}', 'staff.a@example.test'),
      ('${idents.mA}', 'manager.a@example.test'), ('${idents.pB}', 'partner.b@example.test');
    INSERT INTO public.firms (id, legal_name, firm_kind, pan) VALUES
      ('${F.A}', 'Verma and Associates', 'CA_FIRM', 'AABFV1234F'),
      ('${F.B}', 'Gupta and Co', 'TAX_ADVOCATE', 'AABFG5678F');
    INSERT INTO public.users (id, firm_id, identity_id, display_name, role, can_approve_delegated) VALUES
      ('${U.pA}', '${F.A}', '${idents.pA}', 'Partner A', 'PARTNER', false),
      ('${U.sA}', '${F.A}', '${idents.sA}', 'Staff A', 'STAFF', false),
      ('${U.mA}', '${F.A}', '${idents.mA}', 'Manager A', 'MANAGER', true),
      ('${U.pB}', '${F.B}', '${idents.pB}', 'Partner B', 'PARTNER', false);
    INSERT INTO public.client_groups (id, firm_id, name) VALUES
      ('${G.A1}', '${F.A}', 'Silk Group'), ('${G.A2}', '${F.A}', 'Majha Group'), ('${G.B1}', '${F.B}', 'Other Firm Group');
    INSERT INTO public.entities (id, firm_id, client_group_id, legal_name, pan, constitution) VALUES
      ('${E.A1}', '${F.A}', '${G.A1}', 'Amritsar Silk Mills Pvt Ltd', 'AAACA1234K', 'PRIVATE_LIMITED'),
      ('${E.A2}', '${F.A}', '${G.A2}', 'Majha Traders', 'AAEFM5678L', 'PARTNERSHIP'),
      ('${E.B1}', '${F.B}', '${G.B1}', 'Other Firm Client', 'AAACO9999Q', 'PRIVATE_LIMITED');
    INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, assigned_by) VALUES
      ('${F.A}', '${U.sA}', '${E.A1}', '${U.pA}');
    INSERT INTO public.user_client_assignments (firm_id, user_id, client_group_id, access_level, assigned_by) VALUES
      ('${F.A}', '${U.mA}', '${G.A1}', 'REVIEW', '${U.pA}');
    INSERT INTO public.gst_registrations (id, firm_id, entity_id, gstin) VALUES
      ('${R.A1}', '${F.A}', '${E.A1}', '03AAACA1234K1Z5');
    INSERT INTO public.tan_registrations (id, firm_id, entity_id, tan, deductor_type_code) VALUES
      ('${T.A1}', '${F.A}', '${E.A1}', 'AMRA12345B', 'K');
  `);
});

// ---------------------------------------------------------------------------
test('engine is PostgreSQL 17 with real pgcrypto HMAC', async () => {
  const v = (await db.query('SELECT version() AS v')).rows[0].v;
  assert.match(v, /^PostgreSQL 17\./);
  const h = (await db.query(`SELECT encode(extensions.hmac('abc'::bytea, 'key'::bytea, 'sha256'), 'hex') AS h`)).rows[0].h;
  assert.equal(h, crypto.createHmac('sha256', 'key').update('abc').digest('hex'));
});

// ---------------------------------------------------------------------------
test('HMAC context: a correctly signed context sees exactly its own firm', async () => {
  const rows = await asApp(ctx(F.A, U.pA), async (tx) => (await tx.query('SELECT id FROM public.firms')).rows);
  assert.deepEqual(rows.map((r) => r.id), [F.A]);
});

test('HMAC context: no context at all sees zero rows (fail closed)', async () => {
  const n = await asApp(null, async (tx) => (await tx.query('SELECT count(*)::int AS n FROM public.firms')).rows[0].n);
  assert.equal(n, 0);
});

test('HMAC context: signature made with a different key is rejected', async () => {
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { key: crypto.randomBytes(32) })), false);
});

test('HMAC context: missing (NULL) signature is rejected', async () => {
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { sig: null })), false);
});

test('HMAC context: missing (NULL) expiry is rejected', async () => {
  const c = ctx(F.A, U.pA);
  assert.equal(await contextGrantsAccess({ ...c, exp: null }), false);
});

test('HMAC context: expired signature is rejected', async () => {
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { exp: Math.floor(Date.now() / 1000) - 5 })), false);
});

test('HMAC context: retired or unknown key id is rejected', async () => {
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { kid: 'retired-kid' })), false);
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { kid: 'nope' })), false);
});

test('HMAC context: malformed signature text is rejected', async () => {
  assert.equal(await contextGrantsAccess(ctx(F.A, U.pA, { sig: 'zz-not-hex' })), false);
});

test('HMAC context: a signature for firm A cannot be replayed for firm B', async () => {
  const c = ctx(F.A, U.pA);
  assert.equal(await contextGrantsAccess({ ...c, firmId: F.B }), false);
});

test('HMAC context: writing the context settings directly with set_config grants nothing', async () => {
  const n = await asApp(null, async (tx) => {
    await tx.query(`SELECT set_config('app.context_verified', 'true', true),
                           set_config('app.current_firm_id', $1, true),
                           set_config('app.current_user_id', $2, true)`, [F.A, U.pA]);
    return (await tx.query('SELECT count(*)::int AS n FROM public.entities')).rows[0].n;
  });
  assert.equal(n, 0);
});

test('HMAC context: changing the firm setting after a valid context does not switch tenants', async () => {
  const rows = await asApp(ctx(F.A, U.pA), async (tx) => {
    await tx.query(`SELECT set_config('app.current_firm_id', $1, true)`, [F.B]);
    return (await tx.query('SELECT id FROM public.firms')).rows;
  });
  assert.ok(rows.every((r) => r.id !== F.B), 'firm B must never become visible');
});

// ---------------------------------------------------------------------------
test('RLS: firm B cannot see firm A entities, users or registrations', async () => {
  const out = await asApp(ctx(F.B, U.pB), async (tx) => ({
    entities: (await tx.query('SELECT firm_id FROM public.entities')).rows,
    users: (await tx.query('SELECT firm_id FROM public.users')).rows,
    regs: (await tx.query('SELECT count(*)::int AS n FROM public.gst_registrations')).rows[0].n,
  }));
  assert.ok(out.entities.length === 1 && out.entities.every((r) => r.firm_id === F.B));
  assert.ok(out.users.every((r) => r.firm_id === F.B));
  assert.equal(out.regs, 0);
});

test('RLS: staff see only entities assigned to them; partners see all', async () => {
  const staff = await asApp(ctx(F.A, U.sA), async (tx) => (await tx.query('SELECT id FROM public.entities')).rows.map((r) => r.id));
  const partner = await asApp(ctx(F.A, U.pA), async (tx) => (await tx.query('SELECT id FROM public.entities')).rows.map((r) => r.id));
  assert.deepEqual(staff, [E.A1]);
  assert.deepEqual(partner.sort(), [E.A1, E.A2].sort());
});

test('RLS: writing a row tagged with another firm id is refused', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.pA), (tx) => tx.query(`INSERT INTO public.client_groups (firm_id, name) VALUES ($1, 'Injected')`, [F.B])),
    /row-level security/,
  );
});

// ---------------------------------------------------------------------------
test('Audit: an application write is captured with the verified actor', async () => {
  const groupId = id();
  await asApp(ctx(F.A, U.pA), (tx) => tx.query(`INSERT INTO public.client_groups (id, firm_id, name) VALUES ($1, $2, 'Audited Group')`, [groupId, F.A]));
  const rows = (await db.query(`SELECT firm_id, actor_id, action FROM audit.immutable_audit_logs WHERE record_id = $1`, [groupId])).rows;
  assert.equal(rows.length, 1, 'exactly one audit row');
  assert.deepEqual(rows[0], { firm_id: F.A, actor_id: U.pA, action: 'INSERT' });
});

test('Audit: staff edits are logged under the signed staff user', async () => {
  await asApp(ctx(F.A, U.sA), (tx) => tx.query(`UPDATE public.entities SET trade_name = 'Silk' WHERE id = $1`, [E.A1]));
  const rows = (await db.query(`SELECT actor_id FROM audit.immutable_audit_logs WHERE record_id = $1 AND action = 'UPDATE' ORDER BY id DESC LIMIT 1`, [E.A1])).rows;
  assert.equal(rows[0]?.actor_id, U.sA);
});

test('Audit: forging the user id setting voids the context, so nothing is written under another name', async () => {
  const changed = await asApp(ctx(F.A, U.sA), async (tx) => {
    await tx.query(`SELECT set_config('app.current_user_id', $1, true)`, [U.pA]);
    return (await tx.query(`UPDATE public.entities SET trade_name = 'Forged' WHERE id = $1`, [E.A1])).affectedRows;
  });
  assert.equal(changed, 0, 'a tampered context sees no rows');
  const forged = (await db.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs WHERE record_id = $1 AND actor_id = $2`, [E.A1, U.pA])).rows[0].n;
  assert.equal(forged, 0);
  const trade = (await db.query('SELECT trade_name FROM public.entities WHERE id = $1', [E.A1])).rows[0].trade_name;
  assert.equal(trade, 'Silk');
});

test('Audit: firm B cannot read firm A audit rows', async () => {
  const n = await asApp(ctx(F.B, U.pB), async (tx) => (await tx.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs WHERE firm_id = $1`, [F.A])).rows[0].n);
  assert.equal(n, 0);
  const own = await asApp(ctx(F.A, U.pA), async (tx) => (await tx.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs`)).rows[0].n);
  assert.ok(own > 0, 'firm A reads its own audit trail');
});

test('Audit: the app role cannot update, delete or truncate audit rows', async () => {
  for (const sql of ['UPDATE audit.immutable_audit_logs SET action = \'DELETE\'', 'DELETE FROM audit.immutable_audit_logs', 'TRUNCATE audit.immutable_audit_logs']) {
    await assert.rejects(asApp(ctx(F.A, U.pA), (tx) => tx.query(sql)), /permission denied/, sql);
  }
});

test('Audit: even the table owner is stopped by the immutability trigger', async () => {
  for (const sql of ['UPDATE audit.immutable_audit_logs SET action = \'DELETE\'', 'DELETE FROM audit.immutable_audit_logs', 'TRUNCATE audit.immutable_audit_logs']) {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query('SET LOCAL ROLE synextax_owner');
        await tx.query(sql);
      }),
      /STATUTORY_AUDIT_IMMUTABLE/,
      sql,
    );
  }
});

test('Audit: a PII reveal is logged for the caller and cannot be filed under another firm', async () => {
  const logId = await asApp(ctx(F.A, U.sA), async (tx) =>
    (await tx.query(`SELECT audit.log_pii_access($1, $2, 'entities', 'pan', $2, 'Verifying PAN for GSTR-1 filing') AS id`, [F.A, E.A1])).rows[0].id,
  );
  const row = (await db.query('SELECT firm_id, user_id FROM audit.pii_access_logs WHERE id = $1', [logId])).rows[0];
  assert.deepEqual(row, { firm_id: F.A, user_id: U.sA });
  await assert.rejects(
    asApp(ctx(F.A, U.sA), (tx) => tx.query(`SELECT audit.log_pii_access($1, NULL, 'entities', 'pan', $2, 'cross-firm attempt')`, [F.B, E.B1])),
  );
});

// ---------------------------------------------------------------------------
async function newGstFiling(tx, { period, returnType = 'GSTR3B', status = 'DRAFT', createdBy = U.sA }) {
  const fid = id();
  await tx.query(
    `INSERT INTO public.gst_filings (id, firm_id, entity_id, gst_registration_id, return_period, return_type, workflow_status, statutory_due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [fid, F.A, E.A1, R.A1, period, returnType, status, `${period}-20`, createdBy],
  );
  return fid;
}

test('Maker-checker: staff can prepare a GSTR-3B draft', async () => {
  const fid = await asApp(ctx(F.A, U.sA), (tx) => newGstFiling(tx, { period: '2026-08' }));
  assert.ok(fid);
});

test('Maker-checker: staff cannot mark a return FILED', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.sA), async (tx) => {
      const fid = await newGstFiling(tx, { period: '2026-07' });
      await tx.query(`UPDATE public.gst_filings SET workflow_status = 'FILED', signed_by_user_id = $2 WHERE id = $1`, [fid, U.sA]);
    }),
    /RBAC_SECURITY_VIOLATION/,
  );
});

test('Maker-checker: a context with no user cannot mark a return FILED', async () => {
  await assert.rejects(
    asApp(ctx(F.A, null), async (tx) => {
      await tx.query(
        `INSERT INTO public.gst_filings (firm_id, entity_id, gst_registration_id, return_period, return_type, workflow_status, statutory_due_date)
         VALUES ($1, $2, $3, '2026-06', 'GSTR3B', 'FILED', '2026-07-20')`,
        [F.A, E.A1, R.A1],
      );
    }),
    /RBAC_SECURITY_VIOLATION|row-level security/,
  );
});

test('Maker-checker: the preparer cannot sign their own return', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.pA), async (tx) => {
      const fid = await newGstFiling(tx, { period: '2026-05', createdBy: U.pA });
      await tx.query(`UPDATE public.gst_filings SET workflow_status = 'FILED', signed_by_user_id = $2 WHERE id = $1`, [fid, U.pA]);
    }),
    /SEGREGATION_OF_DUTIES_VIOLATION/,
  );
});

test('Maker-checker: a partner files a return prepared by staff; a delegated manager may too', async () => {
  await asApp(ctx(F.A, U.sA), (tx) => newGstFiling(tx, { period: '2026-04' }));
  await asApp(ctx(F.A, U.pA), (tx) =>
    tx.query(`UPDATE public.gst_filings SET workflow_status = 'FILED', signed_by_user_id = $1 WHERE return_period = '2026-04' AND return_type = 'GSTR3B'`, [U.pA]),
  );
  await asApp(ctx(F.A, U.sA), (tx) => newGstFiling(tx, { period: '2026-03' }));
  await asApp(ctx(F.A, U.mA), (tx) =>
    tx.query(`UPDATE public.gst_filings SET workflow_status = 'FILED', signed_by_user_id = $1 WHERE return_period = '2026-03' AND return_type = 'GSTR3B'`, [U.mA]),
  );
  const filed = (await db.query(`SELECT count(*)::int AS n FROM public.gst_filings WHERE workflow_status = 'FILED'`)).rows[0].n;
  assert.equal(filed, 2);
});

test('Period lock: sales invoices in a FILED GSTR-3B period cannot be inserted, edited or deleted', async () => {
  // Invoice created while the period was still open (2026-02), then the period is filed.
  const inv = id();
  await asApp(ctx(F.A, U.sA), async (tx) => {
    await tx.query(
      `INSERT INTO public.gst_invoices_sales (id, firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, pos_state_code, return_period)
       VALUES ($1, $2, $3, $4, 'SLK/25-26/101', '2026-02-10', 'INV', '03', '2026-02')`,
      [inv, F.A, E.A1, R.A1],
    );
    await newGstFiling(tx, { period: '2026-02' });
  });
  await asApp(ctx(F.A, U.pA), (tx) =>
    tx.query(`UPDATE public.gst_filings SET workflow_status = 'FILED', signed_by_user_id = $1 WHERE return_period = '2026-02' AND return_type = 'GSTR3B'`, [U.pA]),
  );
  await assert.rejects(asApp(ctx(F.A, U.sA), (tx) => tx.query(`UPDATE public.gst_invoices_sales SET taxable_value = 1 WHERE id = $1`, [inv])), /PERIOD_IMMUTABLE_LOCKED/);
  await assert.rejects(asApp(ctx(F.A, U.sA), (tx) => tx.query(`DELETE FROM public.gst_invoices_sales WHERE id = $1`, [inv])), /PERIOD_IMMUTABLE_LOCKED/);
  await assert.rejects(
    asApp(ctx(F.A, U.sA), (tx) =>
      tx.query(
        `INSERT INTO public.gst_invoices_sales (firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, pos_state_code, return_period)
         VALUES ($1, $2, $3, 'SLK/25-26/102', '2026-02-11', 'INV', '03', '2026-02')`,
        [F.A, E.A1, R.A1],
      ),
    ),
    /PERIOD_IMMUTABLE_LOCKED/,
  );
});

test('Filing types: GSTR-7 returns can be tracked', async () => {
  const fid = await asApp(ctx(F.A, U.sA), (tx) => newGstFiling(tx, { period: '2026-09', returnType: 'GSTR7' }));
  assert.ok(fid);
});

// ---------------------------------------------------------------------------
async function newChallan(tx, regime, taxYear) {
  const cid = id();
  await tx.query(
    `INSERT INTO public.tds_challans (id, firm_id, entity_id, tan_registration_id, challan_no, bsr_code, deposit_date, statutory_regime, tax_year, quarter, deductee_type_head)
     VALUES ($1, $2, $3, $4, $5, '0510308', $6, $7, $8, 'Q1', '0020')`,
    [cid, F.A, E.A1, T.A1, String(Math.floor(Math.random() * 1e5)).padStart(5, '0'), `${taxYear}-06-07`, regime, taxYear],
  );
  return cid;
}

test('ITNS 281N (2025 Act): a challan takes up to 20 sections and refuses the 21st', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.sA), async (tx) => {
      const cid = await newChallan(tx, 'IT_ACT_2025', 2026);
      for (let i = 1; i <= 20; i++) {
        await tx.query(`INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code) VALUES ($1, $2, $3, $4)`, [F.A, E.A1, cid, `S${i}`]);
      }
      const n = (await tx.query('SELECT count(*)::int AS n FROM public.tds_challan_section_allocations WHERE challan_id = $1', [cid])).rows[0].n;
      assert.equal(n, 20);
      await tx.query(`INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code) VALUES ($1, $2, $3, 'S21')`, [F.A, E.A1, cid]);
    }),
    /cannot exceed 20 section/,
  );
});

test('ITNS 281 (1961 Act): a challan takes exactly one section', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.sA), async (tx) => {
      const cid = await newChallan(tx, 'IT_ACT_1961', 2025);
      await tx.query(`INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code) VALUES ($1, $2, $3, '194C')`, [F.A, E.A1, cid]);
      await tx.query(`INSERT INTO public.tds_challan_section_allocations (firm_id, entity_id, challan_id, section_code) VALUES ($1, $2, $3, '194J')`, [F.A, E.A1, cid]);
    }),
    /exactly 1 section/,
  );
});

test('TDS: deductee rows are audited', async () => {
  const dedId = id();
  await asApp(ctx(F.A, U.sA), async (tx) => {
    const cid = await newChallan(tx, 'IT_ACT_2025', 2026);
    const alloc = id();
    await tx.query(`INSERT INTO public.tds_challan_section_allocations (id, firm_id, entity_id, challan_id, section_code) VALUES ($1, $2, $3, $4, '393(1)')`, [alloc, F.A, E.A1, cid]);
    await tx.query(
      `INSERT INTO public.tds_deductees (id, firm_id, entity_id, tan_registration_id, challan_id, section_allocation_id, deductee_pan, deductee_name, payment_credit_date, tds_rate, deduction_date)
       VALUES ($1, $2, $3, $4, $5, $6, 'PANNOTAVBL', 'Unregistered contractor', '2026-05-10', 0.2000, '2026-05-10')`,
      [dedId, F.A, E.A1, T.A1, cid, alloc],
    );
  });
  const n = (await db.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs WHERE record_id = $1`, [dedId])).rows[0].n;
  assert.equal(n, 1);
});

// ---------------------------------------------------------------------------
test('Global tables: the app role can read but not change compliance feature flags', async () => {
  await asApp(ctx(F.A, U.pA), (tx) => tx.query('SELECT count(*) FROM public.compliance_feature_flags'));
  await assert.rejects(
    asApp(ctx(F.A, U.pA), (tx) => tx.query(`INSERT INTO public.compliance_feature_flags (flag_key, description, statutory_body) VALUES ('x', 'x', 'GSTN')`)),
    /permission denied/,
  );
});

test('Billing: payment status cannot be flipped by forging the actor kind setting', async () => {
  const subId = id();
  const invId = id();
  await db.query(
    `INSERT INTO public.firm_subscriptions (id, firm_id, plan_code, current_period_start, current_period_end, plan_base_amount)
     VALUES ($1, $2, 'SOLO_PRACTITIONER', '2026-11-01', '2027-10-31', 8999.00)`,
    [subId, F.A],
  );
  await db.query(
    `INSERT INTO public.subscription_invoices (id, invoice_number, firm_id, subscription_id, invoice_date, due_date, recipient_state_code, base_amount)
     VALUES ($1, 'SYN/26-27/0001', $2, $3, '2026-11-01', '2026-11-15', '03', 8999.00)`,
    [invId, F.A, subId],
  );
  // A signed partner (USER) cannot mark an invoice paid.
  await assert.rejects(
    asApp(ctx(F.A, U.pA), (tx) => tx.query(`UPDATE public.subscription_invoices SET payment_status = 'PAID' WHERE id = $1`, [invId])),
    /SECURITY_VIOLATION/,
  );
  // Forging the actor kind setting voids the context: the update reaches no rows.
  const changed = await asApp(ctx(F.A, U.pA), async (tx) => {
    await tx.query(`SELECT set_config('app.actor_kind', 'SYSTEM_JOB', true)`);
    return (await tx.query(`UPDATE public.subscription_invoices SET payment_status = 'PAID' WHERE id = $1`, [invId])).affectedRows;
  });
  assert.equal(changed, 0);
  // Only a signed SYSTEM_JOB (payment webhook) may settle it.
  await asApp(ctx(F.A, null, { actorKind: 'SYSTEM_JOB' }), (tx) =>
    tx.query(`UPDATE public.subscription_invoices SET payment_status = 'PAID', paid_at = now() WHERE id = $1`, [invId]),
  );
  const status = (await db.query('SELECT payment_status FROM public.subscription_invoices WHERE id = $1', [invId])).rows[0].payment_status;
  assert.equal(status, 'PAID');
});

test('Form 144 remittance code registry exists and is read-only for the app', async () => {
  await asApp(ctx(F.A, U.pA), (tx) => tx.query('SELECT count(*) FROM public.tds_remittance_tax_codes'));
  await assert.rejects(
    asApp(ctx(F.A, U.pA), (tx) => tx.query(`INSERT INTO public.tds_remittance_tax_codes (regime, form_code, code, description) VALUES ('IT_ACT_2025', '144', 'X1', 'x')`)),
    /permission denied/,
  );
});

// ---------------------------------------------------------------------------
// 0011: auth module and provisioning
async function asAuth(fn) {
  return db.transaction(async (tx) => {
    await tx.query('SET LOCAL ROLE synextax_auth');
    return fn(tx);
  });
}

test('Auth role: reads identities and firm memberships, but no tenant table directly', async () => {
  const found = await asAuth(async (tx) => (await tx.query(`SELECT count(*)::int AS n FROM auth.identities WHERE email_normalized = 'partner.a@example.test'`)).rows[0].n);
  assert.equal(found, 1);
  const memberships = await asAuth(async (tx) => {
    const ident = (await tx.query(`SELECT id FROM auth.identities WHERE email_normalized = 'partner.a@example.test'`)).rows[0].id;
    return (await tx.query('SELECT firm_id, role FROM app.list_memberships($1)', [ident])).rows;
  });
  assert.deepEqual(memberships, [{ firm_id: F.A, role: 'PARTNER' }]);
  await assert.rejects(asAuth((tx) => tx.query('SELECT * FROM public.users')), /permission denied/);
  await assert.rejects(asAuth((tx) => tx.query('DELETE FROM auth.sessions')), /permission denied/);
});

test('Provisioning: a signed system job creates its own firm and first partner', async () => {
  const firmId = id();
  const userId = id();
  const identId = (await db.query(`INSERT INTO auth.identities (email) VALUES ('new.partner@example.test') RETURNING id`)).rows[0].id;
  await asApp(ctx(firmId, null, { actorKind: 'SYSTEM_JOB' }), async (tx) => {
    await tx.query(`INSERT INTO public.firms (id, legal_name, firm_kind, trial_ends_at) VALUES ($1, 'New Trial Firm', 'CA_FIRM', now() + interval '14 days')`, [firmId]);
    await tx.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role) VALUES ($1, $2, $3, 'New Partner', 'PARTNER')`, [userId, firmId, identId]);
  });
  const audit = (await db.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs WHERE firm_id = $1 AND actor_kind = 'SYSTEM_JOB'`, [firmId])).rows[0].n;
  assert.equal(audit, 2, 'firm and user creation are audited as a system job');
  // The new partner can now work in the firm under a normal user context.
  const seen = await asApp(ctx(firmId, userId), async (tx) => (await tx.query('SELECT id FROM public.firms')).rows.map((r) => r.id));
  assert.deepEqual(seen, [firmId]);
});

test('Provisioning: a system job cannot create a firm other than the one it was signed for', async () => {
  await assert.rejects(
    asApp(ctx(id(), null, { actorKind: 'SYSTEM_JOB' }), (tx) => tx.query(`INSERT INTO public.firms (id, legal_name, firm_kind) VALUES ($1, 'Other', 'CA_FIRM')`, [id()])),
    /row-level security/,
  );
});

test('Provisioning: staff cannot add users; a user-signed context is not a system job', async () => {
  await assert.rejects(
    asApp(ctx(F.A, U.sA), (tx) =>
      tx.query(`INSERT INTO public.users (firm_id, identity_id, display_name, role) SELECT $1, id, 'Sneaky', 'PARTNER' FROM auth.identities LIMIT 1`, [F.A]),
    ),
    /row-level security|permission denied/,
  );
});

// ---------------------------------------------------------------------------
// 0014: document checklists
test('Checklists: staff work on their assigned clients only, and every change is audited', async () => {
  const checklistId = id();
  await asApp(ctx(F.A, U.sA), async (tx) => {
    await tx.query(
      `INSERT INTO public.doc_checklists (id, firm_id, entity_id, service, period_label, due_date) VALUES ($1, $2, $3, 'GST_MONTHLY', 'Oct 2026', '2026-11-05')`,
      [checklistId, F.A, E.A1],
    );
    await tx.query(
      `INSERT INTO public.doc_checklist_items (firm_id, entity_id, checklist_id, position, label) VALUES ($1, $2, $3, 1, 'Sales invoices')`,
      [F.A, E.A1, checklistId],
    );
  });
  // E.A2 is not assigned to this staff member.
  await assert.rejects(
    asApp(ctx(F.A, U.sA), (tx) =>
      tx.query(`INSERT INTO public.doc_checklists (firm_id, entity_id, service, period_label, due_date) VALUES ($1, $2, 'GST_MONTHLY', 'Oct 2026', '2026-11-05')`, [F.A, E.A2]),
    ),
    /row-level security/,
  );
  const otherFirm = await asApp(ctx(F.B, U.pB), async (tx) => (await tx.query('SELECT count(*)::int AS n FROM public.doc_checklist_items')).rows[0].n);
  assert.equal(otherFirm, 0);
  const audited = (await db.query(`SELECT count(*)::int AS n FROM audit.immutable_audit_logs WHERE table_name IN ('doc_checklists','doc_checklist_items') AND firm_id = $1`, [F.A])).rows[0].n;
  assert.ok(audited >= 2);
});

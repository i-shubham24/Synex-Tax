import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { correctionTypesNeeded, parseConsoFile } from '@synextax/tax-engine';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, so RLS and the version table rules run for real.
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
  `2^BH^1^1^140^^^${TOKEN}^${TOKEN}^^^^AMRG04217D^^AAJCG7392L^202728^202627^Q1^GOLDEN GATE^INDIA^7U^^^^^19^789098^A@B.COM^91^6789087657^^K^R SHARMA^CEO^7U^^^^^19^789098^A@B.COM^^91^0987678909^^11200.00^^^^^N^^^^^^^ABCPS1234K^^^^^^^^^^^^^^`,
  '3^CD^1^1^2^N^^10000.00^1000.00^100.00^100.00^11200.00^C^^3000012^^00123^^30042026^^1900.00^1900.00^200^1000.00^100.00^^^^^',
  '4^DD^1^1^1^O^^BRNPA6778G^ABCD^^^^^^1008^^^^02052026^1000.00^^^^900.00^900.00^^02052026^03.0000^^^^^^^^^^^^^^^^^^',
  '5^DD^1^2^1^O^^BRNPA6780K^WXYZ^^^^^^1008^^^^10052026^5000.00^^^^1000.00^1000.00^^10052026^03.0000^^^^^^^^^^^^^^^^^^',
].join('\r\n');

async function partner(app: ReturnType<typeof buildApp>) {
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  assert.equal(demo.statusCode, 200, demo.body);
  return { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
}

/** A staff member of the demo firm, assigned the TAN's client, with a signed access token. */
async function staff(app: ReturnType<typeof buildApp>) {
  const tan = (await devDb.db.query(`SELECT t.firm_id, t.entity_id FROM public.tan_registrations t WHERE t.tan = 'AMRG04217D'`)).rows[0] as { firm_id: string; entity_id: string };
  const by = (await devDb.db.query(`SELECT id FROM public.users WHERE firm_id = $1 AND role = 'PARTNER' LIMIT 1`, [tan.firm_id])).rows[0] as { id: string };
  const ident = (await devDb.db.query(`INSERT INTO auth.identities (email, mfa_required) VALUES ('staff.drafts@example.com', false) RETURNING id`)).rows[0] as { id: string };
  const user = (await devDb.db.query(`INSERT INTO public.users (firm_id, identity_id, display_name, role) VALUES ($1, $2, 'Drafts Staff', 'STAFF') RETURNING id`, [tan.firm_id, ident.id])).rows[0] as { id: string };
  await devDb.db.query(`INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, assigned_by) VALUES ($1, $2, $3, $4)`, [tan.firm_id, user.id, tan.entity_id, by.id]);
  await app.ready();
  const token = app.jwt.sign({ userId: user.id, firmId: tan.firm_id, identityId: ident.id, role: 'STAFF', email: 'staff.drafts@example.com', displayName: 'Drafts Staff' });
  return { authorization: `Bearer ${token}` };
}

test('Correction drafts: create, save with If-Match, versions, revert, CSV, staff read only, delete', async () => {
  const app = buildApp();
  const auth = await partner(app);
  const url = '/api/v1/tds/correction-drafts';

  const created = await app.inject({ method: 'POST', url, headers: auth, payload: { text: CONSO, title: 'Q1 fixes', edits: { deductees: [{ challanNo: 1, recordNo: 1, pan: 'BRNPA6779H' }] } } });
  assert.equal(created.statusCode, 201, created.body);
  const d1 = JSON.parse(created.body);
  assert.deepEqual([d1.tan, d1.form, d1.taxYear, d1.quarter, d1.currentVersion], ['AMRG04217D', '140', 2026, 1, 1]);
  assert.equal(d1.edits.deductees[0].pan, 'XXXXX6779H', 'saved PANs leave masked');
  assert.equal(d1.conso.challans[0].deductees[0].pan, 'XXXXX6778G');
  assert.deepEqual(d1.needed, ['C5']);
  const etag1 = created.headers.etag as string;
  assert.ok(etag1);

  const dup = await app.inject({ method: 'POST', url, headers: auth, payload: { text: CONSO } });
  assert.equal(dup.statusCode, 409);
  assert.equal(JSON.parse(dup.body).id, d1.id);

  // Save sends back the masked PAN it was shown, plus a new change; the full PAN is kept.
  const save = await app.inject({
    method: 'PUT', url: `${url}/${d1.id}`, headers: { ...auth, 'if-match': etag1 },
    payload: { edits: { deductees: [{ challanNo: 1, recordNo: 1, pan: 'XXXXX6779H' }, { challanNo: 1, recordNo: 2, name: 'WXYZ TRADERS' }] }, note: 'Name fixed' },
  });
  assert.equal(save.statusCode, 200, save.body);
  const d2 = JSON.parse(save.body);
  assert.equal(d2.currentVersion, 2);
  assert.deepEqual(d2.needed, ['C5', 'C3']);
  const stored = (await devDb.db.query(`SELECT edits FROM public.tds_correction_drafts WHERE id = $1`, [d1.id])).rows[0] as { edits: { deductees: { pan?: string }[] } };
  assert.equal(stored.edits.deductees[0].pan, 'BRNPA6779H');

  const staleSave = await app.inject({ method: 'PUT', url: `${url}/${d1.id}`, headers: { ...auth, 'if-match': etag1 }, payload: { edits: { deductees: [] } } });
  assert.equal(staleSave.statusCode, 409);
  const unknownPan = await app.inject({ method: 'PUT', url: `${url}/${d1.id}`, headers: auth, payload: { edits: { added: [{ challanNo: 1, pan: 'XXXXX0000Z', name: 'N', section: '1008', paidOn: '2026-05-01', amount: '100', deducted: '1' }] } } });
  assert.equal(unknownPan.statusCode, 400);
  assert.match(JSON.parse(unknownPan.body).message, /full PAN/);

  // Built from the saved draft: the first type is the PAN correction.
  const build = await app.inject({ method: 'POST', url: `${url}/${d1.id}/build`, headers: auth, payload: {} });
  assert.equal(build.statusCode, 200, build.body);
  const b = JSON.parse(build.body);
  assert.equal(b.type, 'C5');
  assert.match(b.text, /\^BRNPA6779H\^/);

  // Revert to version 1: a new version 3 with version 1's changes.
  const rev = await app.inject({ method: 'POST', url: `${url}/${d1.id}/versions/1/revert`, headers: { ...auth, 'if-match': save.headers.etag as string }, payload: {} });
  assert.equal(rev.statusCode, 200, rev.body);
  const d3 = JSON.parse(rev.body);
  assert.equal(d3.currentVersion, 3);
  assert.equal(d3.edits.deductees.length, 1);
  const versions = JSON.parse((await app.inject({ method: 'GET', url: `${url}/${d1.id}/versions`, headers: auth })).body).versions;
  assert.deepEqual(versions.map((v: { version: number; revertedFrom: number | null }) => [v.version, v.revertedFrom]), [[3, 1], [2, null], [1, null]]);
  assert.deepEqual(versions.map((v: { consoChanged: boolean }) => v.consoChanged), [false, false, true], 'the file is kept once');

  // Versions are append-only, even for the owner.
  await assert.rejects(devDb.db.query(`UPDATE public.tds_correction_draft_versions SET note = 'x' WHERE draft_id = $1`, [d1.id]), /APPEND_ONLY/);

  // CSV: masked by default; a partner gets full PANs with a reason, logged.
  const masked = await app.inject({ method: 'POST', url: `${url}/${d1.id}/export-csv`, headers: auth, payload: {} });
  assert.equal(masked.statusCode, 200, masked.body);
  const csv = JSON.parse(masked.body).csv as string;
  assert.match(csv, /^challan,row,pan,name/);
  assert.ok(csv.includes('XXXXX6779H') && !csv.includes('BRNPA'), 'no full PAN in a masked export');
  const noReason = await app.inject({ method: 'POST', url: `${url}/${d1.id}/export-csv`, headers: auth, payload: { revealPans: true } });
  assert.equal(noReason.statusCode, 400);
  const before = Number(((await devDb.db.query(`SELECT count(*) FROM audit.pii_access_logs WHERE record_id = $1`, [d1.id])).rows[0] as { count: string }).count);
  const full = await app.inject({ method: 'POST', url: `${url}/${d1.id}/export-csv`, headers: auth, payload: { revealPans: true, reason: 'Checking PANs with the client' } });
  assert.equal(full.statusCode, 200, full.body);
  assert.ok(JSON.parse(full.body).csv.includes('BRNPA6779H'));
  const logged = Number(((await devDb.db.query(`SELECT count(*) FROM audit.pii_access_logs WHERE record_id = $1`, [d1.id])).rows[0] as { count: string }).count);
  assert.equal(logged, before + 1);

  // Import the masked CSV with one amount changed and one new row: masked PANs are kept as they were.
  const lines = csv.trim().split('\r\n');
  lines[2] = lines[2].replace(',5000.00,', ',5500.00,');
  lines.push('1,,ABCPE1234F,New Payee,1008,01/06/2026,1000,30,,2026-06-01,3,,');
  const imp = await app.inject({ method: 'POST', url: `${url}/${d1.id}/import-csv`, headers: auth, payload: { csv: lines.join('\r\n') } });
  assert.equal(imp.statusCode, 200, imp.body);
  const d4 = JSON.parse(imp.body);
  assert.deepEqual(d4.imported, { changedRows: 2, newRows: 1 });
  assert.equal(d4.currentVersion, 4);
  const e4 = ((await devDb.db.query(`SELECT edits FROM public.tds_correction_drafts WHERE id = $1`, [d1.id])).rows[0] as { edits: unknown }).edits as { deductees: { recordNo: number; pan?: string; amount?: string }[]; added: { pan: string; paidOn: string }[] };
  assert.equal(e4.deductees.find((x) => x.recordNo === 1)?.pan, 'BRNPA6779H');
  assert.equal(e4.deductees.find((x) => x.recordNo === 2)?.amount, '5500.00');
  assert.deepEqual([e4.added[0].pan, e4.added[0].paidOn], ['ABCPE1234F', '2026-06-01']);
  const badCsv = await app.inject({ method: 'POST', url: `${url}/${d1.id}/import-csv`, headers: auth, payload: { csv: 'challan,row,pan,name,section,paid_on,amount,deducted,deposited,deducted_on,rate,reason,certificate\r\n9,1,,,,,,,,,,,' } });
  assert.equal(badCsv.statusCode, 422);

  // Staff assigned to the client read, but do not write or reveal.
  const s = await staff(app);
  const list = await app.inject({ method: 'GET', url: `${url}?tan=AMRG04217D`, headers: s });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(JSON.parse(list.body).drafts.length, 1);
  assert.equal((await app.inject({ method: 'GET', url: `${url}/${d1.id}`, headers: s })).statusCode, 200);
  assert.equal((await app.inject({ method: 'PUT', url: `${url}/${d1.id}`, headers: s, payload: { edits: {} } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `${url}/${d1.id}/export-csv`, headers: s, payload: { revealPans: true, reason: 'want to see' } })).statusCode, 403);

  // Delete hides the draft; a new one can then be made for the quarter.
  const del = await app.inject({ method: 'DELETE', url: `${url}/${d1.id}`, headers: auth });
  assert.equal(del.statusCode, 200, del.body);
  assert.equal((await app.inject({ method: 'GET', url: `${url}/${d1.id}`, headers: auth })).statusCode, 404);
  const again = await app.inject({ method: 'POST', url, headers: auth, payload: { text: CONSO } });
  assert.equal(again.statusCode, 201, again.body);
  await app.close();
});

// C1 and C2 reach the API through the built tax engine (packages/tax-engine/dist).
const engineHasC1 = correctionTypesNeeded(parseConsoFile(CONSO), { deductor: { name: 'X' } } as never).includes('C1' as never);
test('Corrections build: C1 deductor details and C2 challan details', { skip: !engineHasC1 && 'tax-engine dist predates C1 and C2; run npm run build in packages/tax-engine' }, async () => {
  const app = buildApp();
  const auth = await partner(app);
  const c1 = await app.inject({ method: 'POST', url: '/api/v1/tds/corrections/build', headers: auth, payload: { text: CONSO, edits: { deductor: { email: 'accounts@goldengate.example', responsible: { pan: 'XXXXX1234K' } } } } });
  assert.equal(c1.statusCode, 400, 'a masked PAN is refused outside a draft');
  const ok = await app.inject({ method: 'POST', url: '/api/v1/tds/corrections/build', headers: auth, payload: { text: CONSO, edits: { deductor: { email: 'accounts@goldengate.example' } } } });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(JSON.parse(ok.body).type, 'C1');
  const c2 = await app.inject({ method: 'POST', url: '/api/v1/tds/corrections/build', headers: auth, payload: { text: CONSO, edits: { challans: [{ recordNo: 1, interest: '1500' }] } } });
  assert.equal(c2.statusCode, 200, c2.body);
  assert.equal(JSON.parse(c2.body).type, 'C2');
  await app.close();
});

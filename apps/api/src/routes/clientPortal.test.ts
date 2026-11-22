import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, so auth and RLS run for real.
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

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 9)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 1)]);

type App = ReturnType<typeof buildApp>;
interface Setup {
  app: App;
  firmId: string;
  partner: Record<string, string>;
  partnerId: string;
  client: Record<string, string>;
  clientId: string;
  entityA: string;
  entityB: string;
  dir: string;
}

/** The demo firm, a CLIENT login assigned to entity A only, and a temporary file store. */
async function setup(): Promise<Setup> {
  const { LocalFileStore, setFileStore } = await import('../modules/storage/fileStore.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synextax-client-'));
  setFileStore(new LocalFileStore(dir));
  const app = buildApp();
  await app.ready();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const token = JSON.parse(demo.body).accessToken;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

  const ents = (await devDb.db.query(`SELECT id, client_group_id FROM public.entities WHERE firm_id = $1 ORDER BY legal_name`, [claims.firmId])).rows as Array<{ id: string; client_group_id: string }>;
  assert.ok(ents.length >= 1, 'the demo firm has clients');
  const entityA = ents[0].id;
  let entityB = ents.find((e) => e.client_group_id !== ents[0].client_group_id)?.id;
  if (!entityB) {
    // A second client in its own group, so a group assignment to A cannot reach it.
    const group = crypto.randomUUID();
    entityB = crypto.randomUUID();
    await devDb.db.query(`INSERT INTO public.client_groups (id, firm_id, name) VALUES ($1, $2, $3)`, [group, claims.firmId, `Other group ${group.slice(0, 8)}`]);
    const pan = `ZZZPZ${String(Math.floor(Math.random() * 9000) + 1000)}Z`;
    await devDb.db.query(`INSERT INTO public.entities (id, firm_id, client_group_id, legal_name, pan, constitution) VALUES ($1, $2, $3, 'Other Client Pvt Ltd', $4, 'PRIVATE_LIMITED')`, [entityB, claims.firmId, group, pan]);
  }

  const identity = crypto.randomUUID();
  const clientId = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', false, 'ACTIVE')`, [identity, `client-${identity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'Client Contact', 'CLIENT', 'ACTIVE')`, [clientId, claims.firmId, identity]);
  await devDb.db.query(
    `INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, access_level, assigned_by) VALUES ($1, $2, $3, 'CLIENT_PORTAL', $4)`,
    [claims.firmId, clientId, entityA, claims.userId],
  );
  const clientToken = app.jwt.sign({ userId: clientId, firmId: claims.firmId, identityId: identity, role: 'CLIENT', email: 'client@example.test', displayName: 'Client Contact' });
  return {
    app,
    firmId: claims.firmId,
    partner: { authorization: `Bearer ${token}` },
    partnerId: claims.userId,
    client: { authorization: `Bearer ${clientToken}` },
    clientId,
    entityA,
    entityB,
    dir,
  };
}

async function teardown(s: Setup) {
  const { setFileStore } = await import('../modules/storage/fileStore.js');
  setFileStore(undefined);
  await s.app.close();
}

const asClient = async <T>(s: Setup, fn: (c: import('pg').PoolClient) => Promise<T>) => {
  const { db } = await import('../db/pool.js');
  return db.withTenantTransaction({ firmId: s.firmId, userId: s.clientId, actorKind: 'CLIENT_PORTAL' }, fn);
};

test('Client portal: a client login sees only its own entity, with PAN masked; roles are kept apart', async () => {
  const s = await setup();
  const { app } = s;
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/client/me' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/client/me', headers: s.partner })).statusCode, 403, 'the firm uses its own screens');
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/client/firm/conversations', headers: s.client })).statusCode, 403, 'a client cannot open the firm inbox');

  const me = await app.inject({ method: 'GET', url: '/api/v1/client/me', headers: s.client });
  assert.equal(me.statusCode, 200, me.body);
  const body = JSON.parse(me.body);
  assert.deepEqual(body.entities.map((e: { id: string }) => e.id), [s.entityA]);
  assert.match(body.entities[0].pan, /^XXXXX\d{4}[A-Z]$/);
  assert.doesNotMatch(me.body, /\b(?!XXXXX)[A-Z]{5}\d{4}[A-Z]\b/, 'no full PAN');
  assert.ok(body.firm.length > 0);

  // Filing status: only the client's own returns, status and period.
  const filings = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/filings', headers: s.client })).body);
  for (const g of filings.gst) assert.equal(g.entityId, s.entityA);
  for (const t of filings.tds) assert.equal(t.entityId, s.entityA);
  for (const g of filings.gst) assert.deepEqual(Object.keys(g).sort(), ['entityId', 'entityName', 'period', 'returnType', 'status']);

  // The database itself keeps the client inside its own rows.
  const seen = await asClient(s, async (c) => ({
    users: (await c.query('SELECT id FROM public.users')).rows.map((r) => r.id),
    assignments: (await c.query('SELECT user_id FROM public.user_client_assignments')).rows.map((r) => r.user_id),
    entities: (await c.query('SELECT id FROM public.entities')).rows.map((r) => r.id),
    groups: (await c.query('SELECT count(*)::int AS n FROM public.client_groups')).rows[0].n,
    renamed: (await c.query(`UPDATE public.entities SET trade_name = 'Changed by client' WHERE id = $1`, [s.entityA])).rowCount,
  }));
  assert.deepEqual(seen.users, [s.clientId], 'only its own user row');
  assert.deepEqual([...new Set(seen.assignments)], [s.clientId], 'only its own assignments');
  assert.deepEqual(seen.entities, [s.entityA]);
  assert.equal(seen.groups, 1);
  assert.equal(seen.renamed, 0, 'a client cannot edit its entity');
  await assert.rejects(asClient(s, (c) => c.query(`INSERT INTO public.client_groups (firm_id, name) VALUES ($1, 'Client made')`, [s.firmId])));
  await teardown(s);
});

test('Client portal: checklists of the client only, upload onto an item, refused for others and for bad files', async () => {
  const s = await setup();
  const { app } = s;
  const make = async (entityId: string, label: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/practice/checklists', headers: s.partner, payload: { entityId, service: 'GST_MONTHLY', periodLabel: label, dueDate: '2026-12-11' } });
    assert.equal(r.statusCode, 201, r.body);
    return JSON.parse(r.body).id as string;
  };
  const mine = await make(s.entityA, 'Client portal A');
  const other = await make(s.entityB, 'Client portal B');

  const lists = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/checklists', headers: s.client })).body).checklists;
  assert.ok(lists.some((l: { id: string }) => l.id === mine));
  assert.ok(!lists.some((l: { id: string }) => l.id === other), 'another client’s checklist is not shown');
  const item = lists.find((l: { id: string }) => l.id === mine).items[0];
  assert.equal(item.status, 'MISSING');

  const otherItem = (await devDb.db.query(`SELECT id FROM public.doc_checklist_items WHERE checklist_id = $1 ORDER BY position LIMIT 1`, [other])).rows[0] as { id: string };
  const url = (id: string) => `/api/v1/client/checklists/items/${id}/file`;
  assert.equal((await app.inject({ method: 'POST', url: url(otherItem.id), headers: { ...s.client, 'content-type': 'image/jpeg' }, payload: JPEG })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: url(item.id), headers: { ...s.client, 'content-type': 'application/octet-stream' }, payload: EXE })).statusCode, 415);
  const up = await app.inject({ method: 'POST', url: url(item.id), headers: { ...s.client, 'content-type': 'image/jpeg', 'x-file-name': 'bank%20statement.jpg' }, payload: JPEG });
  assert.equal(up.statusCode, 201, up.body);

  const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/checklists', headers: s.client })).body).checklists.find((l: { id: string }) => l.id === mine);
  assert.equal(after.items[0].status, 'RECEIVED');
  assert.equal(after.items[0].files, 1);
  const file = (await devDb.db.query(`SELECT uploaded_via, uploaded_by, sha256, original_name FROM public.doc_files WHERE item_id = $1`, [item.id])).rows[0] as Record<string, string>;
  assert.deepEqual([file.uploaded_via, file.uploaded_by, file.original_name], ['PORTAL', s.clientId, 'bank statement.jpg']);
  assert.equal(file.sha256, crypto.createHash('sha256').update(JPEG).digest('hex'));

  // Staff see the file the client sent.
  const files = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/checklists/${mine}/files`, headers: s.partner })).body).files;
  assert.equal(files.length, 1);

  // A client may only mark a needed item received; it cannot accept items or rename them.
  await assert.rejects(asClient(s, (c) => c.query(`UPDATE public.doc_checklist_items SET status = 'ACCEPTED' WHERE id = $1`, [item.id])), /CLIENT_READ_ONLY/);
  const second = lists.find((l: { id: string }) => l.id === mine).items[1];
  if (second) await assert.rejects(asClient(s, (c) => c.query(`UPDATE public.doc_checklist_items SET label = 'x', status = 'RECEIVED', received_via = 'PORTAL' WHERE id = $1`, [second.id])), /CLIENT_READ_ONLY/);
  await teardown(s);
});

test('Messages: encrypted at rest, both sides read and reply, read receipts, attachments, and RLS on entities', async () => {
  const s = await setup();
  const { app } = s;
  const secret = 'Please file GSTR-3B; bank statement attached separately.';
  const post = await app.inject({ method: 'POST', url: '/api/v1/client/messages', headers: s.client, payload: { entityId: s.entityA, body: secret } });
  assert.equal(post.statusCode, 201, post.body);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/client/messages', headers: s.client, payload: { entityId: s.entityB, body: 'hello' } })).statusCode, 404, 'not to another client');
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/client/messages', headers: s.client, payload: { entityId: s.entityA, body: 'x'.repeat(4001) } })).statusCode, 400);

  // Stored as ciphertext, bound to its row.
  const raw = (await devDb.db.query(`SELECT body_ciphertext, sender_side, sender_user_id, read_by_client_at, read_by_firm_at FROM public.client_messages WHERE id = $1`, [JSON.parse(post.body).id])).rows[0] as any;
  assert.ok(!Buffer.from(raw.body_ciphertext).includes(Buffer.from('GSTR-3B')), 'no plaintext in the database');
  assert.deepEqual([raw.sender_side, raw.sender_user_id, raw.read_by_firm_at], ['CLIENT', s.clientId, null]);
  assert.ok(raw.read_by_client_at);
  const audit = (await devDb.db.query(`SELECT new_data FROM audit.immutable_audit_logs WHERE table_name = 'client_messages' AND record_id = $1`, [JSON.parse(post.body).id])).rows[0] as any;
  assert.ok(audit && !('body_ciphertext' in audit.new_data), 'the audit trail leaves the body out');

  // The firm's inbox.
  const inbox = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/firm/conversations', headers: s.partner })).body);
  const conv = inbox.conversations.find((c: { entityId: string }) => c.entityId === s.entityA);
  assert.equal(conv.unread, 1);
  assert.equal(conv.preview, secret);
  assert.ok(conv.clientLogins >= 1);
  const thread = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/client/firm/conversations/${s.entityA}/messages`, headers: s.partner })).body);
  assert.equal(thread.messages.at(-1).body, secret);
  assert.equal(thread.messages.at(-1).senderName, 'Client Contact');
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/client/firm/conversations/${s.entityA}/read`, headers: s.partner })).statusCode, 200);
  assert.equal(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/firm/conversations', headers: s.partner })).body).conversations.find((c: { entityId: string }) => c.entityId === s.entityA).unread, 0);

  const reply = await app.inject({ method: 'POST', url: `/api/v1/client/firm/conversations/${s.entityA}/messages`, headers: s.partner, payload: { body: 'Received, thank you. Filing tomorrow.' } });
  assert.equal(reply.statusCode, 201, reply.body);
  const me = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/me', headers: s.client })).body);
  assert.equal(me.entities[0].unread, 1);
  const clientThread = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/client/messages?entityId=${s.entityA}`, headers: s.client })).body);
  assert.deepEqual(clientThread.messages.map((m: { side: string }) => m.side), ['CLIENT', 'FIRM']);
  assert.ok(clientThread.messages[0].readByFirmAt, 'the client sees that the firm read its message');
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/client/messages/read', headers: s.client, payload: { entityId: s.entityA } })).statusCode, 200);
  assert.equal(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/me', headers: s.client })).body).entities[0].unread, 0);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/messages?entityId=${s.entityB}`, headers: s.client })).statusCode, 404);

  // Attachments: magic bytes checked, stored once, downloadable by both sides.
  const bad = await app.inject({ method: 'POST', url: `/api/v1/client/messages/attachments?entityId=${s.entityA}`, headers: { ...s.client, 'content-type': 'application/pdf' }, payload: EXE });
  assert.equal(bad.statusCode, 415);
  const att = await app.inject({
    method: 'POST',
    url: `/api/v1/client/messages/attachments?entityId=${s.entityA}`,
    headers: { ...s.client, 'content-type': 'application/pdf', 'x-file-name': 'invoice%20oct.pdf', 'x-caption': encodeURIComponent('October purchase invoices') },
    payload: PDF,
  });
  assert.equal(att.statusCode, 201, att.body);
  const { attachmentId } = JSON.parse(att.body);
  const dlFirm = await app.inject({ method: 'GET', url: `/api/v1/client/firm/attachments/${attachmentId}`, headers: s.partner });
  assert.equal(dlFirm.statusCode, 200);
  assert.deepEqual(dlFirm.rawPayload, PDF);
  assert.equal(dlFirm.headers['x-content-type-options'], 'nosniff');
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/messages/attachments/${attachmentId}`, headers: s.client })).statusCode, 200);
  const withFile = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/client/messages?entityId=${s.entityA}`, headers: s.client })).body).messages.at(-1);
  assert.deepEqual([withFile.body, withFile.attachments[0].name], ['October purchase invoices', 'invoice oct.pdf']);

  // A staff member without entity A sees neither the conversation nor its files.
  const staffIdentity = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', false, 'ACTIVE')`, [staffIdentity, `staff-${staffIdentity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'Unassigned Staff', 'STAFF', 'ACTIVE')`, [staffId, s.firmId, staffIdentity]);
  const staff = { authorization: `Bearer ${app.jwt.sign({ userId: staffId, firmId: s.firmId, identityId: staffIdentity, role: 'STAFF', email: 'staff@example.test', displayName: 'Unassigned Staff' })}` };
  const staffInbox = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client/firm/conversations', headers: staff })).body);
  assert.ok(!staffInbox.conversations.some((c: { entityId: string }) => c.entityId === s.entityA));
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/firm/conversations/${s.entityA}/messages`, headers: staff })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/client/firm/conversations/${s.entityA}/messages`, headers: staff, payload: { body: 'hi' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/firm/attachments/${attachmentId}`, headers: staff })).statusCode, 404);

  // In the database: a message cannot be rewritten, a client cannot send as the firm, and read times are per side.
  await assert.rejects(asClient(s, (c) => c.query(`UPDATE public.client_messages SET sender_name = 'Someone else'`)));
  const conversationId = (await devDb.db.query(`SELECT id FROM public.client_conversations WHERE entity_id = $1`, [s.entityA])).rows[0] as { id: string };
  await assert.rejects(
    asClient(s, (c) =>
      c.query(
        `INSERT INTO public.client_messages (id, firm_id, entity_id, conversation_id, sender_user_id, sender_side, sender_name, body_ciphertext, read_by_firm_at)
         VALUES ($1, app.current_firm_id(), $2, $3, app.current_user_id(), 'FIRM', 'Fake firm', $4, now())`,
        [crypto.randomUUID(), s.entityA, conversationId.id, Buffer.alloc(40)],
      ),
    ),
  );
  // The attachment message is still unread by the firm; the client cannot mark it read for them.
  await assert.rejects(asClient(s, (c) => c.query(`UPDATE public.client_messages SET read_by_firm_at = now() WHERE read_by_firm_at IS NULL`)), /MESSAGE_IMMUTABLE/);
  await teardown(s);
});

test('Messages: the encryption key fails closed outside local development', async () => {
  const { messagesKey, encryptMessage, decryptMessage } = await import('../modules/messages/messageCrypto.js');
  assert.throws(() => messagesKey({ NODE_ENV: 'production' }), /MESSAGES_ENCRYPTION_KEY/);
  assert.throws(() => messagesKey({ NODE_ENV: 'production', MESSAGES_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }), /32 bytes/);
  assert.equal(messagesKey({ NODE_ENV: 'production', MESSAGES_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }).length, 32);
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()] as const;
  const blob = encryptMessage('hello', ...ids);
  assert.equal(decryptMessage(blob, ...ids), 'hello');
  assert.throws(() => decryptMessage(blob, ids[0], ids[1], crypto.randomUUID()), 'a body moved to another message does not decrypt');
});

test('Shared documents: only shared ones are listed, an unpaid one is held back with its invoice, opens are logged', async (t) => {
  const present = (await devDb.db.query(`SELECT to_regclass('public.client_documents') IS NOT NULL AS ok`)).rows[0] as { ok: boolean };
  if (!present.ok) {
    t.skip('migration 0031 (client documents) is not present; shared document endpoints answer 503 until it is');
    return;
  }
  const s = await setup();
  const { app } = s;
  const { getFileStore, storageKey } = await import('../modules/storage/fileStore.js');
  const store = getFileStore()!;
  const invoiceId = crypto.randomUUID();
  const invoiceNo = `CP${String(Date.now()).slice(-8)}`;
  await devDb.db.query(
    `INSERT INTO public.fee_invoices (id, firm_id, entity_id, invoice_no, invoice_date, kind, place_of_supply, lines, taxable, cgst, sgst, total)
     VALUES ($1, $2, $3, $4, '2026-11-01', 'TAX_INVOICE', '03', '[{"description":"GST returns","amount":"990000.00"}]', 990000, 89100, 89100, 1168200)`,
    [invoiceId, s.firmId, s.entityA, invoiceNo],
  );
  const doc = async (entityId: string, title: string, shared: boolean, locked: boolean) => {
    const id = crypto.randomUUID();
    const key = storageKey(s.firmId, entityId, 'pdf');
    await store.put(key, PDF);
    await devDb.db.query(
      `INSERT INTO public.client_documents (id, firm_id, entity_id, title, shared_with_client, locked_until_paid, fee_invoice_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, s.firmId, entityId, title, shared, locked, locked ? invoiceId : null],
    );
    await devDb.db.query(
      `INSERT INTO public.client_document_versions (firm_id, document_id, version, storage_key, original_name, mime_type, size_bytes, sha256) VALUES ($1, $2, 1, $3, $4, 'application/pdf', $5, $6)`,
      [s.firmId, id, key, `${title}.pdf`, PDF.length, crypto.createHash('sha256').update(PDF).digest('hex')],
    );
    return id;
  };
  const open = await doc(s.entityA, 'Computation', true, false);
  const held = await doc(s.entityA, 'Audit report', true, true);
  const hidden = await doc(s.entityA, 'Working papers', false, false);
  const others = await doc(s.entityB, 'Other client report', true, false);

  const list = await app.inject({ method: 'GET', url: '/api/v1/client/documents', headers: s.client });
  assert.equal(list.statusCode, 200, list.body);
  const docs = JSON.parse(list.body).documents as Array<{ id: string; locked: boolean; invoice: { number: string } | null }>;
  const ids = docs.map((d) => d.id);
  assert.ok(ids.includes(open) && ids.includes(held));
  assert.ok(!ids.includes(hidden) && !ids.includes(others));
  const heldRow = docs.find((d) => d.id === held)!;
  assert.equal(heldRow.locked, true);
  assert.equal(heldRow.invoice?.number, invoiceNo);

  const blocked = await app.inject({ method: 'GET', url: `/api/v1/client/documents/${held}/download`, headers: s.client });
  assert.equal(blocked.statusCode, 402);
  assert.match(JSON.parse(blocked.body).message, new RegExp(invoiceNo));
  const ok = await app.inject({ method: 'GET', url: `/api/v1/client/documents/${open}/download`, headers: s.client });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.rawPayload, PDF);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/documents/${hidden}/download`, headers: s.client })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/client/documents/${others}/download`, headers: s.client })).statusCode, 404);
  const opens = (await devDb.db.query(`SELECT user_id, version FROM public.client_document_opens WHERE document_id = $1`, [open])).rows as Array<{ user_id: string; version: number }>;
  assert.deepEqual(opens.map((o) => [o.user_id, o.version]), [[s.clientId, 1]]);

  // The client cannot release the document itself.
  await assert.rejects(asClient(s, (c) => c.query(`UPDATE public.client_documents SET fee_waived = true WHERE id = $1`, [held])), /CLIENT_READ_ONLY/);
  await teardown(s);
});

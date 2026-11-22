import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';
import { LocalFileStore, setFileStore } from '../modules/storage/fileStore.js';
import { detectDocument } from '../modules/documents/fileTypes.js';

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
  setFileStore(undefined);
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

/** A minimal ZIP with the given entry names (stored, empty). */
function zip(names: string[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const n of names) {
    const name = Buffer.from(n);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name]);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([ch, name]));
    locals.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('File types: recognised by their bytes; programs, macros and disguised files refused', () => {
  const ok = (b: Buffer, n: string) => {
    const d = detectDocument(b, n);
    return d.ok ? d.type.mime : `refused: ${d.reason}`;
  };
  assert.equal(ok(Buffer.from('%PDF-1.7 x'), 'a.pdf'), 'application/pdf');
  assert.equal(ok(zip(['[Content_Types].xml', 'xl/workbook.xml']), 'a.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(ok(zip(['[Content_Types].xml', 'word/document.xml']), 'a.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(ok(zip(['bills/march.pdf']), 'bills.zip'), 'application/zip');
  assert.match(ok(zip(['setup.exe']), 'bills.zip'), /refused/);
  assert.match(ok(zip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/vbaProject.bin']), 'a.xlsm'), /macros/);
  assert.equal(ok(Buffer.from('gstin,amount\n03AAAAA,100\n'), 'sales.csv'), 'text/csv');
  assert.match(ok(Buffer.from('gstin,amount\n'), 'sales.txt'), /refused/);
  assert.match(ok(Buffer.from('<script>alert(1)</script>,a'), 'x.csv'), /refused/);
  assert.match(ok(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]), 'invoice.pdf'), /Programs/);
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64), Buffer.from('WordDocument', 'utf16le')]);
  assert.equal(ok(ole, 'old.doc'), 'application/msword');
});

test('Documents: folders, upload, versions and restore, preview, share and fee lock, open log for partners', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synextax-docs-'));
  setFileStore(new LocalFileStore(dir));
  const app = buildApp();
  await app.ready();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const token = JSON.parse(demo.body).accessToken;
  const auth = { authorization: `Bearer ${token}` };
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const entities = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client-master/entities', headers: auth })).body);
  const entityId = (Array.isArray(entities) ? entities : entities.data ?? entities.entities)[0].id;

  // Folders: nested, names unique per level, no folder inside itself.
  const f1 = await app.inject({ method: 'POST', url: '/api/v1/practice/documents/folders', headers: auth, payload: { entityId, name: 'FY 2026-27' } });
  assert.equal(f1.statusCode, 201, f1.body);
  const top = JSON.parse(f1.body).id;
  const f2 = await app.inject({ method: 'POST', url: '/api/v1/practice/documents/folders', headers: auth, payload: { entityId, parentId: top, name: 'GST' } });
  assert.equal(f2.statusCode, 201);
  const sub = JSON.parse(f2.body).id;
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/practice/documents/folders', headers: auth, payload: { entityId, parentId: top, name: 'gst' } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/folders/${top}`, headers: auth, payload: { parentId: sub } })).statusCode, 400);

  // Upload: raw bytes, type from the bytes; an executable is refused.
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(500)]);
  const upload = (url: string, body: Buffer, name: string) => app.inject({ method: 'POST', url, headers: { ...auth, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) }, payload: body });
  const exe = await upload(`/api/v1/practice/documents/upload?entityId=${entityId}&folderId=${sub}`, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'notice.pdf');
  assert.equal(exe.statusCode, 415);
  const up = await upload(`/api/v1/practice/documents/upload?entityId=${entityId}&folderId=${sub}&title=GSTR-3B%20Oct`, pdf, 'gstr3b oct.pdf');
  assert.equal(up.statusCode, 201, up.body);
  const docId = JSON.parse(up.body).id;
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/practice/documents/upload?entityId=${entityId}`, headers: { ...auth, 'content-type': 'application/octet-stream' }, payload: Buffer.alloc(20 * 1024 * 1024 + 10, 1) })).statusCode, 413);

  // A second version, then restore the first as version 3.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
  const v2 = await upload(`/api/v1/practice/documents/${docId}/versions`, png, 'scan.png');
  assert.equal(v2.statusCode, 201, v2.body);
  assert.equal(JSON.parse(v2.body).version, 2);
  const restore = await app.inject({ method: 'POST', url: `/api/v1/practice/documents/${docId}/versions/1/restore`, headers: auth });
  assert.equal(restore.statusCode, 201, restore.body);
  const detail = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}`, headers: auth })).body);
  assert.equal(detail.currentVersion, 3);
  assert.equal(detail.versions[0].restoredFrom, 1);
  assert.equal(detail.versions[0].mimeType, 'application/pdf');

  // Preview inline with nosniff; download as an attachment; both logged.
  const pv = await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}/versions/3/file?inline=1`, headers: auth });
  assert.equal(pv.statusCode, 200);
  assert.deepEqual(pv.rawPayload, pdf);
  assert.match(String(pv.headers['content-disposition']), /^inline;/);
  assert.equal(pv.headers['x-content-type-options'], 'nosniff');
  const dl = await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}/versions/2/file`, headers: auth });
  assert.match(String(dl.headers['content-disposition']), /^attachment;/);
  assert.deepEqual(dl.rawPayload, png);

  // Staff in the firm with the client assigned: can open, cannot read the open log or lock.
  const identity = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', false, 'ACTIVE')`, [identity, `staff-${identity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'Doc Staff', 'STAFF', 'ACTIVE')`, [staffId, claims.firmId, identity]);
  await devDb.db.query(`INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, assigned_by) VALUES ($1, $2, $3, $4)`, [claims.firmId, staffId, entityId, claims.userId]);
  const staff = { authorization: `Bearer ${app.jwt.sign({ userId: staffId, firmId: claims.firmId, identityId: identity, role: 'STAFF', email: 's@example.test', displayName: 'Doc Staff' })}` };
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}/versions/3/file`, headers: staff })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}/opens`, headers: staff })).statusCode, 403);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/${docId}`, headers: staff, payload: { lockedUntilPaid: true } })).statusCode, 403);
  const opens = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/documents/${docId}/opens`, headers: auth })).body).opens;
  assert.equal(opens.length, 3);
  assert.ok(opens.some((o: { by: string; version: number }) => o.by === 'Doc Staff' && o.version === 3));
  assert.ok(opens.some((o: { kind: string }) => o.kind === 'PREVIEW'));
  // Fee lock: shared, locked against an invoice, released by payment or by the partner's waiver.
  const inv = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/invoices', headers: auth, payload: { entityId, date: '2026-11-01', lines: [{ sac: '998221', description: 'GST returns', amount: 1000 }] } });
  assert.equal(inv.statusCode, 201, inv.body);
  const invoiceId = JSON.parse(inv.body).id;
  const invTotal = Number(JSON.parse(inv.body).total);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/${docId}`, headers: auth, payload: { lockedUntilPaid: true } })).statusCode, 400, 'a lock names its invoice');
  const lock = await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/${docId}`, headers: auth, payload: { sharedWithClient: true, lockedUntilPaid: true, feeInvoiceId: invoiceId } });
  assert.equal(lock.statusCode, 200, lock.body);
  const lockedFn = async () => ((await devDb.db.query(`SELECT locked_until_paid AND NOT fee_waived AS l FROM public.client_documents WHERE id = $1`, [docId])).rows[0] as { l: boolean }).l;
  assert.equal(await lockedFn(), true);
  const listed = async () => JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/documents?entityId=${entityId}`, headers: auth })).body).documents.find((d: { id: string }) => d.id === docId);
  assert.equal((await listed()).lockedForClient, true);

  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/practice/documents/${docId}/waive`, headers: staff, payload: { waived: true } })).statusCode, 403);
  const waive = await app.inject({ method: 'POST', url: `/api/v1/practice/documents/${docId}/waive`, headers: auth, payload: { waived: true } });
  assert.equal(waive.statusCode, 200, waive.body);
  assert.equal((await listed()).lockedForClient, false);
  await app.inject({ method: 'POST', url: `/api/v1/practice/documents/${docId}/waive`, headers: auth, payload: { waived: false } });
  assert.equal((await listed()).lockedForClient, true);

  // Paid in full (older invoices of this client settle first): the lock lifts.
  const owed = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/practice/fees/ledger?entityId=${entityId}`, headers: auth })).body).ledger.outstanding;
  const pay = await app.inject({ method: 'POST', url: '/api/v1/practice/fees/receipts', headers: auth, payload: { entityId, date: '2026-11-02', amount: Math.max(Number(owed), invTotal), mode: 'UPI' } });
  assert.equal(pay.statusCode, 201, pay.body);
  const after = await listed();
  assert.equal(after.invoice.paid, true);
  assert.equal(after.lockedForClient, false);

  // Folder with documents is kept; moving the document out lets it go.
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/v1/practice/documents/folders/${sub}`, headers: auth })).statusCode, 409);
  const ver = (await listed()).version;
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/${docId}`, headers: { ...auth, 'if-match': '"2000-01-01T00:00:00.000Z"' }, payload: { folderId: null } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/v1/practice/documents/${docId}`, headers: { ...auth, 'if-match': `"${ver}"` }, payload: { folderId: null } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/v1/practice/documents/folders/${sub}`, headers: auth })).statusCode, 200);
  await app.close();
});

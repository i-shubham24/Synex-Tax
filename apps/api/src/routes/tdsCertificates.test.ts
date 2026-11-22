import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
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

const PAN = 'ABCPE1234F';
const signedPdf = (extra = '') => Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Sig /ByteRange [0 10 20 30] /Contents <00> >> endobj\n${extra}%%EOF\n`, 'latin1');

test('TDS certificates: upload checks, email with attachment, WhatsApp link for 7 days, send log', async () => {
  const { LocalFileStore, setFileStore } = await import('../modules/storage/fileStore.js');
  const { setCertificateSenders } = await import('./tdsCertificates.routes.js');
  setFileStore(new LocalFileStore(fs.mkdtempSync(path.join(os.tmpdir(), 'synextax-certs-'))));
  const mails: Array<{ to: string; attachments?: Array<{ filename: string; content: Buffer }> }> = [];
  const was: Array<{ to: string; params: string[] }> = [];
  setCertificateSenders({
    mailer: { send: async (m) => (mails.push(m), { id: 'ses-1' }) },
    whatsapp: { sendCertificateLink: async (to, params) => (was.push({ to, params }), { id: 'wamid.1' }) },
  });

  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const entityId = ((await devDb.db.query(`SELECT entity_id FROM public.tan_registrations WHERE tan = 'AMRG04217D'`)).rows[0] as { entity_id: string }).entity_id;

  // Challenge tokens for the agent's certs.read.
  const ch = await app.inject({ method: 'POST', url: '/api/v1/tds/certificates/agent-challenge', headers: auth, payload: { count: 2 } });
  assert.equal(ch.statusCode, 201, ch.body);
  const tokens = JSON.parse(ch.body).tokens as string[];
  assert.equal(tokens.length, 2);
  assert.equal(JSON.parse(Buffer.from(tokens[0].split('.')[1], 'base64url').toString()).act, 'certs.read');

  const upload = (pdf: Buffer, fileName = `${PAN}_Q2_2026-27.pdf`, payeePan = PAN) =>
    app.inject({ method: 'POST', url: '/api/v1/tds/certificates/files', headers: auth, payload: { entityId, payeePan, taxYear: '2026-27', quarter: 'Q2', fileName, pdfBase64: pdf.toString('base64') } });

  assert.equal((await upload(Buffer.from('not a pdf'))).statusCode, 415);
  assert.equal((await upload(Buffer.from('%PDF-1.7 unsigned'))).statusCode, 422);
  assert.equal((await upload(signedPdf(), 'ZZZZZ9999Z_Q2.pdf')).statusCode, 422, 'PAN in the file name must match');
  assert.equal((await upload(Buffer.concat([signedPdf(), Buffer.alloc(2 * 1024 * 1024)]))).statusCode, 413);
  const ok = await upload(signedPdf());
  assert.equal(ok.statusCode, 201, ok.body);
  const certId = JSON.parse(ok.body).id;
  const again = await upload(signedPdf());
  assert.equal(JSON.parse(again.body).id, certId, 'the same file is stored once');

  const list = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/files?entityId=${entityId}&taxYear=2026-27&quarter=Q2`, headers: auth })).body);
  assert.equal(list.certificates[0].pan, 'XXXXX1234F', 'PAN is masked');

  const send = await app.inject({ method: 'POST', url: '/api/v1/tds/certificates/send', headers: auth, payload: { items: [{ certificateId: certId, email: 'payee@example.com', mobile: '+919876543210' }] } });
  assert.equal(send.statusCode, 200, send.body);
  assert.deepEqual(JSON.parse(send.body).results[0], { certificateId: certId, email: 'SENT', whatsapp: 'SENT' });
  assert.equal(mails[0].to, 'payee@example.com');
  assert.deepEqual(mails[0].attachments![0].content, signedPdf(), 'the PDF goes out unchanged');
  const link = was[0].params[2];
  const token = new URL(link).searchParams.get('token')!;
  const stored = await devDb.db.query<{ token_hash: string; expires_at: Date; created_at: Date }>(`SELECT token_hash, expires_at, created_at FROM public.tds_certificate_links`);
  assert.notEqual(stored.rows[0].token_hash, token, 'only the hash is kept');
  assert.ok(new Date(stored.rows[0].expires_at).getTime() - new Date(stored.rows[0].created_at).getTime() <= 7 * 86400_000 + 1000);

  // The payee downloads without signing in; a made-up token gets nothing.
  const dl = await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/download?token=${token}` });
  assert.equal(dl.statusCode, 200);
  assert.equal(dl.headers['content-type'], 'application/pdf');
  assert.deepEqual(dl.rawPayload, signedPdf());
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/download?token=${'A'.repeat(43)}` })).statusCode, 404);
  // An expired link stops working.
  await devDb.db.query(`UPDATE public.tds_certificate_links SET expires_at = created_at - interval '1 minute'`);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/download?token=${token}` })).statusCode, 404);

  const log = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/${certId}/sends`, headers: auth })).body).sends;
  assert.equal(log.length, 2);
  assert.ok(log.every((s: { status: string; sentBy: string }) => s.status === 'SENT' && s.sentBy));
  assert.equal(log.find((s: { channel: string }) => s.channel === 'WHATSAPP').recipient, '*********3210');

  // Known addresses come back for the next quarter.
  const rec = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/tds/certificates/recipients', headers: auth, payload: { entityId, pans: [PAN] } })).body);
  assert.equal(rec.recipients[PAN].email, 'payee@example.com');

  // Without providers, attempts are logged as not set up.
  setCertificateSenders({ mailer: null, whatsapp: null });
  const none = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/tds/certificates/send', headers: auth, payload: { items: [{ certificateId: certId, email: 'payee@example.com' }] } })).body);
  assert.equal(none.results[0].email, 'NOT_SET_UP');

  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/tds/certificates/files?entityId=${entityId}` })).statusCode, 401);
  setCertificateSenders({});
  setFileStore(undefined);
});

import { test, before, after } from 'node:test';
import { startDevDatabase } from '@synextax/db';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

test('Backups: device token shown once, resumable chunked upload, unchanged skipped, versions, late notice', async () => {
  const { LocalBackupStore, setBackupStore } = await import('../modules/backups/backupStore.js');
  const { setBackupMailer } = await import('./backups.routes.js');
  setBackupStore({ mode: 'CHUNKED', local: new LocalBackupStore(fs.mkdtempSync(path.join(os.tmpdir(), 'synextax-backups-'))) });
  const mails: Array<{ to: string; subject: string }> = [];
  setBackupMailer({ send: async (m) => (mails.push(m), { id: 'm' }) });
  process.env.CRON_SECRET = 'cron-secret-for-tests-0123456789';

  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };

  const dev = await app.inject({ method: 'POST', url: '/api/v1/backups/devices', headers: auth, payload: { name: 'Office PC' } });
  assert.equal(dev.statusCode, 201, dev.body);
  const { id: deviceId, token } = JSON.parse(dev.body);
  assert.match(token, /^sxd_[A-Za-z0-9_-]{43}$/);
  const stored = (await devDb.db.query<{ token_hash: string }>('SELECT token_hash FROM public.backup_devices WHERE id = $1', [deviceId])).rows[0];
  assert.equal(stored.token_hash, sha(token), 'only the hash is kept');
  const listed = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/backups/devices', headers: auth })).body);
  assert.ok(!JSON.stringify(listed).includes(token), 'the token is never shown again');

  const rule = await app.inject({ method: 'POST', url: '/api/v1/backups/rules', headers: auth, payload: { deviceId, label: 'Sharma Traders', product: 'tally', dailyTime: '20:00', retentionDays: 30 } });
  assert.equal(rule.statusCode, 201, rule.body);
  const ruleId = JSON.parse(rule.body).id;

  // The agent: device token plus a CSRF token, as any caller without a session.
  const agentCsrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const agent = { authorization: `Device ${token}`, 'x-csrf-token': agentCsrf };
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/backups/agent/config', headers: { authorization: `Device sxd_${'A'.repeat(43)}` } })).statusCode, 401);
  const cfg = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/backups/agent/config', headers: { ...agent, 'x-agent-version': '0.2.0' } })).body);
  assert.deepEqual(cfg.rules.map((r: { id: string; dailyTime: string }) => [r.id, r.dailyTime]), [[ruleId, '20:00']]);

  const file = Buffer.alloc(4 * 1024 * 1024 + 100, 7);
  const start = { ruleId, fileName: 'tally-20261122-200000.zip', sizeBytes: file.length, sha256: sha(file), contentSha256: sha('content-1') };
  const s = await app.inject({ method: 'POST', url: '/api/v1/backups/agent/uploads', headers: agent, payload: start });
  assert.equal(s.statusCode, 201, s.body);
  const up = JSON.parse(s.body);
  assert.equal(up.mode, 'CHUNKED');
  assert.equal(up.received, 0);
  const chunk = (offset: number, body: Buffer) =>
    app.inject({ method: 'PUT', url: `/api/v1/backups/agent/uploads/${up.uploadId}/chunk?offset=${offset}`, headers: { ...agent, 'content-type': 'application/octet-stream' }, payload: body });
  const first = file.subarray(0, 4 * 1024 * 1024);
  assert.equal(JSON.parse((await chunk(0, first)).body).received, first.length);
  // A repeated chunk is refused with the real offset, so the agent resumes from there.
  const dup = await chunk(0, first);
  assert.equal(dup.statusCode, 409);
  assert.equal(JSON.parse(dup.body).received, first.length);
  // Starting again resumes the same upload.
  const again = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/backups/agent/uploads', headers: agent, payload: start })).body);
  assert.equal(again.uploadId, up.uploadId);
  assert.equal(again.received, first.length);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/backups/agent/uploads/${up.uploadId}/complete`, headers: agent, payload: {} })).statusCode, 409, 'not all chunks yet');
  await chunk(first.length, file.subarray(first.length));
  const done = await app.inject({ method: 'POST', url: `/api/v1/backups/agent/uploads/${up.uploadId}/complete`, headers: agent, payload: {} });
  assert.equal(done.statusCode, 200, done.body);

  // Same data again (another zip of unchanged files): not uploaded.
  const same = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/backups/agent/uploads', headers: agent, payload: { ...start, sha256: sha('other zip'), fileName: 'tally-20261123-200000.zip' } })).body);
  assert.equal(same.unchanged, true);

  // A body that does not match its SHA-256 is refused at completion.
  const bad = Buffer.from('short file');
  const b2 = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/backups/agent/uploads', headers: agent, payload: { ...start, sizeBytes: bad.length, sha256: sha('something else'), contentSha256: sha('content-2') } })).body);
  await app.inject({ method: 'PUT', url: `/api/v1/backups/agent/uploads/${b2.uploadId}/chunk?offset=0`, headers: { ...agent, 'content-type': 'application/octet-stream' }, payload: bad });
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/backups/agent/uploads/${b2.uploadId}/complete`, headers: agent, payload: {} })).statusCode, 422);

  const rules = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/backups/rules', headers: auth })).body).rules;
  assert.equal(rules[0].late, false);
  assert.equal(rules[0].lastVersion.sizeBytes, file.length);
  const versions = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/backups/versions?ruleId=${ruleId}`, headers: auth })).body).versions;
  assert.equal(versions.length, 1);
  const dl = await app.inject({ method: 'GET', url: `/api/v1/backups/versions/${versions[0].id}/download`, headers: auth });
  assert.equal(dl.statusCode, 200);
  assert.equal(sha(dl.rawPayload), sha(file));

  // Retention: an old version goes when a newer one completes; the newest always stays.
  await devDb.db.query(`UPDATE public.backup_versions SET completed_at = now() - interval '40 days' WHERE id = $1`, [versions[0].id]);
  const small = Buffer.from('new backup');
  const s3 = JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/backups/agent/uploads', headers: agent, payload: { ...start, sizeBytes: small.length, sha256: sha(small), contentSha256: sha('content-3') } })).body);
  await app.inject({ method: 'PUT', url: `/api/v1/backups/agent/uploads/${s3.uploadId}/chunk?offset=0`, headers: { ...agent, 'content-type': 'application/octet-stream' }, payload: small });
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/backups/agent/uploads/${s3.uploadId}/complete`, headers: agent, payload: {} })).statusCode, 200);
  const after = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/backups/versions?ruleId=${ruleId}`, headers: auth })).body).versions;
  assert.deepEqual(after.map((v: { status: string }) => v.status).sort(), ['COMPLETE', 'DELETED']);

  // Late: no good backup for more than a day. The job needs the cron secret and emails once.
  await devDb.db.query(`UPDATE public.backup_rules SET last_success_at = now() - interval '2 days' WHERE id = $1`, [ruleId]);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/backups/check-late' })).statusCode, 404);
  const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  const late = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/backups/check-late', headers: cron })).body);
  assert.equal(late.rules, 1);
  assert.ok(mails.length >= 1 && /late/.test(mails[0].subject));
  const again2 = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/backups/check-late', headers: cron })).body);
  assert.equal(again2.rules, 0, 'told once per lateness');

  // A withdrawn device cannot upload.
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/backups/devices/${deviceId}/revoke`, headers: auth, payload: {} })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/backups/agent/config', headers: agent })).statusCode, 401);

  setBackupStore(undefined);
  setBackupMailer(undefined);
});

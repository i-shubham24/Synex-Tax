import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';
import { generateTotpCode } from '../security/cryptoUtils.js';
import { setAccountMailerForTests } from '../modules/auth/accountMail.js';
import { maskIp, describeDevice } from './account.routes.js';

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
  setAccountMailerForTests(undefined);
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

/** TOTP codes for one secret, each at a later 30-second step than the last (codes are single use). */
function totp(secret: string) {
  let last = -Infinity;
  return () => {
    const cur = Math.floor(Date.now() / 30000);
    const step = Math.max(last + 1, cur - 1);
    assert.ok(step <= cur + 1, 'ran out of TOTP steps in this window');
    last = step;
    return generateTotpCode(secret, step);
  };
}

const json = (r: { body: string }) => JSON.parse(r.body);

test('helpers: IP masked to /24 and device described from the user agent', () => {
  assert.equal(maskIp('203.0.113.77'), '203.0.113.0/24');
  assert.equal(maskIp('::ffff:10.1.2.3'), '10.1.2.0/24');
  assert.equal(maskIp('2001:db8:abcd:12::1'), '2001:db8:abcd::/48');
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'), 'Chrome on Windows');
  assert.equal(describeDevice(null), 'Unknown device');
});

test('invitation, TOTP enrolment, sessions, password change and reset by code', async () => {
  const app = buildApp();
  await app.ready();
  const csrfToken = async () => json(await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).csrfToken as string;
  const anon = async () => ({ 'x-csrf-token': await csrfToken() });
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: await anon() });
  const partner = { authorization: `Bearer ${json(demo).accessToken}` };

  // No SES: the partner gets the link to send.
  setAccountMailerForTests(null);
  const clients = json(await app.inject({ method: 'GET', url: '/api/v1/team', headers: partner })).clients;
  const email = 'new.staff@example.test';
  const invited = await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email, name: 'Neha Staff', role: 'STAFF', entityIds: [clients[0].id] } });
  assert.equal(invited.statusCode, 201, invited.body);
  const inv = json(invited);
  assert.equal(inv.emailed, false);
  const token = String(inv.link).split('/invite/')[1];
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);

  // Unauthenticated calls need the CSRF header.
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', payload: { token } })).statusCode, 403);
  const looked = await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', headers: await anon(), payload: { token } });
  assert.equal(looked.statusCode, 200, looked.body);
  assert.equal(json(looked).email, email);
  assert.equal(json(looked).role, 'STAFF');

  const short = await app.inject({ method: 'POST', url: '/api/v1/account/invites/accept', headers: await anon(), payload: { token, password: 'short' } });
  assert.equal(short.statusCode, 400);
  const password = 'Staff-Pass-2026';
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/account/invites/accept', headers: await anon(), payload: { token, password } });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const enrol = json(accepted);
  assert.ok(enrol.challengeToken && enrol.secret && enrol.qrCodeDataUrl);
  assert.equal(enrol.recoveryCodes.length, 10);
  // Single use.
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/account/invites/accept', headers: await anon(), payload: { token, password } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', headers: await anon(), payload: { token } })).statusCode, 404);

  // MFA stays required: the account is usable only after confirming a TOTP code.
  const code = totp(enrol.secret);
  const enrolled = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/enroll', headers: await anon(), payload: { challengeToken: enrol.challengeToken, totpCode: code() } });
  assert.equal(enrolled.statusCode, 200, enrolled.body);
  const session = json(enrolled);
  assert.equal(session.user.role, 'STAFF');
  const mfaRow = (await devDb.db.query<{ mfa_required: boolean }>(`SELECT mfa_required FROM auth.identities WHERE email_normalized = $1`, [email])).rows[0];
  assert.equal(mfaRow.mfa_required, true);
  const staff = { authorization: `Bearer ${session.accessToken}`, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' };
  // The invited client is assigned.
  const assigned = (await devDb.db.query(`SELECT 1 FROM public.user_client_assignments WHERE user_id = $1 AND entity_id = $2 AND revoked_at IS NULL`, [session.user.id, clients[0].id])).rows.length;
  assert.equal(assigned, 1);

  // A second sign-in, then the session list.
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: await anon(), payload: { email, password } });
  assert.equal(json(login).mfaRequired, true);
  const second = await app.inject({ method: 'POST', url: '/api/v1/auth/mfa/verify', headers: await anon(), payload: { challengeToken: json(login).challengeToken, code: code() } });
  assert.equal(second.statusCode, 200, second.body);
  const secondRefresh = json(second).refreshToken;

  const listed = json(await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: staff }));
  assert.equal(listed.sessions.length, 2);
  assert.equal(listed.sessions.filter((s: { current: boolean }) => s.current).length, 1);
  assert.ok(listed.sessions.every((s: { ipMasked: string | null }) => s.ipMasked === null || /\/24$|\/48$/.test(s.ipMasked)));
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/account/sessions' })).statusCode, 401);

  // Sign out the other one.
  const other = listed.sessions.find((s: { current: boolean }) => !s.current);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/account/sessions/${other.id}/revoke`, headers: staff })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: await anon(), payload: { refreshToken: secondRefresh } })).statusCode, 401);
  // Someone else's session cannot be ended.
  const partnerSessions = json(await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: partner })).sessions;
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/account/sessions/${partnerSessions[0].id}/revoke`, headers: staff })).statusCode, 404);

  // Password change needs the current password and a fresh TOTP code.
  const wrongTotp = await app.inject({ method: 'POST', url: '/api/v1/account/password', headers: staff, payload: { currentPassword: password, newPassword: 'Changed-Pass-2026', totpCode: '000000' } });
  assert.equal(wrongTotp.statusCode, 400);
  const changed = await app.inject({ method: 'POST', url: '/api/v1/account/password', headers: staff, payload: { currentPassword: password, newPassword: 'Changed-Pass-2026', totpCode: code() } });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(json(await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: staff })).sessions.length, 1);

  // Password reset: the same answer for a known and an unknown email.
  const sent: Array<{ to: string; text: string }> = [];
  setAccountMailerForTests({ send: async (m) => { sent.push(m); return { id: 'test' }; } });
  const unknown = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/request', headers: await anon(), payload: { email: 'nobody@example.test' } });
  const known = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/request', headers: await anon(), payload: { email } });
  assert.equal(unknown.statusCode, 202);
  assert.equal(known.statusCode, 202);
  assert.equal(json(unknown).message, json(known).message);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);
  const resetCode = /is (\d{6})\./.exec(sent[0].text)![1];
  const stored = (await devDb.db.query<{ code_hash: Buffer }>(`SELECT code_hash FROM auth.password_resets ORDER BY created_at DESC LIMIT 1`)).rows[0];
  assert.ok(!stored.code_hash.toString('utf8').includes(resetCode), 'the code is stored only as a hash');

  const wrongCode = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/confirm', headers: await anon(), payload: { email, code: resetCode === '000000' ? '000001' : '000000', newPassword: 'Reset-Pass-2026', totpCode: '123456' } });
  assert.equal(wrongCode.statusCode, 400);
  // Without a valid TOTP code the reset does not go through (MFA cannot be bypassed).
  const noMfa = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/confirm', headers: await anon(), payload: { email, code: resetCode, newPassword: 'Reset-Pass-2026', totpCode: '000000' } });
  assert.equal(noMfa.statusCode, 400);
  // The current access token's session is still live before the reset.
  const beforeReset = json(await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: staff })).sessions.length;
  assert.equal(beforeReset, 1);
  // A fresh TOTP step may not be available within this 30-second window; wait for it if needed.
  let nextCode: string;
  try {
    nextCode = code();
  } catch {
    await new Promise((r) => setTimeout(r, 31_000));
    nextCode = code();
  }
  const reset = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/confirm', headers: await anon(), payload: { email, code: resetCode, newPassword: 'Reset-Pass-2026', totpCode: nextCode } });
  assert.equal(reset.statusCode, 200, reset.body);
  // Every session ended; the code is single use; the new password works.
  assert.equal(json(await app.inject({ method: 'GET', url: '/api/v1/account/sessions', headers: staff })).sessions.length, 0);
  const again = await app.inject({ method: 'POST', url: '/api/v1/account/password-reset/confirm', headers: await anon(), payload: { email, code: resetCode, newPassword: 'Other-Pass-2026', totpCode: '123456' } });
  assert.equal(again.statusCode, 400);
  const relogin = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: await anon(), payload: { email, password: 'Reset-Pass-2026' } });
  assert.equal(relogin.statusCode, 200, relogin.body);
  assert.equal(json(relogin).mfaRequired, true);
  await app.close();
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';
import { setAccountMailerForTests } from '../modules/auth/accountMail.js';

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

const json = (r: { body: string }) => JSON.parse(r.body);

test('invitations: partner only, emailed when SES is set up, resend replaces the link, revoke ends it, client contacts need a client', async () => {
  const app = buildApp();
  await app.ready();
  const anon = async () => ({ 'x-csrf-token': json(await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).csrfToken as string });
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: await anon() });
  const partnerToken = json(demo).accessToken;
  const partner = { authorization: `Bearer ${partnerToken}` };
  const claims = JSON.parse(Buffer.from(partnerToken.split('.')[1], 'base64url').toString());
  const clients = json(await app.inject({ method: 'GET', url: '/api/v1/team', headers: partner })).clients;

  // A staff member cannot invite.
  const identity = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', true, 'ACTIVE')`, [identity, `staff-${identity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'Test Staff', 'STAFF', 'ACTIVE')`, [staffId, claims.firmId, identity]);
  const staff = { authorization: `Bearer ${app.jwt.sign({ userId: staffId, firmId: claims.firmId, identityId: identity, role: 'STAFF', email: 'staff@example.test', displayName: 'Test Staff' })}` };
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: staff, payload: { email: 'x@example.test', name: 'X Person', role: 'STAFF' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/team/invitations', headers: staff })).statusCode, 403);

  // A client contact needs at least one client.
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email: 'owner@client.test', name: 'Client Owner', role: 'CLIENT' } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email: 'owner@client.test', name: 'Client Owner', role: 'PARTNER' } })).statusCode, 400);

  // With email set up, the link is emailed and never returned.
  const sent: Array<{ to: string; text: string }> = [];
  setAccountMailerForTests({ send: async (m) => { sent.push(m); return { id: 'test' }; } });
  const created = await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email: 'owner@client.test', name: 'Client Owner', role: 'CLIENT', entityIds: [clients[0].id] } });
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(json(created).emailed, true);
  assert.equal(json(created).link, undefined);
  assert.equal(sent.length, 1);
  const firstToken = /\/invite\/([A-Za-z0-9_-]{43})/.exec(sent[0].text)![1];
  const stored = (await devDb.db.query<{ token_hash: Buffer; access_level: string }>(`SELECT token_hash, access_level FROM public.user_invitations WHERE id = $1`, [json(created).id])).rows[0];
  assert.equal(stored.token_hash.length, 32);
  assert.equal(stored.access_level, 'CLIENT_PORTAL');

  // One open invitation per email.
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email: 'OWNER@client.test', name: 'Client Owner', role: 'CLIENT', entityIds: [clients[0].id] } })).statusCode, 409);

  // Resend: a new link; the old one stops working.
  setAccountMailerForTests(null);
  const resent = await app.inject({ method: 'POST', url: `/api/v1/team/invitations/${json(created).id}/resend`, headers: partner });
  assert.equal(resent.statusCode, 200, resent.body);
  const secondToken = String(json(resent).link).split('/invite/')[1];
  assert.notEqual(secondToken, firstToken);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', headers: await anon(), payload: { token: firstToken } })).statusCode, 404);
  const looked = await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', headers: await anon(), payload: { token: secondToken } });
  assert.equal(looked.statusCode, 200);
  assert.equal(json(looked).role, 'CLIENT');

  const list = json(await app.inject({ method: 'GET', url: '/api/v1/team/invitations', headers: partner }));
  assert.equal(list.emailConfigured, false);
  const row = list.invitations.find((i: { id: string }) => i.id === json(created).id);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.sendCount, 2);
  assert.deepEqual(row.clients, [clients[0].name]);

  // Revoke ends the link.
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/team/invitations/${json(created).id}/revoke`, headers: partner })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/account/invites/lookup', headers: await anon(), payload: { token: secondToken } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/api/v1/team/invitations/${json(created).id}/resend`, headers: partner })).statusCode, 404);

  // The client contact, once accepted, appears among contacts with its client.
  const again = json(await app.inject({ method: 'POST', url: '/api/v1/team/invitations', headers: partner, payload: { email: 'owner@client.test', name: 'Client Owner', role: 'CLIENT', entityIds: [clients[0].id] } }));
  const token = String(again.link).split('/invite/')[1];
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/account/invites/accept', headers: await anon(), payload: { token, password: 'Client-Pass-2026' } });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const team = json(await app.inject({ method: 'GET', url: '/api/v1/team', headers: partner }));
  const contact = team.contacts.find((c: { name: string }) => c.name === 'Client Owner');
  assert.ok(contact);
  assert.deepEqual(contact.clients.map((c: { entityId: string }) => c.entityId), [clients[0].id]);
  assert.ok(!team.members.some((m: { name: string }) => m.name === 'Client Owner'));
  await app.close();
});

test('meetings: added, listed by IST day, edits need the current version, clients cannot see them', async () => {
  const app = buildApp();
  await app.ready();
  const csrf = json(await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const partnerToken = json(demo).accessToken;
  const partner = { authorization: `Bearer ${partnerToken}` };
  const claims = JSON.parse(Buffer.from(partnerToken.split('.')[1], 'base64url').toString());

  const bad = await app.inject({ method: 'POST', url: '/api/v1/team/meetings', headers: partner, payload: { title: 'x', startsAt: 'tomorrow' } });
  assert.equal(bad.statusCode, 400);
  // 00:30 IST on 3 December is still 2 December in UTC; it belongs to 3 December.
  const created = await app.inject({ method: 'POST', url: '/api/v1/team/meetings', headers: partner, payload: { title: 'Year-end review', startsAt: '2026-12-03T00:30:00+05:30', durationMinutes: 45, location: 'Office' } });
  assert.equal(created.statusCode, 201, created.body);
  const day3 = json(await app.inject({ method: 'GET', url: '/api/v1/team/meetings?from=2026-12-03&to=2026-12-03', headers: partner })).meetings;
  assert.equal(day3.length, 1);
  assert.equal(day3[0].canEdit, true);
  assert.equal(json(await app.inject({ method: 'GET', url: '/api/v1/team/meetings?from=2026-12-02&to=2026-12-02', headers: partner })).meetings.length, 0);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/team/meetings?from=2026-01-01&to=2026-12-31', headers: partner })).statusCode, 400);

  const stale = await app.inject({ method: 'PATCH', url: `/api/v1/team/meetings/${day3[0].id}`, headers: { ...partner, 'if-match': '"2000-01-01T00:00:00.000Z"' }, payload: { status: 'CANCELLED' } });
  assert.equal(stale.statusCode, 409);
  const ok = await app.inject({ method: 'PATCH', url: `/api/v1/team/meetings/${day3[0].id}`, headers: { ...partner, 'if-match': `"${day3[0].version}"` }, payload: { status: 'CANCELLED' } });
  assert.equal(ok.statusCode, 200, ok.body);

  // A client login sees no firm meetings.
  const identity = crypto.randomUUID();
  const clientUser = crypto.randomUUID();
  await devDb.db.query(`INSERT INTO auth.identities (id, email, password_hash, mfa_required, status) VALUES ($1, $2, 'x', true, 'ACTIVE')`, [identity, `client-${identity}@example.test`]);
  await devDb.db.query(`INSERT INTO public.users (id, firm_id, identity_id, display_name, role, status) VALUES ($1, $2, $3, 'A Client', 'CLIENT', 'ACTIVE')`, [clientUser, claims.firmId, identity]);
  const client = { authorization: `Bearer ${app.jwt.sign({ userId: clientUser, firmId: claims.firmId, identityId: identity, role: 'CLIENT', email: 'c@example.test', displayName: 'A Client' })}` };
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/team/meetings?from=2026-12-03&to=2026-12-03', headers: client })).statusCode, 403);
  await app.close();
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';
import { setReminderSenders } from '../modules/practice/reminders.js';
import { dueSteps, DEFAULT_SETTINGS, istToday, addDays } from '../modules/practice/automation.js';

let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
const CRON = 'test-cron-secret-0123456789abcdef';
before(async () => {
  devDb = await startDevDatabase({ port: 0 });
  Object.assign(process.env, {
    POSTGRES_HOST: devDb.host,
    POSTGRES_PORT: String(devDb.port),
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_DB: 'postgres',
    POSTGRES_POOL_MAX: '1',
    CRON_SECRET: CRON,
  });
});
after(async () => {
  setReminderSenders(null);
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

test('Schedule: latest due client step only, no late catch-up beyond three days, firm note on its day', () => {
  const today = '2026-11-20';
  const s = DEFAULT_SETTINGS;
  assert.deepEqual(dueSteps({ sentOn: today, today, settings: s, log: [] }), { client: null, firm: null });
  assert.deepEqual(dueSteps({ sentOn: addDays(today, -1), today, settings: s, log: [] }), { client: 1, firm: null });
  assert.deepEqual(dueSteps({ sentOn: addDays(today, -6), today, settings: s, log: [] }), { client: 5, firm: null }, 'day 1 is superseded by day 5');
  assert.deepEqual(dueSteps({ sentOn: addDays(today, -10), today, settings: s, log: [{ kind: 'CLIENT', stepDay: 5, outcome: 'SENT', runOn: addDays(today, -5) }] }), { client: null, firm: 10 });
  assert.equal(dueSteps({ sentOn: addDays(today, -40), today, settings: s, log: [] }).client, null, 'old checklists are not chased on day one of the feature');
  assert.equal(dueSteps({ sentOn: addDays(today, -1), today, settings: s, log: [{ kind: 'CLIENT', stepDay: 1, outcome: 'FAILED', runOn: today }] }).client, null, 'a failure is retried on a later day');
  assert.equal(dueSteps({ sentOn: addDays(today, -2), today, settings: s, log: [{ kind: 'CLIENT', stepDay: 1, outcome: 'FAILED', runOn: addDays(today, -1) }] }).client, 1);
  assert.equal(dueSteps({ sentOn: addDays(today, -1), today, settings: { ...s, channels: [] }, log: [] }).client, null);
});

test('Automation: settings, a day-1 reminder sent once, pause, day-5 and the day-10 firm note; the cron needs its secret', async () => {
  const sent: Array<{ ch: string; to: string }> = [];
  setReminderSenders({
    mailer: { send: async (m) => { sent.push({ ch: 'EMAIL', to: m.to }); return { id: 'm1' }; } },
    whatsapp: { sendReminder: async (to) => { sent.push({ ch: 'WHATSAPP', to }); return { id: 'w1' }; } },
  });
  const app = buildApp();
  const csrf = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })).body).csrfToken;
  const demo = await app.inject({ method: 'POST', url: '/api/v1/auth/demo', headers: { 'x-csrf-token': csrf } });
  const auth = { authorization: `Bearer ${JSON.parse(demo.body).accessToken}` };
  const entities = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/client-master/entities', headers: auth })).body);
  const entity = (Array.isArray(entities) ? entities : entities.data ?? entities.entities)[0];
  await devDb.db.query(`INSERT INTO public.entity_contacts (firm_id, entity_id, full_name, mobile_e164, email, is_primary) SELECT firm_id, id, 'Owner', '+919814012345', 'owner@example.test', true FROM public.entities WHERE id = $1`, [entity.id]);

  // Settings: defaults, then a change with a stale version refused.
  const g = await app.inject({ method: 'GET', url: '/api/v1/practice/automation', headers: auth });
  assert.equal(g.statusCode, 200, g.body);
  assert.deepEqual(JSON.parse(g.body).settings, { clientDays: [1, 5], firmNoteDay: 10, channels: ['EMAIL', 'WHATSAPP'], paused: false });
  const put = await app.inject({ method: 'PUT', url: '/api/v1/practice/automation', headers: auth, payload: { clientDays: [5, 1], firmNoteDay: 10, channels: ['EMAIL', 'WHATSAPP'], paused: false } });
  assert.equal(put.statusCode, 200, put.body);
  const stale = await app.inject({ method: 'PUT', url: '/api/v1/practice/automation', headers: { ...auth, 'if-match': '"2000-01-01T00:00:00.000Z"' }, payload: { clientDays: [2], firmNoteDay: null, channels: [], paused: false } });
  assert.equal(stale.statusCode, 409);
  const badDays = await app.inject({ method: 'PUT', url: '/api/v1/practice/automation', headers: auth, payload: { clientDays: [1, 1], firmNoteDay: 10, channels: ['EMAIL'], paused: false } });
  assert.equal(badDays.statusCode, 400);

  // A checklist sent to the client by a manual reminder.
  const created = await app.inject({ method: 'POST', url: '/api/v1/practice/checklists', headers: auth, payload: { entityId: entity.id, service: 'GST_MONTHLY', periodLabel: 'Auto 2026', dueDate: '2026-12-20' } });
  assert.equal(created.statusCode, 201, created.body);
  const checklistId = JSON.parse(created.body).id;
  const manual = await app.inject({ method: 'POST', url: `/api/v1/practice/checklists/${checklistId}/reminder`, headers: auth, payload: { channel: 'EMAIL' } });
  assert.equal(manual.statusCode, 200, manual.body);
  assert.equal(JSON.parse(manual.body).sent, true, 'the shared module sends by email');
  sent.length = 0;

  const run = () => app.inject({ method: 'GET', url: '/api/v1/practice/automation/run', headers: { authorization: `Bearer ${CRON}` } });
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/practice/automation/run' })).statusCode, 404, 'no secret, no job');
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/practice/automation/run', headers: auth })).statusCode, 404, 'a user session is not the cron secret');

  const day0 = await run();
  assert.equal(day0.statusCode, 200, day0.body);
  assert.equal(sent.length, 0, 'nothing on the day it was sent');
  const row = (await devDb.db.query(`SELECT sent_on::text FROM public.practice_checklist_automation WHERE checklist_id = $1`, [checklistId])).rows[0] as { sent_on: string };
  assert.equal(row.sent_on, istToday());

  // Day 1: one reminder on each channel, and a rerun sends nothing more.
  await devDb.db.query(`UPDATE public.practice_checklist_automation SET sent_on = $2 WHERE checklist_id = $1`, [checklistId, addDays(istToday(), -1)]);
  assert.equal((await run()).statusCode, 200);
  assert.deepEqual(sent.map((s) => s.ch).sort(), ['EMAIL', 'WHATSAPP']);
  await run();
  assert.equal(sent.length, 2, 'a rerun the same day does not resend');
  const reminders = (await devDb.db.query(`SELECT count(*)::int AS n FROM public.doc_reminders WHERE checklist_id = $1 AND sent_by IS NULL`, [checklistId])).rows[0] as { n: number };
  assert.equal(reminders.n, 2, 'automatic reminders show in the gap view');

  const lists = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/practice/automation/checklists', headers: auth })).body).checklists;
  const mine = lists.find((k: { id: string }) => k.id === checklistId);
  assert.equal(mine.steps[0].outcome, 'SENT');
  assert.equal(mine.next.kind, 'CLIENT');
  assert.equal(mine.next.day, 5);

  // Paused: day 5 comes round but nothing goes.
  await devDb.db.query(`UPDATE public.practice_automation_log SET run_on = run_on - 4 WHERE checklist_id = $1`, [checklistId]);
  await devDb.db.query(`UPDATE public.practice_checklist_automation SET sent_on = $2 WHERE checklist_id = $1`, [checklistId, addDays(istToday(), -5)]);
  const pause = await app.inject({ method: 'PUT', url: `/api/v1/practice/automation/checklists/${checklistId}`, headers: auth, payload: { paused: true } });
  assert.equal(pause.statusCode, 200, pause.body);
  await run();
  assert.equal(sent.length, 2, 'a paused checklist is not chased');
  await app.inject({ method: 'PUT', url: `/api/v1/practice/automation/checklists/${checklistId}`, headers: auth, payload: { paused: false } });
  await run();
  assert.equal(sent.length, 4, 'day 5 after resuming');

  // Day 10: a note to the firm, no message to the client.
  await devDb.db.query(`UPDATE public.practice_automation_log SET run_on = run_on - 5 WHERE checklist_id = $1`, [checklistId]);
  await devDb.db.query(`UPDATE public.practice_checklist_automation SET sent_on = $2 WHERE checklist_id = $1`, [checklistId, addDays(istToday(), -10)]);
  await run();
  assert.equal(sent.length, 4);
  const log = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/practice/automation/log', headers: auth })).body).entries.filter((e: { checklistId: string }) => e.checklistId === checklistId);
  assert.ok(log.some((e: { kind: string; outcome: string }) => e.kind === 'FIRM' && e.outcome === 'NOTED'));

  // Nothing outstanding: no more steps, even with the firm note day moved later.
  await devDb.db.query(`UPDATE public.doc_checklist_items SET status = 'RECEIVED' WHERE checklist_id = $1`, [checklistId]);
  const after = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/practice/automation/checklists', headers: auth })).body).checklists;
  assert.ok(!after.some((k: { id: string }) => k.id === checklistId));

  // Firm-wide pause.
  const paused = await app.inject({ method: 'PUT', url: '/api/v1/practice/automation', headers: auth, payload: { clientDays: [1, 5], firmNoteDay: 10, channels: ['EMAIL'], paused: true } });
  assert.equal(paused.statusCode, 200);
  const summary = JSON.parse((await run()).body);
  assert.ok(summary.pausedFirms >= 1);
  await app.close();
});

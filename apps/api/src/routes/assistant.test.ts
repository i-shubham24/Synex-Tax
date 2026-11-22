import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startDevDatabase } from '@synextax/db';
import { buildApp } from '../app.js';

// Real PostgreSQL 17 (PGlite) with all migrations, so RLS on the assistant tables runs for real.
let devDb: Awaited<ReturnType<typeof startDevDatabase>>;
const realFetch = globalThis.fetch;
const sent: string[] = [];
let modelReply = 'Under section 393 of the Income-tax Act, 2025 (section 194C of the Income-tax Act, 1961) tax is deducted at 1% for an individual contractor. See also section 777Q of the Income-tax Act, 1961. PAN [PAN_1] noted.';
const TESTDATA = path.resolve(process.cwd(), '../../packages/tax-engine/src/assistant/testdata');

before(async () => {
  devDb = await startDevDatabase({ port: 0 });
  Object.assign(process.env, {
    POSTGRES_HOST: devDb.host,
    POSTGRES_PORT: String(devDb.port),
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_DB: 'postgres',
    POSTGRES_POOL_MAX: '1',
    BEDROCK_REGION: 'ap-south-1',
    BEDROCK_MODEL_ID: 'anthropic.model-v1:0',
    AWS_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'secret',
    CRON_SECRET: 'a-cron-secret-of-enough-length-123',
  });
  // Bedrock and the official pages are faked; nothing leaves the machine.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://bedrock-runtime.ap-south-1.amazonaws.com/')) {
      sent.push(String(init?.body));
      return Response.json({ output: { message: { content: [{ text: modelReply }] } } });
    }
    const file = url.startsWith('https://www.incometax.gov.in/') ? 'efiling-latest-news.html' : url.startsWith('https://gstcouncil.gov.in/') ? 'gstcouncil-press-release.html' : url.startsWith('https://cbic-gst.gov.in/') ? 'cbic-gst-home.html' : null;
    if (file) return new Response(fs.readFileSync(path.join(TESTDATA, file), 'utf8'), { status: 200, headers: { 'content-type': 'text/html' } });
    return realFetch(input as any, init);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = realFetch;
  const { db } = await import('../db/pool.js');
  await db.close();
  await devDb.stop();
});

const FIRM = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const tokens = (app: ReturnType<typeof buildApp>) => ({
  partner: app.jwt.sign({ userId: '11111111-1111-1111-1111-111111111111', firmId: FIRM, identityId: '00000000-0000-0000-0000-000000000001', role: 'PARTNER', email: 'ca.verma@synextax.com', displayName: 'CA Verma' }),
  staff: app.jwt.sign({ userId: '22222222-2222-2222-2222-222222222222', firmId: FIRM, identityId: '22222222-2222-2222-2222-222222222221', role: 'STAFF', email: 'staff.kaur@synextax.com', displayName: 'Staff Kaur' }),
});

test('assistant: question answered, citations checked, saved per user, exported', async () => {
  const app = buildApp();
  await app.ready();
  const t = tokens(app);
  const auth = (tok: string) => ({ authorization: `Bearer ${tok}`, 'content-type': 'application/json' });

  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/assistant/threads' })).statusCode, 401);

  const ask = await app.inject({ method: 'POST', url: '/api/v1/assistant/ask', headers: auth(t.partner), payload: { question: 'What TDS applies to a contractor with PAN ABCPV1234K?' } });
  assert.equal(ask.statusCode, 200, ask.body);
  const a = JSON.parse(ask.body);
  // The PAN never left the server; the answer has it restored.
  assert.doesNotMatch(sent.join(''), /ABCPV1234K/);
  assert.match(a.answer, /ABCPV1234K/);
  // 393 and 194C verified with both numbers; the invented section removed and listed.
  assert.deepEqual(a.citations.map((c: any) => c.section), ['393', '194C']);
  assert.equal(a.citations[1].rows[0].act2025, '393(1) Table 6(i)');
  assert.deepEqual(a.removed, [{ act: '1961', section: '777Q' }]);
  assert.doesNotMatch(a.answer, /777Q/);

  // A follow-up goes to the model with the earlier turns.
  const follow = await app.inject({ method: 'POST', url: '/api/v1/assistant/ask', headers: auth(t.partner), payload: { threadId: a.threadId, question: 'And for a company?' } });
  assert.equal(follow.statusCode, 200, follow.body);
  assert.equal(JSON.parse(sent[sent.length - 1]).messages.length, 3);

  const list = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/assistant/threads', headers: auth(t.partner) })).body);
  assert.equal(list.threads.length, 1);
  const thread = JSON.parse((await app.inject({ method: 'GET', url: `/api/v1/assistant/threads/${a.threadId}`, headers: auth(t.partner) })).body);
  assert.equal(thread.messages.length, 4);

  // Another user in the same firm sees none of it.
  assert.equal(JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/assistant/threads', headers: auth(t.staff) })).body).threads.length, 0);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/assistant/threads/${a.threadId}`, headers: auth(t.staff) })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/assistant/ask', headers: auth(t.staff), payload: { threadId: a.threadId, question: 'Continue this' } })).statusCode, 404);

  const exp = await app.inject({ method: 'GET', url: `/api/v1/assistant/threads/${a.threadId}/export`, headers: auth(t.partner) });
  assert.equal(exp.statusCode, 200);
  assert.match(String(exp.headers['content-type']), /text\/html/);
  assert.match(exp.body, /not advice/);
  assert.match(exp.body, /2025 Act section 393\(1\) Table 6\(i\) \/ 1961 Act section 194C/);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/v1/assistant/threads/${a.threadId}`, headers: { authorization: `Bearer ${t.partner}` } })).statusCode, 204);
});

test('assistant: notice reply draft and enhance pass', async () => {
  const app = buildApp();
  await app.ready();
  const t = tokens(app);
  const auth = { authorization: `Bearer ${t.partner}`, 'content-type': 'application/json' };
  modelReply = 'To the Assessing Officer. With reference to the notice under section 143(2) of the Income-tax Act, 1961, we reply as follows. [to be filled]';
  const d = await app.inject({ method: 'POST', url: '/api/v1/assistant/notice/draft', headers: auth, payload: { notice: 'Notice under section 143(2) for AY 2025-26 selecting the return for scrutiny.', facts: 'Return filed on time.' } });
  assert.equal(d.statusCode, 200, d.body);
  const draft = JSON.parse(d.body);
  // 143(2) is not in the mapping table, so it is removed and listed.
  assert.deepEqual(draft.removed, [{ act: '1961', section: '143(2)' }]);
  assert.match(draft.draft, /\[section not verified\]/);
  modelReply = 'Improved reply. Interest under section 424 of the Income-tax Act, 2025 does not arise.';
  const e = await app.inject({ method: 'POST', url: '/api/v1/assistant/notice/enhance', headers: auth, payload: { threadId: draft.threadId } });
  assert.equal(e.statusCode, 200, e.body);
  assert.equal(JSON.parse(e.body).citations[0].rows[0].act1961, '234B');
  assert.match(JSON.parse(sent[sent.length - 1]).messages[0].content[0].text, /Draft reply to improve/);
});

test('assistant: feed refresh from saved official pages, list and explain', async () => {
  const app = buildApp();
  await app.ready();
  const t = tokens(app);
  const auth = { authorization: `Bearer ${t.partner}`, 'content-type': 'application/json' };
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/assistant/feed/refresh' })).statusCode, 404);
  const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };
  const r = await app.inject({ method: 'GET', url: '/api/v1/assistant/feed/refresh', headers: cron });
  assert.equal(r.statusCode, 200, r.body);
  const res = JSON.parse(r.body).results;
  assert.ok(res.every((x: any) => !x.error && x.found > 0), r.body);
  // A second run adds nothing new.
  const again = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/assistant/feed/refresh', headers: cron })).body).results;
  assert.ok(again.every((x: any) => x.added === 0));

  const feed = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/assistant/feed', headers: auth })).body);
  assert.ok(feed.items.length >= 15);
  assert.equal(feed.items[0].date, '2026-11-06');
  const gstc = JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/assistant/feed?source=GSTC', headers: auth })).body);
  assert.equal(gstc.items.length, 1);

  modelReply = 'This notification exempts certain IFSC dividends from TDS.';
  const ex = await app.inject({ method: 'POST', url: `/api/v1/assistant/feed/${feed.items[0].id}/explain`, headers: { authorization: auth.authorization } });
  assert.equal(ex.statusCode, 200, ex.body);
  assert.match(JSON.parse(sent[sent.length - 1]).messages[0].content[0].text, /Notification No\. 141\/2026/);

  // The app role cannot write the global feed directly.
  const { db } = await import('../db/pool.js');
  await assert.rejects(db.withTenantTransaction({ firmId: FIRM, userId: '11111111-1111-1111-1111-111111111111' }, (c) => c.query("INSERT INTO public.assistant_feed_items (source, title, link) VALUES ('CBIC','x','https://x.in')")));
});

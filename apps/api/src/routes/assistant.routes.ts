import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { checkCitations, mappingForPrompt, FEED_PAGES, FEED_SOURCES, parseFeedPage, type CitationCheck } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { bedrockFromEnv, type Assistant, type ChatTurn } from '../integrations/bedrock.js';
import { cronAllowed } from '../plugins/cronAuth.js';
import { publicMessage } from '../plugins/publicError.js';

const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: 'USER' as const,
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

const RULES =
  'You assist an Indian chartered accountant. Your answer is a draft for the CA to check, not advice to a client. ' +
  'Cite a section only from the list below, and always name the Act: write "section 393 of the Income-tax Act, 2025 (section 194C of the Income-tax Act, 1961)" or "section 16 of the CGST Act". ' +
  'If the section you would cite is not in the list, describe the provision without a number. Never guess a section, rule, notification or case. ' +
  'For periods up to 31 March 2026 the 1961 Act applies; from Tax Year 2026-27 the 2025 Act. If you are not sure of a rate, limit or date, say so. ' +
  'Placeholders such as [PAN_1] stand for identifiers; keep them as they are. Plain text, short paragraphs, no tables.\n\n';

const QUESTION_SYSTEM = () => `${RULES}You answer questions on income tax, GST, TDS and TCS.\n\n${mappingForPrompt()}`;
const NOTICE_SYSTEM = () =>
  `${RULES}You draft a reply to a notice from the Income Tax Department or a GST officer, from the notice text and the facts the CA gives. ` +
  'Write it as a letter to the officer: reference, the point-by-point reply, the documents enclosed (as placeholders), and a closing. Do not invent facts; mark anything the CA must fill in as [to be filled].\n\n' +
  mappingForPrompt();
const ENHANCE_SYSTEM = () =>
  `${RULES}You improve a draft notice reply: make it clearer and more complete, keep every fact as given, add no new facts, and point out in a short note at the end what the CA should check or attach.\n\n${mappingForPrompt()}`;
const EXPLAIN_SYSTEM = () =>
  `${RULES}You explain an official notification, circular or press release from its title and summary in plain words for a CA: what changed, who it affects and from when. If the title and summary do not say, say that the full text should be read.\n\n${mappingForPrompt()}`;

const NOT_SET_UP = { error: 'NOT_CONFIGURED', message: 'The assistant is not set up (Amazon Bedrock in an India region). Calculators, templates and the feed still work.' };

/** What is stored and returned for a model answer after the citation check. */
function checked(answer: string): CitationCheck & { citations: unknown[]; removedList: unknown[] } {
  const r = checkCitations(answer);
  const citations = r.verified.map((c) => ({ act: c.act, section: c.section, rows: c.rows?.map((x) => ({ act2025: x.act2025, act1961: x.act1961, topic: x.topic, src: x.src })), gst: c.gst }));
  const removedList = r.removed.map((c) => ({ act: c.act, section: c.section }));
  return { ...r, citations, removedList };
}

const UUID = z.string().uuid();
const AskBody = z.object({ threadId: UUID.optional(), question: z.string().trim().min(3).max(4000) });
const NoticeBody = z.object({ threadId: UUID.optional(), notice: z.string().trim().min(20).max(30000), facts: z.string().trim().max(10000).default('') });
const EnhanceBody = z.object({ threadId: UUID });
const ListQuery = z.object({ kind: z.enum(['QUESTION', 'NOTICE']).optional() });
const FeedQuery = z.object({ source: z.enum(['CBDT', 'EFILING', 'CBIC', 'GSTC']).optional(), limit: z.coerce.number().int().min(1).max(200).default(60) });

type Client = pg.PoolClient;

async function threadFor(c: Client, kind: 'QUESTION' | 'NOTICE', threadId: string | undefined, title: string): Promise<string | null> {
  if (threadId) {
    const r = await c.query<{ id: string }>('SELECT id FROM public.assistant_threads WHERE id = $1 AND kind = $2', [threadId, kind]);
    return r.rows[0]?.id ?? null;
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO public.assistant_threads (firm_id, user_id, kind, title) VALUES (app.current_firm_id(), app.current_user_id(), $1, $2) RETURNING id`,
    [kind, title.slice(0, 200)],
  );
  return r.rows[0].id;
}

async function history(c: Client, threadId: string, limit = 12): Promise<ChatTurn[]> {
  const r = await c.query<{ role: 'user' | 'assistant'; content: string }>(
    'SELECT role, content FROM (SELECT role, content, created_at FROM public.assistant_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2) t ORDER BY created_at',
    [threadId, limit],
  );
  return r.rows.map((m) => ({ role: m.role, text: m.content }));
}

async function save(c: Client, threadId: string, role: 'user' | 'assistant', content: string, citations: unknown[] = [], removed: unknown[] = []) {
  await c.query(
    `INSERT INTO public.assistant_messages (firm_id, user_id, thread_id, role, content, citations, removed)
     VALUES (app.current_firm_id(), app.current_user_id(), $1, $2, $3, $4::jsonb, $5::jsonb)`,
    [threadId, role, content, JSON.stringify(citations), JSON.stringify(removed)],
  );
  await c.query('UPDATE public.assistant_threads SET updated_at = now() WHERE id = $1', [threadId]);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function exportHtml(title: string, kind: string, messages: Array<{ role: string; content: string; citations: any[]; removed: any[]; created_at: Date }>): string {
  const body = messages
    .map((m) => {
      const cites = (m.citations ?? [])
        .map((c: any) => (c.gst ? `${c.gst.act} Act section ${c.gst.section}` : (c.rows ?? []).map((r: any) => `2025 Act section ${r.act2025} / 1961 Act section ${r.act1961}`).join('; ')))
        .filter(Boolean);
      const removed = (m.removed ?? []).map((c: any) => `section ${c.section}`);
      return `<section class="${m.role}"><h2>${m.role === 'user' ? 'Question' : kind === 'NOTICE' ? 'Draft reply' : 'Draft answer'}</h2>
<div class="text">${esc(m.content).replace(/\n/g, '<br>')}</div>
${cites.length ? `<p class="meta">Sections, from the mapping table: ${esc(cites.join('; '))}</p>` : ''}
${removed.length ? `<p class="meta">Removed as not verifiable: ${esc(removed.join(', '))}</p>` : ''}</section>`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.5;margin:2cm;color:#111}h1{font-size:16pt;font-weight:600}h2{font-size:12pt;font-weight:600;margin:18pt 0 4pt}.meta{font-size:10pt;color:#444}.note{border:1px solid #999;padding:6pt 8pt;font-size:10pt}</style></head>
<body><p class="note">Draft prepared with a language model for the CA to check. It is not advice. Sections shown are only those found in SynexTax's section mapping table; others were removed.</p>
<h1>${esc(title)}</h1>${body}</body></html>`;
}

/** Fetches one fixed official page. Never a URL from a request. */
async function fetchPage(url: string, fetchFn: typeof fetch): Promise<string> {
  const res = await fetchFn(url, { headers: { 'user-agent': 'SynexTax feed reader', accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  const text = await res.text();
  if (text.length > 5_000_000) throw new Error('Page too large');
  return text;
}

export interface AssistantRouteOptions {
  assistant?: Assistant | null;
  fetchFn?: typeof fetch;
}

/** The tax assistant, notice drafts and the notification feed. Mounted at /api/v1/assistant. Calculators and deed templates run in the browser from the tax engine. */
export async function assistantRoutes(fastify: FastifyInstance, opts: AssistantRouteOptions = {}) {
  const assistant = opts.assistant !== undefined ? opts.assistant : bedrockFromEnv();
  const fetchFn = opts.fetchFn ?? fetch;

  // The daily job, with the cron secret; no user session.
  fastify.get('/feed/refresh', { config: { rateLimit: { max: 4, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!cronAllowed(request, reply)) return reply;
    const results: Array<{ page: string; found: number; added: number; error?: string }> = [];
    for (const p of FEED_PAGES) {
      try {
        const items = parseFeedPage(p.id, await fetchPage(p.url, fetchFn));
        let added = 0;
        await db.withAnonymousTransaction(async (c) => {
          for (const it of items) {
            const r = await c.query<{ added: boolean }>('SELECT app.record_assistant_feed_item($1, $2, $3::date, $4, $5) AS added', [it.source, it.title, it.date, it.link, it.text]);
            if (r.rows[0]?.added) added++;
          }
        });
        results.push({ page: p.id, found: items.length, added });
        if (items.length === 0) request.log.warn({ page: p.url }, 'Feed page gave no items; its layout may have changed');
      } catch (err) {
        request.log.warn({ err: (err as Error).message, page: p.url }, 'Feed page not read');
        results.push({ page: p.id, found: 0, added: 0, error: 'Not read' });
      }
    }
    return reply.send({ ok: results.some((r) => !r.error), results });
  });

  fastify.register(async (app) => {
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
    });

    app.get('/status', async (_request, reply) => reply.send({ model: Boolean(assistant), sources: FEED_SOURCES }));

    app.get('/threads', async (request, reply) => {
      const q = ListQuery.safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: 'Invalid' });
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (await c.query('SELECT id, kind, title, created_at, updated_at FROM public.assistant_threads WHERE ($1::text IS NULL OR kind = $1) ORDER BY updated_at DESC LIMIT 100', [q.data.kind ?? null])).rows,
      );
      return reply.send({ threads: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at })) });
    });

    app.get<{ Params: { id: string } }>('/threads/:id', async (request, reply) => {
      if (!UUID.safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const t = (await c.query('SELECT id, kind, title FROM public.assistant_threads WHERE id = $1', [request.params.id])).rows[0];
        if (!t) return null;
        const m = (await c.query('SELECT id, role, content, citations, removed, created_at FROM public.assistant_messages WHERE thread_id = $1 ORDER BY created_at', [t.id])).rows;
        return { thread: t, messages: m };
      });
      if (!out) return reply.status(404).send({ error: 'Not found' });
      return reply.send({
        thread: out.thread,
        messages: out.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, citations: m.citations, removed: m.removed, createdAt: m.created_at })),
      });
    });

    app.get<{ Params: { id: string } }>('/threads/:id/export', async (request, reply) => {
      if (!UUID.safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const t = (await c.query('SELECT id, kind, title FROM public.assistant_threads WHERE id = $1', [request.params.id])).rows[0];
        if (!t) return null;
        const m = (await c.query('SELECT role, content, citations, removed, created_at FROM public.assistant_messages WHERE thread_id = $1 ORDER BY created_at', [t.id])).rows;
        return { t, m };
      });
      if (!out) return reply.status(404).send({ error: 'Not found' });
      return reply.type('text/html; charset=utf-8').header('content-disposition', 'inline').send(exportHtml(out.t.title, out.t.kind, out.m));
    });

    app.delete<{ Params: { id: string } }>('/threads/:id', async (request, reply) => {
      if (!UUID.safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      const n = await db.withTenantTransaction(ctx(request), async (c) => (await c.query('DELETE FROM public.assistant_threads WHERE id = $1', [request.params.id])).rowCount);
      return n ? reply.status(204).send() : reply.status(404).send({ error: 'Not found' });
    });

    const modelCall = async (request: FastifyRequest, reply: FastifyReply, run: () => Promise<unknown>) => {
      if (!assistant) return reply.status(503).send(NOT_SET_UP);
      try {
        return reply.send(await run());
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: 'Invalid', message: e.message });
        request.log.warn({ err: e.message }, 'assistant failed');
        return reply.status(502).send({ error: 'NO_ANSWER', message: 'The assistant did not answer. Try again later.' });
      }
    };
    const notFound = () => Object.assign(new Error('That conversation was not found.'), { statusCode: 404 });

    app.post('/ask', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = AskBody.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Ask a question of up to 4,000 characters.' });
      return modelCall(request, reply, async () => {
        // The model is called outside the transaction; the thread is read first and written after.
        const prior = b.data.threadId
          ? await db.withTenantTransaction(ctx(request), async (c) => ((await threadFor(c, 'QUESTION', b.data.threadId, '')) ? history(c, b.data.threadId!) : null))
          : [];
        if (prior === null) throw notFound();
        const answer = await assistant!.converse(QUESTION_SYSTEM(), [...prior, { role: 'user', text: b.data.question }], { maxTokens: 1200 });
        const r = checked(answer);
        const threadId = await db.withTenantTransaction(ctx(request), async (c) => {
          const id = (await threadFor(c, 'QUESTION', b.data.threadId, b.data.question))!;
          await save(c, id, 'user', b.data.question);
          await save(c, id, 'assistant', r.text, r.citations, r.removedList);
          return id;
        });
        return { threadId, answer: r.text, citations: r.citations, removed: r.removedList, draft: true };
      });
    });

    app.post('/notice/draft', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = NoticeBody.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Paste the notice text (up to 30,000 characters) and the facts.' });
      return modelCall(request, reply, async () => {
        const input = `Notice text:\n${b.data.notice}\n\nFacts from the CA:\n${b.data.facts || '(none given)'}`;
        const answer = await assistant!.converse(NOTICE_SYSTEM(), [{ role: 'user', text: input }], { maxTokens: 2000 });
        const r = checked(answer);
        const title = `Notice reply: ${b.data.notice.replace(/\s+/g, ' ').slice(0, 120)}`;
        const threadId = await db.withTenantTransaction(ctx(request), async (c) => {
          const id = await threadFor(c, 'NOTICE', b.data.threadId, title);
          if (!id) throw notFound();
          await save(c, id, 'user', input);
          await save(c, id, 'assistant', r.text, r.citations, r.removedList);
          return id;
        });
        return { threadId, draft: r.text, citations: r.citations, removed: r.removedList };
      });
    });

    app.post('/notice/enhance', { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
      const b = EnhanceBody.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid' });
      return modelCall(request, reply, async () => {
        const turns = await db.withTenantTransaction(ctx(request), async (c) => ((await threadFor(c, 'NOTICE', b.data.threadId, '')) ? history(c, b.data.threadId, 4) : null));
        const lastDraft = turns?.filter((t) => t.role === 'assistant').pop();
        const source = turns?.find((t) => t.role === 'user');
        if (!lastDraft) throw notFound();
        const input = `${source ? `${source.text}\n\n` : ''}Draft reply to improve:\n${lastDraft.text}`;
        const answer = await assistant!.converse(ENHANCE_SYSTEM(), [{ role: 'user', text: input }], { maxTokens: 2400 });
        const r = checked(answer);
        await db.withTenantTransaction(ctx(request), (c) => save(c, b.data.threadId, 'assistant', r.text, r.citations, r.removedList));
        return { threadId: b.data.threadId, draft: r.text, citations: r.citations, removed: r.removedList };
      });
    });

    app.get('/feed', async (request, reply) => {
      const q = FeedQuery.safeParse(request.query);
      if (!q.success) return reply.status(400).send({ error: 'Invalid' });
      try {
        const rows = await db.withTenantTransaction(ctx(request), async (c) =>
          (
            await c.query(
              `SELECT id, source, title, published_on, link, body IS NOT NULL AS has_text, first_seen_at
               FROM public.assistant_feed_items WHERE ($1::text IS NULL OR source = $1)
               ORDER BY published_on DESC NULLS LAST, first_seen_at DESC LIMIT $2`,
              [q.data.source ?? null, q.data.limit],
            )
          ).rows,
        );
        return reply.send({
          sources: FEED_SOURCES,
          items: rows.map((r) => ({ id: r.id, source: r.source, title: r.title, date: r.published_on ? new Date(r.published_on).toISOString().slice(0, 10) : null, link: r.link, hasText: r.has_text, seenAt: r.first_seen_at })),
        });
      } catch (err) {
        request.log.error({ err }, 'feed list failed');
        return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
      }
    });

    app.post<{ Params: { id: string } }>('/feed/:id/explain', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!UUID.safeParse(request.params.id).success) return reply.status(404).send({ error: 'Not found' });
      return modelCall(request, reply, async () => {
        const item = await db.withTenantTransaction(ctx(request), async (c) => (await c.query('SELECT source, title, published_on, body, link FROM public.assistant_feed_items WHERE id = $1', [request.params.id])).rows[0]);
        if (!item) throw Object.assign(new Error('Not found'), { statusCode: 404 });
        const text = `Source: ${FEED_SOURCES[item.source as keyof typeof FEED_SOURCES]?.label ?? item.source}\nTitle: ${item.title}\n${item.published_on ? `Date: ${new Date(item.published_on).toISOString().slice(0, 10)}\n` : ''}${item.body ? `Summary: ${item.body}` : 'No summary on the listing page.'}`;
        const r = checked(await assistant!.converse(EXPLAIN_SYSTEM(), [{ role: 'user', text }], { maxTokens: 900 }));
        return { explanation: r.text, citations: r.citations, removed: r.removedList, link: item.link };
      });
    });
  });
}

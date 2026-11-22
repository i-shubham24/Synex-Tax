import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../db/pool.js';

/**
 * Idempotency-Key support for every state-changing request (POST, PUT, PATCH, DELETE).
 *
 * A client that may retry (a flaky network, a double click) sends the same Idempotency-Key with
 * each attempt. The first attempt runs and its answer is kept for 24 hours in
 * public.idempotency_keys (per firm, under RLS); a repeat with the same key and body gets that
 * answer back without running again; the same key with a different body is refused; a repeat
 * while the first is still running is told to wait. A failed attempt (5xx) is forgotten so it can
 * be retried. Requests without the header are unaffected.
 */

const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;
const LOCK_SECONDS = 60;

interface IdemState {
  key: string;
  firmId: string;
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    idempotency?: IdemState;
  }
}

const ctxFor = (request: FastifyRequest, firmId: string, userId: string) => ({
  firmId,
  userId,
  actorKind: 'USER' as const,
  ip: request.ip,
  requestId: request.id,
  userAgent: request.headers['user-agent'],
});

export function requestHash(method: string, route: string, body: unknown): string {
  const raw = Buffer.isBuffer(body) ? body.toString('base64') : JSON.stringify(body ?? null);
  return crypto.createHash('sha256').update(`${method}\n${route}\n${raw}`).digest('hex');
}

export async function idempotencyPreHandler(request: FastifyRequest, reply: FastifyReply) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const header = request.headers['idempotency-key'];
  if (header === undefined) return;
  if (typeof header !== 'string' || !KEY_RE.test(header)) {
    return reply.status(400).send({ error: 'Invalid', message: 'Idempotency-Key must be 8 to 128 letters, digits or - _ . :' });
  }
  if (!db.isConfigured()) return;
  try {
    await request.jwtVerify();
  } catch {
    return; // the route answers 401 itself
  }
  const { firmId, userId } = request.user as { firmId: string; userId: string };
  const route = `${request.method} ${request.routeOptions?.url ?? request.url}`.slice(0, 128);
  const hash = requestHash(request.method, route, request.body);

  const outcome = await db.withTenantTransaction(ctxFor(request, firmId, userId), async (c) => {
    // Keys older than a day are forgotten.
    await c.query(`DELETE FROM public.idempotency_keys WHERE key = $1 AND firm_id = app.current_firm_id() AND created_at < now() - interval '24 hours'`, [header]);
    const inserted = await c.query(
      `INSERT INTO public.idempotency_keys (key, firm_id, endpoint, request_hash, locked_until)
       VALUES ($1, app.current_firm_id(), $2, $3, now() + make_interval(secs => $4))
       ON CONFLICT (firm_id, key) DO NOTHING`,
      [header, route, hash, LOCK_SECONDS],
    );
    if (inserted.rowCount === 1) return { kind: 'run' as const };
    const row = (
      await c.query<{ endpoint: string; request_hash: string; response_status: number | null; response_body: unknown; locked_until: Date }>(
        'SELECT endpoint, request_hash, response_status, response_body, locked_until FROM public.idempotency_keys WHERE key = $1 AND firm_id = app.current_firm_id() FOR UPDATE',
        [header],
      )
    ).rows[0];
    if (!row) return { kind: 'run' as const };
    if (row.endpoint !== route || row.request_hash !== hash) return { kind: 'mismatch' as const };
    if (row.response_status !== null) return { kind: 'replay' as const, status: row.response_status, body: row.response_body };
    if (new Date(row.locked_until) > new Date()) return { kind: 'busy' as const };
    // The earlier attempt stopped without an answer: this one takes over.
    await c.query(`UPDATE public.idempotency_keys SET locked_until = now() + make_interval(secs => $2) WHERE key = $1 AND firm_id = app.current_firm_id()`, [header, LOCK_SECONDS]);
    return { kind: 'run' as const };
  });

  switch (outcome.kind) {
    case 'run':
      request.idempotency = { key: header, firmId, userId };
      return;
    case 'replay':
      reply.header('Idempotent-Replayed', 'true');
      return reply.status(outcome.status).send(outcome.body);
    case 'mismatch':
      return reply.status(422).send({ error: 'Idempotency key reused', message: 'This Idempotency-Key was already used for a different request.' });
    case 'busy':
      reply.header('Retry-After', '2');
      return reply.status(409).send({ error: 'In progress', message: 'The first request with this Idempotency-Key is still running. Try again shortly.' });
  }
}

export async function idempotencyOnSend(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
  const state = request.idempotency;
  if (!state) return payload;
  request.idempotency = undefined;
  const ctx = ctxFor(request, state.firmId, state.userId);
  try {
    if (reply.statusCode >= 500) {
      await db.withTenantTransaction(ctx, (c) => c.query('DELETE FROM public.idempotency_keys WHERE key = $1 AND firm_id = app.current_firm_id()', [state.key]));
      return payload;
    }
    let body: unknown = null;
    if (typeof payload === 'string' && String(reply.getHeader('content-type') ?? '').includes('json')) {
      try {
        body = JSON.parse(payload);
      } catch {
        body = null;
      }
    }
    await db.withTenantTransaction(ctx, (c) =>
      c.query(
        `UPDATE public.idempotency_keys SET response_status = $2, response_body = $3::jsonb, locked_until = now()
         WHERE key = $1 AND firm_id = app.current_firm_id()`,
        [state.key, reply.statusCode, JSON.stringify(body)],
      ),
    );
  } catch (err: any) {
    request.log.warn({ err: err.code ?? err.message }, 'Idempotency record not saved');
  }
  return payload;
}

export function registerIdempotency(app: FastifyInstance) {
  app.addHook('preHandler', idempotencyPreHandler);
  app.addHook('onSend', idempotencyOnSend);
}

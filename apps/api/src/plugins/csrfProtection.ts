import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { secrets } from '../security/env.js';

export interface CsrfOptions {
  headerName?: string;
  secret?: string;
}

export const DEFAULT_HEADER_NAME = 'x-csrf-token';
const REFRESH_COOKIE = 'synextax_refresh';

/**
 * CSRF protection for the cookie-authenticated routes (the refresh cookie is scoped to
 * /api/v1/auth). A token is bound to the session cookie the browser sent when it asked for the
 * token, so a token fetched by another site, for its own session, does not work for the
 * victim's. Requests that carry a valid bearer token are not at risk (browsers never attach one
 * on their own) and skip the check.
 */

/** What a token is bound to: the hash of the refresh cookie, or "anon" before sign-in. */
export function sessionBinding(cookieHeader: string | undefined): string {
  const m = /(?:^|;\s*)synextax_refresh=([^;]+)/.exec(cookieHeader ?? '');
  return m && m[1] ? crypto.createHash('sha256').update(decodeURIComponent(m[1])).digest('hex') : 'anon';
}

function mac(secret: string, nonce: string, ts: string, binding: string) {
  return crypto.createHmac('sha256', secret).update(`${nonce}:${ts}:${binding}`).digest('hex');
}

export function generateCsrfToken(secret: string, binding = 'anon'): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString();
  return `${nonce}.${ts}.${mac(secret, nonce, ts, binding)}`;
}

export function verifyCsrfToken(token: string, secret: string, binding = 'anon', maxAgeSeconds = 7200): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, ts, signature] = parts;
  const t = Number(ts);
  if (!/^[0-9a-f]{32}$/.test(nonce) || !Number.isInteger(t)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (now - t > maxAgeSeconds || t - now > 60) return false;
  const expected = Buffer.from(mac(secret, nonce, ts, binding), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** preHandler enforcing a CSRF token on every state-changing request without a valid bearer token. */
export function createCsrfHook(secret: string = secrets.csrf(), headerName: string = DEFAULT_HEADER_NAME) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
    // Signed webhooks prove themselves with their own HMAC.
    if (request.routeOptions?.url?.startsWith('/api/v1/compliance/webhook')) return;
    // Public upload links: the unguessable link is the credential and no cookie is involved.
    if (request.routeOptions?.url?.startsWith('/api/v1/portal/')) return;
    // The desktop agent uploads backups with its own device token and no cookies; the route checks the token.
    if (request.routeOptions?.url?.startsWith('/api/v1/backups/agent/') && request.headers.authorization?.startsWith('Device ')) return;

    if (request.headers.authorization?.startsWith('Bearer ')) {
      try {
        await request.jwtVerify();
        return;
      } catch {
        // An invalid bearer token does not excuse the request; fall through to the token check.
      }
    }

    const submitted = request.headers[headerName];
    if (typeof submitted !== 'string' || !submitted) {
      return reply.status(403).send({ error: 'Forbidden', message: 'This request needs a CSRF token. Reload the page and try again.' });
    }
    if (!verifyCsrfToken(submitted, secret, sessionBinding(request.headers.cookie))) {
      return reply.status(403).send({ error: 'Forbidden', message: 'The CSRF token is not valid for this session. Reload the page and try again.' });
    }
  };
}

/** GET /api/v1/auth/csrf issues a token bound to the caller's session cookie. */
export async function registerCsrfProtection(fastify: FastifyInstance, opts: CsrfOptions = {}) {
  const secret = opts.secret || secrets.csrf();
  const headerName = opts.headerName || DEFAULT_HEADER_NAME;
  fastify.get('/api/v1/auth/csrf', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.send({ csrfToken: generateCsrfToken(secret, sessionBinding(request.headers.cookie)), headerName });
  });
}

export { REFRESH_COOKIE };

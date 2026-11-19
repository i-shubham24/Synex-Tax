import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';

export interface CsrfOptions {
  cookieName?: string;
  headerName?: string;
  secret?: string;
}

export const DEFAULT_COOKIE_NAME = 'synextax_csrf_token';
export const DEFAULT_HEADER_NAME = 'x-csrf-token';

/**
 * Creates an HMAC-signed anti-CSRF token.
 */
export function generateCsrfToken(secret: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${timestamp}`)
    .digest('hex');
  return `${nonce}.${timestamp}.${signature}`;
}

/**
 * Verifies an HMAC-signed anti-CSRF token.
 */
export function verifyCsrfToken(token: string, secret: string, maxAgeSeconds: number = 86400): boolean {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [nonce, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > maxAgeSeconds || timestamp - now > 60) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${nonce}:${timestampStr}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');

  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Creates a preHandler hook enforcing CSRF token validation on mutating HTTP methods.
 */
export function createCsrfHook(
  secret: string = process.env.CSRF_SECRET || 'synextax_csrf_secret_32bytes_long_key!',
  headerName: string = DEFAULT_HEADER_NAME
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const method = request.method.toUpperCase();

    // Safe methods do not mutate state
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return;
    }

    // Skip CSRF verification for webhook endpoints that use signature verification
    if (request.url.startsWith('/api/v1/compliance/webhook')) {
      return;
    }

    // If request includes Authorization Bearer header from pure programmatic API clients, allow through
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return;
    }

    const tokenFromHeader = request.headers[headerName] as string | undefined;
    const tokenFromQuery = (request.query as Record<string, string>)?._csrf;
    const submittedToken = tokenFromHeader || tokenFromQuery;

    if (!submittedToken) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Missing CSRF token in '${headerName}' header. Cross-site request forgery protection is active.`,
      });
    }

    const isValid = verifyCsrfToken(submittedToken, secret);
    if (!isValid) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Invalid or expired CSRF token.',
      });
    }
  };
}

/**
 * Fastify CSRF Plugin
 */
export async function registerCsrfProtection(fastify: FastifyInstance, opts: CsrfOptions = {}) {
  const secret = opts.secret || process.env.CSRF_SECRET || 'synextax_csrf_secret_32bytes_long_key!';
  const headerName = opts.headerName || DEFAULT_HEADER_NAME;

  // Endpoint to issue a new CSRF token
  fastify.get('/api/v1/auth/csrf', async (_request: FastifyRequest, reply: FastifyReply) => {
    const token = generateCsrfToken(secret);
    return reply.send({
      csrfToken: token,
      headerName,
    });
  });
}

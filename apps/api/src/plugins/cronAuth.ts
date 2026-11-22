import type { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';

/**
 * Scheduled jobs (Vercel Cron or any scheduler) call GET endpoints with
 * `Authorization: Bearer <CRON_SECRET>`. Returns true when the caller may run the job; otherwise
 * it has already answered 404, so the endpoint does not reveal itself.
 */
export function cronAllowed(request: FastifyRequest, reply: FastifyReply): boolean {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(String(request.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || secret.length < 24 || got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) {
    reply.status(404).send({ error: 'Not found' });
    return false;
  }
  return true;
}

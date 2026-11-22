import type { FastifyRequest } from 'fastify';

/**
 * Optimistic locking for edits. A client that read a record sends its updated_at back in
 * If-Match (the ETag the API returns); the update only applies if nobody changed the record in
 * between, otherwise the API answers 409 and the client reloads. Without If-Match the update
 * applies as before.
 */
export function expectedVersion(request: FastifyRequest): string | null {
  const raw = request.headers['if-match'];
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/^W\//, '').replace(/^"|"$/g, '').trim();
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** The ETag for a record, from its updated_at. */
export function versionTag(updatedAt: Date | string): string {
  return `"${new Date(updatedAt).toISOString()}"`;
}

/** SQL condition: true when no version was sent, or the row still has that version (to the millisecond). */
export const VERSION_MATCHES = (param: string) => `(${param}::timestamptz IS NULL OR date_trunc('milliseconds', updated_at) = ${param}::timestamptz)`;

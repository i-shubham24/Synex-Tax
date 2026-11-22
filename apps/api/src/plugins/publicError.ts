/**
 * What a client may see of an error: the message of a deliberate 4xx error, otherwise a plain
 * sentence. Messages of unexpected errors can quote SQL, constraint names or row values.
 */
export function publicMessage(err: unknown): string {
  const e = err as { statusCode?: number; message?: string } | null;
  if (e && typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500 && typeof e.message === 'string') return e.message;
  return 'Something went wrong on our side. Try again; if it keeps happening, contact support.';
}

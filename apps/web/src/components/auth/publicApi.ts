/**
 * Calls to the account API made before sign-in (invitations, password reset). Each POST carries a
 * fresh CSRF token from /api/v1/auth/csrf, as the API requires for unauthenticated changes.
 */
export async function postPublic<T = Record<string, unknown>>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { message?: string } }> {
  let csrf: Record<string, string> = {};
  try {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const d = await r.json();
    if (d.csrfToken) csrf = { 'x-csrf-token': d.csrfToken };
  } catch {
    // The request below then fails with a clear message.
  }
  try {
    const res = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...csrf }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { message: 'We could not reach SynTax. Check your connection and try again.' } as T & { message?: string } };
  }
}

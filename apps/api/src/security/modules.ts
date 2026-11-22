import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/pool.js';

/**
 * Per-screen access. Client access is enforced in the database (row-level security on assigned
 * clients); this decides which parts of the product a team member may open at all.
 */
export const MODULES = ['GST', 'TDS', 'PRACTICE', 'FEES', 'DOCUMENTS', 'AUDIT', 'CLIENTS'] as const;
export type Module = (typeof MODULES)[number];

export const ROLE_DEFAULT_MODULES: Record<string, Module[]> = {
  PARTNER: [...MODULES],
  MANAGER: ['GST', 'TDS', 'PRACTICE', 'FEES', 'DOCUMENTS', 'CLIENTS'],
  STAFF: ['GST', 'TDS', 'PRACTICE', 'DOCUMENTS', 'CLIENTS'],
  CLIENT: [],
};

/** The modules a user has: partners have all; otherwise the stored list, or the role's defaults. */
export function effectiveModules(role: string, stored: string[] | null): Module[] {
  if (role === 'PARTNER') return [...MODULES];
  if (stored) return MODULES.filter((m) => stored.includes(m));
  return ROLE_DEFAULT_MODULES[role] ?? [];
}

/** Route prefixes and the module each needs. The first match wins, so the longer prefixes come first. */
const ROUTE_MODULES: Array<[string, Module]> = [
  ['/api/v1/practice/fees', 'FEES'],
  ['/api/v1/practice/tasks', 'PRACTICE'],
  ['/api/v1/practice', 'DOCUMENTS'],
  ['/api/v1/gst', 'GST'],
  ['/api/v1/recon', 'GST'],
  ['/api/v1/tds', 'TDS'],
  ['/api/v1/audit', 'AUDIT'],
  ['/api/v1/client-master/import', 'CLIENTS'],
];

/** The only API areas a CLIENT login may use. */
const CLIENT_ALLOWED = ['/api/v1/client', '/api/v1/auth', '/api/v1/account', '/api/v1/portal'];

export function moduleForUrl(url: string): Module | null {
  const path = url.split('?')[0];
  for (const [prefix, m] of ROUTE_MODULES) if (path === prefix || path.startsWith(`${prefix}/`)) return m;
  return null;
}

/**
 * Root preHandler: refuses a signed-in user a module they do not have. Requests without a valid
 * token pass through to the route's own check, which answers 401.
 */
export async function enforceModules(request: FastifyRequest, reply: FastifyReply) {
  // The route that matched, not the raw URL: Fastify decodes the path before routing, so
  // "/api/v1/%74ds/..." reaches the TDS routes and must be checked as TDS.
  const route = request.routeOptions?.url ?? request.url;
  // Client logins use the client portal and their own account only; every firm route refuses them.
  if (route.startsWith('/api/v1/') && !CLIENT_ALLOWED.some((p) => route === p || route.startsWith(`${p}/`))) {
    try {
      await request.jwtVerify();
      if ((request.user as { role?: string }).role === 'CLIENT') {
        return reply.status(403).send({ error: 'Forbidden', message: 'This part of SynexTax is for the firm’s team.' });
      }
    } catch {
      /* no valid token: the route answers itself */
    }
  }
  const module = moduleForUrl(route);
  if (!module) return;
  try {
    await request.jwtVerify();
  } catch {
    return;
  }
  const { role, firmId, userId } = request.user as { role: string; firmId: string; userId: string };
  if (role === 'PARTNER') return;
  const stored = await db.withTenantTransaction(
    { firmId, userId, actorKind: 'USER', ip: request.ip, requestId: request.id, userAgent: request.headers['user-agent'] },
    async (c) => (await c.query<{ modules: string[] | null }>('SELECT modules FROM public.users WHERE id = app.current_user_id()')).rows[0]?.modules ?? null,
  );
  if (!effectiveModules(role, stored).includes(module)) {
    return reply.status(403).send({ error: 'Forbidden', message: 'Your partner has not given you access to this part of SynexTax.' });
  }
}

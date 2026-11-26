import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/pool.js';

/**
 * Per-screen access. Client access is enforced in the database (row-level security on assigned
 * clients); this decides which parts of the product a team member may open at all.
 */
export const MODULES = ['GST', 'TDS', 'PRACTICE', 'FEES', 'DOCUMENTS', 'AUDIT', 'CLIENTS'] as const;
export type Module = (typeof MODULES)[number];

export const SUITES = ['GST', 'TDS', 'SIGN', 'DESK', 'DIRECT', 'LITIGATE'] as const;
export type Suite = (typeof SUITES)[number];

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
  ['/api/v1/billing', 'GST'],
  ['/api/v1/recon', 'GST'],
  ['/api/v1/tds', 'TDS'],
  ['/api/v1/audit', 'AUDIT'],
  ['/api/v1/client-master/import', 'CLIENTS'],
];

const ROUTE_SUITES: Array<[string, Suite]> = [
  ['/api/v1/gst', 'GST'],
  ['/api/v1/billing', 'GST'],
  ['/api/v1/recon', 'GST'],
  ['/api/v1/tds', 'TDS'],
  ['/api/v1/dsc', 'SIGN'],
  ['/api/v1/client-master', 'DESK'],
  ['/api/v1/practice', 'DESK'],
  ['/api/v1/audit', 'DESK'],
  ['/api/v1/itr', 'DIRECT'],
  ['/api/v1/itr-import', 'DIRECT'],
  ['/api/v1/itr-statements', 'DIRECT'],
  ['/api/v1/itr-returns', 'DIRECT'],
];

/** The only API areas a CLIENT login may use. */
const CLIENT_ALLOWED = ['/api/v1/client', '/api/v1/auth', '/api/v1/account', '/api/v1/portal'];

export function moduleForUrl(url: string): Module | null {
  const path = url.split('?')[0];
  for (const [prefix, m] of ROUTE_MODULES) if (path === prefix || path.startsWith(`${prefix}/`)) return m;
  return null;
}

export function suiteForUrl(url: string): Suite | null {
  const path = url.split('?')[0];
  for (const [prefix, s] of ROUTE_SUITES) if (path === prefix || path.startsWith(`${prefix}/`)) return s;
  return null;
}

/**
 * Root preHandler: refuses a signed-in user a module they do not have, and verifies
 * firm suite entitlements. Requests without a valid token pass through to the route's own check.
 */
export async function enforceModules(request: FastifyRequest, reply: FastifyReply) {
  // The route that matched, not the raw URL: Fastify decodes the path before routing
  const route = request.routeOptions?.url ?? request.url;
  // Client logins use the client portal and their own account only; every firm route refuses them.
  if (route.startsWith('/api/v1/') && !CLIENT_ALLOWED.some((p) => route === p || route.startsWith(`${p}/`))) {
    try {
      await request.jwtVerify();
      if ((request.user as { role?: string }).role === 'CLIENT') {
        return reply.status(403).send({ error: 'Forbidden', message: 'This part of SynTax is for the firm team.' });
      }
    } catch {
      /* no valid token: the route answers itself */
    }
  }

  const module = moduleForUrl(route);
  const suite = suiteForUrl(route);
  if (!module && !suite) return;

  try {
    await request.jwtVerify();
  } catch {
    return;
  }

  const { role, firmId, userId } = request.user as { role: string; firmId: string; userId: string };

  const firmData = await db.withTenantTransaction(
    { firmId, userId, actorKind: 'USER', ip: request.ip, requestId: request.id, userAgent: request.headers['user-agent'] },
    async (c) => {
      const uRes = await c.query<{ modules: string[] | null }>('SELECT modules FROM public.users WHERE id = app.current_user_id()');
      const fRes = await c.query<{ enabled_suites: string[]; trial_ends_at: string | null }>('SELECT enabled_suites, trial_ends_at FROM public.firms WHERE id = app.current_firm_id()');
      return {
        modules: uRes.rows[0]?.modules ?? null,
        enabledSuites: fRes.rows[0]?.enabled_suites ?? ['GST', 'TDS', 'SIGN', 'DESK', 'DIRECT'],
        trialEndsAt: fRes.rows[0]?.trial_ends_at ?? null,
      };
    },
  );

  // Suite entitlement. A firm in its trial may use every suite that is built; otherwise the
  // firm's enabled_suites decide. No trial date means a paid firm, not an endless trial.
  if (suite) {
    const isTrialActive = firmData.trialEndsAt !== null && new Date(firmData.trialEndsAt).getTime() > Date.now();
    const allowedSuites: readonly string[] = isTrialActive ? SUITES : firmData.enabledSuites;
    if (!allowedSuites.includes(suite)) {
      return reply.status(403).send({
        code: 'SUITE_NOT_ENABLED',
        error: 'Forbidden',
        message: `Suite ${suite} is not enabled for your firm.`,
        suite,
      });
    }
  }

  if (role === 'PARTNER') return;

  if (module && !effectiveModules(role, firmData.modules).includes(module)) {
    return reply.status(403).send({ error: 'Forbidden', message: 'Your partner has not given you access to this part of SynTax.' });
  }
}

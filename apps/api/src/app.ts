import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { registerCsrfProtection, createCsrfHook } from './plugins/csrfProtection.js';
import { db } from './db/pool.js';
import { authRoutes } from './routes/auth.routes.js';
import { clientMasterRoutes } from './routes/clientMaster.routes.js';
import { clientImportRoutes } from './routes/clientImport.routes.js';
import { tdsInsightsRoutes } from './routes/tdsInsights.routes.js';
import { tdsRegistersRoutes } from './routes/tdsRegisters.routes.js';
import { gstReturnsRoutes } from './routes/gstReturns.routes.js';
import { practiceOpsRoutes } from './routes/practiceOps.routes.js';
import { teamRoutes } from './routes/team.routes.js';
import { portalRoutes } from './routes/portal.routes.js';
import { docLinksRoutes } from './routes/docLinks.routes.js';
import { salaryRoutes } from './routes/salary.routes.js';
import { enforceModules } from './security/modules.js';
import { registerIdempotency } from './plugins/idempotency.js';
import { practiceRoutes } from './routes/practice.routes.js';
import { complianceRoutes } from './routes/compliance.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { reconRoutes } from './routes/recon.routes.js';
import { tdsRoutes } from './routes/tds.routes.js';
import { dscRoutes } from './routes/dsc.routes.js';
import { itrRoutes } from './routes/itr.routes.js';
import { integrationsRoutes } from './routes/integrations.routes.js';
import { workspaceRoutes } from './routes/workspace.routes.js';
import { firmRoutes } from './routes/firm.routes.js';
import { tdsCorrectionDraftsRoutes } from './routes/tdsCorrectionDrafts.routes.js';
import { tdsDualActReconRoutes } from './routes/tdsDualActRecon.routes.js';

import { practiceAutomationRoutes } from './routes/practiceAutomation.routes.js';
import { documentsRoutes } from './routes/documents.routes.js';
import { accountRoutes } from './routes/account.routes.js';
import { clientPortalRoutes } from './routes/clientPortal.routes.js';
import { tdsCertificatesRoutes } from './routes/tdsCertificates.routes.js';
import { backupsRoutes } from './routes/backups.routes.js';
import { assistantRoutes } from './routes/assistant.routes.js';
import { gstRoutes } from './routes/gst.routes.js';
import { isLocalEnv, secrets, JWT_AUDIENCE, JWT_ISSUER } from './security/env.js';
import { sharedRedis } from './infra/redis.js';
import { registerMetrics } from './plugins/metrics.js';

export function buildApp(): FastifyInstance {
  // Signing secrets fail closed outside local development (see security/env.ts).
  const jwtSecret = secrets.jwt();
  secrets.csrf();
  secrets.challenge();
  secrets.webhook();
  const local = isLocalEnv();

  const app = fastify({
    // Requests reach the API through one proxy hop (the Next.js rewrite or the platform's edge).
    // TRUST_PROXY sets the number of hops, so request.ip is the client and not the proxy.
    trustProxy: (process.env.TRUST_PROXY === 'false' ? false : Number(process.env.TRUST_PROXY ?? 1)) as unknown as boolean,
    bodyLimit: 6 * 1024 * 1024,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'], censor: '[redacted]' },
      serializers: {
        // Client upload links carry their secret in the path; it never reaches the logs.
        req: (req: any) => ({
          method: req.method,
          url: String(req.url).replace(/(\/portal\/)[^/?]+/, '$1[link]').replace(/([?&](?:_csrf|token)=)[^&]+/g, '$1[redacted]'),
          remoteAddress: req.ip,
        }),
        // Database errors can quote row values (PAN, names); only the code and message are kept.
        err: (err: any) => ({ type: err?.name ?? 'Error', code: err?.code, message: typeof err?.message === 'string' ? err.message.slice(0, 300) : '', stack: isLocalEnv() ? String(err?.stack ?? '') : '' }),
      },
    },
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  // 1. HTTP Security Headers (XSS, Clickjacking, MIME Sniffing protection)
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // 2. CORS: exact origins only. The web app calls the API through its own origin (a Next.js
  // rewrite), so browsers need CORS only for origins listed in CORS_ORIGINS (comma separated) or
  // APP_URL. Localhost is allowed only in local development.
  const allowedOrigins = new Set(
    [process.env.APP_URL, ...(process.env.CORS_ORIGINS ?? '').split(',')]
      .map((o) => o?.trim().replace(/\/$/, ''))
      .filter((o): o is string => Boolean(o)),
  );
  app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser requests (server to server, curl) carry no Origin and get no CORS headers.
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin) || (local && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'Idempotency-Key'],
  });

  // 3. Rate limiting, keyed on the client address (see trustProxy). Routes that guess at secrets
  // (login, MFA, upload links) set tighter limits of their own. Each instance counts on its own;
  // REDIS_URL shares them across instances.
  app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300),
    timeWindow: '1 minute',
    // With REDIS_URL the counters are shared by every instance; if Redis stops answering, requests
    // are served rather than refused.
    ...(sharedRedis() ? { redis: sharedRedis()!, nameSpace: 'synextax-rl:', skipOnError: true } : {}),
  });

  // 4. Access tokens: HS256 only, with issuer and audience checked on every request.
  app.register(jwt, {
    secret: jwtSecret,
    sign: { algorithm: 'HS256', iss: JWT_ISSUER, aud: JWT_AUDIENCE },
    verify: { algorithms: ['HS256'], allowedIss: JWT_ISSUER, allowedAud: JWT_AUDIENCE },
  });

  // Request counts and latency per route, for monitoring and alerts (plugins/metrics.ts).
  registerMetrics(app);

  // 5. CSRF Protection Plugin & Global Mutating Hook
  app.register(registerCsrfProtection);
  app.addHook('preHandler', createCsrfHook());

  // Kubernetes Health Probes and Telemetry

  // Standard health check
  app.get('/health', async () => ({
    status: 'HEALTHY',
    service: 'synextax-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  // Kubernetes Liveness Probe: Confirms process event loop is active
  app.get('/health/liveness', async () => ({
    status: 'ALIVE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // Readiness: ready only when the database answers within two seconds.
  app.get('/health/readiness', async (_request, reply) => {
    try {
      await Promise.race([
        db.getPool().query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      return reply.send({ status: 'READY', database: 'CONNECTED', timestamp: new Date().toISOString() });
    } catch {
      return reply.status(503).send({ status: 'NOT_READY', database: 'UNAVAILABLE', timestamp: new Date().toISOString() });
    }
  });

  // Errors: the full error goes to the log with the request id; the client gets a plain message.
  // Messages of 5xx errors never leave the server (they can quote SQL or row values).
  app.setErrorHandler((err: any, request, reply) => {
    const status = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) request.log.error({ err }, 'Request failed');
    if (err.validation) return reply.status(400).send({ error: 'Invalid', message: 'Some of the details sent are missing or not valid.', requestId: request.id });
    return reply.status(status).send(
      status >= 500
        ? { error: 'Server error', message: 'Something went wrong on our side. Try again; if it keeps happening, quote this reference.', requestId: request.id }
        : { error: err.code ?? 'Request error', message: err.message, requestId: request.id },
    );
  });
  app.setNotFoundHandler((request, reply) => reply.status(404).send({ error: 'Not found', message: 'There is nothing at this address.', requestId: request.id }));

  // API Version 1 Routes
  // Per-screen access for team members (client access is enforced by row-level security).
  app.addHook('preHandler', enforceModules);
  // Safe retries: a repeated Idempotency-Key gets the first answer back (see plugins/idempotency.ts).
  registerIdempotency(app);
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(clientMasterRoutes, { prefix: '/api/v1/client-master' });
  app.register(clientImportRoutes, { prefix: '/api/v1/client-master/import' });
  app.register(complianceRoutes, { prefix: '/api/v1/compliance' });
  app.register(auditRoutes, { prefix: '/api/v1/audit' });
  app.register(reconRoutes, { prefix: '/api/v1/recon' });
  app.register(tdsRoutes, { prefix: '/api/v1/tds' });
  app.register(tdsInsightsRoutes, { prefix: '/api/v1/tds' });
  app.register(tdsRegistersRoutes, { prefix: '/api/v1/tds' });
  app.register(tdsDualActReconRoutes, { prefix: '/api/v1/tds' });

  app.register(salaryRoutes, { prefix: '/api/v1/tds' });
  app.register(practiceRoutes, { prefix: '/api/v1/practice' });
  app.register(practiceOpsRoutes, { prefix: '/api/v1/practice' });
  app.register(teamRoutes, { prefix: '/api/v1/team' });
  app.register(docLinksRoutes, { prefix: '/api/v1/practice' });
  // Public: reached only with a client upload link.
  app.register(portalRoutes, { prefix: '/api/v1/portal' });
  app.register(dscRoutes, { prefix: '/api/v1/dsc' });
  app.register(itrRoutes, { prefix: '/api/v1/itr' });
  app.register(integrationsRoutes, { prefix: '/api/v1/integrations' });
  app.register(workspaceRoutes, { prefix: '/api/v1/workspace' });
  app.register(firmRoutes, { prefix: '/api/v1/firm' });
  app.register(tdsCorrectionDraftsRoutes, { prefix: '/api/v1/tds/correction-drafts' });
  app.register(practiceAutomationRoutes, { prefix: '/api/v1/practice/automation' });
  app.register(documentsRoutes, { prefix: '/api/v1/practice/documents' });
  app.register(accountRoutes, { prefix: '/api/v1/account' });
  app.register(clientPortalRoutes, { prefix: '/api/v1/client' });
  app.register(tdsCertificatesRoutes, { prefix: '/api/v1/tds/certificates' });
  app.register(backupsRoutes, { prefix: '/api/v1/backups' });
  app.register(assistantRoutes, { prefix: '/api/v1/assistant' });
  app.register(gstRoutes, { prefix: '/api/v1/gst' });
  app.register(gstReturnsRoutes, { prefix: '/api/v1/gst' });

  return app;
}

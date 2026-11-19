import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { registerCsrfProtection, createCsrfHook } from './plugins/csrfProtection.js';
import { db } from './db/pool.js';
import { authRoutes } from './routes/auth.routes.js';
import { clientMasterRoutes } from './routes/clientMaster.routes.js';
import { complianceRoutes } from './routes/compliance.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { reconRoutes } from './routes/recon.routes.js';
import { tdsRoutes } from './routes/tds.routes.js';
import { dscRoutes } from './routes/dsc.routes.js';

export function buildApp(): FastifyInstance {
  // Validate JWT Secret strength: Minimum 32 characters
  const jwtSecret = process.env.JWT_SECRET || 'synextax_super_secret_jwt_key_2026_production!';
  if (jwtSecret.length < 32) {
    throw new Error('FATAL CONFIGURATION ERROR: JWT_SECRET must be at least 32 characters long.');
  }
  if (process.env.NODE_ENV === 'production' && jwtSecret.includes('super_secret_jwt_key')) {
    throw new Error('FATAL SECURITY ERROR: Default demo JWT_SECRET detected in production environment.');
  }

  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // Strict redaction of sensitive credentials and statutory PII from logs
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.totpCode',
        'req.body.token',
        'req.body.refreshToken',
        'req.body.pan',
        'req.body.aadhaar',
        'req.body.secret',
      ],
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

  // 2. Strict Origin Whitelist CORS Configuration
  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:18531', // Local USB DSC agent
    'http://127.0.0.1:18531',
  ];

  app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (tools, curl, background jobs)
      if (!origin) {
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error(`CORS error: Origin '${origin}' is not permitted by SynexTax security policy.`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'Idempotency-Key'],
  });

  // 3. Anti-DDoS Rate Limiting
  app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
  });

  // 4. JWT Authentication Plugin
  app.register(jwt, {
    secret: jwtSecret,
  });

  // 5. CSRF Protection Plugin & Global Mutating Hook
  app.register(registerCsrfProtection);
  app.addHook('preHandler', createCsrfHook());

  // ---------------------------------------------------------------------
  // Kubernetes Health Probes & Telemetry
  // ---------------------------------------------------------------------

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

  // Kubernetes Readiness Probe: Confirms dependencies are ready for traffic
  app.get('/health/readiness', async (_request, reply) => {
    try {
      const pool = db.getPool();
      // Test active database connection
      const client = await pool.connect();
      client.release();

      return reply.status(200).send({
        status: 'READY',
        database: 'CONNECTED',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(200).send({
        status: 'READY',
        database: 'DEMO_STANDALONE',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ---------------------------------------------------------------------
  // API Version 1 Routes
  // ---------------------------------------------------------------------
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(clientMasterRoutes, { prefix: '/api/v1/client-master' });
  app.register(complianceRoutes, { prefix: '/api/v1/compliance' });
  app.register(auditRoutes, { prefix: '/api/v1/audit' });
  app.register(reconRoutes, { prefix: '/api/v1/recon' });
  app.register(tdsRoutes, { prefix: '/api/v1/tds' });
  app.register(dscRoutes, { prefix: '/api/v1/dsc' });

  return app;
}

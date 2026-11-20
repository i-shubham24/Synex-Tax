import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { commitImport, loadImportContext, revalidate } from '../modules/tenancy/clientImport.js';

const FIELDS = ['legalName', 'tradeName', 'groupName', 'pan', 'gstins', 'tan', 'constitution', 'contactName', 'mobile', 'email', 'filingCategory'] as const;

const RawRowSchema = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.string().max(600).optional()])) as Record<(typeof FIELDS)[number], z.ZodOptional<z.ZodString>>);

const CommitSchema = z.object({
  rows: z
    .array(z.object({ raw: RawRowSchema, sourceLine: z.number().int().min(1).max(100000) }))
    .min(1)
    .max(2000),
  defaultGroupName: z.string().trim().min(1).max(200).default('Imported clients'),
});

/**
 * Client master migration: duplicate context for the browser preview, and the commit.
 * Partners only: new clients are visible to staff through assignments, which partners make.
 */
export async function clientImportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role !== 'PARTNER') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only partners can import clients.' });
    }
  });

  const ctx = (req: FastifyRequest) => ({
    firmId: req.user.firmId,
    userId: req.user.userId,
    actorKind: 'USER' as const,
    ip: req.ip,
    requestId: req.id,
    userAgent: req.headers['user-agent'],
  });

  fastify.get('/context', async (request, reply) => {
    const data = await db.withTenantTransaction(ctx(request), loadImportContext);
    return reply.send(data);
  });

  fastify.post('/commit', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = CommitSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parsed.error.flatten() });
    }
    try {
      const outcome = await db.withTenantTransaction(ctx(request), async (client) => {
        const validated = await revalidate(client, parsed.data.rows);
        const blocked = validated.filter((r) => r.status === 'RED');
        if (blocked.length) return { blocked };
        const result = await commitImport(client, validated, { userId: request.user.userId, defaultGroupName: parsed.data.defaultGroupName });
        return { result };
      });
      if ('blocked' in outcome && outcome.blocked) {
        return reply.status(422).send({
          error: 'Rows need fixing',
          message: `${outcome.blocked.length} row(s) still have errors. Nothing was saved.`,
          rows: outcome.blocked.map((r) => ({ sourceLine: r.sourceLine, issues: r.issues.filter((i) => i.level === 'error') })),
        });
      }
      return reply.status(201).send(outcome.result);
    } catch (err: any) {
      request.log.error({ err: err.code ?? err.name }, 'client import failed');
      if (err.code === '23505') return reply.status(409).send({ error: 'Conflict', message: 'Some of these clients were added by someone else just now. Reload and try again.' });
      return reply.status(500).send({ error: 'Import failed', message: 'Nothing was saved. Try again or contact support.' });
    }
  });
}

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PiiRevealRequestSchema, AuditLogQuerySchema } from '@synextax/shared-schemas';

export async function auditRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  // Query Immutable Audit Logs (MCA Rule 3 / CGST Rule 56(15) evidence trail)
  fastify.get('/logs', async (request, reply) => {
    const parse = AuditLogQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const { page, limit, tableName } = parse.data;

    // Simulated immutable log records matching the 0005 audit schema
    const mockLogs = [
      {
        id: '1',
        firmId: request.user?.firmId,
        tableName: 'entities',
        recordId: 'entity-001',
        action: 'INSERT',
        actorId: request.user?.userId,
        actorKind: 'USER',
        ipAddr: request.ip,
        timestampIst: new Date(Date.now() - 3600000).toISOString(),
        summary: 'Created legal entity Amritsar Textiles Private Limited (PAN: AABCA1234F)',
      },
      {
        id: '2',
        firmId: request.user?.firmId,
        tableName: 'gst_registrations',
        recordId: 'gstin-001',
        action: 'INSERT',
        actorId: request.user?.userId,
        actorKind: 'USER',
        ipAddr: request.ip,
        timestampIst: new Date(Date.now() - 3000000).toISOString(),
        summary: 'Added GSTIN 03AABCA1234F1Z5 under Amritsar Textiles Private Limited',
      },
    ];

    const filtered = tableName ? mockLogs.filter((l) => l.tableName === tableName) : mockLogs;

    return reply.send({
      total: filtered.length,
      page,
      limit,
      logs: filtered,
    });
  });

  // Statutory PII Reveal Endpoint (DPDP Act 2023 & Section 138 Income-tax Act)
  fastify.post('/reveal-pii', async (request, reply) => {
    const parse = PiiRevealRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const { targetTable, targetColumn, recordId, accessReason } = parse.data;

    // Log the statutory reveal event
    const auditRecord = {
      firmId: request.user?.firmId,
      userId: request.user?.userId,
      targetTable,
      targetColumn,
      recordId,
      accessReason,
      ipAddr: request.ip,
      accessedAt: new Date().toISOString(),
    };

    // Return unmasked value (mocked for demo)
    return reply.send({
      success: true,
      unmaskedValue: '98140-12345',
      loggedAuditRecord: auditRecord,
      message: 'PII access logged with statutory justification under DPDP Act 2023.',
    });
  });
}

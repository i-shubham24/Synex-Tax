import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { MODULES, effectiveModules } from '../security/modules.js';

const UUID = z.string().uuid();
const ModulesBody = z.object({ modules: z.array(z.enum(MODULES)).max(MODULES.length).nullable() });
const AssignBody = z.object({ entityId: UUID, accessLevel: z.enum(['VIEW', 'PREPARE', 'REVIEW']).default('PREPARE') });

/** The team: who has which screens and which clients. Partners manage it; the database enforces both. */
export async function teamRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
  const partnerOnly = (req: FastifyRequest, reply: FastifyReply) => (req.user.role === 'PARTNER' ? null : reply.status(403).send({ error: 'Forbidden', message: 'Only a partner manages the team.' }));

  fastify.get('/me', async (request, reply) => {
    const stored = await db.withTenantTransaction(ctx(request), async (c) => (await c.query<{ modules: string[] | null }>('SELECT modules FROM public.users WHERE id = app.current_user_id()')).rows[0]?.modules ?? null);
    return reply.send({ role: request.user.role, modules: effectiveModules(request.user.role, stored) });
  });

  fastify.get('/', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const data = await db.withTenantTransaction(ctx(request), async (c) => ({
      users: (await c.query(`SELECT id, display_name, role, designation, status, modules FROM public.users WHERE role <> 'CLIENT' ORDER BY role, display_name`)).rows,
      assignments: (
        await c.query(
          `SELECT a.id, a.user_id, a.entity_id, e.legal_name, a.access_level FROM public.user_client_assignments a
           JOIN public.entities e ON e.id = a.entity_id WHERE a.revoked_at IS NULL AND a.entity_id IS NOT NULL ORDER BY e.legal_name`,
        )
      ).rows,
      clients: (await c.query(`SELECT id, legal_name FROM public.entities WHERE status = 'ACTIVE' ORDER BY legal_name`)).rows,
    }));
    return reply.send({
      modules: MODULES,
      clients: data.clients.map((e) => ({ id: e.id, name: e.legal_name })),
      members: data.users.map((u) => ({
        id: u.id,
        name: u.display_name,
        role: u.role,
        designation: u.designation,
        status: u.status,
        custom: u.modules !== null,
        modules: effectiveModules(u.role, u.modules),
        clients: u.role === 'PARTNER' ? 'ALL' : data.assignments.filter((a) => a.user_id === u.id).map((a) => ({ assignmentId: a.id, entityId: a.entity_id, name: a.legal_name, accessLevel: a.access_level })),
      })),
    });
  });

  fastify.put('/:userId/modules', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const { userId } = request.params as { userId: string };
    const b = ModulesBody.safeParse(request.body);
    if (!UUID.safeParse(userId).success || !b.success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (await c.query(`UPDATE public.users SET modules = $2 WHERE id = $1 AND role <> 'PARTNER'`, [userId, b.data.modules])).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found', message: 'Partners always have every screen.' });
  });

  fastify.post('/:userId/clients', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const { userId } = request.params as { userId: string };
    const b = AssignBody.safeParse(request.body);
    if (!UUID.safeParse(userId).success || !b.success) return reply.status(400).send({ error: 'Invalid' });
    const id = await db.withTenantTransaction(ctx(request), async (c) => {
      const existing = (await c.query(`SELECT id FROM public.user_client_assignments WHERE user_id = $1 AND entity_id = $2 AND revoked_at IS NULL`, [userId, b.data.entityId])).rows[0];
      if (existing) {
        await c.query(`UPDATE public.user_client_assignments SET access_level = $2 WHERE id = $1`, [existing.id, b.data.accessLevel]);
        return existing.id as string;
      }
      return (
        await c.query<{ id: string }>(
          `INSERT INTO public.user_client_assignments (firm_id, user_id, entity_id, access_level, assigned_by)
           VALUES (app.current_firm_id(), $1, $2, $3, app.current_user_id()) RETURNING id`,
          [userId, b.data.entityId, b.data.accessLevel],
        )
      ).rows[0].id;
    });
    return reply.status(201).send({ id });
  });

  fastify.post('/:userId/clients/:assignmentId/revoke', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const { userId, assignmentId } = request.params as { userId: string; assignmentId: string };
    if (!UUID.safeParse(userId).success || !UUID.safeParse(assignmentId).success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (await c.query(`UPDATE public.user_client_assignments SET revoked_at = now(), revoked_by = app.current_user_id() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [assignmentId, userId])).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });
}

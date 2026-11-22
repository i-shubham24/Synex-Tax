import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CHECKLIST_TEMPLATES, SERVICE_LABEL, documentGaps, type ChecklistService, type GapChecklist } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { deliverReminder, loadReminderTarget, recordReminder } from '../modules/practice/reminders.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';

const SERVICES = Object.keys(CHECKLIST_TEMPLATES) as [ChecklistService, ...ChecklistService[]];
const CreateSchema = z.object({
  entityId: z.guid(),
  service: z.enum(SERVICES),
  periodLabel: z.string().trim().min(3).max(32),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  extraItems: z.array(z.string().trim().min(2).max(160)).max(20).optional(),
});
const ItemSchema = z.object({
  status: z.enum(['MISSING', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'NOT_NEEDED']),
  note: z.string().trim().max(500).optional(),
  receivedVia: z.enum(['WHATSAPP', 'EMAIL', 'PAPER', 'PORTAL', 'OTHER']).optional(),
});
const ReminderSchema = z.object({ channel: z.enum(['WHATSAPP', 'EMAIL']) });

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Document checklists, the gap view and client reminders. */
export async function practiceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });

  async function loadChecklists(c: any, onlyOpen: boolean) {
    const lists = await c.query(
      `SELECT k.id, k.entity_id, k.service, k.period_label, k.due_date, k.status, e.legal_name AS client_name,
              (SELECT max(sent_at) FROM public.doc_reminders r WHERE r.checklist_id = k.id) AS last_reminder
       FROM public.doc_checklists k JOIN public.entities e ON e.id = k.entity_id
       WHERE ($1::boolean IS FALSE OR k.status = 'OPEN')
       ORDER BY k.due_date, e.legal_name LIMIT 500`,
      [onlyOpen],
    );
    const items = await c.query(
      `SELECT id, checklist_id, label, status, note, received_via, position, updated_at FROM public.doc_checklist_items ORDER BY position`,
    );
    return lists.rows.map((k: any) => ({
      id: k.id,
      entityId: k.entity_id,
      clientName: k.client_name,
      service: k.service,
      periodLabel: k.period_label,
      dueDate: iso(k.due_date),
      status: k.status,
      lastReminder: k.last_reminder,
      items: items.rows.filter((i: any) => i.checklist_id === k.id).map((i: any) => ({ id: i.id, label: i.label, status: i.status, note: i.note, receivedVia: i.received_via, version: new Date(i.updated_at).toISOString() })),
    }));
  }

  fastify.get('/checklists', async (request, reply) => {
    const data = await db.withTenantTransaction(ctx(request), (c) => loadChecklists(c, false));
    return reply.send({ checklists: data, services: SERVICES.map((s) => ({ id: s, label: SERVICE_LABEL[s], items: CHECKLIST_TEMPLATES[s] })) });
  });

  fastify.get('/gaps', async (request, reply) => {
    const data = await db.withTenantTransaction(ctx(request), (c) => loadChecklists(c, true));
    return reply.send(documentGaps(data as GapChecklist[], istToday()));
  });

  fastify.post('/checklists', async (request, reply) => {
    const body = CreateSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Validation Error', details: body.error.flatten() });
    try {
      const id = await db.withTenantTransaction(ctx(request), async (c) => {
        const k = await c.query(
          `INSERT INTO public.doc_checklists (firm_id, entity_id, service, period_label, due_date, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5) RETURNING id`,
          [body.data.entityId, body.data.service, body.data.periodLabel, body.data.dueDate, request.user.userId],
        );
        const labels = [...CHECKLIST_TEMPLATES[body.data.service], ...(body.data.extraItems ?? [])];
        for (const [i, label] of labels.entries()) {
          await c.query(
            `INSERT INTO public.doc_checklist_items (firm_id, entity_id, checklist_id, position, label) VALUES (app.current_firm_id(), $1, $2, $3, $4)`,
            [body.data.entityId, k.rows[0].id, i + 1, label],
          );
        }
        return k.rows[0].id as string;
      });
      return reply.status(201).send({ id });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Exists', message: 'This client already has that checklist for the period.' });
      if (/row-level security|violates foreign key/.test(err.message)) return reply.status(403).send({ error: 'Forbidden', message: 'This client is not assigned to you.' });
      throw err;
    }
  });

  fastify.patch('/items/:id', async (request, reply) => {
    const body = ItemSchema.safeParse(request.body);
    const { id } = request.params as { id: string };
    if (!body.success || !/^[0-9a-f-]{36}$/.test(id)) return reply.status(400).send({ error: 'Validation Error' });
    const expected = expectedVersion(request);
    const updated = await db.withTenantTransaction(ctx(request), async (c) => {
      const r = await c.query<{ checklist_id: string; updated_at: Date }>(
        `UPDATE public.doc_checklist_items SET status = $2, note = COALESCE($3, note), received_via = COALESCE($4, received_via), updated_by = $5
         WHERE id = $1 AND ${VERSION_MATCHES('$6')} RETURNING checklist_id, updated_at`,
        [id, body.data.status, body.data.note ?? null, body.data.receivedVia ?? null, request.user.userId, expected],
      );
      if (!r.rows[0]) return expected && (await c.query('SELECT 1 FROM public.doc_checklist_items WHERE id = $1', [id])).rowCount ? ('stale' as const) : false;
      reply.header('ETag', versionTag(r.rows[0].updated_at));
      // A checklist with nothing outstanding is complete; reopening an item reopens it.
      await c.query(
        `UPDATE public.doc_checklists k SET status = CASE WHEN EXISTS (
           SELECT 1 FROM public.doc_checklist_items i WHERE i.checklist_id = k.id AND i.status IN ('MISSING','REJECTED')) THEN 'OPEN' ELSE 'COMPLETE' END
         WHERE k.id = $1 AND k.status <> 'CANCELLED'`,
        [r.rows[0].checklist_id],
      );
      return true;
    });
    if (updated === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone updated this item after you opened it. Reload to see the latest.' });
    return updated ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });

  // Sends the reminder (when mail or WhatsApp is set up) or returns a link the user sends; records it.
  fastify.post('/checklists/:id/reminder', async (request, reply) => {
    const body = ReminderSchema.safeParse(request.body);
    const { id } = request.params as { id: string };
    if (!body.success || !/^[0-9a-f-]{36}$/.test(id)) return reply.status(400).send({ error: 'Validation Error' });
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const target = await loadReminderTarget(c, id);
      if (!target) return null;
      let result;
      try {
        result = await deliverReminder(target, body.data.channel);
      } catch (err) {
        return { error: (err as Error).message };
      }
      if (result.link || result.sent) await recordReminder(c, target, body.data.channel, request.user.userId);
      return { message: result.message, link: result.link, sent: result.sent, missingContact: !result.link && !result.sent };
    });
    if (out && 'error' in out) return reply.status(502).send({ error: 'Not sent', message: out.error });
    return out ? reply.send(out) : reply.status(404).send({ error: 'Not found' });
  });
}

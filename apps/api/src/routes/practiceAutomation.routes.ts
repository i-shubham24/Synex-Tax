import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { cronAllowed } from '../plugins/cronAuth.js';
import { expectedVersion, versionTag } from '../plugins/concurrency.js';
import { publicMessage } from '../plugins/publicError.js';
import { addDays, istToday, loadOpenChecklists, nextStep, readSettings, runAllFirms } from '../modules/practice/automation.js';
import { reminderSenders } from '../modules/practice/reminders.js';

const UUID = z.guid();
const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const SettingsBody = z.object({
  clientDays: z
    .array(z.number().int().min(1).max(60))
    .max(4)
    .refine((d) => new Set(d).size === d.length, 'Each reminder day once.'),
  firmNoteDay: z.number().int().min(1).max(90).nullable(),
  channels: z.array(z.enum(['EMAIL', 'WHATSAPP'])).max(2).refine((c) => new Set(c).size === c.length, 'Each channel once.'),
  paused: z.boolean(),
});
const ChecklistBody = z.object({ paused: z.boolean().optional(), sentOn: ISO.optional() }).refine((b) => b.paused !== undefined || b.sentOn !== undefined, 'Nothing to change.');
const LogQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

/** Automatic document reminders. Mounted at /api/v1/practice/automation. */
export async function practiceAutomationRoutes(fastify: FastifyInstance) {
  // The daily job (Vercel Cron or any scheduler) with the cron secret; no user session.
  fastify.get('/run', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!cronAllowed(request, reply)) return reply;
    try {
      const out = await runAllFirms(istToday(), (firmId, err) => request.log.error({ err, firmId }, 'Reminder automation failed for a firm'));
      return reply.send({ ok: true, date: istToday(), ...out });
    } catch (err) {
      request.log.error({ err }, 'Reminder automation failed');
      return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
    }
  });

  fastify.register(async (app) => {
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
    });
    const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
    const lead = (req: FastifyRequest) => ['PARTNER', 'MANAGER'].includes(req.user.role);

    app.get('/', async (request, reply) => {
      const { settings, updatedAt } = await db.withTenantTransaction(ctx(request), (c) => readSettings(c));
      const senders = reminderSenders();
      if (updatedAt) reply.header('ETag', versionTag(updatedAt));
      return reply.send({
        settings,
        version: updatedAt ? new Date(updatedAt).toISOString() : null,
        canEdit: lead(request),
        sending: { email: Boolean(senders.mailer), whatsapp: Boolean(senders.whatsapp) },
      });
    });

    app.put('/', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      if (!lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers change the reminder settings.' });
      const b = SettingsBody.safeParse(request.body);
      if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the reminder settings.' });
      const d = b.data;
      const days = [...d.clientDays].sort((x, y) => x - y);
      const expected = expectedVersion(request);
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query<{ updated_at: Date }>(
          `INSERT INTO public.practice_automation_settings (firm_id, client_days, firm_note_day, channels, paused, updated_by)
           VALUES (app.current_firm_id(), $1::smallint[], $2, $3::text[], $4, app.current_user_id())
           ON CONFLICT (firm_id) DO UPDATE SET client_days = EXCLUDED.client_days, firm_note_day = EXCLUDED.firm_note_day,
             channels = EXCLUDED.channels, paused = EXCLUDED.paused, updated_by = EXCLUDED.updated_by
           WHERE ($5::timestamptz IS NULL OR date_trunc('milliseconds', public.practice_automation_settings.updated_at) = $5::timestamptz)
           RETURNING updated_at`,
          [days, d.firmNoteDay, d.channels, d.paused, expected],
        );
        return r.rows[0]?.updated_at ?? null;
      });
      if (!out) return reply.status(409).send({ error: 'Changed', message: 'Someone changed the reminder settings after you opened them. Reload to see theirs.' });
      reply.header('ETag', versionTag(out));
      return reply.send({ ok: true, version: new Date(out).toISOString() });
    });

    // Open checklists with something outstanding: when each was sent, the next step, the steps so far.
    app.get('/checklists', async (request, reply) => {
      const today = istToday();
      const data = await db.withTenantTransaction(ctx(request), async (c) => ({ ...(await readSettings(c)), lists: await loadOpenChecklists(c) }));
      return reply.send({
        today,
        paused: data.settings.paused,
        checklists: data.lists.map((k) => ({
          id: k.id,
          entityId: k.entityId,
          clientName: k.clientName,
          service: k.service,
          periodLabel: k.periodLabel,
          dueDate: k.dueDate,
          outstanding: k.outstanding,
          sentOn: k.sentOn,
          paused: k.paused,
          version: k.rowUpdatedAt ? new Date(k.rowUpdatedAt).toISOString() : null,
          next: k.paused || data.settings.paused ? null : nextStep({ sentOn: k.sentOn, today, settings: data.settings, log: k.log }),
          steps: k.log,
        })),
      });
    });

    // Pause or resume one checklist, or start its schedule from a given day.
    app.put('/checklists/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const b = ChecklistBody.safeParse(request.body);
      if (!UUID.safeParse(id).success || !b.success) return reply.status(400).send({ error: 'Invalid', message: b.success ? 'Invalid checklist.' : (b.error.issues[0]?.message ?? 'Check the request.') });
      const today = istToday();
      if (b.data.sentOn && (b.data.sentOn > today || b.data.sentOn < addDays(today, -90))) {
        return reply.status(400).send({ error: 'Invalid', message: 'The sent date must be within the last 90 days.' });
      }
      const expected = expectedVersion(request);
      const out = await db.withTenantTransaction<Date | 'missing' | 'stale'>(ctx(request), async (c) => {
        const k = (await c.query<{ entity_id: string }>(`SELECT entity_id FROM public.doc_checklists WHERE id = $1`, [id])).rows[0];
        if (!k) return 'missing' as const;
        const r = await c.query<{ updated_at: Date }>(
          `INSERT INTO public.practice_checklist_automation (firm_id, entity_id, checklist_id, sent_on, paused, updated_by)
           VALUES (app.current_firm_id(), $1, $2, $3, COALESCE($4, false), app.current_user_id())
           ON CONFLICT (firm_id, checklist_id) DO UPDATE SET sent_on = COALESCE($3, public.practice_checklist_automation.sent_on),
             paused = COALESCE($4, public.practice_checklist_automation.paused), updated_by = EXCLUDED.updated_by
           WHERE ($5::timestamptz IS NULL OR date_trunc('milliseconds', public.practice_checklist_automation.updated_at) = $5::timestamptz)
           RETURNING updated_at`,
          [k.entity_id, id, b.data.sentOn ?? null, b.data.paused ?? null, expected],
        );
        return r.rows[0]?.updated_at ?? ('stale' as const);
      });
      if (out === 'missing') return reply.status(404).send({ error: 'Not found' });
      if (out === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone changed this checklist’s reminders after you opened them. Reload to see the latest.' });
      reply.header('ETag', versionTag(out));
      return reply.send({ ok: true, version: new Date(out).toISOString() });
    });

    // What the job did lately: messages to clients and notes to the firm.
    app.get('/log', async (request, reply) => {
      const q = LogQuery.safeParse(request.query ?? {});
      if (!q.success) return reply.status(400).send({ error: 'Invalid' });
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (
          await c.query(
            `SELECT l.id, l.checklist_id, l.kind, l.step_day, l.run_on, l.outcome, l.channels, l.detail, l.outstanding, e.legal_name, k.period_label, k.status AS checklist_status
             FROM public.practice_automation_log l
             JOIN public.doc_checklists k ON k.id = l.checklist_id
             JOIN public.entities e ON e.id = l.entity_id
             WHERE l.run_on >= $1::date
             ORDER BY l.run_on DESC, l.created_at DESC
             LIMIT 300`,
            [addDays(istToday(), -q.data.days)],
          )
        ).rows,
      );
      return reply.send({
        entries: rows.map((r) => ({
          id: r.id,
          checklistId: r.checklist_id,
          clientName: r.legal_name,
          periodLabel: r.period_label,
          checklistOpen: r.checklist_status === 'OPEN',
          kind: r.kind,
          stepDay: Number(r.step_day),
          runOn: typeof r.run_on === 'string' ? r.run_on : new Date(r.run_on).toISOString().slice(0, 10),
          outcome: r.outcome,
          channels: r.channels ?? [],
          detail: r.detail,
          outstanding: r.outstanding,
        })),
      });
    });
  });
}

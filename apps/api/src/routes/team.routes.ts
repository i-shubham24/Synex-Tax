import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { MODULES, effectiveModules } from '../security/modules.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { randomToken, sha256 } from '../security/authCrypto.js';
import { accountMailer, appOrigin, invitationEmail } from '../modules/auth/accountMail.js';
import { safeDisplayText, safeOptionalDisplayText } from '../security/inputSanitization.js';

const UUID = z.guid();
const ModulesBody = z.object({ modules: z.array(z.enum(MODULES)).max(MODULES.length).nullable() });
const AssignBody = z.object({ entityId: UUID, accessLevel: z.enum(['VIEW', 'PREPARE', 'REVIEW']).default('PREPARE') });
const InviteBody = z.object({
  email: z.string().trim().email().max(254),
  name: safeDisplayText('Name', 2, 120),
  role: z.enum(['MANAGER', 'STAFF', 'CLIENT']),
  designation: safeOptionalDisplayText('Designation', 80),
  entityIds: z.array(UUID).max(200).default([]),
  accessLevel: z.enum(['VIEW', 'PREPARE', 'REVIEW']).default('PREPARE'),
});
const ISO_DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MeetingQuery = z.object({ from: ISO_DAY, to: ISO_DAY });
const MeetingBody = z.object({
  title: z.string().trim().min(2).max(160),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(600).default(30),
  location: z.string().trim().max(200).optional(),
  entityId: UUID.nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});
const MeetingPatch = MeetingBody.partial().extend({ status: z.enum(['SCHEDULED', 'CANCELLED']).optional() });
/** Invitation links work for three days. */
const INVITE_HOURS = 72;

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
      users: (await c.query(`SELECT id, display_name, role, designation, status, modules, updated_at FROM public.users WHERE role <> 'CLIENT' ORDER BY role, display_name`)).rows,
      assignments: (
        await c.query(
          `SELECT a.id, a.user_id, a.entity_id, e.legal_name, a.access_level FROM public.user_client_assignments a
           JOIN public.entities e ON e.id = a.entity_id WHERE a.revoked_at IS NULL AND a.entity_id IS NOT NULL ORDER BY e.legal_name`,
        )
      ).rows,
      clients: (await c.query(`SELECT id, legal_name FROM public.entities WHERE status = 'ACTIVE' ORDER BY legal_name`)).rows,
      contacts: (await c.query(`SELECT id, display_name, status FROM public.users WHERE role = 'CLIENT' ORDER BY display_name`)).rows,
    }));
    return reply.send({
      modules: MODULES,
      clients: data.clients.map((e) => ({ id: e.id, name: e.legal_name })),
      // Client contacts sign in to see their own entities only.
      contacts: data.contacts.map((u) => ({
        id: u.id,
        name: u.display_name,
        status: u.status,
        clients: data.assignments.filter((a) => a.user_id === u.id).map((a) => ({ assignmentId: a.id, entityId: a.entity_id, name: a.legal_name })),
      })),
      members: data.users.map((u) => ({
        id: u.id,
        name: u.display_name,
        role: u.role,
        designation: u.designation,
        status: u.status,
        custom: u.modules !== null,
        version: new Date(u.updated_at).toISOString(),
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
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const r = await c.query<{ updated_at: Date }>(
        `UPDATE public.users SET modules = $2 WHERE id = $1 AND role <> 'PARTNER' AND ${VERSION_MATCHES('$3')} RETURNING updated_at`,
        [userId, b.data.modules, expected],
      );
      if (r.rows[0]) return r.rows[0].updated_at as Date;
      return expected && (await c.query(`SELECT 1 FROM public.users WHERE id = $1 AND role <> 'PARTNER'`, [userId])).rowCount ? ('stale' as const) : null;
    });
    if (out === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone changed this person’s screens after you opened them. Reload to see the latest.' });
    if (!out) return reply.status(404).send({ error: 'Not found', message: 'Partners always have every screen.' });
    reply.header('ETag', versionTag(out));
    return reply.send({ ok: true, version: out.toISOString() });
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

  // ------------------------------------------------------------------ invitations
  // A partner invites a manager, a team member or a client contact by email. The link carries a
  // random token; only its SHA-256 is kept. Without email set up, the partner gets the link to send.
  const firmName = async (c: { query: (q: string) => Promise<{ rows: Array<{ name: string }> }> }) =>
    (await c.query(`SELECT COALESCE(trade_name, legal_name) AS name FROM public.firms WHERE id = app.current_firm_id()`)).rows[0]?.name ?? 'Your CA firm';

  const deliverInvite = async (request: FastifyRequest, inv: { email: string; name: string; role: string; firm: string }, token: string) => {
    const link = `${appOrigin(request)}/invite/${token}`;
    const mailer = accountMailer();
    if (!mailer) return { emailed: false, link, message: `Email is not set up for this workspace, so send this link to ${inv.name} yourself. It works once, for ${INVITE_HOURS} hours.` };
    try {
      await mailer.send(invitationEmail({ to: inv.email, name: inv.name, firmName: inv.firm, role: inv.role, link, hours: INVITE_HOURS }));
      return { emailed: true, message: `Invitation emailed to ${inv.email}. The link works once, for ${INVITE_HOURS} hours.` };
    } catch (err) {
      request.log.error({ err }, 'Invitation email not sent');
      return { emailed: false, link, message: `The email could not be sent. Send this link to ${inv.name} yourself; it works once, for ${INVITE_HOURS} hours.` };
    }
  };

  fastify.get('/invitations', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT i.id, i.email, i.display_name, i.role, i.designation, i.access_level, i.status, i.expires_at, i.last_sent_at, i.send_count, i.created_at, i.accepted_at,
                  ARRAY(SELECT e.legal_name FROM public.entities e WHERE e.id = ANY(i.entity_ids) ORDER BY e.legal_name) AS client_names
           FROM public.user_invitations i
           WHERE i.status = 'PENDING' OR i.updated_at > now() - interval '30 days'
           ORDER BY i.created_at DESC LIMIT 200`,
        )
      ).rows,
    );
    const now = Date.now();
    return reply.send({
      emailConfigured: Boolean(accountMailer()),
      invitations: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.display_name,
        role: r.role,
        designation: r.designation,
        accessLevel: r.access_level,
        clients: r.client_names ?? [],
        status: r.status === 'PENDING' && new Date(r.expires_at).getTime() <= now ? 'EXPIRED' : r.status,
        expiresAt: new Date(r.expires_at).toISOString(),
        lastSentAt: new Date(r.last_sent_at).toISOString(),
        sendCount: r.send_count,
        createdAt: new Date(r.created_at).toISOString(),
        acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
      })),
    });
  });

  fastify.post('/invitations', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const b = InviteBody.safeParse(request.body);
    if (!b.success) {
      const field = String(b.error.issues[0]?.path[0] ?? '');
      return reply.status(400).send({ error: 'Invalid', message: field === 'email' ? 'Enter a valid email address.' : field === 'name' ? 'Enter their name.' : 'Check the details of the invitation.' });
    }
    const d = b.data;
    const entityIds = [...new Set(d.entityIds)];
    if (d.role === 'CLIENT' && !entityIds.length) return reply.status(400).send({ error: 'Invalid', message: 'Choose at least one client this contact may see.' });
    const token = randomToken(32);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (entityIds.length) {
        const n = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.entities WHERE id = ANY($1::uuid[])`, [entityIds])).rows[0].n;
        if (n !== entityIds.length) return { kind: 'bad-client' as const };
      }
      await c.query('SAVEPOINT invite');
      try {
        const id = (
          await c.query<{ id: string }>(
            `INSERT INTO public.user_invitations (firm_id, email, display_name, role, designation, entity_ids, access_level, token_hash, expires_at, invited_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5::uuid[], $6, $7, now() + make_interval(hours => $8), app.current_user_id()) RETURNING id`,
            [d.email, d.name, d.role, d.designation || null, entityIds, d.role === 'CLIENT' ? 'CLIENT_PORTAL' : d.accessLevel, sha256(token), INVITE_HOURS],
          )
        ).rows[0].id;
        return { kind: 'ok' as const, id, firm: await firmName(c) };
      } catch (err: any) {
        if (err?.code !== '23505') throw err;
        await c.query('ROLLBACK TO SAVEPOINT invite');
        return { kind: 'duplicate' as const };
      }
    });
    if (out.kind === 'bad-client') return reply.status(400).send({ error: 'Invalid', message: 'One of the chosen clients is not in this firm.' });
    if (out.kind === 'duplicate') return reply.status(409).send({ error: 'Duplicate', message: 'There is already an open invitation for this email. Send it again or withdraw it.' });
    const sent = await deliverInvite(request, { email: d.email, name: d.name, role: d.role, firm: out.firm }, token);
    return reply.status(201).send({ id: out.id, ...sent });
  });

  fastify.post('/invitations/:id/resend', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    // A fresh token and a fresh expiry; the old link stops working.
    const token = randomToken(32);
    const row = await db.withTenantTransaction(ctx(request), async (c) => {
      const r = (
        await c.query(
          `UPDATE public.user_invitations SET token_hash = $2, expires_at = now() + make_interval(hours => $3), send_count = send_count + 1, last_sent_at = now()
           WHERE id = $1 AND status = 'PENDING' AND send_count < 50
           RETURNING email, display_name, role`,
          [id, sha256(token), INVITE_HOURS],
        )
      ).rows[0];
      return r ? { email: r.email as string, name: r.display_name as string, role: r.role as string, firm: await firmName(c) } : null;
    });
    if (!row) return reply.status(404).send({ error: 'Not found', message: 'Only an open invitation can be sent again.' });
    return reply.send({ id, ...(await deliverInvite(request, row, token)) });
  });

  fastify.post('/invitations/:id/revoke', async (request, reply) => {
    if (partnerOnly(request, reply)) return;
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (await c.query(`UPDATE public.user_invitations SET status = 'REVOKED', revoked_at = now(), revoked_by = app.current_user_id() WHERE id = $1 AND status = 'PENDING'`, [id])).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found', message: 'Only an open invitation can be withdrawn.' });
  });

  // ------------------------------------------------------------------ firm meetings (practice calendar)
  const notClient = (req: FastifyRequest, reply: FastifyReply) => (req.user.role === 'CLIENT' ? reply.status(403).send({ error: 'Forbidden' }) : null);
  const lead = (req: FastifyRequest) => ['PARTNER', 'MANAGER'].includes(req.user.role);
  // Calendar days are Indian days.
  const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`);

  fastify.get('/meetings', async (request, reply) => {
    if (notClient(request, reply)) return;
    const q = MeetingQuery.safeParse(request.query);
    if (!q.success || q.data.from > q.data.to) return reply.status(400).send({ error: 'Invalid', message: 'Pass ?from= and ?to= as dates.' });
    const from = istStart(q.data.from);
    const to = new Date(istStart(q.data.to).getTime() + 86_400_000);
    if (to.getTime() - from.getTime() > 100 * 86_400_000) return reply.status(400).send({ error: 'Invalid', message: 'Ask for at most 100 days at a time.' });
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT m.id, m.title, m.starts_at, m.duration_minutes, m.location, m.entity_id, e.legal_name AS client, m.notes, m.status, m.created_by,
                  u.display_name AS created_by_name, m.updated_at
           FROM public.firm_meetings m
           LEFT JOIN public.entities e ON e.id = m.entity_id
           LEFT JOIN public.users u ON u.id = m.created_by
           WHERE m.starts_at >= $1 AND m.starts_at < $2
           ORDER BY m.starts_at LIMIT 1000`,
          [from, to],
        )
      ).rows,
    );
    return reply.send({
      meetings: rows.map((m) => ({
        id: m.id,
        title: m.title,
        startsAt: new Date(m.starts_at).toISOString(),
        durationMinutes: m.duration_minutes,
        location: m.location,
        entityId: m.entity_id,
        client: m.client,
        notes: m.notes,
        status: m.status,
        createdBy: m.created_by_name,
        canEdit: m.created_by === request.user.userId || lead(request),
        version: new Date(m.updated_at).toISOString(),
      })),
    });
  });

  fastify.post('/meetings', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (notClient(request, reply)) return;
    const b = MeetingBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: 'Give the meeting a title, a date and a time.' });
    const d = b.data;
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (d.entityId && !(await c.query('SELECT 1 FROM public.entities WHERE id = $1', [d.entityId])).rowCount) return null;
      return (
        await c.query<{ id: string; updated_at: Date }>(
          `INSERT INTO public.firm_meetings (firm_id, title, starts_at, duration_minutes, location, entity_id, notes, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, app.current_user_id()) RETURNING id, updated_at`,
          [d.title, d.startsAt, d.durationMinutes, d.location || null, d.entityId ?? null, d.notes || null],
        )
      ).rows[0];
    });
    if (!out) return reply.status(400).send({ error: 'Invalid', message: 'That client is not one you work on.' });
    reply.header('ETag', versionTag(out.updated_at));
    return reply.status(201).send({ id: out.id, version: new Date(out.updated_at).toISOString() });
  });

  fastify.patch('/meetings/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (notClient(request, reply)) return;
    const { id } = request.params as { id: string };
    const b = MeetingPatch.safeParse(request.body);
    if (!UUID.safeParse(id).success || !b.success) return reply.status(400).send({ error: 'Invalid', message: 'Check the meeting details.' });
    const d = b.data;
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      if (d.entityId && !(await c.query('SELECT 1 FROM public.entities WHERE id = $1', [d.entityId])).rowCount) return { kind: 'bad-client' as const };
      const r = await c.query<{ updated_at: Date }>(
        `UPDATE public.firm_meetings SET
           title = COALESCE($2, title),
           starts_at = COALESCE($3::timestamptz, starts_at),
           duration_minutes = COALESCE($4, duration_minutes),
           location = CASE WHEN $5 THEN $6 ELSE location END,
           entity_id = CASE WHEN $7 THEN $8::uuid ELSE entity_id END,
           notes = CASE WHEN $9 THEN $10 ELSE notes END,
           status = COALESCE($11, status)
         WHERE id = $1 AND (created_by = app.current_user_id() OR $12) AND ${VERSION_MATCHES('$13')}
         RETURNING updated_at`,
        [id, d.title ?? null, d.startsAt ?? null, d.durationMinutes ?? null, d.location !== undefined, d.location || null, d.entityId !== undefined, d.entityId ?? null, d.notes !== undefined, d.notes || null, d.status ?? null, lead(request), expected],
      );
      if (r.rows[0]) return { kind: 'ok' as const, version: r.rows[0].updated_at };
      const row = (await c.query<{ created_by: string }>('SELECT created_by FROM public.firm_meetings WHERE id = $1', [id])).rows[0];
      if (!row) return { kind: 'missing' as const };
      if (row.created_by !== request.user.userId && !lead(request)) return { kind: 'forbidden' as const };
      return { kind: 'stale' as const };
    });
    if (out.kind === 'bad-client') return reply.status(400).send({ error: 'Invalid', message: 'That client is not one you work on.' });
    if (out.kind === 'missing') return reply.status(404).send({ error: 'Not found' });
    if (out.kind === 'forbidden') return reply.status(403).send({ error: 'Forbidden', message: 'Only the person who added a meeting, a manager or a partner can change it.' });
    if (out.kind === 'stale') return reply.status(409).send({ error: 'Changed', message: 'Someone changed this meeting after you opened it. Reload to see the latest.' });
    reply.header('ETag', versionTag(out.version));
    return reply.send({ ok: true, version: new Date(out.version).toISOString() });
  });
}

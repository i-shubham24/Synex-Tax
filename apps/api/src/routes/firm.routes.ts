import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';

const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: 'USER' as const,
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const FirmBody = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
  frn: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[0-9]{6}[A-Z]$/).nullable()),
  pan: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/).nullable()),
  gstin: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).nullable()),
  phone: z.preprocess(blankToNull, z.string().trim().regex(/^\+91[6-9][0-9]{9}$|^0[1-9][0-9]{6,10}$/).nullable()),
  addressLine: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
  city: z.preprocess(blankToNull, z.string().trim().max(80).nullable()),
  pin: z.preprocess(blankToNull, z.string().trim().regex(/^[1-9][0-9]{5}$/).nullable()),
});

const FIELD: Record<string, string> = { legalName: 'firm name', frn: 'ICAI firm registration number (6 digits and a letter)', pan: 'PAN', gstin: 'GSTIN', phone: 'phone (+91 and 10 digits, or a landline with STD code)', pin: 'PIN code' };

/** The firm's own details, read by anyone in the firm and changed by a partner. */
export async function firmRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  fastify.get('/', async (request, reply) => {
    const row = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT f.legal_name, f.trade_name, f.icai_frn, f.pan, f.gstin, f.contact_phone, f.address_line, f.address_city, f.address_pin, f.updated_at,
                  u.display_name AS me
           FROM public.firms f LEFT JOIN public.users u ON u.id = app.current_user_id()
           WHERE f.id = app.current_firm_id()`,
        )
      ).rows[0],
    );
    if (!row) return reply.status(404).send({ error: 'Not found' });
    reply.header('ETag', versionTag(row.updated_at));
    return reply.send({
      legalName: row.legal_name,
      tradeName: row.trade_name,
      frn: row.icai_frn,
      pan: row.pan,
      gstin: row.gstin,
      phone: row.contact_phone,
      addressLine: row.address_line,
      city: row.address_city,
      pin: row.address_pin,
      me: row.me,
      version: new Date(row.updated_at).toISOString(),
      canEdit: request.user.role === 'PARTNER',
    });
  });

  fastify.put('/', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (request.user.role !== 'PARTNER') return reply.status(403).send({ error: 'Forbidden', message: 'Only a partner changes the firm’s details.' });
    const b = FirmBody.safeParse(request.body);
    if (!b.success) {
      const fields = [...new Set(b.error.issues.map((i) => FIELD[String(i.path[0])] ?? String(i.path[0])))];
      return reply.status(400).send({ error: 'Invalid', message: `Check: ${fields.join(', ')}.` });
    }
    const d = b.data;
    const expected = expectedVersion(request);
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const r = await c.query<{ updated_at: Date }>(
        `UPDATE public.firms SET legal_name = $1, trade_name = $2, icai_frn = $3, pan = $4, gstin = $5, contact_phone = $6, address_line = $7, address_city = $8, address_pin = $9
         WHERE id = app.current_firm_id() AND ${VERSION_MATCHES('$10')} RETURNING updated_at`,
        [d.legalName, d.tradeName, d.frn, d.pan, d.gstin, d.phone, d.addressLine, d.city, d.pin, expected],
      );
      return r.rows[0]?.updated_at ?? null;
    });
    if (!out) return reply.status(409).send({ error: 'Changed', message: 'Another partner saved the firm’s details after you opened them. Reload to see their changes.' });
    reply.header('ETag', versionTag(out));
    return reply.send({ ok: true, version: new Date(out).toISOString() });
  });
}

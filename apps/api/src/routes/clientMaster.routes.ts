import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import {
  ClientGroupCreateSchema,
  EntityCreateSchema,
  GstRegistrationCreateSchema,
  TanRegistrationCreateSchema,
} from '@synextax/shared-schemas';
import { validateGstin, validatePan } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { publicMessage } from '../plugins/publicError.js';

export async function clientMasterRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  const getCtx = (req: FastifyRequest) => {
    const user = req.user as { firmId: string; userId: string; role: string };
    return {
      firmId: user.firmId,
      userId: user.userId,
      actorKind: 'USER' as const,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  };

  // 1. Unified 4-Tier Hierarchy Tree Endpoint (Backed by PostgreSQL 17 RLS)
  fastify.get('/tree', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string } | undefined;
    if (!user?.firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    try {
      const tree = await db.withTenantTransaction(getCtx(request), async (client) => {
        // Fetch groups
        const groupsRes = await client.query(
          `SELECT id, name, code, notes, status, created_at, updated_at
           FROM public.client_groups
           WHERE firm_id = app.current_firm_id()
           ORDER BY name`,
        );

        // Fetch entities (PostgreSQL RLS limits staff to assigned entities; partners see all)
        const entitiesRes = await client.query(
          `SELECT id, client_group_id, pan, legal_name, trade_name, constitution,
                  cin, llpin, status, created_at, updated_at
           FROM public.entities
           WHERE firm_id = app.current_firm_id()
           ORDER BY legal_name`,
        );

        // Fetch GST registrations
        const gstRes = await client.query(
          `SELECT id, entity_id, gstin, state_code, legal_name_on_portal, trade_name_on_portal,
                  registration_type, filing_category, portal_registration_status, api_access_status,
                  lut_arn, lut_valid_from::text, lut_valid_to::text,
                  cancellation_status, cancellation_arn, cancellation_applied_at, auto_approval_due_at, cancellation_reason,
                  created_at, updated_at
           FROM public.gst_registrations
           WHERE firm_id = app.current_firm_id()`,
        );

        // Fetch TAN registrations
        const tanRes = await client.query(
          `SELECT id, entity_id, tan, deductor_type_code, branch_name, status,
                  created_at, updated_at
           FROM public.tan_registrations
           WHERE firm_id = app.current_firm_id()`,
        );

        const groups = groupsRes.rows.map((g) => {
          const gEntities = entitiesRes.rows
            .filter((e) => e.client_group_id === g.id)
            .map((e) => ({
              id: e.id,
              clientGroupId: e.client_group_id,
              pan: e.pan,
              legalName: e.legal_name,
              tradeName: e.trade_name,
              constitution: e.constitution,
              msmeUdyamNumber: e.msme_udyam_number,
              isRule14bEco: e.is_rule_14b_eco,
              rule86bExempt: e.rule_86b_exempt,
              rule86bExemptReason: e.rule_86b_exempt_reason,
              accountingSoftware: e.accounting_software || 'TallyPrime',
              status: e.status,
              createdAt: e.created_at,
              updatedAt: e.updated_at,
              gstRegistrations: gstRes.rows
                .filter((gst) => gst.entity_id === e.id)
                .map((gst) => ({
                  id: gst.id,
                  entityId: gst.entity_id,
                  gstin: gst.gstin,
                  stateCode: gst.state_code,
                  legalName: gst.legal_name_on_portal,
                  tradeName: gst.trade_name_on_portal,
                  registrationType: gst.registration_type,
                  filingCategory: gst.filing_category,
                  portalStatus: gst.portal_registration_status,
                  apiStatus: gst.api_access_status,
                  lutArn: gst.lut_arn ?? null,
                  lutValidFrom: gst.lut_valid_from ?? null,
                  lutValidTo: gst.lut_valid_to ?? null,
                  cancellationStatus: gst.cancellation_status ?? 'NONE',
                  cancellationArn: gst.cancellation_arn ?? null,
                  cancellationAppliedAt: gst.cancellation_applied_at ?? null,
                  autoApprovalDueAt: gst.auto_approval_due_at ?? null,
                  cancellationReason: gst.cancellation_reason ?? null,
                })),
              tanRegistrations: tanRes.rows
                .filter((tan) => tan.entity_id === e.id)
                .map((tan) => ({
                  id: tan.id,
                  entityId: tan.entity_id,
                  tan: tan.tan,
                  category: tan.deductor_category,
                  status: tan.status,
                })),
            }));

          return {
            id: g.id,
            name: g.name,
            code: g.code,
            notes: g.notes,
            status: g.status,
            createdAt: g.created_at,
            updatedAt: g.updated_at,
            entities: gEntities,
          };
        });

        return {
          firmId: user.firmId,
          totalGroups: groups.length,
          totalEntities: entitiesRes.rows.length,
          totalGstins: gstRes.rows.length,
          totalTans: tanRes.rows.length,
          groups,
        };
      });

      return reply.send(tree);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  // 2. Client Groups
  fastify.get('/client-groups', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `SELECT id, name, code, notes, status, created_at, updated_at
           FROM public.client_groups
           WHERE firm_id = app.current_firm_id()
           ORDER BY name`,
        );
        return res.rows;
      });
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  fastify.post('/client-groups', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = ClientGroupCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const created = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `INSERT INTO public.client_groups (firm_id, name, code, notes, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4)
           RETURNING id, name, code, notes, status, created_at, updated_at`,
          [parse.data.groupName, parse.data.description?.slice(0, 32) || null, parse.data.description || null, user.userId],
        );
        return res.rows[0];
      });
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  // 3. Legal Entities
  fastify.get('/entities', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `SELECT id, client_group_id, pan, legal_name, trade_name, constitution,
                  cin, llpin, status, created_at, updated_at
           FROM public.entities
           WHERE firm_id = app.current_firm_id()
           ORDER BY legal_name`,
        );
        return res.rows;
      });
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  fastify.post('/entities', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = EntityCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const panResult = validatePan(parse.data.pan);
    if (!panResult.isValid) {
      return reply.status(400).send({ error: 'Invalid PAN', message: panResult.error });
    }

    try {
      const created = await db.withTenantTransaction(getCtx(request), async (client) => {
        // BOLA Guard: Verify parent group belongs to current firm
        const grp = await client.query('SELECT id FROM public.client_groups WHERE id = $1 AND firm_id = app.current_firm_id()', [parse.data.clientGroupId]);
        if (grp.rows.length === 0) {
          const err: any = new Error('Parent client group not found or does not belong to your firm.');
          err.statusCode = 403;
          throw err;
        }

        const res = await client.query(
          `INSERT INTO public.entities (firm_id, client_group_id, pan, legal_name, trade_name, constitution, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6)
           RETURNING id, client_group_id, pan, legal_name, trade_name, constitution, cin, llpin, status, created_at, updated_at`,
          [
            parse.data.clientGroupId,
            parse.data.pan,
            parse.data.legalName,
            parse.data.tradeName || null,
            parse.data.constitution,
            user.userId,
          ],
        );
        return res.rows[0];
      });
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: 'Creation Error', message: publicMessage(err) });
    }
  });

  // 4. GST Registrations
  fastify.get('/gst-registrations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `SELECT id, entity_id, gstin, state_code, legal_name_on_portal, trade_name_on_portal,
                  registration_type, filing_category, portal_registration_status, api_access_status,
                  lut_arn, lut_valid_from::text, lut_valid_to::text,
                  cancellation_status, cancellation_arn, cancellation_applied_at, auto_approval_due_at, cancellation_reason,
                  created_at, updated_at
           FROM public.gst_registrations
           WHERE firm_id = app.current_firm_id()`,
        );
        return res.rows;
      });
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  fastify.post('/gst-registrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = GstRegistrationCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const gstinResult = validateGstin(parse.data.gstin);
    if (!gstinResult.isValid) {
      return reply.status(400).send({ error: 'Invalid GSTIN', message: gstinResult.error });
    }

    try {
      const created = await db.withTenantTransaction(getCtx(request), async (client) => {
        // Verify entity exists and belongs to firm
        const ent = await client.query('SELECT pan FROM public.entities WHERE id = $1 AND firm_id = app.current_firm_id()', [parse.data.entityId]);
        if (ent.rows.length === 0) {
          const err: any = new Error('Parent entity not found or does not belong to your firm.');
          err.statusCode = 403;
          throw err;
        }

        // Validate entity PAN matches characters 3-12 of GSTIN
        if (parse.data.gstin.slice(2, 12) !== ent.rows[0].pan) {
          const err: any = new Error(`GSTIN PAN (${parse.data.gstin.slice(2, 12)}) does not match Entity PAN (${ent.rows[0].pan})`);
          err.statusCode = 400;
          throw err;
        }

        const filingCategory = parse.data.filingFrequency === 'QRMP' ? 'QRMP' : 'REGULAR_MONTHLY';

        const res = await client.query(
          `INSERT INTO public.gst_registrations (firm_id, entity_id, gstin, legal_name_on_portal, trade_name_on_portal, registration_type, filing_category, portal_registration_status, api_access_status, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, 'ACTIVE', 'NOT_ENABLED', $7)
           RETURNING id, entity_id, gstin, state_code, legal_name_on_portal, trade_name_on_portal, registration_type, filing_category, portal_registration_status, api_access_status, created_at, updated_at`,
          [
            parse.data.entityId,
            parse.data.gstin,
            parse.data.legalName || null,
            parse.data.tradeName || null,
            parse.data.registrationType,
            filingCategory,
            user.userId,
          ],
        );
        return res.rows[0];
      });
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: 'Creation Error', message: publicMessage(err) });
    }
  });

  // Update Nov 5, 2026 GST registration cancellation tracking & auto-approval window
  fastify.patch('/gst-registrations/:id/cancellation', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only partners or managers can update GSTIN cancellation tracking.' });
    }
    const body = (request.body ?? {}) as {
      cancellationStatus?: 'NONE' | 'APPLIED' | 'QUERY_RAISED' | 'AUTO_APPROVED' | 'APPROVED' | 'REJECTED';
      cancellationArn?: string;
      cancellationReason?: string;
    };
    const status = body.cancellationStatus ?? 'APPLIED';
    if (!['NONE', 'APPLIED', 'QUERY_RAISED', 'AUTO_APPROVED', 'APPROVED', 'REJECTED'].includes(status)) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Invalid cancellation status.' });
    }

    try {
      const updated = await db.withTenantTransaction(getCtx(request), async (client) => {
        const portalStatus =
          status === 'APPROVED' || status === 'AUTO_APPROVED'
            ? 'CANCELLED'
            : status === 'APPLIED' || status === 'QUERY_RAISED'
              ? 'CANCELLATION_PENDING'
              : 'ACTIVE';
        const res = await client.query(
          `UPDATE public.gst_registrations
           SET cancellation_status = $2,
               cancellation_arn = COALESCE($3, cancellation_arn),
               cancellation_reason = COALESCE($4, cancellation_reason),
               cancellation_applied_at = CASE WHEN $2 = 'APPLIED' AND cancellation_applied_at IS NULL THEN now() ELSE cancellation_applied_at END,
               auto_approval_due_at = CASE WHEN $2 = 'APPLIED' THEN now() + INTERVAL '3 days' ELSE auto_approval_due_at END,
               portal_registration_status = $5,
               updated_at = now()
           WHERE id = $1 AND firm_id = app.current_firm_id()
           RETURNING id, gstin, portal_registration_status, cancellation_status, cancellation_arn, cancellation_applied_at, auto_approval_due_at, cancellation_reason`,
          [request.params.id, status, body.cancellationArn ?? null, body.cancellationReason ?? null, portalStatus],
        );
        return res.rows[0] ?? null;
      });
      if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'GSTIN registration not found.' });
      return reply.send({ success: true, registration: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Update Error', message: publicMessage(err) });
    }
  });

  // Update LUT (Form RFD-11) ARN & renewal dates
  fastify.patch('/gst-registrations/:id/lut', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only partners or managers can update LUT details.' });
    }
    const body = (request.body ?? {}) as { lutArn?: string; lutValidFrom?: string; lutValidTo?: string };
    if (!body.lutArn || !body.lutValidTo) {
      return reply.status(400).send({ error: 'Validation Error', message: 'Pass lutArn and lutValidTo (YYYY-MM-DD).' });
    }
    const lutArn = body.lutArn.trim();
    const lutValidFrom = body.lutValidFrom ?? null;
    const lutValidTo = body.lutValidTo;

    try {
      const updated = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `UPDATE public.gst_registrations
           SET lut_arn = $2,
               lut_valid_from = COALESCE($3::date, lut_valid_from),
               lut_valid_to = $4::date,
               updated_at = now()
           WHERE id = $1 AND firm_id = app.current_firm_id()
           RETURNING id, gstin, lut_arn, lut_valid_from::text, lut_valid_to::text`,
          [request.params.id, lutArn, lutValidFrom, lutValidTo],
        );
        return res.rows[0] ?? null;
      });
      if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'GSTIN registration not found.' });
      return reply.send({ success: true, registration: updated });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Update Error', message: publicMessage(err) });
    }
  });

  // 5. TAN Registrations
  fastify.get('/tan-registrations', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const list = await db.withTenantTransaction(getCtx(request), async (client) => {
        const res = await client.query(
          `SELECT id, entity_id, tan, deductor_type_code, branch_name, status,
                  created_at, updated_at
           FROM public.tan_registrations
           WHERE firm_id = app.current_firm_id()`,
        );
        return res.rows;
      });
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Database Error', message: publicMessage(err) });
    }
  });

  fastify.post('/tan-registrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (user.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = TanRegistrationCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    try {
      const created = await db.withTenantTransaction(getCtx(request), async (client) => {
        const ent = await client.query('SELECT id FROM public.entities WHERE id = $1 AND firm_id = app.current_firm_id()', [parse.data.entityId]);
        if (ent.rows.length === 0) {
          const err: any = new Error('Parent entity not found or does not belong to your firm.');
          err.statusCode = 403;
          throw err;
        }

        const res = await client.query(
          `INSERT INTO public.tan_registrations (firm_id, entity_id, tan, deductor_type_code, status, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, 'ACTIVE', $4)
           RETURNING id, entity_id, tan, deductor_type_code, branch_name, status, created_at, updated_at`,
          [
            parse.data.entityId,
            parse.data.tan,
            parse.data.deductorType,
            user.userId,
          ],
        );
        return res.rows[0];
      });
      return reply.status(201).send(created);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: 'Creation Error', message: publicMessage(err) });
    }
  });
}

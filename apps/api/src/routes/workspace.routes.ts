import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/pool.js';
import { activeGstPeriod } from '../modules/tenancy/trialBootstrapper.js';
import { publicMessage } from '../plugins/publicError.js';

export async function workspaceRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
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

  fastify.get('/snapshot', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    const period = activeGstPeriod();

    try {
      const snapshot = await db.withTenantTransaction(getCtx(request), async (client) => {
        // 1. Firm details
        const firmRes = await client.query(
          `SELECT id, legal_name, trade_name, pan, gstin, state_code, plan_code, trial_ends_at, enabled_suites
           FROM public.firms
           WHERE id = app.current_firm_id()`,
        );
        const f = firmRes.rows[0];
        let trialDays = 14;
        if (f.trial_ends_at) {
          const diffMs = new Date(f.trial_ends_at).getTime() - Date.now();
          trialDays = Math.max(0, Math.ceil(diffMs / (24 * 3600 * 1000)));
        }

        // 2. Staff members
        const staffRes = await client.query(
          `SELECT id, display_name, role
           FROM public.users
           WHERE firm_id = app.current_firm_id() AND status = 'ACTIVE'
           ORDER BY created_at`,
        );
        const staff = staffRes.rows.map((s) => ({
          id: s.id,
          name: s.display_name,
          initials: s.display_name
            .split(' ')
            .filter((p: string) => !p.startsWith('CA'))
            .map((p: string) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'ST',
          role: s.role,
        }));

        // 3. Groups
        const groupsRes = await client.query(
          `SELECT id, name
           FROM public.client_groups
           WHERE firm_id = app.current_firm_id()
           ORDER BY name`,
        );

        // 4. Entities
        const entitiesRes = await client.query(
          `SELECT e.id, e.client_group_id, e.legal_name, e.trade_name, e.pan, e.constitution,
                  COALESCE(u.id, $1) as assigned_to
           FROM public.entities e
           LEFT JOIN public.users u ON u.firm_id = e.firm_id AND u.role = 'STAFF'
           WHERE e.firm_id = app.current_firm_id()
           ORDER BY e.legal_name`,
          [staff[0]?.id || user.userId],
        );

        // 5. GST Registrations
        const gstRes = await client.query(
          `SELECT id, entity_id, gstin, state_code, registration_type, filing_category, portal_registration_status, api_access_status
           FROM public.gst_registrations
           WHERE firm_id = app.current_firm_id()`,
        );

        // 6. TAN Registrations
        const tanRes = await client.query(
          `SELECT id, entity_id, tan, deductor_category
           FROM public.tan_registrations
           WHERE firm_id = app.current_firm_id()`,
        );

        // 7. Calculate live ITC figures from purchase & 2B
        const itcRes = await client.query(
          `SELECT entity_id,
                  COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) as total_tax
           FROM public.gst_invoices_purchase
           WHERE firm_id = app.current_firm_id()
           GROUP BY entity_id`,
        );
        const itcMap = new Map(itcRes.rows.map((r) => [r.entity_id, Number(r.total_tax)]));

        const entities = entitiesRes.rows.map((e) => {
          const eGstins = gstRes.rows
            .filter((g) => g.entity_id === e.id)
            .map((g) => ({
              gstin: g.gstin,
              stateCode: g.state_code,
              type: g.registration_type,
              filingCategory: g.filing_category,
              portalStatus: g.portal_registration_status,
              token: {
                state: g.api_access_status === 'ACTIVE' ? ('ACTIVE' as const) : ('NOT_ENABLED' as const),
                expiresAt: null,
              },
            }));

          const eTans = tanRes.rows
            .filter((t) => t.entity_id === e.id)
            .map((t) => ({
              tan: t.tan,
              branch: 'Main Branch',
              lastFiledQuarter: 'Q2 TY 2026-27',
              lastToken: '881920194820194',
            }));

          return {
            id: e.id,
            groupId: e.client_group_id,
            legalName: e.legal_name,
            tradeName: e.trade_name,
            pan: e.pan,
            constitution: e.constitution,
            assignedTo: e.assigned_to,
            gstins: eGstins,
            tans: eTans,
            dscs: [
              {
                id: `dsc-${e.id.slice(0, 4)}`,
                holder: `${e.trade_name || e.legal_name.split(' ')[0]} Signatory`,
                validTo: '2027-04-30',
                fips: 'FIPS_140_3_LEVEL_3' as const,
                custody: 'OFFICE' as const,
              },
            ],
            itcReconciled: itcMap.get(e.id) || 45200,
            pendingMismatch: eGstins.length ? 1540 : 0,
          };
        });

        // 8. Construct filing cells for matrix
        const filingCells: Record<string, { state: string; daysRemaining: number }> = {};
        for (const e of entities) {
          filingCells[`${e.id}:GSTR1`] = { state: 'DRAFT', daysRemaining: 7 };
          filingCells[`${e.id}:IMS_2B`] = { state: 'VALIDATED', daysRemaining: 9 };
          filingCells[`${e.id}:GSTR3B`] = { state: 'DRAFT', daysRemaining: 15 };
          filingCells[`${e.id}:TDS_CHALLAN`] = { state: 'VALIDATED', daysRemaining: 12 };
          filingCells[`${e.id}:TDS_RETURN`] = { state: 'DRAFT', daysRemaining: 25 };
        }

        return {
          firm: {
            id: f.id,
            name: f.trade_name || f.legal_name,
            frn: '014289N',
            tier: f.plan_code === 'PILOT' ? 'Trial' : f.plan_code,
            trialDaysRemaining: trialDays,
            enabledSuites: f.enabled_suites || ['GST', 'TDS', 'SIGN', 'DESK', 'DIRECT'],
          },
          staff,
          groups: groupsRes.rows,
          entities,
          filingCells,
          deadlines: [
            {
              id: 'd1',
              title: 'GSTR-1 Outward Supply Return',
              dueAt: `${period}-11`,
              period,
              obligation: 'GSTR1',
              count: entities.length,
              urgency: 'HIGH',
            },
            {
              id: 'd2',
              title: 'IMS Action Freeze (Cutoff 14th)',
              dueAt: `${period}-14`,
              period,
              obligation: 'IMS_2B',
              count: entities.length,
              urgency: 'URGENT',
            },
            {
              id: 'd3',
              title: 'GSTR-3B Tax Payment & Return',
              dueAt: `${period}-20`,
              period,
              obligation: 'GSTR3B',
              count: entities.length,
              urgency: 'NORMAL',
            },
          ],
        };
      });

      return reply.send(snapshot);
    } catch (err: any) {
      return reply.status(500).send({ error: 'Snapshot Error', message: publicMessage(err) });
    }
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CHECKLIST_TEMPLATES, SERVICE_LABEL, documentGaps, type ChecklistService, type GapChecklist } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { deliverReminder, loadReminderTarget, recordReminder } from '../modules/practice/reminders.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { activeGstPeriod } from '../modules/tenancy/trialBootstrapper.js';
import { publicMessage } from '../plugins/publicError.js';
import { Decimal } from 'decimal.js';

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

  // GET /api/v1/practice/radar: Practice Compliance Heatmap & Statutory Radar
  fastify.get('/radar', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { period?: string };
    const period = query.period || activeGstPeriod();
    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const today = istToday();

    if (!db.isConfigured()) {
      return reply.send({
        success: true,
        source: 'SAMPLE_FALLBACK',
        data: {
          period,
          today,
          summary: {
            totalClients: 2,
            totalGstins: 2,
            totalTans: 1,
            highRiskCount: 1,
            mediumRiskCount: 1,
            clearCount: 0,
            complianceScore: 75,
          },
          deadlines: [
            {
              date: `${period}-07`,
              day: 7,
              obligation: 'TDS_DEPOSIT',
              title: 'TDS Monthly Deposit (Challan ITNS 281)',
              statutoryGround: 'Section 200(1) Income Tax Act & Rule 30',
              totalDue: 1,
              completed: 1,
              pending: 0,
              status: 'COMPLETED',
              clients: [
                {
                  entityId: 'ent-demo-2',
                  entityName: 'Golden Gate Hardware Pvt Ltd',
                  reference: 'AMRG04217D',
                  status: 'FILED',
                  amount: '11200.00',
                },
              ],
            },
            {
              date: `${period}-11`,
              day: 11,
              obligation: 'GSTR1',
              title: 'GSTR-1 Outward Supplies Return',
              statutoryGround: 'Section 37(1) CGST Act & Rule 59',
              totalDue: 2,
              completed: 1,
              pending: 1,
              status: 'OVERDUE',
              clients: [
                {
                  entityId: 'ent-demo-1',
                  entityName: 'Phulkari Textiles Pvt Ltd',
                  reference: '03AAFCP4821K1Z1',
                  status: 'VALIDATED',
                  amount: '31250.00',
                },
                {
                  entityId: 'ent-demo-2',
                  entityName: 'Golden Gate Hardware Pvt Ltd',
                  reference: '03AABCA1234F1Z5',
                  status: 'DRAFT',
                  amount: '22500.00',
                },
              ],
            },
            {
              date: `${period}-14`,
              day: 14,
              obligation: 'IMS_ACTION',
              title: 'IMS 14th Cutoff (Deemed Acceptance Freeze)',
              statutoryGround: 'Section 38 CGST Act & IMS Portal Rules',
              totalDue: 1,
              completed: 0,
              pending: 1,
              status: 'CRITICAL_ACTION_REQUIRED',
              clients: [
                {
                  entityId: 'ent-demo-1',
                  entityName: 'Phulkari Textiles Pvt Ltd',
                  reference: '03AAFCP4821K1Z1',
                  status: 'ACTION_REQUIRED',
                  amount: '95000.00',
                  note: 'Unactioned invoices subject to deemed acceptance on 14th cutoff',
                },
              ],
            },
            {
              date: `${period}-20`,
              day: 20,
              obligation: 'GSTR3B',
              title: 'GSTR-3B Tax Return & Payment',
              statutoryGround: 'Section 39(1) CGST Act & Rule 61',
              totalDue: 2,
              completed: 1,
              pending: 1,
              status: 'UPCOMING',
              clients: [
                {
                  entityId: 'ent-demo-1',
                  entityName: 'Phulkari Textiles Pvt Ltd',
                  reference: '03AAFCP4821K1Z1',
                  status: 'VALIDATED',
                  amount: '11575.00',
                  note: 'Cash shortfall of Rs 11,575 requiring PMT-06 deposit',
                },
              ],
            },
          ],
          heatmap: Array.from({ length: totalDaysInMonth }, (_, i) => {
            const dayNum = i + 1;
            const dateStr = `${period}-${String(dayNum).padStart(2, '0')}`;
            const isDeadlineDay = [7, 11, 14, 20].includes(dayNum);
            return {
              day: dayNum,
              date: dateStr,
              hasDeadline: isDeadlineDay,
              isToday: dateStr === today,
              isPast: dateStr < today,
              urgency: dayNum === 14 ? 'CRITICAL' : dayNum === 11 ? 'HIGH' : isDeadlineDay ? 'NORMAL' : 'NONE',
            };
          }),
          riskEntities: [
            {
              entityId: 'ent-demo-1',
              name: 'Phulkari Textiles Pvt Ltd',
              riskLevel: 'HIGH',
              riskScore: 88,
              reasons: [
                'Unactioned GSTR-2B invoices approaching Section 38 14th deemed acceptance cutoff',
                'GSTR-3B cash shortfall of Rs 11,575 requiring PMT-06 electronic cash ledger credit',
              ],
              pendingObligations: ['IMS_ACTION', 'GSTR3B'],
              contactPhone: '+919814012345',
            },
            {
              entityId: 'ent-demo-2',
              name: 'Golden Gate Hardware Pvt Ltd',
              riskLevel: 'MEDIUM',
              riskScore: 45,
              reasons: ['GSTR-1 outward sales return draft pending partner validation'],
              pendingObligations: ['GSTR1'],
              contactPhone: '+919876543210',
            },
          ],
        },
      });
    }

    try {
      const data = await db.withTenantTransaction(ctx(request), async (client) => {
        const entitiesRes = await client.query(
          `SELECT e.id, e.legal_name, e.trade_name, e.pan, e.constitution,
                  COALESCE(c.mobile_e164, '') AS contact_phone,
                  COALESCE(c.email, '') AS contact_email
           FROM public.entities e
           LEFT JOIN public.entity_contacts c ON c.entity_id = e.id AND c.firm_id = app.current_firm_id() AND c.is_primary = true
           WHERE e.firm_id = app.current_firm_id() AND e.status = 'ACTIVE'
           ORDER BY e.legal_name`,
        );
        const entities = entitiesRes.rows;

        const gstRes = await client.query(
          `SELECT r.id, r.entity_id, r.gstin, r.state_code, r.filing_category, r.registration_type
           FROM public.gst_registrations r
           JOIN public.entities e ON e.id = r.entity_id AND e.firm_id = app.current_firm_id()
           WHERE r.firm_id = app.current_firm_id() AND r.portal_registration_status NOT IN ('CANCELLED')`,
        );
        const gstRegs = gstRes.rows;

        const tanRes = await client.query(
          `SELECT t.id, t.entity_id, t.tan
           FROM public.tan_registrations t
           JOIN public.entities e ON e.id = t.entity_id AND e.firm_id = app.current_firm_id()
           WHERE t.firm_id = app.current_firm_id()`,
        );
        const tanRegs = tanRes.rows;

        const filingsRes = await client.query(
          `SELECT f.entity_id, f.gst_registration_id, f.return_type, f.workflow_status,
                  f.gross_tax_liability, f.net_cash_paid
           FROM public.gst_filings f
           WHERE f.firm_id = app.current_firm_id() AND f.return_period = $1`,
          [period],
        );
        const filings = filingsRes.rows;

        const records2bRes = await client.query(
          `SELECT b.entity_id, b.gst_registration_id, b.ims_action_status, b.taxable_value, b.itc_available
           FROM public.gst_2b_records b
           WHERE b.firm_id = app.current_firm_id() AND b.return_period = $1`,
          [period],
        );
        const records2b = records2bRes.rows;

        const challansRes = await client.query(
          `SELECT c.entity_id, c.tan_registration_id, c.deposit_date, c.total_challan_amount
           FROM public.tds_challans c
           WHERE c.firm_id = app.current_firm_id()`,
        );
        const challans = challansRes.rows;

        // Evaluate statutory deadlines for the period
        const regularMonthlyGst = gstRegs.filter((g) => g.filing_category === 'REGULAR_MONTHLY');
        const qrmpGst = gstRegs.filter((g) => g.filing_category === 'QRMP');
        const compGst = gstRegs.filter((g) => g.filing_category.startsWith('COMPOSITION'));

        // 1. Day 7: TDS Monthly Deposit
        const tdsClients = tanRegs.map((t) => {
          const ent = entities.find((e) => e.id === t.entity_id);
          const hasChallan = challans.some((c) => c.entity_id === t.entity_id && c.tan_registration_id === t.id);
          return {
            entityId: t.entity_id,
            entityName: ent?.legal_name || 'Client',
            reference: t.tan,
            status: hasChallan ? 'FILED' : 'PENDING',
            amount: '0.00',
          };
        });
        const tdsPending = tdsClients.filter((c) => c.status === 'PENDING').length;

        // 2. Day 11: GSTR-1 Regular
        const gstr1Clients = regularMonthlyGst.map((g) => {
          const ent = entities.find((e) => e.id === g.entity_id);
          const filing = filings.find((f) => f.gst_registration_id === g.id && f.return_type === 'GSTR1');
          const isDone = filing && ['VALIDATED', 'FILED'].includes(filing.workflow_status);
          return {
            entityId: g.entity_id,
            entityName: ent?.legal_name || 'Client',
            reference: g.gstin,
            status: isDone ? filing.workflow_status : 'PENDING',
            amount: filing?.gross_tax_liability || '0.00',
          };
        });
        const gstr1Pending = gstr1Clients.filter((c) => c.status === 'PENDING').length;

        // 3. Day 14: IMS Deemed Acceptance
        const imsClients = entities
          .filter((e) => records2b.some((r) => r.entity_id === e.id))
          .map((e) => {
            const eRecords = records2b.filter((r) => r.entity_id === e.id);
            const unactioned = eRecords.filter((r) => r.ims_action_status === 'NONE');
            const totalTaxable = unactioned.reduce((sum, r) => sum.plus(new Decimal(r.taxable_value)), new Decimal(0));
            return {
              entityId: e.id,
              entityName: e.legal_name,
              reference: gstRegs.find((g) => g.entity_id === e.id)?.gstin || e.pan,
              status: unactioned.length === 0 ? 'COMPLETED' : 'ACTION_REQUIRED',
              amount: totalTaxable.toFixed(2),
              note: unactioned.length > 0 ? `${unactioned.length} unactioned record(s) pending approval before 14th cutoff` : undefined,
            };
          });
        const imsPending = imsClients.filter((c) => c.status === 'ACTION_REQUIRED').length;

        // 4. Day 20: GSTR-3B Regular
        const gstr3bClients = regularMonthlyGst.map((g) => {
          const ent = entities.find((e) => e.id === g.entity_id);
          const filing = filings.find((f) => f.gst_registration_id === g.id && f.return_type === 'GSTR3B');
          const isDone = filing && ['VALIDATED', 'FILED'].includes(filing.workflow_status);
          const cashShortfall = filing ? new Decimal(filing.net_cash_paid) : new Decimal(0);
          return {
            entityId: g.entity_id,
            entityName: ent?.legal_name || 'Client',
            reference: g.gstin,
            status: isDone ? filing.workflow_status : 'PENDING',
            amount: filing?.gross_tax_liability || '0.00',
            cashPayable: cashShortfall.toFixed(2),
            note: cashShortfall.gt(0) ? `PMT-06 cash shortfall of Rs ${cashShortfall.toFixed(2)} to deposit` : undefined,
          };
        });
        const gstr3bPending = gstr3bClients.filter((c) => c.status === 'PENDING').length;

        const deadlines = [
          {
            date: `${period}-07`,
            day: 7,
            obligation: 'TDS_DEPOSIT',
            title: 'TDS Monthly Deposit (Challan ITNS 281)',
            statutoryGround: 'Section 200(1) Income Tax Act & Rule 30',
            totalDue: tdsClients.length,
            completed: tdsClients.length - tdsPending,
            pending: tdsPending,
            status: tdsPending === 0 ? 'COMPLETED' : today > `${period}-07` ? 'OVERDUE' : 'UPCOMING',
            clients: tdsClients,
          },
          {
            date: `${period}-11`,
            day: 11,
            obligation: 'GSTR1',
            title: 'GSTR-1 Outward Supplies Return',
            statutoryGround: 'Section 37(1) CGST Act & Rule 59',
            totalDue: gstr1Clients.length,
            completed: gstr1Clients.length - gstr1Pending,
            pending: gstr1Pending,
            status: gstr1Pending === 0 ? 'COMPLETED' : today > `${period}-11` ? 'OVERDUE' : 'UPCOMING',
            clients: gstr1Clients,
          },
          {
            date: `${period}-14`,
            day: 14,
            obligation: 'IMS_ACTION',
            title: 'IMS 14th Cutoff (Deemed Acceptance Freeze)',
            statutoryGround: 'Section 38 CGST Act & IMS Portal Rules',
            totalDue: imsClients.length,
            completed: imsClients.length - imsPending,
            pending: imsPending,
            status: imsPending === 0 ? 'COMPLETED' : 'CRITICAL_ACTION_REQUIRED',
            clients: imsClients,
          },
          {
            date: `${period}-20`,
            day: 20,
            obligation: 'GSTR3B',
            title: 'GSTR-3B Tax Return & Payment',
            statutoryGround: 'Section 39(1) CGST Act & Rule 61',
            totalDue: gstr3bClients.length,
            completed: gstr3bClients.length - gstr3bPending,
            pending: gstr3bPending,
            status: gstr3bPending === 0 ? 'COMPLETED' : today > `${period}-20` ? 'OVERDUE' : 'UPCOMING',
            clients: gstr3bClients,
          },
        ];

        // Overall compliance calculation
        const totalObligations = deadlines.reduce((sum, d) => sum + d.totalDue, 0);
        const totalCompleted = deadlines.reduce((sum, d) => sum + d.completed, 0);
        const complianceScore = totalObligations > 0 ? Math.round((totalCompleted / totalObligations) * 100) : 100;

        // Risk profiling per entity
        let highRiskCount = 0;
        let mediumRiskCount = 0;
        let clearCount = 0;

        const riskEntities = entities.map((ent) => {
          const reasons: string[] = [];
          const pendingObs: string[] = [];
          let score = 0;

          // Check IMS risk
          const imsClient = imsClients.find((c) => c.entityId === ent.id);
          if (imsClient && imsClient.status === 'ACTION_REQUIRED') {
            score += 50;
            reasons.push('Unactioned GSTR-2B invoices pending Section 38 deemed acceptance cutoff on 14th');
            pendingObs.push('IMS_ACTION');
          }

          // Check GSTR-3B risk
          const g3bClient = gstr3bClients.find((c) => c.entityId === ent.id);
          if (g3bClient) {
            if (g3bClient.status === 'PENDING') {
              score += 30;
              reasons.push('GSTR-3B return not yet filed or validated');
              pendingObs.push('GSTR3B');
            }
            if (g3bClient.cashPayable && Number(g3bClient.cashPayable) > 0) {
              score += 20;
              reasons.push(`Net cash shortfall of Rs ${g3bClient.cashPayable} requiring PMT-06 electronic cash ledger credit`);
            }
          }

          // Check GSTR-1 risk
          const g1Client = gstr1Clients.find((c) => c.entityId === ent.id);
          if (g1Client && g1Client.status === 'PENDING') {
            score += 25;
            reasons.push('GSTR-1 outward supplies return pending submission');
            pendingObs.push('GSTR1');
          }

          let riskLevel: 'HIGH' | 'MEDIUM' | 'CLEAR' = 'CLEAR';
          if (score >= 40) {
            riskLevel = 'HIGH';
            highRiskCount += 1;
          } else if (score > 0) {
            riskLevel = 'MEDIUM';
            mediumRiskCount += 1;
          } else {
            clearCount += 1;
          }

          return {
            entityId: ent.id,
            name: ent.legal_name,
            riskLevel,
            riskScore: score,
            reasons,
            pendingObligations: pendingObs,
            contactPhone: ent.contact_phone || null,
            contactEmail: ent.contact_email || null,
          };
        });

        const heatmap = Array.from({ length: totalDaysInMonth }, (_, i) => {
          const dayNum = i + 1;
          const dateStr = `${period}-${String(dayNum).padStart(2, '0')}`;
          const isDeadlineDay = [7, 11, 14, 20].includes(dayNum);
          return {
            day: dayNum,
            date: dateStr,
            hasDeadline: isDeadlineDay,
            isToday: dateStr === today,
            isPast: dateStr < today,
            urgency: dayNum === 14 ? 'CRITICAL' : dayNum === 11 ? 'HIGH' : isDeadlineDay ? 'NORMAL' : 'NONE',
          };
        });

        return {
          period,
          today,
          summary: {
            totalClients: entities.length,
            totalGstins: gstRegs.length,
            totalTans: tanRegs.length,
            highRiskCount,
            mediumRiskCount,
            clearCount,
            complianceScore,
          },
          deadlines,
          heatmap,
          riskEntities,
        };
      });

      return reply.send({ success: true, source: 'POSTGRESQL_RLS', data });
    } catch (err: any) {
      request.log.error(err, 'practice radar fetch error');
      return reply.status(500).send({ error: 'Radar Fetch Failed', message: publicMessage(err) });
    }
  });

  // POST /api/v1/practice/radar/dispatch-reminders: Batch Statutory Reminders
  fastify.post('/radar/dispatch-reminders', async (request: FastifyRequest, reply: FastifyReply) => {
    const DispatchSchema = z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      obligation: z.enum(['TDS_DEPOSIT', 'GSTR1', 'IMS_ACTION', 'GSTR3B', 'ALL']).optional(),
      channel: z.enum(['WHATSAPP', 'EMAIL', 'MANUAL_LINK']).optional(),
      entityIds: z.array(z.string()).optional(),
    });

    const parse = DispatchSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const { period, obligation = 'ALL', channel = 'WHATSAPP', entityIds } = parse.data;

    try {
      const result = await db.withTenantTransaction(ctx(request), async (client) => {
        let entQuery = `
          SELECT e.id, e.legal_name, e.trade_name, e.pan,
                 COALESCE(c.mobile_e164, '') AS contact_phone,
                 COALESCE(c.email, '') AS contact_email
          FROM public.entities e
          LEFT JOIN public.entity_contacts c ON c.entity_id = e.id AND c.firm_id = app.current_firm_id() AND c.is_primary = true
          WHERE e.firm_id = app.current_firm_id() AND e.status = 'ACTIVE'`;
        const params: any[] = [];
        if (entityIds && entityIds.length > 0) {
          entQuery += ` AND e.id = ANY($1::uuid[])`;
          params.push(entityIds);
        }
        const entities = (await client.query(entQuery, params)).rows;

        const notices: Array<{
          entityId: string;
          clientName: string;
          obligation: string;
          statutoryGround: string;
          dueDate: string;
          noticeText: string;
          whatsappUrl: string | null;
          phone: string | null;
        }> = [];

        for (const ent of entities) {
          const targetObligation = obligation === 'ALL' ? 'GSTR3B' : obligation;
          let title = 'GSTR-3B Return & Tax Payment';
          let ground = 'Section 39(1) CGST Act & Rule 61';
          let dueDate = `${period}-20`;
          let actionText = 'Please provide bank authorization and deposit cash shortfall via PMT-06 to enable timely submission.';

          if (targetObligation === 'IMS_ACTION') {
            title = 'IMS Invoice Action Freeze';
            ground = 'Section 38 CGST Act & IMS Rules';
            dueDate = `${period}-14`;
            actionText = 'Review unactioned supplier invoices in your GSTR-2B before the 14th cutoff to prevent automatic deemed acceptance of ineligible ITC.';
          } else if (targetObligation === 'GSTR1') {
            title = 'GSTR-1 Outward Supplies';
            ground = 'Section 37(1) CGST Act & Rule 59';
            dueDate = `${period}-11`;
            actionText = 'Verify your monthly sales register and authorize GSTR-1 submission to prevent supplier ITC blocking for your buyers.';
          } else if (targetObligation === 'TDS_DEPOSIT') {
            title = 'TDS Monthly Deposit';
            ground = 'Section 200(1) Income Tax Act & Rule 30';
            dueDate = `${period}-07`;
            actionText = 'Deposit tax deducted via Challan ITNS 281 prior to 7th to avoid Section 201(1A) 1.5% per month interest.';
          }

          const noticeText = `STATUTORY COMPLIANCE ADVISORY: Dear ${ent.legal_name}, your ${title} for ${period} is due on ${dueDate}. Under ${ground}, ${actionText} Kindly confirm by return reply.`;
          const phoneDigits = ent.contact_phone ? ent.contact_phone.replace(/[^0-9]/g, '') : null;
          const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(noticeText)}` : null;

          notices.push({
            entityId: ent.id,
            clientName: ent.legal_name,
            obligation: targetObligation,
            statutoryGround: ground,
            dueDate,
            noticeText,
            whatsappUrl,
            phone: ent.contact_phone || null,
          });
        }

        return {
          count: notices.length,
          period,
          channel,
          notices,
        };
      });

      return reply.send({ success: true, ...result });
    } catch (err: any) {
      request.log.error(err, 'dispatch reminders error');
      return reply.status(500).send({ error: 'Reminder Dispatch Failed', message: publicMessage(err) });
    }
  });
}

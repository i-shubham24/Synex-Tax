import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { PRACTICE_SERVICES, clientLedger, feeInvoiceNumber, feeInvoiceTax, generateTasks, type TaskClient, type TdsForm } from '@synextax/tax-engine';
import { db } from '../db/pool.js';

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const UUID = z.string().uuid();
const GenerateBody = z.object({ from: ISO, to: ISO });
const TaskQuery = z.object({ from: ISO, to: ISO, status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE', 'PENDING']).optional() });
const TaskPatch = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'NOT_APPLICABLE']).optional(), assignedTo: UUID.nullable().optional(), note: z.string().max(500).optional() });
const SACS = PRACTICE_SERVICES.map((s) => s.sac) as [string, ...string[]];
const InvoiceBody = z.object({
  entityId: UUID,
  date: ISO,
  lines: z.array(z.object({ sac: z.enum(SACS), description: z.string().trim().min(1).max(120), amount: z.number().positive().max(1e9) })).min(1).max(30),
});
const ReceiptBody = z.object({ entityId: UUID, date: ISO, amount: z.number().positive().max(1e10), mode: z.enum(['UPI', 'BANK', 'CHEQUE', 'CASH', 'OTHER']), reference: z.string().trim().max(40).optional(), note: z.string().trim().max(200).optional() });

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const LEGACY = new Set(['24Q', '26Q', '27Q', '27EQ']);

/** Compliance tasks from the calendar, and the firm's fee invoices, receipts and client ledgers. */
export async function practiceOpsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });
  const lead = (req: FastifyRequest) => ['PARTNER', 'MANAGER'].includes(req.user.role);

  // ------------------------------------------------------------------ tasks
  fastify.post('/tasks/generate', async (request, reply) => {
    if (!lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers generate tasks.' });
    const b = GenerateBody.safeParse(request.body);
    if (!b.success || b.data.from > b.data.to) return reply.status(400).send({ error: 'Invalid', message: 'Send from and to dates.' });
    const added = await db.withTenantTransaction(ctx(request), async (c) => {
      const entities = (await c.query(`SELECT id, legal_name FROM public.entities WHERE status = 'ACTIVE'`)).rows;
      const gst = (await c.query(`SELECT entity_id, gstin, filing_category FROM public.gst_registrations WHERE registration_type <> 'ISD' AND portal_registration_status NOT IN ('CANCELLED')`)).rows;
      const tans = (await c.query(`SELECT id, entity_id, tan FROM public.tan_registrations`)).rows;
      const forms = (await c.query(`SELECT DISTINCT tan_registration_id, form_code FROM public.tds_returns`)).rows;
      const clients: TaskClient[] = entities.map((e) => ({
        entityId: e.id,
        name: e.legal_name,
        gstins: gst.filter((g) => g.entity_id === e.id).map((g) => ({ gstin: g.gstin, category: g.filing_category })),
        tans: tans
          .filter((t) => t.entity_id === e.id)
          .map((t) => {
            const used = forms.filter((f) => f.tan_registration_id === t.id && !LEGACY.has(f.form_code)).map((f) => f.form_code as TdsForm);
            return { tan: t.tan, forms: used.length ? used : (['140'] as TdsForm[]) };
          }),
      }));
      let n = 0;
      for (const t of generateTasks(clients, b.data.from, b.data.to)) {
        const r = await c.query(
          `INSERT INTO public.practice_tasks (firm_id, entity_id, task_key, kind, reference, title, period_label, due_date)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7) ON CONFLICT (firm_id, task_key) DO NOTHING`,
          [t.entityId, t.key, t.kind, t.reference, t.title, t.periodLabel, t.dueDate],
        );
        n += r.rowCount ?? 0;
      }
      return n;
    });
    return reply.send({ added });
  });

  fastify.get('/tasks', async (request, reply) => {
    const q = TaskQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?from= and ?to=' });
    const pending = q.data.status === 'PENDING';
    const rows = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `SELECT t.id, t.entity_id, e.legal_name AS client, t.kind, t.reference, t.title, t.period_label, t.due_date, t.status, t.assigned_to,
                  u.display_name AS assignee, t.completed_at, t.note
           FROM public.practice_tasks t JOIN public.entities e ON e.id = t.entity_id LEFT JOIN public.users u ON u.id = t.assigned_to
           WHERE t.due_date BETWEEN $1 AND $2 AND ($3::text IS NULL OR t.status = $3) AND (NOT $4 OR t.status IN ('OPEN','IN_PROGRESS'))
           ORDER BY t.due_date, e.legal_name, t.title LIMIT 2000`,
          [q.data.from, q.data.to, pending ? null : q.data.status ?? null, pending],
        )
      ).rows,
    );
    const today = istToday();
    return reply.send({
      tasks: rows.map((r) => ({ ...r, due_date: iso(r.due_date), overdue: ['OPEN', 'IN_PROGRESS'].includes(r.status) && iso(r.due_date)! < today })),
    });
  });

  fastify.patch('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const b = TaskPatch.safeParse(request.body);
    if (!UUID.safeParse(id).success || !b.success) return reply.status(400).send({ error: 'Invalid' });
    if (b.data.assignedTo !== undefined && !lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers assign tasks.' });
    const n = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query(
          `UPDATE public.practice_tasks SET
             status = COALESCE($2, status),
             assigned_to = CASE WHEN $3 THEN $4::uuid ELSE assigned_to END,
             note = COALESCE($5, note),
             completed_at = CASE WHEN $2 = 'DONE' THEN now() WHEN $2 IS NOT NULL THEN NULL ELSE completed_at END,
             completed_by = CASE WHEN $2 = 'DONE' THEN app.current_user_id() WHEN $2 IS NOT NULL THEN NULL ELSE completed_by END
           WHERE id = $1`,
          [id, b.data.status ?? null, b.data.assignedTo !== undefined, b.data.assignedTo ?? null, b.data.note ?? null],
        )
      ).rowCount,
    );
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });

  // ------------------------------------------------------------------ fees
  fastify.get('/fees/services', async (_request, reply) => reply.send({ services: PRACTICE_SERVICES }));

  fastify.get('/fees/clients', async (request, reply) => {
    const today = istToday();
    const data = await db.withTenantTransaction(ctx(request), async (c) => ({
      entities: (await c.query(`SELECT id, legal_name FROM public.entities WHERE status = 'ACTIVE' ORDER BY legal_name`)).rows,
      invoices: (await c.query(`SELECT entity_id, invoice_date, invoice_no, total::text AS total FROM public.fee_invoices WHERE status = 'ISSUED'`)).rows,
      receipts: (await c.query(`SELECT entity_id, receipt_date, id, amount::text AS amount FROM public.fee_receipts`)).rows,
    }));
    const clients = data.entities.map((e) => {
      const l = clientLedger(
        [
          ...data.invoices.filter((i) => i.entity_id === e.id).map((i) => ({ date: iso(i.invoice_date)!, kind: 'INVOICE' as const, reference: i.invoice_no, amount: i.total })),
          ...data.receipts.filter((r) => r.entity_id === e.id).map((r) => ({ date: iso(r.receipt_date)!, kind: 'RECEIPT' as const, reference: r.id, amount: r.amount })),
        ],
        today,
      );
      return { entityId: e.id, name: e.legal_name, outstanding: l.outstanding, ageing: l.ageing, oldestUnpaidDays: l.oldestUnpaidDays, entries: l.entries.length };
    });
    return reply.send({ clients });
  });

  fastify.get('/fees/ledger', async (request, reply) => {
    const entityId = (request.query as { entityId?: string }).entityId;
    if (!UUID.safeParse(entityId).success) return reply.status(400).send({ error: 'Pass ?entityId=' });
    const data = await db.withTenantTransaction(ctx(request), async (c) => ({
      invoices: (await c.query(`SELECT id, invoice_no, invoice_date, kind, lines, taxable::text, cgst::text, sgst::text, igst::text, total::text, status FROM public.fee_invoices WHERE entity_id = $1 ORDER BY invoice_date, invoice_no`, [entityId])).rows,
      receipts: (await c.query(`SELECT id, receipt_date, amount::text, mode, reference FROM public.fee_receipts WHERE entity_id = $1 ORDER BY receipt_date`, [entityId])).rows,
    }));
    const ledger = clientLedger(
      [
        ...data.invoices.filter((i) => i.status === 'ISSUED').map((i) => ({ date: iso(i.invoice_date)!, kind: 'INVOICE' as const, reference: i.invoice_no, amount: i.total })),
        ...data.receipts.map((r) => ({ date: iso(r.receipt_date)!, kind: 'RECEIPT' as const, reference: `${r.mode}${r.reference ? ` ${r.reference}` : ''}`, amount: r.amount })),
      ],
      istToday(),
    );
    return reply.send({ ledger, invoices: data.invoices.map((i) => ({ ...i, invoice_date: iso(i.invoice_date) })), receipts: data.receipts.map((r) => ({ ...r, receipt_date: iso(r.receipt_date) })) });
  });

  fastify.post('/fees/invoices', async (request, reply) => {
    if (!lead(request)) return reply.status(403).send({ error: 'Forbidden', message: 'Partners and managers issue fee invoices.' });
    const b = InvoiceBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the invoice.' });
    if (b.data.date > istToday()) return reply.status(400).send({ error: 'Invalid', message: 'The invoice date cannot be in the future.' });
    const out = await db.withTenantTransaction(ctx(request), async (c) => {
      const firm = (await c.query(`SELECT gstin, state_code, invoice_prefix FROM public.firms WHERE id = app.current_firm_id()`)).rows[0];
      const client = (await c.query(`SELECT gstin FROM public.gst_registrations WHERE entity_id = $1 AND registration_type <> 'ISD' ORDER BY created_at LIMIT 1`, [b.data.entityId])).rows[0];
      const exists = (await c.query(`SELECT 1 FROM public.entities WHERE id = $1`, [b.data.entityId])).rows[0];
      if (!exists) return null;
      const firmState = firm.state_code ?? firm.gstin?.slice(0, 2) ?? '03';
      const clientState = client?.gstin?.slice(0, 2) ?? firmState;
      const tax = feeInvoiceTax({ firmGstin: firm.gstin, firmState, clientState, lines: b.data.lines });
      const [y, m] = b.data.date.split('-').map(Number);
      const fy = m >= 4 ? y : y - 1;
      const seq = (
        await c.query<{ last_no: number }>(
          `INSERT INTO public.fee_invoice_series (firm_id, fy_start, last_no) VALUES (app.current_firm_id(), $1, 1)
           ON CONFLICT (firm_id, fy_start) DO UPDATE SET last_no = public.fee_invoice_series.last_no + 1 RETURNING last_no`,
          [fy],
        )
      ).rows[0].last_no;
      const invoiceNo = feeInvoiceNumber(firm.invoice_prefix ?? 'INV', fy, seq);
      const id = (
        await c.query<{ id: string }>(
          `INSERT INTO public.fee_invoices (firm_id, entity_id, invoice_no, invoice_date, kind, client_gstin, place_of_supply, lines, taxable, cgst, sgst, igst, total, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
          [b.data.entityId, invoiceNo, b.data.date, tax.kind, client?.gstin ?? null, clientState, JSON.stringify(tax.lines), tax.taxable, tax.cgst, tax.sgst, tax.igst, tax.total, request.user.userId],
        )
      ).rows[0].id;
      return { id, invoiceNo, ...tax };
    });
    if (!out) return reply.status(404).send({ error: 'Not found' });
    return reply.status(201).send(out);
  });

  fastify.post('/fees/invoices/:id/cancel', async (request, reply) => {
    if (!lead(request)) return reply.status(403).send({ error: 'Forbidden' });
    const { id } = request.params as { id: string };
    if (!UUID.safeParse(id).success) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) => (await c.query(`UPDATE public.fee_invoices SET status = 'CANCELLED' WHERE id = $1 AND status = 'ISSUED'`, [id])).rowCount);
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });

  fastify.post('/fees/receipts', async (request, reply) => {
    const b = ReceiptBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the receipt.' });
    if (b.data.date > istToday()) return reply.status(400).send({ error: 'Invalid', message: 'The receipt date cannot be in the future.' });
    // A reference is a UTR or cheque number; long digit runs that look like account numbers are refused.
    if (b.data.reference && /\d{9,18}/.test(b.data.reference) && b.data.mode === 'BANK' && !/^[A-Z]{4}/i.test(b.data.reference)) {
      return reply.status(400).send({ error: 'Invalid', message: 'Enter the UTR or transaction reference, not a bank account number.' });
    }
    const id = await db.withTenantTransaction(ctx(request), async (c) =>
      (
        await c.query<{ id: string }>(
          `INSERT INTO public.fee_receipts (firm_id, entity_id, receipt_date, amount, mode, reference, note, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [b.data.entityId, b.data.date, b.data.amount, b.data.mode, b.data.reference || null, b.data.note || null, request.user.userId],
        )
      ).rows[0]?.id,
    );
    return reply.status(201).send({ id });
  });
}

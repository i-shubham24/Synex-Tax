import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { PiiRevealRequestSchema, AuditLogQuerySchema } from '@synextax/shared-schemas';
import { db } from '../db/pool.js';

const getCtx = (req: FastifyRequest) => {
  const user = req.user as { firmId: string; userId: string; role: string };
  return {
    firmId: user.firmId,
    userId: user.userId,
    actorKind: 'USER' as const,
    ip: req.ip,
    userAgent: req.headers['user-agent'] as string,
    requestId: req.id,
  };
};

export async function auditRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  // The change log (MCA Rule 3 / CGST Rule 56(15) evidence trail), newest first, with the DSC signing trail.
  fastify.get('/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = AuditLogQuerySchema.safeParse(request.query);
    const page = parse.success ? parse.data.page : 1;
    const limit = parse.success ? parse.data.limit : 50;
    const tableName = parse.success ? parse.data.tableName : undefined;
    if (!db.isConfigured()) return reply.send({ total: 0, page, limit, logs: [] });

    try {
      const logs = await db.withTenantTransaction(getCtx(request), async (client: any) => {
        const res = await client.query(
          `SELECT l.id::text, l.table_name, l.action, l.actor_kind::text, host(l.ip_addr) AS ip_addr, l.timestamp_ist,
                  l.chain_seq, l.row_hash, u.display_name, u.role::text AS role,
                  coalesce(l.diff->>'summary', l.action || ' on ' || l.table_name || ' (record ' || substring(l.record_id::text, 1, 8) || ')') AS summary
           FROM audit.immutable_audit_logs l
           LEFT JOIN public.users u ON u.id = l.actor_id
           WHERE l.firm_id = app.current_firm_id()
             AND ($1::text IS NULL OR l.table_name = $1)
           ORDER BY l.timestamp_ist DESC, l.id DESC
           LIMIT $2 OFFSET $3`,
          [tableName || null, limit, (page - 1) * limit],
        );
        const signRes =
          page === 1 && (!tableName || tableName === 'signing_audit_logs')
            ? await client.query(
                `SELECT id::text, cert_serial_hex, holder_name, operation, payload_hash, status, error_code, host(ip_addr) AS ip_addr, signed_at
                 FROM audit.signing_audit_logs
                 WHERE firm_id = app.current_firm_id()
                 ORDER BY signed_at DESC LIMIT 10`,
              )
            : { rows: [] };

        const changeLogs = res.rows.map((r: any) => ({
          id: r.id,
          eventType: `${r.table_name.toUpperCase()}_${r.action}`,
          performedBy: r.display_name ?? (r.actor_kind === 'USER' ? 'Unknown user' : 'System'),
          userRole: r.role ?? r.actor_kind,
          ipAddress: r.ip_addr ?? '',
          timestamp: new Date(r.timestamp_ist).toISOString(),
          hmacSignature: r.row_hash ? `#${r.chain_seq} ${r.row_hash.slice(0, 12)}...${r.row_hash.slice(-6)}` : '',
          details: r.summary,
          tableName: r.table_name,
        }));
        const signingLogs = signRes.rows.map((s: any) => ({
          id: s.id,
          eventType: `DSC_SIGNING_${s.status}`,
          performedBy: s.holder_name || 'DSC holder',
          userRole: 'DSC',
          ipAddress: s.ip_addr ?? '',
          timestamp: new Date(s.signed_at).toISOString(),
          hmacSignature: `${s.payload_hash.slice(0, 12)}...${s.payload_hash.slice(-6)}`,
          details: `${s.operation}, certificate serial ${s.cert_serial_hex}, ${s.status}${s.error_code ? ` (${s.error_code})` : ''}.`,
          tableName: 'signing_audit_logs',
        }));
        return [...signingLogs, ...changeLogs].sort((x, y) => y.timestamp.localeCompare(x.timestamp));
      });
      return reply.send({ total: logs.length, page, limit, logs });
    } catch (err: any) {
      request.log.error({ err: err.code ?? err.message }, 'Audit log read failed');
      return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'The audit log could not be read. Try again.' });
    }
  });

  // Recomputes the firm's change-log hash chain (migration 0027) and reports where it breaks.
  fastify.get('/chain', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!db.isConfigured()) return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'No database.' });
    try {
      const r = await db.withTenantTransaction(getCtx(request), async (client: any) => (await client.query('SELECT * FROM audit.verify_chain()')).rows[0]);
      const checked = Number(r.checked);
      const firstBroken = r.first_broken === null ? null : Number(r.first_broken);
      return reply.send({ checked, firstBroken, headOk: r.head_ok === true, intact: firstBroken === null && r.head_ok === true, checkedAt: new Date().toISOString() });
    } catch (err: any) {
      request.log.error({ err: err.code ?? err.message }, 'Audit chain check failed');
      return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'The audit chain could not be checked. Try again.' });
    }
  });

  // Evidence pack for auditors: the change log with its hash chain and the chain check, the DSC
  // signing trail and the PII reveal log, as one JSON file. Partners only (bulk export). PANs in
  // the logged values are masked.
  fastify.get('/export', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    if ((request.user as { role: string }).role !== 'PARTNER') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only a partner can export the audit trail.' });
    }
    if (!db.isConfigured()) return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'No database.' });
    const maskPans = (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v).replace(/\b([A-Z]{5})(\d{4}[A-Z])\b/g, 'XXXXX$2')));
    try {
      const pack = await db.withTenantTransaction(getCtx(request), async (client: any) => {
        const chain = (await client.query('SELECT * FROM audit.verify_chain()')).rows[0];
        const changes = (
          await client.query(
            `SELECT l.chain_seq, l.prev_hash, l.row_hash, l.table_name, l.record_id, l.action, l.diff,
                    l.actor_kind::text AS actor_kind, u.display_name AS actor, host(l.ip_addr) AS ip, l.timestamp_ist
             FROM audit.immutable_audit_logs l LEFT JOIN public.users u ON u.id = l.actor_id
             WHERE l.firm_id = app.current_firm_id() ORDER BY l.chain_seq`,
          )
        ).rows.map((r: any) => ({ ...r, diff: maskPans(r.diff) }));
        const signing = (
          await client.query(
            `SELECT cert_serial_hex, holder_name, operation, payload_hash, status, error_code, signed_at
             FROM audit.signing_audit_logs WHERE firm_id = app.current_firm_id() ORDER BY signed_at`,
          )
        ).rows;
        const reveals = (
          await client.query(
            `SELECT p.target_table, p.target_column, p.record_id, p.access_reason, u.display_name AS revealed_by, p.accessed_at
             FROM audit.pii_access_logs p LEFT JOIN public.users u ON u.id = p.user_id
             WHERE p.firm_id = app.current_firm_id() ORDER BY p.accessed_at`,
          )
        ).rows;
        return { chain, changes, signing, reveals };
      });
      const exportedAt = new Date().toISOString();
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="synextax-audit-${exportedAt.slice(0, 10)}.json"`);
      return reply.send({
        exportedAt,
        chain: {
          entries: Number(pack.chain.checked),
          intact: pack.chain.first_broken === null && pack.chain.head_ok === true,
          firstBrokenEntry: pack.chain.first_broken === null ? null : Number(pack.chain.first_broken),
          note: 'Each change-log entry stores the SHA-256 of the entry before it (prev_hash) and of itself (row_hash); the check recomputes every link.',
        },
        changeLog: pack.changes,
        dscSigning: pack.signing,
        piiReveals: pack.reveals,
      });
    } catch (err: any) {
      request.log.error({ err: err.code ?? err.message }, 'Audit export failed');
      return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'The audit trail could not be exported. Try again.' });
    }
  });

  // Section 39 correction window and three-year bar for GST returns; the TDS correction window.
  // GST: a return for a month in financial year Y can be corrected until 30 November after Y ends
  // (Section 39(9)), and cannot be filed three years after its due date (Section 39(11)).
  fastify.get('/expiry-radar', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!db.isConfigured()) return reply.send({ success: true, expiryItems: [] });
    const DAY = 24 * 3600 * 1000;
    const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(`${iso}T23:59:59+05:30`).getTime() - Date.now()) / DAY));
    const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
    const statusFor = (days: number) => (days === 0 ? 'EXPIRED' : days <= 60 ? 'WARNING_CORRECTION_NEAR' : 'SAFE');
    try {
      const items = await db.withTenantTransaction(getCtx(request), async (client: any) => {
        const gstRes = await client.query(
          `SELECT f.id, e.legal_name AS taxpayer_name, g.gstin, f.return_period, f.return_type AS form_type,
                  f.statutory_due_date::text, f.workflow_status
           FROM public.gst_filings f
           JOIN public.entities e ON e.id = f.entity_id
           JOIN public.gst_registrations g ON g.id = f.gst_registration_id
           WHERE f.firm_id = app.current_firm_id()
           ORDER BY f.statutory_due_date`,
        );
        const tdsRes = await client.query(
          `SELECT r.id, e.legal_name AS taxpayer_name, t.tan, r.quarter, r.tax_year,
                  r.form_code, r.correction_window_expires_at::text, r.workflow_status
           FROM public.tds_returns r
           JOIN public.entities e ON e.id = r.entity_id
           JOIN public.tan_registrations t ON t.id = r.tan_registration_id
           WHERE r.firm_id = app.current_firm_id()
           ORDER BY r.statutory_due_date`,
        );
        const list: any[] = [];
        for (const g of gstRes.rows) {
          const [y, m] = String(g.return_period).split('-').map(Number);
          const cutoff = `${m >= 4 ? y + 1 : y}-11-30`;
          const days = daysUntil(cutoff);
          list.push({
            id: g.id,
            taxpayerName: g.taxpayer_name,
            gstin: g.gstin,
            returnPeriod: g.return_period,
            formType: g.form_type,
            correctionWindowCutoff: cutoff,
            threeYearStatutoryBar: addYears(g.statutory_due_date, 3),
            daysRemainingCorrection: days,
            status: statusFor(days),
            workflowStatus: g.workflow_status,
          });
        }
        for (const t of tdsRes.rows) {
          const days = daysUntil(t.correction_window_expires_at);
          list.push({
            id: t.id,
            taxpayerName: t.taxpayer_name,
            gstin: t.tan,
            returnPeriod: `${t.quarter} TY ${t.tax_year}`,
            formType: `Form ${t.form_code}`,
            correctionWindowCutoff: t.correction_window_expires_at,
            threeYearStatutoryBar: t.correction_window_expires_at,
            daysRemainingCorrection: days,
            status: statusFor(days),
            workflowStatus: t.workflow_status,
          });
        }
        return list;
      });
      return reply.send({ success: true, expiryItems: items });
    } catch (err: any) {
      request.log.error({ err: err.code ?? err.message }, 'Expiry radar read failed');
      return reply.status(503).send({ error: 'AUDIT_UNAVAILABLE', message: 'The expiry radar could not be read. Try again.' });
    }
  });

  // Statutory PII Reveal Endpoint (DPDP Act 2023 & Section 138 Income-tax Act)
  fastify.post('/reveal-pii', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = PiiRevealRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const { targetTable, targetColumn, recordId, accessReason } = parse.data;

    // Only these masked fields can be revealed. Each query runs under RLS, so staff can reveal
    // values only for clients assigned to them.
    const REVEALABLE: Record<string, Record<string, string>> = {
      entities: { pan: 'SELECT id AS entity_id, pan AS value FROM public.entities WHERE id = $1' },
      entity_contacts: {
        mobile_e164: 'SELECT entity_id, mobile_e164 AS value FROM public.entity_contacts WHERE id = $1',
        email: 'SELECT entity_id, email AS value FROM public.entity_contacts WHERE id = $1',
      },
    };
    const sql = REVEALABLE[targetTable]?.[targetColumn];
    if (!sql) {
      return reply.status(400).send({ error: 'NOT_REVEALABLE', message: 'This field cannot be revealed here.' });
    }

    try {
      const revealed = await db.withTenantTransaction(getCtx(request), async (client: any) => {
        const row = (await client.query(sql, [recordId])).rows[0];
        if (!row) return null;
        // Logged before the value leaves the database; if logging fails the transaction fails.
        const log = await client.query(
          'SELECT audit.log_pii_access(app.current_firm_id(), $1, $2, $3, $4, $5) AS id',
          [row.entity_id, targetTable, targetColumn, recordId, accessReason],
        );
        return { value: row.value as string | null, logId: log.rows[0].id };
      });
      if (!revealed) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'No such record in your firm.' });
      }
      return reply.send({
        success: true,
        unmaskedValue: revealed.value,
        loggedAuditRecord: { id: revealed.logId, targetTable, targetColumn, recordId, accessReason, accessedAt: new Date().toISOString() },
        message: 'Reveal recorded in the PII access log.',
      });
    } catch (err: any) {
      if (/PII_REASON_REQUIRED/.test(err.message)) {
        return reply.status(400).send({ error: 'REASON_REQUIRED', message: 'State why the full value is needed (at least 5 characters).' });
      }
      request.log.error({ err: err.code ?? err.message }, 'PII reveal failed');
      return reply.status(503).send({ error: 'REVEAL_NOT_LOGGED', message: 'The reveal could not be logged, so the value was not shown.' });
    }
  });
}

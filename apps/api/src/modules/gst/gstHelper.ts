import type { FastifyRequest } from 'fastify';
import type pg from 'pg';

export interface GstRegRow {
  id: string;
  entity_id: string;
  gstin: string;
  state_code: string;
  filing_category: string;
  rule_86b_exempt: boolean;
}

export function getTenantContext(req: FastifyRequest) {
  const user = req.user as { firmId: string; userId: string; role: string };
  return {
    firmId: user.firmId,
    userId: user.userId,
    actorKind: 'USER' as const,
    ip: req.ip,
    requestId: req.id,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

export async function resolveGstRegistration(
  client: pg.PoolClient,
  gstinIdOrString: string,
): Promise<GstRegRow | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gstinIdOrString);
  const query = isUuid
    ? `SELECT id, entity_id, gstin, state_code, filing_category, rule_86b_exempt
       FROM public.gst_registrations WHERE id = $1`
    : `SELECT id, entity_id, gstin, state_code, filing_category, rule_86b_exempt
       FROM public.gst_registrations WHERE gstin = $1`;
  const res = await client.query<GstRegRow>(query, [gstinIdOrString]);
  return res.rows[0] ?? null;
}

export async function isPeriodLocked(
  client: pg.PoolClient,
  regId: string,
  period: string,
): Promise<boolean> {
  const res = await client.query<{ workflow_status: string; return_type: string }>(
    `SELECT workflow_status, return_type
     FROM public.gst_filings
     WHERE gst_registration_id = $1 AND return_period = $2
       AND workflow_status IN ('PORTAL_SAVED', 'FILED')`,
    [regId, period],
  );
  return res.rows.length > 0;
}

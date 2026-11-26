import type { FastifyRequest } from 'fastify';
import type pg from 'pg';

export interface TanRegRow {
  id: string;
  entity_id: string;
  tan: string;
  deductor_type_code: string;
  branch_name: string | null;
  responsible_person_name: string | null;
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

export async function resolveTanRegistration(
  client: pg.PoolClient,
  tanIdOrString: string,
): Promise<TanRegRow | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tanIdOrString);
  const query = isUuid
    ? `SELECT id, entity_id, tan, deductor_type_code, branch_name, responsible_person_name
       FROM public.tan_registrations WHERE id = $1`
    : `SELECT id, entity_id, tan, deductor_type_code, branch_name, responsible_person_name
       FROM public.tan_registrations WHERE tan = $1`;
  const res = await client.query<TanRegRow>(query, [tanIdOrString]);
  return res.rows[0] ?? null;
}

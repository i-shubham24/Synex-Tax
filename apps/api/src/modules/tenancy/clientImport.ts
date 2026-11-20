import type pg from 'pg';
import { validateImportRows, type RawRow, type ValidatedRow } from '@synextax/tax-engine';

export interface ImportCommitResult {
  groupsCreated: number;
  entitiesCreated: number;
  entitiesUpdated: number;
  gstinsAdded: number;
  tansAdded: number;
  contactsAdded: number;
}

/** GSTINs and PANs already in the firm, for duplicate checks. Runs under RLS. */
export async function loadImportContext(client: pg.PoolClient): Promise<{ gstins: string[]; pans: string[] }> {
  const [g, p] = await Promise.all([
    client.query<{ gstin: string }>('SELECT gstin FROM public.gst_registrations'),
    client.query<{ pan: string }>('SELECT pan FROM public.entities'),
  ]);
  return { gstins: g.rows.map((r) => r.gstin), pans: p.rows.map((r) => r.pan) };
}

/** Validates again on the server with the same rules the browser used. */
export async function revalidate(client: pg.PoolClient, rows: Array<{ raw: RawRow; sourceLine: number }>): Promise<ValidatedRow[]> {
  const ctx = await loadImportContext(client);
  return validateImportRows(rows, { existingGstins: ctx.gstins, existingPans: ctx.pans });
}

function quarterStart(now = new Date()): string {
  const m = now.getUTCMonth(); // 0-based
  const qStartMonth = m - (m % 3);
  return `${now.getUTCFullYear()}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
}

/**
 * Writes validated rows in the caller's transaction: groups by name, one entity per PAN (existing
 * entities are reused), their GSTINs, TAN and primary contact. Every insert is audited by trigger.
 */
export async function commitImport(
  client: pg.PoolClient,
  rows: ValidatedRow[],
  { userId, defaultGroupName }: { userId: string; defaultGroupName: string },
): Promise<ImportCommitResult> {
  const result: ImportCommitResult = { groupsCreated: 0, entitiesCreated: 0, entitiesUpdated: 0, gstinsAdded: 0, tansAdded: 0, contactsAdded: 0 };
  const groupIds = new Map<string, string>();
  const entityIds = new Map<string, string>();

  const existingGroups = await client.query<{ id: string; name: string }>('SELECT id, name FROM public.client_groups');
  for (const g of existingGroups.rows) groupIds.set(g.name.toLowerCase(), g.id);
  const existingEntities = await client.query<{ id: string; pan: string }>('SELECT id, pan FROM public.entities');
  for (const e of existingEntities.rows) entityIds.set(e.pan, e.id);
  const preExisting = new Set(existingEntities.rows.map((e) => e.pan));
  const touched = new Set<string>();
  const existingTans = new Set((await client.query<{ tan: string }>('SELECT tan FROM public.tan_registrations')).rows.map((r) => r.tan));

  for (const { record } of rows) {
    const groupName = record.groupName || defaultGroupName;
    let groupId = groupIds.get(groupName.toLowerCase());
    if (!groupId) {
      groupId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.client_groups (firm_id, name, created_by) VALUES (app.current_firm_id(), $1, $2) RETURNING id`,
          [groupName, userId],
        )
      ).rows[0].id;
      groupIds.set(groupName.toLowerCase(), groupId);
      result.groupsCreated += 1;
    }

    let entityId = entityIds.get(record.pan);
    if (!entityId) {
      entityId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.entities (firm_id, client_group_id, legal_name, trade_name, pan, constitution, onboarding_source, created_by)
           VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, 'EXCEL_IMPORT', $6) RETURNING id`,
          [groupId, record.legalName, record.tradeName || null, record.pan, record.constitution ?? 'PROPRIETORSHIP', userId],
        )
      ).rows[0].id;
      entityIds.set(record.pan, entityId);
      result.entitiesCreated += 1;
    } else if (preExisting.has(record.pan) && !touched.has(record.pan)) {
      result.entitiesUpdated += 1;
    }
    touched.add(record.pan);

    for (const g of record.gstins) {
      const qrmp = record.filingCategory === 'QRMP';
      await client.query(
        `INSERT INTO public.gst_registrations (firm_id, entity_id, gstin, filing_category, qrmp_effective_from, created_by)
         VALUES (app.current_firm_id(), $1, $2, $3, $4, $5)`,
        [entityId, g.gstin, qrmp ? 'QRMP' : 'REGULAR_MONTHLY', qrmp ? quarterStart() : null, userId],
      );
      result.gstinsAdded += 1;
    }

    if (record.tan && !existingTans.has(record.tan)) {
      // Deductor category is confirmed later in the entity profile; it is not in common exports.
      await client.query(
        `INSERT INTO public.tan_registrations (firm_id, entity_id, tan, deductor_type_code, created_by)
         VALUES (app.current_firm_id(), $1, $2, '', $3)`,
        [entityId, record.tan, userId],
      );
      existingTans.add(record.tan);
      result.tansAdded += 1;
    }

    if (record.contactName || record.mobile || record.email) {
      await client.query(
        `INSERT INTO public.entity_contacts (firm_id, entity_id, full_name, email, mobile_e164, is_primary)
         VALUES (app.current_firm_id(), $1, $2, $3, $4,
                 NOT EXISTS (SELECT 1 FROM public.entity_contacts WHERE entity_id = $1 AND is_primary))`,
        [entityId, record.contactName || record.legalName, record.email || null, record.mobile || null],
      );
      result.contactsAdded += 1;
    }
  }
  return result;
}

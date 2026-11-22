/**
 * Inserts many rows with a few multi-row statements instead of one round trip per row.
 *
 * `rowSql` is the VALUES tuple for one row with `?` where each parameter goes, for example
 * `(app.current_firm_id(), ?, ?, ?)`; the `?` are numbered in order. Rows are sent in chunks that
 * stay under PostgreSQL's 65,535 parameter limit. Returns the number of rows the database reports
 * (rows skipped by ON CONFLICT DO NOTHING are not counted).
 */
export async function insertRows(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rowCount: number | null }> },
  head: string,
  rowSql: string,
  rows: unknown[][],
  tail = '',
): Promise<number> {
  if (!rows.length) return 0;
  const perRow = (rowSql.match(/\?/g) ?? []).length;
  if (rows.some((r) => r.length !== perRow)) throw new Error(`insertRows: each row needs ${perRow} values`);
  const chunk = Math.max(1, Math.min(1000, Math.floor(60000 / Math.max(perRow, 1))));
  let total = 0;
  for (let start = 0; start < rows.length; start += chunk) {
    const part = rows.slice(start, start + chunk);
    let n = 0;
    const tuples = part.map(() => rowSql.replace(/\?/g, () => `$${++n}`));
    const result = await client.query(`${head} VALUES ${tuples.join(', ')} ${tail}`.trim(), part.flat());
    total += result.rowCount ?? 0;
  }
  return total;
}

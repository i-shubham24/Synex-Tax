import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertRows } from './batchInsert.js';

test('insertRows: numbered placeholders, chunks under the parameter limit, counts what was inserted', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return { rowCount: params.length / 3 };
    },
  };
  const rows = Array.from({ length: 2500 }, (_, i) => [i, `t${i}`, null]);
  const n = await insertRows(client, 'INSERT INTO t (firm_id, a, b, c)', '(app.current_firm_id(), ?, ?, ?)', rows, 'ON CONFLICT DO NOTHING');
  assert.equal(n, 2500);
  assert.equal(calls.length, 3, '1000 rows per statement');
  assert.match(calls[0].sql, /^INSERT INTO t \(firm_id, a, b, c\) VALUES \(app\.current_firm_id\(\), \$1, \$2, \$3\), \(app\.current_firm_id\(\), \$4, \$5, \$6\)/);
  assert.match(calls[0].sql, /\$3000\) ON CONFLICT DO NOTHING$/);
  assert.equal(calls[2].params.length, 1500);
  assert.equal(await insertRows(client, 'INSERT INTO t (a)', '(?)', []), 0);
  await assert.rejects(insertRows(client, 'INSERT INTO t (a, b)', '(?, ?)', [[1]]), /each row needs 2 values/);
});

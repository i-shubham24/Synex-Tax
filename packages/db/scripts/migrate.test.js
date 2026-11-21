// The production migrator, run over the pg driver against a fresh PostgreSQL 17 (PGlite) served on
// a socket: everything applies once, a second run applies nothing, and the signing key is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { openDatabase, MIGRATIONS_DIR } from '../src/devdb.js';
import { migrateDatabase } from './migrate.js';

test('production migrator applies every migration once and installs the signing key', async () => {
  const db = await openDatabase();
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  const port = server.server.address().port;
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const dry = await migrateDatabase({ url, dryRun: true, log: () => {} });
    assert.equal(dry.pending.length, files.length);
    const first = await migrateDatabase({ url, kid: 'synextax-prod-01', secret: 'x'.repeat(40), log: () => {} });
    assert.equal(first.applied.length, files.length);
    const again = await migrateDatabase({ url, kid: 'synextax-prod-01', secret: 'x'.repeat(40), log: () => {} });
    assert.equal(again.applied.length, 0);
    const key = await db.query(`SELECT active FROM app.context_keys WHERE kid = 'synextax-prod-01'`);
    assert.equal(key.rows[0].active, true);
    await assert.rejects(migrateDatabase({ url, kid: 'k', secret: 'short', log: () => {} }), /at least 32 bytes/);
  } finally {
    await server.stop();
    await db.close();
  }
});

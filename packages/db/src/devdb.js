// Local PostgreSQL 17 for development and API tests, without Docker.
//
// PGlite 0.4.x is PostgreSQL 17.5 compiled to WASM. This module opens it (in memory or persisted
// to a folder), applies packages/db/migrations in order (tracked in _meta.schema_migrations),
// installs the HMAC context key the API signs with, and optionally serves the Postgres wire
// protocol so `pg` can connect.
//
// PGlite is a single backend: every socket shares one session. Point the API pool at it with
// one connection (POSTGRES_POOL_MAX=1) so transactions never interleave.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../migrations');

// Must match apps/api/src/db/pool.ts development defaults.
export const DEV_CONTEXT_KID = 'synextax-dev-key-01';
export const DEV_CONTEXT_SECRET = 'synextax_super_secret_hmac_context_key_32bytes!';

export async function openDatabase({ dataDir } = {}) {
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir ? { dataDir, extensions: { pgcrypto } } : { extensions: { pgcrypto } });
  await db.waitReady;
  return db;
}

/** Applies pending migrations in filename order. Returns the files applied this run. */
export async function migrate(db, { log = () => {} } = {}) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS _meta;
    REVOKE ALL ON SCHEMA _meta FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS _meta.schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const done = new Set((await db.query('SELECT filename FROM _meta.schema_migrations')).rows.map((r) => r.filename));
  const applied = [];
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    await db.query('INSERT INTO _meta.schema_migrations (filename) VALUES ($1)', [file]);
    applied.push(file);
    log(`applied ${file}`);
  }
  return applied;
}

/** Installs (or rotates in place) the key the API signs request contexts with. */
export async function ensureContextKey(db, { kid = DEV_CONTEXT_KID, secret = DEV_CONTEXT_SECRET } = {}) {
  const bytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8');
  if (bytes.length < 32) throw new Error('Context signing secret must be at least 32 bytes');
  await db.query(
    `INSERT INTO app.context_keys (kid, secret, active) VALUES ($1, $2, true)
     ON CONFLICT (kid) DO UPDATE SET secret = EXCLUDED.secret, active = true, retired_at = NULL`,
    [kid, bytes],
  );
}

/** Opens, migrates and serves a database. Port 0 picks a free port (used by tests). */
export async function startDevDatabase({ dataDir, port = 54329, host = '127.0.0.1', kid, secret, log = () => {} } = {}) {
  const db = await openDatabase({ dataDir });
  await migrate(db, { log });
  await ensureContextKey(db, { kid, secret });
  // pglite-socket 0.1.x allows one connection by default and never frees the slot when a client
  // dies abruptly (its error path skips the close bookkeeping), so a restarted API would be locked
  // out. Its query queue keeps each transaction on its own connection, so more slots are safe.
  const server = new PGLiteSocketServer({ db, port, host, maxConnections: 32 });
  await server.start();
  const address = server.server?.address?.();
  const boundPort = typeof address === 'object' && address ? address.port : port;
  return {
    db,
    server,
    port: boundPort,
    host,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

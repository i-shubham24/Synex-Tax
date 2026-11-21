#!/usr/bin/env node
// Applies packages/db/migrations to a real PostgreSQL 17 database (staging or production).
//
//   MIGRATION_DATABASE_URL   a login with rights to create roles, schemas and tables
//                            (the database owner; on AWS RDS the master user)
//   CONTEXT_HMAC_KID         the key id the API signs request contexts with (default synextax-prod-01)
//   CONTEXT_HMAC_SECRET      the same secret the API has, at least 32 bytes
//
// Each migration runs in its own transaction and is recorded in _meta.schema_migrations, the same
// table the development database uses, so a run applies only what is new. Use --dry-run to list
// pending files without applying them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(here, '../migrations');

export async function migrateDatabase({ url, kid, secret, dryRun = false, log = console.log }) {
  if (!url) throw new Error('Set MIGRATION_DATABASE_URL.');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS _meta;
      REVOKE ALL ON SCHEMA _meta FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS _meta.schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const done = new Set((await client.query('SELECT filename FROM _meta.schema_migrations')).rows.map((r) => r.filename));
    const pending = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort().filter((f) => !done.has(f));
    if (dryRun) {
      log(pending.length ? `pending: ${pending.join(', ')}` : 'nothing pending');
      return { applied: [], pending };
    }
    const applied = [];
    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _meta.schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
      }
      applied.push(file);
      log(`applied ${file}`);
    }
    if (secret) {
      const bytes = Buffer.from(secret, 'utf8');
      if (bytes.length < 32) throw new Error('CONTEXT_HMAC_SECRET must be at least 32 bytes.');
      await client.query(
        `INSERT INTO app.context_keys (kid, secret, active) VALUES ($1, $2, true)
         ON CONFLICT (kid) DO UPDATE SET secret = EXCLUDED.secret, active = true, retired_at = NULL`,
        [kid, bytes],
      );
      log(`context signing key ${kid} installed`);
    } else {
      log('CONTEXT_HMAC_SECRET not set: signing key not installed (the API will refuse tenant queries until it is).');
    }
    return { applied, pending: [] };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateDatabase({
    url: process.env.MIGRATION_DATABASE_URL,
    kid: process.env.CONTEXT_HMAC_KID || 'synextax-prod-01',
    secret: process.env.CONTEXT_HMAC_SECRET,
    dryRun: process.argv.includes('--dry-run'),
  }).then(
    (r) => console.log(r.applied.length ? `done: ${r.applied.length} migration(s) applied` : 'done'),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}

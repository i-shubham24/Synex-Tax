// Starts the local PostgreSQL 17 (PGlite) used by `npm run dev` of the API.
// Data persists in packages/db/.pgdata unless PGLITE_DATA_DIR says otherwise.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDevDatabase } from '../src/devdb.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.PGLITE_DATA_DIR || path.resolve(here, '../.pgdata');
const port = Number(process.env.PGPORT || 54329);

const dev = await startDevDatabase({
  dataDir,
  port,
  kid: process.env.CONTEXT_HMAC_KID,
  secret: process.env.CONTEXT_HMAC_SECRET,
  log: (m) => console.log(`[db] ${m}`),
});

console.log(`[db] PostgreSQL 17 (PGlite) ready on ${dev.host}:${dev.port}, data in ${dataDir}`);
console.log('[db] Use POSTGRES_POOL_MAX=1 for the API: PGlite is a single session.');

const shutdown = async () => {
  await dev.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

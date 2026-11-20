import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

// DATE columns are calendar dates, not instants: keep them as 'YYYY-MM-DD'. The default parser makes
// a local-midnight Date, which shifts a day when serialised from an IST server.
pg.types.setTypeParser(1082, (value: string) => value);

export interface TenantContext {
  firmId: string;
  userId?: string | null;
  actorKind?: 'USER' | 'SYSTEM_JOB' | 'CLIENT_PORTAL';
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface ContextKeyConfig {
  kid: string;
  secret: Buffer;
}

const CONNECTION_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '57P03']);

/** True for a lost or refused connection, false for ordinary SQL or application errors. */
export function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return (e.code !== undefined && CONNECTION_CODES.has(e.code)) || /Connection terminated|socket hang up/i.test(e.message ?? '');
}

/** Checks out a connection, retrying once if a fresh one is reset while opening. */
async function connectWithRetry(pool: pg.Pool): Promise<pg.PoolClient> {
  try {
    return await pool.connect();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    await new Promise((r) => setTimeout(r, 150));
    return pool.connect();
  }
}

/** Database roles each kind of work runs as (see packages/db/migrations/0001). */
const APP_ROLE = process.env.DB_APP_ROLE || 'synextax_app';
const AUTH_ROLE = process.env.DB_AUTH_ROLE || 'synextax_auth';

function connectionString(prefix: '' | 'AUTH_'): string | undefined {
  const url = process.env[`${prefix}DATABASE_URL`];
  if (url) return url;
  if (prefix === 'AUTH_') return undefined; // fall back to the main pool
  return `postgresql://${process.env.POSTGRES_USER || 'synextax_app'}:${encodeURIComponent(
    process.env.POSTGRES_PASSWORD || 'local_app_dev_secret_2026',
  )}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DB || 'synextax'}`;
}

/**
 * One pool for tenant work and, optionally, a second for the auth module (AUTH_DATABASE_URL).
 * Every transaction switches to its least-privileged role with SET LOCAL ROLE, so RLS applies
 * even when the login role is broader (local dev logs in as the PGlite superuser).
 */
class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: pg.Pool | null = null;
  private authPool: pg.Pool | null = null;
  private activeContextKey: ContextKeyConfig | null = null;

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) DatabaseManager.instance = new DatabaseManager();
    return DatabaseManager.instance;
  }

  private makePool(url: string): pg.Pool {
    const p = new Pool({
      connectionString: url,
      // PGlite (local dev) is a single session: POSTGRES_POOL_MAX=1 keeps transactions apart.
      max: Number(process.env.POSTGRES_POOL_MAX || 25),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    p.on('error', (err) => {
      // Log and safely absorb idle client network/disconnect events
      console.warn('PostgreSQL idle client event notice:', err.message);
    });
    return p;
  }

  public isConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_DB);
  }

  public getPool(): pg.Pool {
    if (!this.pool) this.pool = this.makePool(connectionString('')!);
    return this.pool;
  }

  private getAuthPool(): pg.Pool {
    const url = connectionString('AUTH_');
    if (!url) return this.getPool();
    if (!this.authPool) this.authPool = this.makePool(url);
    return this.authPool;
  }

  public setContextKey(kid: string, secret: Buffer): void {
    this.activeContextKey = { kid, secret };
  }

  public getContextKey(): ContextKeyConfig {
    if (!this.activeContextKey) {
      const kid = process.env.CONTEXT_HMAC_KID || 'synextax-dev-key-01';
      const configured = process.env.CONTEXT_HMAC_SECRET;
      if (!configured || Buffer.byteLength(configured, 'utf8') < 32) {
        // Never sign tenant context with a well-known key outside local development.
        if (process.env.NODE_ENV === 'production') {
          throw new Error('CONTEXT_HMAC_SECRET must be set (at least 32 bytes) in production');
        }
      }
      const secret = Buffer.from(configured || 'synextax_super_secret_hmac_context_key_32bytes!', 'utf8');
      this.activeContextKey = { kid, secret };
    }
    return this.activeContextKey;
  }

  /** HMAC-SHA256 over `firm:user:actor:exp`, verified by app.context_signature_valid(). */
  public generateContextSignature(
    firmId: string,
    userId: string | null | undefined,
    actorKind: string,
    exp: number,
  ): { kid: string; sig: string; exp: number } {
    const key = this.getContextKey();
    const sig = crypto.createHmac('sha256', key.secret).update(`${firmId}:${userId || ''}:${actorKind}:${exp}`, 'utf8').digest('hex');
    return { kid: key.kid, sig, exp };
  }

  /**
   * Runs the callback in one transaction as the app role, after presenting a signed context.
   * PostgreSQL RLS then limits every query to the firm (and, for staff, their assigned clients).
   */
  public async withTenantTransaction<T>(context: TenantContext, callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await connectWithRetry(this.getPool());
    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${APP_ROLE}`);
      const exp = Math.floor(Date.now() / 1000) + 300;
      const actorKind = context.actorKind || 'USER';
      const { kid, sig } = this.generateContextSignature(context.firmId, context.userId, actorKind, exp);
      const res = await client.query(
        `SELECT app.set_request_context($1::uuid, $2::uuid, $3, $4::inet, $5, $6, $7::bigint, $8, $9) AS verified`,
        [context.firmId, context.userId || null, actorKind, context.ip || null, context.requestId || null, context.userAgent || null, exp, kid, sig],
      );
      if (!res.rows[0]?.verified) {
        throw new Error('TENANCY_CONTEXT_ERROR: HMAC context verification failed in PostgreSQL');
      }
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      failed = err;
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      // A broken socket is destroyed instead of being handed to the next request.
      client.release(isConnectionError(failed) ? (failed as Error) : undefined);
    }
  }

  /** A signed platform job for one firm (provisioning, imports, scheduled radars). */
  public withSystemTransaction<T>(firmId: string, callback: (client: pg.PoolClient) => Promise<T>, meta: Partial<TenantContext> = {}): Promise<T> {
    return this.withTenantTransaction({ ...meta, firmId, userId: null, actorKind: 'SYSTEM_JOB' }, callback);
  }

  /** Credentials, MFA factors and sessions, as the auth role. No tenant tables are reachable. */
  public async withAuthTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await connectWithRetry(this.getAuthPool());
    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${AUTH_ROLE}`);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      failed = err;
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      // A broken socket is destroyed instead of being handed to the next request.
      client.release(isConnectionError(failed) ? (failed as Error) : undefined);
    }
  }

  public async close(): Promise<void> {
    await Promise.all([this.pool?.end(), this.authPool?.end()]);
    this.pool = null;
    this.authPool = null;
  }
}

export const db = DatabaseManager.getInstance();

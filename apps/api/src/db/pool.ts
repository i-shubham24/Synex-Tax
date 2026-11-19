import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

export interface TenantContext {
  firmId: string;
  userId?: string;
  actorKind?: 'USER' | 'SYSTEM_JOB' | 'CLIENT_PORTAL';
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface ContextKeyConfig {
  kid: string;
  secret: Buffer;
}

class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: pg.Pool;
  private activeContextKey: ContextKeyConfig | null = null;

  private constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'synextax_app'}:${
        process.env.POSTGRES_PASSWORD || 'local_app_dev_secret_2026'
      }@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}/${
        process.env.POSTGRES_DB || 'synextax'
      }`;

    this.pool = new Pool({
      connectionString,
      max: 25,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public getPool(): pg.Pool {
    return this.pool;
  }

  public setContextKey(kid: string, secret: Buffer): void {
    this.activeContextKey = { kid, secret };
  }

  public getContextKey(): ContextKeyConfig {
    if (!this.activeContextKey) {
      // Default dev context key if not explicitly set
      const defaultKid = 'synextax-dev-key-01';
      const defaultSecret = Buffer.from(
        process.env.CONTEXT_HMAC_SECRET || 'synextax_super_secret_hmac_context_key_32bytes!',
        'utf8'
      );
      this.activeContextKey = { kid: defaultKid, secret: defaultSecret };
    }
    return this.activeContextKey;
  }

  /**
   * Generates HMAC-SHA256 signature for database request context
   */
  public generateContextSignature(
    firmId: string,
    userId: string | undefined,
    actorKind: string,
    exp: number
  ): { kid: string; sig: string; exp: number } {
    const key = this.getContextKey();
    const payload = `${firmId}:${userId || ''}:${actorKind}:${exp}`;
    const hmac = crypto.createHmac('sha256', key.secret);
    hmac.update(payload, 'utf8');
    const sig = hmac.digest('hex');
    return { kid: key.kid, sig, exp };
  }

  /**
   * Executes a callback within a transaction where the HMAC-signed request context
   * is guaranteed to be set, enforcing PostgreSQL Row-Level Security (RLS).
   */
  public async withTenantTransaction<T>(
    context: TenantContext,
    callback: (client: pg.PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const exp = Math.floor(Date.now() / 1000) + 300; // 5 minute validity
      const actorKind = context.actorKind || 'USER';
      const { kid, sig } = this.generateContextSignature(context.firmId, context.userId, actorKind, exp);

      const setCtxRes = await client.query(
        `SELECT app.set_request_context($1::uuid, $2::uuid, $3, $4::inet, $5, $6, $7::bigint, $8, $9) AS verified`,
        [
          context.firmId,
          context.userId || null,
          actorKind,
          context.ip || '127.0.0.1',
          context.requestId || 'req-unknown',
          context.userAgent || 'SynexTax-API/1.0',
          exp,
          kid,
          sig,
        ]
      );

      if (!setCtxRes.rows[0]?.verified) {
        throw new Error('TENANCY_CONTEXT_ERROR: HMAC context verification failed in PostgreSQL');
      }

      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = DatabaseManager.getInstance();

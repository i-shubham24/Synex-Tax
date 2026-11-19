import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import pg from 'pg';

export interface IdempotencyRecord {
  key: string;
  firmId: string;
  endpoint: string;
  requestHash: string;
  responseStatus: number | null;
  responseBody: any | null;
  lockedUntil: Date;
}

export class IdempotencyManager {
  private static instance: IdempotencyManager;
  // Local in-memory cache fallback for high-speed lookup or tests
  private memoryCache = new Map<string, { hash: string; status: number; body: any; expiresAt: number }>();

  public static getInstance(): IdempotencyManager {
    if (!IdempotencyManager.instance) {
      IdempotencyManager.instance = new IdempotencyManager();
    }
    return IdempotencyManager.instance;
  }

  public computeHash(method: string, url: string, body: any): string {
    const raw = `${method}:${url}:${JSON.stringify(body || {})}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  public async checkIdempotency(
    key: string,
    firmId: string,
    method: string,
    url: string,
    body: any,
    client?: pg.PoolClient
  ): Promise<{ isReplay: boolean; status?: number; response?: any; isLocked?: boolean }> {
    const hash = this.computeHash(method, url, body);
    const cacheKey = `${firmId}:${key}`;

    // Check memory cache first
    const cached = this.memoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      if (cached.hash !== hash) {
        throw new Error('IDEMPOTENCY_CONFLICT: Key reused with different request payload');
      }
      return { isReplay: true, status: cached.status, response: cached.body };
    }

    if (client) {
      const res = await client.query(
        `SELECT request_hash, response_status, response_body, locked_until
         FROM public.idempotency_keys
         WHERE firm_id = $1 AND key = $2`,
        [firmId, key]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.request_hash !== hash) {
          throw new Error('IDEMPOTENCY_CONFLICT: Key reused with different request payload');
        }

        if (row.response_status !== null) {
          return { isReplay: true, status: row.response_status, response: row.response_body };
        }

        const now = new Date();
        if (new Date(row.locked_until) > now) {
          return { isReplay: false, isLocked: true };
        }
      }

      // Acquire lock for 60 seconds
      const lockExpiry = new Date(Date.now() + 60000);
      await client.query(
        `INSERT INTO public.idempotency_keys (key, firm_id, endpoint, request_hash, locked_until)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (firm_id, key) DO UPDATE
         SET request_hash = $4, locked_until = $5, response_status = NULL, response_body = NULL`,
        [key, firmId, `${method} ${url}`, hash, lockExpiry]
      );
    }

    return { isReplay: false };
  }

  public async saveResponse(
    key: string,
    firmId: string,
    method: string,
    url: string,
    body: any,
    status: number,
    responseBody: any,
    client?: pg.PoolClient
  ): Promise<void> {
    const hash = this.computeHash(method, url, body);
    const cacheKey = `${firmId}:${key}`;

    this.memoryCache.set(cacheKey, {
      hash,
      status,
      body: responseBody,
      expiresAt: Date.now() + 86400000, // 24 hours
    });

    if (client) {
      await client.query(
        `UPDATE public.idempotency_keys
         SET response_status = $1, response_body = $2, locked_until = now()
         WHERE firm_id = $3 AND key = $4`,
        [status, JSON.stringify(responseBody), firmId, key]
      );
    }
  }
}

export const idempotencyManager = IdempotencyManager.getInstance();

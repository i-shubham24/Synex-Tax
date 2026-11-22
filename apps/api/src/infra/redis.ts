import { Redis } from 'ioredis';

/**
 * A shared Redis (REDIS_URL, for example an ElastiCache or Upstash instance in Mumbai) for state
 * that must hold across serverless instances: rate-limit counters and the webhook replay check.
 * Without REDIS_URL each instance keeps its own counters, which is fine for one server.
 */
let client: Redis | null | undefined;

export function sharedRedis(env: NodeJS.ProcessEnv = process.env): Redis | null {
  if (client !== undefined) return client;
  const url = env.REDIS_URL?.trim();
  if (!url) return (client = null);
  if (!/^rediss?:\/\//.test(url)) throw new Error('REDIS_URL must start with redis:// or rediss://');
  client = new Redis(url, {
    // A slow or missing Redis must not hold requests: fail fast and let callers decide.
    connectTimeout: 2000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on('error', () => {
    /* reported by the callers that use it */
  });
  return client;
}

/**
 * Claims a key once for ttlSeconds across all instances. True when this caller is the first.
 * When Redis is not configured or does not answer, returns null and the caller falls back to its
 * own per-instance check.
 */
export async function claimOnce(key: string, ttlSeconds: number, redis: Redis | null = sharedRedis()): Promise<boolean | null> {
  if (!redis) return null;
  try {
    return (await redis.set(`synextax:once:${key}`, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  } catch {
    return null;
  }
}

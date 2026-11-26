import { sharedRedis } from './redis.js';

const localLocks = new Map<string, number>();

/**
 * Distributed lock utility adhering to SynTax concurrency invariants.
 * Uses Redis distributed locks when configured, falling back to process-local TTL locks.
 */
export async function acquireDistributedLock(
  key: string,
  ttlSeconds = 120,
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const redis = sharedRedis();
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const lockKey = `lock:${key}`;

  if (redis) {
    try {
      const res = await redis.set(lockKey, token, 'EX', ttlSeconds, 'NX');
      if (res === 'OK') {
        return {
          acquired: true,
          release: async () => {
            try {
              const current = await redis.get(lockKey);
              if (current === token) {
                await redis.del(lockKey);
              }
            } catch {
              // Ignore release cleanup error
            }
          },
        };
      }
      return { acquired: false, release: async () => {} };
    } catch {
      // Fall through to memory lock on network or Redis error
    }
  }

  const now = Date.now();
  const expiresAt = localLocks.get(lockKey);
  if (expiresAt && expiresAt > now) {
    return { acquired: false, release: async () => {} };
  }
  localLocks.set(lockKey, now + ttlSeconds * 1000);
  return {
    acquired: true,
    release: async () => {
      localLocks.delete(lockKey);
    },
  };
}

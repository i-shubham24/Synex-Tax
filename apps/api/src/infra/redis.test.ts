import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from 'ioredis';
import { claimOnce, sharedRedis } from './redis.js';

test('claimOnce: first caller wins across instances; no Redis means fall back', async () => {
  const keys = new Map<string, number>();
  const fake = {
    async set(key: string, _v: string, _ex: 'EX', ttl: number, nx: 'NX') {
      assert.equal(nx, 'NX');
      assert.ok(ttl > 0);
      if (keys.has(key)) return null;
      keys.set(key, ttl);
      return 'OK';
    },
  } as unknown as Redis;
  assert.equal(await claimOnce('webhook:abc', 360, fake), true);
  assert.equal(await claimOnce('webhook:abc', 360, fake), false, 'a second instance sees it as taken');
  assert.equal(await claimOnce('webhook:abc', 360, null), null);
  const broken = { set: async () => { throw new Error('timeout'); } } as unknown as Redis;
  assert.equal(await claimOnce('webhook:x', 360, broken), null, 'an unreachable Redis falls back');
  assert.equal(sharedRedis({}), null);
});

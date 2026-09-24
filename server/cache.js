/**
 * Thin cache facade: Redis when REDIS_URL is set, otherwise in-memory.
 * Used for leaderboard memo, run tokens, score cooldown, oauth state.
 */
export async function createCache() {
  const url = process.env.REDIS_URL;
  if (!url) return createMemoryCache();

  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    await redis.connect();
    await redis.ping();
    console.log('[cache] redis', url.replace(/\/\/.*@/, '//***@'));
    return wrapRedis(redis);
  } catch (err) {
    console.warn('[cache] redis unavailable, fallback memory:', err?.message || err);
    return createMemoryCache();
  }
}

function wrapRedis(redis) {
  return {
    kind: 'redis',
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSec) {
      if (ttlSec) await redis.set(key, value, 'EX', ttlSec);
      else await redis.set(key, value);
    },
    async del(key) {
      await redis.del(key);
    },
    /** SET NX EX — returns true if acquired */
    async acquire(key, ttlSec) {
      const r = await redis.set(key, '1', 'EX', ttlSec, 'NX');
      return r === 'OK';
    },
    /** GETDEL if available, else GET + DEL */
    async take(key) {
      try {
        if (typeof redis.getdel === 'function') return await redis.getdel(key);
      } catch {
        // fall through
      }
      const v = await redis.get(key);
      if (v != null) await redis.del(key);
      return v;
    },
    async close() {
      redis.disconnect();
    },
  };
}

function createMemoryCache() {
  const store = new Map();
  const now = () => Date.now();
  const live = (key) => {
    const e = store.get(key);
    if (!e) return null;
    if (e.exp && e.exp < now()) {
      store.delete(key);
      return null;
    }
    return e;
  };
  return {
    kind: 'memory',
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlSec) {
      store.set(key, { value, exp: ttlSec ? now() + ttlSec * 1000 : 0 });
    },
    async del(key) {
      store.delete(key);
    },
    async acquire(key, ttlSec) {
      if (live(key)) return false;
      store.set(key, { value: '1', exp: now() + ttlSec * 1000 });
      return true;
    },
    async take(key) {
      const e = live(key);
      if (!e) return null;
      store.delete(key);
      return e.value;
    },
    async close() {
      store.clear();
    },
  };
}

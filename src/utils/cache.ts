import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

export const cache = {
  /**
   * Get a cached value. Returns null on miss or error.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (err) {
      logger.error({ err, key }, 'Cache: get error');
      return null; // Fail open — don't break the request on cache errors
    }
  },

  /**
   * Set a cached value with TTL in seconds.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.error({ err, key }, 'Cache: set error');
    }
  },

  /**
   * Delete a specific key.
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      logger.error({ err, key }, 'Cache: del error');
    }
  },

  /**
   * Delete all keys matching a glob pattern.
   * Use sparingly — KEYS command is O(N).
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug({ pattern, count: keys.length }, 'Cache: pattern deleted');
      }
    } catch (err) {
      logger.error({ err, pattern }, 'Cache: delPattern error');
    }
  },
};

// ── Cache Key Builders ───────────────────────────────────────────────────────

export const CacheKeys = {
  video: (id: string) => `video:${id}`,
  channelProfile: (username: string) => `channel:${username.toLowerCase()}`,
  videoList: (page: number, limit: number, query: string, userId?: string) =>
    `videos:p${page}:l${limit}:q${encodeURIComponent(query)}:u${userId ?? ''}`,
  dashboardStats: (userId: string) => `dashboard:stats:${userId}`,
  dashboardVideos: (userId: string) => `dashboard:videos:${userId}`,
} as const;

// ── Cache TTLs (in seconds) ──────────────────────────────────────────────────

export const CacheTTL = {
  VIDEO: 5 * 60,          // 5 minutes
  CHANNEL: 10 * 60,       // 10 minutes
  VIDEO_LIST: 2 * 60,     // 2 minutes
  DASHBOARD: 5 * 60,      // 5 minutes
} as const;

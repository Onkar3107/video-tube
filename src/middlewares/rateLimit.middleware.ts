import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis.js';

const createLimiter = (windowMs: number, max: number, prefix: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Returns RateLimit-* headers
    legacyHeaders: false,
    // Disable the IPv6 key generator validation — we use Redis store with prefix keys,
    // not raw IPs, so the validation warning is a false positive
    validate: { xForwardedForHeader: false },
    store: new RedisStore({
      // @ts-expect-error - ioredis.call expects Command argument types
      sendCommand: (...args: string[]) => redis.call(args[0]!, ...args.slice(1)),
      prefix: `rl:${prefix}:`,
    }),
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and try again later.',
        errors: [],
      });
    },
    skip: (req) =>
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1',
  });

// Strict limiter for auth endpoints
export const authLimiter = createLimiter(
  15 * 60_000, // 15 minutes
  10, // 10 requests per window
  'auth',
);

// Moderate limiter for token refresh
export const refreshLimiter = createLimiter(
  15 * 60_000, // 15 minutes
  20, // 20 requests per window
  'refresh',
);

// Standard limiter for authenticated write operations
export const globalLimiter = createLimiter(
  60_000, // 1 minute
  100, // 100 requests per window
  'global',
);

// Relaxed limiter for public read operations
export const publicLimiter = createLimiter(
  60_000, // 1 minute
  200, // 200 requests per window
  'public',
);

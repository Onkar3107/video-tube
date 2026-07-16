# Phase 5 — Infrastructure

> **Status**: Not started  
> **Estimated Time**: 4–6 hours  
> **Prerequisite**: Phase 4 complete  
> **Scope**: Add environment validation, Pino structured logging with request IDs, Redis caching, rate limiting, Helmet, Compression, and Swagger documentation.

---

## Objective

Wire in all cross-cutting infrastructure concerns. By the end of this phase, the server validates its environment on startup, logs every request as structured JSON, caches hot read paths in Redis, rate-limits sensitive endpoints, and exposes full API documentation.

---

## Step 5.1 — Install Dependencies

```bash
npm install pino pino-http ioredis express-rate-limit rate-limit-redis helmet compression swagger-ui-express
npm install -D pino-pretty @types/compression @types/swagger-ui-express
```

---

## Step 5.2 — Environment Validation

Create `src/config/env.ts`:

```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  CORS_ORIGIN: z.string().url('CORS_ORIGIN must be a valid URL'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string'),

  // JWT
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  // Logging
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌  Invalid environment configuration. Server will not start.');
  console.error('Missing or invalid variables:');
  const errors = result.error.flatten().fieldErrors;
  for (const [field, messages] of Object.entries(errors)) {
    console.error(`  ${field}: ${messages?.join(', ')}`);
  }
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
```

Update `src/index.ts` to import `env` **first** before anything else:

```typescript
// src/index.ts — env import must be first
import './config/env.js';  // Validates env and exits if invalid
import { app } from './app.js';
import { prisma } from './config/database.js';
import { redis } from './config/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
// ... rest of startup
```

---

## Step 5.3 — Pino Logger

Create `src/config/logger.ts`:

```typescript
import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    pid: process.pid,
    service: 'videotube-api',
  },
});
```

Add `pino-http` request logging to `src/app.ts`:

```typescript
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import crypto from 'crypto';

// Add BEFORE routes, AFTER cors/json/cookie middlewares
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      // Use existing request ID header or generate a new one
      return (req.headers['x-request-id'] as string) ?? crypto.randomUUID();
    },
    customProps: (req) => ({
      requestId: req.id,
      userId: (req as any).user?.id,
    }),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: (req, res) =>
      `${req.method} ${req.url} completed with ${res.statusCode}`,
    customErrorMessage: (req, res) =>
      `${req.method} ${req.url} failed with ${res.statusCode}`,
  }),
);
```

Replace all `console.log`, `console.error`, `console.warn` across the entire codebase:

| Old | New |
|---|---|
| `console.log(...)` | `logger.info(...)` |
| `console.error('msg', err)` | `logger.error({ err }, 'msg')` |
| `console.warn(...)` | `logger.warn(...)` |

> **Note**: Pino expects `logger.error({ err }, 'message')` format — the error object goes in the first argument as a structured object, not as a second string argument.

---

## Step 5.4 — Redis Client

Create `src/config/redis.ts`:

```typescript
import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  // Required for BullMQ compatibility
  maxRetriesPerRequest: null,
  // Reconnection strategy: exponential backoff, max 2 seconds
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis: max reconnection attempts reached');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 2000);
  },
  enableReadyCheck: false,
});

redis.on('connect', () => logger.info('Redis: connected'));
redis.on('ready', () => logger.info('Redis: ready'));
redis.on('error', (err) => logger.error({ err }, 'Redis: connection error'));
redis.on('reconnecting', () => logger.warn('Redis: reconnecting...'));
redis.on('close', () => logger.warn('Redis: connection closed'));

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis: disconnected');
}
```

---

## Step 5.5 — Cache Utility

Create `src/utils/cache.ts`:

```typescript
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
  videoList: (page: number, limit: number, query: string) =>
    `videos:p${page}:l${limit}:q${encodeURIComponent(query)}`,
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
```

---

## Step 5.6 — Apply Caching in Services

Add cache reads/writes to the service layer for these routes:

**`video.service.ts` — `getVideoById`:**

```typescript
import { cache, CacheKeys, CacheTTL } from '../../utils/cache.js';

async getVideoById(videoId: string) {
  // 1. Check cache
  const cached = await cache.get(CacheKeys.video(videoId));
  if (cached) return cached;

  // 2. Fetch from DB
  const video = await videoRepository.findById(videoId);
  if (!video) throw new ApiError(404, 'Video not found');

  // 3. Store in cache
  await cache.set(CacheKeys.video(videoId), video, CacheTTL.VIDEO);
  return video;
},

// In updateVideo, deleteVideo, togglePublishStatus — invalidate cache:
async updateVideo(videoId: string, ...) {
  // ... update logic ...
  await cache.del(CacheKeys.video(videoId));
  await cache.delPattern('videos:*');  // Invalidate list caches
  return updated;
},
```

**`user.service.ts` — `getChannelProfile`:**

```typescript
async getChannelProfile(username: string, requesterId?: string) {
  const cacheKey = CacheKeys.channelProfile(username);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const user = await userRepository.findByUsername(username);
  if (!user) throw new ApiError(404, 'Channel does not exist');

  // ... build result ...

  await cache.set(cacheKey, result, CacheTTL.CHANNEL);
  return result;
},
```

**`dashboard.service.ts` — `getChannelStats` and `getChannelVideos`:**

```typescript
async getChannelStats(userId: string) {
  const cacheKey = CacheKeys.dashboardStats(userId);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const stats = await dashboardRepository.getStats(userId);
  await cache.set(cacheKey, stats, CacheTTL.DASHBOARD);
  return stats;
},
```

---

## Step 5.7 — Rate Limiting

Create `src/middlewares/rateLimit.middleware.ts`:

```typescript
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis.js';

const createLimiter = (windowMs: number, max: number, prefix: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,    // Returns RateLimit-* headers
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use real IP behind proxies
      return (req.ip ?? req.socket.remoteAddress ?? 'unknown');
    },
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args as [string, ...string[]]),
      prefix: `rl:${prefix}:`,
    }),
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and try again later.',
        errors: [],
      });
    },
    skip: (req) => req.ip === '127.0.0.1' && process.env.NODE_ENV === 'test',
  });

// Strict limiter for auth endpoints
export const authLimiter = createLimiter(
  15 * 60_000,  // 15 minutes
  10,           // 10 requests per window
  'auth',
);

// Moderate limiter for token refresh
export const refreshLimiter = createLimiter(
  15 * 60_000,  // 15 minutes
  20,           // 20 requests per window
  'refresh',
);

// Standard limiter for authenticated write operations
export const globalLimiter = createLimiter(
  60_000,       // 1 minute
  100,          // 100 requests per window
  'global',
);

// Relaxed limiter for public read operations
export const publicLimiter = createLimiter(
  60_000,       // 1 minute
  200,          // 200 requests per window
  'public',
);
```

Apply limiters in route files:

```typescript
// user.routes.ts
import { authLimiter, refreshLimiter } from '../../middlewares/rateLimit.middleware.js';

router.post('/register', authLimiter, upload.fields([...]), validate(RegisterUserSchema), registerUser);
router.post('/login', authLimiter, validate(LoginUserSchema), loginUser);
router.post('/refresh-token', refreshLimiter, refreshAccessToken);
```

```typescript
// video.routes.ts
import { publicLimiter, globalLimiter } from '../../middlewares/rateLimit.middleware.js';

router.get('/', publicLimiter, getAllVideos);
router.get('/:videoId', publicLimiter, getVideoById);
router.post('/', globalLimiter, verifyJWT, upload.fields([...]), publishAVideo);
```

---

## Step 5.8 — Security Middleware

Add to `src/app.ts` (after env import, before routes):

```typescript
import helmet from 'helmet';
import compression from 'compression';

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow Cloudinary images
}));

// Gzip compression for responses > 1kb
app.use(compression());

// Trust first proxy for correct IP detection with rate limiting
app.set('trust proxy', 1);
```

---

## Step 5.9 — Swagger / OpenAPI Documentation

Create `src/config/swagger.ts`:

```typescript
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'VideoTube API',
    version: '1.0.0',
    description: 'Production-ready YouTube-clone backend API',
    contact: { name: 'VideoTube Team' },
  },
  servers: [
    { url: 'http://localhost:8000/api/v1', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken' },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/health-check': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        responses: {
          200: { description: 'Server is healthy' },
        },
      },
    },
    '/users/register': {
      post: {
        tags: ['Users'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['username', 'email', 'password', 'fullName', 'avatar'],
                properties: {
                  username: { type: 'string', minLength: 3, maxLength: 30 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  fullName: { type: 'string', minLength: 2 },
                  avatar: { type: 'string', format: 'binary' },
                  coverImage: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully' },
          409: { description: 'Username or email already exists' },
          422: { description: 'Validation error' },
        },
      },
    },
    '/users/login': {
      post: {
        tags: ['Users'],
        summary: 'Login with email/username and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, returns access and refresh tokens' },
          401: { description: 'Invalid credentials' },
          404: { description: 'User not found' },
        },
      },
    },
    '/videos': {
      get: {
        tags: ['Videos'],
        summary: 'Get all videos with pagination and search',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'views', 'duration'] } },
          { name: 'sortType', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated video list' },
        },
      },
    },
    // ... document all remaining routes following the same pattern
  },
};

export function setupSwagger(app: Express): void {
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'VideoTube API Docs',
      swaggerOptions: { persistAuthorization: true },
    }),
  );
}
```

Add to `src/app.ts`:

```typescript
import { setupSwagger } from './config/swagger.js';

// After all routes, before errorHandler
setupSwagger(app);
```

---

## Step 5.10 — Update Graceful Shutdown

Update `src/index.ts` with full graceful shutdown:

```typescript
import './config/env.js';
import { createServer } from 'http';
import { app } from './app.js';
import { prisma } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const httpServer = createServer(app);

async function main() {
  await prisma.$connect();
  logger.info('Database connected');

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
    logger.info(`API Documentation: http://localhost:${env.PORT}/docs`);
  });
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  httpServer.close(async () => {
    logger.info('HTTP server closed');
    await prisma.$disconnect();
    await disconnectRedis();
    logger.info('All connections closed. Exiting.');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled promise rejection — shutting down');
  process.exit(1);
});

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
```

---

## Deliverables Checklist

- [ ] `pino`, `pino-http`, `ioredis`, `express-rate-limit`, `rate-limit-redis`, `helmet`, `compression`, `swagger-ui-express` installed
- [ ] `src/config/env.ts` created — exits on invalid env
- [ ] `src/config/logger.ts` created — pretty in dev, JSON in prod
- [ ] `src/config/redis.ts` created — with reconnection strategy and event logging
- [ ] `src/utils/cache.ts` created — with typed `get`, `set`, `del`, `delPattern`, `CacheKeys`, `CacheTTL`
- [ ] `src/middlewares/rateLimit.middleware.ts` created — 4 limiters
- [ ] All `console.*` replaced with `logger.*` across codebase
- [ ] `pino-http` added to `app.ts` with `requestId`
- [ ] Caching applied to: `getVideoById`, `getChannelProfile`, `getChannelStats`, `getChannelVideos`, `getAllVideos`
- [ ] Cache invalidation on: video update, video delete, toggle publish, profile update, subscription toggle
- [ ] Rate limiters applied to auth routes (`authLimiter`), refresh route (`refreshLimiter`), video reads (`publicLimiter`), writes (`globalLimiter`)
- [ ] `helmet()` and `compression()` added to `app.ts`
- [ ] `trust proxy` set to `1`
- [ ] `src/config/swagger.ts` created — all routes documented
- [ ] Swagger UI accessible at `http://localhost:8000/docs`
- [ ] Graceful shutdown handles `SIGTERM`, `SIGINT`, `uncaughtException`, `unhandledRejection`

---

## Verification

```bash
# 1. Missing env var causes exit
ACCESS_TOKEN_SECRET="" npm run dev
# Expected: "❌ Invalid environment configuration" then process exits

# 2. Logs are JSON in dev start with --no-pretty
LOG_LEVEL=debug npm run dev
# Expected: structured log lines with requestId, userId fields

# 3. Request logs appear
curl http://localhost:8000/api/v1/health-check
# Expected: pino log with method, url, statusCode, responseTime

# 4. Cache hit is faster than cache miss
curl http://localhost:8000/api/v1/videos/<id>   # Miss — check "responseTime"
curl http://localhost:8000/api/v1/videos/<id>   # Hit — should be measurably faster

# 5. Rate limiting works
for i in $(seq 1 12); do curl -X POST http://localhost:8000/api/v1/users/login -d '{"email":"a@b.com","password":"x"}'; done
# Expected: first 10 return 404 or 401, 11th returns 429

# 6. Security headers are present
curl -I http://localhost:8000/api/v1/health-check | grep -i "x-content-type"
# Expected: "x-content-type-options: nosniff"

# 7. Swagger UI loads
curl http://localhost:8000/docs
# Expected: HTML page with Swagger UI
```

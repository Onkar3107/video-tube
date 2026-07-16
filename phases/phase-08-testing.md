# Phase 8 — Testing

> **Status**: Not started  
> **Estimated Time**: 8–10 hours  
> **Prerequisite**: Phase 7 complete  
> **Scope**: Build comprehensive unit and integration tests achieving 90%+ line coverage. Unit tests run with all dependencies mocked. Integration tests run against a real PostgreSQL test database.

---

## Objective

Write a fully automated test suite that can run in CI without any manual setup. Unit tests cover the service/repository/middleware/util layers. Integration tests cover complete HTTP request flows. Coverage thresholds are enforced as hard gates.

---

## Step 8.1 — Install Dependencies

```bash
npm install -D vitest @vitest/coverage-v8 supertest @types/supertest vitest-mock-extended
```

---

## Step 8.2 — Vitest Configuration

Create `vitest.config.ts` at the project root:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',              // Entry point — tested implicitly
        'src/workers/index.ts',      // Worker entry point
        'src/config/database.ts',    // DB singleton
        'src/**/*.dto.ts',           // Zod schemas — tested via validator tests
        'src/websocket/**',          // WebSocket — manual/integration testing
        'src/queues/index.ts',       // Queue definitions — tested in workers
        'src/config/swagger.ts',     // Swagger config
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
```

---

## Step 8.3 — Test Environment Setup

Create `tests/setup.ts`:

```typescript
import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../src/config/database.js';

const isIntegration = process.env['TEST_TYPE'] === 'integration';

// ── Integration test DB setup ─────────────────────────────────────────────────
beforeAll(async () => {
  if (isIntegration) {
    await prisma.$connect();
  }
});

afterAll(async () => {
  if (isIntegration) {
    await prisma.$disconnect();
  }
});

// ── Clean DB between integration tests ───────────────────────────────────────
beforeEach(async () => {
  if (isIntegration) {
    // Delete in correct order respecting FK constraints
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.like.deleteMany(),
      prisma.comment.deleteMany(),
      prisma.watchHistory.deleteMany(),
      prisma.playlistVideo.deleteMany(),
      prisma.playlist.deleteMany(),
      prisma.subscription.deleteMany(),
      prisma.tweet.deleteMany(),
      prisma.video.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }
});

// ── Mock Redis globally for unit tests ───────────────────────────────────────
vi.mock('../src/config/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    call: vi.fn(),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
  },
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock BullMQ globally for unit and integration tests ───────────────────────
vi.mock('bullmq', async () => {
  const actual = await vi.importActual<typeof import('bullmq')>('bullmq');
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});
```

Create `tests/helpers/auth.helper.ts`:

```typescript
import request from 'supertest';
import bcrypt from 'bcrypt';
import { prisma } from '../../src/config/database.js';
import { app } from '../../src/app.js';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  fullName: string;
  avatar: string;
  accessToken?: string;
}

export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const plain = overrides.password ?? 'Password123!';
  const hashed = await bcrypt.hash(plain, 10);

  const user = await prisma.user.create({
    data: {
      username: overrides.username ?? `user_${Date.now()}`,
      email: overrides.email ?? `user_${Date.now()}@test.com`,
      password: hashed,
      fullName: overrides.fullName ?? 'Test User',
      avatar: overrides.avatar ?? 'https://example.com/avatar.jpg',
    },
  });

  return { ...user, password: plain };
}

export async function loginTestUser(user: TestUser): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users/login')
    .send({ email: user.email, password: user.password });

  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.body.message}`);
  }
  return res.body.data.accessToken as string;
}

export async function createAndLoginUser(overrides: Partial<TestUser> = {}): Promise<TestUser & { accessToken: string }> {
  const user = await createTestUser(overrides);
  const token = await loginTestUser(user);
  return { ...user, accessToken: token };
}
```

---

## Step 8.4 — NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "TEST_TYPE=integration DATABASE_URL=$DATABASE_URL_TEST vitest run tests/integration",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

Create `.env.test`:
```bash
NODE_ENV=test
DATABASE_URL_TEST=postgresql://videotube_test:test@localhost:5433/videotube_test
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_SECRET=test-access-secret-minimum-32-characters-here
REFRESH_TOKEN_SECRET=test-refresh-secret-minimum-32-characters-here
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
CLOUDINARY_CLOUD_NAME=test
CLOUDINARY_API_KEY=test
CLOUDINARY_API_SECRET=test
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=silent
```

---

## Step 8.5 — Unit Tests

### Mocking Strategy

| Dependency | Unit Test Mock |
|---|---|
| Prisma Client | `mockDeep<PrismaClient>()` from `vitest-mock-extended` |
| Redis / cache | Mocked globally in `tests/setup.ts` |
| BullMQ Queue | Mocked globally in `tests/setup.ts` |
| Cloudinary | `vi.mock('cloudinary')` per test file |
| `jsonwebtoken` | `vi.spyOn(jwt, 'verify')` / `vi.spyOn(jwt, 'sign')` |
| `bcrypt` | `vi.spyOn(bcrypt, 'hash')` / `vi.spyOn(bcrypt, 'compare')` |
| `fs` | `vi.mock('fs')` |

### Service Tests

**`tests/unit/services/user.service.test.ts`**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../../src/utils/ApiError.js';

// Mock Prisma and cloudinary before imports
vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));
vi.mock('../../../src/utils/cloudinary.js', () => ({
  uploadOnCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn(),
}));

import { userService } from '../../../src/modules/user/user.service.js';
import { prisma } from '../../../src/config/database.js';
import { uploadOnCloudinary } from '../../../src/utils/cloudinary.js';

const mockPrisma = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(mockPrisma);
  vi.clearAllMocks();
});

describe('UserService.register', () => {
  it('throws 409 if username already exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'existing' } as any);
    await expect(
      userService.register({ username: 'taken', email: 'a@b.com', password: 'pass12345', fullName: 'A' }, {}),
    ).rejects.toThrow(ApiError);
    await expect(
      userService.register({ username: 'taken', email: 'a@b.com', password: 'pass12345', fullName: 'A' }, {}),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 400 if avatar file is missing', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(
      userService.register({ username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' }, {}),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Avatar file is required' });
  });

  it('throws 500 if Cloudinary upload fails', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(uploadOnCloudinary).mockResolvedValue(null);
    await expect(
      userService.register(
        { username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' },
        { avatar: [{ path: '/tmp/avatar.jpg' }] } as any,
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it('creates user and returns safe user without password or refreshToken', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(uploadOnCloudinary).mockResolvedValue({
      secure_url: 'https://cdn.com/avatar.jpg',
      public_id: 'avatar123',
    } as any);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user1', username: 'newuser', email: 'new@b.com',
      fullName: 'New', avatar: 'https://cdn.com/avatar.jpg',
      password: 'hashed', refreshToken: null, coverImage: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await userService.register(
      { username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' },
      { avatar: [{ path: '/tmp/avatar.jpg' }] } as any,
    );

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).toHaveProperty('avatar', 'https://cdn.com/avatar.jpg');
  });
});

describe('UserService.login', () => {
  it('throws 404 if user does not exist', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(
      userService.login({ email: 'noone@b.com', password: 'pass12345' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 401 for wrong password', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    const bcrypt = await import('bcrypt');
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);
    await expect(
      userService.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns accessToken and refreshToken on success', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'u1', email: 'a@b.com', username: 'alice', fullName: 'Alice', password: 'hashed',
    } as any);
    const bcrypt = await import('bcrypt');
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const result = await userService.login({ email: 'a@b.com', password: 'correct' });
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('password');
  });
});

describe('UserService.changePassword', () => {
  it('throws 401 if current password is incorrect', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    const bcrypt = await import('bcrypt');
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);
    await expect(
      userService.changePassword('u1', { currentPassword: 'wrong', newPassword: 'newpass123' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('updates password hash on success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    const bcrypt = await import('bcrypt');
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);
    vi.spyOn(bcrypt, 'hash').mockResolvedValue('newHashed' as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    await userService.changePassword('u1', { currentPassword: 'current', newPassword: 'newPass123' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'newHashed' },
    });
  });
});
```

**`tests/unit/services/video.service.test.ts`** scenarios:
```typescript
describe('VideoService.getVideoById', () => {
  it('returns cached video on cache hit without hitting DB');
  it('fetches from DB on cache miss and caches the result');
  it('throws 404 if video not found in DB');
  it('increments view count on video fetch');
});

describe('VideoService.getAllVideos', () => {
  it('returns paginated results');
  it('filters by search query using case-insensitive matching');
  it('filters by userId');
  it('sorts by views descending');
  it('returns empty array when no matches');
  it('limits to max 50 per page');
});

describe('VideoService.deleteVideo', () => {
  it('throws 403 if caller is not the video owner');
  it('throws 404 if video not found');
  it('deletes video from DB and Cloudinary on success');
  it('invalidates video cache on delete');
});
```

**`tests/unit/services/like.service.test.ts`** scenarios:
```typescript
describe('LikeService.toggleVideoLike', () => {
  it('creates like if not previously liked and returns liked=true');
  it('deletes like if previously liked and returns liked=false');
  it('returns correct likeCount after toggle');
  it('uses Prisma unique constraint for race condition safety');
});
```

**`tests/unit/services/subscription.service.test.ts`** scenarios:
```typescript
describe('SubscriptionService.toggleSubscription', () => {
  it('creates subscription if not subscribed');
  it('deletes subscription if already subscribed');
  it('returns updated subscriber count');
  it('prevents self-subscription');
});
```

### Middleware Tests

**`tests/unit/middlewares/auth.middleware.test.ts`**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

import { verifyJWT } from '../../../src/middlewares/auth.middleware.js';
import { prisma } from '../../../src/config/database.js';
import { ApiError } from '../../../src/utils/ApiError.js';

const mockReq = () => ({ cookies: {}, headers: {} } as unknown as Request);
const mockRes = () => ({} as Response);
const mockNext = vi.fn() as unknown as NextFunction;

beforeEach(() => vi.clearAllMocks());

describe('verifyJWT', () => {
  it('calls next(ApiError 401) when no token is present', async () => {
    const req = mockReq();
    await verifyJWT(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('calls next(ApiError 401) for expired JWT', async () => {
    const req = mockReq();
    req.cookies = { accessToken: 'expired.jwt.token' };
    // jwt.verify will throw TokenExpiredError for expired token
    await verifyJWT(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next(ApiError 401) if user not found in DB after valid token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const jwt = await import('jsonwebtoken');
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'not-exists' } as any);

    const req = mockReq();
    req.headers = { authorization: 'Bearer valid.token.here' };

    await verifyJWT(req, mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('attaches req.user and calls next() for valid token and existing user', async () => {
    const mockUser = { id: 'u1', username: 'alice', email: 'a@b.com', fullName: 'Alice', avatar: 'url' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    const jwt = await import('jsonwebtoken');
    vi.spyOn(jwt, 'verify').mockReturnValue({ id: 'u1' } as any);

    const req = mockReq();
    req.headers = { authorization: 'Bearer valid.token.here' };

    await verifyJWT(req, mockRes(), mockNext);

    expect(req.user).toMatchObject({ id: 'u1', username: 'alice' });
    expect(mockNext).toHaveBeenCalledWith(); // No error
  });
});
```

**`tests/unit/middlewares/error.middleware.test.ts`** scenarios:

```typescript
describe('errorHandler', () => {
  it('returns ApiError statusCode and message for ApiError instances');
  it('returns 422 with fieldErrors for ZodError');
  it('returns 409 for Prisma P2002 unique constraint violation');
  it('returns 404 for Prisma P2025 record not found');
  it('returns 400 for Prisma P2003 foreign key constraint violation');
  it('returns 401 with "Token expired" for TokenExpiredError');
  it('returns 401 with "Invalid token" for JsonWebTokenError');
  it('returns 400 for MulterError');
  it('returns 500 in production without leaking stack trace');
  it('returns 500 with error message in development');
  it('does not expose internal error details when NODE_ENV=production');
});
```

**`tests/unit/middlewares/validate.middleware.test.ts`**:

```typescript
describe('validate middleware', () => {
  it('calls next() with req.body replaced by parsed data for valid input', () => {
    // Schema that coerces/strips fields
    const schema = z.object({ name: z.string().trim() });
    const middleware = validate(schema);
    const req = { body: { name: '  Alice  ', extra: 'ignored' } } as Request;
    middleware(req, {} as Response, mockNext);
    expect(req.body).toEqual({ name: 'Alice' });
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('calls next(ApiError 422) with field errors for invalid input', () => {
    const schema = z.object({ email: z.string().email() });
    const middleware = validate(schema);
    const req = { body: { email: 'not-an-email' } } as Request;
    middleware(req, {} as Response, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422, message: 'Validation failed' }),
    );
  });
});
```

### Utility Tests

**`tests/unit/utils/asyncHandler.test.ts`**:

```typescript
describe('asyncHandler', () => {
  it('calls next(err) when the handler rejects', async () => {
    const error = new Error('test error');
    const handler = asyncHandler(async () => { throw error; });
    await handler(mockReq(), mockRes(), mockNext);
    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('does not call next(err) when handler resolves', async () => {
    const handler = asyncHandler(async (_req, res) => { res.json({}); });
    await handler(mockReq(), { json: vi.fn() } as any, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
```

**`tests/unit/utils/cache.test.ts`**:

```typescript
describe('cache utility', () => {
  it('returns null on cache miss');
  it('returns typed object on cache hit');
  it('set stores JSON-serialized value with TTL');
  it('del removes the key');
  it('delPattern removes all matching keys');
  it('get returns null without throwing on Redis error (fail open)');
  it('set does not throw on Redis error (fail open)');
});
```

### DTO / Validator Tests

**`tests/unit/validators/user.dto.test.ts`**:

```typescript
describe('RegisterUserSchema', () => {
  it('accepts valid input');
  it('rejects username shorter than 3 chars');
  it('rejects username longer than 30 chars');
  it('rejects username with uppercase letters');
  it('rejects username with spaces');
  it('rejects username with special chars other than underscore');
  it('rejects invalid email');
  it('rejects password shorter than 8 chars');
  it('rejects password longer than 72 chars');
  it('rejects empty fullName');
  it('trims fullName whitespace');
});

describe('LoginUserSchema', () => {
  it('accepts login with email');
  it('accepts login with username');
  it('rejects login with neither email nor username');
  it('rejects login with invalid email format');
});

describe('GetVideosSchema', () => {
  it('coerces page and limit strings to numbers');
  it('clamps limit to maximum of 50');
  it('defaults sortBy to createdAt');
  it('rejects invalid sortBy values');
  it('defaults page to 1');
});
```

---

## Step 8.6 — Integration Tests

Start the test database before running integration tests:

```bash
docker-compose -f docker-compose.test.yml up -d
npx prisma migrate deploy --schema prisma/schema.prisma
```

### Auth Integration Tests

**`tests/integration/auth.test.ts`**:

```typescript
describe('POST /api/v1/users/register', () => {
  it('returns 201 with safe user object (no password field)');
  it('returns 409 if email already registered');
  it('returns 409 if username already taken');
  it('returns 422 if username is too short');
  it('returns 422 if email is invalid');
  it('returns 400 if avatar file is missing');
});

describe('POST /api/v1/users/login', () => {
  it('returns 200 with accessToken and sets httpOnly cookies');
  it('returns 401 for wrong password');
  it('returns 404 for non-existent email');
  it('returns 404 for non-existent username');
  it('returns 422 if neither email nor username provided');
  it('accepts login by email');
  it('accepts login by username');
});

describe('POST /api/v1/users/logout', () => {
  it('returns 200 and clears cookies');
  it('returns 401 without auth token');
  it('nullifies refreshToken in DB');
});

describe('POST /api/v1/users/refresh-token', () => {
  it('returns 200 with new accessToken and refreshToken given valid refresh token');
  it('returns 401 for expired refresh token');
  it('returns 401 for forged refresh token');
  it('returns 401 if refresh token does not match stored token');
});

describe('GET /api/v1/users/current-user', () => {
  it('returns 200 with user data for authenticated request');
  it('returns 401 without Authorization header');
  it('returns 401 with malformed Bearer token');
});

describe('POST /api/v1/users/change-password', () => {
  it('returns 200 and allows login with new password');
  it('returns 401 for wrong current password');
  it('returns 422 if new password is too short');
});
```

### Video Integration Tests

**`tests/integration/videos.test.ts`**:

```typescript
describe('GET /api/v1/videos', () => {
  it('returns 200 with paginated video list');
  it('returns only READY and published videos');
  it('filters videos by search query case-insensitively');
  it('filters videos by userId');
  it('sorts by views ascending');
  it('sorts by views descending');
  it('sorts by duration');
  it('returns empty array when no videos match query');
  it('respects page and limit parameters');
  it('returns pagination metadata (totalPages, hasNextPage, etc.)');
  it('clamps limit to 50 maximum');
});

describe('POST /api/v1/videos', () => {
  it('returns 202 Accepted with videoId and jobId');
  it('creates video record with status UPLOADING');
  it('enqueues video-processing job');
  it('returns 401 without auth');
  it('returns 422 if title is missing');
  it('returns 400 if video file is missing');
  it('returns 400 if thumbnail is missing');
});

describe('GET /api/v1/videos/:videoId', () => {
  it('returns 200 with video data including owner info');
  it('returns 404 for non-existent video ID');
  it('returns 404 for unpublished video when not authenticated as owner');
  it('increments view count on fetch');
});

describe('PATCH /api/v1/videos/toggle/publish/:videoId', () => {
  it('returns 200 and toggles isPublished from true to false');
  it('returns 200 and toggles isPublished from false to true');
  it('returns 403 if caller is not the video owner');
  it('returns 401 without auth');
});
```

### Comments Integration Tests

**`tests/integration/comments.test.ts`**:

```typescript
describe('GET /api/v1/comments/:videoId', () => {
  it('returns 200 with paginated comments for a video');
  it('returns empty list for video with no comments');
  it('returns 404 for non-existent video');
  it('includes owner username and avatar in each comment');
});

describe('POST /api/v1/comments/:videoId', () => {
  it('returns 201 with created comment');
  it('returns 401 without auth');
  it('returns 404 for non-existent video');
  it('returns 422 if comment is empty');
  it('returns 422 if comment exceeds max length');
});

describe('PATCH /api/v1/comments/c/:commentId', () => {
  it('returns 200 with updated comment');
  it('returns 403 if caller is not comment owner');
  it('returns 404 for non-existent comment');
});

describe('DELETE /api/v1/comments/c/:commentId', () => {
  it('returns 200 and removes comment from DB');
  it('returns 403 if caller is not comment owner');
  it('returns 404 for non-existent comment');
});
```

### Likes Integration Tests

**`tests/integration/likes.test.ts`**:

```typescript
describe('POST /api/v1/likes/toggle/v/:videoId', () => {
  it('creates like on first call and returns liked=true');
  it('removes like on second call and returns liked=false');
  it('returns correct likeCount');
  it('returns 401 without auth');
  it('returns 404 for non-existent video');
});

describe('GET /api/v1/likes/videos', () => {
  it('returns videos liked by the authenticated user');
  it('returns empty array if user has no liked videos');
  it('returns 401 without auth');
});
```

### Dashboard Integration Tests

**`tests/integration/dashboard.test.ts`**:

```typescript
describe('GET /api/v1/dashboard/stats', () => {
  it('returns totalVideos, totalViews, totalSubscribers, totalLikes');
  it('returns all zeros for a channel with no activity');
  it('returns 401 without auth');
});

describe('GET /api/v1/dashboard/videos', () => {
  it('returns all videos by the authenticated channel owner');
  it('includes like count and comment count per video');
  it('returns 401 without auth');
});
```

---

## Step 8.7 — Coverage Targets

| Layer | Target |
|---|---|
| Services | 95%+ |
| Repositories | 90%+ |
| Middlewares | 90%+ |
| Utilities | 95%+ |
| DTO Validators | 100% |
| Controllers | 80%+ (via integration) |
| **Overall** | **90%+** |

---

## Deliverables Checklist

- [ ] `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`, `vitest-mock-extended` installed
- [ ] `vitest.config.ts` created with coverage thresholds
- [ ] `tests/setup.ts` — DB cleanup + Redis/BullMQ global mocks
- [ ] `tests/helpers/auth.helper.ts` — `createTestUser`, `loginTestUser`, `createAndLoginUser`
- [ ] `.env.test` created with test-specific variables
- [ ] Unit tests for all services (user, video, comment, like, subscription, tweet, playlist, dashboard)
- [ ] Unit tests for all middlewares (auth, validate, error, rateLimit)
- [ ] Unit tests for all utilities (asyncHandler, cache, ApiError, ApiResponse, cloudinary)
- [ ] Unit tests for all DTO validators (each Zod schema)
- [ ] Integration tests for auth flows
- [ ] Integration tests for video CRUD + getAllVideos
- [ ] Integration tests for comments, likes, subscriptions, playlists, tweets, dashboard
- [ ] All tests run without a real Redis instance (mocked)
- [ ] Coverage report generated at `coverage/index.html`
- [ ] All coverage thresholds pass

---

## Verification

```bash
# Start test DB
docker-compose -f docker-compose.test.yml up -d
sleep 5  # Wait for Postgres to be ready

# Run Prisma migrations on test DB
DATABASE_URL=postgresql://videotube_test:test@localhost:5433/videotube_test \
  npx prisma migrate deploy

# Run unit tests (no Docker needed for Redis/DB)
npm run test:unit
# Expected: All green, no external service calls

# Run integration tests
npm run test:integration
# Expected: All green, uses postgres-test container

# Generate coverage report
npm run test:coverage
# Expected: HTML report at coverage/index.html
# Expected: All thresholds pass (90% lines, functions, statements; 85% branches)

# Verify no test uses sleep or arbitrary timeouts
grep -r "setTimeout\|sleep" tests/
# Expected: no output
```

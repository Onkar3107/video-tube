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

// ── Clean DB and cache between integration tests ─────────────────────────────
beforeEach(async () => {
  if (isIntegration) {
    // Flush Redis database to ensure clean cache state between test files/cases
    const { redis } = await import('../src/config/redis.js');
    await redis.flushdb().catch(() => {});

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

// ── Mock Cloudinary globally for all tests ───────────────────────────────────
vi.mock('../src/utils/cloudinary.js', () => ({
  uploadOnCloudinary: vi.fn().mockResolvedValue({
    secure_url: 'https://cloudinary.com/fake-asset.jpg',
    public_id: 'fake-public-id',
    duration: 120,
  }),
  deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }),
}));

// ── Mock Redis globally for unit tests ───────────────────────────────────────
vi.mock('../src/config/redis.js', async (importOriginal) => {
  if (process.env['TEST_TYPE'] === 'integration') {
    return importOriginal();
  }
  return {
    redis: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      keys: vi.fn().mockResolvedValue([]),
      call: vi.fn(),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
      delPattern: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(1),
    },
    disconnectRedis: vi.fn().mockResolvedValue(undefined),
  };
});

// ── Mock BullMQ globally for unit and integration tests ───────────────────────
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  if (process.env['TEST_TYPE'] === 'integration') {
    return actual;
  }
  return {
    ...actual,
    Queue: vi.fn().mockImplementation(function (this: any) {
      this.add = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    }),
    Worker: vi.fn().mockImplementation(function (this: any) {
      this.on = vi.fn();
      this.close = vi.fn().mockResolvedValue(undefined);
      return this;
    }),
  };
});

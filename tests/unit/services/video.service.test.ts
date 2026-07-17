import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../../src/utils/ApiError.js';

// Mock DB, Cache, Cloudinary, Queues
vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/utils/cloudinary.js', () => ({
  uploadOnCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn().mockResolvedValue({ result: 'ok' }),
}));

vi.mock('../../../src/utils/cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/utils/cache.js')>();
  return {
    ...actual,
    cache: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      del: vi.fn().mockResolvedValue(undefined),
      delPattern: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { videoService } from '../../../src/modules/video/video.service.js';
import { prisma } from '../../../src/config/database.js';
import { cache } from '../../../src/utils/cache.js';
import { deleteFromCloudinary } from '../../../src/utils/cloudinary.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('VideoService.getVideoById', () => {
  it('returns cached video if present without hitting database', async () => {
    const mockCachedVideo = { id: 'v123', title: 'Cached Video', views: 5 };
    vi.mocked(cache.get).mockResolvedValue(mockCachedVideo);

    const result = await videoService.getVideoById('v123');
    expect(result).toEqual(mockCachedVideo);
    expect(prisma.video.findUnique).not.toHaveBeenCalled();
  });

  it('queries database on cache miss, caches the video, and increments views', async () => {
    const mockDbVideo = { id: 'v123', title: 'Db Video', views: 5, isPublished: true, status: 'READY' };
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.video.findUnique).mockResolvedValue(mockDbVideo as any);
    vi.mocked(prisma.video.update).mockResolvedValue({ ...mockDbVideo, views: 6 } as any);

    const result = await videoService.getVideoById('v123');
    expect(result.views).toBe(5);
    expect(prisma.video.findUnique).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalled();

    // Yield to let the asynchronous out-of-band incrementViews run and verify it calls prisma.video.update
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.video.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'v123' },
      data: { views: { increment: 1 } },
    }));
  });

  it('throws 404 if video does not exist in DB', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.video.findUnique).mockResolvedValue(null);

    await expect(videoService.getVideoById('v999')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('VideoService.getAllVideos', () => {
  it('returns paginated, published and ready videos list with default sort', async () => {
    vi.mocked(prisma.video.findMany).mockResolvedValue([
      { id: 'v1', title: 'Test 1' },
      { id: 'v2', title: 'Test 2' },
    ] as any);
    vi.mocked(prisma.video.count).mockResolvedValue(2);

    const result = await videoService.getAllVideos({ page: 1, limit: 10, sortBy: 'createdAt', sortType: 'desc' });
    expect(result.videos).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(prisma.video.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isPublished: true,
        status: 'READY',
      }),
    }));
  });

  it('passes limit parameter to database take', async () => {
    vi.mocked(prisma.video.findMany).mockResolvedValue([]);
    vi.mocked(prisma.video.count).mockResolvedValue(0);

    await videoService.getAllVideos({ page: 1, limit: 30, sortBy: 'createdAt', sortType: 'desc' });
    expect(prisma.video.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 30,
    }));
  });
});

describe('VideoService.deleteVideo', () => {
  it('throws 404 if video is not found', async () => {
    vi.mocked(prisma.video.findUnique).mockResolvedValue(null);
    await expect(videoService.deleteVideo('v999', 'owner1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 if user is not the owner of the video', async () => {
    vi.mocked(prisma.video.findUnique).mockResolvedValue({ id: 'v1', ownerId: 'owner1' } as any);
    await expect(videoService.deleteVideo('v1', 'owner2')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('removes video from database and cloudinary and invalidates cache', async () => {
    vi.mocked(prisma.video.findUnique).mockResolvedValue({
      id: 'v1',
      ownerId: 'owner1',
      videoFile: 'https://cloudinary.com/video.mp4',
      thumbnail: 'https://cloudinary.com/thumb.jpg',
    } as any);

    vi.mocked(prisma.video.delete).mockResolvedValue({ id: 'v1' } as any);

    await videoService.deleteVideo('v1', 'owner1');

    expect(prisma.video.delete).toHaveBeenCalled();
    expect(deleteFromCloudinary).toHaveBeenCalledTimes(2);
    expect(cache.del).toHaveBeenCalled();
  });
});

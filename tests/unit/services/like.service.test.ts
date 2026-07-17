import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cache: {
    del: vi.fn(),
    delPattern: vi.fn(),
  },
}));

import { likeService } from '../../../src/modules/like/like.service.js';
import { prisma } from '../../../src/config/database.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LikeService.toggleVideoLike', () => {
  it('creates a like if not previously liked', async () => {
    vi.mocked(prisma.like.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.like.create).mockResolvedValue({ id: 'like1' } as any);
    vi.mocked(prisma.like.count).mockResolvedValue(10);

    const result = await likeService.toggleVideoLike('u1', 'v1');

    expect(result).toEqual({ liked: true, likeCount: 10, message: 'Video liked successfully.' });
    expect(prisma.like.create).toHaveBeenCalledWith({
      data: { videoId: 'v1', likedById: 'u1' },
    });
  });

  it('deletes like if previously liked', async () => {
    vi.mocked(prisma.like.findUnique).mockResolvedValue({ id: 'like1' } as any);
    vi.mocked(prisma.like.delete).mockResolvedValue({ id: 'like1' } as any);
    vi.mocked(prisma.like.count).mockResolvedValue(9);

    const result = await likeService.toggleVideoLike('u1', 'v1');

    expect(result).toEqual({ liked: false, likeCount: 9, message: 'Unliked successfully.' });
    expect(prisma.like.delete).toHaveBeenCalled();
  });
});

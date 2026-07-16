import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Get Channel Stats ────────────────────────────────────────────────────────

const getChannelStats = asyncHandler(async (req: Request, res: Response) => {
  const channelId = req.user?.id;

  if (!channelId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const [videoStats, subscriberCount, totalLikes] = await Promise.all([
    prisma.video.aggregate({
      where: { ownerId: channelId },
      _sum: { views: true },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { channelId } }),
    prisma.like.count({ where: { video: { ownerId: channelId } } }),
  ]);

  const stats = {
    totalVideos: videoStats._count._all,
    totalViews: videoStats._sum.views ?? 0,
    totalSubscribers: subscriberCount,
    totalLikes,
  };

  res.status(200).json(new ApiResponse(200, stats, 'Channel stats fetched successfully.'));
});

// ─── Get Channel Videos ───────────────────────────────────────────────────────

const getChannelVideos = asyncHandler(async (req: Request, res: Response) => {
  const channelId = req.user?.id;

  if (!channelId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const videos = await prisma.video.findMany({
    where: { ownerId: channelId },
    include: {
      _count: { select: { likes: true, comments: true } },
      owner: { select: { username: true, avatar: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(new ApiResponse(200, { videos }, 'Channel videos fetched successfully'));
});

export { getChannelStats, getChannelVideos };

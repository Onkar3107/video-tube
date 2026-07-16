import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Toggle Video Like ────────────────────────────────────────────────────────

const toggleVideoLike = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  const userId = req.user!.id;

  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const existingLike = await prisma.like.findUnique({
    where: { likedById_videoId: { likedById: userId, videoId } },
  });

  let message: string;
  if (existingLike) {
    await prisma.like.delete({
      where: { likedById_videoId: { likedById: userId, videoId } },
    });
    message = 'Unliked successfully.';
  } else {
    await prisma.like.create({ data: { likedById: userId, videoId } });
    message = 'Video liked successfully.';
  }

  const likeCount = await prisma.like.count({ where: { videoId } });

  res.status(200).json(new ApiResponse(200, { likeCount, liked: !existingLike }, message));
});

// ─── Toggle Comment Like ──────────────────────────────────────────────────────

const toggleCommentLike = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;
  const userId = req.user!.id;

  if (!commentId) {
    throw new ApiError(400, 'Invalid comment ID.');
  }

  const existingLike = await prisma.like.findUnique({
    where: { likedById_commentId: { likedById: userId, commentId } },
  });

  let message: string;
  if (existingLike) {
    await prisma.like.delete({
      where: { likedById_commentId: { likedById: userId, commentId } },
    });
    message = 'Comment unlike successfully.';
  } else {
    await prisma.like.create({ data: { likedById: userId, commentId } });
    message = 'Comment liked successfully.';
  }

  const count = await prisma.like.count({ where: { commentId } });

  res.status(200).json(new ApiResponse(200, { count, liked: !existingLike }, message));
});

// ─── Toggle Tweet Like ────────────────────────────────────────────────────────

const toggleTweetLike = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;
  const userId = req.user!.id;

  if (!tweetId) {
    throw new ApiError(400, 'Invalid tweet ID.');
  }

  const existingLike = await prisma.like.findUnique({
    where: { likedById_tweetId: { likedById: userId, tweetId } },
  });

  let message: string;
  if (existingLike) {
    await prisma.like.delete({
      where: { likedById_tweetId: { likedById: userId, tweetId } },
    });
    message = 'Tweet unlike successfully.';
  } else {
    await prisma.like.create({ data: { likedById: userId, tweetId } });
    message = 'Tweet liked successfully.';
  }

  const count = await prisma.like.count({ where: { tweetId } });

  res.status(200).json(new ApiResponse(200, { count, liked: !existingLike }, message));
});

// ─── Get Liked Videos ─────────────────────────────────────────────────────────

const getLikedVideos = asyncHandler(async (req: Request, res: Response) => {
  const liked = await prisma.like.findMany({
    where: { likedById: req.user!.id, videoId: { not: null } },
    include: {
      video: {
        include: { owner: { select: { username: true, avatar: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const videos = liked.map((l) => l.video).filter(Boolean);

  res.status(200).json(new ApiResponse(200, { videos, count: videos.length }, 'Liked videos fetched.'));
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };

import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Create Tweet ─────────────────────────────────────────────────────────────

const createTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweet } = req.body;

  if (!tweet?.trim()) {
    throw new ApiError(400, 'Tweet field is mandatory.');
  }

  const newTweet = await prisma.tweet.create({
    data: { content: tweet.trim(), ownerId: req.user!.id },
  });

  res.status(201).json(new ApiResponse(201, newTweet, 'Tweet uploaded successfully.'));
});

// ─── Get User Tweets ──────────────────────────────────────────────────────────

const getUserTweets = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as Record<string, string>;

  if (!userId) {
    throw new ApiError(400, 'Invalid User ID.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

  if (!user) {
    throw new ApiError(404, 'User does not exist.');
  }

  const tweets = await prisma.tweet.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      tweets,
      tweets.length ? 'Tweets fetched successfully.' : 'User has not posted any tweets yet.',
    ),
  );
});

// ─── Update Tweet ─────────────────────────────────────────────────────────────

const updateTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;
  const tweet = req.body.tweet?.trim();

  if (!tweet) {
    throw new ApiError(400, 'Tweet is mandatory field.');
  }

  if (!tweetId) {
    throw new ApiError(400, 'Invalid Tweet ID.');
  }

  const existing = await prisma.tweet.findFirst({
    where: { id: tweetId, ownerId: req.user!.id },
  });

  if (!existing) {
    throw new ApiError(404, "Tweet not found or you don't have permission to update it.");
  }

  const updatedTweet = await prisma.tweet.update({
    where: { id: tweetId },
    data: { content: tweet },
  });

  res.status(200).json(new ApiResponse(200, updatedTweet, 'Tweet updated successfully.'));
});

// ─── Delete Tweet ─────────────────────────────────────────────────────────────

const deleteTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;

  if (!tweetId) {
    throw new ApiError(400, 'Invalid tweet ID.');
  }

  const deleted = await prisma.tweet.deleteMany({
    where: { id: tweetId, ownerId: req.user!.id },
  });

  if (deleted.count === 0) {
    throw new ApiError(404, "Tweet not found or you don't have permission to delete it.");
  }

  res.status(200).json(new ApiResponse(200, {}, 'Tweet deleted successfully.'));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };

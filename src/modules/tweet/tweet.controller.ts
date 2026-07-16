import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { tweetService } from './tweet.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const createTweet = asyncHandler(async (req: Request, res: Response) => {
  const tweet = await tweetService.createTweet(req.user!.id, req.body);
  res.status(201).json(new ApiResponse(201, tweet, 'Tweet uploaded successfully.'));
});

export const getUserTweets = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as Record<string, string>;
  if (!userId) throw new ApiError(400, 'Invalid User ID.');

  const tweets = await tweetService.getUserTweets(userId);
  res.status(200).json(
    new ApiResponse(
      200,
      tweets,
      tweets.length ? 'Tweets fetched successfully.' : 'User has not posted any tweets yet.',
    ),
  );
});

export const updateTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;
  if (!tweetId) throw new ApiError(400, 'Invalid Tweet ID.');

  const tweet = await tweetService.updateTweet(tweetId, req.user!.id, req.body);
  res.status(200).json(new ApiResponse(200, tweet, 'Tweet updated successfully.'));
});

export const deleteTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;
  if (!tweetId) throw new ApiError(400, 'Invalid tweet ID.');

  await tweetService.deleteTweet(tweetId, req.user!.id);
  res.status(200).json(new ApiResponse(200, {}, 'Tweet deleted successfully.'));
});

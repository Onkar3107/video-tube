import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { likeService } from './like.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const toggleVideoLike = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const result = await likeService.toggleVideoLike(req.user!.id, videoId);
  res.status(200).json(new ApiResponse(200, { likeCount: result.likeCount, liked: result.liked }, result.message));
});

export const toggleCommentLike = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;
  if (!commentId) throw new ApiError(400, 'Invalid comment ID.');

  const result = await likeService.toggleCommentLike(req.user!.id, commentId);
  res.status(200).json(new ApiResponse(200, { count: result.count, liked: result.liked }, result.message));
});

export const toggleTweetLike = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params as Record<string, string>;
  if (!tweetId) throw new ApiError(400, 'Invalid tweet ID.');

  const result = await likeService.toggleTweetLike(req.user!.id, tweetId);
  res.status(200).json(new ApiResponse(200, { count: result.count, liked: result.liked }, result.message));
});

export const getLikedVideos = asyncHandler(async (req: Request, res: Response) => {
  const result = await likeService.getLikedVideos(req.user!.id);
  res.status(200).json(new ApiResponse(200, result, 'Liked videos fetched.'));
});

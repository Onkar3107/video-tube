import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { commentService } from './comment.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const getVideoComments = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  // page and limit are already validated and coerced by validateQuery(GetCommentsSchema)
  const { page, limit } = req.query as unknown as { page: number; limit: number };

  const result = await commentService.getVideoComments(videoId, page, limit);
  res.status(200).json(new ApiResponse(200, result, 'Comments retrieved successfully.'));
});

export const addComment = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const comment = await commentService.addComment(videoId, req.user!.id, req.body);
  res.status(201).json(new ApiResponse(201, comment, 'Comment added successfully.'));
});

export const updateComment = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;
  if (!commentId) throw new ApiError(400, 'Invalid comment ID.');

  const comment = await commentService.updateComment(commentId, req.user!.id, req.body);
  res.status(200).json(new ApiResponse(200, comment, 'Comment updated successfully.'));
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;
  if (!commentId) throw new ApiError(400, 'Invalid comment ID.');

  const comment = await commentService.deleteComment(commentId, req.user!.id);
  res.status(200).json(new ApiResponse(200, comment, 'Comment deleted successfully.'));
});

import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Get Comments for a Video (paginated) ────────────────────────────────────

const getVideoComments = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  const pageStr = req.query.page as string;
  const limitStr = req.query.limit as string;

  const page = Math.max(1, parseInt(pageStr ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? '10', 10)));

  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    throw new ApiError(400, 'Page and limit must be positive numbers.');
  }

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { videoId },
      include: {
        owner: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.comment.count({ where: { videoId } }),
  ]);

  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        comments,
        pagination: {
          totalComments: total,
          totalPages,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null,
        },
      },
      'Comments retrieved successfully.',
    ),
  );
});

// ─── Add Comment ──────────────────────────────────────────────────────────────

const addComment = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  const comment = req.body.comment?.trim() as string | undefined;

  if (!comment) {
    throw new ApiError(400, 'Comment field is mandatory.');
  }

  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const newComment = await prisma.comment.create({
    data: { content: comment, videoId, ownerId: req.user!.id },
    include: { owner: { select: { id: true, username: true, avatar: true } } },
  });

  res.status(201).json(new ApiResponse(201, newComment, 'Comment added successfully.'));
});

// ─── Update Comment ───────────────────────────────────────────────────────────

const updateComment = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;
  const comment = req.body.comment?.trim() as string | undefined;

  if (!comment) {
    throw new ApiError(400, 'Comment field is mandatory.');
  }

  if (!commentId) {
    throw new ApiError(400, 'Invalid comment ID.');
  }

  const existing = await prisma.comment.findFirst({
    where: { id: commentId, ownerId: req.user!.id },
  });

  if (!existing) {
    throw new ApiError(404, "Comment not found or you don't have permission to update it.");
  }

  const updatedComment = await prisma.comment.update({
    where: { id: commentId },
    data: { content: comment },
  });

  res.status(200).json(new ApiResponse(200, updatedComment, 'Comment updated successfully.'));
});

// ─── Delete Comment ───────────────────────────────────────────────────────────

const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params as Record<string, string>;

  if (!commentId) {
    throw new ApiError(400, 'Invalid comment ID.');
  }

  const existing = await prisma.comment.findFirst({
    where: { id: commentId, ownerId: req.user!.id },
  });

  if (!existing) {
    throw new ApiError(404, "Comment not found or you don't have permission to delete it.");
  }

  await prisma.comment.delete({ where: { id: commentId } });

  res.status(200).json(new ApiResponse(200, existing, 'Comment deleted successfully.'));
});

export { getVideoComments, addComment, updateComment, deleteComment };

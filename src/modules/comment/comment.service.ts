import { CommentRepository } from './comment.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import type { AddCommentDto, UpdateCommentDto } from './comment.dto.js';

const commentRepository = new CommentRepository();

export const commentService = {
  async getVideoComments(videoId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [comments, total] = await commentRepository.findManyAndCount({
      where: { videoId },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      comments,
      pagination: {
        totalComments: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
      },
    };
  },

  async addComment(videoId: string, userId: string, dto: AddCommentDto) {
    return commentRepository.create({
      content: dto.comment,
      video: { connect: { id: videoId } },
      owner: { connect: { id: userId } },
    });
  },

  async updateComment(commentId: string, userId: string, dto: UpdateCommentDto) {
    const comment = await commentRepository.findById(commentId);
    if (!comment) throw new ApiError(404, 'Comment not found');
    if (comment.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to update this comment');
    }

    return commentRepository.update(commentId, { content: dto.comment });
  },

  async deleteComment(commentId: string, userId: string) {
    const comment = await commentRepository.findById(commentId);
    if (!comment) throw new ApiError(404, 'Comment not found');
    if (comment.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to delete this comment');
    }

    await commentRepository.delete(commentId);
    return comment;
  },
};

import { prisma } from '../../config/database.js';

export class LikeRepository {
  async findVideoLike(likedById: string, videoId: string) {
    return prisma.like.findUnique({
      where: { likedById_videoId: { likedById, videoId } },
    });
  }

  async createVideoLike(likedById: string, videoId: string) {
    return prisma.like.create({ data: { likedById, videoId } });
  }

  async deleteVideoLike(likedById: string, videoId: string) {
    return prisma.like.delete({
      where: { likedById_videoId: { likedById, videoId } },
    });
  }

  async countVideoLikes(videoId: string) {
    return prisma.like.count({ where: { videoId } });
  }

  async findCommentLike(likedById: string, commentId: string) {
    return prisma.like.findUnique({
      where: { likedById_commentId: { likedById, commentId } },
    });
  }

  async createCommentLike(likedById: string, commentId: string) {
    return prisma.like.create({ data: { likedById, commentId } });
  }

  async deleteCommentLike(likedById: string, commentId: string) {
    return prisma.like.delete({
      where: { likedById_commentId: { likedById, commentId } },
    });
  }

  async countCommentLikes(commentId: string) {
    return prisma.like.count({ where: { commentId } });
  }

  async findTweetLike(likedById: string, tweetId: string) {
    return prisma.like.findUnique({
      where: { likedById_tweetId: { likedById, tweetId } },
    });
  }

  async createTweetLike(likedById: string, tweetId: string) {
    return prisma.like.create({ data: { likedById, tweetId } });
  }

  async deleteTweetLike(likedById: string, tweetId: string) {
    return prisma.like.delete({
      where: { likedById_tweetId: { likedById, tweetId } },
    });
  }

  async countTweetLikes(tweetId: string) {
    return prisma.like.count({ where: { tweetId } });
  }

  async findLikedVideos(likedById: string) {
    return prisma.like.findMany({
      where: { likedById, videoId: { not: null } },
      include: {
        video: {
          include: { owner: { select: { username: true, avatar: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

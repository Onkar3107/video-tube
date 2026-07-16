import { LikeRepository } from './like.repository.js';
import { cache } from '../../utils/cache.js';

const likeRepository = new LikeRepository();

export const likeService = {
  async toggleVideoLike(userId: string, videoId: string) {
    const existingLike = await likeRepository.findVideoLike(userId, videoId);

    let message: string;
    if (existingLike) {
      await likeRepository.deleteVideoLike(userId, videoId);
      message = 'Unliked successfully.';
    } else {
      await likeRepository.createVideoLike(userId, videoId);
      message = 'Video liked successfully.';
    }

    // Invalidate dashboard stats
    await cache.delPattern('dashboard:*');

    const likeCount = await likeRepository.countVideoLikes(videoId);
    return { likeCount, liked: !existingLike, message };
  },

  async toggleCommentLike(userId: string, commentId: string) {
    const existingLike = await likeRepository.findCommentLike(userId, commentId);

    let message: string;
    if (existingLike) {
      await likeRepository.deleteCommentLike(userId, commentId);
      message = 'Comment unlike successfully.';
    } else {
      await likeRepository.createCommentLike(userId, commentId);
      message = 'Comment liked successfully.';
    }

    const count = await likeRepository.countCommentLikes(commentId);
    return { count, liked: !existingLike, message };
  },

  async toggleTweetLike(userId: string, tweetId: string) {
    const existingLike = await likeRepository.findTweetLike(userId, tweetId);

    let message: string;
    if (existingLike) {
      await likeRepository.deleteTweetLike(userId, tweetId);
      message = 'Tweet unlike successfully.';
    } else {
      await likeRepository.createTweetLike(userId, tweetId);
      message = 'Tweet liked successfully.';
    }

    const count = await likeRepository.countTweetLikes(tweetId);
    return { count, liked: !existingLike, message };
  },

  async getLikedVideos(userId: string) {
    const liked = await likeRepository.findLikedVideos(userId);
    const videos = liked.map((l) => l.video).filter(Boolean);
    return { videos, count: videos.length };
  },
};

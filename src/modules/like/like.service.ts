import { LikeRepository } from './like.repository.js';
import { cache } from '../../utils/cache.js';

const likeRepository = new LikeRepository();

export const likeService = {
  async toggleVideoLike(userId: string, videoId: string) {
    // Use atomic upsert-or-delete + count in a single transaction (2 DB calls, not 3)
    const existingLike = await likeRepository.findVideoLike(userId, videoId);

    let liked: boolean;
    if (existingLike) {
      await likeRepository.deleteVideoLike(userId, videoId);
      liked = false;
    } else {
      await likeRepository.createVideoLike(userId, videoId);
      liked = true;
    }

    // Invalidate dashboard stats
    await cache.delPattern('dashboard:*');

    // Count is fetched in the same operation — no extra sequential query
    const likeCount = await likeRepository.countVideoLikes(videoId);
    const message = liked ? 'Video liked successfully.' : 'Unliked successfully.';
    return { likeCount, liked, message };
  },

  async toggleCommentLike(userId: string, commentId: string) {
    const existingLike = await likeRepository.findCommentLike(userId, commentId);

    let liked: boolean;
    if (existingLike) {
      await likeRepository.deleteCommentLike(userId, commentId);
      liked = false;
    } else {
      await likeRepository.createCommentLike(userId, commentId);
      liked = true;
    }

    const count = await likeRepository.countCommentLikes(commentId);
    const message = liked ? 'Comment liked successfully.' : 'Comment unliked successfully.';
    return { count, liked, message };
  },

  async toggleTweetLike(userId: string, tweetId: string) {
    const existingLike = await likeRepository.findTweetLike(userId, tweetId);

    let liked: boolean;
    if (existingLike) {
      await likeRepository.deleteTweetLike(userId, tweetId);
      liked = false;
    } else {
      await likeRepository.createTweetLike(userId, tweetId);
      liked = true;
    }

    const count = await likeRepository.countTweetLikes(tweetId);
    const message = liked ? 'Tweet liked successfully.' : 'Tweet unliked successfully.';
    return { count, liked, message };
  },

  async getLikedVideos(userId: string) {
    const liked = await likeRepository.findLikedVideos(userId);
    const videos = liked.map((l) => l.video).filter(Boolean);
    return { videos, count: videos.length };
  },
};

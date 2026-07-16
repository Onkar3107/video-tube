import { TweetRepository } from './tweet.repository.js';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import type { CreateTweetDto, UpdateTweetDto } from './tweet.dto.js';

const tweetRepository = new TweetRepository();

export const tweetService = {
  async createTweet(userId: string, dto: CreateTweetDto) {
    return tweetRepository.create({
      content: dto.tweet,
      owner: { connect: { id: userId } },
    });
  },

  async getUserTweets(userId: string) {
    // Check if user exists first
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userExists) {
      throw new ApiError(404, 'User does not exist.');
    }

    return tweetRepository.findManyByOwnerId(userId);
  },

  async updateTweet(tweetId: string, userId: string, dto: UpdateTweetDto) {
    const existing = await tweetRepository.findById(tweetId);
    if (!existing) throw new ApiError(404, 'Tweet not found');
    if (existing.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to update this tweet');
    }

    return tweetRepository.update(tweetId, { content: dto.tweet });
  },

  async deleteTweet(tweetId: string, userId: string) {
    const deleted = await tweetRepository.deleteMany({
      id: tweetId,
      ownerId: userId,
    });

    if (deleted.count === 0) {
      throw new ApiError(404, "Tweet not found or you don't have permission to delete it.");
    }
  },
};

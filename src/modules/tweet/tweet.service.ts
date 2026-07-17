import { TweetRepository } from './tweet.repository.js';
import { UserRepository } from '../user/user.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import type { CreateTweetDto, UpdateTweetDto } from './tweet.dto.js';

const tweetRepository = new TweetRepository();
const userRepository = new UserRepository();

export const tweetService = {
  async createTweet(userId: string, dto: CreateTweetDto) {
    return tweetRepository.create({
      content: dto.tweet,
      owner: { connect: { id: userId } },
    });
  },

  async getUserTweets(userId: string) {
    // Validate user exists using the repository — not direct prisma
    const exists = await userRepository.existsById(userId);
    if (!exists) {
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
    const tweet = await tweetRepository.findById(tweetId);
    if (!tweet) throw new ApiError(404, 'Tweet not found.');
    if (tweet.ownerId !== userId) {
      throw new ApiError(403, "You don't have permission to delete this tweet.");
    }
    await tweetRepository.delete(tweetId);
  },
};

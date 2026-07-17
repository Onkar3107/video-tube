import { SubscriptionRepository } from './subscription.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { cache } from '../../utils/cache.js';

const subscriptionRepository = new SubscriptionRepository();

export const subscriptionService = {
  async toggleSubscription(userId: string, channelId: string) {
    if (channelId === userId) {
      throw new ApiError(400, 'You cannot subscribe to your own channel.');
    }

    const existing = await subscriptionRepository.findUnique(userId, channelId);

    let subscribed: boolean;
    if (existing) {
      await subscriptionRepository.delete(userId, channelId);
      subscribed = false;
    } else {
      await subscriptionRepository.create(userId, channelId);
      subscribed = true;
    }

    // Invalidate caches
    await cache.delPattern('dashboard:*');
    await cache.delPattern('channel:*');

    const count = await subscriptionRepository.countSubscribers(channelId);
    const message = subscribed ? 'Subscribed successfully.' : 'Unsubscribed successfully.';
    return { subscribed, count, message };
  },

  async getUserChannelSubscribers(channelId: string) {
    const result = await subscriptionRepository.findChannelSubscribers(channelId);
    const subscribers = result.map((s) => s.subscriber);
    return { subscriberCount: subscribers.length, subscribers };
  },

  async getSubscribedChannels(subscriberId: string) {
    const result = await subscriptionRepository.findSubscribedChannels(subscriberId);
    const channels = result.map((s) => s.channel);
    return { channels, count: channels.length };
  },
};

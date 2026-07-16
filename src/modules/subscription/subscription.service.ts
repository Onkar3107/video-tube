import { SubscriptionRepository } from './subscription.repository.js';
import { ApiError } from '../../utils/ApiError.js';

const subscriptionRepository = new SubscriptionRepository();

export const subscriptionService = {
  async toggleSubscription(userId: string, channelId: string) {
    if (channelId === userId) {
      throw new ApiError(400, 'You cannot subscribe to your own channel.');
    }

    const existing = await subscriptionRepository.findUnique(userId, channelId);

    let message: string;
    if (existing) {
      await subscriptionRepository.delete(userId, channelId);
      message = 'Unsubscribed successfully.';
    } else {
      await subscriptionRepository.create(userId, channelId);
      message = 'Subscribed successfully.';
    }

    const count = await subscriptionRepository.countSubscribers(channelId);
    return { subscribed: !existing, count, message };
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

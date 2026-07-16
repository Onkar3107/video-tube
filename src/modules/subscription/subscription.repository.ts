import { prisma } from '../../config/database.js';

export class SubscriptionRepository {
  async findUnique(subscriberId: string, channelId: string) {
    return prisma.subscription.findUnique({
      where: { subscriberId_channelId: { subscriberId, channelId } },
    });
  }

  async create(subscriberId: string, channelId: string) {
    return prisma.subscription.create({ data: { subscriberId, channelId } });
  }

  async delete(subscriberId: string, channelId: string) {
    return prisma.subscription.delete({
      where: { subscriberId_channelId: { subscriberId, channelId } },
    });
  }

  async countSubscribers(channelId: string) {
    return prisma.subscription.count({ where: { channelId } });
  }

  async findChannelSubscribers(channelId: string) {
    return prisma.subscription.findMany({
      where: { channelId },
      include: {
        subscriber: { select: { id: true, username: true, avatar: true, fullName: true } },
      },
    });
  }

  async findSubscribedChannels(subscriberId: string) {
    return prisma.subscription.findMany({
      where: { subscriberId },
      include: {
        channel: { select: { id: true, username: true, avatar: true, fullName: true } },
      },
    });
  }
}

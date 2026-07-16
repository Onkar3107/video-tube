import { prisma } from '../../config/database.js';

export class DashboardRepository {
  async getChannelVideoStats(channelId: string) {
    return prisma.video.aggregate({
      where: { ownerId: channelId },
      _sum: { views: true },
      _count: { _all: true },
    });
  }

  async countChannelSubscribers(channelId: string) {
    return prisma.subscription.count({ where: { channelId } });
  }

  async countChannelLikes(channelId: string) {
    return prisma.like.count({
      where: { video: { ownerId: channelId } },
    });
  }

  async findChannelVideos(channelId: string) {
    return prisma.video.findMany({
      where: { ownerId: channelId },
      include: {
        _count: { select: { likes: true, comments: true } },
        owner: { select: { username: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

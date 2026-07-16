import { DashboardRepository } from './dashboard.repository.js';

const dashboardRepository = new DashboardRepository();

export const dashboardService = {
  async getChannelStats(channelId: string) {
    const [videoStats, subscriberCount, totalLikes] = await Promise.all([
      dashboardRepository.getChannelVideoStats(channelId),
      dashboardRepository.countChannelSubscribers(channelId),
      dashboardRepository.countChannelLikes(channelId),
    ]);

    return {
      totalVideos: videoStats._count._all,
      totalViews: videoStats._sum.views ?? 0,
      totalSubscribers: subscriberCount,
      totalLikes,
    };
  },

  async getChannelVideos(channelId: string) {
    return dashboardRepository.findChannelVideos(channelId);
  },
};

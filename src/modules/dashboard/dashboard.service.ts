import { DashboardRepository } from './dashboard.repository.js';
import { cache, CacheKeys, CacheTTL } from '../../utils/cache.js';

const dashboardRepository = new DashboardRepository();

export const dashboardService = {
  async getChannelStats(channelId: string) {
    const cacheKey = CacheKeys.dashboardStats(channelId);
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    const [videoStats, subscriberCount, totalLikes] = await Promise.all([
      dashboardRepository.getChannelVideoStats(channelId),
      dashboardRepository.countChannelSubscribers(channelId),
      dashboardRepository.countChannelLikes(channelId),
    ]);

    const result = {
      totalVideos: videoStats._count._all,
      totalViews: videoStats._sum.views ?? 0,
      totalSubscribers: subscriberCount,
      totalLikes,
    };

    await cache.set(cacheKey, result, CacheTTL.DASHBOARD);
    return result;
  },

  async getChannelVideos(channelId: string) {
    const cacheKey = CacheKeys.dashboardVideos(channelId);
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    const videos = await dashboardRepository.findChannelVideos(channelId);

    await cache.set(cacheKey, videos, CacheTTL.DASHBOARD);
    return videos;
  },
};

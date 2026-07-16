import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  // Required for BullMQ compatibility
  maxRetriesPerRequest: null,
  // Reconnection strategy: exponential backoff, max 2 seconds
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis: max reconnection attempts reached');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 2000);
  },
  enableReadyCheck: false,
});

redis.on('connect', () => logger.info('Redis: connected'));
redis.on('ready', () => logger.info('Redis: ready'));
redis.on('error', (err: Error) => logger.error({ err }, 'Redis: connection error'));
redis.on('reconnecting', () => logger.warn('Redis: reconnecting...'));
redis.on('close', () => logger.warn('Redis: connection closed'));

// Graceful shutdown
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis: disconnected');
}

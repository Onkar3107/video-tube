import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import type { VideoProcessingJobData, NotificationJobData, CleanupJobData } from './types.js';

const connection = redis;

// Default job options with retry and backoff
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000, // 5 seconds initial delay, doubles each retry
  },
  removeOnComplete: { count: 100 },  // Keep last 100 completed jobs
  removeOnFail: { count: 500 },      // Keep last 500 failed jobs for debugging
};

export const videoProcessingQueue = new Queue<VideoProcessingJobData>(
  'video-processing',
  { connection, defaultJobOptions },
);

export const notificationQueue = new Queue<NotificationJobData>(
  'notifications',
  {
    connection,
    defaultJobOptions: {
      ...defaultJobOptions,
      backoff: { type: 'exponential', delay: 2_000 },
    },
  },
);

export const cleanupQueue = new Queue<CleanupJobData>(
  'cleanup',
  {
    connection,
    defaultJobOptions: { attempts: 1 },
  },
);

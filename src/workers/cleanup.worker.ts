import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { CleanupJobData } from '../queues/types.js';

async function processCleanupJob(job: Job<CleanupJobData>) {
  const jobLogger = logger.child({ jobId: job.id });
  jobLogger.info('Cleanup job started');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [deletedNotifications, staleSessions] = await Promise.all([
    // Delete read notifications older than 30 days
    prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: thirtyDaysAgo },
      },
    }),
    // Clear refresh tokens for users inactive for 90 days
    prisma.user.updateMany({
      where: {
        refreshToken: { not: null },
        updatedAt: { lt: ninetyDaysAgo },
      },
      data: { refreshToken: null },
    }),
  ]);

  const summary = {
    deletedNotifications: deletedNotifications.count,
    clearedSessions: staleSessions.count,
    ranAt: new Date().toISOString(),
  };

  jobLogger.info(summary, 'Cleanup job completed');
  return summary;
}

export const cleanupWorker = new Worker<CleanupJobData>(
  'cleanup',
  processCleanupJob,
  { connection: redis, concurrency: 1 },
);

cleanupWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'Cleanup completed');
});

cleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Cleanup job failed');
});

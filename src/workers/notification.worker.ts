import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { NotificationJobData } from '../queues/types.js';

async function processNotificationJob(job: Job<NotificationJobData>) {
  const { type, targetUserIds, payload } = job.data;
  const jobLogger = logger.child({ jobId: job.id, type, count: targetUserIds.length });

  jobLogger.info('Notification job started');

  if (targetUserIds.length === 0) {
    jobLogger.info('No target users — skipping');
    return;
  }

  // ── Atomic batch insert using Prisma transaction ──────────────────────────
  // This is a transaction because partial inserts (some users get notifications,
  // others don't) are worse than no notifications at all.
  await prisma.$transaction(async (tx) => {
    await tx.notification.createMany({
      data: targetUserIds.map((userId) => ({
        userId,
        type,
        payload: payload as object,
        isRead: false,
      })),
      skipDuplicates: true,
    });
  });

  jobLogger.info({ inserted: targetUserIds.length }, 'Notifications inserted to DB');

  // ── WebSocket delivery (Phase 7 will implement this fully) ─────────────────
  // The connectionManager will be imported here in Phase 7.
  // For now, notifications are stored in DB and fetched via REST.

  jobLogger.info('Notification job completed');
}

export const notificationWorker = new Worker<NotificationJobData>(
  'notifications',
  processNotificationJob,
  {
    connection: redis,
    concurrency: 5,   // Notifications are fast — allow higher concurrency
  },
);

notificationWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Notification job completed');
});

notificationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Notification job failed');
});

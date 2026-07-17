import '../config/env.js';   // Validate env first
import { videoWorker } from './video.worker.js';
import { notificationWorker } from './notification.worker.js';
import { cleanupWorker } from './cleanup.worker.js';
import { cleanupQueue } from '../queues/index.js';
import { prisma } from '../config/database.js';
import { disconnectRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

async function startWorkers() {
  await prisma.$connect();
  logger.info('Worker process: database connected');

  // ── Schedule cleanup job (repeatable, cron-based) ─────────────────────────
  // Runs every day at 2:00 AM
  await cleanupQueue.add(
    'daily-cleanup',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: 'daily-cleanup-singleton',  // Prevent duplicate schedules
    },
  );

  logger.info({
    workers: ['video-processing', 'notifications', 'cleanup'],
  }, 'All workers started');
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Worker shutdown signal received');

  try {
    await Promise.all([
      videoWorker.close(),
      notificationWorker.close(),
      cleanupWorker.close(),
    ]);
    await prisma.$disconnect();
    await disconnectRedis();
    logger.info('Worker process shut down cleanly');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Worker: uncaught exception');
  process.exit(1);
});

startWorkers().catch((err) => {
  logger.fatal({ err }, 'Worker startup failed');
  process.exit(1);
});

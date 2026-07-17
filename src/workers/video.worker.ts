import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notificationQueue } from '../queues/index.js';
import type { VideoProcessingJobData, JobProgress } from '../queues/types.js';
import { cloudinary } from '../utils/cloudinary.js';

/**
 * Fetches video metadata (duration, dimensions) from Cloudinary.
 * We do NOT re-upload or re-encode — Cloudinary handles that via
 * eager transformations configured at upload time in publishAVideo.
 */
async function fetchVideoMetadata(publicId: string) {
  const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
  return {
    duration: (result.duration as number) ?? 0,
    width: result.width as number,
    height: result.height as number,
    format: result.format as string,
  };
}

async function processVideoJob(job: Job<VideoProcessingJobData>) {
  const { videoId, ownerId, cloudinaryPublicId } = job.data;
  const jobLogger = logger.child({ jobId: job.id, videoId });

  jobLogger.info('Video processing job started');

  // ── Step 1: Mark as PROCESSING ────────────────────────────────────────────
  await prisma.video.update({ where: { id: videoId }, data: { status: 'PROCESSING' } });
  await job.updateProgress({ percentage: 20, stage: 'FETCHING_METADATA' } satisfies JobProgress);
  jobLogger.info('Status set to PROCESSING');

  // ── Step 2: Fetch accurate duration from Cloudinary ────────────────────────
  const metadata = await fetchVideoMetadata(cloudinaryPublicId);
  jobLogger.info({ duration: metadata.duration }, 'Metadata fetched from Cloudinary');

  await job.updateProgress({ percentage: 60, stage: 'UPDATING_DB' } satisfies JobProgress);

  // ── Step 3: Update video record with accurate metadata ────────────────────
  await prisma.video.update({
    where: { id: videoId },
    data: {
      duration: metadata.duration,
      status: 'READY',
    },
  });
  jobLogger.info('Video status set to READY');

  await job.updateProgress({ percentage: 80, stage: 'NOTIFYING_SUBSCRIBERS' } satisfies JobProgress);

  // ── Step 4: Find subscribers to notify ───────────────────────────────────
  const subscribers = await prisma.subscription.findMany({
    where: { channelId: ownerId },
    select: { subscriberId: true },
  });

  const targetUserIds = subscribers.map((s) => s.subscriberId);
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { username: true },
  });

  if (targetUserIds.length > 0) {
    await notificationQueue.add('new-video-notification', {
      type: 'new_video',
      triggeredById: ownerId,
      targetUserIds,
      payload: {
        videoId,
        channelName: owner?.username ?? 'Unknown',
        message: `${owner?.username ?? 'Someone'} uploaded a new video`,
      },
    });
    jobLogger.info({ subscriberCount: targetUserIds.length }, 'Notification job enqueued');
  }

  await job.updateProgress({ percentage: 100, stage: 'DONE' } satisfies JobProgress);
  jobLogger.info('Video processing job completed');

  return { videoId, status: 'READY', duration: metadata.duration };
}

export const videoWorker = new Worker<VideoProcessingJobData>(
  'video-processing',
  processVideoJob,
  {
    connection: redis,
    concurrency: 3,       // Process up to 3 videos simultaneously
    limiter: {
      max: 10,            // Max 10 jobs per duration
      duration: 60_000,   // Per 1 minute (rate limiting)
    },
  },
);

// ── Worker Event Handlers ─────────────────────────────────────────────────────

videoWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'Video processing completed');
});

videoWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, videoId: job?.data?.videoId, err }, 'Video processing failed');

  if (job) {
    // Mark video as FAILED in DB
    await prisma.video.update({
      where: { id: job.data.videoId },
      data: { status: 'FAILED' },
    }).catch((dbErr) => logger.error({ dbErr }, 'Failed to update video status to FAILED'));

    // If all retries exhausted, notify the uploader
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await notificationQueue.add('video-failed-notification', {
        type: 'video_failed',
        triggeredById: job.data.ownerId,
        targetUserIds: [job.data.ownerId],
        payload: {
          videoId: job.data.videoId,
          message: 'Your video failed to process. Please try uploading again.',
        },
      }).catch(() => {});
    }
  }
});

videoWorker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Video processing job stalled');
});

import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notificationQueue } from '../queues/index.js';
import type { VideoProcessingJobData, JobProgress } from '../queues/types.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import fs from 'fs/promises';

// Helper to check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// Helper to safely delete local files
async function safeDeleteLocalFiles(paths: string[]) {
  for (const path of paths) {
    if (await fileExists(path)) {
      await fs.unlink(path).catch((err) => logger.error({ err, path }, 'Worker: local file cleanup failed'));
    }
  }
}

async function processVideoJob(job: Job<VideoProcessingJobData>) {
  const { videoId, ownerId, localVideoPath, localThumbnailPath } = job.data;
  const jobLogger = logger.child({ jobId: job.id, videoId });

  jobLogger.info('Video processing and upload started');

  // Verify local files exist before starting
  if (!(await fileExists(localVideoPath)) || !(await fileExists(localThumbnailPath))) {
    throw new Error('Local video or thumbnail file not found on disk.');
  }

  // ── Step 1: Mark as PROCESSING ────────────────────────────────────────────
  await prisma.video.update({ where: { id: videoId }, data: { status: 'PROCESSING' } });
  await job.updateProgress({ percentage: 20, stage: 'FETCHING_METADATA' } satisfies JobProgress);

  // ── Step 2: Upload Video to Cloudinary ────────────────────────────────────
  const videoUpload = await uploadOnCloudinary(localVideoPath);
  if (!videoUpload) throw new Error('Failed to upload video to Cloudinary');

  await job.updateProgress({ percentage: 50, stage: 'FETCHING_METADATA' } satisfies JobProgress);

  // ── Step 3: Upload Thumbnail to Cloudinary ────────────────────────────────
  const thumbnailUpload = await uploadOnCloudinary(localThumbnailPath);
  if (!thumbnailUpload) {
    // Rollback Cloudinary video upload if thumbnail fails
    await deleteFromCloudinary(videoUpload.secure_url).catch(() => {});
    throw new Error('Failed to upload thumbnail to Cloudinary');
  }

  await job.updateProgress({ percentage: 80, stage: 'UPDATING_DB' } satisfies JobProgress);

  // ── Step 4: Update Video Record with Cloudinary URLs ──────────────────────
  await prisma.video.update({
    where: { id: videoId },
    data: {
      videoFile: videoUpload.secure_url,
      thumbnail: thumbnailUpload.secure_url,
      duration: videoUpload.duration ?? 0,
      status: 'READY',
    },
  });
  jobLogger.info('Video status set to READY and URLs updated');

  // ── Step 5: Clean Up Local Files on Success ───────────────────────────────
  await safeDeleteLocalFiles([localVideoPath, localThumbnailPath]);

  await job.updateProgress({ percentage: 90, stage: 'NOTIFYING_SUBSCRIBERS' } satisfies JobProgress);

  // ── Step 6: Find subscribers to notify ────────────────────────────────────
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

  return { videoId, status: 'READY', duration: videoUpload.duration };
}

export const videoWorker = new Worker<VideoProcessingJobData>(
  'video-processing',
  processVideoJob,
  {
    connection: redis,
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60_000,
    },
  },
);

// Worker Event Handlers

videoWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'Video processing completed');
});

videoWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, videoId: job?.data?.videoId, err }, 'Video processing failed');

  if (job) {
    const { videoId, localVideoPath, localThumbnailPath } = job.data;
    const maxAttempts = job.opts.attempts ?? 1;

    // Check if this is the final attempt
    if (job.attemptsMade >= maxAttempts) {
      // Mark video as FAILED in DB
      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'FAILED' },
      }).catch((dbErr) => logger.error({ dbErr }, 'Failed to update video status to FAILED'));

      // Clean up local files to prevent disk bloat
      await safeDeleteLocalFiles([localVideoPath, localThumbnailPath]);

      // Notify the uploader of failure
      await notificationQueue.add('video-failed-notification', {
        type: 'video_failed',
        triggeredById: job.data.ownerId,
        targetUserIds: [job.data.ownerId],
        payload: {
          videoId,
          message: 'Your video failed to process. Please try uploading again.',
        },
      }).catch(() => {});
    }
  }
});

videoWorker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Video processing job stalled');
});

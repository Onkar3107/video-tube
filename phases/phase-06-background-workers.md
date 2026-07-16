# Phase 6 — Background Workers

> **Status**: Not started  
> **Estimated Time**: 5–6 hours  
> **Prerequisite**: Phase 5 complete  
> **Scope**: Implement BullMQ queues and workers for video processing, notification fan-out, and scheduled cleanup. Add Bull Board monitoring UI. Update video upload to return 202 immediately.

---

## Objective

Offload slow operations (video metadata extraction, notification delivery) to background workers. The video upload endpoint returns immediately with `202 Accepted` instead of blocking the HTTP response.

---

## Step 6.1 — Install Dependencies

```bash
npm install bullmq @bull-board/api @bull-board/express
```

---

## Step 6.2 — Define Job Types

Create `src/queues/types.ts`:

```typescript
export interface VideoProcessingJobData {
  videoId: string;
  ownerId: string;
  cloudinaryPublicId: string;
  cloudinaryVideoUrl: string;
}

export interface NotificationJobData {
  type: 'new_video' | 'new_subscriber' | 'video_ready' | 'video_failed';
  triggeredById: string;      // User who caused the event
  targetUserIds: string[];    // Users who receive the notification
  payload: {
    videoId?: string;
    channelName?: string;
    message: string;
  };
}

export interface CleanupJobData {
  // No input needed — cleanup uses fixed time windows
  _?: never;
}

export type JobProgress = {
  percentage: number;
  stage: 'FETCHING_METADATA' | 'UPDATING_DB' | 'NOTIFYING_SUBSCRIBERS' | 'DONE';
};
```

---

## Step 6.3 — Queue Definitions

Create `src/queues/index.ts`:

```typescript
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
```

---

## Step 6.4 — Video Processing Worker

Create `src/workers/video.worker.ts`:

```typescript
import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notificationQueue } from '../queues/index.js';
import type { VideoProcessingJobData, JobProgress } from '../queues/types.js';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Fetches video metadata (duration, dimensions) from Cloudinary.
 * We do NOT re-upload or re-encode — Cloudinary handles that via
 * eager transformations configured at upload time in publishAVideo.
 */
async function fetchVideoMetadata(publicId: string) {
  const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
  return {
    duration: result.duration as number ?? 0,
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
  // Cloudinary processes the video asynchronously. We poll for metadata.
  // The video was uploaded with resource_type: 'video', so metadata is available.
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
  logger.error({ jobId: job?.id, videoId: job?.data.videoId, err }, 'Video processing failed');

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
```

---

## Step 6.5 — Notification Worker

Create `src/workers/notification.worker.ts`:

```typescript
import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { NotificationJobData } from '../queues/types.js';

async function processNotificationJob(job: Job<NotificationJobData>) {
  const { type, targetUserIds, payload, triggeredById } = job.data;
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
  // In Phase 7, add:
  // import { connectionManager } from '../websocket/connection.manager.js';
  // for (const userId of targetUserIds) {
  //   connectionManager.sendToUser(userId, { type: 'notification', payload: { type, ...payload } });
  // }

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
```

---

## Step 6.6 — Cleanup Worker

Create `src/workers/cleanup.worker.ts`:

```typescript
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
```

---

## Step 6.7 — Worker Entry Point

Create `src/workers/index.ts` (separate process entry point):

```typescript
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
```

Add worker script to `package.json`:

```json
{
  "scripts": {
    "worker": "tsx src/workers/index.ts",
    "worker:prod": "node dist/workers/index.js"
  }
}
```

---

## Step 6.8 — Update Video Controller for Async Upload

Update `src/modules/video/video.controller.ts` — `publishAVideo` now returns `202`:

In `video.service.ts`:
```typescript
import { videoProcessingQueue } from '../../queues/index.js';

async publishVideo(dto: PublishVideoDto, files: Request['files'], ownerId: string) {
  const filesObj = files as Record<string, Express.Multer.File[]> | undefined;
  const videoPath = filesObj?.['videoFile']?.[0]?.path;
  const thumbPath = filesObj?.['thumbnail']?.[0]?.path;

  if (!videoPath) throw new ApiError(400, 'Video file is required');
  if (!thumbPath) throw new ApiError(400, 'Thumbnail is required');

  // Upload files to Cloudinary
  const [videoUpload, thumbnailUpload] = await Promise.all([
    uploadOnCloudinary(videoPath),
    uploadOnCloudinary(thumbPath),
  ]);

  if (!videoUpload) throw new ApiError(500, 'Failed to upload video');
  if (!thumbnailUpload) {
    // Cleanup video upload if thumbnail fails
    await deleteFromCloudinary(videoUpload.secure_url);
    throw new ApiError(500, 'Failed to upload thumbnail');
  }

  // Create video record with UPLOADING status (not READY yet)
  const video = await videoRepository.create({
    videoFile: videoUpload.secure_url,
    thumbnail: thumbnailUpload.secure_url,
    title: dto.title,
    description: dto.description,
    duration: 0,   // Will be updated by worker
    ownerId,
    status: 'UPLOADING',
  });

  // Enqueue background processing job
  const job = await videoProcessingQueue.add('process-video', {
    videoId: video.id,
    ownerId,
    cloudinaryPublicId: videoUpload.public_id,
    cloudinaryVideoUrl: videoUpload.secure_url,
  });

  logger.info({ videoId: video.id, jobId: job.id }, 'Video upload accepted, processing enqueued');

  return { videoId: video.id, jobId: job.id, status: 'UPLOADING' };
},
```

In `video.controller.ts`:
```typescript
export const publishAVideo = asyncHandler(async (req: Request, res: Response) => {
  const result = await videoService.publishVideo(req.body, req.files, req.user!.id);
  // 202 Accepted — not 200 or 201. Processing happens in background.
  res.status(202).json(new ApiResponse(202, result, 'Video upload accepted. Processing in background.'));
});
```

---

## Step 6.9 — Bull Board Monitoring UI

Add to `src/app.ts`:

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { videoProcessingQueue, notificationQueue, cleanupQueue } from './queues/index.js';

// ── Bull Board setup ──────────────────────────────────────────────────────────
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(videoProcessingQueue),
    new BullMQAdapter(notificationQueue),
    new BullMQAdapter(cleanupQueue),
  ],
  serverAdapter,
});

// TODO: Add admin authentication middleware in production
// For now, accessible at http://localhost:8000/admin/queues
app.use('/admin/queues', serverAdapter.getRouter());
```

---

## Step 6.10 — Prisma Transaction for Notification Fan-Out

The `notification.worker.ts` already uses `prisma.$transaction` for the batch insert (Step 6.5). Here is the explicit reasoning documented for the codebase:

```typescript
// WHY A TRANSACTION:
// Notification fan-out to N subscribers must be all-or-nothing.
// A partial insert (subscriber A gets notified, subscriber B doesn't due to a
// mid-flight DB error) is worse than no notification at all because it creates
// inconsistent user experience. Wrapping in a transaction ensures either all
// notifications are inserted or none are.
await prisma.$transaction(async (tx) => {
  await tx.notification.createMany({ data: [...] });
});
```

---

## Deliverables Checklist

- [ ] `bullmq`, `@bull-board/api`, `@bull-board/express` installed
- [ ] `src/queues/types.ts` — job data interfaces
- [ ] `src/queues/index.ts` — 3 queue definitions with retry/backoff config
- [ ] `src/workers/video.worker.ts` — processes video metadata, transitions status, enqueues notifications
- [ ] `src/workers/notification.worker.ts` — batch inserts notifications with transaction
- [ ] `src/workers/cleanup.worker.ts` — deletes stale notifications and sessions
- [ ] `src/workers/index.ts` — worker process entry point with graceful shutdown
- [ ] `package.json` — `"worker"` script added
- [ ] `video.service.ts` — `publishVideo` creates video with `UPLOADING` status and enqueues job
- [ ] `video.controller.ts` — `publishAVideo` returns `202 Accepted`
- [ ] Bull Board accessible at `http://localhost:8000/admin/queues`
- [ ] `docker-compose.yml` — `worker` service already defined (from Phase 1)

---

## Verification

```bash
# 1. Start all services
docker-compose up postgres redis -d
npm run dev &
npm run worker &  # In a separate terminal

# 2. Upload a video
curl -X POST http://localhost:8000/api/v1/videos \
  -H "Authorization: Bearer <token>" \
  -F "title=Test Video" \
  -F "description=Test description" \
  -F "videoFile=@test.mp4" \
  -F "thumbnail=@thumb.jpg"
# Expected: 202 { videoId: "...", jobId: "...", status: "UPLOADING" }

# 3. Check video status changes
curl http://localhost:8000/api/v1/videos/<videoId>
# Wait a few seconds and repeat — status should change:
# UPLOADING → PROCESSING → READY

# 4. Check Bull Board
open http://localhost:8000/admin/queues
# Expected: UI shows all 3 queues, completed job in video-processing queue

# 5. Verify notification created
curl -H "Authorization: Bearer <subscriber-token>" http://localhost:8000/api/v1/notifications
# Expected: notification of type "new_video" if subscribed to the uploader

# 6. Check worker logs for job progress
# Worker terminal should show:
# "Video processing job started"
# "Status set to PROCESSING"
# "Metadata fetched from Cloudinary"
# "Video status set to READY"
# "Notification job enqueued"
# "Video processing job completed"

# 7. Cleanup job is scheduled
# Bull Board → cleanup queue → Delayed tab → should show "daily-cleanup-singleton"
```

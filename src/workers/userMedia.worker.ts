import { Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';
import { cache, CacheKeys } from '../utils/cache.js';
import type { UserMediaJobData } from '../queues/types.js';
import fs from 'fs/promises';

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function safeDeleteFile(path?: string) {
  if (path && (await fileExists(path))) {
    await fs.unlink(path).catch((err) => logger.error({ err, path }, 'Worker: user media local file cleanup failed'));
  }
}

async function processUserMediaJob(job: Job<UserMediaJobData>) {
  const { userId, localAvatarPath, localCoverPath } = job.data;
  const jobLogger = logger.child({ jobId: job.id, userId });

  jobLogger.info('User media processing job started');

  try {
    const avatarUpload = localAvatarPath && (await fileExists(localAvatarPath))
      ? await uploadOnCloudinary(localAvatarPath)
      : null;

    const coverUpload = localCoverPath && (await fileExists(localCoverPath))
      ? await uploadOnCloudinary(localCoverPath)
      : null;

    const updateData: { avatar?: string; coverImage?: string } = {};
    if (avatarUpload?.secure_url) {
      updateData.avatar = avatarUpload.secure_url;
    }
    if (coverUpload?.secure_url) {
      updateData.coverImage = coverUpload.secure_url;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
      await cache.del(CacheKeys.userProfile(userId));
      jobLogger.info({ updateData }, 'User media updated successfully in database');
    }
  } finally {
    await safeDeleteFile(localAvatarPath);
    if (localCoverPath) {
      await safeDeleteFile(localCoverPath);
    }
  }

  return { userId, success: true };
}

export const userMediaWorker = new Worker<UserMediaJobData>(
  'user-media',
  processUserMediaJob,
  { connection: redis, concurrency: 3 },
);

userMediaWorker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'User media job completed');
});

userMediaWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'User media job failed');
});

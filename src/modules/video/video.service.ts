import { VideoRepository } from './video.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.js';
import { cache, CacheKeys, CacheTTL } from '../../utils/cache.js';
import { logger } from '../../config/logger.js';
import { videoProcessingQueue } from '../../queues/index.js';
import type { GetVideosDto, PublishVideoDto, UpdateVideoDto } from './video.dto.js';
import type { Prisma, VideoStatus } from '@prisma/client';

type UploadedFiles = Record<string, Express.Multer.File[]> | undefined;

const videoRepository = new VideoRepository();

export const videoService = {
  async getAllVideos(dto: GetVideosDto) {
    const cacheKey = CacheKeys.videoList(dto.page, dto.limit, dto.query ?? '', dto.userId);
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    const skip = (dto.page - 1) * dto.limit;

    const where: Prisma.VideoWhereInput = {
      isPublished: true,
      status: 'READY' as VideoStatus,
      ...(dto.query && {
        OR: [
          { title: { contains: dto.query, mode: 'insensitive' } },
          { description: { contains: dto.query, mode: 'insensitive' } },
        ],
      }),
      ...(dto.userId && { ownerId: dto.userId }),
    };

    const orderBy: Prisma.VideoOrderByWithRelationInput = {
      [dto.sortBy]: dto.sortType,
    };

    const [videos, total] = await videoRepository.findManyAndCount({
      where,
      skip,
      take: dto.limit,
      orderBy,
    });

    const totalPages = Math.ceil(total / dto.limit);

    const result = {
      videos,
      pagination: {
        total,
        totalPages,
        page: dto.page,
        limit: dto.limit,
        hasNextPage: dto.page < totalPages,
        hasPrevPage: dto.page > 1,
      },
    };

    await cache.set(cacheKey, result, CacheTTL.VIDEO_LIST);
    return result;
  },

  async publishVideo(dto: PublishVideoDto, ownerId: string, files: UploadedFiles) {
    if (!files?.videoFile?.[0]?.path || !files?.thumbnail?.[0]?.path) {
      throw new ApiError(400, 'Video File and Thumbnail are mandatory fields.');
    }

    const videoPath = files.videoFile[0].path;
    const thumbPath = files.thumbnail[0].path;

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
      owner: { connect: { id: ownerId } },
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

    // Invalidate caches
    await cache.delPattern('videos:*');
    await cache.delPattern('dashboard:*');

    return { videoId: video.id, jobId: job.id, status: 'UPLOADING' };
  },

  async getVideoById(id: string, userId?: string) {
    // 1. Check cache first
    const cacheKey = CacheKeys.video(id);
    let video = await cache.get<any>(cacheKey);

    if (!video) {
      // 2. Fetch from DB on cache miss
      video = await videoRepository.findByIdWithOwner(id);
      if (!video) {
        throw new ApiError(404, 'Video not found.');
      }
      // 3. Store in cache
      await cache.set(cacheKey, video, CacheTTL.VIDEO);
    }

    // 4. View increment and watch history are run out-of-band so response is fast
    // We don't await them, but handle potential errors
    videoRepository.incrementViews(id).catch((err) => {
      logger.error({ err }, 'Failed to increment views');
    });

    if (userId) {
      videoRepository.recordWatchHistory(userId, id).catch((err) => {
        logger.error({ err }, 'Failed to record watch history');
      });
    }

    return video;
  },

  async updateVideo(id: string, userId: string, dto: UpdateVideoDto, file: any) {
    const video = await videoRepository.findById(id);
    if (!video) throw new ApiError(404, 'Video not found.');
    if (video.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to update this video.');
    }

    const updateData: Prisma.VideoUpdateInput = {
      ...(dto.title && { title: dto.title }),
      ...(dto.description && { description: dto.description }),
    };

    let newThumbnailUrl: string | null = null;
    const oldThumbnailUrl = video.thumbnail;

    if (file?.path) {
      const uploadResult = await uploadOnCloudinary(file.path);
      if (!uploadResult) throw new ApiError(500, 'Failed to upload new thumbnail.');
      newThumbnailUrl = uploadResult.secure_url;
      updateData.thumbnail = newThumbnailUrl;
    }

    try {
      const updated = await videoRepository.update(id, updateData);
      
      // Invalidate caches
      await cache.del(CacheKeys.video(id));
      await cache.delPattern('videos:*');
      await cache.delPattern('dashboard:*');

      if (newThumbnailUrl && oldThumbnailUrl) {
        await deleteFromCloudinary(oldThumbnailUrl);
      }
      return updated;
    } catch (error) {
      if (newThumbnailUrl) await deleteFromCloudinary(newThumbnailUrl);
      throw error;
    }
  },

  async deleteVideo(id: string, userId: string) {
    const video = await videoRepository.findById(id);
    if (!video) throw new ApiError(404, 'Video not found.');
    if (video.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to delete this video.');
    }

    await videoRepository.delete(id);

    // Invalidate caches
    await cache.del(CacheKeys.video(id));
    await cache.delPattern('videos:*');
    await cache.delPattern('dashboard:*');

    if (video.videoFile) await deleteFromCloudinary(video.videoFile);
    if (video.thumbnail) await deleteFromCloudinary(video.thumbnail);

    return video;
  },

  async togglePublishStatus(id: string, userId: string) {
    const video = await videoRepository.findById(id);
    if (!video) throw new ApiError(404, 'Video not found.');
    if (video.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to update this video.');
    }

    const updated = await videoRepository.update(id, {
      isPublished: !video.isPublished,
    });

    // Invalidate caches
    await cache.del(CacheKeys.video(id));
    await cache.delPattern('videos:*');
    await cache.delPattern('dashboard:*');

    return updated;
  },
};

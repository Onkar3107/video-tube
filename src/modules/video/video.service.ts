import { VideoRepository } from './video.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.js';
import type { GetVideosDto, PublishVideoDto, UpdateVideoDto } from './video.dto.js';
import type { Prisma, VideoStatus } from '@prisma/client';

const videoRepository = new VideoRepository();

export const videoService = {
  async getAllVideos(dto: GetVideosDto) {
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

    return {
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
  },

  async publishVideo(dto: PublishVideoDto, ownerId: string, files: any) {
    if (!files?.videoFile?.[0]?.path || !files?.thumbnail?.[0]?.path) {
      throw new ApiError(400, 'Video File and Thumbnail are mandatory fields.');
    }

    const videoFileLocalPath = files.videoFile[0].path;
    const thumbnailLocalPath = files.thumbnail[0].path;

    let videoUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let duration = 0;

    try {
      const videoResult = await uploadOnCloudinary(videoFileLocalPath);
      if (!videoResult) throw new ApiError(500, 'Error uploading video file.');
      videoUrl = videoResult.secure_url;
      duration = videoResult.duration ?? 0;

      const thumbResult = await uploadOnCloudinary(thumbnailLocalPath);
      if (!thumbResult) {
        throw new ApiError(500, 'Error uploading thumbnail file.');
      }
      thumbnailUrl = thumbResult.secure_url;

      return await videoRepository.create({
        videoFile: videoUrl,
        thumbnail: thumbnailUrl,
        title: dto.title,
        description: dto.description,
        duration,
        owner: { connect: { id: ownerId } },
        status: 'READY',
      });
    } catch (error) {
      if (videoUrl) await deleteFromCloudinary(videoUrl);
      if (thumbnailUrl) await deleteFromCloudinary(thumbnailUrl);
      throw error;
    }
  },

  async getVideoById(id: string, userId?: string) {
    const video = await videoRepository.findByIdWithOwner(id);
    if (!video) {
      throw new ApiError(404, 'Video not found.');
    }

    await videoRepository.incrementViews(id);

    if (userId) {
      await videoRepository.recordWatchHistory(userId, id);
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

    return videoRepository.update(id, {
      isPublished: !video.isPublished,
    });
  },
};

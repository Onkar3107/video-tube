import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import type { Request, Response } from 'express';
import type { VideoStatus } from '@prisma/client';

// ─── Get All Videos (paginated, with search + filter) ─────────────────────────

const getAllVideos = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = '1',
    limit = '10',
    query = '',
    sortBy = 'createdAt',
    sortType = 'desc',
    userId,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const validSortFields = ['createdAt', 'views', 'duration'] as const;
  const validSortTypes = ['asc', 'desc'] as const;

  const sortField = (validSortFields as readonly string[]).includes(sortBy)
    ? (sortBy as (typeof validSortFields)[number])
    : 'createdAt';
  const sortDirection = (validSortTypes as readonly string[]).includes(sortType)
    ? (sortType as (typeof validSortTypes)[number])
    : 'desc';

  const where = {
    isPublished: true,
    status: 'READY' as VideoStatus,
    ...(query && {
      OR: [
        { title: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    }),
    ...(userId && { ownerId: userId }),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sortField]: sortDirection },
      include: {
        owner: { select: { id: true, username: true, avatar: true, fullName: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.video.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limitNum);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        pagination: {
          total,
          totalPages,
          page: pageNum,
          limit: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
      'Videos fetched successfully',
    ),
  );
});

// ─── Publish a Video ──────────────────────────────────────────────────────────

const publishAVideo = asyncHandler(async (req: Request, res: Response) => {
  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Title and Description are mandatory fields.');
  }

  const files = req.files as any;
  if (!files?.videoFile?.[0]?.path || !files?.thumbnail?.[0]?.path) {
    throw new ApiError(400, 'Video File and Thumbnail are mandatory fields.');
  }

  const videoFileLocalPath = files.videoFile[0].path as string;
  const thumbnailLocalPath = files.thumbnail[0].path as string;

  let video: any = null;
  let thumb: any = null;

  try {
    video = await uploadOnCloudinary(videoFileLocalPath);
    if (!video) throw new ApiError(500, 'Error uploading video file.');

    thumb = await uploadOnCloudinary(thumbnailLocalPath);
    if (!thumb) {
      await deleteFromCloudinary(video.secure_url);
      throw new ApiError(500, 'Error uploading thumbnail file.');
    }

    const newVideo = await prisma.video.create({
      data: {
        videoFile: video.secure_url,
        thumbnail: thumb.secure_url,
        title,
        description,
        duration: video.duration ?? 0,
        ownerId: req.user!.id,
        status: 'READY',
      },
    });

    res.status(200).json(new ApiResponse(200, newVideo, 'Video uploaded successfully'));
  } catch (error: any) {
    console.error('Error uploading video:', error.message);
    if (video?.secure_url) await deleteFromCloudinary(video.secure_url);
    if (thumb?.secure_url) await deleteFromCloudinary(thumb.secure_url);
    throw new ApiError(500, 'Video upload failed.');
  }
});

// ─── Get Video by ID ──────────────────────────────────────────────────────────

const getVideoById = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;

  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      owner: { select: { id: true, username: true, fullName: true, avatar: true, coverImage: true } },
    },
  });

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  // Increment view count
  await prisma.video.update({
    where: { id: videoId },
    data: { views: { increment: 1 } },
  });

  // Record watch history if user is logged in
  if (req.user) {
    await prisma.watchHistory.upsert({
      where: { userId_videoId: { userId: req.user.id, videoId } },
      create: { userId: req.user.id, videoId },
      update: { watchedAt: new Date() },
    });
  }

  res.status(200).json(new ApiResponse(200, video, 'Video fetched successfully.'));
});

// ─── Update Video ─────────────────────────────────────────────────────────────

const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Title and Description are mandatory fields.');
  }

  if (!videoId) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  if (req.user!.id !== video.ownerId) {
    throw new ApiError(403, 'You are not authorized to update this video.');
  }

  if (!req.file) {
    throw new ApiError(400, 'Thumbnail is mandatory field.');
  }

  const thumbnailLocalPath = req.file.path;
  const thumb = await uploadOnCloudinary(thumbnailLocalPath);

  if (!thumb) {
    throw new ApiError(500, 'Error uploading thumbnail file.');
  }

  const thumbnailToBeDeleted = video.thumbnail;

  const updatedVideo = await prisma.video.update({
    where: { id: videoId },
    data: { title, description, thumbnail: thumb.secure_url },
  });

  await deleteFromCloudinary(thumbnailToBeDeleted);

  res.status(200).json(new ApiResponse(200, updatedVideo, 'Video updated successfully.'));
});

// ─── Delete Video ─────────────────────────────────────────────────────────────

const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;

  if (!videoId) {
    throw new ApiError(400, 'Invalid Video ID');
  }

  const video = await prisma.video.findUnique({ where: { id: videoId } });

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  if (req.user!.id !== video.ownerId) {
    throw new ApiError(403, 'You are not authorized to delete this video.');
  }

  await prisma.video.delete({ where: { id: videoId } });

  if (video.videoFile && video.thumbnail) {
    await deleteFromCloudinary(video.videoFile);
    await deleteFromCloudinary(video.thumbnail);
  }

  res.status(200).json(new ApiResponse(200, video, 'Video deleted successfully.'));
});

// ─── Toggle Publish Status ────────────────────────────────────────────────────

const togglePublishStatus = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;

  if (!videoId) {
    throw new ApiError(400, 'Invalid Video ID');
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: { id: true, isPublished: true, ownerId: true },
  });

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  if (req.user!.id !== video.ownerId) {
    throw new ApiError(403, 'You are not authorized to update this video.');
  }

  const updatedVideo = await prisma.video.update({
    where: { id: videoId },
    data: { isPublished: !video.isPublished },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      updatedVideo,
      `Video ${updatedVideo.isPublished ? 'Published' : 'Unpublished'} successfully.`,
    ),
  );
});

export { getAllVideos, publishAVideo, getVideoById, updateVideo, deleteVideo, togglePublishStatus };

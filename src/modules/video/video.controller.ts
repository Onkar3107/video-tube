import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { videoService } from './video.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const getAllVideos = asyncHandler(async (req: Request, res: Response) => {
  const result = await videoService.getAllVideos(req.query as any);
  res.status(200).json(new ApiResponse(200, result, 'Videos fetched successfully'));
});

export const publishAVideo = asyncHandler(async (req: Request, res: Response) => {
  const video = await videoService.publishVideo(req.body, req.user!.id, req.files);
  res.status(200).json(new ApiResponse(200, video, 'Video uploaded successfully'));
});

export const getVideoById = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const video = await videoService.getVideoById(videoId, req.user?.id);
  res.status(200).json(new ApiResponse(200, video, 'Video fetched successfully.'));
});

export const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const video = await videoService.updateVideo(videoId, req.user!.id, req.body, req.file);
  res.status(200).json(new ApiResponse(200, video, 'Video updated successfully.'));
});

export const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const video = await videoService.deleteVideo(videoId, req.user!.id);
  res.status(200).json(new ApiResponse(200, video, 'Video deleted successfully.'));
});

export const togglePublishStatus = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params as Record<string, string>;
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const video = await videoService.togglePublishStatus(videoId, req.user!.id);
  res.status(200).json(
    new ApiResponse(
      200,
      video,
      `Video ${video.isPublished ? 'Published' : 'Unpublished'} successfully.`,
    ),
  );
});

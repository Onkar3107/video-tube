import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { dashboardService } from './dashboard.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const getChannelStats = asyncHandler(async (req: Request, res: Response) => {
  const channelId = req.user?.id;
  if (!channelId) throw new ApiError(401, 'Unauthorized');

  const stats = await dashboardService.getChannelStats(channelId);
  res.status(200).json(new ApiResponse(200, stats, 'Channel stats fetched successfully.'));
});

export const getChannelVideos = asyncHandler(async (req: Request, res: Response) => {
  const channelId = req.user?.id;
  if (!channelId) throw new ApiError(401, 'Unauthorized');

  const videos = await dashboardService.getChannelVideos(channelId);
  res.status(200).json(new ApiResponse(200, { videos }, 'Channel videos fetched successfully'));
});

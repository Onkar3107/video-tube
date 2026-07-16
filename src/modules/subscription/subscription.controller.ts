import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { subscriptionService } from './subscription.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const toggleSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as Record<string, string>;
  if (!channelId) throw new ApiError(400, 'Invalid channel ID');

  const result = await subscriptionService.toggleSubscription(req.user!.id, channelId);
  res.status(200).json(new ApiResponse(200, { subscribed: result.subscribed, count: result.count }, result.message));
});

export const getUserChannelSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as Record<string, string>;
  if (!channelId) throw new ApiError(400, 'Invalid Channel ID.');

  const result = await subscriptionService.getUserChannelSubscribers(channelId);
  res.status(200).json(
    new ApiResponse(
      200,
      result,
      result.subscriberCount > 0 ? 'Subscribers fetched successfully' : 'Channel has no subscribers yet.',
    ),
  );
});

export const getSubscribedChannels = asyncHandler(async (req: Request, res: Response) => {
  const { subscriberId } = req.params as Record<string, string>;
  if (!subscriberId) throw new ApiError(400, 'Invalid subscriber ID.');

  const result = await subscriptionService.getSubscribedChannels(subscriberId);
  res.status(200).json(
    new ApiResponse(
      200,
      result,
      result.count > 0 ? 'Channel list fetched successfully.' : 'User has not subscribed to any channel.',
    ),
  );
});

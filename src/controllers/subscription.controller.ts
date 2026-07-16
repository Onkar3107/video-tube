import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Toggle Subscription ──────────────────────────────────────────────────────

const toggleSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as Record<string, string>;
  const userId = req.user!.id;

  if (!channelId) {
    throw new ApiError(400, 'Invalid channel ID');
  }

  if (channelId === userId) {
    throw new ApiError(400, 'You cannot subscribe to your own channel.');
  }

  const existing = await prisma.subscription.findUnique({
    where: { subscriberId_channelId: { subscriberId: userId, channelId } },
  });

  let message: string;
  if (existing) {
    await prisma.subscription.delete({
      where: { subscriberId_channelId: { subscriberId: userId, channelId } },
    });
    message = 'Unsubscribed successfully.';
  } else {
    await prisma.subscription.create({ data: { subscriberId: userId, channelId } });
    message = 'Subscribed successfully.';
  }

  const count = await prisma.subscription.count({ where: { channelId } });

  res.status(200).json(new ApiResponse(200, { subscribed: !existing, count }, message));
});

// ─── Get Channel Subscribers ──────────────────────────────────────────────────

const getUserChannelSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params as Record<string, string>;

  if (!channelId) {
    throw new ApiError(400, 'Invalid Channel ID.');
  }

  const result = await prisma.subscription.findMany({
    where: { channelId },
    include: {
      subscriber: { select: { id: true, username: true, avatar: true, fullName: true } },
    },
  });

  const subscriberCount = result.length;
  const subscribers = result.map((s) => s.subscriber);

  res.status(200).json(
    new ApiResponse(
      200,
      { subscriberCount, subscribers },
      subscriberCount > 0 ? 'Subscribers fetched successfully' : 'Channel has no subscribers yet.',
    ),
  );
});

// ─── Get Subscribed Channels ──────────────────────────────────────────────────

const getSubscribedChannels = asyncHandler(async (req: Request, res: Response) => {
  const { subscriberId } = req.params as Record<string, string>;

  if (!subscriberId) {
    throw new ApiError(400, 'Invalid subscriber ID.');
  }

  const result = await prisma.subscription.findMany({
    where: { subscriberId },
    include: {
      channel: { select: { id: true, username: true, avatar: true, fullName: true } },
    },
  });

  const channels = result.map((s) => s.channel);

  res.status(200).json(
    new ApiResponse(
      200,
      { channels, count: channels.length },
      channels.length > 0 ? 'Channel list fetched successfully.' : 'User has not subscribed to any channel.',
    ),
  );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };

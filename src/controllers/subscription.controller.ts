import mongoose, { isValidObjectId } from 'mongoose';
import { Subscription } from '../models/subscription.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

const toggleSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params;
  const userId = req.user?._id.toString();

  if (!channelId || !isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel ID'");
  }

  if (channelId === userId) {
    throw new ApiError(400, 'You can not subscribe to your own channel.');
  }

  const existedSubscription = await Subscription.findOneAndDelete({
    subscriber: userId,
    channel: channelId,
  }).lean();

  let message: string, subscriptionData: any;

  if (existedSubscription) {
    message = 'Unsubscribed successfully.';
    subscriptionData = existedSubscription;
  } else {
    message = 'Subscribed successfully.';
    subscriptionData = await Subscription.create({
      subscriber: userId,
      channel: channelId,
    });
  }

  const count = await Subscription.countDocuments({ channel: channelId });

  res
    .status(200)
    .json(new ApiResponse(200, { subscriptionData, count }, message));
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const { channelId } = req.params;

  if (!channelId || !isValidObjectId(channelId)) {
    throw new ApiError(400, 'Invalid Channel ID.');
  }

  const subscribers = await Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId as string),
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'channel',
        foreignField: '_id',
        as: 'channelInfo',
      },
    },
    {
      $unwind: '$channelInfo',
    },
    {
      $group: {
        _id: '$channel',
        channelInfo: { $first: '$channelInfo' },
        subscriberCount: { $sum: 1 },
      },
    },
    {
      $project: {
        'channelInfo.password': 0,
        'channelInfo.email': 0,
        'channelInfo.watcHHistory': 0,
        'channelInfo.__v': 0,
      },
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        subscribers?.length > 0 ? subscribers[0] : {},
        subscribers?.length > 0
          ? 'Subscribers fetched successfully'
          : 'Channel has no subscribers yet.'
      )
    );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req: Request, res: Response) => {
  const { subscriberId } = req.params;

  if (!subscriberId || !isValidObjectId(subscriberId)) {
    throw new ApiError(400, 'Invalid subscriber ID.');
  }

  const channelList = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId as string),
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'channel',
        foreignField: '_id',
        as: 'channelInfo',
      },
    },
    {
      $unwind: '$channelInfo',
    },
    {
      $group: {
        _id: '$subscriber',
        channelInfo: { $push: '$channelInfo' },
      },
    },
    {
      $project: {
        'channelInfo.password': 0,
        'channelInfo.email': 0,
        'channelInfo.watcHHistory': 0,
        'channelInfo.__v': 0,
      },
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        channelList?.length > 0 ? channelList[0] : {},
        channelList?.length > 0
          ? 'Channel list fetched successfully.'
          : 'User has not subscribed to any channel.'
      )
    );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };

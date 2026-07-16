import mongoose, { isValidObjectId } from 'mongoose';
import { Like } from '../models/like.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

const toggleVideoLike = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const userId = req.user?._id.toString();

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const existedLike = await Like.findOneAndDelete({
    video: videoId,
    likedBy: userId,
  }).lean();

  let message: string, data: any;

  if (existedLike) {
    message = 'Unlike the video successfully.';
    data = existedLike;
  } else {
    message = 'Video liked successfully.';
    data = await Like.create({
      video: videoId,
      likedBy: userId,
    });
  }

  const likeCount = await Like.countDocuments({
    video: videoId,
  });

  res
    .status(200)
    .json(new ApiResponse(200, { data, likeCount }, message));
});

const toggleCommentLike = asyncHandler(async (req: Request, res: Response) => {
  const { commentId } = req.params;
  const userId = req.user?._id?.toString();

  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, 'Invalid comment ID.');
  }

  const existedComment = await Like.findOneAndDelete({
    comment: commentId,
    likedBy: userId,
  });

  let data: any, message: string;

  if (existedComment) {
    message = 'Comment unlike successfully.';
    data = existedComment;
  } else {
    message = 'Comment liked successfully.';
    data = await Like.create({
      comment: commentId,
      likedBy: userId,
    });
  }

  const count = await Like.countDocuments({
    comment: commentId,
  });

  res.status(200).json(new ApiResponse(200, { data, count }, message));
});

const toggleTweetLike = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params;
  const userId = req.user?._id?.toString();

  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, 'Invalid tweet ID.');
  }

  const existedTweet = await Like.findOneAndDelete({
    tweet: tweetId,
    likedBy: userId,
  });

  let data: any, message: string;

  if (existedTweet) {
    message = 'Tweet unlike successfully.';
    data = existedTweet;
  } else {
    message = 'Tweet liked successfully.';
    data = await Like.create({
      tweet: tweetId,
      likedBy: userId,
    });
  }

  const count = await Like.countDocuments({
    tweet: tweetId,
  });

  res.status(200).json(new ApiResponse(200, { data, count }, message));
});

const getLikedVideos = asyncHandler(async (req: Request, res: Response) => {
  const userIdObj = new mongoose.Types.ObjectId(req.user?._id);

  const likedVideos = await Like.aggregate([
    {
      $match: {
        likedBy: userIdObj,
      },
    },
    {
      $lookup: {
        from: 'videos',
        localField: 'video',
        foreignField: '_id',
        as: 'video',
      },
    },
    {
      $unwind: '$video',
    },
    {
      $group: {
        _id: '$likedBy',
        video: {
          $push: '$video',
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        count: 1,
        video: 1,
      },
    },
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, likedVideos[0], 'Liked videos fetched.'));
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };

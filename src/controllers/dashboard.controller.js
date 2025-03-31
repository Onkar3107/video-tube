import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { Subscription } from "../models/subscription.model.js";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const getChannelStats = AsyncHandler(async (req, res) => {
  // TODO: Get the channel stats like total video views, total subscribers, total videos, total likes etc.

  const channelId = req.user._id;

  const stats = await Video.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(channelId),
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "result",
      },
    },
    {
      $addFields: {
        likeCount: {
          $size: { $ifNull: ["$result", []] },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerData",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "res",
            },
          },
          {
            $addFields: {
              totalSubscribers: {
                $size: { $ifNull: ["$res", []] },
              },
            },
          },
          {
            $project: {
              totalSubscribers: 1,
              username: 1,
              avatar: 1,
              coverImage: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$ownerData",
    },
    {
      $addFields: {
        subscribersCount: "$ownerData.totalSubscribers",
      },
    },
    {
      $group: {
        _id: "$owner",
        totalLikes: { $sum: "$likeCount" },
        totalViews: { $sum: "$views" },
        totalVideos: { $sum: 1 },
        totalSubscribers: { $first: "$subscribersCount" },
        username: { $first: "$ownerData.username" },
        avatar: { $first: "$ownerData.avatar" },
        coverImage: { $first: "$ownerData.coverImage" },
      },
    },
    {
      $project: {
        _id: 0,
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, stats[0], "Channel stats fetched successfully."));
});

const getChannelVideos = AsyncHandler(async (req, res) => {
  const channelId = req.user._id;

  const videos = await Video.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(channelId),
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
        pipeline: [
          {
            $group: {
              _id: "$video",
              likeCount: {
                $sum: 1,
              },
            },
          },
          {
            $project: {
              likeCount: 1,
              _id: 0,
            },
          },
        ],
      },
    },
    {
      $unwind: "$likes",
    },
    {
      $lookup: {
        from: "comments",
        localField: "_id",
        foreignField: "video",
        as: "comments",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "commenterInfo",
            },
          },
          {
            $unwind: "$commenterInfo",
          },
          {
            $project: {
              content: 1,
              createdAt: 1,
              "commenterInfo.username": 1,
              "commenterInfo.email": 1,
              "commenterInfo.avatar": 1,
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerInfo",
      },
    },
    {
      $unwind: "$ownerInfo",
    },
    {
      $project: {
        __v: 0,
        isPublished: 0,
        owner: 0,
        "ownerInfo.watcHHistory": 0,
        "ownerInfo.password": 0,
        "ownerInfo.updatedAt": 0,
        "ownerInfo.createdAt": 0,
        "ownerInfo.__v": 0,
        "ownerInfo.coverImage": 0,
        "ownerInfo.fullName": 0,
        "ownerInfo.email": 0,
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(200, { videos }, "Channel videos fetched successfully")
    );
});

export { getChannelStats, getChannelVideos };

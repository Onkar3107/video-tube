import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const toggleVideoLike = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user._id.toString();

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const existedLike = await Like.findOneAndDelete({
    video: videoId,
    likedBy: userId,
  }).lean();

  let message, data;

  if (existedLike) {
    message = "Unlike the video successfully.";
    data = existedLike;
  } else {
    message = "Video liked successfully.";
    data = await Like.create({
      video: videoId,
      likedBy: userId,
    });
  }

  const likeCount = await Like.countDocuments({
    video: videoId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { data, likeCount }, message));
});

const toggleCommentLike = AsyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user._id?.toString();
  //TODO: toggle like on comment

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }

  const existedComment = await Like.findOneAndDelete({
    comment: commentId,
    likedBy: userId,
  });

  let data, message;

  if (existedComment) {
    message = "Comment unlike successfully.";
    data = existedComment;
  } else {
    message = "Comment liked successfully.";
    data = await Like.create({
      comment: commentId,
      likedBy: userId,
    });
  }

  const count = await Like.countDocuments({
    comment: commentId,
  });

  return res.status(200).json(new ApiResponse(200, { data, count }, message));
});

const toggleTweetLike = AsyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const userId = req.user._id?.toString();

  //TODO: toggle like on tweet

  if (!isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID.");
  }

  const existedTweet = await Like.findOneAndDelete({
    tweet: tweetId,
    likedBy: userId,
  });

  let data, message;

  if (existedTweet) {
    message = "Tweet unlike successfully.";
    data = existedTweet;
  } else {
    message = "Tweet liked successfully.";
    data = await Like.create({
      tweet: tweetId,
      likedBy: userId,
    });
  }

  const count = await Like.countDocuments({
    tweet: tweetId,
  });

  return res.status(200).json(new ApiResponse(200, { data, count }, message));
});

const getLikedVideos = AsyncHandler(async (req, res) => {
  //TODO: get all liked videos

  const likedVideos = await Like.aggregate([
    {
      $match: {
        likedBy: req.user._id,
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video",
      },
    },
    {
      $unwind: "$video",
    },
    {
      $group: {
        _id: "$likedBy",
        video: {
          $push: "$video",
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

  // console.log(likedVideos[0]);

  return res
    .status(200)
    .json(new ApiResponse(200, likedVideos[0], "Liked videos fetched."));
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };

import { isValidObjectId } from 'mongoose';
import { Tweet } from '../models/tweet.model.js';
import { User } from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

const createTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweet } = req.body;

  if (!tweet) {
    throw new ApiError(400, 'Tweet field is mandatory.');
  }

  const newTweet = new Tweet({
    content: tweet.trim(),
    owner: req.user?._id,
  });

  try {
    await newTweet.save();
  } catch {
    throw new ApiError(500, 'Error while uploading tweet.');
  }

  res
    .status(200)
    .json(new ApiResponse(201, newTweet, 'Tweet uploaded successfully.'));
});

const getUserTweets = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(400, 'Invalid User ID.');
  }

  const user = await User.findById(userId).select('_id');

  if (!user) {
    throw new ApiError(404, 'User does not exist.');
  }

  const tweets = await Tweet.find({ owner: userId })
    .sort({ createdAt: -1 })
    .lean();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        tweets,
        tweets.length
          ? 'Tweets fetched successfully.'
          : 'User has not posted any tweets yet.'
      )
    );
});

const updateTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params;
  const tweet = req.body.tweet?.trim();

  if (!tweet) {
    throw new ApiError(400, 'Tweet is mandatory field.');
  }

  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, 'Invalid Tweet ID.');
  }

  const updatedTweet = await Tweet.findOneAndUpdate(
    { _id: tweetId, owner: req.user?._id },
    { content: tweet },
    { new: true, runValidators: true }
  );

  if (!updatedTweet) {
    throw new ApiError(
      404,
      "Tweet not found or you don't have permission to update it."
    );
  }

  res
    .status(200)
    .json(new ApiResponse(200, updatedTweet, 'Tweet updated successfully.'));
});

const deleteTweet = asyncHandler(async (req: Request, res: Response) => {
  const { tweetId } = req.params;

  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, 'Invalid tweet ID.');
  }

  const deletedTweet = await Tweet.findOneAndDelete({
    _id: tweetId,
    owner: req.user?._id,
  });

  if (!deletedTweet) {
    throw new ApiError(
      404,
      "Tweet not found or you don't have permission to delete it."
    );
  }

  res
    .status(200)
    .json(new ApiResponse(200, deletedTweet, 'Tweet deleted successfully.'));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };

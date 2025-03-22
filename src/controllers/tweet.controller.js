import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const createTweet = AsyncHandler(async (req, res) => {

  // Algo:-
  // 1. Extract tweet from req.body
  // 2. Check for condition which will not give errors while DB write
  // 3. Create newTweet (extract userID from req)
  // 4. Write and save to DB
  // 5. Send response

  const { tweet } = req.body;

  // console.log(tweet)

  if (!tweet) {
    throw new ApiError(400, "Tweet field is mandatory.");
  }

  const newTweet = new Tweet({
    content: tweet.trim(),
    owner: req.user._id,
  });

  try {
    await newTweet.save();
  } catch (error) {
    throw new ApiError(500, "Error while uploading tweet.");
  }

  // console.log(newTweet);

  return res
    .status(200)
    .json(new ApiResponse(201, newTweet, "Tweet uploaded successfully."));
});

const getUserTweets = AsyncHandler(async (req, res) => {

  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid User ID.");
  }

  const user = await User.findById(userId).select("_id");

  if (!user) {
    throw new ApiError(404, "User does not exist.");
  }

  const tweets = await Tweet.find({ owner: userId })
    .sort({ createdAt: -1 })
    .lean();

  // console.log(tweets);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        tweets,
        tweets.length
          ? "Tweets fetched successfully."
          : "User has not posted any tweets yet."
      )
    );
});

const updateTweet = AsyncHandler(async (req, res) => {

  const { tweetId } = req.params;
  const tweet = req.body.tweet?.trim();

  if (!tweet) {
    throw new ApiError(400, "Tweet is mandatory field.");
  }

  if (!isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid Tweet ID.");
  }

  const updatedTweet = await Tweet.findOneAndUpdate(
    { _id: tweetId, owner: req.user._id },
    { content: tweet },
    { new: true, runValidators: true }
  );

  if (!updatedTweet) {
    throw new ApiError(
      404,
      "Tweet not found or you don't have permission to update it."
    );
  }

  // console.log(updatedTweet);

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully."));
});

const deleteTweet = AsyncHandler(async (req, res) => {

  const { tweetId } = req.params;

  if (!isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid tweet ID.");
  }

  const deletedTweet = await Tweet.findOneAndDelete({
    _id: tweetId,
    owner: req.user._id,
  });

  if (!deletedTweet) {
    throw new ApiError(
      404,
      "Tweet not found or you don't have permission to delete it."
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, deletedTweet, "Tweet deleted successfully."));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };

import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const createTweet = AsyncHandler(async (req, res) => {
  //TODO: create tweet

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

  await newTweet.save();

  // console.log(newTweet);

  return res
    .status(200)
    .json(new ApiResponse(200, newTweet, "Tweet uploaded successfully."));
});

const getUserTweets = AsyncHandler(async (req, res) => {
  // TODO: get user tweets
});

const updateTweet = AsyncHandler(async (req, res) => {
  //TODO: update tweet
});

const deleteTweet = AsyncHandler(async (req, res) => {
  //TODO: delete tweet
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };

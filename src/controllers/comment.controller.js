import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const getVideoComments = AsyncHandler(async (req, res) => {
  //TODO: get all comments for a video
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;
});

const addComment = AsyncHandler(async (req, res) => {
  // TODO: add a comment to a video

  const { videoId } = req.params;
  const comment = req.body.comment?.trim();

  if (!comment) {
    throw new ApiError(400, "Comment field is mandatory.");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const newComment = new Comment({
    content: comment,
    video: videoId,
    owner: req.user._id,
  });

  let savedComment;

  try {
    savedComment = await newComment.save();
    // console.log(savedComment);
  } catch (error) {
    console.error("Database Write error: ", error);
    throw new ApiError(500, "Failed to add comment.");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, savedComment, "Comment added successfully."));
});

const updateComment = AsyncHandler(async (req, res) => {
  // TODO: update a comment

  const { commentId } = req.params;
  const comment = req.body.comment?.trim();

  if (!comment) {
    throw new ApiError(400, "Comment field is mandatory.");
  }

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }

  const commentExists = await Comment.exists({
    _id: commentId,
    owner: req.user._id,
  });

  if (!commentExists) {
    throw new ApiError(
      404,
      "Comment not found or you don't have permission to update it."
    );
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    { content: comment },
    { new: true, runValidators: true }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedComment, "Comment updated successfully.")
    );
});

const deleteComment = AsyncHandler(async (req, res) => {
  // TODO: delete a comment

  const { commentId } = req.params;

  if (!isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid comment ID.");
  }

  const deletedComment = await Comment.findOneAndDelete({
    _id: commentId,
    owner: req.user._id,
  }).lean();

  if (!deletedComment) {
    throw new ApiError(
      404,
      "Comment not found or you don't have permission to delete it."
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, deletedComment, "Comment deleted successfully.")
    );
});

export { getVideoComments, addComment, updateComment, deleteComment };

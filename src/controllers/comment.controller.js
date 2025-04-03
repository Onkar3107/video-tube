import mongoose, { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const getVideoComments = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  let { page = 1, limit = 10 } = req.query;

  page = parseInt(page, 10);
  limit = parseInt(limit, 10);

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
    throw new ApiError(400, "Page and limit must be positive numbers.");
  }

  const comments = await Comment.aggregate([
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: "$owner" },
    {
      $project: {
        content: 1,
        createdAt: 1,
        updatedAt: 1,
        owner: {
          _id: "$owner._id",
          username: "$owner.username",
          avatar: "$owner.avatar",
        },
      },
    },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ]);

  // Get total comments count
  const totalComments = await Comment.countDocuments({
    video: new mongoose.Types.ObjectId(videoId),
  });

  // Pagination metadata
  const totalPages = Math.ceil(totalComments / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        comments,
        pagination: {
          totalComments,
          totalPages,
          hasNextPage,
          hasPrevPage,
          nextPage: hasNextPage ? page + 1 : null,
          prevPage: hasPrevPage ? page - 1 : null,
        },
      },
      "Comments retrieved successfully."
    )
  );
});

const addComment = AsyncHandler(async (req, res) => {
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

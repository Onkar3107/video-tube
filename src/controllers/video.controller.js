import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const getAllVideos = AsyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
  //TODO: get all videos based on query, sort, pagination
});

const publishAVideo = AsyncHandler(async (req, res) => {
  const { title, description } = req.body;
  // TODO: get video, upload to cloudinary, create video

  if (!title || !description) {
    throw new ApiError(400, "Title and description are required");
  }

  const videoLocalFilePath = req.files?.videoFile[0]?.path;
  const thumbnailLocalFilePath = req.files?.thumbnail[0]?.path;

  if (!videoLocalFilePath || !thumbnailLocalFilePath) {
    throw new ApiError(400, "Video file and thumbnail are required");
  }

  const video = await uploadOnCloudinary(videoLocalFilePath);
  const thumbNail = await uploadOnCloudinary(thumbnailLocalFilePath);

  if (!video || !thumbNail) {
    throw new ApiError(500, "Failed to upload video or thumbnail");
  }

  // console.log(video, thumbNail);

  const newVideo = new Video({
    title,
    description,
    videoFile: video.secure_url,
    thumbnail: thumbNail.secure_url,
    duration: video.duration,
    owner: req.user._id,
  })

  await newVideo.save();

  return res
    .status(201)
    .json(new ApiResponse(201, "Video published successfully", newVideo));

});

const getVideoById = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: get video by id
});

const updateVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: update video details like title, description, thumbnail
});

const deleteVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: delete video
});

const togglePublishStatus = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};

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
    throw new ApiError(400, "Title and Description are mandatory fields.");
  }

  if (!req.files || !req.files.videoFile || !req.files.thumbnail) {
    throw new ApiError(400, "Video File and Thumbnail are mandatory fields.");
  }

  const videoFileLocalPath = req.files.videoFile[0].path;
  const thumbnailLocalPath = req.files.thumbnail[0].path;

  // console.log(videoFileLocalPath, thumbnailLocalPath);

  const video = await uploadOnCloudinary(videoFileLocalPath);
  const thumb = await uploadOnCloudinary(thumbnailLocalPath);

  if (!video || !thumb) {
    throw new ApiError(500, "Error uploading video or thumbnail file.");
  }

  const newVideo = new Video({
    videoFile: video.secure_url,
    thumbnail: thumb.secure_url,
    title,
    description,
    duration: video.duration,
    owner: req.user._id,
  });

  await newVideo.save();

  // console.log(newVideo);

  return res
    .status(200)
    .json(new ApiResponse(200, newVideo, "Video uploaded successfully"));
});

const getVideoById = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const video = await Video.findById(videoId).populate("owner", "username fullName avatar coverImage");

  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully."));
});

const updateVideo = AsyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: update video details like title, description, thumbnail

  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, "Title and Description are mandatory fields.");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, "Video not found.");
  }

  if (req.user._id.toString() !== video.owner.toString()) {
    throw new ApiError(403, "You are not authorized to update this video.");
  }

  if (!req.file) {
    throw new ApiError(400, "Thumbnail is mandatory field.");
  }

  const thumbnailLocalPath = req.file?.path;

  if (!thumbnailLocalPath) {
    throw new ApiError(500, "Error uploading thumbnail file.");
  }

  const thumb = await uploadOnCloudinary(thumbnailLocalPath);

  if (!thumb) {
    throw new ApiError(500, "Error uploading thumbnail file.");
  }

  video.title = title;
  video.description = description;
  video.thumbnail = thumb.secure_url;

  await video.save();

  // TODO: delete old thumbnail from cloudinary

  // console.log(video);

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video updated successfully."));

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

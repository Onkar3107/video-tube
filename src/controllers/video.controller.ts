import { isValidObjectId } from 'mongoose';
import { Video } from '../models/video.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from '../utils/cloudinary.js';
import type { Request, Response } from 'express';

const getAllVideos = asyncHandler(async (_req: Request, _res: Response) => {
  //TODO: get all videos based on query, sort, pagination
});

const publishAVideo = asyncHandler(async (req: Request, res: Response) => {
  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Title and Description are mandatory fields.');
  }

  const files = req.files as any;
  if (!files?.videoFile?.[0]?.path || !files?.thumbnail?.[0]?.path) {
    throw new ApiError(400, 'Video File and Thumbnail are mandatory fields.');
  }

  const videoFileLocalPath = files.videoFile[0].path;
  const thumbnailLocalPath = files.thumbnail[0].path;

  let video: any = null;
  let thumb: any = null;

  try {
    video = await uploadOnCloudinary(videoFileLocalPath);
    if (!video) throw new ApiError(500, 'Error uploading video file.');

    thumb = await uploadOnCloudinary(thumbnailLocalPath);
    if (!thumb) {
      // Rollback: Delete video if thumbnail upload fails
      await deleteFromCloudinary(video.secure_url);
      throw new ApiError(500, 'Error uploading thumbnail file.');
    }

    const newVideo = new Video({
      videoFile: video.secure_url,
      thumbnail: thumb.secure_url,
      title,
      description,
      duration: video.duration,
      owner: req.user?._id,
    });

    await newVideo.save();

    res
      .status(200)
      .json(new ApiResponse(200, newVideo, 'Video uploaded successfully'));
  } catch (error: any) {
    console.error('Error uploading video:', error.message);

    // Cleanup: Delete any successfully uploaded files
    if (video?.secure_url) await deleteFromCloudinary(video.secure_url);
    if (thumb?.secure_url) await deleteFromCloudinary(thumb.secure_url);

    res.status(500).json(new ApiError(500, 'Video upload failed.'));
  }
});

const getVideoById = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const video = await Video.findById(videoId).populate(
    'owner',
    'username fullName avatar coverImage'
  );

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video fetched successfully.'));
});

const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  if (!title || !description) {
    throw new ApiError(400, 'Title and Description are mandatory fields.');
  }

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  const thumbnailToBeDeleted = video.thumbnail;

  if (req.user?._id.toString() !== video.owner.toString()) {
    throw new ApiError(403, 'You are not authorized to update this video.');
  }

  if (!req.file) {
    throw new ApiError(400, 'Thumbnail is mandatory field.');
  }

  const thumbnailLocalPath = req.file?.path;

  if (!thumbnailLocalPath) {
    throw new ApiError(500, 'Error uploading thumbnail file.');
  }

  const thumb = await uploadOnCloudinary(thumbnailLocalPath);

  if (!thumb) {
    throw new ApiError(500, 'Error uploading thumbnail file.');
  }

  video.title = title;
  video.description = description;
  video.thumbnail = thumb.secure_url;

  await video.save();

  await deleteFromCloudinary(thumbnailToBeDeleted);

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video updated successfully.'));
});

const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid Video ID');
  }

  const video = await Video.findByIdAndDelete(videoId);

  if (!video) {
    throw new ApiError(500, 'Unable to delete video. Internal Server Error');
  }

  if (video.videoFile && video.thumbnail) {
    // Delete video and thumbnail from cloudinary
    await deleteFromCloudinary(video.videoFile);
    await deleteFromCloudinary(video.thumbnail);
  }

  res
    .status(200)
    .json(new ApiResponse(200, video, 'Video deleted successfully.'));
});

const togglePublishStatus = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid Video ID');
  }

  const video = await Video.findById(videoId).select('isPublished owner');

  if (!video) {
    throw new ApiError(404, 'Video not found.');
  }

  if (req.user?._id.toString() !== video.owner.toString()) {
    throw new ApiError(403, 'You are not authorized to update this video.');
  }

  const newStatus = !video.isPublished;

  if (video.isPublished === newStatus) {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          video,
          `Video is already ${newStatus ? 'Published' : 'Unpublished'}.`
        )
      );
    return;
  }

  video.isPublished = newStatus;
  await video.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        video,
        `Video ${newStatus ? 'Published' : 'Unpublished'} successfully.`
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};

import { isValidObjectId } from 'mongoose';
import { Playlist } from '../models/playlist.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

const createPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!name?.trim() || !description?.trim()) {
    throw new ApiError(400, 'Name and Description are required fields.');
  }

  const playlist = new Playlist({
    name: name.trim(),
    description: description.trim(),
    owner: req.user?._id,
  });

  try {
    await playlist.save();
  } catch {
    throw new ApiError(500, 'Error while creating playlist');
  }

  res
    .status(201)
    .json(new ApiResponse(201, playlist, 'Playlist created successfully.'));
});

const getUserPlaylists = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId || !isValidObjectId(userId)) {
    throw new ApiError(400, 'Invalid User ID.');
  }

  const playlists = await Playlist.find({ owner: userId }).lean();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        playlists,
        playlists.length < 1
          ? 'User has no playlists.'
          : 'Playlist fetched successfully.'
      )
    );
});

const getPlaylistById = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, 'Invalid playlist ID.');
  }

  const playlist = await Playlist.findById(playlistId).lean();

  if (!playlist) {
    throw new ApiError(404, 'Playlist not found.');
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        playlist,
        playlist.videos.length === 0
          ? 'Playlist fetched successfully but contains no videos.'
          : 'Playlist fetched successfully.'
      )
    );
});

const addVideoToPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, 'Invalid Playlist ID');
  }

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid Video ID');
  }

  const newPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user?._id, videos: { $ne: videoId } },
    { $push: { videos: videoId } },
    { new: true }
  );

  if (!newPlaylist) {
    const playlistExists = await Playlist.findById(playlistId);
    if (!playlistExists) {
      throw new ApiError(404, 'Playlist not found.');
    }
    if (playlistExists.owner.toString() !== req.user?._id.toString()) {
      throw new ApiError(403, 'Unauthorized attempt to add video to playlist.');
    }
    throw new ApiError(400, 'Video is already in the playlist.');
  }

  res
    .status(200)
    .json(new ApiResponse(200, newPlaylist, 'Video added successfully.'));
});

const removeVideoFromPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, 'Invalid playlist ID.');
  }

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, 'Invalid video ID.');
  }

  const updatedPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user?._id, videos: videoId },
    { $pull: { videos: videoId } },
    { new: true }
  );

  if (!updatedPlaylist) {
    const playlistExists = await Playlist.findById(playlistId);
    if (!playlistExists) {
      throw new ApiError(404, 'Playlist not found.');
    }
    if (playlistExists.owner.toString() !== req.user?._id.toString()) {
      throw new ApiError(
        403,
        'Unauthorized attempt to remove video from playlist.'
      );
    }
    throw new ApiError(404, 'Video not found in the playlist.');
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPlaylist,
        'Video removed from playlist successfully.'
      )
    );
});

const deletePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, 'Invalid playlist ID');
  }

  const deletedPlaylist = await Playlist.findOneAndDelete({
    _id: playlistId,
    owner: req.user?._id,
  });

  if (!deletedPlaylist) {
    throw new ApiError(
      404,
      'Playlist not found or unauthorized attempt to delete.'
    );
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, deletedPlaylist, 'Playlist deleted successfully.')
    );
});

const updatePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;

  if (!playlistId || !isValidObjectId(playlistId)) {
    throw new ApiError(400, 'Invalid playlist ID');
  }

  if (!name?.trim() || !description?.trim()) {
    throw new ApiError(400, 'Name and Description are required fields');
  }

  const updatedPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user?._id },
    { name: name.trim(), description: description.trim() },
    { new: true, runValidators: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(
      404,
      'Playlist not found or unauthorized attempt to update.'
    );
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, updatedPlaylist, 'Playlist updated successfully.')
    );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};

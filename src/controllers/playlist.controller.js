import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { AsyncHandler } from "../utils/wrapAsync.js";

const createPlaylist = AsyncHandler(async (req, res) => {
  const { name, description } = req.body;

  //TODO: create playlist

  if (!name || !description) {
    throw new ApiError(400, "Name and Description are required fields.");
  }

  const playlist = new Playlist({
    name: name.trim(),
    description: description.trim(),
    owner: req.user._id,
  });

  try {
    await playlist.save();
  } catch (error) {
    throw new ApiError(500, "Error while creating playlist");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, playlist, "Playlist created successfully."));
});

const getUserPlaylists = AsyncHandler(async (req, res) => {
  const { userId } = req.params;
  //TODO: get user playlists

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid User ID.");
  }

  const playlists = await Playlist.find({ owner: req.user._id });

  if (!playlists) {
    throw new ApiError(400, "Playlist does not exists.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        playlists,
        playlists.length < 1
          ? "This playlists does not contain any videos."
          : "Playlist fetched successfully."
      )
    );
});

const getPlaylistById = AsyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  //TODO: get playlist by id

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }

  const playlist = await Playlist.findById(playlistId).lean();

  if (!playlist) {
    throw new ApiError(400, "This playlist does not exists.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, playlist, "Playlist fetched successfully."));
});

const addVideoToPlaylist = AsyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid Playlist ID");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid Video ID");
  }

  const newPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user._id, videos: { $ne: videoId } },
    { $push: { videos: videoId } },
    { new: true }
  );

  if (!newPlaylist) {
    const playlistExists = await Playlist.findById(playlistId);
    if (!playlistExists) {
      throw new ApiError(404, "Playlist not found.");
    }
    if (playlistExists.owner.toString() !== req.user._id.toString()) {
      throw new ApiError(
        403,
        "You do not have permission to modify this playlist."
      );
    }
    throw new ApiError(400, "Video is already in the playlist.");
  }

  // console.log(newPlaylist);

  return res
    .status(200)
    .json(new ApiResponse(200, newPlaylist, "Video added successfully."));
});

const removeVideoFromPlaylist = AsyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;
  // TODO: remove video from playlist

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID.");
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID.");
  }

  const updatedPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user._id, videos: videoId },
    { $pull: { videos: videoId } },
    { new: true }
  );

  if (!updatedPlaylist) {
    const playlistExists = await Playlist.findById(playlistId);
    if (!playlistExists) {
      throw new ApiError(404, "Playlist not found.");
    }
    if (playlistExists.owner.toString() !== req.user._id.toString()) {
      throw new ApiError(
        403,
        "You do not have permission to modify this playlist."
      );
    }
    throw new ApiError(404, "Video not found in the playlist.");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPlaylist,
        "Video removed from playlist successfully."
      )
    );
});

const deletePlaylist = AsyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  // TODO: delete playlist

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  const deletedPlaylist = await Playlist.findOneAndDelete({
    _id: playlistId,
    owner: req.user._id,
  });

  if (!deletedPlaylist) {
    throw new ApiError(
      404,
      "Playlist not found or you have not permission to delete it."
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, deletedPlaylist, "Playlist deleted successfully.")
    );
});

const updatePlaylist = AsyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;
  //TODO: update playlist

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist ID");
  }

  if (!name || !description) {
    throw new ApiError(400, "Name and Description are required fields");
  }

  const updatedPlaylist = await Playlist.findOneAndUpdate(
    { _id: playlistId, owner: req.user._id },
    { name: name, description: description },
    { new: true, runValidators: true }
  );

  if (!updatedPlaylist) {
    throw new ApiError(
      404,
      "Playlist not found or you don't have permission to update it."
    );
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedPlaylist, "Playlist updated successfully.")
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

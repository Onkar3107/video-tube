import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { playlistService } from './playlist.service.js';
import { ApiError } from '../../utils/ApiError.js';

export const createPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const playlist = await playlistService.createPlaylist(req.user!.id, req.body);
  res.status(201).json(new ApiResponse(201, playlist, 'Playlist created successfully.'));
});

export const getUserPlaylists = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as Record<string, string>;
  if (!userId) throw new ApiError(400, 'Invalid User ID.');

  const playlists = await playlistService.getUserPlaylists(userId);
  res.status(200).json(
    new ApiResponse(
      200,
      playlists,
      playlists.length < 1 ? 'User has no playlists.' : 'Playlists fetched successfully.',
    ),
  );
});

export const getPlaylistById = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;
  if (!playlistId) throw new ApiError(400, 'Invalid playlist ID.');

  const playlist = await playlistService.getPlaylistById(playlistId);
  res.status(200).json(new ApiResponse(200, playlist, 'Playlist fetched successfully.'));
});

export const addVideoToPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params as Record<string, string>;
  if (!playlistId || !videoId) {
    throw new ApiError(400, 'Playlist ID and Video ID are required.');
  }

  await playlistService.addVideoToPlaylist(playlistId, videoId, req.user!.id);
  res.status(200).json(new ApiResponse(200, {}, 'Video added successfully.'));
});

export const removeVideoFromPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params as Record<string, string>;
  if (!playlistId || !videoId) {
    throw new ApiError(400, 'Playlist ID and Video ID are required.');
  }

  await playlistService.removeVideoFromPlaylist(playlistId, videoId, req.user!.id);
  res.status(200).json(new ApiResponse(200, {}, 'Video removed from playlist successfully.'));
});

export const deletePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;
  if (!playlistId) throw new ApiError(400, 'Invalid playlist ID');

  const playlist = await playlistService.deletePlaylist(playlistId, req.user!.id);
  res.status(200).json(new ApiResponse(200, playlist, 'Playlist deleted successfully.'));
});

export const updatePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;
  if (!playlistId) throw new ApiError(400, 'Invalid playlist ID');

  const playlist = await playlistService.updatePlaylist(playlistId, req.user!.id, req.body);
  res.status(200).json(new ApiResponse(200, playlist, 'Playlist updated successfully.'));
});

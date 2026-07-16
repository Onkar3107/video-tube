import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { Request, Response } from 'express';

// ─── Create Playlist ──────────────────────────────────────────────────────────

const createPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body;

  if (!name?.trim() || !description?.trim()) {
    throw new ApiError(400, 'Name and Description are required fields.');
  }

  const playlist = await prisma.playlist.create({
    data: {
      name: name.trim(),
      description: description.trim(),
      ownerId: req.user!.id,
    },
  });

  res.status(201).json(new ApiResponse(201, playlist, 'Playlist created successfully.'));
});

// ─── Get User Playlists ───────────────────────────────────────────────────────

const getUserPlaylists = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as Record<string, string>;

  if (!userId) {
    throw new ApiError(400, 'Invalid User ID.');
  }

  const playlists = await prisma.playlist.findMany({
    where: { ownerId: userId },
    include: {
      videos: {
        include: { video: { select: { id: true, title: true, thumbnail: true } } },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      playlists,
      playlists.length < 1 ? 'User has no playlists.' : 'Playlists fetched successfully.',
    ),
  );
});

// ─── Get Playlist by ID ───────────────────────────────────────────────────────

const getPlaylistById = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;

  if (!playlistId) {
    throw new ApiError(400, 'Invalid playlist ID.');
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      owner: { select: { id: true, username: true, avatar: true } },
      videos: {
        include: {
          video: {
            include: { owner: { select: { username: true, avatar: true } } },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!playlist) {
    throw new ApiError(404, 'Playlist not found.');
  }

  res.status(200).json(
    new ApiResponse(
      200,
      playlist,
      playlist.videos.length === 0
        ? 'Playlist fetched successfully but contains no videos.'
        : 'Playlist fetched successfully.',
    ),
  );
});

// ─── Add Video to Playlist ────────────────────────────────────────────────────

const addVideoToPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params as Record<string, string>;

  if (!playlistId) throw new ApiError(400, 'Invalid Playlist ID');
  if (!videoId) throw new ApiError(400, 'Invalid Video ID');

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) throw new ApiError(404, 'Playlist not found.');
  if (playlist.ownerId !== req.user!.id) throw new ApiError(403, 'Unauthorized attempt to add video to playlist.');

  const existing = await prisma.playlistVideo.findUnique({
    where: { playlistId_videoId: { playlistId, videoId } },
  });
  if (existing) throw new ApiError(400, 'Video is already in the playlist.');

  // Get next position
  const maxPos = await prisma.playlistVideo.aggregate({
    where: { playlistId },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? 0) + 1;

  await prisma.playlistVideo.create({ data: { playlistId, videoId, position } });

  res.status(200).json(new ApiResponse(200, {}, 'Video added successfully.'));
});

// ─── Remove Video from Playlist ───────────────────────────────────────────────

const removeVideoFromPlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId, videoId } = req.params as Record<string, string>;

  if (!playlistId) throw new ApiError(400, 'Invalid playlist ID.');
  if (!videoId) throw new ApiError(400, 'Invalid video ID.');

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) throw new ApiError(404, 'Playlist not found.');
  if (playlist.ownerId !== req.user!.id)
    throw new ApiError(403, 'Unauthorized attempt to remove video from playlist.');

  const existing = await prisma.playlistVideo.findUnique({
    where: { playlistId_videoId: { playlistId, videoId } },
  });
  if (!existing) throw new ApiError(404, 'Video not found in the playlist.');

  await prisma.playlistVideo.delete({ where: { playlistId_videoId: { playlistId, videoId } } });

  res.status(200).json(new ApiResponse(200, {}, 'Video removed from playlist successfully.'));
});

// ─── Delete Playlist ──────────────────────────────────────────────────────────

const deletePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;

  if (!playlistId) {
    throw new ApiError(400, 'Invalid playlist ID');
  }

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) throw new ApiError(404, 'Playlist not found.');
  if (playlist.ownerId !== req.user!.id)
    throw new ApiError(403, 'Unauthorized attempt to delete playlist.');

  await prisma.playlist.delete({ where: { id: playlistId } });

  res.status(200).json(new ApiResponse(200, playlist, 'Playlist deleted successfully.'));
});

// ─── Update Playlist ──────────────────────────────────────────────────────────

const updatePlaylist = asyncHandler(async (req: Request, res: Response) => {
  const { playlistId } = req.params as Record<string, string>;
  const { name, description } = req.body;

  if (!playlistId) throw new ApiError(400, 'Invalid playlist ID');
  if (!name?.trim() || !description?.trim()) throw new ApiError(400, 'Name and Description are required fields');

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist) throw new ApiError(404, 'Playlist not found.');
  if (playlist.ownerId !== req.user!.id)
    throw new ApiError(403, 'Unauthorized attempt to update playlist.');

  const updatedPlaylist = await prisma.playlist.update({
    where: { id: playlistId },
    data: { name: name.trim(), description: description.trim() },
  });

  res.status(200).json(new ApiResponse(200, updatedPlaylist, 'Playlist updated successfully.'));
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

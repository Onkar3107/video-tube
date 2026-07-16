import { PlaylistRepository } from './playlist.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import type { CreatePlaylistDto, UpdatePlaylistDto } from './playlist.dto.js';

const playlistRepository = new PlaylistRepository();

export const playlistService = {
  async createPlaylist(userId: string, dto: CreatePlaylistDto) {
    return playlistRepository.create({
      name: dto.name,
      description: dto.description,
      owner: { connect: { id: userId } },
    });
  },

  async getUserPlaylists(userId: string) {
    return playlistRepository.findManyByOwnerId(userId);
  },

  async getPlaylistById(playlistId: string) {
    const playlist = await playlistRepository.findByIdWithVideos(playlistId);
    if (!playlist) throw new ApiError(404, 'Playlist not found.');
    return playlist;
  },

  async addVideoToPlaylist(playlistId: string, videoId: string, userId: string) {
    const playlist = await playlistRepository.findById(playlistId);
    if (!playlist) throw new ApiError(404, 'Playlist not found.');
    if (playlist.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to modify this playlist.');
    }

    const existing = await playlistRepository.findPlaylistVideo(playlistId, videoId);
    if (existing) throw new ApiError(400, 'Video is already in the playlist.');

    const maxPos = await playlistRepository.getMaxPosition(playlistId);
    const position = maxPos + 1;

    return playlistRepository.addVideo(playlistId, videoId, position);
  },

  async removeVideoFromPlaylist(playlistId: string, videoId: string, userId: string) {
    const playlist = await playlistRepository.findById(playlistId);
    if (!playlist) throw new ApiError(404, 'Playlist not found.');
    if (playlist.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to modify this playlist.');
    }

    const existing = await playlistRepository.findPlaylistVideo(playlistId, videoId);
    if (!existing) throw new ApiError(404, 'Video not found in the playlist.');

    return playlistRepository.removeVideo(playlistId, videoId);
  },

  async deletePlaylist(playlistId: string, userId: string) {
    const playlist = await playlistRepository.findById(playlistId);
    if (!playlist) throw new ApiError(404, 'Playlist not found.');
    if (playlist.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to delete this playlist.');
    }

    return playlistRepository.delete(playlistId);
  },

  async updatePlaylist(playlistId: string, userId: string, dto: UpdatePlaylistDto) {
    const playlist = await playlistRepository.findById(playlistId);
    if (!playlist) throw new ApiError(404, 'Playlist not found.');
    if (playlist.ownerId !== userId) {
      throw new ApiError(403, 'Unauthorized to update this playlist.');
    }

    return playlistRepository.update(playlistId, {
      ...(dto.name && { name: dto.name }),
      ...(dto.description && { description: dto.description }),
    });
  },
};

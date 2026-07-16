import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class PlaylistRepository {
  async findById(id: string) {
    return prisma.playlist.findUnique({ where: { id } });
  }

  async findByIdWithVideos(id: string) {
    return prisma.playlist.findUnique({
      where: { id },
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
  }

  async findManyByOwnerId(ownerId: string) {
    return prisma.playlist.findMany({
      where: { ownerId },
      include: {
        videos: {
          include: { video: { select: { id: true, title: true, thumbnail: true } } },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: Prisma.PlaylistCreateInput) {
    return prisma.playlist.create({ data });
  }

  async update(id: string, data: Prisma.PlaylistUpdateInput) {
    return prisma.playlist.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.playlist.delete({ where: { id } });
  }

  async findPlaylistVideo(playlistId: string, videoId: string) {
    return prisma.playlistVideo.findUnique({
      where: { playlistId_videoId: { playlistId, videoId } },
    });
  }

  async getMaxPosition(playlistId: string) {
    const aggregateResult = await prisma.playlistVideo.aggregate({
      where: { playlistId },
      _max: { position: true },
    });
    return aggregateResult._max.position ?? 0;
  }

  async addVideo(playlistId: string, videoId: string, position: number) {
    return prisma.playlistVideo.create({
      data: { playlistId, videoId, position },
    });
  }

  async removeVideo(playlistId: string, videoId: string) {
    return prisma.playlistVideo.delete({
      where: { playlistId_videoId: { playlistId, videoId } },
    });
  }
}

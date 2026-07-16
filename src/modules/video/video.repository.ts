import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class VideoRepository {
  async findById(id: string) {
    return prisma.video.findUnique({
      where: { id },
    });
  }

  async findByIdWithOwner(id: string) {
    return prisma.video.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, username: true, fullName: true, avatar: true, coverImage: true } },
      },
    });
  }

  async create(data: Prisma.VideoCreateInput) {
    return prisma.video.create({ data });
  }

  async update(id: string, data: Prisma.VideoUpdateInput) {
    return prisma.video.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.video.delete({ where: { id } });
  }

  async incrementViews(id: string) {
    return prisma.video.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  async recordWatchHistory(userId: string, videoId: string) {
    return prisma.watchHistory.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: { watchedAt: new Date() },
    });
  }

  async findManyAndCount(params: {
    where: Prisma.VideoWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.VideoOrderByWithRelationInput;
  }) {
    return Promise.all([
      prisma.video.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: {
          owner: { select: { id: true, username: true, avatar: true, fullName: true } },
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.video.count({ where: params.where }),
    ]);
  }
}

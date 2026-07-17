import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class UserRepository {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByIdSafe(id: string) {
    return prisma.user.findUnique({
      where: { id },
      omit: { password: true, refreshToken: true },
    });
  }

  async findByEmailOrUsername(email: string, username: string) {
    return prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
  }

  async findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        // Use _count instead of loading all subscriber records into memory
        _count: {
          select: { subscribers: true, subscriptions: true },
        },
      },
      omit: { password: true, refreshToken: true },
    });
  }

  async isSubscribed(subscriberId: string, channelId: string): Promise<boolean> {
    const count = await prisma.subscription.count({
      where: { subscriberId, channelId },
    });
    return count > 0;
  }

  async existsById(id: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { id } });
    return count > 0;
  }

  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async getWatchHistory(userId: string) {
    return prisma.watchHistory.findMany({
      where: { userId },
      include: {
        video: {
          include: { owner: { select: { username: true, avatar: true } } },
        },
      },
      orderBy: { watchedAt: 'desc' },
    });
  }
}

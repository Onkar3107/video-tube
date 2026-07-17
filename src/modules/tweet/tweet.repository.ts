import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class TweetRepository {
  async findById(id: string) {
    return prisma.tweet.findUnique({ where: { id } });
  }

  async findManyByOwnerId(ownerId: string) {
    return prisma.tweet.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: Prisma.TweetCreateInput) {
    return prisma.tweet.create({ data });
  }

  async update(id: string, data: Prisma.TweetUpdateInput) {
    return prisma.tweet.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.tweet.delete({ where: { id } });
  }
}

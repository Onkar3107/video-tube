import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class CommentRepository {
  async findById(id: string) {
    return prisma.comment.findUnique({ where: { id } });
  }

  async create(data: Prisma.CommentCreateInput) {
    return prisma.comment.create({
      data,
      include: { owner: { select: { id: true, username: true, avatar: true } } },
    });
  }

  async update(id: string, data: Prisma.CommentUpdateInput) {
    return prisma.comment.update({ where: { id }, data });
  }

  async delete(id: string) {
    return prisma.comment.delete({ where: { id } });
  }

  async findManyAndCount(params: {
    where: Prisma.CommentWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.CommentOrderByWithRelationInput;
  }) {
    return Promise.all([
      prisma.comment.findMany({
        where: params.where,
        skip: params.skip,
        take: params.take,
        orderBy: params.orderBy,
        include: {
          owner: { select: { id: true, username: true, avatar: true } },
        },
      }),
      prisma.comment.count({ where: params.where }),
    ]);
  }
}

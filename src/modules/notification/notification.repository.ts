import { prisma } from '../../config/database.js';

export class NotificationRepository {
  async findByUser(userId: string, page: number, limit: number) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async countByUser(userId: string) {
    return prisma.notification.count({ where: { userId } });
  }

  async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}

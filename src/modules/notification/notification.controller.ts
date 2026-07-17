import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { NotificationRepository } from './notification.repository.js';

const repo = new NotificationRepository();

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query['page'] as string ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string ?? '20', 10)));
  const userId = req.user!.id;

  const [notifications, total, unreadCount] = await Promise.all([
    repo.findByUser(userId, page, limit),
    repo.countByUser(userId),
    repo.countUnread(userId),
  ]);

  res.status(200).json(new ApiResponse(200, {
    notifications,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
      hasNextPage: page < Math.ceil(total / limit),
    },
    unreadCount,
  }, 'Notifications fetched'));
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  await repo.markAsRead(id, req.user!.id);
  res.status(200).json(new ApiResponse(200, {}, 'Notification marked as read'));
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await repo.markAllAsRead(req.user!.id);
  res.status(200).json(new ApiResponse(200, { updated: result.count }, 'All notifications marked as read'));
});

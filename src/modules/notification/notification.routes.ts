import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './notification.controller.js';

const router = Router();

router.get('/', verifyJWT, getNotifications);
router.patch('/read-all', verifyJWT, markAllNotificationsRead);
router.patch('/:id/read', verifyJWT, markNotificationRead);

export default router;

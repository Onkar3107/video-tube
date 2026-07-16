import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import * as subscriptionController from './subscription.controller.js';

const router = Router();

router.use(verifyJWT);

router.post('/c/:channelId', subscriptionController.toggleSubscription);
router.get('/c/:channelId', subscriptionController.getUserChannelSubscribers);
router.get('/u/:subscriberId', subscriptionController.getSubscribedChannels);

export default router;

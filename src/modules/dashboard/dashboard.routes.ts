import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import * as dashboardController from './dashboard.controller.js';

const router = Router();

router.use(verifyJWT);

router.get('/stats', dashboardController.getChannelStats);
router.get('/videos', dashboardController.getChannelVideos);

export default router;

import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import * as likeController from './like.controller.js';

const router = Router();

router.use(verifyJWT);

router.post('/toggle/v/:videoId', likeController.toggleVideoLike);
router.post('/toggle/c/:commentId', likeController.toggleCommentLike);
router.post('/toggle/t/:tweetId', likeController.toggleTweetLike);
router.get('/videos', likeController.getLikedVideos);

export default router;

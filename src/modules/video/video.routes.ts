import { Router } from 'express';
import { upload } from '../../middlewares/multer.middleware.js';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { PublishVideoSchema, UpdateVideoSchema, GetVideosSchema } from './video.dto.js';
import * as videoController from './video.controller.js';
import { publicLimiter, globalLimiter } from '../../middlewares/rateLimit.middleware.js';

const router = Router();

router.get('/', publicLimiter, validateQuery(GetVideosSchema), videoController.getAllVideos);
router.post(
  '/',
  globalLimiter,
  verifyJWT,
  upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  validate(PublishVideoSchema),
  videoController.publishAVideo,
);
router.get('/:videoId', publicLimiter, videoController.getVideoById);
router.patch('/:videoId', globalLimiter, verifyJWT, upload.single('thumbnail'), validate(UpdateVideoSchema), videoController.updateVideo);
router.delete('/:videoId', globalLimiter, verifyJWT, videoController.deleteVideo);
router.patch('/toggle/publish/:videoId', globalLimiter, verifyJWT, videoController.togglePublishStatus);

export default router;

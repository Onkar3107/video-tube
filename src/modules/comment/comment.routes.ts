import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { AddCommentSchema, UpdateCommentSchema, GetCommentsSchema } from './comment.dto.js';
import * as commentController from './comment.controller.js';

const router = Router();

router.get('/:videoId', validateQuery(GetCommentsSchema), commentController.getVideoComments);
router.post('/:videoId', verifyJWT, validate(AddCommentSchema), commentController.addComment);
router.patch('/:commentId', verifyJWT, validate(UpdateCommentSchema), commentController.updateComment);
router.delete('/:commentId', verifyJWT, commentController.deleteComment);

export default router;

import { Router } from 'express';
import { upload } from '../../middlewares/multer.middleware.js';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RegisterUserSchema, LoginUserSchema, ChangePasswordSchema, UpdateProfileSchema } from './user.dto.js';
import * as userController from './user.controller.js';

const router = Router();

router.post(
  '/register',
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ]),
  validate(RegisterUserSchema),
  userController.registerUser,
);
router.post('/login', validate(LoginUserSchema), userController.loginUser);
router.post('/logout', verifyJWT, userController.logoutUser);
router.post('/refresh-token', userController.refreshAccessToken);
router.post('/change-password', verifyJWT, validate(ChangePasswordSchema), userController.changeCurrentPassword);
router.get('/current-user', verifyJWT, userController.getCurrentUser);
router.patch('/update-account', verifyJWT, validate(UpdateProfileSchema), userController.updateUserProfile);
router.patch('/avatar', verifyJWT, upload.single('avatar'), userController.updateAvatar);
router.patch('/cover-image', verifyJWT, upload.single('coverImage'), userController.updateCoverImage);
router.get('/c/:username', verifyJWT, userController.getUserChannelProfile);
router.get('/history', verifyJWT, userController.getWatchHistory);

export default router;

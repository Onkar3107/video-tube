import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { CreatePlaylistSchema, UpdatePlaylistSchema } from './playlist.dto.js';
import * as playlistController from './playlist.controller.js';

const router = Router();

router.use(verifyJWT);

router.post('/', validate(CreatePlaylistSchema), playlistController.createPlaylist);
router.get('/user/:userId', playlistController.getUserPlaylists);
router.get('/:playlistId', playlistController.getPlaylistById);
router.post('/add/:playlistId/:videoId', playlistController.addVideoToPlaylist);
router.post('/remove/:playlistId/:videoId', playlistController.removeVideoFromPlaylist);
router.delete('/:playlistId', playlistController.deletePlaylist);
router.patch('/:playlistId', validate(UpdatePlaylistSchema), playlistController.updatePlaylist);

export default router;

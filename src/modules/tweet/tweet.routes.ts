import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { CreateTweetSchema, UpdateTweetSchema } from './tweet.dto.js';
import * as tweetController from './tweet.controller.js';

const router = Router();

router.use(verifyJWT);

router.post('/', validate(CreateTweetSchema), tweetController.createTweet);
router.get('/user/:userId', tweetController.getUserTweets);
router.patch('/:tweetId', validate(UpdateTweetSchema), tweetController.updateTweet);
router.delete('/:tweetId', tweetController.deleteTweet);

export default router;

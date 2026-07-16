import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middlewares/error.middleware.js';

import userRouter from './modules/user/user.routes.js';
import videoRouter from './modules/video/video.routes.js';
import commentRouter from './modules/comment/comment.routes.js';
import likeRouter from './modules/like/like.routes.js';
import subscriptionRouter from './modules/subscription/subscription.routes.js';
import tweetRouter from './modules/tweet/tweet.routes.js';
import playlistRouter from './modules/playlist/playlist.routes.js';
import dashboardRouter from './modules/dashboard/dashboard.routes.js';

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: '16kb',
  }),
);

app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));
app.use(cookieParser());

// Health check
app.get('/api/v1/health-check', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

// Module routes
app.use('/api/v1/users', userRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/tweets', tweetRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// Centralized error handler — must be last
app.use(errorHandler);

export { app };

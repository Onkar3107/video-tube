import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { createAndLoginUser, createTestUser } from '../helpers/auth.helper.js';

describe('Likes Integration Tests', () => {
  describe('POST /api/v1/likes/toggle/v/:videoId', () => {
    it('toggles video like on and off', async () => {
      const user = await createAndLoginUser();
      const video = await prisma.video.create({
        data: {
          title: 'Like Video',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video.mp4',
          thumbnail: 'https://cloudinary.com/thumb.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      // 1. Toggle like ON
      const res1 = await request(app)
        .post(`/api/v1/likes/toggle/v/${video.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.liked).toBe(true);
      expect(res1.body.data.likeCount).toBe(1);

      // 2. Toggle like OFF
      const res2 = await request(app)
        .post(`/api/v1/likes/toggle/v/${video.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.liked).toBe(false);
      expect(res2.body.data.likeCount).toBe(0);
    });
  });

  describe('GET /api/v1/likes/videos', () => {
    it('returns list of videos liked by authenticated user', async () => {
      const user = await createAndLoginUser();
      const video = await prisma.video.create({
        data: {
          title: 'Liked Video List',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video.mp4',
          thumbnail: 'https://cloudinary.com/thumb.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      await prisma.like.create({
        data: {
          videoId: video.id,
          likedById: user.id,
        },
      });

      const res = await request(app)
        .get('/api/v1/likes/videos')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.videos).toHaveLength(1);
      expect(res.body.data.videos[0].id).toBe(video.id);
    });
  });
});

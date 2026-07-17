import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { createAndLoginUser, createTestUser } from '../helpers/auth.helper.js';

describe('Comments Integration Tests', () => {
  describe('POST /api/v1/comments/:videoId', () => {
    it('returns 201 with the created comment', async () => {
      const user = await createAndLoginUser();
      const video = await prisma.video.create({
        data: {
          title: 'Comment Video',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video.mp4',
          thumbnail: 'https://cloudinary.com/thumb.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      const res = await request(app)
        .post(`/api/v1/comments/${video.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ comment: 'Test Comment!' });

      expect(res.status).toBe(201);
      expect(res.body.data.content).toBe('Test Comment!');
      expect(res.body.data.ownerId).toBe(user.id);
    });

    it('returns 422 if content is empty', async () => {
      const user = await createAndLoginUser();
      const res = await request(app)
        .post('/api/v1/comments/some-video')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ comment: '' });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/comments/:videoId', () => {
    it('returns 200 with paginated comments list for a video', async () => {
      const user = await createTestUser();
      const video = await prisma.video.create({
        data: {
          title: 'List Comments Video',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video.mp4',
          thumbnail: 'https://cloudinary.com/thumb.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      await prisma.comment.create({
        data: {
          content: 'Comment A',
          videoId: video.id,
          ownerId: user.id,
        },
      });

      const res = await request(app).get(`/api/v1/comments/${video.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.comments).toHaveLength(1);
      expect(res.body.data.comments[0].content).toBe('Comment A');
      expect(res.body.data.comments[0].owner.username).toBe(user.username);
    });
  });
});

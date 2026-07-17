import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { createAndLoginUser, createTestUser } from '../helpers/auth.helper.js';

describe('Videos Integration Tests', () => {
  describe('POST /api/v1/videos', () => {
    it('returns 202 and enqueues background processing on valid inputs', async () => {
      const user = await createAndLoginUser();
      const res = await request(app)
        .post('/api/v1/videos')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('title', 'Integrated test title')
        .field('description', 'Integrated test description')
        .attach('videoFile', Buffer.from('fake-video'), {
          filename: 'video.mp4',
          contentType: 'video/mp4',
        })
        .attach('thumbnail', Buffer.from('fake-thumb'), {
          filename: 'thumb.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(202);
      expect(res.body.data).toHaveProperty('videoId');
      expect(res.body.data).toHaveProperty('status', 'UPLOADING');

      // Check DB record
      const videoInDb = await prisma.video.findUnique({
        where: { id: res.body.data.videoId },
      });
      expect(videoInDb).toBeDefined();
      expect(videoInDb?.status).toBe('UPLOADING');
    });

    it('returns 422 if title is missing', async () => {
      const user = await createAndLoginUser();
      const res = await request(app)
        .post('/api/v1/videos')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .field('description', 'Test desc')
        .attach('videoFile', Buffer.from('fake-video'), 'video.mp4')
        .attach('thumbnail', Buffer.from('fake-thumb'), 'thumb.jpg');

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/videos', () => {
    it('returns 200 with paginated videos list', async () => {
      const user = await createTestUser();
      // Insert mock video directly in DB in READY state
      await prisma.video.create({
        data: {
          title: 'Awesome Video 1',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video1.mp4',
          thumbnail: 'https://cloudinary.com/thumb1.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      const res = await request(app).get('/api/v1/videos');

      expect(res.status).toBe(200);
      expect(res.body.data.videos).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/videos/:videoId', () => {
    it('returns 200 and fetches video with owner data', async () => {
      const user = await createTestUser();
      const video = await prisma.video.create({
        data: {
          title: 'Awesome Video 2',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video2.mp4',
          thumbnail: 'https://cloudinary.com/thumb2.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      const res = await request(app).get(`/api/v1/videos/${video.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe(video.title);
      expect(res.body.data.owner.id).toBe(user.id);
    });

    it('returns 404 for invalid/non-existent video ID', async () => {
      const res = await request(app).get('/api/v1/videos/nonexistent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/videos/toggle/publish/:videoId', () => {
    it('returns 200 and updates isPublished flag', async () => {
      const user = await createAndLoginUser();
      const video = await prisma.video.create({
        data: {
          title: 'Publish Video',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video3.mp4',
          thumbnail: 'https://cloudinary.com/thumb3.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
        },
      });

      const res = await request(app)
        .patch(`/api/v1/videos/toggle/publish/${video.id}`)
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isPublished).toBe(false);
    });
  });
});

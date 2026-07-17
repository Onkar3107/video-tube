import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { createAndLoginUser } from '../helpers/auth.helper.js';

describe('Dashboard Integration Tests', () => {
  describe('GET /api/v1/dashboard/stats', () => {
    it('returns stats for authenticated channel owner', async () => {
      const user = await createAndLoginUser();
      // Create mock video views and subscription
      await prisma.video.create({
        data: {
          title: 'Dashboard Video',
          description: 'A great video',
          videoFile: 'https://cloudinary.com/video.mp4',
          thumbnail: 'https://cloudinary.com/thumb.jpg',
          ownerId: user.id,
          isPublished: true,
          status: 'READY',
          views: 15,
        },
      });

      const res = await request(app)
        .get('/api/v1/dashboard/stats')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalVideos', 1);
      expect(res.body.data).toHaveProperty('totalViews', 15);
      expect(res.body.data).toHaveProperty('totalSubscribers');
      expect(res.body.data).toHaveProperty('totalLikes');
    });
  });
});

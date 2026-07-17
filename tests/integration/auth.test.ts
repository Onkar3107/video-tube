import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { createTestUser, createAndLoginUser } from '../helpers/auth.helper.js';

describe('Auth Integration Tests', () => {
  describe('POST /api/v1/users/register', () => {
    it('returns 201 with created safe user details on valid inputs', async () => {
      const payload = {
        username: `test_reg_${Date.now()}`,
        email: `test_reg_${Date.now()}@test.com`,
        password: 'Password123!',
        fullName: 'Registration Test',
      };

      const res = await request(app)
        .post('/api/v1/users/register')
        .field('username', payload.username)
        .field('email', payload.email)
        .field('password', payload.password)
        .field('fullName', payload.fullName)
        .attach('avatar', Buffer.from('fake-avatar'), {
          filename: 'avatar.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).toHaveProperty('username', payload.username);
    });

    it('returns 409 Conflict if email is already taken', async () => {
      const existing = await createTestUser();
      const payload = {
        username: `unique_user_${Date.now()}`,
        email: existing.email,
        password: 'Password123!',
        fullName: 'Conflict Test',
      };

      const res = await request(app)
        .post('/api/v1/users/register')
        .field('username', payload.username)
        .field('email', payload.email)
        .field('password', payload.password)
        .field('fullName', payload.fullName)
        .attach('avatar', Buffer.from('fake-avatar'), {
          filename: 'avatar.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/v1/users/login', () => {
    it('returns 200 with tokens and safe user object on valid email/password login', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user).not.toHaveProperty('password');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('returns 401 for incorrect password attempts', async () => {
      const user = await createTestUser();
      const res = await request(app)
        .post('/api/v1/users/login')
        .send({ email: user.email, password: 'WrongPassword123' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/users/logout', () => {
    it('returns 200, clears cookies, and resets refreshToken in DB for authenticated user', async () => {
      const user = await createAndLoginUser();
      const res = await request(app)
        .post('/api/v1/users/logout')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      const userInDb = await prisma.user.findUnique({ where: { id: user.id } });
      expect(userInDb?.refreshToken).toBeNull();
    });

    it('returns 401 Unauthorized for unauthenticated logout request', async () => {
      const res = await request(app).post('/api/v1/users/logout');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/users/current-user', () => {
    it('returns 200 and fetches current logged-in user details', async () => {
      const user = await createAndLoginUser();
      const res = await request(app)
        .get('/api/v1/users/current-user')
        .set('Authorization', `Bearer ${user.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id', user.id);
      expect(res.body.data).toHaveProperty('email', user.email);
    });
  });
});

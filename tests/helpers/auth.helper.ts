import request from 'supertest';
import bcrypt from 'bcrypt';
import { prisma } from '../../src/config/database.js';
import { app } from '../../src/app.js';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password?: string;
  fullName: string;
  avatar: string;
  accessToken?: string;
}

export async function createTestUser(overrides: Partial<TestUser> = {}): Promise<TestUser> {
  const plain = overrides.password ?? 'Password123!';
  const hashed = await bcrypt.hash(plain, 10);

  const user = await prisma.user.create({
    data: {
      username: overrides.username ?? `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      email: overrides.email ?? `user_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
      password: hashed,
      fullName: overrides.fullName ?? 'Test User',
      avatar: overrides.avatar ?? 'https://example.com/avatar.jpg',
    },
  });

  return { ...user, password: plain };
}

export async function loginTestUser(user: TestUser): Promise<string> {
  const res = await request(app)
    .post('/api/v1/users/login')
    .send({ email: user.email, password: user.password });

  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.body.message}`);
  }
  return res.body.data.accessToken as string;
}

export async function createAndLoginUser(overrides: Partial<TestUser> = {}): Promise<TestUser & { accessToken: string }> {
  const user = await createTestUser(overrides);
  const token = await loginTestUser(user);
  return { ...user, accessToken: token };
}

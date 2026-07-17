import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../../src/utils/ApiError.js';

// Mock Prisma, Cloudinary, and bcrypt before importing service
vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/utils/cloudinary.js', () => ({
  uploadOnCloudinary: vi.fn(),
  deleteFromCloudinary: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

import { userService } from '../../../src/modules/user/user.service.js';
import { prisma } from '../../../src/config/database.js';
import { uploadOnCloudinary } from '../../../src/utils/cloudinary.js';
import bcrypt from 'bcrypt';

const mockPrisma = prisma as unknown as ReturnType<typeof mockDeep<PrismaClient>>;

beforeEach(() => {
  mockReset(mockPrisma);
  vi.clearAllMocks();
});

describe('UserService.register', () => {
  it('throws 409 if username already exists', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'existing' } as any);
    await expect(
      userService.register({ username: 'taken', email: 'a@b.com', password: 'pass12345', fullName: 'A' }, {}),
    ).rejects.toThrow(ApiError);
  });

  it('throws 400 if avatar file is missing', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(
      userService.register({ username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' }, {}),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Avatar file is required' });
  });

  it('throws 500 if Cloudinary upload fails', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(uploadOnCloudinary).mockResolvedValue(null);
    await expect(
      userService.register(
        { username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' },
        { avatar: [{ path: '/tmp/avatar.jpg' }] } as any,
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it('creates user and returns safe user without password or refreshToken', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    vi.mocked(uploadOnCloudinary).mockResolvedValue({
      secure_url: 'https://cdn.com/avatar.jpg',
      public_id: 'avatar123',
    } as any);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: 'user1', username: 'newuser', email: 'new@b.com',
      fullName: 'New', avatar: 'https://cdn.com/avatar.jpg',
      password: 'hashed', refreshToken: null, coverImage: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(bcrypt.hash).mockResolvedValue('hashed' as any);

    const result = await userService.register(
      { username: 'newuser', email: 'new@b.com', password: 'pass12345', fullName: 'New' },
      { avatar: [{ path: '/tmp/avatar.jpg' }] } as any,
    );

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('refreshToken');
    expect(result).toHaveProperty('avatar', 'https://cdn.com/avatar.jpg');
  });
});

describe('UserService.login', () => {
  it('throws 404 if user does not exist', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(
      userService.login({ email: 'noone@b.com', password: 'pass12345' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 401 for wrong password', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
    await expect(
      userService.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns accessToken and refreshToken on success', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'u1', email: 'a@b.com', username: 'alice', fullName: 'Alice', password: 'hashed',
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const result = await userService.login({ email: 'a@b.com', password: 'correct' });
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).not.toHaveProperty('password');
  });
});

describe('UserService.changePassword', () => {
  it('throws 401 if current password is incorrect', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as any);
    await expect(
      userService.changePassword('u1', { currentPassword: 'wrong', newPassword: 'newpass123' }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('updates password hash on success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', password: 'hashed' } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as any);
    vi.mocked(bcrypt.hash).mockResolvedValue('newHashed' as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    await userService.changePassword('u1', { currentPassword: 'current', newPassword: 'newPass123' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password: 'newHashed' },
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
  },
  CacheKeys: {
    session: (id: string) => `session:${id}`,
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn(),
  },
}));

import { verifyJWT } from '../../../src/middlewares/auth.middleware.js';
import { prisma } from '../../../src/config/database.js';
import { cache } from '../../../src/utils/cache.js';
import jwt from 'jsonwebtoken';

const mockReq = () => {
  const req = {
    cookies: {},
    headers: {},
    header: vi.fn(),
  } as unknown as Request;

  vi.mocked(req.header).mockImplementation((name: string) => {
    const key = name.toLowerCase();
    if (key === 'authorization') {
      return (req.headers as any)['authorization'] || (req.headers as any)['Authorization'];
    }
    return undefined;
  });

  return req;
};

const mockRes = () => ({} as Response);
const mockNext = vi.fn() as unknown as NextFunction;

// Helper to yield execution to allow asyncHandler's promises to resolve/reject
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyJWT', () => {
  it('calls next(ApiError 401) when no token is present', async () => {
    const req = mockReq();
    await verifyJWT(req, mockRes(), mockNext);
    await flushPromises();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('calls next(ApiError 401) if jwt verification fails', async () => {
    const req = mockReq();
    req.cookies = { accessToken: 'invalid-token' };
    vi.mocked(jwt.verify).mockImplementation(() => { throw new Error('jwt malformed'); });

    await verifyJWT(req, mockRes(), mockNext);
    await flushPromises();
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls next(ApiError 401) if user not found in session cache and DB', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(jwt.verify).mockReturnValue({ id: 'u1' } as any);

    const req = mockReq();
    req.headers = { authorization: 'Bearer token123' };

    await verifyJWT(req, mockRes(), mockNext);
    await flushPromises();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('attaches req.user from DB on cache miss and sets cache', async () => {
    const mockUser = { id: 'u1', username: 'bob', email: 'b@b.com' };
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(jwt.verify).mockReturnValue({ id: 'u1' } as any);

    const req = mockReq();
    req.headers = { authorization: 'Bearer token123' };

    await verifyJWT(req, mockRes(), mockNext);
    await flushPromises();

    expect(req.user).toMatchObject({ id: 'u1', username: 'bob' });
    expect(cache.set).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('attaches req.user from session cache hit without querying DB', async () => {
    const cachedUser = { id: 'u1', username: 'bob_cached', email: 'b@b.com' };
    vi.mocked(cache.get).mockResolvedValue(cachedUser);
    vi.mocked(jwt.verify).mockReturnValue({ id: 'u1' } as any);

    const req = mockReq();
    req.headers = { authorization: 'Bearer token123' };

    await verifyJWT(req, mockRes(), mockNext);
    await flushPromises();

    expect(req.user).toMatchObject({ id: 'u1', username: 'bob_cached' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith();
  });
});

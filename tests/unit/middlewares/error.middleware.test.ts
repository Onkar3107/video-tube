import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../../../src/middlewares/error.middleware.js';
import { ApiError } from '../../../src/utils/ApiError.js';

const mockReq = () => ({} as Request);
const mockRes = () => {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};
const mockNext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  process.env['NODE_ENV'] = 'test';
});

describe('errorHandler middleware', () => {
  it('returns exact details for ApiError instances', () => {
    const err = new ApiError(403, 'Forbidden action');
    const res = mockRes();
    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Forbidden action',
      success: false,
    }));
  });

  it('formats ZodError to 422 with validation errors map', () => {
    const zodErr = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['username'], message: 'Required' },
    ]);
    const res = mockRes();
    errorHandler(zodErr, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Validation failed',
      errors: expect.objectContaining({ username: expect.any(Array) }),
    }));
  });

  it('handles Prisma unique constraint P2002 error as 409 Conflict', () => {
    const prismaErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.0.0', meta: { target: ['email'] } },
    );
    const res = mockRes();
    errorHandler(prismaErr, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Resource already exists',
      success: false,
    }));
  });

  it('formats general Error in production without stack details', () => {
    process.env['NODE_ENV'] = 'production';
    const err = new Error('Internal DB failure');
    const res = mockRes();
    errorHandler(err, mockReq(), res, mockNext);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Internal server error',
      success: false,
    }));
    expect(res.json).not.toHaveProperty('stack');
  });
});

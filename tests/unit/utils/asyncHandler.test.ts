import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../../src/utils/asyncHandler.js';

const mockReq = () => ({} as Request);
const mockRes = () => ({} as Response);
const mockNext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('asyncHandler utility', () => {
  it('forwards exceptions to Express next handler on Promise rejection', async () => {
    const customError = new Error('Database down');
    const controller = asyncHandler(async () => {
      throw customError;
    });

    await controller(mockReq(), mockRes(), mockNext);

    expect(mockNext).toHaveBeenCalledWith(customError);
  });

  it('completes normally without calling next on successful resolution', async () => {
    const mockJson = vi.fn();
    const res = { json: mockJson } as unknown as Response;
    const controller = asyncHandler(async (_req, response) => {
      response.json({ ok: true });
    });

    await controller(mockReq(), res, mockNext);

    expect(mockJson).toHaveBeenCalledWith({ ok: true });
    expect(mockNext).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../../../src/middlewares/validate.middleware.js';

const mockNext = vi.fn();

describe('validate middleware', () => {
  it('calls next() and modifies request body for valid schema matches', () => {
    const schema = z.object({
      name: z.string().trim(),
    });
    const middleware = validate(schema);
    const req = { body: { name: '  Alice  ', extra: 'ignored' } } as Request;

    middleware(req, {} as Response, mockNext);

    expect(req.body).toEqual({ name: 'Alice' });
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('passes error to next() on schema validation failures', () => {
    const schema = z.object({
      email: z.string().email(),
    });
    const middleware = validate(schema);
    const req = { body: { email: 'bad-email' } } as Request;

    middleware(req, {} as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 422,
      message: 'Validation failed',
    }));
  });
});

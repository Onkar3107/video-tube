import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export const validate =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errorMessages = Object.values(fieldErrors)
        .flat()
        .filter((msg): msg is string => typeof msg === 'string');
      next(new ApiError(422, 'Validation failed', errorMessages));
      return;
    }
    req.body = result.data;
    next();
  };

export const validateQuery =
  <T>(schema: ZodSchema<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      const errorMessages = Object.values(fieldErrors)
        .flat()
        .filter((msg): msg is string => typeof msg === 'string');
      next(new ApiError(422, 'Validation failed', errorMessages));
      return;
    }
    req.query = result.data as any;
    next();
  };

import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { Prisma } from '@prisma/client';
import jsonwebtoken from 'jsonwebtoken';
import { ZodError } from 'zod';
import { MulterError } from 'multer';

const { TokenExpiredError, JsonWebTokenError } = jsonwebtoken;

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // ── ApiError (application-level known errors) ──────────────────────────────
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
    return;
  }

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // ── Prisma known request errors ───────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        res.status(409).json({
          success: false,
          message: 'Resource already exists',
          errors: [`Unique constraint violation on field(s): ${(err.meta?.target as string[])?.join(', ')}`],
        });
        return;
      case 'P2025':
        res.status(404).json({
          success: false,
          message: 'Resource not found',
          errors: [],
        });
        return;
      case 'P2003':
        res.status(400).json({
          success: false,
          message: 'Referenced resource does not exist',
          errors: [],
        });
        return;
    }
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err instanceof TokenExpiredError) {
    res.status(401).json({ success: false, message: 'Token expired', errors: [] });
    return;
  }
  if (err instanceof JsonWebTokenError) {
    res.status(401).json({ success: false, message: 'Invalid token', errors: [] });
    return;
  }

  // ── Multer file upload errors ─────────────────────────────────────────────
  if (err instanceof MulterError) {
    res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
      errors: [],
    });
    return;
  }

  // ── Unknown errors — never leak internals in production ───────────────────
  const isDev = process.env.NODE_ENV !== 'production';
  const message = isDev && err instanceof Error ? err.message : 'Internal server error';
  const stack = isDev && err instanceof Error ? err.stack : undefined;

  res.status(500).json({
    success: false,
    message,
    ...(stack && { stack }),
    errors: [],
  });
};

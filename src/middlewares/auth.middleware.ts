import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { cache, CacheKeys } from '../utils/cache.js';

interface JwtPayload {
  id: string;
}

// Cache TTL for user session — short enough to reflect bans/deletions promptly
const USER_SESSION_TTL = 5 * 60; // 5 minutes

export const verifyJWT = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.cookies?.accessToken ||
      req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new ApiError(401, 'Unauthorized access');
    }

    const decodedToken = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as string,
    ) as JwtPayload;

    // 1. Check Redis cache first — avoids a DB hit on every authenticated request
    const cacheKey = CacheKeys.session(decodedToken.id);
    const cached = await cache.get<any>(cacheKey);

    if (cached) {
      req.user = cached;
      return next();
    }

    // 2. Cache miss — fetch from DB and populate cache
    const user = await prisma.user.findUnique({
      where: { id: decodedToken.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatar: true,
      },
    });

    if (!user) {
      throw new ApiError(401, 'Invalid access Token');
    }

    // 3. Store in cache for subsequent requests
    await cache.set(cacheKey, user, USER_SESSION_TTL);

    req.user = user;
    next();
  },
);

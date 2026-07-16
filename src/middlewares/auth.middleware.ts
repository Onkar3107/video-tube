import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';

interface JwtPayload {
  id: string;
}

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

    req.user = user;

    next();
  },
);

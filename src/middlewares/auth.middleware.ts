import type { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';

interface JwtPayload {
  _id: string;
  email: string;
  username: string;
  fullName: string;
}

export const verifyJWT = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token =
    req.cookies?.accessToken || req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    throw new ApiError(401, 'Unauthorized access');
  }

  const decodedToken = jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET as string,
  ) as JwtPayload;

  const user = await User.findById(decodedToken?._id).select('-password -refreshToken');

  if (!user) {
    throw new ApiError(401, 'Invalid access Token');
  }

  req.user = {
    _id: (user._id as any).toString(),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar,
  };

  next();
});

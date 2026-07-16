import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { userService } from './user.service.js';
import { ApiError } from '../../utils/ApiError.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
} as const;

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.register(req.body, req.files);
  res.status(201).json(new ApiResponse(201, user, 'User registered successfully'));
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const result = await userService.login(req.body);
  res
    .status(200)
    .cookie('accessToken', result.accessToken, COOKIE_OPTIONS)
    .cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)
    .json(new ApiResponse(200, result, 'Logged in successfully'));
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  await userService.logout(req.user!.id);
  res
    .status(200)
    .clearCookie('accessToken', COOKIE_OPTIONS)
    .clearCookie('refreshToken', COOKIE_OPTIONS)
    .json(new ApiResponse(200, {}, 'Logged out successfully'));
});

export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!token) {
    throw new ApiError(401, 'Refresh token is missing');
  }
  const result = await userService.refreshTokens(token);
  res
    .status(200)
    .cookie('accessToken', result.accessToken, COOKIE_OPTIONS)
    .cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS)
    .json(new ApiResponse(200, result, 'Tokens refreshed'));
});

export const changeCurrentPassword = asyncHandler(async (req: Request, res: Response) => {
  await userService.changePassword(req.user!.id, req.body);
  res.status(200).json(new ApiResponse(200, {}, 'Password changed successfully'));
});

export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse(200, req.user, 'User fetched'));
});

export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateProfile(req.user!.id, req.body);
  res.status(200).json(new ApiResponse(200, user, 'Profile updated'));
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const filePath = req.file?.path;
  if (!filePath) {
    throw new ApiError(400, 'Avatar file is required');
  }
  const user = await userService.updateAvatar(req.user!.id, filePath);
  res.status(200).json(new ApiResponse(200, user, 'Avatar updated'));
});

export const updateCoverImage = asyncHandler(async (req: Request, res: Response) => {
  const filePath = req.file?.path;
  if (!filePath) {
    throw new ApiError(400, 'Cover image is required');
  }
  const user = await userService.updateCoverImage(req.user!.id, filePath);
  res.status(200).json(new ApiResponse(200, user, 'Cover image updated'));
});

export const getUserChannelProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params as Record<string, string>;
  const channel = await userService.getChannelProfile(username!, req.user?.id);
  res.status(200).json(new ApiResponse(200, channel, 'Channel profile fetched'));
});

export const getWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const history = await userService.getWatchHistory(req.user!.id);
  res.status(200).json(new ApiResponse(200, history, 'Watch history fetched'));
});

import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { deleteFromCloudinary, uploadOnCloudinary } from '../utils/cloudinary.js';
import { prisma } from '../config/database.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import type { Request, Response } from 'express';

// ─── Helper: Generate Access + Refresh Tokens ────────────────────────────────

const generateTokens = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(500, 'User not found');

  const accessToken = jwt.sign(
    { id: user.id, email: user.email, username: user.username, fullName: user.fullName },
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY as any },
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY as any },
  );

  await prisma.user.update({ where: { id: userId }, data: { refreshToken } });
  return { accessToken, refreshToken };
};

// ─── Register ────────────────────────────────────────────────────────────────

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password, fullName } = req.body;

  if ([username, email, password, fullName].some((field) => !field?.trim())) {
    throw new ApiError(400, 'All fields are required');
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ username: username.toLowerCase() }, { email }] },
  });

  if (existingUser) {
    throw new ApiError(409, 'User already exists');
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const avatarLocalPath = files?.avatar?.[0]?.path;

  let coverImageLocalPath: string | undefined;
  if (files && Array.isArray(files.coverImage) && files.coverImage.length > 0) {
    coverImageLocalPath = files.coverImage[0]?.path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file is required');
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(500, 'Error uploading avatar');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      email,
      password: hashedPassword,
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url ?? '',
    },
  });

  const { password: _pwd, refreshToken: _rt, ...safeUser } = user;

  res.status(201).json(new ApiResponse(201, safeUser, 'User created successfully'));
});

// ─── Login ───────────────────────────────────────────────────────────────────

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, username, password } = req.body;

  if (!(email || username)) {
    throw new ApiError(400, 'Username or email is required');
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (!user) {
    throw new ApiError(404, 'User does not exist');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);

  if (!isValidPassword) {
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateTokens(user.id);

  const { password: _pwd, refreshToken: _rt, ...safeUser } = user;

  const options = { httpOnly: true, secure: true };

  res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(200, { user: safeUser, accessToken, refreshToken }, 'User logged in successfully'),
    );
});

// ─── Logout ──────────────────────────────────────────────────────────────────

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { refreshToken: null },
  });

  const options = { httpOnly: true, secure: true };

  res
    .status(200)
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'User logged out successfully'));
});

// ─── Refresh Access Token ─────────────────────────────────────────────────────

export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Unauthorized request');
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET as string,
    ) as jwt.JwtPayload;

    const user = await prisma.user.findUnique({ where: { id: decodedToken.id } });

    if (!user) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (user.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, 'Refresh Token is expired');
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user.id);

    const { password: _pwd, refreshToken: _rt, ...safeUser } = user;

    const options = { httpOnly: true, secure: true };

    res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { user: safeUser, accessToken, refreshToken: newRefreshToken },
          'Token refreshed successfully',
        ),
      );
  } catch (error: any) {
    throw new ApiError(401, error?.message || 'Invalid refresh token');
  }
});

// ─── Change Password ──────────────────────────────────────────────────────────

export const changeCurrentPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current and new password are required');
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const isValidPassword = await bcrypt.compare(currentPassword, user.password);

  if (!isValidPassword) {
    throw new ApiError(401, 'Invalid current password');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: req.user!.id },
    data: { password: hashedPassword },
  });

  res.status(200).json(new ApiResponse(200, {}, 'Password changed successfully'));
});

// ─── Get Current User ─────────────────────────────────────────────────────────

export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse(200, req.user ?? {}, 'User details fetched successfully'));
});

// ─── Update Profile ──────────────────────────────────────────────────────────

export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, 'Fullname and email are required');
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user!.id },
    data: { fullName, email },
    omit: { password: true, refreshToken: true },
  });

  res.status(200).json(new ApiResponse(200, updatedUser, 'User profile updated successfully'));
});

// ─── Update Avatar ────────────────────────────────────────────────────────────

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file is required');
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar?.url) {
    throw new ApiError(500, 'Error uploading avatar');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { avatar: true },
  });

  if (!currentUser) {
    throw new ApiError(400, 'User not found.');
  }

  const oldAvatarUrl = currentUser.avatar;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar: avatar.url },
      omit: { password: true, refreshToken: true },
    });

    if (oldAvatarUrl) {
      await deleteFromCloudinary(oldAvatarUrl);
    }

    res.status(200).json(new ApiResponse(200, updatedUser, 'Avatar updated successfully'));
  } catch (err) {
    console.error('Error updating avatar:', err);
    await deleteFromCloudinary(avatar.url);
    res.status(500).json(new ApiResponse(500, {}, 'Error uploading avatar. Try again later.'));
  }
});

// ─── Update Cover Image ───────────────────────────────────────────────────────

export const updateCoverImage = asyncHandler(async (req: Request, res: Response) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, 'Cover image file is required');
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage?.url) {
    throw new ApiError(500, 'Error uploading cover image');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { coverImage: true },
  });

  if (!currentUser) {
    throw new ApiError(400, 'User not found.');
  }

  const oldCoverImageUrl = currentUser.coverImage;

  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { coverImage: coverImage.url },
      omit: { password: true, refreshToken: true },
    });

    if (oldCoverImageUrl) {
      await deleteFromCloudinary(oldCoverImageUrl);
    }

    res.status(200).json(new ApiResponse(200, updatedUser, 'Cover image updated successfully'));
    return;
  } catch (err) {
    console.error('Error uploading cover image:', err);
    await deleteFromCloudinary(coverImage.url);
    res.status(500).json(new ApiResponse(500, {}, 'Error uploading cover image. Try again later.'));
  }
});

// ─── Get Channel Profile ──────────────────────────────────────────────────────

export const getUserChannelProfile = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params as Record<string, string>;

  if (!username?.trim()) {
    throw new ApiError(400, 'Username is missing');
  }

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      subscribers: true,
      subscriptions: true,
    },
    omit: { password: true, refreshToken: true },
  });

  if (!user) {
    throw new ApiError(404, 'Channel does not exist');
  }

  const subscribersCount = user.subscribers.length;
  const subscribedToCount = user.subscriptions.length;
  const isSubscribed = user.subscribers.some((s) => s.subscriberId === req.user?.id);

  const { subscribers: _subs, subscriptions: _subd, ...channelData } = user;

  res.status(200).json(
    new ApiResponse(
      200,
      { ...channelData, subscribersCount, subscribedToCount, isSubscribed },
      'Channel profile fetched successfully',
    ),
  );
});

// ─── Get Watch History ────────────────────────────────────────────────────────

export const getWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const history = await prisma.watchHistory.findMany({
    where: { userId: req.user!.id },
    include: {
      video: {
        include: {
          owner: { select: { username: true, avatar: true } },
        },
      },
    },
    orderBy: { watchedAt: 'desc' },
  });

  const videos = history.map((h) => h.video);

  res.status(200).json(new ApiResponse(200, videos, 'Watch history fetched successfully'));
});

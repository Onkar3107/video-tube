import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { User } from '../models/user.model.js';
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from '../utils/cloudinary.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';

const generateTokens = async (userID: mongoose.Types.ObjectId | string) => {
  try {
    const user = await User.findById(userID);
    if (!user) throw new ApiError(404, 'User not found');
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch {
    throw new ApiError(500, 'Error generating tokens');
  }
};

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password, fullName } = req.body;

  if (
    [username, email, password, fullName].some((field) => field?.trim() === '')
  ) {
    throw new ApiError(400, 'All fields are required');
  }

  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, 'User already exists');
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const avatarLocalPath = files?.avatar?.[0]?.path;
  
  let coverImageLocalPath: string | undefined;
  if (
    files &&
    Array.isArray(files.coverImage) &&
    files.coverImage.length > 0
  ) {
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

  const user = await User.create({
    username: username.toLowerCase(),
    email,
    password,
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || '',
  });

  const createdUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );

  if (!createdUser) {
    throw new ApiError(500, 'Error creating user');
  }

  res
    .status(201)
    .json(new ApiResponse(200, createdUser, 'User created successfully'));
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, username, password } = req.body;

  if (!(email || username)) {
    throw new ApiError(400, 'Username or email is required');
  }

  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(404, 'User does not exist');
  }

  const isValidPassword = await user.verifyPassword(password);

  if (!isValidPassword) {
    throw new ApiError(401, 'Invalid user credentials');
  }

  const { accessToken, refreshToken } = await generateTokens(user._id as any);

  const loggedUser = await User.findById(user._id).select(
    '-password -refreshToken'
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(200)
    .cookie('accessToken', accessToken, options)
    .cookie('refreshToken', refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedUser, accessToken, refreshToken },
        'User logged in successfully'
      )
    );
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(
    req.user?._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  res
    .status(200)
    .clearCookie('accessToken', options)
    .clearCookie('refreshToken', options)
    .json(new ApiResponse(200, {}, 'User logged out successfully'));
});

export const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'Unauthorized request');
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET as string
    ) as jwt.JwtPayload;

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    if (user?.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, 'Refresh Token is expired');
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user._id as any);

    const options = {
      httpOnly: true,
      secure: true,
    };

    const loggedUser = await User.findById(user._id).select(
      '-password -refreshToken'
    );

    res
      .status(200)
      .cookie('accessToken', accessToken, options)
      .cookie('refreshToken', newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { user: loggedUser, accessToken, refreshToken: newRefreshToken },
          'Token refreshed successfully'
        )
      );
  } catch (error: any) {
    throw new ApiError(401, error?.message || 'Invalid refresh token');
  }
});

export const changeCurrentPassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current and new password are required');
  }

  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const isValidPassword = await user.verifyPassword(currentPassword);

  if (!isValidPassword) {
    throw new ApiError(401, 'Invalid current password');
  }

  user.password = newPassword;

  await user.save({
    validateBeforeSave: false,
  });

  res
    .status(200)
    .json(new ApiResponse(200, {}, 'Password changed successfully'));
});

export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  res
    .status(200)
    .json(new ApiResponse(200, req.user || {}, 'User details fetched successfully'));
});

export const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, 'Fullname and email are required');
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    { new: true }
  ).select('-password -refreshToken');

  res
    .status(200)
    .json(new ApiResponse(200, user, 'User profile updated successfully'));
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, 'Avatar file is required');
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar || !avatar.url) {
    throw new ApiError(500, 'Error uploading avatar');
  }

  const user = await User.findById(req.user?._id).select('avatar');

  if (!user) {
    throw new ApiError(400, 'User not found.');
  }

  const oldAvatarUrl = user.avatar;

  try {
    user.avatar = avatar.url;
    await user.save();

    if (oldAvatarUrl) {
      await deleteFromCloudinary(oldAvatarUrl);
    }

    res
      .status(200)
      .json(new ApiResponse(200, user, 'Avatar updated successfully'));
  } catch (err) {
    console.error('Error uploading avatar:', err);
    await deleteFromCloudinary(avatar.url);

    res
      .status(500)
      .json(new ApiResponse(500, 'Error uploading avatar. Try again later.'));
  }
});

export const updateCoverImage = asyncHandler(async (req: Request, res: Response) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, 'Cover image file is required');
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage || !coverImage.url) {
    throw new ApiError(500, 'Error uploading cover image');
  }

  const user = await User.findById(req.user?._id).select('coverImage');

  if (!user) {
    throw new ApiError(400, 'User not found.');
  }

  const oldCoverImageUrl = user.coverImage;

  try {
    user.coverImage = coverImage.url;
    await user.save();

    if (oldCoverImageUrl) {
      await deleteFromCloudinary(oldCoverImageUrl);
    }

    res
      .status(200)
      .json(new ApiResponse(200, user, 'Cover image updated successfully'));
    return;
  } catch (err) {
    console.error('Error uploading cover image:', err);

    await deleteFromCloudinary(coverImage.url);

    res
      .status(500)
      .json(
        new ApiResponse(
          500,
          {},
          'Error uploading cover image. Try again later.'
        )
      );
  }
});

export const getUserChannelProfile = asyncHandler(async (req: Request, res: Response) => {
  const username = req.params.username as string | undefined;

  if (!username || !username.trim()) {
    throw new ApiError(400, 'Username is missing');
  }

  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() },
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'channel',
        as: 'subscribers',
      },
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'subscriber',
        as: 'subscribedTo',
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: '$subscribers',
        },
        subscribedToCount: {
          $size: '$subscribedTo',
        },
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id ? new mongoose.Types.ObjectId(req.user._id) : null, '$subscribers.subscriber'],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        avatar: 1,
        email: 1,
        coverImage: 1,
        subscribersCount: 1,
        subscribedToCount: 1,
        isSubscribed: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, 'Channel does not exists');
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], 'Channel profile fetched successfully')
    );
});

export const getWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user?._id),
      },
    },
    {
      $lookup: {
        from: 'videos',
        localField: 'watchHistory',
        foreignField: '_id',
        as: 'watchHistory',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              localField: 'owner',
              foreignField: '_id',
              as: 'owner',
              pipeline: [
                {
                  $project: {
                    avatar: 1,
                    username: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $arrayElemAt: ['$owner', 0],
              },
            },
          },
        ],
      },
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0]?.watchHistory || [],
        'Watch history fetched successfully'
      )
    );
});

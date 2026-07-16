import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from './user.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.js';
import { cache, CacheKeys, CacheTTL } from '../../utils/cache.js';
import type { RegisterUserDto, LoginUserDto, ChangePasswordDto, UpdateProfileDto } from './user.dto.js';
import type { Request } from 'express';

const userRepository = new UserRepository();

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const generateTokens = (user: { id: string; email: string; username: string; fullName: string }): TokenPair => {
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
  return { accessToken, refreshToken };
};

export const userService = {
  async register(dto: RegisterUserDto, files: Request['files']) {
    const existing = await userRepository.findByEmailOrUsername(dto.email, dto.username);
    if (existing) throw new ApiError(409, 'User with this email or username already exists');

    const filesObj = files as Record<string, Express.Multer.File[]> | undefined;
    const avatarPath = filesObj?.['avatar']?.[0]?.path;
    if (!avatarPath) throw new ApiError(400, 'Avatar file is required');
    const coverPath = filesObj?.['coverImage']?.[0]?.path;

    const avatar = await uploadOnCloudinary(avatarPath);
    if (!avatar) throw new ApiError(500, 'Failed to upload avatar');

    const coverImage = coverPath ? await uploadOnCloudinary(coverPath) : null;

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await userRepository.create({
      username: dto.username.toLowerCase(),
      email: dto.email,
      password: hashedPassword,
      fullName: dto.fullName,
      avatar: avatar.secure_url,
      coverImage: coverImage?.secure_url ?? '',
    });

    const { password: _p, refreshToken: _rt, ...safeUser } = user;
    return safeUser;
  },

  async login(dto: LoginUserDto) {
    const user = await userRepository.findByEmailOrUsername(
      dto.email ?? '',
      dto.username ?? '',
    );
    if (!user) throw new ApiError(404, 'User does not exist');

    const isValid = await bcrypt.compare(dto.password, user.password);
    if (!isValid) throw new ApiError(401, 'Invalid credentials');

    const { accessToken, refreshToken } = generateTokens(user);
    await userRepository.update(user.id, { refreshToken });

    const { password: _p, refreshToken: _rt, ...safeUser } = user;
    return { user: safeUser, accessToken, refreshToken };
  },

  async logout(userId: string) {
    await userRepository.update(userId, { refreshToken: null });
  },

  async refreshTokens(incomingToken: string) {
    interface JwtPayload { id: string }
    const decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET as string) as JwtPayload;
    const user = await userRepository.findById(decoded.id);
    if (!user || user.refreshToken !== incomingToken) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }
    const { accessToken, refreshToken } = generateTokens(user);
    await userRepository.update(user.id, { refreshToken });
    return { accessToken, refreshToken };
  },

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new ApiError(401, 'Current password is incorrect');
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await userRepository.update(userId, { password: hashedPassword });
  },

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await userRepository.update(userId, dto);
    
    // Invalidate profile cache
    await cache.del(CacheKeys.channelProfile(updated.username));

    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async updateAvatar(userId: string, filePath: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const oldAvatar = user.avatar;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload avatar');

    const updated = await userRepository.update(userId, { avatar: uploaded.secure_url });
    
    // Invalidate profile cache
    await cache.del(CacheKeys.channelProfile(updated.username));

    if (oldAvatar) await deleteFromCloudinary(oldAvatar);
    
    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async updateCoverImage(userId: string, filePath: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const oldCover = user.coverImage;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload cover image');

    const updated = await userRepository.update(userId, { coverImage: uploaded.secure_url });
    
    // Invalidate profile cache
    await cache.del(CacheKeys.channelProfile(updated.username));

    if (oldCover) await deleteFromCloudinary(oldCover);
    
    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async getChannelProfile(username: string, requesterId?: string) {
    const cacheKey = CacheKeys.channelProfile(username);
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    const user = await userRepository.findByUsername(username);
    if (!user) throw new ApiError(404, 'Channel does not exist');

    const subscribersCount = user.subscribers.length;
    const subscribedToCount = user.subscriptions.length;
    const isSubscribed = requesterId
      ? user.subscribers.some((s) => s.subscriberId === requesterId)
      : false;

    const { subscribers: _s, subscriptions: _sub, ...rest } = user;
    const result = { ...rest, subscribersCount, subscribedToCount, isSubscribed };

    await cache.set(cacheKey, result, CacheTTL.CHANNEL);
    return result;
  },

  async getWatchHistory(userId: string) {
    const history = await userRepository.getWatchHistory(userId);
    return history.map((h) => h.video);
  },
};

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from './user.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.js';
import { cache, CacheKeys, CacheTTL } from '../../utils/cache.js';
import type { RegisterUserDto, LoginUserDto, ChangePasswordDto, UpdateProfileDto } from './user.dto.js';

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
  async register(dto: RegisterUserDto, files: Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined) {
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
    await cache.del(CacheKeys.session(userId));
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
    await cache.del(CacheKeys.session(userId));
  },

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updated = await userRepository.update(userId, dto);
    
    // Invalidate profile and session cache
    await cache.del(CacheKeys.channelProfile(updated.username));
    await cache.del(CacheKeys.session(userId));

    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async updateAvatar(userId: string, filePath: string) {
    // Single DB call: update and return both old and new data
    const existing = await userRepository.findById(userId);
    if (!existing) throw new ApiError(404, 'User not found');
    const oldAvatar = existing.avatar;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload avatar');

    const updated = await userRepository.update(userId, { avatar: uploaded.secure_url });

    // Invalidate profile and session cache
    await cache.del(CacheKeys.channelProfile(updated.username));
    await cache.del(CacheKeys.session(userId));

    // Delete old avatar from Cloudinary after successful DB update
    if (oldAvatar) await deleteFromCloudinary(oldAvatar);

    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async updateCoverImage(userId: string, filePath: string) {
    // Single DB call: update and return both old and new data
    const existing = await userRepository.findById(userId);
    if (!existing) throw new ApiError(404, 'User not found');
    const oldCover = existing.coverImage;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload cover image');

    const updated = await userRepository.update(userId, { coverImage: uploaded.secure_url });

    // Invalidate profile and session cache
    await cache.del(CacheKeys.channelProfile(updated.username));
    await cache.del(CacheKeys.session(userId));

    // Delete old cover from Cloudinary after successful DB update
    if (oldCover) await deleteFromCloudinary(oldCover);

    const { password: _p, refreshToken: _rt, ...safeUser } = updated;
    return safeUser;
  },

  async getChannelProfile(username: string, requesterId?: string) {
    const cacheKey = CacheKeys.channelProfile(username);
    const cached = await cache.get<any>(cacheKey);

    let channelData: any;
    if (cached) {
      channelData = cached;
    } else {
      const user = await userRepository.findByUsername(username);
      if (!user) throw new ApiError(404, 'Channel does not exist');

      const { _count, ...rest } = user;

      channelData = {
        ...rest,
        // Counts come from the DB query (uses COUNT via Prisma aggregation in repo)
        subscribersCount: _count.subscribers,
        subscribedToCount: _count.subscriptions,
      };

      // Cache the channel data WITHOUT isSubscribed — isSubscribed is user-specific
      // and must never be cached globally, to avoid returning wrong state to other users
      await cache.set(cacheKey, channelData, CacheTTL.CHANNEL);
    }

    // Compute isSubscribed per-request — never from cache
    const isSubscribed = requesterId
      ? await userRepository.isSubscribed(requesterId, channelData.id)
      : false;

    return { ...channelData, isSubscribed };
  },

  async getWatchHistory(userId: string) {
    const history = await userRepository.getWatchHistory(userId);
    return history.map((h) => h.video);
  },
};

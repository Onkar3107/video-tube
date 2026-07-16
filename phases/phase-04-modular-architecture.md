# Phase 4 — Modular Architecture

> **Status**: Not started  
> **Estimated Time**: 6–8 hours  
> **Prerequisite**: Phase 3 complete  
> **Strict Scope**: Introduce Controller → Service → Repository layers. Add Zod validation. Add centralized error handler. Fix all deferred bugs. Do NOT add Redis, Pino, or rate limiting yet (Phase 5).

---

## Objective

Refactor every module from flat controllers into a layered architecture. Controllers handle HTTP only. Services contain business logic. Repositories contain all Prisma calls. Zod schemas validate all incoming request bodies.

---

## Architecture Rules

These rules are enforced by convention:

| Layer | Responsibility | Can Import | Cannot Import |
|---|---|---|---|
| **Controller** | Parse `req`, call service, return `res` | Service, ApiError, ApiResponse, asyncHandler, express types | `prisma`, `ioredis`, BullMQ |
| **Service** | Business logic, domain rules, throw `ApiError` | Repository, ApiError, cloudinary utils | express types, `prisma` directly |
| **Repository** | Prisma queries only, return data or `null` | `prisma`, Prisma types | ApiError, express types, BullMQ |

---

## Step 4.1 — Install Dependencies

```bash
npm install zod
```

---

## Step 4.2 — Create Validation Middleware

Create `src/middlewares/validate.middleware.ts`:

```typescript
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
```

---

## Step 4.3 — Create Centralized Error Handler

Create `src/middlewares/error.middleware.ts`:

```typescript
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';
import { MulterError } from 'multer';

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
```

Register in `src/app.ts` as the **last** middleware:

```typescript
import { errorHandler } from './middlewares/error.middleware.js';

// ... all routes ...

app.use(errorHandler);
```

---

## Step 4.4 — Migrate All Modules

For each of the 9 modules, create the following files. The pattern is identical — the content differs per domain.

### User Module

**`src/modules/user/user.dto.ts`**:

```typescript
import { z } from 'zod';

export const RegisterUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username may only contain lowercase letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
});

export const LoginUserSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((d) => d.email || d.username, {
    message: 'Either email or username is required',
    path: ['email'],
  });

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(72),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).trim().optional(),
  email: z.string().email().optional(),
});

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
export type LoginUserDto = z.infer<typeof LoginUserSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
```

**`src/modules/user/user.repository.ts`**:

```typescript
import { prisma } from '../../config/database.js';
import type { Prisma } from '@prisma/client';

export class UserRepository {
  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByIdSafe(id: string) {
    return prisma.user.findUnique({
      where: { id },
      omit: { password: true, refreshToken: true },
    });
  }

  async findByEmailOrUsername(email: string, username: string) {
    return prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
  }

  async findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        subscribers: true,
        subscriptions: true,
      },
      omit: { password: true, refreshToken: true },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  }

  async getWatchHistory(userId: string) {
    return prisma.watchHistory.findMany({
      where: { userId },
      include: {
        video: {
          include: { owner: { select: { username: true, avatar: true } } },
        },
      },
      orderBy: { watchedAt: 'desc' },
    });
  }
}
```

**`src/modules/user/user.service.ts`**:

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserRepository } from './user.repository.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadOnCloudinary, deleteFromCloudinary } from '../../utils/cloudinary.js';
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
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY },
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
      coverImage: coverImage?.secure_url,
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
    return userRepository.update(userId, dto);
  },

  async updateAvatar(userId: string, filePath: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const oldAvatar = user.avatar;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload avatar');

    const updated = await userRepository.update(userId, { avatar: uploaded.secure_url });
    if (oldAvatar) await deleteFromCloudinary(oldAvatar);
    return updated;
  },

  async updateCoverImage(userId: string, filePath: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    const oldCover = user.coverImage;

    const uploaded = await uploadOnCloudinary(filePath);
    if (!uploaded) throw new ApiError(500, 'Failed to upload cover image');

    const updated = await userRepository.update(userId, { coverImage: uploaded.secure_url });
    if (oldCover) await deleteFromCloudinary(oldCover);
    return updated;
  },

  async getChannelProfile(username: string, requesterId?: string) {
    const user = await userRepository.findByUsername(username);
    if (!user) throw new ApiError(404, 'Channel does not exist');

    const subscribersCount = user.subscribers.length;
    const subscribedToCount = user.subscriptions.length;
    const isSubscribed = requesterId
      ? user.subscribers.some((s) => s.subscriberId === requesterId)
      : false;

    const { subscribers: _s, subscriptions: _sub, ...rest } = user;
    return { ...rest, subscribersCount, subscribedToCount, isSubscribed };
  },

  async getWatchHistory(userId: string) {
    const history = await userRepository.getWatchHistory(userId);
    return history.map((h) => h.video);
  },
};
```

**`src/modules/user/user.controller.ts`** (thinned controller):

```typescript
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { userService } from './user.service.js';

const COOKIE_OPTIONS = { httpOnly: true, secure: process.env.NODE_ENV === 'production' } as const;

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
  if (!filePath) throw new (await import('../../utils/ApiError.js')).ApiError(400, 'Avatar file is required');
  const user = await userService.updateAvatar(req.user!.id, filePath);
  res.status(200).json(new ApiResponse(200, user, 'Avatar updated'));
});

export const updateCoverImage = asyncHandler(async (req: Request, res: Response) => {
  const filePath = req.file?.path;
  if (!filePath) throw new (await import('../../utils/ApiError.js')).ApiError(400, 'Cover image is required');
  const user = await userService.updateCoverImage(req.user!.id, filePath);
  res.status(200).json(new ApiResponse(200, user, 'Cover image updated'));
});

export const getUserChannelProfile = asyncHandler(async (req: Request, res: Response) => {
  const channel = await userService.getChannelProfile(req.params['username']!, req.user?.id);
  res.status(200).json(new ApiResponse(200, channel, 'Channel profile fetched'));
});

export const getWatchHistory = asyncHandler(async (req: Request, res: Response) => {
  const history = await userService.getWatchHistory(req.user!.id);
  res.status(200).json(new ApiResponse(200, history, 'Watch history fetched'));
});
```

**`src/modules/user/user.routes.ts`** (with validation):

```typescript
import { Router } from 'express';
import { upload } from '../../middlewares/multer.middleware.js';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { RegisterUserSchema, LoginUserSchema, ChangePasswordSchema, UpdateProfileSchema } from './user.dto.js';
import * as userController from './user.controller.js';

const router = Router();

router.post('/register', upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), validate(RegisterUserSchema), userController.registerUser);
router.post('/login', validate(LoginUserSchema), userController.loginUser);
router.post('/logout', verifyJWT, userController.logoutUser);
router.post('/refresh-token', userController.refreshAccessToken);
router.post('/change-password', verifyJWT, validate(ChangePasswordSchema), userController.changeCurrentPassword);
router.get('/current-user', verifyJWT, userController.getCurrentUser);
router.patch('/update-account', verifyJWT, validate(UpdateProfileSchema), userController.updateUserProfile);
router.patch('/avatar', verifyJWT, upload.single('avatar'), userController.updateAvatar);
router.patch('/cover-image', verifyJWT, upload.single('coverImage'), userController.updateCoverImage);
router.get('/c/:username', userController.getUserChannelProfile);
router.get('/history', verifyJWT, userController.getWatchHistory);

export default router;
```

---

### Remaining Module DTOs

**`src/modules/video/video.dto.ts`**:
```typescript
import { z } from 'zod';

export const PublishVideoSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
});

export const UpdateVideoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
});

export const GetVideosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  query: z.string().optional(),
  sortBy: z.enum(['createdAt', 'views', 'duration']).default('createdAt'),
  sortType: z.enum(['asc', 'desc']).default('desc'),
  userId: z.string().optional(),
});
```

**`src/modules/comment/comment.dto.ts`**:
```typescript
import { z } from 'zod';

export const AddCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(2000).trim(),
});

export const UpdateCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(2000).trim(),
});
```

**`src/modules/tweet/tweet.dto.ts`**:
```typescript
import { z } from 'zod';

export const CreateTweetSchema = z.object({
  tweet: z.string().min(1, 'Tweet cannot be empty').max(280).trim(),
});

export const UpdateTweetSchema = z.object({
  tweet: z.string().min(1, 'Tweet cannot be empty').max(280).trim(),
});
```

**`src/modules/playlist/playlist.dto.ts`**:
```typescript
import { z } from 'zod';

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).trim(),
  description: z.string().min(1, 'Description is required').max(1000).trim(),
});

export const UpdatePlaylistSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(1000).trim().optional(),
});
```

> **Remaining Modules**: Apply the same Controller → Service → Repository pattern to `video`, `comment`, `like`, `subscription`, `tweet`, `playlist`, and `dashboard` modules. Each follows the exact same file structure. The business logic previously in controllers moves to services; Prisma queries move to repositories.

---

## Step 4.5 — Update `src/app.ts` to Use Module Routes

Move routes from `src/routes/` to module-level. Update `src/app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middlewares/error.middleware.js';

import userRouter from './modules/user/user.routes.js';
import videoRouter from './modules/video/video.routes.js';
import commentRouter from './modules/comment/comment.routes.js';
import likeRouter from './modules/like/like.routes.js';
import subscriptionRouter from './modules/subscription/subscription.routes.js';
import tweetRouter from './modules/tweet/tweet.routes.js';
import playlistRouter from './modules/playlist/playlist.routes.js';
import dashboardRouter from './modules/dashboard/dashboard.routes.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));
app.use(cookieParser());

// Health check
app.get('/api/v1/health-check', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

// Module routes
app.use('/api/v1/users', userRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/tweets', tweetRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// Centralized error handler — must be last
app.use(errorHandler);

export { app };
```

---

## Step 4.6 — Bug Fixes Applied in This Phase

| Bug | Fix Location | Fix |
|---|---|---|
| Unreachable `return` in `updateCoverImage` | `user.service.ts` | Removed — now returns correctly after await |
| No centralized error handler | `src/app.ts` | `errorHandler` middleware added as last middleware |
| `AsyncHandler` → `asyncHandler` rename | All controllers | Import path updated |
| Cloudinary `publicId` extraction for nested paths | `src/utils/cloudinary.ts` | Use Cloudinary URL parsing utility |
| `console.error` for error logging | All services | Remains for now — replaced with Pino in Phase 5 |

**Fix `src/utils/cloudinary.ts` — public ID extraction**:

```typescript
export const deleteFromCloudinary = async (fileUrl: string | undefined) => {
  try {
    if (!fileUrl) return null;
    // Correctly extract public ID including folder paths
    // e.g. "https://res.cloudinary.com/cloud/image/upload/v123/folder/subfolder/filename.jpg"
    // → "folder/subfolder/filename"
    const urlParts = fileUrl.split('/upload/');
    if (urlParts.length < 2) return null;
    const withVersion = urlParts[1]!;
    // Remove version prefix (v123456/) if present
    const withoutVersion = withVersion.replace(/^v\d+\//, '');
    // Remove file extension
    const publicId = withoutVersion.replace(/\.[^.]+$/, '');
    const response = await cloudinary.uploader.destroy(publicId);
    return response;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return null;
  }
};
```

---

## Step 4.7 — Delete Old Route Files

After all module routes are moved into `src/modules/*/`:

```bash
rm -rf src/routes/
rm -rf src/controllers/
```

---

## Deliverables Checklist

- [ ] `src/middlewares/validate.middleware.ts` created
- [ ] `src/middlewares/error.middleware.ts` created and registered in `app.ts`
- [ ] `zod` installed
- [ ] User module: `user.dto.ts`, `user.repository.ts`, `user.service.ts`, `user.controller.ts`, `user.routes.ts`
- [ ] Video module: all 5 files created
- [ ] Comment module: all 5 files created
- [ ] Like module: all 5 files created
- [ ] Subscription module: all 5 files created
- [ ] Tweet module: all 5 files created
- [ ] Playlist module: all 5 files created
- [ ] Dashboard module: all 4 files created (no DTO needed for GET-only routes)
- [ ] `src/app.ts` updated to use module routes and `errorHandler`
- [ ] `src/routes/` directory deleted
- [ ] `src/controllers/` directory deleted
- [ ] Cloudinary `deleteFromCloudinary` bug fixed

---

## Verification

```bash
# 1. TypeScript compiles
npm run type-check
# Expected: zero errors

# 2. Linter passes
npm run lint
# Expected: zero errors

# 3. Validation errors work correctly
curl -X POST http://localhost:8000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"a","email":"notanemail","password":"short"}'
# Expected: 422 with fieldErrors: { username: [...], email: [...], password: [...] }

# 4. Prisma unique constraint returns 409
curl -X POST http://localhost:8000/api/v1/users/register \
  -d '...' # register same user twice
# Expected: 409 { message: "Resource already exists" }

# 5. Expired JWT returns 401
curl -H "Authorization: Bearer expired.token.here" http://localhost:8000/api/v1/users/current-user
# Expected: 401 { message: "Invalid token" }

# 6. No prisma import in any controller
grep -r "from.*prisma" src/modules/*/*.controller.ts
# Expected: no output

# 7. No express types in any service
grep -r "from.*express" src/modules/*/*.service.ts
# Expected: no output (except type-only imports if needed)
```

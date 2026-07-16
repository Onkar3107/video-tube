# Phase 2 — TypeScript Migration

> **Status**: Not started  
> **Estimated Time**: 3–4 hours  
> **Prerequisite**: Phase 1 complete  
> **Strict Scope**: Language conversion only. Rename `.js` → `.ts`, add type annotations, fix compile errors, configure tooling. Do NOT fix bugs, do NOT refactor, do NOT change business logic. MongoDB and Mongoose remain in this phase.

---

## Objective

Convert every JavaScript file in `src/` to TypeScript. Configure the compiler, linter, and formatter. The app must compile cleanly and run identically to before.

---

## Step 2.1 — Install Dependencies

```bash
# TypeScript compiler and runtime
npm install -D typescript tsx

# Node.js type definitions
npm install -D @types/node

# Express type definitions
npm install -D @types/express @types/cors @types/cookie-parser @types/multer

# Auth/crypto type definitions
npm install -D @types/bcrypt @types/jsonwebtoken

# Linting and formatting
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier eslint-config-prettier
```

---

## Step 2.2 — Update `package.json` Scripts

Replace the existing `scripts` section in `package.json`:

```json
{
  "name": "chai_aur_backend",
  "version": "1.0.0",
  "description": "VideoTube — Production-ready YouTube-clone backend",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --project tsconfig.json",
    "start": "node dist/index.js",
    "type-check": "tsc --noEmit",
    "lint": "eslint src --ext .ts --max-warnings 0",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\""
  }
}
```

---

## Step 2.3 — Create `tsconfig.json`

Create `tsconfig.json` at the project root:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## Step 2.4 — Create `.eslintrc.json`

Create `.eslintrc.json` at the project root:

```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json",
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-floating-promises": "error",
    "no-console": "warn"
  },
  "env": {
    "node": true,
    "es2022": true
  }
}
```

---

## Step 2.5 — Create `.prettierrc`

Create `.prettierrc` at the project root:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true,
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

Create `.prettierignore`:

```
dist/
node_modules/
coverage/
prisma/migrations/
```

---

## Step 2.6 — Create `src/types/express.d.ts`

Create the Express `Request` type augmentation. Use a temporary inline user type since Prisma is not installed yet:

```typescript
// src/types/express.d.ts

export interface AuthUser {
  _id: string;
  username: string;
  email: string;
  fullName: string;
  avatar: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
```

> **Note**: This interface uses `_id` to match the existing Mongoose-based user shape. It will be updated to `id` in Phase 3 when we switch to Prisma.

---

## Step 2.7 — Convert Utility Files

### `src/utils/ApiError.ts`

Rename `ApiError.js` → `ApiError.ts` and update:

```typescript
export class ApiError extends Error {
  statusCode: number;
  data: null;
  success: boolean;
  errors: string[];

  constructor(
    statusCode: number,
    message = 'Something went wrong',
    errors: string[] = [],
    stack = '',
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
```

### `src/utils/ApiResponse.ts`

Rename `ApiResponse.js` → `ApiResponse.ts` and update:

```typescript
export class ApiResponse<T = unknown> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;

  constructor(statusCode: number, data: T, message = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}
```

### `src/utils/asyncHandler.ts`

Rename `wrapAsync.js` → `asyncHandler.ts` (note the rename) and replace entire content:

```typescript
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async Express route handler and forwards any rejected promise to next(err).
 * This eliminates the need for try/catch in every controller.
 */
export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
```

> **Important**: The old file was named `wrapAsync.js` and exported `AsyncHandler`. The new name is `asyncHandler.ts` exporting `asyncHandler`. Update ALL imports in controllers and middlewares accordingly.

### `src/utils/cloudinary.ts`

Rename `cloudinary.js` → `cloudinary.ts` and add types:

```typescript
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadOnCloudinary = async (localFilePath: string | undefined) => {
  try {
    if (!localFilePath) {
      return null;
    }
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    });
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

export const deleteFromCloudinary = async (fileUrl: string | undefined) => {
  try {
    if (!fileUrl) {
      return null;
    }
    const publicId = fileUrl.split('/').slice(-1)[0]?.split('.')[0];
    if (!publicId) return null;
    const response = await cloudinary.uploader.destroy(publicId);
    return response;
  } catch (error) {
    console.error('Cloudinary delete error: ', error);
    return null;
  }
};
```

---

## Step 2.8 — Convert `src/constants.ts`

Rename `constants.js` → `constants.ts`:

```typescript
export const DB_NAME = 'videotube';
```

---

## Step 2.9 — Convert Database Connection

Rename `src/db/index.js` → `src/db/index.ts`:

```typescript
import mongoose from 'mongoose';
import { DB_NAME } from '../constants.js';

export const connectDB = async (): Promise<void> => {
  try {
    const connectionInstance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`,
    );
    console.log(`\nMongoDB connected! DB HOST: ${connectionInstance.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection FAILED:', error);
    process.exit(1);
  }
};
```

---

## Step 2.10 — Convert Model Files

### `src/models/user.model.ts`

Rename and add types:

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  username: string;
  email: string;
  fullName: string;
  avatar: string;
  coverImage?: string;
  watcHHistory: mongoose.Types.ObjectId[];
  password: string;
  refreshToken?: string;
  verifyPassword(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true, index: true },
    avatar: { type: String, required: true },
    coverImage: { type: String },
    watcHHistory: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    password: { type: String, required: [true, 'Password is required'] },
    refreshToken: { type: String },
  },
  { timestamps: true },
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.verifyPassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password as string);
};

userSchema.methods.generateAccessToken = function (): string {
  return jwt.sign(
    { _id: this._id, email: this.email, username: this.username, fullName: this.fullName },
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY },
  );
};

export const User = mongoose.model<IUser>('User', userSchema);
```

### `src/models/video.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

export interface IVideo extends Document {
  videoFile: string;
  thumbnail: string;
  title: string;
  description: string;
  duration: number;
  views: number;
  isPublished: boolean;
  owner: mongoose.Types.ObjectId;
}

const videoSchema = new Schema<IVideo>(
  {
    videoFile: { type: String, required: true },
    thumbnail: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    views: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model<IVideo>('Video', videoSchema);
```

### `src/models/comment.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

export interface IComment extends Document {
  content: string;
  video: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
}

const commentSchema = new Schema<IComment>(
  {
    content: { type: String, required: true },
    video: { type: Schema.Types.ObjectId, ref: 'Video' },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model<IComment>('Comment', commentSchema);
```

### `src/models/like.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ILike extends Document {
  video?: mongoose.Types.ObjectId;
  comment?: mongoose.Types.ObjectId;
  tweet?: mongoose.Types.ObjectId;
  likedBy: mongoose.Types.ObjectId;
}

const likeSchema = new Schema<ILike>(
  {
    video: { type: Schema.Types.ObjectId, ref: 'Video' },
    comment: { type: Schema.Types.ObjectId, ref: 'Comment' },
    tweet: { type: Schema.Types.ObjectId, ref: 'Tweet' },
    likedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Like = mongoose.model<ILike>('Like', likeSchema);
```

### `src/models/subscription.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  subscriber: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    subscriber: { type: Schema.Types.ObjectId, ref: 'User' },
    channel: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
```

### `src/models/tweet.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface ITweet extends Document {
  content: string;
  owner: mongoose.Types.ObjectId;
}

const tweetSchema = new Schema<ITweet>(
  {
    content: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Tweet = mongoose.model<ITweet>('Tweet', tweetSchema);
```

### `src/models/playlist.model.ts`

```typescript
import mongoose, { Schema, Document } from 'mongoose';

export interface IPlaylist extends Document {
  name: string;
  description: string;
  videos: mongoose.Types.ObjectId[];
  owner: mongoose.Types.ObjectId;
}

const playlistSchema = new Schema<IPlaylist>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    videos: [{ type: Schema.Types.ObjectId, ref: 'Video' }],
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const Playlist = mongoose.model<IPlaylist>('Playlist', playlistSchema);
```

---

## Step 2.11 — Convert Middleware Files

### `src/middlewares/auth.middleware.ts`

Rename and type:

```typescript
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
    _id: user._id.toString(),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    avatar: user.avatar,
  };

  next();
});
```

### `src/middlewares/multer.middleware.ts`

Rename and type:

```typescript
import multer from 'multer';
import type { StorageEngine } from 'multer';
import path from 'path';

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, './public/temp');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

export const upload = multer({ storage });
```

---

## Step 2.12 — Convert All Controllers

For each controller file, perform these operations:

1. Rename `.js` → `.ts`
2. Add `Request`, `Response`, `NextFunction` type imports from `'express'`
3. Update import paths to use `.js` extension (NodeNext requirement)
4. Replace `AsyncHandler` import with `asyncHandler` from `'../utils/asyncHandler.js'`
5. Add return type `Promise<void>` to controller functions
6. Add `void` return type to `res.json()` and `res.status().json()` chains where TypeScript complains

**Import pattern for ALL controllers:**

```typescript
import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
```

> **Note**: Do not fix any bugs or change any logic in this phase. If TypeScript reports an error that cannot be fixed with a type annotation, use `// @ts-expect-error` with a comment explaining why. These will be fixed in Phase 4.

---

## Step 2.13 — Convert Route Files

Rename all route files from `.js` to `.ts`. Update all imports to use `.js` extensions.

Example `src/routes/user.routes.ts`:
```typescript
import { Router } from 'express';
import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
  registerUser,
  loginUser,
  logoutUser,
  // ... all exports
} from '../controllers/user.controller.js';

const router = Router();

// ... all route definitions unchanged
export default router;
```

---

## Step 2.14 — Convert `src/app.ts`

Rename `app.js` → `app.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(express.static('public'));
app.use(cookieParser());

// Import routes
import userRouter from './routes/user.routes.js';
import healthCheckRouter from './routes/healthcheck.routes.js';
import tweetRouter from './routes/tweet.routes.js';
import subscriptionRouter from './routes/subscription.routes.js';
import videoRouter from './routes/video.routes.js';
import commentRouter from './routes/comment.routes.js';
import likeRouter from './routes/like.routes.js';
import playlistRouter from './routes/playlist.routes.js';
import dashboardRouter from './routes/dashboard.routes.js';

app.use('/api/v1/health-check', healthCheckRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/tweets', tweetRouter);
app.use('/api/v1/subscriptions', subscriptionRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1/comments', commentRouter);
app.use('/api/v1/likes', likeRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/dashboard', dashboardRouter);

export { app };
```

---

## Step 2.15 — Convert `src/index.ts`

Rename `index.js` → `index.ts`:

```typescript
import { app } from './app.js';
import { connectDB } from './db/index.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

connectDB()
  .then(() => {
    app.on('error', (err) => {
      console.error('Express error', err);
      throw err;
    });

    app.listen(process.env.PORT ?? 8000, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => {
    console.error(err);
  });
```

---

## Step 2.16 — Fix Import Extensions

**Critical for NodeNext module resolution**: Every import from a local file must end in `.js` (even though the files are `.ts`). This is how NodeNext works.

Go through every file and ensure:
- `import { X } from './utils/ApiError'` → `import { X } from './utils/ApiError.js'`
- `import { X } from '../models/user.model'` → `import { X } from '../models/user.model.js'`

---

## Deliverables Checklist

- [ ] All `node_modules` type definitions installed
- [ ] `tsconfig.json` created and validated
- [ ] `.eslintrc.json` created
- [ ] `.prettierrc` created
- [ ] `package.json` scripts updated
- [ ] `src/types/express.d.ts` created
- [ ] `src/utils/asyncHandler.ts` created (renamed from `wrapAsync.js`)
- [ ] `src/utils/ApiError.ts` converted and typed
- [ ] `src/utils/ApiResponse.ts` converted and typed as generic
- [ ] `src/utils/cloudinary.ts` converted and typed
- [ ] All 7 model files converted to `.ts` with interfaces
- [ ] Both middleware files converted to `.ts` with types
- [ ] All 9 controller files converted to `.ts`
- [ ] All 9 route files converted to `.ts`
- [ ] `src/app.ts` converted
- [ ] `src/index.ts` converted
- [ ] `src/constants.ts` converted
- [ ] `src/db/index.ts` converted
- [ ] All import paths use `.js` extension

---

## Verification

```bash
# 1. TypeScript compiles without errors
npm run type-check
# Expected: no output (zero errors)

# 2. Linter passes
npm run lint
# Expected: no errors, no warnings

# 3. Build succeeds
npm run build
# Expected: dist/ directory created with .js files

# 4. Dev server starts
npm run dev
# Expected: "MongoDB connected" and "Server is running on port 8000"

# 5. All routes respond (quick smoke test)
curl http://localhost:8000/api/v1/health-check
# Expected: { success: true, message: "OK" }
```

---

## Common TypeScript Issues and Fixes

| Issue | Fix |
|---|---|
| `Object is possibly undefined` on `req.files?.avatar[0]` | Use optional chaining: `req.files?.['avatar']?.[0]` |
| `any` type on Mongoose document methods | Add the `IUser` interface and use `Document` extension |
| `process.env.X` is `string \| undefined` | Use non-null assertion `process.env.X!` for env vars (proper validation comes in Phase 5) |
| `mongoose.Types.ObjectId` comparison | Use `.toString()` for string comparison |
| Import path missing `.js` | Add `.js` to the end of all local imports |
| `no-console` ESLint warning | These are expected warnings — suppress with `// eslint-disable-next-line no-console` in this phase only |

# Phase 3 — PostgreSQL + Prisma Migration

> **Status**: Not started  
> **Estimated Time**: 6–8 hours  
> **Prerequisite**: Phase 2 complete  
> **Strict Scope**: Replace MongoDB/Mongoose with PostgreSQL/Prisma. Controllers continue to hold all DB logic — architecture refactoring is Phase 4. Fix the `getAllVideos` stub and the `watcHHistory` typo since they require schema changes.

---

## Objective

Completely replace Mongoose with Prisma ORM backed by PostgreSQL. Translate every database query in every controller to Prisma. Remove all Mongoose model files and the MongoDB connection.

---

## Step 3.1 — Install Prisma and Remove Mongoose

```bash
# Install Prisma
npm install @prisma/client
npm install -D prisma

# Remove Mongoose
npm uninstall mongoose mongoose-aggregate-paginate-v2

# Remove Mongoose types (installed in Phase 2)
npm uninstall -D @types/mongoose
```

Update `MONGODB_URI` references — they are no longer needed after this phase. The `DATABASE_URL` env variable points to PostgreSQL.

---

## Step 3.2 — Initialize Prisma

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`. Replace the generated schema with the full project schema in the next step.

---

## Step 3.3 — Define the Full Prisma Schema

Replace the contents of `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ───────────────────────────────────────────────────────────────────

enum VideoStatus {
  UPLOADING
  PROCESSING
  READY
  FAILED
}

// ─── Models ──────────────────────────────────────────────────────────────────

model User {
  id           String   @id @default(cuid())
  username     String   @unique
  email        String   @unique
  fullName     String
  avatar       String
  coverImage   String?
  password     String
  refreshToken String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  videos        Video[]
  comments      Comment[]
  likes         Like[]
  tweets        Tweet[]
  playlists     Playlist[]
  watchHistory  WatchHistory[]
  subscriptions Subscription[] @relation("Subscriber")
  subscribers   Subscription[] @relation("Channel")
  notifications Notification[]

  @@map("users")
}

model Video {
  id          String      @id @default(cuid())
  videoFile   String
  thumbnail   String
  title       String
  description String
  duration    Float       @default(0)
  views       Int         @default(0)
  isPublished Boolean     @default(true)
  status      VideoStatus @default(READY)
  ownerId     String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  owner        User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  comments     Comment[]
  likes        Like[]
  watchHistory WatchHistory[]
  playlists    PlaylistVideo[]

  @@index([ownerId])
  @@index([isPublished, status])
  @@map("videos")
}

model Comment {
  id        String   @id @default(cuid())
  content   String
  videoId   String
  ownerId   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  video Video   @relation(fields: [videoId], references: [id], onDelete: Cascade)
  owner User    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  likes Like[]

  @@index([videoId])
  @@map("comments")
}

model Like {
  id        String   @id @default(cuid())
  likedById String
  videoId   String?
  commentId String?
  tweetId   String?
  createdAt DateTime @default(now())

  likedBy User     @relation(fields: [likedById], references: [id], onDelete: Cascade)
  video   Video?   @relation(fields: [videoId], references: [id], onDelete: Cascade)
  comment Comment? @relation(fields: [commentId], references: [id], onDelete: Cascade)
  tweet   Tweet?   @relation(fields: [tweetId], references: [id], onDelete: Cascade)

  @@unique([likedById, videoId])
  @@unique([likedById, commentId])
  @@unique([likedById, tweetId])
  @@map("likes")
}

model Subscription {
  id           String   @id @default(cuid())
  subscriberId String
  channelId    String
  createdAt    DateTime @default(now())

  subscriber User @relation("Subscriber", fields: [subscriberId], references: [id], onDelete: Cascade)
  channel    User @relation("Channel", fields: [channelId], references: [id], onDelete: Cascade)

  @@unique([subscriberId, channelId])
  @@index([channelId])
  @@map("subscriptions")
}

model Tweet {
  id        String   @id @default(cuid())
  content   String
  ownerId   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  likes Like[]

  @@index([ownerId])
  @@map("tweets")
}

model Playlist {
  id          String   @id @default(cuid())
  name        String
  description String
  ownerId     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  owner  User            @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  videos PlaylistVideo[]

  @@index([ownerId])
  @@map("playlists")
}

model PlaylistVideo {
  playlistId String
  videoId    String
  position   Int
  addedAt    DateTime @default(now())

  playlist Playlist @relation(fields: [playlistId], references: [id], onDelete: Cascade)
  video    Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@id([playlistId, videoId])
  @@map("playlist_videos")
}

model WatchHistory {
  userId    String
  videoId   String
  watchedAt DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  video Video @relation(fields: [videoId], references: [id], onDelete: Cascade)

  @@id([userId, videoId])
  @@map("watch_history")
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  payload   Json
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("notifications")
}
```

---

## Step 3.4 — Create the Prisma Client Singleton

Create `src/config/database.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

---

## Step 3.5 — Update `src/index.ts`

Replace the MongoDB `connectDB` call with Prisma connection:

```typescript
import { app } from './app.js';
import { prisma } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function main() {
  await prisma.$connect();
  console.log('PostgreSQL connected via Prisma');

  app.on('error', (err) => {
    console.error('Express error', err);
    throw err;
  });

  app.listen(process.env.PORT ?? 8000, () => {
    console.log(`Server is running on port ${process.env.PORT ?? 8000}`);
  });
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
```

---

## Step 3.6 — Mongoose → Prisma Query Translation Reference

Use this table when converting every controller:

| Mongoose Pattern | Prisma Equivalent |
|---|---|
| `Model.findById(id)` | `prisma.model.findUnique({ where: { id } })` |
| `Model.findOne({ $or: [{email}, {username}] })` | `prisma.model.findFirst({ where: { OR: [{email}, {username}] } })` |
| `Model.create({ ...data })` | `prisma.model.create({ data })` |
| `new Model(data); await model.save()` | `prisma.model.create({ data })` |
| `Model.findByIdAndUpdate(id, { $set: data }, { new: true })` | `prisma.model.update({ where: { id }, data })` |
| `Model.findByIdAndDelete(id)` | `prisma.model.delete({ where: { id } })` |
| `Model.findOneAndDelete({ _id, owner: userId })` | `prisma.model.delete({ where: { id, ownerId: userId } })` |
| `Model.findOneAndUpdate({ _id, owner }, update, { new: true })` | `prisma.model.update({ where: { id, ownerId }, data: update })` |
| `Model.countDocuments({ video: videoId })` | `prisma.model.count({ where: { videoId } })` |
| `Model.find({ owner: userId }).sort({ createdAt: -1 })` | `prisma.model.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } })` |
| `Model.exists({ _id, owner })` | `prisma.model.findFirst({ where: { id, ownerId }, select: { id: true } })` |
| `Model.findById(id).select('-password -refreshToken')` | `prisma.model.findUnique({ where: { id }, omit: { password: true, refreshToken: true } })` or use `select` |
| `Model.findById(id).populate('owner', 'username avatar')` | `prisma.model.findUnique({ where: { id }, include: { owner: { select: { username: true, avatar: true } } } })` |
| `isValidObjectId(id)` | Not needed — cuid IDs are always strings. Validate with `if (!id)` or Zod in Phase 4 |

---

## Step 3.7 — Convert Each Controller

### `user.controller.ts` — Key Translations

**`generateTokens` helper:**
```typescript
const generateTokens = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(500, 'User not found');

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

  await prisma.user.update({ where: { id: userId }, data: { refreshToken } });
  return { accessToken, refreshToken };
};
```

**`registerUser`:**
```typescript
// Check for existing user
const existingUser = await prisma.user.findFirst({
  where: { OR: [{ username }, { email }] },
});
// ...
// Create user
const user = await prisma.user.create({
  data: { username: username.toLowerCase(), email, password: hashedPassword, fullName, avatar: avatar.url, coverImage: coverImage?.url },
});
// Return without sensitive fields
const { password: _pwd, refreshToken: _rt, ...safeUser } = user;
```

**`loginUser`:**
```typescript
const user = await prisma.user.findFirst({
  where: { OR: [{ email }, { username }] },
});
```

**`logoutUser`:**
```typescript
await prisma.user.update({
  where: { id: req.user!.id },
  data: { refreshToken: null },
});
```

**`getUserChannelProfile`:**
```typescript
const user = await prisma.user.findUnique({
  where: { username: username.toLowerCase() },
  include: {
    subscribers: true,
    subscriptions: true,
  },
  omit: { password: true, refreshToken: true },
});
if (!user) throw new ApiError(404, 'Channel does not exist');

const subscribersCount = user.subscribers.length;
const subscribedToCount = user.subscriptions.length;
const isSubscribed = user.subscribers.some(s => s.subscriberId === req.user?.id);
```

**`getWatchHistory`:**
```typescript
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
const videos = history.map(h => h.video);
```

---

### `video.controller.ts` — Key Translations

**`getAllVideos` — Full Implementation** (was a stub):
```typescript
const getAllVideos = asyncHandler(async (req: Request, res: Response) => {
  const {
    page = '1',
    limit = '10',
    query = '',
    sortBy = 'createdAt',
    sortType = 'desc',
    userId,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const validSortFields = ['createdAt', 'views', 'duration'] as const;
  const validSortTypes = ['asc', 'desc'] as const;
  const sortField = validSortFields.includes(sortBy as typeof validSortFields[number])
    ? sortBy : 'createdAt';
  const sortDirection = validSortTypes.includes(sortType as typeof validSortTypes[number])
    ? sortType : 'desc';

  const where = {
    isPublished: true,
    status: 'READY' as const,
    ...(query && {
      OR: [
        { title: { contains: query, mode: 'insensitive' as const } },
        { description: { contains: query, mode: 'insensitive' as const } },
      ],
    }),
    ...(userId && { ownerId: userId }),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sortField]: sortDirection },
      include: {
        owner: { select: { id: true, username: true, avatar: true, fullName: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.video.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limitNum);

  return res.status(200).json(
    new ApiResponse(200, {
      videos,
      pagination: {
        total,
        totalPages,
        page: pageNum,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    }, 'Videos fetched successfully'),
  );
});
```

**`publishAVideo`:**
```typescript
const newVideo = await prisma.video.create({
  data: {
    videoFile: video.secure_url,
    thumbnail: thumb.secure_url,
    title,
    description,
    duration: video.duration ?? 0,
    ownerId: req.user!.id,
    status: 'READY',
  },
});
```

---

### `comment.controller.ts` — Key Translations

**`getVideoComments` (replaces aggregate):**
```typescript
const [comments, total] = await Promise.all([
  prisma.comment.findMany({
    where: { videoId },
    include: {
      owner: { select: { id: true, username: true, avatar: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  }),
  prisma.comment.count({ where: { videoId } }),
]);
```

**`addComment`:**
```typescript
const newComment = await prisma.comment.create({
  data: { content: comment, videoId, ownerId: req.user!.id },
  include: { owner: { select: { id: true, username: true, avatar: true } } },
});
```

**`updateComment`:**
```typescript
// Check ownership first
const existing = await prisma.comment.findFirst({
  where: { id: commentId, ownerId: req.user!.id },
});
if (!existing) throw new ApiError(404, "Comment not found or unauthorized");

const updated = await prisma.comment.update({
  where: { id: commentId },
  data: { content: comment },
});
```

---

### `like.controller.ts` — Toggle Pattern with Transactions

**`toggleVideoLike`:**
```typescript
const toggleVideoLike = asyncHandler(async (req: Request, res: Response) => {
  const { videoId } = req.params;
  const userId = req.user!.id;

  // Use upsert pattern with unique constraint
  // If the like exists, delete it (unlike). If not, create it (like).
  const existingLike = await prisma.like.findUnique({
    where: { likedById_videoId: { likedById: userId, videoId } },
  });

  let message: string;
  if (existingLike) {
    await prisma.like.delete({
      where: { likedById_videoId: { likedById: userId, videoId } },
    });
    message = 'Unliked successfully';
  } else {
    await prisma.like.create({ data: { likedById: userId, videoId } });
    message = 'Liked successfully';
  }

  const likeCount = await prisma.like.count({ where: { videoId } });
  return res.status(200).json(new ApiResponse(200, { likeCount, liked: !existingLike }, message));
});
```

Apply same pattern for `toggleCommentLike` and `toggleTweetLike`.

**`getLikedVideos`:**
```typescript
const liked = await prisma.like.findMany({
  where: { likedById: req.user!.id, videoId: { not: null } },
  include: {
    video: {
      include: { owner: { select: { username: true, avatar: true } } },
    },
  },
  orderBy: { createdAt: 'desc' },
});
const videos = liked.map(l => l.video).filter(Boolean);
```

---

### `subscription.controller.ts` — Key Translations

**`toggleSubscription`:**
```typescript
const existing = await prisma.subscription.findUnique({
  where: { subscriberId_channelId: { subscriberId: userId, channelId } },
});

if (existing) {
  await prisma.subscription.delete({
    where: { subscriberId_channelId: { subscriberId: userId, channelId } },
  });
} else {
  await prisma.subscription.create({ data: { subscriberId: userId, channelId } });
}

const count = await prisma.subscription.count({ where: { channelId } });
```

**`getUserChannelSubscribers`:**
```typescript
const result = await prisma.subscription.findMany({
  where: { channelId },
  include: { subscriber: { select: { id: true, username: true, avatar: true, fullName: true } } },
});
const subscriberCount = result.length;
const subscribers = result.map(s => s.subscriber);
```

**`getSubscribedChannels`:**
```typescript
const result = await prisma.subscription.findMany({
  where: { subscriberId },
  include: { channel: { select: { id: true, username: true, avatar: true, fullName: true } } },
});
const channels = result.map(s => s.channel);
```

---

### `dashboard.controller.ts` — Complex Aggregations

**`getChannelStats`:**
```typescript
const [videoStats, subscriberCount, totalLikes] = await Promise.all([
  prisma.video.aggregate({
    where: { ownerId: channelId },
    _sum: { views: true },
    _count: { _all: true },
  }),
  prisma.subscription.count({ where: { channelId } }),
  prisma.like.count({ where: { video: { ownerId: channelId } } }),
]);

const stats = {
  totalVideos: videoStats._count._all,
  totalViews: videoStats._sum.views ?? 0,
  totalSubscribers: subscriberCount,
  totalLikes,
};
```

**`getChannelVideos`:**
```typescript
const videos = await prisma.video.findMany({
  where: { ownerId: channelId },
  include: {
    _count: { select: { likes: true, comments: true } },
    owner: { select: { username: true, avatar: true } },
  },
  orderBy: { createdAt: 'desc' },
});
```

---

### `tweet.controller.ts` — Straightforward Translations

```typescript
// createTweet
await prisma.tweet.create({ data: { content: tweet.trim(), ownerId: req.user!.id } });

// getUserTweets
const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
if (!user) throw new ApiError(404, 'User not found');
const tweets = await prisma.tweet.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' } });

// updateTweet
const existing = await prisma.tweet.findFirst({ where: { id: tweetId, ownerId: req.user!.id } });
if (!existing) throw new ApiError(404, "Tweet not found or unauthorized");
await prisma.tweet.update({ where: { id: tweetId }, data: { content: tweet } });

// deleteTweet
const deleted = await prisma.tweet.deleteMany({ where: { id: tweetId, ownerId: req.user!.id } });
if (deleted.count === 0) throw new ApiError(404, "Tweet not found or unauthorized");
```

---

### `playlist.controller.ts` — Key Translations

**`addVideoToPlaylist` — requires ownership check:**
```typescript
// Verify playlist belongs to user
const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
if (!playlist) throw new ApiError(404, 'Playlist not found');
if (playlist.ownerId !== req.user!.id) throw new ApiError(403, 'Unauthorized');

// Check if video is already in playlist
const existing = await prisma.playlistVideo.findUnique({
  where: { playlistId_videoId: { playlistId, videoId } },
});
if (existing) throw new ApiError(400, 'Video already in playlist');

// Get current max position
const maxPos = await prisma.playlistVideo.aggregate({
  where: { playlistId },
  _max: { position: true },
});
const position = (maxPos._max.position ?? 0) + 1;

await prisma.playlistVideo.create({ data: { playlistId, videoId, position } });
```

---

## Step 3.8 — Update Auth Middleware

Update `src/types/express.d.ts` to use Prisma types:

```typescript
// src/types/express.d.ts
export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        fullName: string;
        avatar: string;
      };
    }
  }
}
```

Update `src/middlewares/auth.middleware.ts` JWT payload:

```typescript
interface JwtPayload {
  id: string;  // Changed from _id to id
}

// ...
const user = await prisma.user.findUnique({
  where: { id: decodedToken.id },
  select: { id: true, username: true, email: true, fullName: true, avatar: true },
});
req.user = user ?? undefined;
```

---

## Step 3.9 — Delete Mongoose Files

After all controllers are updated and tested:

```bash
# Delete all Mongoose model files
rm src/models/user.model.ts
rm src/models/video.model.ts
rm src/models/comment.model.ts
rm src/models/like.model.ts
rm src/models/subscription.model.ts
rm src/models/tweet.model.ts
rm src/models/playlist.model.ts

# Delete MongoDB connection
rm -rf src/db/

# Delete constants (DB_NAME no longer needed)
rm src/constants.ts
```

---

## Step 3.10 — Create Prisma Seed File

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create test users
  const password = await bcrypt.hash('Password123!', 10);

  const alice = await prisma.user.create({
    data: {
      username: 'alice',
      email: 'alice@example.com',
      password,
      fullName: 'Alice Johnson',
      avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    },
  });

  const bob = await prisma.user.create({
    data: {
      username: 'bob',
      email: 'bob@example.com',
      password,
      fullName: 'Bob Smith',
      avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    },
  });

  // Alice creates videos
  const video1 = await prisma.video.create({
    data: {
      title: 'Introduction to TypeScript',
      description: 'A comprehensive intro to TypeScript for beginners.',
      videoFile: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
      thumbnail: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      duration: 600,
      views: 150,
      ownerId: alice.id,
      status: 'READY',
    },
  });

  // Bob subscribes to Alice
  await prisma.subscription.create({
    data: { subscriberId: bob.id, channelId: alice.id },
  });

  // Bob comments on video
  await prisma.comment.create({
    data: { content: 'Great video!', videoId: video1.id, ownerId: bob.id },
  });

  // Bob likes the video
  await prisma.like.create({
    data: { likedById: bob.id, videoId: video1.id },
  });

  // Alice creates a tweet
  await prisma.tweet.create({
    data: { content: 'Just uploaded a new TypeScript tutorial!', ownerId: alice.id },
  });

  // Alice creates a playlist
  const playlist = await prisma.playlist.create({
    data: { name: 'TypeScript Series', description: 'All TS tutorials', ownerId: alice.id },
  });

  await prisma.playlistVideo.create({
    data: { playlistId: playlist.id, videoId: video1.id, position: 1 },
  });

  console.log('Seed data created successfully');
  console.log('Alice credentials: alice@example.com / Password123!');
  console.log('Bob credentials: bob@example.com / Password123!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

Add seed script to `package.json`:
```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

---

## Step 3.11 — Run Migration

```bash
# Generate the initial migration
npx prisma migrate dev --name init

# Generate the Prisma Client
npx prisma generate

# Seed the database
npx prisma db seed
```

---

## Deliverables Checklist

- [ ] `prisma/schema.prisma` created with all 10 models
- [ ] `src/config/database.ts` created with Prisma singleton
- [ ] `src/index.ts` updated to use `prisma.$connect()`
- [ ] `user.controller.ts` — all Mongoose queries replaced with Prisma
- [ ] `video.controller.ts` — all queries replaced, `getAllVideos` fully implemented
- [ ] `comment.controller.ts` — all queries replaced
- [ ] `like.controller.ts` — toggle pattern using unique constraint
- [ ] `subscription.controller.ts` — all queries replaced
- [ ] `tweet.controller.ts` — all queries replaced
- [ ] `playlist.controller.ts` — all queries replaced including `PlaylistVideo`
- [ ] `dashboard.controller.ts` — aggregations replaced with Prisma aggregate + count
- [ ] `src/middlewares/auth.middleware.ts` — uses Prisma, `id` instead of `_id`
- [ ] `src/types/express.d.ts` — `AuthUser` uses `id` not `_id`
- [ ] All 7 Mongoose model files deleted
- [ ] `src/db/` directory deleted
- [ ] `src/constants.ts` deleted
- [ ] `mongoose` removed from `package.json`
- [ ] `prisma/migrations/` has initial migration
- [ ] `prisma/seed.ts` created

---

## Verification

```bash
# 1. Prisma migration runs clean
npx prisma migrate dev --name init
# Expected: migration applied, no errors

# 2. Prisma Studio shows all tables
npx prisma studio
# Opens browser: http://localhost:5555
# Verify all 10 tables exist with correct columns

# 3. Seed runs successfully
npx prisma db seed
# Expected: "Seed data created successfully"

# 4. TypeScript builds
npm run type-check
# Expected: zero errors

# 5. Server starts
npm run dev
# Expected: "PostgreSQL connected via Prisma"

# 6. Full API smoke test
# Register a user
curl -X POST http://localhost:8000/api/v1/users/register \
  -F "username=testuser" \
  -F "email=test@test.com" \
  -F "password=Password123!" \
  -F "fullName=Test User" \
  -F "avatar=@/path/to/image.jpg"

# getAllVideos with pagination
curl "http://localhost:8000/api/v1/videos?page=1&limit=5&query=typescript"
# Expected: paginated response with totalPages, hasNextPage, etc.
```

---

## Notes

- **ID format change**: All IDs are now `cuid` strings like `clxxxxxx` instead of MongoDB ObjectIDs like `507f191e810c19729de860ea`. Any hardcoded ID validation using `isValidObjectId` has been removed.
- **`watcHHistory` typo**: Fixed — the Prisma model uses `watchHistory` (correct spelling)
- **Cascade deletes**: The Prisma schema uses `onDelete: Cascade` on all relations. Deleting a `User` deletes all their videos, comments, likes, tweets, playlists, subscriptions, and notifications automatically.
- **Playlist ordering**: Videos in playlists now have a `position` field for ordering — an improvement over the MongoDB array approach.
- **`getAllVideos` is now fully implemented** — previously a `TODO` stub.

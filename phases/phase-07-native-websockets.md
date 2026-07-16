# Phase 7 — Native WebSocket Layer

> **Status**: Not started  
> **Estimated Time**: 5–6 hours  
> **Prerequisite**: Phase 6 complete  
> **Scope**: Implement a production-grade WebSocket server using the `ws` library. Support JWT authentication, room-based messaging, heartbeat, job progress streaming, and real-time notification delivery. Add notification REST endpoints.

---

## Objective

Build a fully custom WebSocket layer without Socket.IO. Demonstrates understanding of raw WebSocket protocol — ConnectionManager, RoomManager, heartbeat, and typed message protocol are all implemented manually.

> **Why `ws` over Socket.IO**: `ws` implements raw RFC 6455 WebSockets. No transport negotiation, no custom reconnection abstraction, no built-in namespace system. The manual implementations here (ConnectionManager, RoomManager, heartbeat) demonstrate protocol-level understanding, which is significantly more impressive in backend engineering interviews.

---

## Step 7.1 — Install Dependencies

```bash
npm install ws
npm install -D @types/ws
```

---

## Step 7.2 — WebSocket Message Protocol

All messages between server and client are JSON with a `type` discriminant. Define all possible message shapes.

Create `src/websocket/events/types.ts`:

```typescript
// ─── Notification Payload ────────────────────────────────────────────────────

export interface NotificationPayload {
  id: string;
  type: 'new_video' | 'new_subscriber' | 'video_ready' | 'video_failed';
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ─── Video Progress Payload ──────────────────────────────────────────────────

export interface VideoProgressPayload {
  videoId: string;
  jobId: string;
  progress: number;           // 0–100
  stage: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'retry';
}

// ─── Server → Client Messages ─────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'ping' }
  | { type: 'connection_ack'; payload: { userId: string; connectionId: string } }
  | { type: 'notification'; payload: NotificationPayload }
  | { type: 'video:queued';     payload: { videoId: string; jobId: string } }
  | { type: 'video:active';     payload: VideoProgressPayload }
  | { type: 'video:completed';  payload: { videoId: string; duration: number } }
  | { type: 'video:failed';     payload: { videoId: string; reason: string } }
  | { type: 'video:retry';      payload: { videoId: string; attempt: number; maxAttempts: number } }
  | { type: 'error'; payload: { code: string; message: string } };

// ─── Client → Server Messages ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'pong' }
  | { type: 'ping' };
```

---

## Step 7.3 — Connection Manager

Create `src/websocket/connection.manager.ts`:

```typescript
import { WebSocket } from 'ws';
import { logger } from '../config/logger.js';
import type { ServerMessage } from './events/types.js';

export interface ManagedSocket {
  socket: WebSocket;
  userId: string;
  connectionId: string;
  isAlive: boolean;
  connectedAt: Date;
}

/**
 * ConnectionManager tracks all active WebSocket connections.
 * Maps userId → Set<ManagedSocket> to support multiple connections
 * per user (multiple tabs, devices).
 */
export class ConnectionManager {
  // userId → Set of all active connections for that user
  private readonly userConnections = new Map<string, Set<ManagedSocket>>();
  // socket instance → managed socket (for O(1) lookup on disconnect)
  private readonly socketIndex = new Map<WebSocket, ManagedSocket>();

  /**
   * Register a new authenticated WebSocket connection.
   */
  register(managed: ManagedSocket): void {
    const { userId, socket } = managed;

    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(managed);
    this.socketIndex.set(socket, managed);

    logger.debug(
      { userId, connectionId: managed.connectionId, totalConnections: this.getOnlineCount() },
      'WebSocket: connection registered',
    );
  }

  /**
   * Remove a connection by socket instance.
   */
  unregister(socket: WebSocket): void {
    const managed = this.socketIndex.get(socket);
    if (!managed) return;

    const { userId, connectionId } = managed;

    this.userConnections.get(userId)?.delete(managed);
    if (this.userConnections.get(userId)?.size === 0) {
      this.userConnections.delete(userId);
    }
    this.socketIndex.delete(socket);

    logger.debug(
      { userId, connectionId, totalConnections: this.getOnlineCount() },
      'WebSocket: connection unregistered',
    );
  }

  /**
   * Send a typed message to all connections for a specific user.
   * Silently skips closed or non-open sockets.
   */
  sendToUser(userId: string, message: ServerMessage): void {
    const connections = this.userConnections.get(userId);
    if (!connections || connections.size === 0) return;

    const data = JSON.stringify(message);
    for (const managed of connections) {
      if (managed.socket.readyState === WebSocket.OPEN) {
        managed.socket.send(data, (err) => {
          if (err) logger.error({ err, userId, connectionId: managed.connectionId }, 'WebSocket: send error');
        });
      }
    }
  }

  /**
   * Send a message to multiple users (notification fan-out).
   */
  broadcastToUsers(userIds: string[], message: ServerMessage): void {
    for (const userId of userIds) {
      this.sendToUser(userId, message);
    }
  }

  /**
   * Check if a user has at least one active connection.
   */
  isOnline(userId: string): boolean {
    return (this.userConnections.get(userId)?.size ?? 0) > 0;
  }

  /**
   * Total number of unique online users.
   */
  getOnlineCount(): number {
    return this.userConnections.size;
  }

  /**
   * All managed sockets — used by heartbeat to iterate all connections.
   */
  getAllManagedSockets(): ManagedSocket[] {
    return Array.from(this.socketIndex.values());
  }

  /**
   * Get all connections for a user — for external status checks.
   */
  getUserConnections(userId: string): Set<ManagedSocket> {
    return this.userConnections.get(userId) ?? new Set();
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
// Shared across the application and imported by workers for WS delivery.
export const connectionManager = new ConnectionManager();
```

---

## Step 7.4 — Room Manager

Create `src/websocket/room.manager.ts`:

```typescript
import { logger } from '../config/logger.js';
import { connectionManager } from './connection.manager.js';
import type { ServerMessage } from './events/types.js';

/**
 * RoomManager implements manual topic-based fan-out.
 * Rooms are identified by string keys (e.g., "user:abc123", "video:xyz789").
 * Unlike Socket.IO, rooms here are just userId registries — the actual
 * WebSocket delivery still goes through ConnectionManager.
 */
export class RoomManager {
  // roomId → Set<userId>
  private readonly rooms = new Map<string, Set<string>>();
  // userId → Set<roomId> (reverse index for cleanup)
  private readonly userRooms = new Map<string, Set<string>>();

  join(roomId: string, userId: string): void {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Set());
    this.rooms.get(roomId)!.add(userId);

    if (!this.userRooms.has(userId)) this.userRooms.set(userId, new Set());
    this.userRooms.get(userId)!.add(roomId);

    logger.debug({ roomId, userId }, 'Room: user joined');
  }

  leave(roomId: string, userId: string): void {
    this.rooms.get(roomId)?.delete(userId);
    if (this.rooms.get(roomId)?.size === 0) {
      this.rooms.delete(roomId);
    }
    this.userRooms.get(userId)?.delete(roomId);
    logger.debug({ roomId, userId }, 'Room: user left');
  }

  /**
   * Remove a user from all rooms they're in.
   * Called on disconnect.
   */
  leaveAll(userId: string): void {
    const rooms = this.userRooms.get(userId);
    if (!rooms) return;

    for (const roomId of rooms) {
      this.rooms.get(roomId)?.delete(userId);
      if (this.rooms.get(roomId)?.size === 0) {
        this.rooms.delete(roomId);
      }
    }
    this.userRooms.delete(userId);
  }

  /**
   * Send a message to all users in a room via ConnectionManager.
   */
  broadcastToRoom(
    roomId: string,
    message: ServerMessage,
    excludeUserId?: string,
  ): void {
    const members = this.rooms.get(roomId);
    if (!members) return;

    for (const userId of members) {
      if (userId !== excludeUserId) {
        connectionManager.sendToUser(userId, message);
      }
    }
  }

  getMembers(roomId: string): Set<string> {
    return this.rooms.get(roomId) ?? new Set();
  }

  getUserRooms(userId: string): Set<string> {
    return this.userRooms.get(userId) ?? new Set();
  }
}

export const roomManager = new RoomManager();
```

---

## Step 7.5 — WebSocket Auth Middleware

Create `src/websocket/middleware/ws-auth.middleware.ts`:

```typescript
import jwt from 'jsonwebtoken';
import type { IncomingMessage } from 'http';
import { env } from '../../config/env.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

export interface WsAuthResult {
  userId: string;
  username: string;
}

/**
 * Authenticates a WebSocket upgrade request.
 *
 * Token is expected as a URL query parameter: ws://host?token=<jwt>
 * Falls back to the Sec-WebSocket-Protocol header for environments
 * that don't support URL query params easily.
 *
 * Returns null if authentication fails (caller should close the socket).
 */
export async function authenticateWsConnection(
  request: IncomingMessage,
): Promise<WsAuthResult | null> {
  try {
    const url = new URL(request.url ?? '', `ws://${request.headers.host}`);
    const token =
      url.searchParams.get('token') ??
      (request.headers['sec-websocket-protocol'] as string | undefined);

    if (!token) {
      logger.warn('WebSocket: connection attempted without token');
      return null;
    }

    interface JwtPayload { id: string }
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as JwtPayload;

    // Verify user still exists in DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, username: true },
    });

    if (!user) {
      logger.warn({ userId: decoded.id }, 'WebSocket: user not found in DB');
      return null;
    }

    return { userId: user.id, username: user.username };
  } catch (err) {
    logger.warn({ err }, 'WebSocket: authentication failed');
    return null;
  }
}
```

---

## Step 7.6 — WebSocket Server

Create `src/websocket/websocket.server.ts`:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import crypto from 'crypto';
import { authenticateWsConnection } from './middleware/ws-auth.middleware.js';
import { connectionManager } from './connection.manager.js';
import { roomManager } from './room.manager.js';
import { logger } from '../config/logger.js';
import type { ClientMessage, ServerMessage } from './events/types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;   // Send ping every 30 seconds
const PONG_TIMEOUT_MS = 10_000;         // Allow 10 seconds for pong response

/**
 * Safely sends a typed message to a single WebSocket.
 * No-op if the socket is not in OPEN state.
 */
function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/**
 * Creates and attaches a WebSocket server to an existing HTTP server.
 * Both HTTP and WebSocket traffic run on the same port.
 */
export function createWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', async (socket: WebSocket, request) => {
    // ── Step 1: Authenticate ──────────────────────────────────────────────────
    const authResult = await authenticateWsConnection(request);
    if (!authResult) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const { userId, username } = authResult;
    const connectionId = crypto.randomUUID();

    // ── Step 2: Register connection ───────────────────────────────────────────
    const managed = {
      socket,
      userId,
      connectionId,
      isAlive: true,
      connectedAt: new Date(),
    };

    connectionManager.register(managed);
    roomManager.join(`user:${userId}`, userId);   // Personal room for targeted delivery

    logger.info({ userId, username, connectionId }, 'WebSocket: client connected');

    // ── Step 3: Send connection acknowledgement ───────────────────────────────
    sendMessage(socket, {
      type: 'connection_ack',
      payload: { userId, connectionId },
    });

    // ── Step 4: Message handler ───────────────────────────────────────────────
    socket.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString()) as ClientMessage;

        switch (message.type) {
          case 'pong':
            // Mark connection as alive — heartbeat response received
            managed.isAlive = true;
            break;
          case 'ping':
            // Client-initiated ping — respond with pong
            sendMessage(socket, { type: 'ping' }); // Server uses "ping" type for both directions
            break;
          default:
            logger.warn({ userId, type: (message as any).type }, 'WebSocket: unknown message type');
        }
      } catch {
        logger.warn({ userId, connectionId }, 'WebSocket: invalid message format (not JSON)');
      }
    });

    // ── Step 5: Close handler ─────────────────────────────────────────────────
    socket.on('close', (code, reason) => {
      connectionManager.unregister(socket);
      roomManager.leaveAll(userId);
      logger.info(
        { userId, connectionId, code, reason: reason.toString() },
        'WebSocket: client disconnected',
      );
    });

    // ── Step 6: Error handler ─────────────────────────────────────────────────
    socket.on('error', (err) => {
      logger.error({ userId, connectionId, err }, 'WebSocket: socket error');
      // Socket will emit 'close' after error — cleanup happens there
    });
  });

  // ── Heartbeat Interval ────────────────────────────────────────────────────────
  // Every HEARTBEAT_INTERVAL_MS:
  // 1. Any connection that didn't respond to the previous ping → terminate (dead connection)
  // 2. Mark all alive connections as "not alive yet" (reset flag)
  // 3. Send ping to all connections
  //
  // This prevents ghost connections from accumulating memory.
  const heartbeatInterval = setInterval(() => {
    const allSockets = connectionManager.getAllManagedSockets();

    for (const managed of allSockets) {
      if (!managed.isAlive) {
        // No pong received since last ping — dead connection
        logger.warn(
          { userId: managed.userId, connectionId: managed.connectionId },
          'WebSocket: terminating dead connection (no heartbeat response)',
        );
        managed.socket.terminate();
        connectionManager.unregister(managed.socket);
        roomManager.leaveAll(managed.userId);
        continue;
      }

      // Reset alive flag — will be set back to true when pong is received
      managed.isAlive = false;
      sendMessage(managed.socket, { type: 'ping' });
    }

    logger.debug(
      { onlineUsers: connectionManager.getOnlineCount() },
      'WebSocket: heartbeat tick',
    );
  }, HEARTBEAT_INTERVAL_MS);

  // ── Cleanup on server close ───────────────────────────────────────────────────
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    logger.info('WebSocket server closed');
  });

  logger.info('WebSocket server initialized');
  return wss;
}
```

---

## Step 7.7 — Update `src/index.ts`

Attach WebSocket server to the HTTP server:

```typescript
import './config/env.js';
import { createServer } from 'http';
import { app } from './app.js';
import { prisma } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { createWebSocketServer } from './websocket/websocket.server.js';

// HTTP server wraps Express app
const httpServer = createServer(app);

// WebSocket server attaches to the same port via the 'upgrade' event
const wss = createWebSocketServer(httpServer);

async function main() {
  await prisma.$connect();
  logger.info('Database connected');

  // Listen on HTTP server (not app.listen) so WS upgrades are handled
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
    logger.info(`API: http://localhost:${env.PORT}/api/v1`);
    logger.info(`Docs: http://localhost:${env.PORT}/docs`);
    logger.info(`Queues: http://localhost:${env.PORT}/admin/queues`);
    logger.info(`WebSocket: ws://localhost:${env.PORT}?token=<jwt>`);
  });
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  httpServer.close(async () => {
    wss.close();
    await prisma.$disconnect();
    await disconnectRedis();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught exception'); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.fatal({ reason }, 'Unhandled rejection'); process.exit(1); });

main().catch((err) => { logger.fatal({ err }, 'Startup failed'); process.exit(1); });
```

---

## Step 7.8 — Update Workers to Deliver WebSocket Events

### `src/workers/video.worker.ts` — Add WS progress events

```typescript
import { connectionManager } from '../websocket/connection.manager.js';

// In processVideoJob, after each status change:

// After status = PROCESSING:
connectionManager.sendToUser(ownerId, {
  type: 'video:active',
  payload: { videoId, jobId: job.id!, progress: 20, stage: 'PROCESSING', status: 'active' },
});

// After metadata fetch + status = READY:
connectionManager.sendToUser(ownerId, {
  type: 'video:completed',
  payload: { videoId, duration: metadata.duration },
});

// In failed handler:
connectionManager.sendToUser(job.data.ownerId, {
  type: 'video:failed',
  payload: { videoId: job.data.videoId, reason: err.message },
});

// On retry:
videoWorker.on('error', (err) => {
  // BullMQ retry events handled via 'failed' with remainingAttempts > 0
});
```

### `src/workers/notification.worker.ts` — Deliver live notifications

```typescript
import { connectionManager } from '../websocket/connection.manager.js';
import { prisma } from '../config/database.js';

// After DB insert in processNotificationJob:

// Fetch the inserted notification IDs (for payload)
// Then deliver to online users:
for (const userId of targetUserIds) {
  if (connectionManager.isOnline(userId)) {
    connectionManager.sendToUser(userId, {
      type: 'notification',
      payload: {
        id: crypto.randomUUID(),  // Client-side dedup ID
        type,
        message: payload.message,
        payload: payload as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      },
    });
  }
  // Offline users: notification is in DB, fetched via REST on next login
}
```

---

## Step 7.9 — Notification REST Endpoints

Create `src/modules/notification/` module:

**`src/modules/notification/notification.repository.ts`**:
```typescript
import { prisma } from '../../config/database.js';

export class NotificationRepository {
  async findByUser(userId: string, page: number, limit: number) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async countByUser(userId: string) {
    return prisma.notification.count({ where: { userId } });
  }

  async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
```

**`src/modules/notification/notification.controller.ts`**:
```typescript
import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { NotificationRepository } from './notification.repository.js';

const repo = new NotificationRepository();

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query['page'] as string ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query['limit'] as string ?? '20', 10)));
  const userId = req.user!.id;

  const [notifications, total, unreadCount] = await Promise.all([
    repo.findByUser(userId, page, limit),
    repo.countByUser(userId),
    repo.countUnread(userId),
  ]);

  res.status(200).json(new ApiResponse(200, {
    notifications,
    pagination: {
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
      hasNextPage: page < Math.ceil(total / limit),
    },
    unreadCount,
  }, 'Notifications fetched'));
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  await repo.markAsRead(id, req.user!.id);
  res.status(200).json(new ApiResponse(200, {}, 'Notification marked as read'));
});

export const markAllNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await repo.markAllAsRead(req.user!.id);
  res.status(200).json(new ApiResponse(200, { updated: result.count }, 'All notifications marked as read'));
});
```

**`src/modules/notification/notification.routes.ts`**:
```typescript
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/auth.middleware.js';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './notification.controller.js';

const router = Router();

router.get('/', verifyJWT, getNotifications);
router.patch('/read-all', verifyJWT, markAllNotificationsRead);
router.patch('/:id/read', verifyJWT, markNotificationRead);

export default router;
```

Add to `src/app.ts`:
```typescript
import notificationRouter from './modules/notification/notification.routes.js';
app.use('/api/v1/notifications', notificationRouter);
```

---

## Deliverables Checklist

- [ ] `ws` and `@types/ws` installed
- [ ] `src/websocket/events/types.ts` — ServerMessage and ClientMessage discriminated unions
- [ ] `src/websocket/connection.manager.ts` — ConnectionManager class + singleton export
- [ ] `src/websocket/room.manager.ts` — RoomManager class + singleton export
- [ ] `src/websocket/middleware/ws-auth.middleware.ts` — JWT auth for WS handshake
- [ ] `src/websocket/websocket.server.ts` — WebSocketServer with heartbeat, error handling
- [ ] `src/index.ts` — `createServer(app)` → attach WS server → `httpServer.listen()`
- [ ] `src/workers/video.worker.ts` — emits `video:active`, `video:completed`, `video:failed` events
- [ ] `src/workers/notification.worker.ts` — delivers `notification` events to online users
- [ ] `src/modules/notification/` — repository, controller, routes
- [ ] Notification routes registered in `app.ts`
- [ ] `GET /api/v1/notifications` — paginated inbox with `unreadCount`
- [ ] `PATCH /api/v1/notifications/:id/read` — mark one as read
- [ ] `PATCH /api/v1/notifications/read-all` — mark all as read

---

## Verification

```bash
# Install wscat for WebSocket testing
npm install -g wscat

# 1. Connect with valid JWT
wscat -c "ws://localhost:8000?token=<valid-access-token>"
# Expected:
# < {"type":"connection_ack","payload":{"userId":"...","connectionId":"..."}}
# Every 30s: < {"type":"ping"}
# Respond with: > {"type":"pong"}

# 2. Invalid token is rejected
wscat -c "ws://localhost:8000?token=invalid.token.here"
# Expected: Connection closed with code 4001

# 3. No token is rejected
wscat -c "ws://localhost:8000"
# Expected: Connection closed with code 4001

# 4. Subscribe to a channel and receive notification
# Terminal 1: Connect subscriber's WebSocket
wscat -c "ws://localhost:8000?token=<subscriber-token>"
# Terminal 2: Subscribe to a channel
curl -X POST http://localhost:8000/api/v1/subscriptions/c/<channelId> \
  -H "Authorization: Bearer <subscriber-token>"
# Terminal 1: Should receive notification event (if notifications implemented for subscriptions)

# 5. Upload video and watch progress events
wscat -c "ws://localhost:8000?token=<uploader-token>"
# In another terminal:
curl -X POST http://localhost:8000/api/v1/videos \
  -H "Authorization: Bearer <uploader-token>" \
  -F "title=Test" -F "description=Test" -F "videoFile=@test.mp4" -F "thumbnail=@thumb.jpg"
# WebSocket terminal should receive:
# < {"type":"video:active","payload":{"videoId":"...","progress":20,"stage":"PROCESSING",...}}
# < {"type":"video:completed","payload":{"videoId":"...","duration":120}}

# 6. Dead connection cleanup
# Connect, then close network — after 40s the connection should be cleaned up
# Check server logs: "WebSocket: terminating dead connection"

# 7. Notification REST API
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/notifications
# Expected: { notifications: [...], pagination: {...}, unreadCount: N }

# 8. Mark as read
curl -X PATCH http://localhost:8000/api/v1/notifications/<id>/read \
  -H "Authorization: Bearer <token>"
# Expected: 200 { message: "Notification marked as read" }

# 9. Multiple device connections
# Connect same user from two wscat sessions → both receive notifications
# Disconnect one → other still receives
```

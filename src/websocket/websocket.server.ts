import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import crypto from 'crypto';
import { authenticateWsConnection } from './middleware/ws-auth.middleware.js';
import { connectionManager } from './connection.manager.js';
import { roomManager } from './room.manager.js';
import { logger } from '../config/logger.js';
import type { ClientMessage, ServerMessage } from './events/types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;   // Send ping every 30 seconds

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
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade events manually to route to the correct connection handler
  httpServer.on('upgrade', async (request, socket, head) => {
    logger.debug({ url: request.url }, 'WebSocket: upgrade requested');

    // Upgrade verification & auth
    const authResult = await authenticateWsConnection(request);
    if (!authResult) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, authResult);
    });
  });

  // @ts-expect-error - overriding signature for connection event
  wss.on('connection', async (socket: WebSocket, _request, authResult: { userId: string; username: string }) => {
    const { userId, username } = authResult;
    const connectionId = crypto.randomUUID();

    // ── Step 1: Register connection ───────────────────────────────────────────
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

    // ── Step 2: Send connection acknowledgement ───────────────────────────────
    sendMessage(socket, {
      type: 'connection_ack',
      payload: { userId, connectionId },
    });

    // ── Step 3: Message handler ───────────────────────────────────────────────
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
            sendMessage(socket, { type: 'ping' });
            break;
          default:
            logger.warn({ userId, type: (message as any).type }, 'WebSocket: unknown message type');
        }
      } catch {
        logger.warn({ userId, connectionId }, 'WebSocket: invalid message format (not JSON)');
      }
    });

    // ── Step 4: Close handler ─────────────────────────────────────────────────
    socket.on('close', (code, reason) => {
      connectionManager.unregister(socket);
      roomManager.leaveAll(userId);
      logger.info(
        { userId, connectionId, code, reason: reason.toString() },
        'WebSocket: client disconnected',
      );
    });

    // ── Step 5: Error handler ─────────────────────────────────────────────────
    socket.on('error', (err) => {
      logger.error({ userId, connectionId, err }, 'WebSocket: socket error');
    });
  });

  // ── Heartbeat Interval ────────────────────────────────────────────────────────
  // Every HEARTBEAT_INTERVAL_MS:
  // 1. Any connection that didn't respond to the previous ping → terminate (dead connection)
  // 2. Mark all alive connections as "not alive yet" (reset flag)
  // 3. Send ping to all connections
  const heartbeatInterval = setInterval(() => {
    const allSockets = connectionManager.getAllManagedSockets();

    for (const managed of allSockets) {
      if (!managed.isAlive) {
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

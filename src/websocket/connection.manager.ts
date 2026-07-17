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

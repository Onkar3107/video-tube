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

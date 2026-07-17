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

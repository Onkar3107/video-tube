export interface NotificationPayload {
  id: string;
  type: 'new_video' | 'new_subscriber' | 'video_ready' | 'video_failed';
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface VideoProgressPayload {
  videoId: string;
  jobId: string;
  progress: number;           // 0–100
  stage: string;
  status: 'queued' | 'active' | 'completed' | 'failed' | 'retry';
}

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

export type ClientMessage =
  | { type: 'pong' }
  | { type: 'ping' };

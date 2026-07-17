export interface VideoProcessingJobData {
  videoId: string;
  ownerId: string;
  localVideoPath: string;
  localThumbnailPath: string;
}

export interface NotificationJobData {
  type: 'new_video' | 'new_subscriber' | 'video_ready' | 'video_failed';
  triggeredById: string;      // User who caused the event
  targetUserIds: string[];    // Users who receive the notification
  payload: {
    videoId?: string;
    channelName?: string;
    message: string;
  };
}

export interface CleanupJobData {
  // No input needed — cleanup uses fixed time windows
  _?: never;
}

export type JobProgress = {
  percentage: number;
  stage: 'FETCHING_METADATA' | 'UPDATING_DB' | 'NOTIFYING_SUBSCRIBERS' | 'DONE';
};

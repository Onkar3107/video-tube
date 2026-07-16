import { z } from 'zod';

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).trim(),
  description: z.string().min(1, 'Description is required').max(1000).trim(),
});

export const UpdatePlaylistSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(1000).trim().optional(),
});

export type CreatePlaylistDto = z.infer<typeof CreatePlaylistSchema>;
export type UpdatePlaylistDto = z.infer<typeof UpdatePlaylistSchema>;

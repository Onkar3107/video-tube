import { z } from 'zod';

export const PublishVideoSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
});

export const UpdateVideoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
});

export const GetVideosSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  query: z.string().optional(),
  sortBy: z.enum(['createdAt', 'views', 'duration']).default('createdAt'),
  sortType: z.enum(['asc', 'desc']).default('desc'),
  userId: z.string().optional(),
});

export type PublishVideoDto = z.infer<typeof PublishVideoSchema>;
export type UpdateVideoDto = z.infer<typeof UpdateVideoSchema>;
export type GetVideosDto = z.infer<typeof GetVideosSchema>;

import { z } from 'zod';

export const AddCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(2000).trim(),
});

export const UpdateCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(2000).trim(),
});

export type AddCommentDto = z.infer<typeof AddCommentSchema>;
export type UpdateCommentDto = z.infer<typeof UpdateCommentSchema>;

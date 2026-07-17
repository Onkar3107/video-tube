import { z } from 'zod';

export const AddCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
});

export const UpdateCommentSchema = z.object({
  comment: z.string().min(1, 'Comment cannot be empty').max(1000, 'Comment too long'),
});

export const GetCommentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type AddCommentDto = z.infer<typeof AddCommentSchema>;
export type UpdateCommentDto = z.infer<typeof UpdateCommentSchema>;
export type GetCommentsDto = z.infer<typeof GetCommentsSchema>;

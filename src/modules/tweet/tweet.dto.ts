import { z } from 'zod';

export const CreateTweetSchema = z.object({
  tweet: z.string().min(1, 'Tweet cannot be empty').max(280).trim(),
});

export const UpdateTweetSchema = z.object({
  tweet: z.string().min(1, 'Tweet cannot be empty').max(280).trim(),
});

export type CreateTweetDto = z.infer<typeof CreateTweetSchema>;
export type UpdateTweetDto = z.infer<typeof UpdateTweetSchema>;

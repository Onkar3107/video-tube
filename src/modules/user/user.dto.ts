import { z } from 'zod';

export const RegisterUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must not exceed 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username may only contain lowercase letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100).trim(),
});

export const LoginUserSchema = z
  .object({
    email: z.string().email().optional(),
    username: z.string().optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((d) => d.email || d.username, {
    message: 'Either email or username is required',
    path: ['email'],
  });

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(72),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).trim().optional(),
  email: z.string().email().optional(),
});

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
export type LoginUserDto = z.infer<typeof LoginUserSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

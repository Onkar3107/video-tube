import { describe, it, expect } from 'vitest';
import { RegisterUserSchema, LoginUserSchema } from '../../../src/modules/user/user.dto.js';

describe('RegisterUserSchema', () => {
  it('passes on valid registration details', () => {
    const valid = {
      username: 'alice_123',
      email: 'alice@gmail.com',
      password: 'password123',
      fullName: 'Alice Bob',
    };
    const parsed = RegisterUserSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects username containing capital letters', () => {
    const invalid = {
      username: 'Alice_123',
      email: 'alice@gmail.com',
      password: 'password123',
      fullName: 'Alice Bob',
    };
    const parsed = RegisterUserSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid email formats', () => {
    const invalid = {
      username: 'alice_123',
      email: 'alice.gmail.com',
      password: 'password123',
      fullName: 'Alice Bob',
    };
    const parsed = RegisterUserSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

describe('LoginUserSchema', () => {
  it('passes on email login', () => {
    const valid = { email: 'alice@gmail.com', password: 'password123' };
    const parsed = LoginUserSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('passes on username login', () => {
    const valid = { username: 'alice_123', password: 'password123' };
    const parsed = LoginUserSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('fails if neither username nor email are supplied', () => {
    const invalid = { password: 'password123' };
    const parsed = LoginUserSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

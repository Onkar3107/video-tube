import { describe, it, expect } from 'vitest';
import { PublishVideoSchema, GetVideosSchema } from '../../../src/modules/video/video.dto.js';

describe('PublishVideoSchema', () => {
  it('passes on valid video schema input', () => {
    const valid = { title: 'My Video', description: 'Testing details' };
    const parsed = PublishVideoSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejects empty title or description', () => {
    const invalid = { title: '', description: '' };
    const parsed = PublishVideoSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

describe('GetVideosSchema', () => {
  it('coerces and defaults pagination properties', () => {
    const input = { page: '2', limit: '20' };
    const parsed = GetVideosSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(20);
      expect(parsed.data.sortBy).toBe('createdAt');
    }
  });

  it('rejects limit greater than 50', () => {
    const input = { limit: '100' };
    const parsed = GetVideosSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });
});

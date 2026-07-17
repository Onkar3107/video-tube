import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset mock behavior before each test
vi.mock('../../../src/config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
  },
}));

import { cache } from '../../../src/utils/cache.js';
import { redis } from '../../../src/config/redis.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cache utility', () => {
  it('returns null on cache miss', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    const result = await cache.get('missing-key');
    expect(result).toBeNull();
  });

  it('returns JSON parsed object on cache hit', async () => {
    const data = { foo: 'bar' };
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(data));
    const result = await cache.get('existing-key');
    expect(result).toEqual(data);
  });

  it('saves JSON-serialized values with TTL', async () => {
    vi.mocked(redis.set).mockResolvedValue('OK');
    await cache.set('my-key', { a: 1 }, 300);
    expect(redis.set).toHaveBeenCalledWith('my-key', JSON.stringify({ a: 1 }), 'EX', 300);
  });

  it('del removes a key from redis', async () => {
    vi.mocked(redis.del).mockResolvedValue(1);
    await cache.del('my-key');
    expect(redis.del).toHaveBeenCalledWith('my-key');
  });

  it('handles scan deletion correctly in delPattern', async () => {
    vi.mocked(redis.scan)
      .mockResolvedValueOnce(['120', ['video:1', 'video:2']])
      .mockResolvedValueOnce(['0', []]);
    vi.mocked(redis.del).mockResolvedValue(2);

    await cache.delPattern('video:*');

    expect(redis.scan).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('video:1', 'video:2');
  });

  it('fails open (returns null/undefined without throwing) on Redis failures', async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error('Redis is down'));
    vi.mocked(redis.set).mockRejectedValue(new Error('Redis is down'));

    const getRes = await cache.get('some-key');
    expect(getRes).toBeNull();

    await expect(cache.set('some-key', 'val')).resolves.not.toThrow();
  });
});

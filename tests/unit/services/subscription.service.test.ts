import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../src/config/database.js', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cache: {
    delPattern: vi.fn(),
  },
}));

import { subscriptionService } from '../../../src/modules/subscription/subscription.service.js';
import { prisma } from '../../../src/config/database.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SubscriptionService.toggleSubscription', () => {
  it('throws 400 if user tries to subscribe to themselves', async () => {
    await expect(
      subscriptionService.toggleSubscription('user1', 'user1'),
    ).rejects.toMatchObject({ statusCode: 400, message: 'You cannot subscribe to your own channel.' });
  });

  it('creates subscription if not subscribed', async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subscription.create).mockResolvedValue({ id: 'sub1' } as any);
    vi.mocked(prisma.subscription.count).mockResolvedValue(100);

    const result = await subscriptionService.toggleSubscription('subscriber1', 'channel1');

    expect(result).toEqual({ subscribed: true, count: 100, message: 'Subscribed successfully.' });
    expect(prisma.subscription.create).toHaveBeenCalled();
  });

  it('deletes subscription if already subscribed', async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ id: 'sub1' } as any);
    vi.mocked(prisma.subscription.delete).mockResolvedValue({ id: 'sub1' } as any);
    vi.mocked(prisma.subscription.count).mockResolvedValue(99);

    const result = await subscriptionService.toggleSubscription('subscriber1', 'channel1');

    expect(result).toEqual({ subscribed: false, count: 99, message: 'Unsubscribed successfully.' });
    expect(prisma.subscription.delete).toHaveBeenCalled();
  });
});

import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { IntegrationJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialCrypto } from './credential-crypto';
import { FacebookBackfillService } from './facebook-backfill.service';

const since = '2026-01-01T00:00:00.000Z';
const until = '2026-02-01T00:00:00.000Z';
const key = Buffer.alloc(32, 7).toString('base64');

function fixture(dataset: 'MESSAGES' | 'COMMENTS') {
  const messageIds = new Set<string>();
  const commentIds = new Set<string>(['existing-delete']);
  const job = {
    id: 'job-1',
    businessId: 'business-1',
    connectionId: 'connection-1',
    kind: 'BACKFILL',
    status: 'PROCESSING',
    leaseOwner: 'worker-1',
    payload: {
      dataset,
      since,
      until,
      rootDone: false,
      tasks: [],
      progress: { discovered: 0, fetched: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 },
    },
  } as unknown as IntegrationJob;
  const credentialCiphertext = new CredentialCrypto(key).encrypt(
    { pageToken: 'private-fixture-token' },
    'facebook-connection:business-1:1579219702378230',
  );
  const identityUpsert = vi.fn(() => Promise.resolve({ id: 'identity-1' }));
  const conversationUpsert = vi.fn(
    (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      void args;
      return Promise.resolve({ id: 'conversation-1' });
    },
  );
  const conversationUpdateMany = vi.fn(() => Promise.resolve({ count: 1 }));
  const messageCreateMany = vi.fn(
    ({
      data,
    }: {
      data: Array<{ externalMessageId: string; direction?: string; importJobId?: string }>;
    }) => {
      const id = data[0]?.externalMessageId ?? '';
      const count = messageIds.has(id) ? 0 : 1;
      messageIds.add(id);
      return Promise.resolve({ count });
    },
  );
  const commentCreateMany = vi.fn(
    ({
      data,
    }: {
      data: Array<{
        externalCommentId: string;
        externalPostId?: string;
        externalParentId?: string;
        importJobId?: string;
      }>;
    }) => {
      const id = data[0]?.externalCommentId ?? '';
      const count = commentIds.has(id) ? 0 : 1;
      commentIds.add(id);
      return Promise.resolve({ count });
    },
  );
  const tx = {
    externalCustomerIdentity: { upsert: identityUpsert },
    conversation: { upsert: conversationUpsert, updateMany: conversationUpdateMany },
    conversationMessage: { createMany: messageCreateMany },
    socialOutbound: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    integrationConnection: {
      findFirst: vi.fn(
        (): Promise<{
          status: string;
          externalAccountId: string;
          credentialCiphertext: string;
        } | null> =>
          Promise.resolve({
            status: 'CONNECTED',
            externalAccountId: '1579219702378230',
            credentialCiphertext,
          }),
      ),
    },
    integrationJob: {
      updateMany: vi.fn(({ data }: { data: { payload: IntegrationJob['payload'] } }) => {
        job.payload = data.payload;
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: vi.fn((callback: (context: typeof tx) => Promise<void>) => callback(tx)),
    socialComment: { createMany: commentCreateMany },
  };
  const config = {
    get: (name: string) => (name === 'INTEGRATION_TOKEN_ENCRYPTION_KEY' ? key : 'v26.0'),
  };
  const service = new FacebookBackfillService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  return {
    job,
    prisma,
    service,
    messageIds,
    commentIds,
    messageCreateMany,
    commentCreateMany,
    conversationUpsert,
  };
}

function graphResponse(data: unknown[], after?: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ data, paging: after ? { cursors: { after } } : {} }),
  } as Response;
}

describe('Facebook history import', () => {
  it('walks conversation and message pagination, persists checkpoint and does not create unread', async () => {
    const f = fixture('MESSAGES');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url,
      );
      if (url.pathname.endsWith('/conversations'))
        return Promise.resolve(
          graphResponse(
            url.searchParams.get('after')
              ? []
              : [
                  {
                    id: 'thread-1',
                    participants: { data: [{ id: '1579219702378230' }, { id: 'psid-1' }] },
                  },
                ],
            url.searchParams.get('after') ? undefined : 'next-root',
          ),
        );
      if (url.pathname.endsWith('/messages'))
        return Promise.resolve(
          graphResponse(
            url.searchParams.get('after')
              ? [
                  {
                    id: 'mid-2',
                    created_time: '2026-01-02T00:00:00Z',
                    from: { id: '1579219702378230' },
                  },
                ]
              : [
                  {
                    id: 'mid-1',
                    message: 'fixture',
                    created_time: '2026-01-01T00:00:00Z',
                    from: { id: 'psid-1' },
                  },
                ],
            url.searchParams.get('after') ? undefined : 'next-message',
          ),
        );
      throw new Error('Unexpected Graph path');
    });
    try {
      let done = false;
      for (let n = 0; n < 5 && !done; n++) done = await f.service.processBatch(f.job, 'worker-1');
      expect(done).toBe(true);
      expect(f.messageIds.size).toBe(2);
      expect(f.job.payload).toMatchObject({ progress: { inserted: 2 } });
      const conversationArgs = f.conversationUpsert.mock.calls[0]?.[0];
      expect(conversationArgs?.update).toEqual({});
      expect(Object.hasOwn(conversationArgs?.create ?? {}, 'unreadAt')).toBe(false);
      expect(f.messageCreateMany.mock.calls[1]?.[0].data[0]).toMatchObject({
        direction: 'OUTBOUND_ECHO',
        importJobId: 'job-1',
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('walks posts, comments and replies without overwriting an existing tombstone', async () => {
    const f = fixture('COMMENTS');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url,
      );
      if (url.pathname.endsWith('/posts'))
        return Promise.resolve(graphResponse([{ id: 'post-1' }]));
      if (url.pathname.endsWith('/post-1/comments'))
        return Promise.resolve(
          graphResponse(
            url.searchParams.get('after')
              ? [{ id: 'existing-delete', created_time: '2026-01-03T00:00:00Z' }]
              : [{ id: 'comment-1', message: 'fixture', created_time: '2026-01-02T00:00:00Z' }],
            url.searchParams.get('after') ? undefined : 'next-comment',
          ),
        );
      if (url.pathname.endsWith('/comment-1/comments'))
        return Promise.resolve(
          graphResponse([
            { id: 'reply-1', message: 'fixture reply', created_time: '2026-01-03T00:00:00Z' },
          ]),
        );
      if (
        url.pathname.endsWith('/reply-1/comments') ||
        url.pathname.endsWith('/existing-delete/comments')
      )
        return Promise.resolve(graphResponse([]));
      throw new Error('Unexpected Graph path');
    });
    try {
      let done = false;
      for (let n = 0; n < 10 && !done; n++) done = await f.service.processBatch(f.job, 'worker-1');
      expect(done).toBe(true);
      expect(f.commentIds.size).toBe(3);
      expect(f.job.payload).toMatchObject({ progress: { inserted: 2 } });
      expect(
        f.commentCreateMany.mock.calls.find(
          ([arg]) => arg.data[0]?.externalCommentId === 'reply-1',
        )?.[0].data[0],
      ).toMatchObject({
        externalPostId: 'post-1',
        externalParentId: 'comment-1',
        importJobId: 'job-1',
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reports Meta code 10 as permission blocked, not as an empty page', async () => {
    const f = fixture('COMMENTS');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { code: 10 } }),
    } as Response);
    try {
      await expect(f.service.processBatch(f.job, 'worker-1')).rejects.toThrow('BLOCKED_PERMISSION');
      expect(f.prisma.integrationJob.updateMany).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('preflight reports the exact safe Graph permission code on the comments edge', async () => {
    const f = fixture('COMMENTS');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(
        input instanceof URL ? input.toString() : typeof input === 'string' ? input : input.url,
      );
      if (url.pathname.endsWith('/posts'))
        return Promise.resolve(graphResponse([{ id: 'post-1' }]));
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { code: 10, error_subcode: 123 } }),
      } as Response);
    });
    try {
      await expect(
        f.service.preflight('business-1', 'connection-1', 'COMMENTS'),
      ).resolves.toMatchObject({
        status: 'BLOCKED_PERMISSION',
        providerCode: 10,
        providerSubcode: 123,
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('enforces a durable page budget before another Graph request', async () => {
    const f = fixture('MESSAGES');
    f.job.payload = {
      dataset: 'MESSAGES',
      since,
      until,
      rootDone: false,
      tasks: [],
      progress: { discovered: 0, fetched: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 },
      pageLimit: 1,
      pagesFetched: 1,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(f.service.processBatch(f.job, 'worker-1')).rejects.toThrow(
        'BACKFILL_PAGE_LIMIT_REACHED',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('resumes a paused job without resetting its checkpoint', async () => {
    const f = fixture('MESSAGES');
    f.prisma.integrationJob.updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(f.service.resume('business-1', 'job-1')).resolves.toEqual({
      id: 'job-1',
      status: 'PENDING',
    });
    const call = f.prisma.integrationJob.updateMany.mock.calls[0]?.[0] as unknown as {
      where: { businessId: string; lastErrorCode: string };
      data: Record<string, unknown>;
    };
    expect(call.where.businessId).toBe('business-1');
    expect(call.where.lastErrorCode).toBe('PAUSED_BY_USER');
    expect(call.data).not.toHaveProperty('payload');
  });

  it('finishes a completed checkpoint at the page budget without another Graph request', async () => {
    const f = fixture('COMMENTS');
    f.job.payload = {
      dataset: 'COMMENTS',
      since,
      until,
      rootDone: true,
      tasks: [],
      progress: { discovered: 0, fetched: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 },
      pageLimit: 1,
      pagesFetched: 1,
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(f.service.processBatch(f.job, 'worker-1')).resolves.toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('rejects a Facebook connection outside the current business', async () => {
    const f = fixture('MESSAGES');
    f.prisma.integrationConnection.findFirst.mockResolvedValueOnce(null);
    await expect(
      f.service.start('other-business', 'connection-1', 'MESSAGES', since, until),
    ).rejects.toThrow('Không tìm thấy kết nối Facebook');
  });
});

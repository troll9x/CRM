import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { RequestStaff } from '../common/request-context';
import type { PrismaService } from '../prisma/prisma.service';
import { CredentialCrypto } from './credential-crypto';
import type { IntegrationPageAccessService } from './integration-page-access.service';
import { FacebookSourceMediaService } from './facebook-source-media.service';

const actor: RequestStaff = {
  id: 'staff-1',
  businessId: 'business-1',
  email: 'test@example.invalid',
  displayName: 'Tester',
  roles: [],
  permissions: ['integrations.read'],
};
const key = Buffer.alloc(32, 7).toString('base64');
const connection = {
  provider: 'FACEBOOK',
  status: 'CONNECTED',
  externalAccountId: 'page-1',
  credentialCiphertext: new CredentialCrypto(key).encrypt(
    { pageToken: 'test-page-token' },
    'facebook-connection:business-1:page-1',
  ),
};

function setup() {
  const prisma = {
    socialComment: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'comment-1',
        connectionId: 'connection-1',
        externalCommentId: 'external-comment-1',
        sourceUrl: null,
        connection,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    conversationMessage: {
      findFirst: vi.fn().mockResolvedValue({
        connectionId: 'connection-1',
        externalMessageId: 'external-message-1',
        mediaMetadata: [
          { type: 'image', payload: { url: 'https://scontent.xx.fbcdn.net/old.jpg' } },
        ],
        connection,
      }),
    },
  };
  const config = {
    get: vi.fn((name: string) => (name === 'INTEGRATION_TOKEN_ENCRYPTION_KEY' ? key : 'v25.0')),
  };
  const access = { assert: vi.fn().mockResolvedValue(undefined) };
  const service = new FacebookSourceMediaService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    access as unknown as IntegrationPageAccessService,
  );
  return { prisma, access, service };
}

afterEach(() => vi.unstubAllGlobals());

describe('FacebookSourceMediaService', () => {
  it('resolves a missing comment permalink using the connected Page and saves it', async () => {
    const { service, prisma, access } = setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          permalink_url: 'https://www.facebook.com/page/posts/post?comment_id=1',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.commentLink(actor, 'comment-1')).resolves.toMatchObject({
      status: 'READY',
      source: 'META',
      url: 'https://www.facebook.com/page/posts/post?comment_id=1',
    });
    expect(access.assert).toHaveBeenCalledWith(actor, 'connection-1');
    expect(prisma.socialComment.updateMany).toHaveBeenCalledOnce();
    const graphUrl = fetchMock.mock.calls[0]?.[0] as unknown;
    expect(graphUrl).toBeInstanceOf(URL);
    expect((graphUrl as URL).pathname).toContain('external-comment-1');
  });

  it('rejects a comment outside the business before calling Meta', async () => {
    const { service, prisma } = setup();
    prisma.socialComment.findFirst.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.commentLink(actor, 'other-comment')).rejects.toMatchObject({
      status: 404,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes an expired image URL through Graph and returns image bytes', async () => {
    const { service, access } = setup();
    const fetchMock = vi.fn((url: URL) => {
      if (url.hostname === 'graph.facebook.com')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attachments: {
                data: [{ image_data: { url: 'https://scontent.xx.fbcdn.net/fresh.jpg' } }],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      return Promise.resolve(
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const image = await service.messageImage(actor, 'conversation-1', 'message-1', '0');
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.bytes).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(access.assert).toHaveBeenCalledWith(actor, 'connection-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fetch an untrusted attachment host', async () => {
    const { service, prisma } = setup();
    prisma.conversationMessage.findFirst.mockResolvedValue({
      connectionId: 'connection-1',
      externalMessageId: 'external-message-1',
      mediaMetadata: null,
      connection,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            attachments: { data: [{ image_data: { url: 'http://127.0.0.1/private' } }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      service.messageImage(actor, 'conversation-1', 'message-1', '0'),
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('checks Page access before fetching message media', async () => {
    const { service, access } = setup();
    access.assert.mockRejectedValue(new Error('PAGE_ACCESS_DENIED'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(service.messageImage(actor, 'conversation-1', 'message-1', '0')).rejects.toThrow(
      'PAGE_ACCESS_DENIED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow an image redirect outside Meta media hosts', async () => {
    const { service, prisma } = setup();
    prisma.conversationMessage.findFirst.mockResolvedValue({
      connectionId: 'connection-1',
      externalMessageId: 'external-message-1',
      mediaMetadata: null,
      connection,
    });
    const fetchMock = vi.fn((url: URL) => {
      if (url.hostname === 'graph.facebook.com')
        return Promise.resolve(
          new Response(
            JSON.stringify({
              attachments: {
                data: [{ image_data: { url: 'https://scontent.xx.fbcdn.net/fresh.jpg' } }],
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      service.messageImage(actor, 'conversation-1', 'message-1', '0'),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

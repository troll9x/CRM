import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookOAuthClient } from './facebook-oauth.client';

describe('Facebook Page subscription verification (mock provider)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const config = new ConfigService({
    FACEBOOK_APP_ID: '123',
    FACEBOOK_APP_SECRET: 'fixture-secret',
    FACEBOOK_GRAPH_API_VERSION: 'v26.0',
    FACEBOOK_OAUTH_REDIRECT_URI: 'https://example.test/api/v1/integrations/oauth/facebook/callback',
    FACEBOOK_OAUTH_SCOPES: 'pages_messaging,pages_manage_metadata',
  });
  const page = {
    id: '456',
    name: 'Fixture Page',
    tasks: ['MESSAGING'],
    accessToken: 'fixture-token',
  };

  it('subscribes to replies from the Page as well as customer messages and feed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: '123', subscribed_fields: ['messages', 'message_echoes', 'feed'] }],
        }),
      );
    vi.stubGlobal('fetch', fetch);
    await new FacebookOAuthClient(config).subscribe(page);
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect((request.body as URLSearchParams).get('subscribed_fields')?.split(',')).toContain(
      'message_echoes',
    );
  });

  it('does not accept a successful POST when readback is missing Page replies', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ success: true }))
        .mockResolvedValueOnce(
          Response.json({ data: [{ id: '123', subscribed_fields: ['messages', 'feed'] }] }),
        ),
    );
    await expect(new FacebookOAuthClient(config).subscribe(page)).rejects.toThrow(
      'Page subscription',
    );
  });
});

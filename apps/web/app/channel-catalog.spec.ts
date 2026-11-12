import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChannelCatalog } from './channel-catalog';

describe('Channel authorization availability', () => {
  it('offers OAuth only for supported, configured providers', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelCatalog, {
        preflight: ['FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK_SHOP'].map((provider) => ({
          provider,
          canStartAuthorization: true,
          missingConfiguration: [],
        })),
        connections: [{ provider: 'FACEBOOK', status: 'NEEDS_SETUP' }],
        busy: false,
        onConnect: () => undefined,
      }),
    );
    expect(markup).toContain('aria-label="Kết nối Facebook"');
    expect(markup).toContain('aria-label="Kết nối Zalo OA"');
    expect(markup).toContain('aria-label="Thiết lập Shopee"');
    expect(markup).toContain('aria-label="Thiết lập TikTok Shop"');
    expect(markup).not.toContain('1 tài khoản đã cấp quyền');
  });

  it('does not present an incomplete service as an available connection', () => {
    const markup = renderToStaticMarkup(
      createElement(ChannelCatalog, {
        preflight: [
          {
            provider: 'FACEBOOK',
            canStartAuthorization: false,
            missingConfiguration: ['FACEBOOK_APP_SECRET'],
          },
        ],
        connections: [],
        busy: false,
        onConnect: () => undefined,
      }),
    );
    expect(markup).toContain('aria-label="Thiết lập Facebook"');
    expect(markup).not.toContain('aria-label="Kết nối Facebook"');
    expect(markup).not.toContain('FACEBOOK_APP_SECRET');
  });
});

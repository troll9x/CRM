import { describe, expect, it } from 'vitest';
import { providerPreflight } from './provider-preflight';

describe('providerPreflight', () => {
  it('reports only missing setting names and never claims authorization is ready', () => {
    const result = providerPreflight('FACEBOOK', {
      get: (name: string) =>
        name === 'FACEBOOK_APP_SECRET' ? 'fixture-secret-never-return-this' : undefined,
    });
    expect(result.configuration).toBe('INCOMPLETE');
    expect(result.missingConfiguration).not.toContain('FACEBOOK_APP_SECRET');
    expect(JSON.stringify(result)).not.toContain('fixture-secret-never-return-this');
    expect(result.canStartAuthorization).toBe(false);
    expect(result.authorization).toBe('AUTHORIZATION_IMPLEMENTED_LOCAL_ONLY');
  });

  it('enables only Facebook start when all server setting names are present', () => {
    const values: Record<string, string> = {
      FACEBOOK_APP_ID: '123456789',
      FACEBOOK_APP_SECRET: 'fixture-secret-never-return-this',
      FACEBOOK_GRAPH_API_VERSION: 'v25.0',
      FACEBOOK_OAUTH_REDIRECT_URI:
        'https://example.test/api/v1/integrations/oauth/facebook/callback',
      FACEBOOK_OAUTH_SCOPES: 'pages_show_list,pages_messaging',
      FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'fixture-verify-token',
      INTEGRATION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'),
    };
    const result = providerPreflight('FACEBOOK', { get: (name: string) => values[name] });
    expect(result.canStartAuthorization).toBe(true);
    expect(JSON.stringify(result)).not.toContain(values.FACEBOOK_APP_SECRET);
  });

  it('does not enable a placeholder or localhost Meta redirect', () => {
    const result = providerPreflight('FACEBOOK', {
      get: (name: string) =>
        name === 'FACEBOOK_OAUTH_REDIRECT_URI'
          ? 'http://localhost:4000/api/v1/integrations/oauth/facebook/callback'
          : 'replace-with-value',
    });
    expect(result.canStartAuthorization).toBe(false);
    expect(result.missingConfiguration).toContain('FACEBOOK_OAUTH_REDIRECT_URI');
  });

  it('enables Zalo OA only with valid configuration and does not expose secrets', () => {
    const values: Record<string, string> = {
      ZALO_APP_ID: '123456789',
      ZALO_APP_SECRET: 'fixture-secret-never-return-this',
      ZALO_OAUTH_REDIRECT_URI: 'https://example.test/api/v1/integrations/oauth/zalo/callback',
      ZALO_OA_SECRET_KEY: 'fixture-webhook-secret',
      INTEGRATION_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    };
    const result = providerPreflight('ZALO', {
      get: (name: string) => values[name],
    });
    expect(result.configuration).toBe('PRESENT');
    expect(result.missingConfiguration).toEqual([]);
    expect(result.canStartAuthorization).toBe(true);
    expect(JSON.stringify(result)).not.toContain(values.ZALO_APP_SECRET);
  });

  it('keeps Shopee authorization explicitly blocked pending official protocol review', () => {
    const result = providerPreflight('SHOPEE', { get: () => undefined });
    expect(result.authorization).toBe('AUTHORIZATION_BLOCKED_OFFICIAL_PROTOCOL_REVIEW');
    expect(result.canStartAuthorization).toBe(false);
  });
});

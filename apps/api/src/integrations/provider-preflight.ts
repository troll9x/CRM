import type { ConfigService } from '@nestjs/config';

export const INTEGRATION_PROVIDERS = ['FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK_SHOP'] as const;
export type IntegrationProviderName = (typeof INTEGRATION_PROVIDERS)[number];

// This is a configuration inventory, not an authorization adapter. In particular, a
// populated environment does not mean that a provider flow has been implemented or tested.
const REQUIRED_CONFIGURATION: Record<IntegrationProviderName, readonly string[]> = {
  FACEBOOK: [
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'FACEBOOK_GRAPH_API_VERSION',
    'FACEBOOK_OAUTH_REDIRECT_URI',
    'FACEBOOK_OAUTH_SCOPES',
    'FACEBOOK_WEBHOOK_VERIFY_TOKEN',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY',
  ],
  ZALO: [
    'ZALO_APP_ID',
    'ZALO_APP_SECRET',
    'ZALO_OAUTH_REDIRECT_URI',
    'ZALO_OA_SECRET_KEY',
    'INTEGRATION_TOKEN_ENCRYPTION_KEY',
  ],
  SHOPEE: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY', 'SHOPEE_REGION', 'SHOPEE_OAUTH_REDIRECT_URI'],
  TIKTOK_SHOP: [
    'TIKTOK_SHOP_APP_KEY',
    'TIKTOK_SHOP_APP_SECRET',
    'TIKTOK_SHOP_REGION',
    'TIKTOK_SHOP_SERVICE_ID',
    'TIKTOK_SHOP_OAUTH_REDIRECT_URI',
  ],
};

const IMPLEMENTATION_STATUS: Record<IntegrationProviderName, string> = {
  FACEBOOK: 'AUTHORIZATION_IMPLEMENTED_LOCAL_ONLY',
  ZALO: 'AUTHORIZATION_IMPLEMENTED_LOCAL_ONLY',
  SHOPEE: 'AUTHORIZATION_BLOCKED_OFFICIAL_PROTOCOL_REVIEW',
  TIKTOK_SHOP: 'AUTHORIZATION_NOT_IMPLEMENTED',
};

export function providerPreflight(
  provider: IntegrationProviderName,
  config: Pick<ConfigService, 'get'>,
) {
  const missingConfiguration = REQUIRED_CONFIGURATION[provider].filter((name) => {
    const value = config.get<string>(name)?.trim();
    if (!value || /^(replace-with|your-|example)/i.test(value)) return true;
    if (provider === 'ZALO' && name === 'ZALO_APP_ID') return !/^\d+$/.test(value);
    if (provider === 'ZALO' && name === 'ZALO_OAUTH_REDIRECT_URI') {
      try {
        const uri = new URL(value);
        return (
          uri.protocol !== 'https:' ||
          uri.pathname !== '/api/v1/integrations/oauth/zalo/callback' ||
          Boolean(uri.search || uri.hash)
        );
      } catch {
        return true;
      }
    }
    if (name === 'INTEGRATION_TOKEN_ENCRYPTION_KEY') {
      const decoded = Buffer.from(value, 'base64');
      return decoded.length !== 32 || decoded.toString('base64') !== value;
    }
    if (provider !== 'FACEBOOK') return false;
    if (name === 'FACEBOOK_APP_ID') return !/^\d+$/.test(value);
    if (name === 'FACEBOOK_GRAPH_API_VERSION') return !/^v\d+\.\d+$/.test(value);
    if (name === 'FACEBOOK_OAUTH_SCOPES') return !/^[a-z_]+(,[a-z_]+)*$/.test(value);
    if (name === 'FACEBOOK_OAUTH_REDIRECT_URI') {
      try {
        const uri = new URL(value);
        return (
          uri.protocol !== 'https:' ||
          uri.pathname !== '/api/v1/integrations/oauth/facebook/callback' ||
          Boolean(uri.search || uri.hash)
        );
      } catch {
        return true;
      }
    }
    return false;
  });
  const implementationStatus = IMPLEMENTATION_STATUS[provider];
  return {
    provider,
    configuration: missingConfiguration.length ? 'INCOMPLETE' : 'PRESENT',
    missingConfiguration,
    authorization: implementationStatus,
    canStartAuthorization:
      (provider === 'FACEBOOK' || provider === 'ZALO') && missingConfiguration.length === 0,
    explanation:
      implementationStatus === 'AUTHORIZATION_BLOCKED_OFFICIAL_PROTOCOL_REVIEW'
        ? 'Chưa thể mở cấp quyền: chưa xác minh được giao thức chính thức hiện hành cho app/thị trường này.'
        : provider === 'FACEBOOK'
          ? 'Code Facebook OAuth đã có; cần cấu hình app, HTTPS và thử cấp quyền/Page thật trước khi xác nhận tích hợp.'
          : provider === 'ZALO'
            ? 'Code Zalo OA OAuth/PKCE đã có; cần OA được duyệt, app/HTTPS và thử grant thật trước khi xác nhận tích hợp.'
            : 'Cấu hình ứng dụng không đồng nghĩa đã có luồng cấp quyền. Kết nối OAuth chưa được bật trong bản này.',
  } as const;
}

import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FacebookPageGrant = {
  id: string;
  name: string;
  tasks: string[];
  accessToken: string;
};
export type FacebookGrant = {
  userToken: string;
  expiresAt: string | null;
  permissions: string[];
  pages: FacebookPageGrant[];
};

@Injectable()
export class FacebookOAuthClient {
  constructor(private readonly config: ConfigService) {}

  private settings() {
    const appId = this.config.get<string>('FACEBOOK_APP_ID')?.trim();
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET')?.trim();
    const version = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION')?.trim();
    const redirectUri = this.config.get<string>('FACEBOOK_OAUTH_REDIRECT_URI')?.trim();
    const scopes = this.config.get<string>('FACEBOOK_OAUTH_SCOPES')?.trim();
    if (
      !appId ||
      !appSecret ||
      !version ||
      !redirectUri ||
      !scopes ||
      !/^\d+$/.test(appId) ||
      /^replace-with/i.test(appSecret)
    )
      throw new BadRequestException('Thiếu cấu hình Facebook OAuth phía máy chủ.');
    if (!/^v\d+\.\d+$/.test(version))
      throw new BadRequestException('FACEBOOK_GRAPH_API_VERSION không hợp lệ.');
    const redirect = new URL(redirectUri);
    if (
      redirect.protocol !== 'https:' ||
      redirect.pathname !== '/api/v1/integrations/oauth/facebook/callback' ||
      redirect.search ||
      redirect.hash
    )
      throw new BadRequestException('FACEBOOK_OAUTH_REDIRECT_URI không hợp lệ.');
    return {
      appId,
      appSecret,
      version,
      redirectUri,
      scopes: scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  redirectUri() {
    return this.settings().redirectUri;
  }

  authorizationUrl(state: string) {
    const { appId, version, redirectUri, scopes } = this.settings();
    const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scopes.join(','));
    const configId = this.config.get<string>('FACEBOOK_LOGIN_CONFIG_ID')?.trim();
    if (configId) url.searchParams.set('config_id', configId);
    return url.toString();
  }

  private async json(url: URL, init?: RequestInit): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Provider returned non-success status.');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('Invalid provider response.');
      return body as Record<string, unknown>;
    } catch {
      // Never surface provider error bodies/URLs: they may contain code or token.
      throw new BadGatewayException('Facebook API không xác nhận được yêu cầu.');
    }
  }

  private graphUrl(path: string) {
    return new URL(`https://graph.facebook.com/${this.settings().version}/${path}`);
  }

  async exchangeCode(code: string, redirectUri: string): Promise<FacebookGrant> {
    const { appId, appSecret, scopes } = this.settings();
    const tokenUrl = this.graphUrl('oauth/access_token');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);
    const tokenResponse = await this.json(tokenUrl);
    const shortToken = tokenResponse['access_token'];
    if (typeof shortToken !== 'string' || !shortToken)
      throw new BadGatewayException('Facebook không cấp token.');

    const extensionUrl = this.graphUrl('oauth/access_token');
    extensionUrl.searchParams.set('grant_type', 'fb_exchange_token');
    extensionUrl.searchParams.set('client_id', appId);
    extensionUrl.searchParams.set('client_secret', appSecret);
    extensionUrl.searchParams.set('fb_exchange_token', shortToken);
    const extended = await this.json(extensionUrl);
    const userToken = extended['access_token'];
    if (typeof userToken !== 'string' || !userToken)
      throw new BadGatewayException('Facebook không cấp token dài hạn.');

    const permissionUrl = this.graphUrl('me/permissions');
    const permissions = await this.json(permissionUrl, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const granted = new Set(
      Array.isArray(permissions['data'])
        ? permissions['data']
            .filter(
              (entry): entry is { permission: string; status: string } =>
                !!entry && typeof entry === 'object' && 'permission' in entry && 'status' in entry,
            )
            .filter((entry) => entry.status === 'granted')
            .map((entry) => entry.permission)
        : [],
    );
    if (scopes.some((scope) => !granted.has(scope)))
      throw new BadRequestException('Facebook chưa cấp đủ quyền trong cấu hình OAuth.');

    const pages: FacebookPageGrant[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    const seenPageIds = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const accountsUrl = this.graphUrl('me/accounts');
      accountsUrl.searchParams.set('fields', 'id,name,access_token,tasks');
      accountsUrl.searchParams.set('limit', '100');
      if (cursor) accountsUrl.searchParams.set('after', cursor);
      const listing = await this.json(accountsUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (!Array.isArray(listing['data']))
        throw new BadGatewayException('Danh sách Page không hợp lệ.');
      for (const entry of listing['data']) {
        if (!entry || typeof entry !== 'object') continue;
        const item = entry as Record<string, unknown>;
        if (
          typeof item['id'] === 'string' &&
          /^\d+$/.test(item['id']) &&
          typeof item['name'] === 'string' &&
          typeof item['access_token'] === 'string' &&
          Array.isArray(item['tasks'])
        ) {
          if (seenPageIds.has(item['id']))
            throw new BadGatewayException('Facebook trả Page trùng trong danh sách.');
          seenPageIds.add(item['id']);
          pages.push({
            id: item['id'],
            name: item['name'],
            tasks: item['tasks'].filter((task): task is string => typeof task === 'string'),
            accessToken: item['access_token'],
          });
        }
      }
      const paging = listing['paging'] as
        { next?: unknown; cursors?: { after?: unknown } } | undefined;
      if (typeof paging?.next !== 'string' || !paging.next) break;
      cursor = typeof paging.cursors?.after === 'string' ? paging.cursors.after : undefined;
      if (!cursor || seenCursors.has(cursor))
        throw new BadGatewayException('Phân trang Page Facebook không hợp lệ.');
      seenCursors.add(cursor);
      if (page === 19) throw new BadGatewayException('Danh sách Page quá dài để xác minh.');
    }
    const expiresIn = extended['expires_in'];
    return {
      userToken,
      permissions: [...granted].sort(),
      expiresAt:
        typeof expiresIn === 'number' && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
      pages,
    };
  }

  async subscribe(page: FacebookPageGrant): Promise<void> {
    const appId = this.settings().appId;
    const endpoint = this.graphUrl(`${encodeURIComponent(page.id)}/subscribed_apps`);
    const body = new URLSearchParams({ subscribed_fields: 'messages,feed' });
    const result = await this.json(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${page.accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (result['success'] !== true)
      throw new BadGatewayException('Facebook chưa xác nhận Page subscription.');
    const check = await this.json(endpoint, {
      headers: { Authorization: `Bearer ${page.accessToken}` },
    });
    if (
      !Array.isArray(check['data']) ||
      !check['data'].some(
        (item) => item && typeof item === 'object' && (item as { id?: unknown }).id === appId,
      )
    )
      throw new BadGatewayException('Chưa đọc lại được Page subscription.');
  }
}

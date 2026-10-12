import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ZaloGrant = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string | null;
  oaId: string;
  oaName: string;
};

@Injectable()
export class ZaloOAuthClient {
  constructor(private readonly config: ConfigService) {}

  private settings() {
    const appId = this.config.get<string>('ZALO_APP_ID')?.trim();
    const secret = this.config.get<string>('ZALO_APP_SECRET')?.trim();
    const redirectUri = this.config.get<string>('ZALO_OAUTH_REDIRECT_URI')?.trim();
    if (!appId || !/^\d+$/.test(appId) || !secret || /^replace-with/i.test(secret) || !redirectUri)
      throw new BadRequestException('Thiếu cấu hình Zalo OA OAuth phía máy chủ.');
    let redirect: URL;
    try {
      redirect = new URL(redirectUri);
    } catch {
      throw new BadRequestException('ZALO_OAUTH_REDIRECT_URI không hợp lệ.');
    }
    if (
      redirect.protocol !== 'https:' ||
      redirect.pathname !== '/api/v1/integrations/oauth/zalo/callback' ||
      redirect.search ||
      redirect.hash
    )
      throw new BadRequestException('ZALO_OAUTH_REDIRECT_URI không hợp lệ.');
    return { appId, secret, redirectUri };
  }

  redirectUri() {
    return this.settings().redirectUri;
  }

  authorizationUrl(state: string, challenge: string) {
    const { appId, redirectUri } = this.settings();
    const url = new URL('https://oauth.zaloapp.com/v4/oa/permission');
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('state', state);
    return url.toString();
  }

  private async json(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Provider rejected request.');
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('Invalid body.');
      const data = body as Record<string, unknown>;
      if (data['error'] !== undefined && data['error'] !== 0) throw new Error('Provider error.');
      return data;
    } catch {
      // Do not leak provider response, URL, code or token to API clients/logs.
      throw new BadGatewayException('Zalo OA API không xác nhận được yêu cầu.');
    }
  }

  private async token(form: URLSearchParams) {
    const { secret } = this.settings();
    const body = await this.json('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST',
      headers: { secret_key: secret, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (typeof body['access_token'] !== 'string' || typeof body['refresh_token'] !== 'string')
      throw new BadGatewayException('Zalo OA không cấp đủ token.');
    const seconds = Number(body['expires_in']);
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new BadGatewayException('Zalo OA không trả thời hạn token hợp lệ.');
    const refreshSeconds = Number(body['refresh_token_expires_in']);
    return {
      accessToken: body['access_token'],
      refreshToken: body['refresh_token'],
      expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
      refreshExpiresAt:
        Number.isFinite(refreshSeconds) && refreshSeconds > 0
          ? new Date(Date.now() + refreshSeconds * 1000).toISOString()
          : null,
    };
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
    callbackOaId?: string,
  ): Promise<ZaloGrant> {
    const { appId } = this.settings();
    const tokens = await this.token(
      new URLSearchParams({
        app_id: appId,
        code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    );
    const info = await this.json('https://openapi.zalo.me/v2.0/oa/getoa', {
      headers: { access_token: tokens.accessToken },
    });
    const data = info['data'];
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new BadGatewayException('Không xác minh được OA đã cấp quyền.');
    const oa = data as Record<string, unknown>;
    const oaId =
      typeof oa['oaid'] === 'string'
        ? oa['oaid']
        : typeof oa['oaid'] === 'number' && Number.isSafeInteger(oa['oaid'])
          ? String(oa['oaid'])
          : '';
    if (!/^\d+$/.test(oaId) || typeof oa['name'] !== 'string' || !oa['name'])
      throw new BadGatewayException('Thông tin OA không hợp lệ.');
    if (callbackOaId && callbackOaId !== oaId)
      throw new BadGatewayException('OA callback không trùng với OA đã xác minh.');
    return { ...tokens, oaId, oaName: oa['name'] };
  }

  async refresh(refreshToken: string) {
    const { appId } = this.settings();
    return this.token(
      new URLSearchParams({
        app_id: appId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    );
  }
}

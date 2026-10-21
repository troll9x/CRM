import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};

export class FacebookSendError extends Error {
  constructor(
    readonly reason: string,
    readonly definitive: boolean,
  ) {
    super(reason);
  }
}

@Injectable()
export class FacebookSendClient {
  constructor(private readonly config: ConfigService) {}

  private url(path: string) {
    const version = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION')?.trim();
    if (!version || !/^v\d+\.\d+$/.test(version))
      throw new ServiceUnavailableException('Phiên bản Graph API chưa hợp lệ.');
    if (!/^(me|[0-9_]+)(\/(permissions|accounts|messages|comments))?$/.test(path))
      throw new ServiceUnavailableException('Đường dẫn Graph API chưa hợp lệ.');
    return new URL(`https://graph.facebook.com/${version}/${path}`);
  }

  private async request(path: string, token: string, init?: RequestInit): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    }
    if (!response.ok) {
      const error = record(record(await response.json().catch(() => ({}))).error);
      const code = Number(error.code);
      if (response.status === 401 || code === 190)
        throw new FacebookSendError('REAUTH_REQUIRED', true);
      if (response.status === 429 || [4, 17, 613].includes(code))
        throw new FacebookSendError('RATE_LIMIT_UNKNOWN', false);
      if (response.status >= 500) throw new FacebookSendError('PROVIDER_UNKNOWN', false);
      if ([10, 200].includes(code) || response.status === 403)
        throw new FacebookSendError('BLOCKED_PERMISSION', true);
      throw new FacebookSendError('PROVIDER_REJECTED', true);
    }
    try {
      return record(await response.json());
    } catch {
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    }
  }

  async inspect(pageId: string, pageToken: string, userToken: string) {
    const me = await this.request('me', pageToken);
    if (me.id !== pageId) throw new FacebookSendError('PAGE_TOKEN_MISMATCH', true);
    const permissions = await this.request('me/permissions', userToken);
    const granted = new Set(
      (Array.isArray(permissions.data) ? permissions.data : [])
        .map(record)
        .filter((row) => row.status === 'granted' && typeof row.permission === 'string')
        .map((row) => row.permission as string),
    );
    let pageTasks: string[] = [];
    let after: string | undefined;
    for (let i = 0; i < 10; i++) {
      const url = this.url('me/accounts');
      url.searchParams.set('fields', 'id,tasks');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);
      const page = await this.requestUrl(url, userToken);
      const rows = Array.isArray(page.data) ? page.data.map(record) : [];
      const found = rows.find((row) => row.id === pageId);
      if (found) {
        pageTasks = Array.isArray(found.tasks)
          ? found.tasks.filter((task): task is string => typeof task === 'string')
          : [];
        break;
      }
      const next = record(record(page.paging).cursors).after;
      after = typeof next === 'string' && next.length < 2048 ? next : undefined;
      if (!after || rows.length < 100) break;
    }
    return { granted, pageTasks };
  }

  private async requestUrl(url: URL, token: string): Promise<Json> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    }
    if (!response.ok) {
      const error = record(record(await response.json().catch(() => ({}))).error);
      if (response.status === 401 || Number(error.code) === 190)
        throw new FacebookSendError('REAUTH_REQUIRED', true);
      if (response.status === 403 || [10, 200].includes(Number(error.code)))
        throw new FacebookSendError('BLOCKED_PERMISSION', true);
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    }
    return record(await response.json().catch(() => ({})));
  }

  async sendText(pageId: string, recipientId: string, body: string, pageToken: string) {
    const response = await this.request(`${pageId}/messages`, pageToken, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: body },
      }),
    });
    if (response.recipient_id !== recipientId || typeof response.message_id !== 'string')
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    return response.message_id;
  }

  async replyComment(commentId: string, body: string, pageToken: string) {
    const response = await this.request(`${commentId}/comments`, pageToken, {
      method: 'POST',
      body: JSON.stringify({ message: body }),
    });
    if (typeof response.id !== 'string')
      throw new FacebookSendError('PROVIDER_UNKNOWN', false);
    return response.id;
  }
}

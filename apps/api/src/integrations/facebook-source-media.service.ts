import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialCrypto } from './credential-crypto';
import { IntegrationPageAccessService } from './integration-page-access.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type FacebookConnection = {
  externalAccountId: string;
  credentialCiphertext: string | null;
  status: string;
  provider: string;
};

function facebookPermalink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function metaImageUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !(
        url.hostname === 'fbcdn.net' ||
        url.hostname.endsWith('.fbcdn.net') ||
        url.hostname === 'fbsbx.com' ||
        url.hostname.endsWith('.fbsbx.com')
      )
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

@Injectable()
export class FacebookSourceMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly pageAccess: IntegrationPageAccessService,
  ) {}

  private async graph(
    businessId: string,
    connection: FacebookConnection,
    sourceId: string,
    fields: string,
  ): Promise<Record<string, unknown>> {
    if (
      connection.provider !== 'FACEBOOK' ||
      connection.status !== 'CONNECTED' ||
      !connection.credentialCiphertext
    )
      throw new ConflictException('Page Facebook cần kết nối lại để lấy nguồn.');
    const version = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION');
    if (!version || !/^v\d+\.\d+$/.test(version))
      throw new BadGatewayException('Phiên bản Facebook API chưa được cấu hình.');
    let token: string;
    try {
      token = new CredentialCrypto(
        this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
      ).decrypt<{ pageToken: string }>(
        connection.credentialCiphertext,
        `facebook-connection:${businessId}:${connection.externalAccountId}`,
      ).pageToken;
      if (!token) throw new Error('NO_PAGE_TOKEN');
    } catch {
      throw new ConflictException('Page Facebook cần kết nối lại để lấy nguồn.');
    }
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(sourceId)}`);
    url.searchParams.set('fields', fields);
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('GRAPH_NON_SUCCESS');
      const body: unknown = await response.json();
      const object = record(body);
      if (!object) throw new Error('GRAPH_INVALID_RESPONSE');
      return object;
    } catch {
      throw new BadGatewayException('Facebook không trả được nguồn lúc này.');
    }
  }

  async commentLink(actor: RequestStaff, commentId: string) {
    const comment = await this.prisma.socialComment.findFirst({
      where: { id: commentId, businessId: actor.businessId },
      select: {
        id: true,
        connectionId: true,
        externalCommentId: true,
        sourceUrl: true,
        connection: {
          select: {
            provider: true,
            status: true,
            externalAccountId: true,
            credentialCiphertext: true,
          },
        },
      },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận.');
    await this.pageAccess.assert(actor, comment.connectionId);
    const stored = facebookPermalink(comment.sourceUrl);
    if (stored) return { status: 'READY', url: stored, source: 'STORED' };
    const body = await this.graph(
      actor.businessId,
      comment.connection,
      comment.externalCommentId,
      'permalink_url',
    );
    const url = facebookPermalink(body['permalink_url']);
    if (!url) throw new BadGatewayException('Facebook chưa trả permalink cho bình luận này.');
    await this.prisma.socialComment.updateMany({
      where: { id: comment.id, businessId: actor.businessId, sourceUrl: comment.sourceUrl },
      data: { sourceUrl: url },
    });
    return { status: 'READY', url, source: 'META' };
  }

  private async downloadImage(initialUrl: URL): Promise<{ bytes: Buffer; mimeType: string }> {
    let url = initialUrl;
    for (let redirect = 0; redirect < 3; redirect++) {
      let response: Response;
      try {
        response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      } catch {
        throw new BadGatewayException('Không tải được ảnh từ Facebook.');
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        let next: URL | null = null;
        try {
          next = location ? metaImageUrl(new URL(location, url).toString()) : null;
        } catch {
          // A malformed redirect is an upstream failure, never a server error.
        }
        if (!next) throw new BadGatewayException('Nguồn ảnh chuyển hướng không hợp lệ.');
        url = next;
        continue;
      }
      if (!response.ok || !response.body)
        throw new BadGatewayException('Ảnh Facebook hiện không truy cập được.');
      const mimeType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase() ?? '';
      if (!IMAGE_TYPES.has(mimeType))
        throw new UnsupportedMediaTypeException('Tệp đính kèm không phải ảnh được hỗ trợ.');
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_IMAGE_BYTES)
        throw new PayloadTooLargeException('Ảnh vượt giới hạn 8 MB.');
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_IMAGE_BYTES) throw new PayloadTooLargeException('Ảnh vượt giới hạn 8 MB.');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      return { bytes: Buffer.concat(chunks), mimeType };
    }
    throw new BadGatewayException('Ảnh Facebook chuyển hướng quá nhiều lần.');
  }

  async messageImage(
    actor: RequestStaff,
    conversationId: string,
    messageId: string,
    indexRaw: string,
  ) {
    if (!/^(?:[0-9])$/.test(indexRaw)) throw new NotFoundException('Không tìm thấy ảnh đính kèm.');
    const index = Number(indexRaw);
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        conversation: { businessId: actor.businessId },
      },
      select: {
        connectionId: true,
        externalMessageId: true,
        mediaMetadata: true,
        connection: {
          select: {
            provider: true,
            status: true,
            externalAccountId: true,
            credentialCiphertext: true,
          },
        },
      },
    });
    if (!message) throw new NotFoundException('Không tìm thấy tin nhắn.');
    await this.pageAccess.assert(actor, message.connectionId);
    const saved = Array.isArray(message.mediaMetadata)
      ? record(message.mediaMetadata[index])
      : null;
    const savedUrl = metaImageUrl(record(saved?.['payload'])?.['url']);
    let currentUrl: URL | null = null;
    try {
      const body = await this.graph(
        actor.businessId,
        message.connection,
        message.externalMessageId,
        'attachments',
      );
      const attachments = record(body['attachments']);
      const data = attachments?.['data'];
      const item = Array.isArray(data) ? record(data[index]) : null;
      const imageData = record(item?.['image_data']);
      currentUrl = metaImageUrl(imageData?.['url'] ?? imageData?.['preview_url']);
    } catch (error) {
      if (!savedUrl) throw error;
    }
    if (!currentUrl && !savedUrl)
      throw new NotFoundException('Tin nhắn không có ảnh ở vị trí này.');
    try {
      return await this.downloadImage(currentUrl ?? savedUrl!);
    } catch (error) {
      if (!savedUrl || !currentUrl || savedUrl.toString() === currentUrl.toString()) throw error;
      return this.downloadImage(savedUrl);
    }
  }
}

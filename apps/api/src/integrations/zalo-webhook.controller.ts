import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../identity/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
import { parseZaloWebhook } from './zalo-webhook-parser';
import { verifyZaloSignature } from './zalo-webhook-signature';

@Public()
@Controller('webhooks/zalo')
export class ZaloWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-zevent-signature') signature?: string,
  ) {
    const appSecret = this.config.get<string>('ZALO_OA_SECRET_KEY');
    const rawBody = request.rawBody;
    if (!appSecret || !rawBody || !signature || !verifyZaloSignature(rawBody, signature, appSecret))
      throw new UnauthorizedException('Zalo webhook signature is invalid.');

    let event;
    try {
      event = parseZaloWebhook(request.body as unknown);
    } catch {
      throw new BadRequestException('Unsupported Zalo webhook event.');
    }
    if (!event) return { received: true, ignored: true };

    const connections = await this.prisma.integrationConnection.findMany({
      where: {
        provider: 'ZALO',
        externalAccountId: event.oaId,
        status: { in: ['CONNECTED', 'REAUTH_REQUIRED'] },
      },
      select: { id: true, status: true, capabilities: true },
      take: 2,
    });
    if (connections.length > 1)
      throw new ServiceUnavailableException(
        'OA được gắn nhiều đơn vị; cần xử lý xung đột kết nối.',
      );
    const connection = connections[0];
    const capabilities =
      connection?.capabilities &&
      typeof connection.capabilities === 'object' &&
      !Array.isArray(connection.capabilities)
        ? (connection.capabilities as Record<string, unknown>)
        : {};
    if (!connection || capabilities['authorization'] !== 'VERIFIED')
      throw new ServiceUnavailableException(
        'Zalo OA chưa được xác minh qua luồng cấp quyền; không nhận webhook vào kết nối khai báo thủ công.',
      );
    await this.integrations.enqueue({
      connectionId: connection.id,
      kind: 'MESSAGE',
      idempotencyKey: event.idempotencyKey,
      providerObjectId: event.messageId,
      providerAt: event.providerAt,
      payload: event.payload,
    });
    // A signed webhook is a transport health signal, not proof of OAuth authorization.
    return { received: true };
  }
}

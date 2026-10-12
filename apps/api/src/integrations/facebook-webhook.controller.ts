import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Response } from 'express';
import { Public } from '../identity/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';
import { safeEquals, verifyFacebookSignature } from './facebook-webhook-signature';
import { parseFacebookWebhook } from './facebook-webhook-parser';

@Public()
@Controller('webhooks/facebook')
export class FacebookWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get()
  verify(@Query() query: Record<string, string>, @Res() response: Response) {
    const configured = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN');
    if (
      !configured ||
      query['hub.mode'] !== 'subscribe' ||
      !safeEquals(query['hub.verify_token'] ?? '', configured)
    )
      throw new UnauthorizedException('Webhook verification failed.');
    return response
      .status(200)
      .type('text/plain')
      .send(query['hub.challenge'] ?? '');
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const secret = this.config.get<string>('FACEBOOK_APP_SECRET');
    const raw = request.rawBody;
    if (!secret || !raw || !signature || !verifyFacebookSignature(raw, signature, secret))
      throw new UnauthorizedException('Webhook signature is invalid.');
    let entries;
    try {
      entries = parseFacebookWebhook(request.body as unknown);
    } catch {
      throw new BadRequestException('Unsupported Facebook webhook object.');
    }
    for (const entry of entries) {
      const pageId = entry.pageId;
      const connections = await this.prisma.integrationConnection.findMany({
        where: {
          provider: 'FACEBOOK',
          externalAccountId: pageId,
          status: { in: ['CONNECTED', 'REAUTH_REQUIRED'] },
        },
        select: { id: true, status: true, capabilities: true },
        take: 2,
      });
      const connection = connections.length === 1 ? connections[0] : null;
      const capabilities =
        connection?.capabilities &&
        typeof connection.capabilities === 'object' &&
        !Array.isArray(connection.capabilities)
          ? (connection.capabilities as Record<string, unknown>)
          : {};
      if (!connection || capabilities['authorization'] !== 'VERIFIED')
        throw new ServiceUnavailableException(
          'Facebook Page chưa được xác minh qua luồng cấp quyền; không nhận webhook vào kết nối khai báo thủ công.',
        );
      for (const event of entry.events) {
        await this.integrations.enqueue({
          connectionId: connection.id,
          kind: event.kind,
          idempotencyKey: event.key,
          providerObjectId: event.objectId,
          providerAt: event.providerAt,
          payload: event.payload,
        });
      }
      // A signed delivery proves webhook reachability only. It must never promote a
      // manually entered Page ID to an authorized/connected account.
    }
    return { received: true };
  }
}

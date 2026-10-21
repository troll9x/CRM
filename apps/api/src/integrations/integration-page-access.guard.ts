import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationPageAccessService } from './integration-page-access.service';

@Injectable()
export class IntegrationPageAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: IntegrationPageAccessService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const actor = request.staff;
    if (!actor) throw new UnauthorizedException('Vui lòng đăng nhập.');
    if (this.access.isManager(actor)) return true;
    const path = request.path.replace(/^\/api\/v1\/integrations\/?/, '');
    const parts = path.split('/');
    const resource = parts[0];
    const id = parts[1];
    if (
      request.method === 'GET' &&
      ['connections', 'inbox', 'comments', 'orders', 'tickets', 'assignees'].includes(path)
    )
      return true;
    let connectionId: string | undefined;
    const body = request.body as
      { connectionId?: string; sourceType?: string; sourceId?: string } | undefined;
    if (resource === 'connections' && id) connectionId = id;
    if (resource === 'product-mappings') connectionId = body?.connectionId;
    if (resource === 'tickets' && !id && request.method === 'POST') {
      if (body?.sourceType === 'CONVERSATION' && body.sourceId) {
        connectionId = (
          await this.prisma.conversation.findFirst({
            where: { id: body.sourceId, businessId: actor.businessId },
            select: { connectionId: true },
          })
        )?.connectionId;
      } else if (body?.sourceType === 'COMMENT' && body.sourceId) {
        connectionId = (
          await this.prisma.socialComment.findFirst({
            where: { id: body.sourceId, businessId: actor.businessId },
            select: { connectionId: true },
          })
        )?.connectionId;
      }
    }
    if (resource === 'conversations' && id)
      connectionId = (
        await this.prisma.conversation.findFirst({
          where: { id, businessId: actor.businessId },
          select: { connectionId: true },
        })
      )?.connectionId;
    if (resource === 'comments' && id)
      connectionId = (
        await this.prisma.socialComment.findFirst({
          where: { id, businessId: actor.businessId },
          select: { connectionId: true },
        })
      )?.connectionId;
    if (resource === 'identities' && id)
      connectionId = (
        await this.prisma.externalCustomerIdentity.findFirst({
          where: { id, businessId: actor.businessId },
          select: { connectionId: true },
        })
      )?.connectionId;
    if (resource === 'orders' && id)
      connectionId = (
        await this.prisma.externalOrder.findFirst({
          where: { id, businessId: actor.businessId },
          select: { connectionId: true },
        })
      )?.connectionId;
    if (resource === 'tickets' && id) {
      const ticket = await this.prisma.socialTicket.findFirst({
        where: { id, businessId: actor.businessId },
        select: {
          conversation: { select: { connectionId: true } },
          comment: { select: { connectionId: true } },
        },
      });
      connectionId = ticket?.conversation?.connectionId ?? ticket?.comment?.connectionId;
    }
    if (!connectionId) throw new NotFoundException('Không tìm thấy nguồn trong đơn vị.');
    await this.access.assert(
      actor,
      connectionId,
      (resource === 'conversations' && parts[2] === 'send') ||
        (resource === 'comments' && parts[2] === 'reply'),
    );
    return true;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type SocialOutboundKind } from '../generated/prisma/client';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialCrypto } from './credential-crypto';
import { FacebookSendClient, FacebookSendError } from './facebook-send.client';

type Source = { kind: SocialOutboundKind; id: string };
type Credential = { pageToken?: string; userToken?: string };
const publicFields = {
  id: true,
  kind: true,
  status: true,
  body: true,
  errorCode: true,
  providerObjectId: true,
  createdAt: true,
  attemptedAt: true,
  acceptedAt: true,
} as const;

@Injectable()
export class SocialOutboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly facebook: FacebookSendClient,
  ) {}

  private async source(actor: RequestStaff, source: Source) {
    if (source.kind === 'MESSENGER') {
      const row = await this.prisma.conversation.findFirst({
        where: { id: source.id, businessId: actor.businessId },
        include: {
          connection: true,
          identity: { select: { externalUserId: true, connectionId: true } },
          messages: {
            where: { direction: 'INBOUND' },
            orderBy: { providerAt: 'desc' },
            take: 1,
            select: { providerAt: true },
          },
        },
      });
      if (!row) throw new NotFoundException('Không tìm thấy hội thoại trong đơn vị.');
      return { row, connection: row.connection };
    }
    const row = await this.prisma.socialComment.findFirst({
      where: { id: source.id, businessId: actor.businessId },
      include: { connection: true },
    });
    if (!row) throw new NotFoundException('Không tìm thấy bình luận trong đơn vị.');
    return { row, connection: row.connection };
  }

  private deny(reason: string) {
    return { status: reason, canSend: false } as const;
  }

  async connectionGrant(actor: RequestStaff, connectionId: string) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, businessId: actor.businessId, provider: 'FACEBOOK' },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy Facebook Page trong đơn vị.');
    if (connection.status !== 'CONNECTED' || !connection.credentialCiphertext)
      return { status: 'NOT_CONNECTED' };
    let credential: Credential;
    try {
      credential = new CredentialCrypto(
        this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
      ).decrypt<Credential>(
        connection.credentialCiphertext,
        `facebook-connection:${actor.businessId}:${connection.externalAccountId}`,
      );
    } catch {
      return { status: 'REAUTH_REQUIRED' };
    }
    if (!credential.pageToken || !credential.userToken) return { status: 'REAUTH_REQUIRED' };
    try {
      const grant = await this.facebook.inspect(
        connection.externalAccountId, credential.pageToken, credential.userToken,
      );
      return {
        status: 'CHECKED', checkedAt: new Date().toISOString(),
        permissions: {
          pages_messaging: grant.granted.has('pages_messaging'),
          pages_read_user_content: grant.granted.has('pages_read_user_content'),
          pages_manage_engagement: grant.granted.has('pages_manage_engagement'),
        },
        tasks: {
          messaging: grant.pageTasks.some((task) => /MESSAG|FULL_CONTROL/.test(task)),
          moderation: grant.pageTasks.some((task) => /MODERAT|FULL_CONTROL/.test(task)),
        },
      };
    } catch (error) {
      return { status: error instanceof FacebookSendError ? error.reason : 'PROVIDER_CHECK_UNAVAILABLE' };
    }
  }

  async capability(actor: RequestStaff, source: Source) {
    const { row, connection } = await this.source(actor, source);
    if (!actor.permissions.includes('integrations.inbox.manage'))
      return this.deny('NO_CRM_PERMISSION');
    if (connection.provider !== 'FACEBOOK') return this.deny('CHANNEL_SEND_UNAVAILABLE');
    if (connection.status !== 'CONNECTED' || !connection.credentialCiphertext)
      return this.deny('PAGE_NOT_CONNECTED');
    const capabilities =
      connection.capabilities &&
      typeof connection.capabilities === 'object' &&
      !Array.isArray(connection.capabilities)
        ? (connection.capabilities as Record<string, unknown>)
        : {};
    if (capabilities.authorization !== 'VERIFIED') return this.deny('PAGE_NOT_VERIFIED');
    if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date())
      return this.deny('REAUTH_REQUIRED');
    if (source.kind === 'MESSENGER') {
      if (!('identity' in row)) return this.deny('RECIPIENT_UNVERIFIED');
      if (row.assignedStaffId && row.assignedStaffId !== actor.id)
        return this.deny('ASSIGNED_TO_OTHER_STAFF');
      if (
        !row.identity ||
        row.identity.connectionId !== connection.id ||
        row.identity.externalUserId !== row.externalId ||
        !/^[0-9]+$/.test(row.externalId) ||
        row.externalId === connection.externalAccountId
      )
        return this.deny('RECIPIENT_UNVERIFIED');
      const inbound = row.messages[0]?.providerAt;
      // RESPONSE only. Never silently use a message tag or other policy exception.
      if (!inbound || inbound.getTime() <= Date.now() - 23 * 60 * 60 * 1000)
        return this.deny('OUTSIDE_24H_WINDOW');
    } else if ('status' in row && row.status !== 'ACTIVE') {
      return this.deny('COMMENT_NOT_ACTIVE');
    }
    let credential: Credential;
    try {
      credential = new CredentialCrypto(
        this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
      ).decrypt<Credential>(
        connection.credentialCiphertext,
        `facebook-connection:${actor.businessId}:${connection.externalAccountId}`,
      );
    } catch {
      return this.deny('REAUTH_REQUIRED');
    }
    if (!credential.pageToken || !credential.userToken) return this.deny('REAUTH_REQUIRED');
    try {
      const grant = await this.facebook.inspect(
        connection.externalAccountId,
        credential.pageToken,
        credential.userToken,
      );
      if (source.kind === 'MESSENGER') {
        if (!grant.granted.has('pages_messaging')) return this.deny('BLOCKED_PERMISSION');
        if (!grant.pageTasks.some((task) => /MESSAG|FULL_CONTROL/.test(task)))
          return this.deny('PAGE_TASK_MISSING');
      } else {
        if (
          !grant.granted.has('pages_read_user_content') ||
          !grant.granted.has('pages_manage_engagement')
        )
          return this.deny('BLOCKED_PERMISSION');
        if (!grant.pageTasks.some((task) => /MODERAT|FULL_CONTROL/.test(task)))
          return this.deny('PAGE_TASK_MISSING');
      }
      return { status: 'CAN_SEND', canSend: true, connectionId: connection.id } as const;
    } catch (error) {
      return this.deny(
        error instanceof FacebookSendError ? error.reason : 'PROVIDER_CHECK_UNAVAILABLE',
      );
    }
  }

  async list(actor: RequestStaff, source: Source) {
    await this.source(actor, source);
    await this.recoverStale({ businessId: actor.businessId,
      ...(source.kind === 'MESSENGER' ? { conversationId: source.id } : { commentId: source.id }),
    });
    return this.prisma.socialOutbound.findMany({
      where: {
        businessId: actor.businessId,
        ...(source.kind === 'MESSENGER'
          ? { conversationId: source.id }
          : { commentId: source.id }),
      },
      select: publicFields,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async send(actor: RequestStaff, source: Source, bodyInput: string, requestKey: string) {
    const body = bodyInput.trim();
    if (!body || body.length > 2000) throw new BadRequestException('Nội dung cần 1–2000 ký tự.');
    const scopedSource = await this.source(actor, source);
    if (
      source.kind === 'MESSENGER' &&
      'assignedStaffId' in scopedSource.row &&
      scopedSource.row.assignedStaffId &&
      scopedSource.row.assignedStaffId !== actor.id
    ) throw new ConflictException('Hội thoại đã giao cho nhân viên khác.');
    const existing = await this.prisma.socialOutbound.findUnique({
      where: { businessId_requestKey: { businessId: actor.businessId, requestKey } },
    });
    if (existing) {
      if (
        existing.kind !== source.kind ||
        (existing.conversationId ?? existing.commentId) !== source.id ||
        existing.body !== body
      )
        throw new ConflictException('Mã yêu cầu đã dùng cho nội dung khác.');
      return this.publicIntent(existing.id);
    }
    const capability = await this.capability(actor, source);
    if (!capability.canSend)
      throw new ConflictException(`Không thể gửi: ${capability.status}.`);
    const { row, connection } = scopedSource;
    let credential: Credential;
    try {
      credential = new CredentialCrypto(
        this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
      ).decrypt<Credential>(
        connection.credentialCiphertext!,
        `facebook-connection:${actor.businessId}:${connection.externalAccountId}`,
      );
      if (!credential.pageToken) throw new Error('PAGE_TOKEN_MISSING');
    } catch {
      throw new ConflictException('Token Page cần được cấp quyền lại.');
    }
    let intent;
    try {
      intent = await this.prisma.socialOutbound.create({
        data: {
          businessId: actor.businessId,
          connectionId: connection.id,
          conversationId: source.kind === 'MESSENGER' ? source.id : null,
          commentId: source.kind === 'COMMENT_REPLY' ? source.id : null,
          actorId: actor.id,
          requestKey,
          kind: source.kind,
          body,
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.socialOutbound.findUnique({
          where: { businessId_requestKey: { businessId: actor.businessId, requestKey } },
        });
        if (
          replay && replay.kind === source.kind &&
          (replay.conversationId ?? replay.commentId) === source.id && replay.body === body
        ) return this.publicIntent(replay.id);
        throw new ConflictException('Mã yêu cầu đã dùng cho nội dung khác.');
      }
      throw error;
    }
    const claimed = await this.prisma.socialOutbound.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'SENDING', attemptedAt: new Date() },
    });
    if (claimed.count !== 1) return this.publicIntent(intent.id);
    let providerObjectId: string;
    try {
      if (source.kind === 'MESSENGER' && 'externalId' in row) {
        providerObjectId = await this.facebook.sendText(
          connection.externalAccountId,
          row.externalId,
          body,
          credential.pageToken,
        );
      } else if ('externalCommentId' in row) {
        providerObjectId = await this.facebook.replyComment(
          row.externalCommentId,
          body,
          credential.pageToken,
        );
      } else throw new Error('SOURCE_MISMATCH');
    } catch (error) {
      const definitive = error instanceof FacebookSendError && error.definitive;
      await this.prisma.$transaction(async (tx) => {
        await tx.socialOutbound.update({
          where: { id: intent.id },
          data: {
            status: definitive ? 'FAILED' : 'UNKNOWN',
            errorCode: error instanceof FacebookSendError ? error.reason : 'PROVIDER_UNKNOWN',
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: actor.businessId, actorId: actor.id,
            action: 'integration.facebook.outbound.result',
            entityType: 'SocialOutbound', entityId: intent.id,
            metadata: { kind: source.kind, result: definitive ? 'FAILED' : 'UNKNOWN' },
          },
        });
      });
      return this.publicIntent(intent.id);
    }
    const acceptedAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.socialOutbound.update({
          where: { id: intent.id },
          data: { status: 'SENT_TO_PROVIDER', providerObjectId, acceptedAt },
        });
        if (source.kind === 'MESSENGER') {
          await tx.conversationMessage.createMany({
            data: [{
              connectionId: connection.id, conversationId: source.id,
              externalMessageId: providerObjectId, direction: 'OUTBOUND_ECHO',
              body, contentType: 'text', providerAt: acceptedAt,
            }],
            skipDuplicates: true,
          });
          await tx.conversation.updateMany({
            where: { id: source.id, businessId: actor.businessId },
            data: { lastMessageAt: acceptedAt },
          });
        } else if ('externalPostId' in row) {
          await tx.socialComment.createMany({
            data: [{
              businessId: actor.businessId, connectionId: connection.id,
              externalCommentId: providerObjectId, externalPostId: row.externalPostId,
              externalParentId: row.externalCommentId,
              externalAuthorId: connection.externalAccountId,
              authorDisplayName: connection.displayName, body,
              status: 'ACTIVE', providerAt: acceptedAt,
            }],
            skipDuplicates: true,
          });
        }
        await tx.auditLog.create({
          data: {
            businessId: actor.businessId, actorId: actor.id,
            action: 'integration.facebook.outbound.accepted',
            entityType: 'SocialOutbound', entityId: intent.id,
            metadata: { kind: source.kind },
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch {
      // The provider may already have sent it. Reconciliation must never POST again.
      await this.prisma.socialOutbound.updateMany({
        where: { id: intent.id, status: 'SENDING' },
        data: { status: 'UNKNOWN', providerObjectId, errorCode: 'LOCAL_PERSISTENCE_UNKNOWN' },
      }).catch(() => undefined);
    }
    return this.publicIntent(intent.id);
  }

  private async publicIntent(id: string) {
    await this.recoverStale({ id });
    const row = await this.prisma.socialOutbound.findUnique({ where: { id }, select: publicFields });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu gửi.');
    return row;
  }

  private async recoverStale(where: Prisma.SocialOutboundWhereInput) {
    await this.prisma.socialOutbound.updateMany({
      where: {
        ...where, status: 'SENDING',
        attemptedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) },
      },
      data: { status: 'UNKNOWN', errorCode: 'LOCAL_SEND_OUTCOME_UNKNOWN' },
    });
  }
}

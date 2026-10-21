import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type IntegrationJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZaloAuthService } from './zalo-auth.service';
import { FacebookBackfillService } from './facebook-backfill.service';

type MessageEvent = {
  type: 'message';
  conversationId: string;
  externalUserId: string;
  messageId: string;
  direction?: 'INBOUND' | 'OUTBOUND_ECHO';
  body?: string;
  contentType: string;
  mediaMetadata?: unknown;
  timestamp: string;
  displayName?: string;
};
type CommentEvent = {
  type: 'comment';
  commentId: string;
  postId: string;
  parentId?: string;
  authorId?: string;
  authorName?: string;
  body?: string;
  sourceUrl?: string;
  timestamp: string;
  status?: string;
};
type OrderEvent = {
  type: 'order';
  orderId: string;
  sourceStatus: string;
  normalizedStatus: string;
  createdAt?: string;
  updatedAt?: string;
  currency: string;
  totalAmount?: string;
  recipient?: unknown;
  lines: Array<{
    productId?: string;
    modelId?: string;
    sku?: string;
    title: string;
    quantity: string;
    unit?: string;
    unitPrice?: string;
    lineAmount?: string;
  }>;
};

@Injectable()
export class IntegrationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrationWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastCredentialExpiryCheck = 0;
  private readonly workerId = `integration-worker-${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly zaloAuth: ZaloAuthService,
    private readonly facebookBackfill: FacebookBackfillService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('INTEGRATIONS_WORKER_ENABLED') !== 'true') return;
    this.timer = setInterval(() => void this.runOnce(), 1500);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    let activeJob: IntegrationJob | null = null;
    try {
      const now = new Date();
      if (now.getTime() - this.lastCredentialExpiryCheck > 60_000) {
        await this.prisma.integrationAuthAttempt.updateMany({
          where: { expiresAt: { lte: now }, status: { in: ['PENDING', 'CLAIMED', 'READY'] } },
          data: {
            status: 'FAILED',
            errorCode: 'ATTEMPT_EXPIRED',
            credentialCiphertext: null,
            availableAccounts: Prisma.DbNull,
          },
        });
        await this.prisma.integrationConnection.updateMany({
          where: { provider: 'FACEBOOK', status: 'CONNECTED', tokenExpiresAt: { lte: now } },
          data: {
            status: 'REAUTH_REQUIRED',
            lastErrorCode: 'FACEBOOK_GRANT_EXPIRED',
            lastErrorAt: now,
          },
        });
        await this.zaloAuth.refreshDue(now);
        this.lastCredentialExpiryCheck = now.getTime();
      }
      const candidate = await this.prisma.integrationJob.findFirst({
        where: {
          OR: [
            { status: { in: ['PENDING', 'RETRY'] }, availableAt: { lte: now } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
          ],
        },
        orderBy: [{ availableAt: 'asc' }, { receivedAt: 'asc' }],
        select: { id: true, connectionId: true },
      });
      if (!candidate) return false;
      const connection = await this.prisma.integrationConnection.findUnique({
        where: { id: candidate.connectionId },
        select: { status: true },
      });
      if (connection?.status === 'PAUSED') {
        await this.prisma.integrationJob.updateMany({
          where: { id: candidate.id, status: { in: ['PENDING', 'RETRY', 'PROCESSING'] } },
          data: {
            status: 'BLOCKED',
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: 'CONNECTION_PAUSED',
          },
        });
        return true;
      }
      const claimed = await this.prisma.integrationJob.updateMany({
        where: {
          id: candidate.id,
          OR: [
            { status: { in: ['PENDING', 'RETRY'] }, availableAt: { lte: now } },
            { status: 'PROCESSING', leaseExpiresAt: { lte: now } },
          ],
        },
        data: {
          status: 'PROCESSING',
          leaseOwner: this.workerId,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) return false;
      const job = await this.prisma.integrationJob.findUnique({ where: { id: candidate.id } });
      if (!job) return false;
      activeJob = job;
      const completed =
        job.kind === 'BACKFILL'
          ? await this.facebookBackfill.processBatch(job, this.workerId)
          : (await this.process(job), true);
      await this.prisma.integrationJob.updateMany({
        where: { id: job.id, status: 'PROCESSING', leaseOwner: this.workerId },
        data: {
          status: completed ? 'SUCCEEDED' : 'PENDING',
          ...(completed
            ? { completedAt: new Date() }
            : { availableAt: new Date(Date.now() + 250), attempts: 0 }),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
        },
      });
      await this.prisma.integrationConnection.update({
        where: { id: job.connectionId },
        data: { lastSyncAt: new Date(), lastErrorCode: null, lastErrorAt: null },
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Integration job failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      if (activeJob) {
        const code =
          error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)
            ? error.message
            : 'PROCESSING_FAILED';
        const blocked = [
          'BLOCKED_PERMISSION',
          'REAUTH_REQUIRED',
          'BACKFILL_PAGE_LIMIT_REACHED',
        ].includes(code);
        const terminal = activeJob.attempts >= activeJob.maxAttempts;
        const delayMs = Math.min(60 * 60_000, 1000 * 2 ** Math.min(activeJob.attempts, 12));
        await this.prisma.integrationJob.updateMany({
          where: { id: activeJob.id, status: 'PROCESSING', leaseOwner: this.workerId },
          data: {
            status: blocked ? 'BLOCKED' : terminal ? 'DEAD' : 'RETRY',
            availableAt: new Date(Date.now() + delayMs),
            lastErrorCode: code,
            leaseOwner: null,
            leaseExpiresAt: null,
            ...(terminal ? { completedAt: new Date() } : {}),
          },
        });
        await this.prisma.integrationConnection.updateMany({
          where: { id: activeJob.connectionId },
          data: { lastErrorCode: 'SYNC_JOB_FAILED', lastErrorAt: new Date() },
        });
        if (code === 'REAUTH_REQUIRED')
          await this.prisma.integrationConnection.updateMany({
            where: { id: activeJob.connectionId, provider: 'FACEBOOK' },
            data: { status: 'REAUTH_REQUIRED', lastErrorCode: code, lastErrorAt: new Date() },
          });
      }
      return true;
    } finally {
      this.running = false;
    }
  }

  private async process(job: IntegrationJob): Promise<void> {
    const payload = job.payload as Record<string, unknown>;
    if (job.kind === 'MESSAGE' && payload.type === 'message')
      return this.persistMessage(job, payload as unknown as MessageEvent);
    if (job.kind === 'COMMENT' && payload.type === 'comment')
      return this.persistComment(job, payload as unknown as CommentEvent);
    if (job.kind === 'ORDER' && payload.type === 'order')
      return this.persistOrder(job, payload as unknown as OrderEvent);
    throw new Error('UNSUPPORTED_NORMALIZED_EVENT');
  }

  private async persistMessage(job: IntegrationJob, event: MessageEvent): Promise<void> {
    const at = validDate(event.timestamp);
    const direction = event.direction ?? 'INBOUND';
    await this.prisma.$transaction(
      async (tx) => {
        const identity = await tx.externalCustomerIdentity.upsert({
          where: {
            connectionId_externalUserId: {
              connectionId: job.connectionId,
              externalUserId: event.externalUserId,
            },
          },
          create: {
            businessId: job.businessId,
            connectionId: job.connectionId,
            externalUserId: event.externalUserId,
            displayName: event.displayName,
          },
          update: event.displayName ? { displayName: event.displayName } : {},
        });
        const conversation = await tx.conversation.upsert({
          where: {
            connectionId_externalId: {
              connectionId: job.connectionId,
              externalId: event.conversationId,
            },
          },
          create: {
            businessId: job.businessId,
            connectionId: job.connectionId,
            identityId: identity.id,
            externalId: event.conversationId,
            unreadAt: direction === 'INBOUND' ? at : null,
            lastMessageAt: at,
          },
          update: {},
        });
        const inserted = await tx.conversationMessage.createMany({
          data: [
            {
              connectionId: job.connectionId,
              conversationId: conversation.id,
              externalMessageId: event.messageId,
              direction,
              body: event.body,
              contentType: event.contentType,
              mediaMetadata: event.mediaMetadata as Prisma.InputJsonValue | undefined,
              providerAt: at,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count)
          await tx.conversation.updateMany({
            where: {
              id: conversation.id,
              OR: [{ lastMessageAt: null }, { lastMessageAt: { lte: at } }],
            },
            data: {
              identityId: identity.id,
              ...(direction === 'INBOUND' ? { unreadAt: at } : {}),
              lastMessageAt: at,
            },
          });
        if (direction === 'OUTBOUND_ECHO') {
          await tx.socialOutbound.updateMany({
            where: {
              connectionId: job.connectionId,
              conversationId: conversation.id,
              providerObjectId: event.messageId,
              status: { in: ['SENDING', 'UNKNOWN'] },
            },
            data: { status: 'SENT_TO_PROVIDER', acceptedAt: at, errorCode: null },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async persistComment(job: IntegrationJob, event: CommentEvent): Promise<void> {
    const providerAt = validDate(event.timestamp);
    await this.prisma.socialComment.upsert({
      where: {
        connectionId_externalCommentId: {
          connectionId: job.connectionId,
          externalCommentId: event.commentId,
        },
      },
      create: {
        businessId: job.businessId,
        connectionId: job.connectionId,
        externalCommentId: event.commentId,
        externalPostId: event.postId,
        externalParentId: event.parentId,
        externalAuthorId: event.authorId,
        authorDisplayName: event.authorName,
        body: event.body,
        sourceUrl: event.sourceUrl,
        status: event.status ?? 'ACTIVE',
        providerAt,
      },
      update: {},
    });
    // A late backfill or replay must never undo a newer edit/delete event.
    await this.prisma.socialComment.updateMany({
      where: {
        connectionId: job.connectionId,
        externalCommentId: event.commentId,
        OR: [{ providerAt: { lt: providerAt } }, { providerAt, status: { not: 'DELETED' } }],
      },
      data: { body: event.body, status: event.status ?? 'ACTIVE', providerAt },
    });
  }

  private async persistOrder(job: IntegrationJob, event: OrderEvent): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.externalOrder.findUnique({
          where: {
            connectionId_externalOrderId: {
              connectionId: job.connectionId,
              externalOrderId: event.orderId,
            },
          },
          select: { id: true },
        });
        const order = await tx.externalOrder.upsert({
          where: {
            connectionId_externalOrderId: {
              connectionId: job.connectionId,
              externalOrderId: event.orderId,
            },
          },
          create: {
            businessId: job.businessId,
            connectionId: job.connectionId,
            externalOrderId: event.orderId,
            sourceStatus: event.sourceStatus,
            normalizedStatus: event.normalizedStatus,
            providerCreatedAt: event.createdAt ? validDate(event.createdAt) : undefined,
            providerUpdatedAt: event.updatedAt ? validDate(event.updatedAt) : undefined,
            currency: event.currency,
            totalAmount: event.totalAmount ? new Prisma.Decimal(event.totalAmount) : undefined,
            recipientSnapshot: event.recipient as Prisma.InputJsonValue | undefined,
          },
          update: {
            sourceStatus: event.sourceStatus,
            normalizedStatus: event.normalizedStatus,
            providerUpdatedAt: event.updatedAt ? validDate(event.updatedAt) : undefined,
            totalAmount: event.totalAmount ? new Prisma.Decimal(event.totalAmount) : undefined,
            recipientSnapshot: event.recipient as Prisma.InputJsonValue | undefined,
          },
        });
        await tx.externalOrderLine.deleteMany({ where: { externalOrderId: order.id } });
        for (const line of event.lines) {
          const mapping = line.productId
            ? await tx.externalProductMapping.findUnique({
                where: {
                  connectionId_externalProductId_externalModelId: {
                    connectionId: job.connectionId,
                    externalProductId: line.productId,
                    externalModelId: line.modelId ?? '',
                  },
                },
              })
            : null;
          await tx.externalOrderLine.create({
            data: {
              externalOrderId: order.id,
              externalProductId: line.productId,
              externalModelId: line.modelId,
              sourceSku: line.sku,
              titleSnapshot: line.title,
              quantity: new Prisma.Decimal(line.quantity),
              sourceUnit: line.unit,
              unitPrice: line.unitPrice ? new Prisma.Decimal(line.unitPrice) : undefined,
              lineAmount: line.lineAmount ? new Prisma.Decimal(line.lineAmount) : undefined,
              variantId: mapping?.variantId,
              conversionFactor: mapping?.conversionFactor,
            },
          });
        }
        if (!existing) {
          const owners = await tx.staffUser.findMany({
            where: {
              businessId: job.businessId,
              status: 'ACTIVE',
              roles: { some: { role: { code: { in: ['owner', 'admin'] } } } },
            },
            select: { id: true },
          });
          await tx.adminAlert.createMany({
            data: owners.map((owner) => ({
              businessId: job.businessId,
              recipientId: owner.id,
              externalOrderId: order.id,
              dedupeKey: `external-order:${order.id}:recipient:${owner.id}`,
              type: 'EXTERNAL_ORDER_IMPORTED' as const,
              title: 'Có đơn mới từ kênh bán',
              body: `Đơn ngoài ${event.orderId} (${job.kind}) cần được kiểm tra.`,
            })),
            skipDuplicates: true,
          });
          await tx.externalOrder.update({
            where: { id: order.id },
            data: { alertedAt: new Date() },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

function validDate(value: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('INVALID_PROVIDER_TIMESTAMP');
  return parsed;
}

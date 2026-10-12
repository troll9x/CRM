import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestStaff } from '../common/request-context';
import type {
  AddNoteDto,
  CreateConnectionDto,
  LinkCustomerDto,
  ListIntegrationQueryDto,
  ProductMappingDto,
  UnlinkIdentityDto,
  VersionedLinkCustomerDto,
  UpdateConversationDto,
} from './integration.dto';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async connections(businessId: string) {
    const connections = await this.prisma.integrationConnection.findMany({
      where: { businessId },
      orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        provider: true,
        externalAccountId: true,
        displayName: true,
        status: true,
        capabilities: true,
        lastSyncAt: true,
        lastErrorCode: true,
        lastErrorAt: true,
        connectedAt: true,
        createdAt: true,
      },
    });
    return connections.map(({ externalAccountId, ...connection }) => ({
      ...connection,
      externalAccountIdMasked: this.maskExternalId(externalAccountId),
    }));
  }

  async createConnection(businessId: string, dto: CreateConnectionDto) {
    const connection = await this.prisma.integrationConnection.upsert({
      where: {
        businessId_provider_externalAccountId: {
          businessId,
          provider: dto.provider,
          externalAccountId: dto.externalAccountId,
        },
      },
      create: {
        businessId,
        ...dto,
        status: 'NEEDS_SETUP',
        capabilities: { messages: 'UNVERIFIED', comments: 'UNVERIFIED', orders: 'UNVERIFIED' },
      },
      update: { displayName: dto.displayName },
      select: {
        id: true,
        provider: true,
        externalAccountId: true,
        displayName: true,
        status: true,
      },
    });
    return {
      ...connection,
      externalAccountIdMasked: this.maskExternalId(connection.externalAccountId),
      externalAccountId: undefined,
    };
  }

  async updateConnectionStatus(
    businessId: string,
    id: string,
    status: 'PAUSED' | 'CONFIGURED_UNVERIFIED',
  ) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối.');
    return this.prisma.integrationConnection.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, connectedAt: true },
    });
  }

  async inbox(businessId: string, query: ListIntegrationQueryDto) {
    const rows = await this.prisma.conversation.findMany({
      where: { businessId, ...(query.connectionId ? { connectionId: query.connectionId } : {}) },
      take: Math.min(query.limit ?? 50, 100),
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        connection: { select: { provider: true, displayName: true } },
        identity: {
          select: {
            id: true,
            externalUserId: true,
            displayName: true,
            customerId: true,
            version: true,
          },
        },
        assignedStaff: { select: { id: true, displayName: true } },
        messages: { orderBy: { providerAt: 'desc' }, take: 1 },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { createdBy: { select: { displayName: true } } },
        },
      },
    });
    return rows.map((row) => ({
      ...row,
      identity: row.identity
        ? { ...row.identity, externalUserId: this.maskExternalId(row.identity.externalUserId) }
        : null,
    }));
  }

  async comments(businessId: string, query: ListIntegrationQueryDto) {
    const rows = await this.prisma.socialComment.findMany({
      where: { businessId, ...(query.connectionId ? { connectionId: query.connectionId } : {}) },
      take: Math.min(query.limit ?? 50, 100),
      orderBy: { providerAt: 'desc' },
      include: { connection: { select: { provider: true, displayName: true } } },
    });
    return rows.map(({ externalAuthorId, ...comment }) => ({
      ...comment,
      externalAuthorId: externalAuthorId ? this.maskExternalId(externalAuthorId) : null,
    }));
  }

  linkCommentCustomer(businessId: string, id: string, dto: LinkCustomerDto): never {
    void businessId;
    void id;
    void dto;
    throw new ConflictException(
      'Chưa xác minh được định danh tác giả bình luận với ID Messenger; không thể dùng comment author làm social identity.',
    );
  }

  async updateConversation(businessId: string, id: string, dto: UpdateConversationDto) {
    const current = await this.prisma.conversation.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Không tìm thấy hội thoại.');
    if (dto.assignedStaffId) {
      const staff = await this.prisma.staffUser.findFirst({
        where: { id: dto.assignedStaffId, businessId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!staff)
        throw new NotFoundException('Không tìm thấy nhân viên đang hoạt động trong đơn vị.');
    }
    return this.prisma.conversation.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.assignedStaffId !== undefined ? { assignedStaffId: dto.assignedStaffId } : {}),
        unreadAt: null,
      },
      select: { id: true, status: true, assignedStaffId: true, unreadAt: true },
    });
  }

  async addNote(businessId: string, id: string, actor: RequestStaff, dto: AddNoteDto) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Không tìm thấy hội thoại.');
    return this.prisma.internalConversationNote.create({
      data: { businessId, conversationId: id, createdById: actor.id, body: dto.body.trim() },
      include: { createdBy: { select: { displayName: true } } },
    });
  }

  async identityLinkPreview(businessId: string, id: string, customerId: string) {
    const [identity, customer] = await Promise.all([
      this.prisma.externalCustomerIdentity.findFirst({
        where: { id, businessId },
        select: {
          id: true,
          displayName: true,
          externalUserId: true,
          customerId: true,
          version: true,
          linkedAt: true,
          connection: { select: { provider: true, displayName: true, externalAccountId: true } },
          customer: { select: { id: true, customerCode: true, displayName: true } },
        },
      }),
      this.prisma.customer.findFirst({
        where: { id: customerId, businessId, status: 'ACTIVE' },
        select: { id: true, customerCode: true, displayName: true, version: true },
      }),
    ]);
    if (!identity || !customer)
      throw new NotFoundException('Không tìm thấy định danh ngoài hoặc khách hàng trong đơn vị.');
    return {
      identity: {
        id: identity.id,
        provider: identity.connection.provider,
        account: identity.connection.displayName,
        externalUserIdMasked: this.maskExternalId(identity.externalUserId),
        displayName: identity.displayName,
        currentCustomer: identity.customer,
        version: identity.version,
      },
      targetCustomer: customer,
      requiresExplicitTransfer: Boolean(identity.customerId && identity.customerId !== customer.id),
    };
  }

  private maskExternalId(id: string) {
    return id.length <= 6 ? '••••' : `${id.slice(0, 3)}…${id.slice(-3)}`;
  }

  async linkIdentity(
    actor: RequestStaff,
    id: string,
    dto: VersionedLinkCustomerDto,
    requestId: string,
  ) {
    return this.setIdentityCustomer(actor, id, dto, requestId, 'LINK');
  }

  async transferIdentity(
    actor: RequestStaff,
    id: string,
    dto: VersionedLinkCustomerDto,
    requestId: string,
  ) {
    return this.setIdentityCustomer(actor, id, dto, requestId, 'TRANSFER');
  }

  private async setIdentityCustomer(
    actor: RequestStaff,
    id: string,
    dto: VersionedLinkCustomerDto,
    requestId: string,
    action: 'LINK' | 'TRANSFER',
  ) {
    const identity = await this.prisma.externalCustomerIdentity.findFirst({
      where: { id, businessId: actor.businessId },
      select: { id: true, customerId: true, version: true, connectionId: true },
    });
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, businessId: actor.businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!identity || !customer)
      throw new NotFoundException(
        'Không tìm thấy định danh ngoài hoặc khách hàng đang hoạt động trong đơn vị.',
      );
    if (
      dto.expectedCustomerId === undefined ||
      (dto.expectedCustomerId ?? null) !== identity.customerId
    )
      throw new ConflictException(
        'Liên kết hiện tại khác bản xem trước; hãy tải lại và xác nhận lại.',
      );
    if (identity.version !== dto.expectedVersion)
      throw new ConflictException('Liên kết đã thay đổi; hãy tải lại và xem trước lần nữa.');
    if (action === 'LINK' && identity.customerId && identity.customerId !== customer.id)
      throw new ConflictException(
        'Định danh đã gắn với khách khác; cần dùng thao tác chuyển liên kết có xác nhận.',
      );
    if (action === 'TRANSFER' && !identity.customerId)
      throw new ConflictException(
        'Định danh hiện chưa liên kết; hãy dùng thao tác liên kết thông thường.',
      );
    if (identity.customerId === customer.id) return identity;
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.externalCustomerIdentity.updateMany({
        where: {
          id,
          businessId: actor.businessId,
          version: dto.expectedVersion,
          customerId: identity.customerId,
        },
        data: {
          customerId: customer.id,
          linkedAt: new Date(),
          linkedById: actor.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('Liên kết đã đổi bởi người dùng khác; hãy tải lại.');
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action:
            action === 'LINK'
              ? 'customer.social_identity.linked'
              : 'customer.social_identity.transferred',
          entityType: 'ExternalCustomerIdentity',
          entityId: id,
          requestId,
          metadata: {
            connectionId: identity.connectionId,
            fromCustomerId: identity.customerId,
            toCustomerId: customer.id,
            version: dto.expectedVersion + 1,
          },
        },
      });
      return tx.externalCustomerIdentity.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          externalUserId: true,
          displayName: true,
          customerId: true,
          linkedAt: true,
          linkedById: true,
          version: true,
        },
      });
    });
    return {
      id: updated.id,
      externalUserIdMasked: this.maskExternalId(updated.externalUserId),
      displayName: updated.displayName,
      customerId: updated.customerId,
      linkedAt: updated.linkedAt,
      linkedById: updated.linkedById,
      version: updated.version,
    };
  }

  async unlinkIdentity(actor: RequestStaff, id: string, dto: UnlinkIdentityDto, requestId: string) {
    if (dto.expectedCustomerId === undefined)
      throw new BadRequestException(
        'Cần gửi expectedCustomerId (có thể là null) để xác nhận liên kết đang xem.',
      );
    return this.prisma.$transaction(async (tx) => {
      const identity = await tx.externalCustomerIdentity.findFirst({
        where: { id, businessId: actor.businessId },
        select: { id: true, customerId: true, version: true, connectionId: true },
      });
      if (!identity) throw new NotFoundException('Không tìm thấy định danh trong đơn vị.');
      if (
        identity.version !== dto.expectedVersion ||
        identity.customerId !== (dto.expectedCustomerId ?? null)
      )
        throw new ConflictException('Liên kết đã thay đổi; hãy tải lại trước khi gỡ.');
      if (!identity.customerId) return identity;
      const changed = await tx.externalCustomerIdentity.updateMany({
        where: {
          id,
          businessId: actor.businessId,
          version: dto.expectedVersion,
          customerId: identity.customerId,
        },
        data: { customerId: null, linkedAt: null, linkedById: null, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException('Liên kết đã đổi bởi người dùng khác.');
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.social_identity.unlinked',
          entityType: 'ExternalCustomerIdentity',
          entityId: id,
          requestId,
          metadata: {
            connectionId: identity.connectionId,
            fromCustomerId: identity.customerId,
            version: dto.expectedVersion + 1,
          },
        },
      });
      const updated = await tx.externalCustomerIdentity.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          externalUserId: true,
          displayName: true,
          customerId: true,
          linkedAt: true,
          version: true,
        },
      });
      return {
        id: updated.id,
        externalUserIdMasked: this.maskExternalId(updated.externalUserId),
        displayName: updated.displayName,
        customerId: updated.customerId,
        linkedAt: updated.linkedAt,
        version: updated.version,
      };
    });
  }

  async orders(businessId: string, query: ListIntegrationQueryDto) {
    return this.prisma.externalOrder.findMany({
      where: { businessId, ...(query.connectionId ? { connectionId: query.connectionId } : {}) },
      take: Math.min(query.limit ?? 50, 100),
      orderBy: [{ providerCreatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        connection: { select: { provider: true, displayName: true } },
        customer: {
          select: {
            id: true,
            customerCode: true,
            displayName: true,
            group: { select: { code: true, name: true } },
          },
        },
        lines: {
          orderBy: { createdAt: 'asc' },
          include: { variant: { select: { id: true, sku: true, name: true } } },
        },
      },
    });
  }

  async linkOrderCustomer(businessId: string, id: string, dto: LinkCustomerDto) {
    const [order, customer] = await Promise.all([
      this.prisma.externalOrder.findFirst({ where: { id, businessId }, select: { id: true } }),
      this.prisma.customer.findFirst({
        where: { id: dto.customerId, businessId },
        select: { id: true },
      }),
    ]);
    if (!order || !customer)
      throw new NotFoundException('Không tìm thấy đơn ngoài hoặc khách hàng trong đơn vị.');
    return this.prisma.externalOrder.update({
      where: { id },
      data: { customerId: customer.id },
      select: { id: true, customerId: true },
    });
  }

  async upsertProductMapping(businessId: string, dto: ProductMappingDto) {
    const [connection, variant] = await Promise.all([
      this.prisma.integrationConnection.findFirst({
        where: { id: dto.connectionId, businessId },
        select: { id: true },
      }),
      this.prisma.productVariant.findFirst({
        where: { id: dto.variantId, businessId },
        select: { id: true },
      }),
    ]);
    if (!connection || !variant)
      throw new NotFoundException('Không tìm thấy kết nối hoặc SKU trong đơn vị.');
    const modelId = dto.externalModelId ?? '';
    return this.prisma.externalProductMapping.upsert({
      where: {
        connectionId_externalProductId_externalModelId: {
          connectionId: connection.id,
          externalProductId: dto.externalProductId,
          externalModelId: modelId,
        },
      },
      create: {
        businessId,
        connectionId: connection.id,
        externalProductId: dto.externalProductId,
        externalModelId: modelId,
        variantId: variant.id,
        conversionFactor: new Prisma.Decimal(dto.conversionFactor),
      },
      update: { variantId: variant.id, conversionFactor: new Prisma.Decimal(dto.conversionFactor) },
    });
  }

  async jobs(businessId: string, query: ListIntegrationQueryDto) {
    return this.prisma.integrationJob.findMany({
      where: { businessId, ...(query.connectionId ? { connectionId: query.connectionId } : {}) },
      take: Math.min(query.limit ?? 50, 100),
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        connectionId: true,
        kind: true,
        status: true,
        providerObjectId: true,
        attempts: true,
        maxAttempts: true,
        lastErrorCode: true,
        receivedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    });
  }

  async retryJob(businessId: string, id: string) {
    const job = await this.prisma.integrationJob.findFirst({
      where: { id, businessId },
      select: { id: true, status: true, connection: { select: { status: true } } },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tác vụ đồng bộ.');
    if (job.connection.status === 'PAUSED')
      throw new ConflictException('Hãy mở lại kết nối trước khi chạy lại tác vụ.');
    if (!['DEAD', 'BLOCKED', 'RETRY'].includes(job.status))
      throw new ConflictException('Chỉ có thể chạy lại tác vụ lỗi hoặc đang chờ thử lại.');
    return this.prisma.integrationJob.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        completedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
      },
      select: { id: true, status: true },
    });
  }

  async enqueue(input: {
    connectionId: string;
    kind: 'MESSAGE' | 'COMMENT' | 'ORDER';
    idempotencyKey: string;
    providerObjectId?: string;
    providerAt?: Date;
    payload: Prisma.InputJsonValue;
  }) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { id: input.connectionId },
      select: { id: true, businessId: true, status: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối cho webhook.');
    try {
      return await this.prisma.integrationJob.create({
        data: {
          businessId: connection.businessId,
          connectionId: connection.id,
          kind: input.kind,
          status: connection.status === 'PAUSED' ? 'BLOCKED' : 'PENDING',
          idempotencyKey: input.idempotencyKey,
          externalEventId: input.idempotencyKey,
          providerObjectId: input.providerObjectId,
          providerAt: input.providerAt,
          payload: input.payload,
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.integrationJob.findFirst({
          where: { connectionId: connection.id, idempotencyKey: input.idempotencyKey },
          select: { id: true, status: true },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
}

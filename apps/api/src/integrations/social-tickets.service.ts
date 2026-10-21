import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { RequestStaff } from '../common/request-context';
import { IntegrationPageAccessService } from './integration-page-access.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSocialTicketDto, UpdateSocialTicketDto } from './integration.dto';

const ticketInclude = {
  conversation: {
    select: {
      id: true,
      connectionId: true,
      connection: { select: { provider: true, displayName: true } },
      identity: { select: { displayName: true, customerId: true } },
    },
  },
  comment: {
    select: {
      id: true,
      connectionId: true,
      authorDisplayName: true,
      externalPostId: true,
      sourceUrl: true,
      connection: { select: { provider: true, displayName: true } },
    },
  },
  assignedStaff: { select: { id: true, displayName: true } },
  createdBy: { select: { id: true, displayName: true } },
  events: {
    orderBy: { createdAt: 'desc' as const },
    take: 20,
    include: { actor: { select: { displayName: true } } },
  },
} satisfies Prisma.SocialTicketInclude;

@Injectable()
export class SocialTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageAccess: IntegrationPageAccessService,
  ) {}

  async list(actor: RequestStaff) {
    const businessId = actor.businessId;
    const allowedIds = await this.pageAccess.allowedIds(actor);
    return this.prisma.socialTicket.findMany({
      where: {
        businessId,
        ...(allowedIds
          ? {
              OR: [
                { conversation: { connectionId: { in: allowedIds } } },
                { comment: { connectionId: { in: allowedIds } } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      include: ticketInclude,
    });
  }

  assignees(businessId: string) {
    return this.prisma.staffUser.findMany({
      where: { businessId, status: 'ACTIVE' },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true },
    });
  }

  private async checkAssignee(businessId: string, id: string | null | undefined) {
    if (!id) return;
    const staff = await this.prisma.staffUser.findFirst({
      where: { id, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff)
      throw new NotFoundException('Không tìm thấy nhân viên đang hoạt động trong đơn vị.');
  }

  async create(actor: RequestStaff, dto: CreateSocialTicketDto) {
    const businessId = actor.businessId;
    const summary = dto.summary.trim();
    if (!summary) throw new BadRequestException('Tóm tắt ticket không được để trống.');
    const labels = this.normalizeLabels(dto.labels);
    let sourceUrl: string | null = null;
    if (dto.sourceType === 'CONVERSATION') {
      const source = await this.prisma.conversation.findFirst({
        where: { id: dto.sourceId, businessId },
        select: { id: true },
      });
      if (!source) throw new NotFoundException('Không tìm thấy nguồn trong đơn vị.');
    } else {
      const source = await this.prisma.socialComment.findFirst({
        where: { id: dto.sourceId, businessId },
        select: { id: true, sourceUrl: true },
      });
      if (!source) throw new NotFoundException('Không tìm thấy nguồn trong đơn vị.');
      sourceUrl = source.sourceUrl;
    }
    await this.checkAssignee(businessId, dto.assignedStaffId);

    const existing = await this.prisma.socialTicket.findUnique({
      where: { businessId_requestKey: { businessId, requestKey: dto.requestKey } },
      include: ticketInclude,
    });
    if (existing) return this.replayed(existing, dto, summary, labels);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const ticket = await tx.socialTicket.create({
          data: {
            businessId,
            requestKey: dto.requestKey,
            conversationId: dto.sourceType === 'CONVERSATION' ? dto.sourceId : null,
            commentId: dto.sourceType === 'COMMENT' ? dto.sourceId : null,
            sourceUrl,
            kind: dto.kind,
            priority: dto.priority,
            summary,
            labels,
            assignedStaffId: dto.assignedStaffId || null,
            createdById: actor.id,
          },
        });
        await tx.socialTicketEvent.create({
          data: {
            businessId,
            ticketId: ticket.id,
            actorId: actor.id,
            action: 'CREATED',
            changes: {
              kind: dto.kind,
              priority: dto.priority,
              status: 'OPEN',
              labels,
              assignedStaffId: dto.assignedStaffId || null,
            },
          },
        });
        return tx.socialTicket.findUniqueOrThrow({
          where: { id: ticket.id },
          include: ticketInclude,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.socialTicket.findUnique({
          where: { businessId_requestKey: { businessId, requestKey: dto.requestKey } },
          include: ticketInclude,
        });
        if (replay) return this.replayed(replay, dto, summary, labels);
      }
      throw error;
    }
  }

  private normalizeLabels(labels: string[] | undefined): string[] {
    const normalized = [...new Set((labels ?? []).map((label) => label.trim()).filter(Boolean))];
    if (normalized.length > 8) throw new BadRequestException('Tối đa 8 nhãn cho một ticket.');
    return normalized;
  }

  private replayed<
    T extends {
      conversationId: string | null;
      commentId: string | null;
      kind: string;
      priority: string;
      summary: string;
      labels: string[];
      assignedStaffId: string | null;
    },
  >(ticket: T, dto: CreateSocialTicketDto, summary: string, labels: string[]): T {
    if (
      ticket.conversationId !== (dto.sourceType === 'CONVERSATION' ? dto.sourceId : null) ||
      ticket.commentId !== (dto.sourceType === 'COMMENT' ? dto.sourceId : null) ||
      ticket.kind !== dto.kind ||
      ticket.priority !== dto.priority ||
      ticket.summary !== summary ||
      ticket.labels.join('\0') !== labels.join('\0') ||
      ticket.assignedStaffId !== (dto.assignedStaffId || null)
    ) {
      throw new ConflictException('Khóa yêu cầu đã được dùng cho ticket khác.');
    }
    return ticket;
  }

  async update(actor: RequestStaff, id: string, dto: UpdateSocialTicketDto) {
    const businessId = actor.businessId;
    const current = await this.prisma.socialTicket.findFirst({ where: { id, businessId } });
    if (!current) throw new NotFoundException('Không tìm thấy ticket trong đơn vị.');
    if (dto.status === 'CLOSED' && current.status !== 'RESOLVED')
      throw new ConflictException('Chỉ đóng ticket đã xử lý.');
    if (
      current.status === 'CLOSED' &&
      dto.status &&
      dto.status !== 'OPEN' &&
      dto.status !== 'CLOSED'
    )
      throw new ConflictException('Mở lại ticket trước khi xử lý tiếp.');
    await this.checkAssignee(businessId, dto.assignedStaffId);
    const summary = dto.summary?.trim();
    if (dto.summary !== undefined && !summary)
      throw new BadRequestException('Tóm tắt ticket không được để trống.');
    const changes = {
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(dto.labels !== undefined ? { labels: this.normalizeLabels(dto.labels) } : {}),
      ...(dto.assignedStaffId !== undefined
        ? { assignedStaffId: dto.assignedStaffId || null }
        : {}),
    };
    if (Object.keys(changes).length === 0)
      throw new BadRequestException('Không có thay đổi ticket.');
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.socialTicket.updateMany({
        where: { id, businessId, version: dto.expectedVersion },
        data: { ...changes, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException('Ticket đã thay đổi; tải lại trước khi lưu.');
      await tx.socialTicketEvent.create({
        data: { businessId, ticketId: id, actorId: actor.id, action: 'UPDATED', changes },
      });
      return tx.socialTicket.findUniqueOrThrow({ where: { id }, include: ticketInclude });
    });
  }
}

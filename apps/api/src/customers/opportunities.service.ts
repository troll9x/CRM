import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireCustomer(customerId: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!customer) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
  }

  private async assigneeId(businessId: string, staffId: string) {
    const assignee = await this.prisma.staffUser.findFirst({
      where: { id: staffId, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!assignee) {
      throw new ProblemException(422, 'UNKNOWN_ASSIGNEE', 'Nhân viên phụ trách không hợp lệ.');
    }
    return assignee.id;
  }

  list(businessId: string, query: ListOpportunitiesQueryDto) {
    return this.prisma.salesOpportunity.findMany({
      where: {
        businessId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.stage ? { stage: query.stage } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        kind: true,
        stage: true,
        note: true,
        updatedAt: true,
        customer: { select: { id: true, customerCode: true, displayName: true } },
        assignedStaff: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(dto: CreateOpportunityDto, actor: RequestStaff, requestId: string) {
    await this.requireCustomer(dto.customerId, actor.businessId);
    const assignedStaffId = await this.assigneeId(
      actor.businessId,
      dto.assignedStaffId ?? actor.id,
    );
    const id = randomUUID();
    const [opportunity] = await this.prisma.$transaction([
      this.prisma.salesOpportunity.create({
        data: {
          id,
          businessId: actor.businessId,
          customerId: dto.customerId,
          assignedStaffId,
          title: dto.title.trim(),
          kind: dto.kind,
          note: dto.note?.trim() || null,
        },
        select: { id: true, title: true, kind: true, stage: true, note: true, updatedAt: true },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.opportunity.create',
          entityType: 'SalesOpportunity',
          entityId: id,
          requestId,
          metadata: { customerId: dto.customerId, kind: dto.kind, assignedStaffId },
        },
      }),
    ]);
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto, actor: RequestStaff, requestId: string) {
    const current = await this.prisma.salesOpportunity.findFirst({
      where: { id, businessId: actor.businessId },
    });
    if (!current) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy cơ hội.');
    }
    const assignedStaffId = dto.assignedStaffId
      ? await this.assigneeId(actor.businessId, dto.assignedStaffId)
      : undefined;
    const [opportunity] = await this.prisma.$transaction([
      this.prisma.salesOpportunity.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.kind ? { kind: dto.kind } : {}),
          ...(dto.stage ? { stage: dto.stage } : {}),
          ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
          ...(assignedStaffId ? { assignedStaffId } : {}),
        },
        select: { id: true, title: true, kind: true, stage: true, note: true, updatedAt: true },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.opportunity.update',
          entityType: 'SalesOpportunity',
          entityId: id,
          requestId,
          metadata: { customerId: current.customerId, stage: dto.stage },
        },
      }),
    ]);
    return opportunity;
  }
}

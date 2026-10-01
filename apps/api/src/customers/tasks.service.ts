import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/task.dto';

@Injectable()
export class TasksService {
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

  list(businessId: string, query: ListTasksQueryDto) {
    return this.prisma.customerTask.findMany({
      where: {
        businessId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        description: true,
        dueAt: true,
        status: true,
        completedAt: true,
        customer: { select: { id: true, customerCode: true, displayName: true } },
        assignedStaff: { select: { id: true, displayName: true } },
      },
    });
  }

  async create(dto: CreateTaskDto, actor: RequestStaff, requestId: string) {
    await this.requireCustomer(dto.customerId, actor.businessId);
    const assignedStaffId = await this.assigneeId(
      actor.businessId,
      dto.assignedStaffId ?? actor.id,
    );
    const id = randomUUID();
    const [task] = await this.prisma.$transaction([
      this.prisma.customerTask.create({
        data: {
          id,
          businessId: actor.businessId,
          customerId: dto.customerId,
          assignedStaffId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
        select: { id: true, title: true, description: true, dueAt: true, status: true },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.task.create',
          entityType: 'CustomerTask',
          entityId: id,
          requestId,
          metadata: { customerId: dto.customerId, assignedStaffId },
        },
      }),
    ]);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, actor: RequestStaff, requestId: string) {
    const current = await this.prisma.customerTask.findFirst({
      where: { id, businessId: actor.businessId },
    });
    if (!current) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy việc nhắc.');
    }
    const assignedStaffId = dto.assignedStaffId
      ? await this.assigneeId(actor.businessId, dto.assignedStaffId)
      : undefined;
    const [task] = await this.prisma.$transaction([
      this.prisma.customerTask.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(assignedStaffId ? { assignedStaffId } : {}),
          ...(dto.status
            ? {
                status: dto.status,
                completedAt: dto.status === 'DONE' ? new Date() : null,
              }
            : {}),
        },
        select: { id: true, title: true, description: true, dueAt: true, status: true },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.task.update',
          entityType: 'CustomerTask',
          entityId: id,
          requestId,
          metadata: { customerId: current.customerId, status: dto.status },
        },
      }),
    ]);
    return task;
  }
}

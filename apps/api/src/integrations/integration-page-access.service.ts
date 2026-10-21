import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestStaff } from '../common/request-context';

@Injectable()
export class IntegrationPageAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isManager(actor: RequestStaff) {
    return actor.permissions.includes('connectors.manage');
  }

  async allowedIds(actor: RequestStaff, send = false): Promise<string[] | null> {
    if (this.isManager(actor)) return null;
    const rows = await this.prisma.integrationStaffAccess.findMany({
      where: {
        businessId: actor.businessId,
        staffId: actor.id,
        canRead: true,
        ...(send ? { canSend: true } : {}),
      },
      select: { connectionId: true },
    });
    return rows.map((row) => row.connectionId);
  }

  async assert(actor: RequestStaff, connectionId: string, send = false) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, businessId: actor.businessId },
      select: { id: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy tài khoản kênh.');
    if (this.isManager(actor)) return;
    const access = await this.prisma.integrationStaffAccess.findUnique({
      where: { connectionId_staffId: { connectionId, staffId: actor.id } },
      select: { canRead: true, canSend: true },
    });
    if (!access?.canRead || (send && !access.canSend))
      throw new ForbiddenException('Bạn chưa được cấp quyền trên tài khoản kênh này.');
  }

  async list(actor: RequestStaff, connectionId: string) {
    await this.assert(actor, connectionId);
    if (!this.isManager(actor))
      throw new ForbiddenException('Chỉ quản trị viên được xem phân quyền kênh.');
    return this.prisma.integrationStaffAccess.findMany({
      where: { businessId: actor.businessId, connectionId },
      select: {
        staffId: true,
        canRead: true,
        canSend: true,
        staff: { select: { displayName: true, status: true } },
      },
      orderBy: { staff: { displayName: 'asc' } },
    });
  }

  async set(
    actor: RequestStaff,
    connectionId: string,
    staffId: string,
    canRead: boolean,
    canSend: boolean,
  ) {
    if (!this.isManager(actor))
      throw new ForbiddenException('Chỉ quản trị viên được phân quyền kênh.');
    if (canSend && !canRead) throw new ForbiddenException('Quyền gửi yêu cầu quyền xem.');
    const [connection, staff] = await Promise.all([
      this.prisma.integrationConnection.findFirst({
        where: { id: connectionId, businessId: actor.businessId },
        select: { id: true },
      }),
      this.prisma.staffUser.findFirst({
        where: { id: staffId, businessId: actor.businessId, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    if (!connection || !staff)
      throw new NotFoundException('Page/OA/shop hoặc nhân viên không thuộc đơn vị.');
    return this.prisma.$transaction(async (tx) => {
      if (!canRead) {
        await tx.integrationStaffAccess.deleteMany({
          where: { connectionId, staffId, businessId: actor.businessId },
        });
      } else {
        await tx.integrationStaffAccess.upsert({
          where: { connectionId_staffId: { connectionId, staffId } },
          create: { businessId: actor.businessId, connectionId, staffId, canRead, canSend },
          update: { canRead, canSend },
        });
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'integration.staff_access.updated',
          entityType: 'IntegrationConnection',
          entityId: connectionId,
          metadata: { staffId, canRead, canSend },
        },
      });
      return { connectionId, staffId, canRead, canSend };
    });
  }
}

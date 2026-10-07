import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('admin-alerts')
@Controller('admin-alerts')
export class AdminAlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ADMIN_ALERTS_READ)
  @ApiOperation({ summary: 'Đọc thông báo nội bộ của nhân viên quản lý hiện tại' })
  async list(@CurrentStaff() actor: RequestStaff) {
    const where = { businessId: actor.businessId, recipientId: actor.id };
    const [items, unreadCount] = await Promise.all([
      this.prisma.adminAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          readAt: true,
          createdAt: true,
          order: { select: { id: true, orderNumber: true, status: true } },
        },
      }),
      this.prisma.adminAlert.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  @Post(':id/read')
  @RequirePermissions(PERMISSIONS.ADMIN_ALERTS_ACKNOWLEDGE)
  @ApiOperation({ summary: 'Đánh dấu đã đọc một thông báo thuộc nhân viên hiện tại' })
  async markRead(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    await this.prisma.adminAlert.updateMany({
      where: { id, businessId: actor.businessId, recipientId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    const alert = await this.prisma.adminAlert.findFirst({
      where: { id, businessId: actor.businessId, recipientId: actor.id },
      select: { id: true, readAt: true },
    });
    if (!alert)
      throw new ProblemException(404, 'ADMIN_ALERT_NOT_FOUND', 'Không tìm thấy thông báo.');
    return alert;
  }
}

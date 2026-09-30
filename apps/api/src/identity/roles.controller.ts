import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentStaff } from './current-staff.decorator';
import { PERMISSIONS } from './permissions';
import { RequirePermissions } from './require-permissions.decorator';

@ApiTags('roles')
@Controller('roles')
@RequirePermissions(PERMISSIONS.ROLES_MANAGE)
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách vai trò và quyền của đơn vị hiện tại' })
  list(@CurrentStaff() actor: RequestStaff) {
    return this.prisma.role.findMany({
      where: { businessId: actor.businessId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: { select: { permissionKey: true } },
      },
    });
  }
}

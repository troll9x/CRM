import { Body, Controller, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from './current-staff.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { LockStaffDto } from './dto/lock-staff.dto';
import { PERMISSIONS } from './permissions';
import { RequirePermissions } from './require-permissions.decorator';
import { StaffService } from './staff.service';

@ApiTags('staff')
@Controller('staff')
@RequirePermissions(PERMISSIONS.STAFF_MANAGE)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách nhân viên của đơn vị hiện tại' })
  list(@CurrentStaff() actor: RequestStaff) {
    return this.staff.list(actor.businessId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo tài khoản nhân viên' })
  create(
    @Body() dto: CreateStaffDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.staff.create(dto, actor, request.requestId);
  }

  @Patch(':id/lock')
  @ApiOperation({ summary: 'Khóa hoặc mở khóa nhân viên; khóa sẽ thu hồi mọi phiên' })
  setLocked(
    @Param('id') id: string,
    @Body() dto: LockStaffDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.staff.setLocked(id, dto.locked, actor, request.requestId);
  }

  @Put(':id/roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  @ApiOperation({ summary: 'Thay toàn bộ vai trò và thu hồi phiên cũ' })
  assignRoles(
    @Param('id') id: string,
    @Body() dto: AssignRolesDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.staff.assignRoles(id, dto, actor, request.requestId);
  }
}

import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CreateReturnDto, InspectReturnDto, SetReturnWindowDto } from './dto/returns.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@Controller()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('business-policy/return-window')
  @RequirePermissions(PERMISSIONS.RETURNS_READ)
  @ApiOperation({ summary: 'Xem thời hạn nhận hàng trả đã cấu hình' })
  policy(@CurrentStaff() actor: RequestStaff) {
    return this.returns.policy(actor);
  }

  @Patch('business-policy/return-window')
  @RequirePermissions(PERMISSIONS.RETURNS_POLICY_MANAGE)
  @ApiOperation({ summary: 'Quản lý cấu hình thời hạn nhận hàng trả' })
  setPolicy(
    @Body() dto: SetReturnWindowDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.returns.setPolicy(dto, actor, request.requestId);
  }

  @Get('returns')
  @RequirePermissions(PERMISSIONS.RETURNS_READ)
  @ApiOperation({ summary: 'Danh sách yêu cầu đổi trả' })
  list(@CurrentStaff() actor: RequestStaff) {
    return this.returns.list(actor);
  }

  @Get('returns/eligible-shipments')
  @RequirePermissions(PERMISSIONS.RETURNS_READ)
  @ApiOperation({ summary: 'Phiếu giao còn trong hạn và còn số lượng có thể trả' })
  eligibleShipments(@CurrentStaff() actor: RequestStaff) {
    return this.returns.eligibleShipments(actor);
  }

  @Post('returns')
  @RequirePermissions(PERMISSIONS.RETURNS_MANAGE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Tiếp nhận hàng khách trả trong thời hạn cho phép' })
  create(
    @Body() dto: CreateReturnDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.returns.create(dto, key, actor, request.requestId);
  }

  @Post('returns/:id/inspect')
  @RequirePermissions(PERMISSIONS.RETURNS_INSPECT)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Kiểm tra chất lượng và nhập lại kho, hàng lỗi vào tồn cách ly' })
  inspect(
    @Param('id') id: string,
    @Body() dto: InspectReturnDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.returns.inspect(id, dto, key, actor, request.requestId);
  }
}

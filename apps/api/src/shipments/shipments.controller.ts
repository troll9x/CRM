import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CreateShipmentDto, DeliverShipmentDto } from './dto/shipment.dto';
import { ShipmentsService } from './shipments.service';
import { ListShipmentsDto } from './dto/list-shipments.dto';

@ApiTags('shipments')
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({ summary: 'Xem danh sách phiếu giao trong business hiện tại' })
  list(@Query() query: ListShipmentsDto, @CurrentStaff() actor: RequestStaff) {
    return this.shipments.list(query, actor);
  }

  @Get('ready-orders')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_READ)
  @ApiOperation({ summary: 'Xem đơn đã xác nhận chưa xuất kho' })
  readyOrders(@CurrentStaff() actor: RequestStaff) {
    return this.shipments.readyOrders(actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SHIPMENTS_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Xuất đủ toàn bộ hàng đã giữ cho đơn bán' })
  create(
    @Body() dto: CreateShipmentDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.shipments.create(dto, key, actor, request.requestId);
  }

  @Post(':id/deliver')
  @RequirePermissions(PERMISSIONS.SHIPMENTS_DELIVER)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Ghi nhận đã giao đủ đơn và ghi nhận doanh thu hàng hóa' })
  deliver(
    @Param('id') id: string,
    @Body() dto: DeliverShipmentDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.shipments.deliver(id, dto, key, actor, request.requestId);
  }
}

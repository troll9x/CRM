import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import {
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderCommandDto,
  UpdatePurchaseOrderDto,
} from './dto/purchasing.dto';
import { PurchasingService } from './purchasing.service';

@ApiTags('purchase-orders')
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASING_READ)
  @ApiOperation({ summary: 'Danh sách đơn mua; không làm thay đổi tồn kho' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListPurchaseOrdersQueryDto) {
    return this.purchasing.listPurchaseOrders(actor, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PURCHASING_READ)
  @ApiOperation({ summary: 'Chi tiết đơn mua và snapshot dòng hàng' })
  get(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    return this.purchasing.getPurchaseOrder(id, actor);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Tạo đơn mua nháp; không tăng tồn kho' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.createPurchaseOrder(dto, actor, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Sửa đơn mua khi còn nháp' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.updatePurchaseOrder(id, dto, actor, request.requestId);
  }

  @Post(':id/order')
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Phát hành đơn mua; vẫn không tăng tồn kho' })
  order(
    @Param('id') id: string,
    @Body() dto: PurchaseOrderCommandDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.orderPurchaseOrder(id, dto, actor, request.requestId);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Hủy đơn mua chưa có phiếu nhận' })
  cancel(
    @Param('id') id: string,
    @Body() dto: PurchaseOrderCommandDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.cancelPurchaseOrder(id, dto, actor, request.requestId);
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { ListOrdersQueryDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: 'Danh sách đơn bán trong đơn vị kinh doanh hiện tại' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListOrdersQueryDto) {
    return this.orders.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @ApiOperation({ summary: 'Chi tiết đơn bán và snapshot dòng hàng' })
  get(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    return this.orders.get(id, actor);
  }
}

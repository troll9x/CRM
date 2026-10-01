import { Body, Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CreateGoodsReceiptDto, InventoryListQueryDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('warehouses')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Danh sách kho của đơn vị kinh doanh' })
  warehouses(@CurrentStaff() actor: RequestStaff) {
    return this.inventory.listWarehouses(actor.businessId);
  }

  @Get('stock-balances')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Tồn thực tế, giữ, không bán được và có thể bán theo SKU' })
  balances(@CurrentStaff() actor: RequestStaff, @Query() query: InventoryListQueryDto) {
    return this.inventory.listBalances(actor, query);
  }

  @Get('stock-movements')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Sổ kho bất biến, mới nhất trước' })
  movements(@CurrentStaff() actor: RequestStaff, @Query() query: InventoryListQueryDto) {
    return this.inventory.listMovements(actor, query);
  }

  @Get('goods-receipts')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: 'Danh sách phiếu nhận hàng đã ghi sổ' })
  receipts(@CurrentStaff() actor: RequestStaff, @Query() query: InventoryListQueryDto) {
    return this.inventory.listReceipts(actor, query);
  }

  @Post('goods-receipts')
  @RequirePermissions(PERMISSIONS.INVENTORY_RECEIVE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Nhận hàng theo đơn mua và ghi sổ kho trong một giao dịch' })
  createReceipt(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.inventory.createReceipt(dto, idempotencyKey, actor, request.requestId);
  }
}

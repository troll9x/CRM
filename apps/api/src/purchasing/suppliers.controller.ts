import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from './dto/purchasing.dto';
import { PurchasingService } from './purchasing.service';

@ApiTags('purchasing-suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PURCHASING_READ)
  @ApiOperation({ summary: 'Tìm nhà cung cấp trong đơn vị hiện tại' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListSuppliersQueryDto) {
    return this.purchasing.listSuppliers(actor.businessId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Tạo nhà cung cấp' })
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.createSupplier(dto, actor, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PURCHASING_WRITE)
  @ApiOperation({ summary: 'Sửa hoặc lưu trữ nhà cung cấp bằng optimistic version' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.purchasing.updateSupplier(id, dto, actor, request.requestId);
  }
}

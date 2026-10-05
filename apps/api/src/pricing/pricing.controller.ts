import { Body, Controller, Get, Headers, Put, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import {
  ListPriceTiersQueryDto,
  ResolveWholesalePriceQueryDto,
  SetPriceTierDto,
} from './dto/price-tier.dto';
import { PricingService } from './pricing.service';

@ApiTags('pricing')
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('price-tiers/resolve')
  @RequirePermissions(PERMISSIONS.PRICE_EDIT)
  @ApiOperation({ summary: 'Chọn bậc giá theo số lượng và báo trạng thái nếu thiếu quy tắc/giá' })
  resolve(@CurrentStaff() actor: RequestStaff, @Query() query: ResolveWholesalePriceQueryDto) {
    return this.pricing.resolveWholesalePrice(actor.businessId, query);
  }

  @Get('price-tiers')
  @RequirePermissions(PERMISSIONS.PRICE_EDIT)
  @ApiOperation({ summary: 'Liệt kê giá bậc admin đã nhập theo SKU' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListPriceTiersQueryDto) {
    return this.pricing.list(actor.businessId, query.variantId);
  }

  @Put('price-tiers')
  @RequirePermissions(PERMISSIONS.PRICE_EDIT)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Nhập, sửa hoặc xóa giá admin của một bậc SKU' })
  set(
    @Body() dto: SetPriceTierDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.pricing.setPriceTier(dto, idempotencyKey, actor, request.requestId);
  }
}

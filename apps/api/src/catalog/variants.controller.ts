import { Body, Controller, Param, Patch, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import { ReplaceConversionsDto, UpdateVariantDto } from './dto/catalog.dto';

@ApiTags('catalog-variants')
@Controller('variants')
@RequirePermissions(PERMISSIONS.CATALOG_WRITE)
export class VariantsController {
  constructor(private readonly catalog: CatalogService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa hoặc ngừng bán SKU; không xóa SKU' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.updateVariant(id, dto, actor, request.requestId);
  }

  @Put(':id/unit-conversions')
  @ApiOperation({ summary: 'Thay danh sách quy đổi; đơn vị gốc luôn là hệ số 1' })
  replaceConversions(
    @Param('id') id: string,
    @Body() dto: ReplaceConversionsDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.replaceConversions(id, dto, actor, request.requestId);
  }
}

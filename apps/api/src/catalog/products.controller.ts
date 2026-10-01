import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import {
  CreateMediaDto,
  CreateProductDto,
  CreateVariantDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/catalog.dto';

@ApiTags('catalog-products')
@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: 'Tìm sản phẩm theo tên, danh mục, SKU hoặc barcode' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListProductsQueryDto) {
    return this.catalog.list(actor.businessId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CATALOG_READ)
  @ApiOperation({ summary: 'Chi tiết sản phẩm, SKU, quy đổi đơn vị và ảnh metadata' })
  get(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    return this.catalog.getById(id, actor.businessId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiOperation({ summary: 'Tạo sản phẩm cùng ít nhất một SKU' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.create(dto, actor, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiOperation({ summary: 'Sửa hoặc ngừng bán sản phẩm bằng optimistic version' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.updateProduct(id, dto, actor, request.requestId);
  }

  @Post(':id/variants')
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiOperation({ summary: 'Thêm SKU/biến thể vào sản phẩm' })
  addVariant(
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.addVariant(id, dto, actor, request.requestId);
  }

  @Post(':id/media')
  @RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
  @ApiOperation({ summary: 'Thêm metadata ảnh HTTPS cho sản phẩm hoặc SKU' })
  addMedia(
    @Param('id') id: string,
    @Body() dto: CreateMediaDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.addMedia(id, dto, actor, request.requestId);
  }
}

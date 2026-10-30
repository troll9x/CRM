import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { ProblemException } from '../common/problem.exception';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import {
  PRODUCT_IMPORT_MAX_BYTES,
  ProductImportService,
  type ProductImportOptions,
} from './product-import.service';
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
  constructor(
    private readonly catalog: CatalogService,
    private readonly productImport: ProductImportService,
  ) {}

  private async readImportRequest(request: RequestWithContext, filenameHeader?: string) {
    let filename = '';
    try {
      filename = filenameHeader ? decodeURIComponent(filenameHeader) : '';
    } catch {
      throw new ProblemException(400, 'INVALID_IMPORT_FILE_NAME', 'Tên file không hợp lệ.');
    }
    if (!filename.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
      throw new ProblemException(
        415,
        'IMPORT_XLSX_REQUIRED',
        'Chỉ hỗ trợ file Excel .xlsx tải từ Shopee.',
      );
    }
    const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (
      contentType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      contentType !== 'application/octet-stream'
    ) {
      throw new ProblemException(
        415,
        'IMPORT_XLSX_REQUIRED',
        'Content-Type phải là workbook Excel .xlsx.',
      );
    }
    const lengthHeader = request.headers['content-length'];
    if (lengthHeader && Number(lengthHeader) > PRODUCT_IMPORT_MAX_BYTES) {
      throw new ProblemException(413, 'IMPORT_FILE_TOO_LARGE', 'File Excel tối đa 10 MiB.');
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request as AsyncIterable<unknown>) {
      if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) {
        throw new ProblemException(
          400,
          'INVALID_IMPORT_BODY',
          'Không đọc được nội dung file Excel.',
        );
      }
      const data = Buffer.from(chunk);
      size += data.length;
      if (size > PRODUCT_IMPORT_MAX_BYTES) {
        request.resume();
        throw new ProblemException(413, 'IMPORT_FILE_TOO_LARGE', 'File Excel tối đa 10 MiB.');
      }
      chunks.push(data);
    }
    return Buffer.concat(chunks, size);
  }

  private importOptions(encoded?: string): ProductImportOptions {
    if (!encoded || encoded.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new ProblemException(
        400,
        'INVALID_IMPORT_OPTIONS',
        'Thiếu hoặc sai cấu hình ánh xạ cột.',
      );
    }
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ProductImportOptions;
    } catch {
      throw new ProblemException(
        400,
        'INVALID_IMPORT_OPTIONS',
        'Không đọc được cấu hình ánh xạ cột.',
      );
    }
  }

  @Post('import/inspect')
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiConsumes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Đọc tên sheet, hàng mẫu và gợi ý cột của file Shopee .xlsx' })
  async inspectImport(
    @Req() request: RequestWithContext,
    @Headers('x-file-name') filename?: string,
  ) {
    return this.productImport.inspect(await this.readImportRequest(request, filename));
  }

  @Post('import/preview')
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiConsumes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Kiểm tra mapping, SKU/barcode trùng trước khi nhập sản phẩm' })
  async previewImport(
    @Req() request: RequestWithContext,
    @Headers('x-file-name') filename: string | undefined,
    @Headers('x-import-options') encodedOptions: string | undefined,
    @CurrentStaff() actor: RequestStaff,
  ) {
    const file = await this.readImportRequest(request, filename);
    return this.productImport.preview(file, this.importOptions(encodedOptions), actor);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.CATALOG_WRITE)
  @ApiConsumes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({
    summary: 'Tạo sản phẩm/SKU từ file Shopee sau khi xem trước; không nhập giá và tồn kho',
  })
  async applyImport(
    @Req() request: RequestWithContext,
    @Headers('x-file-name') filename: string | undefined,
    @Headers('x-import-options') encodedOptions: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentStaff() actor: RequestStaff,
  ) {
    const file = await this.readImportRequest(request, filename);
    return this.productImport.apply(
      file,
      this.importOptions(encodedOptions),
      idempotencyKey,
      actor,
      request.requestId,
    );
  }

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

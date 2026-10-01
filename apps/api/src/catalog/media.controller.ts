import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CatalogService } from './catalog.service';
import { UpdateMediaDto } from './dto/catalog.dto';

@ApiTags('catalog-media')
@Controller('media')
@RequirePermissions(PERMISSIONS.MEDIA_MANAGE)
export class MediaController {
  constructor(private readonly catalog: CatalogService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa hoặc lưu trữ metadata ảnh; không xóa cứng' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.catalog.updateMedia(id, dto, actor, request.requestId);
  }
}

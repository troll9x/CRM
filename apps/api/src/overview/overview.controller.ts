import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { OverviewService } from './overview.service';

@ApiTags('overview')
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OVERVIEW_READ)
  @ApiOperation({ summary: 'Tổng quan nghiệp vụ và bảng so sánh từ dữ liệu thật' })
  get(@CurrentStaff() actor: RequestStaff) {
    return this.overview.get(actor);
  }
}

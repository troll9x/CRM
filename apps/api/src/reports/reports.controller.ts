import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { SalesReportQueryDto } from './dto/sales-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @RequirePermissions(PERMISSIONS.SALES_REPORTS_READ)
  @ApiOperation({ summary: 'Doanh thu theo tháng và sản phẩm giao nhiều nhất' })
  sales(@Query() query: SalesReportQueryDto, @CurrentStaff() actor: RequestStaff) {
    return this.reports.sales(query, actor);
  }
}

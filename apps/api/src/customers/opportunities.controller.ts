import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import {
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('sales-opportunities')
@Controller('opportunities')
@RequirePermissions(PERMISSIONS.OPPORTUNITIES_MANAGE)
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách cơ hội bán hàng tách khỏi lịch sử khách' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListOpportunitiesQueryDto) {
    return this.opportunities.list(actor.businessId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo cơ hội mua lần đầu hoặc mua lại' })
  create(
    @Body() dto: CreateOpportunityDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.opportunities.create(dto, actor, request.requestId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật giai đoạn cơ hội' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOpportunityDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.opportunities.update(id, dto, actor, request.requestId);
  }
}

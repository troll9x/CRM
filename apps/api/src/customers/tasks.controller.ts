import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from './dto/task.dto';
import { TasksService } from './tasks.service';

@ApiTags('customer-tasks')
@Controller('tasks')
@RequirePermissions(PERMISSIONS.TASKS_MANAGE)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách việc nhắc chăm sóc khách hàng' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListTasksQueryDto) {
    return this.tasks.list(actor.businessId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo việc nhắc cho khách hàng' })
  create(
    @Body() dto: CreateTaskDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.tasks.create(dto, actor, request.requestId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật hoặc hoàn thành việc nhắc' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.tasks.update(id, dto, actor, request.requestId);
  }
}

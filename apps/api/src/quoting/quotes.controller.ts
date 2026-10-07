import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import {
  ConvertQuoteDto,
  CreateQuoteDto,
  ListQuotesQueryDto,
  SendQuoteDto,
  UpdateQuoteDto,
} from './dto/quote.dto';
import { QuoteService } from './quote.service';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuoteService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.QUOTES_READ)
  @ApiOperation({ summary: 'Liệt kê báo giá của đơn vị kinh doanh hiện tại' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListQuotesQueryDto) {
    return this.quotes.list(actor.businessId, query);
  }

  @Get(':id/revisions/:revisionNumber')
  @RequirePermissions(PERMISSIONS.QUOTES_READ)
  @ApiOperation({ summary: 'Đọc snapshot bất biến của một lần phát hành báo giá' })
  revision(
    @Param('id') id: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
    @CurrentStaff() actor: RequestStaff,
  ) {
    return this.quotes.revision(id, revisionNumber, actor.businessId);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.QUOTES_READ)
  @ApiOperation({ summary: 'Chi tiết báo giá, dòng hàng và lịch sử phát hành' })
  get(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    return this.quotes.get(id, actor.businessId);
  }

  @Post(':id/convert')
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Chuyển báo giá đã gửi, còn hạn thành đơn nháp' })
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertQuoteDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.quotes.convert(id, dto, key, actor, request.requestId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.QUOTES_WRITE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Tạo báo giá nháp; backend phân giải giá và tính toàn bộ thành tiền' })
  create(
    @Body() dto: CreateQuoteDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.quotes.create(dto, key, actor, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.QUOTES_WRITE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Sửa báo giá nháp có kiểm soát version' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.quotes.update(id, dto, key, actor, request.requestId);
  }

  @Post(':id/send')
  @RequirePermissions(PERMISSIONS.QUOTES_SEND)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Đóng băng revision, ghi nhận lúc khách nhận và hạn đủ 72 giờ' })
  send(
    @Param('id') id: string,
    @Body() dto: SendQuoteDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.quotes.send(id, dto, key, actor, request.requestId);
  }
}

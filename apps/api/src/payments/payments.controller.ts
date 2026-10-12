import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import {
  ApplyCustomerCreditDto,
  CreatePaymentDto,
  PaymentSuggestionsQueryDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Ghi nhận tiền thực nhận và phân bổ theo lựa chọn nhân viên' })
  create(
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.payments.create(dto, key, actor, request.requestId);
  }

  @Get('payments/suggestions')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiOperation({ summary: 'Gợi ý đơn nháp cần thu theo thứ tự cũ nhất; không tự phân bổ' })
  suggestions(@Query() query: PaymentSuggestionsQueryDto, @CurrentStaff() actor: RequestStaff) {
    return this.payments.suggestions(query, actor);
  }

  @Get('customer-credit/:customerId')
  @RequirePermissions(PERMISSIONS.RECEIVABLES_VIEW)
  @ApiOperation({ summary: 'Xem số dư tiền khách trả thừa trong business hiện tại' })
  customerCredit(@Param('customerId') customerId: string, @CurrentStaff() actor: RequestStaff) {
    return this.payments.customerCredit(customerId, actor);
  }

  @Get('receivables')
  @RequirePermissions(PERMISSIONS.RECEIVABLES_VIEW)
  @ApiOperation({ summary: 'Danh sách phải thu và số dư còn phải thu trong doanh nghiệp hiện tại' })
  receivables(@CurrentStaff() actor: RequestStaff) {
    return this.payments.receivables(actor);
  }

  @Post('customer-credit/:customerId/applications')
  @RequirePermissions(PERMISSIONS.PAYMENTS_MANAGE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Phân bổ số dư trả thừa vào đơn nháp của chính khách đó' })
  applyCustomerCredit(
    @Param('customerId') customerId: string,
    @Body() dto: ApplyCustomerCreditDto,
    @Headers('idempotency-key') key: string | undefined,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.payments.applyCustomerCredit(customerId, dto, key, actor, request.requestId);
  }
}

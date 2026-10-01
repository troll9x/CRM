import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff, RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { CustomersService } from './customers.service';
import {
  AddressInputDto,
  CreateCustomerDto,
  DuplicateCandidatesQueryDto,
  ListCustomersQueryDto,
  UpdateAddressDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Tìm và phân trang khách hàng trong đơn vị hiện tại' })
  list(@CurrentStaff() actor: RequestStaff, @Query() query: ListCustomersQueryDto) {
    return this.customers.list(actor.businessId, query);
  }

  @Get('groups')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Danh sách nhóm khách sỉ/lẻ' })
  groups(@CurrentStaff() actor: RequestStaff) {
    return this.customers.groups(actor.businessId);
  }

  @Get('duplicate-candidates')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Gợi ý hồ sơ có thể trùng; không tự động gộp' })
  duplicateCandidates(
    @CurrentStaff() actor: RequestStaff,
    @Query() query: DuplicateCandidatesQueryDto,
  ) {
    return this.customers.duplicateCandidates(actor.businessId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: 'Chi tiết khách, liên hệ, địa chỉ, việc nhắc và cơ hội' })
  get(@Param('id') id: string, @CurrentStaff() actor: RequestStaff) {
    return this.customers.getById(id, actor.businessId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @ApiOperation({ summary: 'Tạo khách và trả kèm gợi ý hồ sơ trùng' })
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.customers.create(dto, actor, request.requestId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @ApiOperation({ summary: 'Cập nhật hồ sơ với version chống ghi đè' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.customers.update(id, dto, actor, request.requestId);
  }

  @Post(':id/addresses')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @ApiOperation({ summary: 'Thêm địa chỉ cho khách hàng' })
  addAddress(
    @Param('id') id: string,
    @Body() dto: AddressInputDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.customers.addAddress(id, dto, actor, request.requestId);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @ApiOperation({ summary: 'Sửa hoặc lưu trữ địa chỉ; không xóa cứng' })
  updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
    @CurrentStaff() actor: RequestStaff,
    @Req() request: RequestWithContext,
  ) {
    return this.customers.updateAddress(id, addressId, dto, actor, request.requestId);
  }
}

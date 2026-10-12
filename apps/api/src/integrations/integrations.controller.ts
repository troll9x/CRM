import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import type { RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { IntegrationsService } from './integrations.service';
import { INTEGRATION_PROVIDERS, providerPreflight } from './provider-preflight';
import {
  AddNoteDto,
  ConnectionStatusDto,
  CreateConnectionDto,
  LinkCustomerDto,
  ListIntegrationQueryDto,
  ProductMappingDto,
  UpdateConversationDto,
  UnlinkIdentityDto,
  IdentityLinkPreviewDto,
  VersionedLinkCustomerDto,
} from './integration.dto';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('providers/preflight')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  providerPreflight() {
    return INTEGRATION_PROVIDERS.map((provider) => providerPreflight(provider, this.config));
  }

  @Get('connections')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  connections(@CurrentStaff() actor: RequestStaff) {
    return this.integrations.connections(actor.businessId);
  }

  @Post('connections')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  @ApiOperation({
    summary:
      'Khai báo tài khoản kênh; trạng thái luôn NEEDS_SETUP đến khi OAuth/webhook được xác minh',
  })
  createConnection(@CurrentStaff() actor: RequestStaff, @Body() dto: CreateConnectionDto) {
    return this.integrations.createConnection(actor.businessId, dto);
  }

  @Patch('connections/:id/status')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  updateConnectionStatus(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: ConnectionStatusDto,
  ) {
    return this.integrations.updateConnectionStatus(actor.businessId, id, dto.status);
  }

  @Get('inbox')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  inbox(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.integrations.inbox(actor.businessId, query);
  }

  @Get('comments')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  comments(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.integrations.comments(actor.businessId, query);
  }

  @Post('comments/:id/link-customer')
  @RequirePermissions(
    PERMISSIONS.INTEGRATIONS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK,
  )
  linkCommentCustomer(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: LinkCustomerDto,
  ) {
    return this.integrations.linkCommentCustomer(actor.businessId, id, dto);
  }

  @Patch('conversations/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  updateConversation(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.integrations.updateConversation(actor.businessId, id, dto);
  }

  @Post('conversations/:id/notes')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  addNote(@CurrentStaff() actor: RequestStaff, @Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.integrations.addNote(actor.businessId, id, actor, dto);
  }

  @Post('identities/:id/link-customer')
  @RequirePermissions(
    PERMISSIONS.INTEGRATIONS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK,
  )
  linkIdentity(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: VersionedLinkCustomerDto,
    @Req() request: RequestWithContext,
  ) {
    return this.integrations.linkIdentity(actor, id, dto, request.requestId);
  }

  @Post('identities/:id/link-preview')
  @RequirePermissions(
    PERMISSIONS.INTEGRATIONS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK,
  )
  identityLinkPreview(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: IdentityLinkPreviewDto,
  ) {
    return this.integrations.identityLinkPreview(actor.businessId, id, dto.customerId);
  }

  @Post('identities/:id/transfer-customer')
  @RequirePermissions(
    PERMISSIONS.INTEGRATIONS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK,
  )
  transferIdentity(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: VersionedLinkCustomerDto,
    @Req() request: RequestWithContext,
  ) {
    return this.integrations.transferIdentity(actor, id, dto, request.requestId);
  }

  @Post('identities/:id/unlink-customer')
  @RequirePermissions(
    PERMISSIONS.INTEGRATIONS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK,
  )
  unlinkIdentity(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: UnlinkIdentityDto,
    @Req() request: RequestWithContext,
  ) {
    return this.integrations.unlinkIdentity(actor, id, dto, request.requestId);
  }

  @Get('orders')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  orders(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.integrations.orders(actor.businessId, query);
  }

  @Post('orders/:id/link-customer')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CUSTOMER_LINK)
  linkOrderCustomer(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: LinkCustomerDto,
  ) {
    return this.integrations.linkOrderCustomer(actor.businessId, id, dto);
  }

  @Post('product-mappings')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_MAPPING_MANAGE)
  mapProduct(@CurrentStaff() actor: RequestStaff, @Body() dto: ProductMappingDto) {
    return this.integrations.upsertProductMapping(actor.businessId, dto);
  }

  @Get('jobs')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  jobs(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.integrations.jobs(actor.businessId, query);
  }

  @Post('jobs/:id/retry')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  retryJob(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.integrations.retryJob(actor.businessId, id);
  }
}

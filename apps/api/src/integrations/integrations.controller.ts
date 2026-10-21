import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestStaff } from '../common/request-context';
import type { RequestWithContext } from '../common/request-context';
import { CurrentStaff } from '../identity/current-staff.decorator';
import { PERMISSIONS } from '../identity/permissions';
import { RequirePermissions } from '../identity/require-permissions.decorator';
import { IntegrationsService } from './integrations.service';
import { FacebookBackfillService } from './facebook-backfill.service';
import { SocialTicketsService } from './social-tickets.service';
import { SocialOutboundService } from './social-outbound.service';
import { IntegrationPageAccessService } from './integration-page-access.service';
import { IntegrationPageAccessGuard } from './integration-page-access.guard';
import { INTEGRATION_PROVIDERS, providerPreflight } from './provider-preflight';
import {
  AddNoteDto,
  ConnectionStatusDto,
  CreateConnectionDto,
  LinkCustomerDto,
  ListIntegrationQueryDto,
  ListConversationMessagesDto,
  ProductMappingDto,
  UpdateConversationDto,
  UnlinkIdentityDto,
  IdentityLinkPreviewDto,
  VersionedLinkCustomerDto,
  StartFacebookBackfillDto,
  ExtendFacebookBackfillDto,
  FacebookBackfillPreflightDto,
  CreateSocialTicketDto,
  UpdateSocialTicketDto,
  SendSocialTextDto,
  IntegrationStaffAccessDto,
} from './integration.dto';

@ApiTags('integrations')
@Controller('integrations')
@UseGuards(IntegrationPageAccessGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService,
    private readonly facebookBackfill: FacebookBackfillService,
    private readonly socialTickets: SocialTicketsService,
    private readonly socialOutbound: SocialOutboundService,
    private readonly pageAccess: IntegrationPageAccessService,
  ) {}

  @Get('providers/preflight')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  providerPreflight() {
    return INTEGRATION_PROVIDERS.map((provider) => providerPreflight(provider, this.config));
  }

  @Get('connections')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  connections(@CurrentStaff() actor: RequestStaff) {
    return this.integrations.connections(actor);
  }

  @Get('connections/:id/staff-access')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  staffAccess(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.pageAccess.list(actor, id);
  }

  @Put('connections/:id/staff-access/:staffId')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  setStaffAccess(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Param('staffId') staffId: string,
    @Body() dto: IntegrationStaffAccessDto,
  ) {
    return this.pageAccess.set(actor, id, staffId, dto.canRead, dto.canSend);
  }

  @Get('connections/:id/facebook-grants')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  facebookGrants(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.socialOutbound.connectionGrant(actor, id);
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
    return this.integrations.inbox(actor, query);
  }

  @Get('conversations/:id/messages')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  conversationMessages(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Query() query: ListConversationMessagesDto,
  ) {
    return this.integrations.conversationMessages(actor.businessId, id, query);
  }

  @Get('conversations/:id/send-capability')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  messengerCapability(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.socialOutbound.capability(actor, { kind: 'MESSENGER', id });
  }

  @Get('conversations/:id/outbounds')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  messengerOutbounds(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.socialOutbound.list(actor, { kind: 'MESSENGER', id });
  }

  @Post('conversations/:id/send')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  sendMessenger(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: SendSocialTextDto,
  ) {
    return this.socialOutbound.send(actor, { kind: 'MESSENGER', id }, dto.body, dto.requestKey);
  }

  @Get('comments')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  comments(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.integrations.comments(actor, query);
  }

  @Get('comments/:id/reply-capability')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  commentReplyCapability(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.socialOutbound.capability(actor, { kind: 'COMMENT_REPLY', id });
  }

  @Get('comments/:id/outbounds')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  commentOutbounds(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.socialOutbound.list(actor, { kind: 'COMMENT_REPLY', id });
  }

  @Post('comments/:id/reply')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  replyComment(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: SendSocialTextDto,
  ) {
    return this.socialOutbound.send(actor, { kind: 'COMMENT_REPLY', id }, dto.body, dto.requestKey);
  }

  @Get('tickets')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  tickets(@CurrentStaff() actor: RequestStaff) {
    return this.socialTickets.list(actor);
  }

  @Get('assignees')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_READ)
  assignees(@CurrentStaff() actor: RequestStaff) {
    return this.socialTickets.assignees(actor.businessId);
  }

  @Post('tickets')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  createTicket(@CurrentStaff() actor: RequestStaff, @Body() dto: CreateSocialTicketDto) {
    return this.socialTickets.create(actor, dto);
  }

  @Patch('tickets/:id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  updateTicket(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: UpdateSocialTicketDto,
  ) {
    return this.socialTickets.update(actor, id, dto);
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

  @Post('conversations/:id/mark-read')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_INBOX_MANAGE)
  markConversationRead(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.integrations.markConversationRead(actor.businessId, id);
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
    return this.integrations.orders(actor, query);
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

  @Post('facebook/backfills')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  startFacebookBackfill(
    @CurrentStaff() actor: RequestStaff,
    @Body() dto: StartFacebookBackfillDto,
  ) {
    return this.facebookBackfill.start(
      actor.businessId,
      dto.connectionId,
      dto.dataset,
      dto.since,
      dto.until,
      dto.pageLimit,
    );
  }

  @Get('facebook/backfills')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  facebookBackfills(@CurrentStaff() actor: RequestStaff, @Query() query: ListIntegrationQueryDto) {
    return this.facebookBackfill.list(actor.businessId, query.connectionId);
  }

  @Get('facebook/backfills/preflight')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  facebookBackfillPreflight(
    @CurrentStaff() actor: RequestStaff,
    @Query() query: FacebookBackfillPreflightDto,
  ) {
    return this.facebookBackfill.preflight(actor.businessId, query.connectionId, query.dataset);
  }

  @Post('facebook/backfills/:id/pause')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  pauseFacebookBackfill(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.facebookBackfill.pause(actor.businessId, id);
  }

  @Post('facebook/backfills/:id/resume')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  resumeFacebookBackfill(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.facebookBackfill.resume(actor.businessId, id);
  }

  @Post('facebook/backfills/:id/restart')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  restartFacebookBackfill(@CurrentStaff() actor: RequestStaff, @Param('id') id: string) {
    return this.facebookBackfill.restart(actor.businessId, id);
  }

  @Post('facebook/backfills/:id/extend')
  @RequirePermissions(PERMISSIONS.CONNECTORS_MANAGE)
  extendFacebookBackfill(
    @CurrentStaff() actor: RequestStaff,
    @Param('id') id: string,
    @Body() dto: ExtendFacebookBackfillDto,
  ) {
    return this.facebookBackfill.extend(actor.businessId, id, dto.additionalPages);
  }
}

import { Module } from '@nestjs/common';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ZaloWebhookController } from './zalo-webhook.controller';
import { FacebookOAuthClient } from './facebook-oauth.client';
import { FacebookAuthService } from './facebook-auth.service';
import { FacebookAuthController } from './facebook-auth.controller';
import { ZaloOAuthClient } from './zalo-oauth.client';
import { ZaloAuthService } from './zalo-auth.service';
import { ZaloAuthController } from './zalo-auth.controller';
import { FacebookBackfillService } from './facebook-backfill.service';
import { SocialTicketsService } from './social-tickets.service';
import { FacebookSendClient } from './facebook-send.client';
import { SocialOutboundService } from './social-outbound.service';
import { IntegrationPageAccessService } from './integration-page-access.service';
import { IntegrationPageAccessGuard } from './integration-page-access.guard';

@Module({
  controllers: [
    IntegrationsController,
    FacebookWebhookController,
    ZaloWebhookController,
    FacebookAuthController,
    ZaloAuthController,
  ],
  providers: [
    IntegrationsService,
    IntegrationWorkerService,
    FacebookBackfillService,
    SocialTicketsService,
    FacebookSendClient,
    SocialOutboundService,
    IntegrationPageAccessService,
    IntegrationPageAccessGuard,
    FacebookOAuthClient,
    FacebookAuthService,
    ZaloOAuthClient,
    ZaloAuthService,
  ],
  exports: [IntegrationsService, IntegrationPageAccessService],
})
export class IntegrationsModule {}

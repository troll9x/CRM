import { Module } from '@nestjs/common';
import { AdminAlertsController } from './admin-alerts.controller';
import { QuotesController } from './quotes.controller';
import { QuoteService } from './quote.service';

@Module({ controllers: [QuotesController, AdminAlertsController], providers: [QuoteService] })
export class QuotingModule {}

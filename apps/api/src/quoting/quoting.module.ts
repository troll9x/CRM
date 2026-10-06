import { Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller';
import { QuoteService } from './quote.service';

@Module({ controllers: [QuotesController], providers: [QuoteService] })
export class QuotingModule {}

import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { OpeningStockService } from './opening-stock.service';
import { StockAdjustmentService } from './stock-adjustment.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, OpeningStockService, StockAdjustmentService],
})
export class InventoryModule {}

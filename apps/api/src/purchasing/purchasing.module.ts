import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchasingService } from './purchasing.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [PurchasingService],
})
export class PurchasingModule {}

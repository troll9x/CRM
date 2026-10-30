import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { MediaController } from './media.controller';
import { ProductsController } from './products.controller';
import { ProductImportService } from './product-import.service';
import { VariantsController } from './variants.controller';

@Module({
  controllers: [ProductsController, VariantsController, MediaController],
  providers: [CatalogService, ProductImportService],
})
export class CatalogModule {}

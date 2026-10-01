import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { MediaController } from './media.controller';
import { ProductsController } from './products.controller';
import { VariantsController } from './variants.controller';

@Module({
  controllers: [ProductsController, VariantsController, MediaController],
  providers: [CatalogService],
})
export class CatalogModule {}

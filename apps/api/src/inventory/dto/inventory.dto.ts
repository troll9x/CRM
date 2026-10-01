import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GoodsReceiptLineInputDto {
  @IsString()
  purchaseOrderLineId: string;

  @IsString()
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,14}(?:\.\d{1,6})?$/)
  receivedQuantity: string;

  @IsString()
  @Matches(/^\d{1,18}$/)
  actualUnitCostVnd: string;
}

export class CreateGoodsReceiptDto {
  @IsString()
  purchaseOrderId: string;

  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineInputDto)
  lines: GoodsReceiptLineInputDto[];
}

export class InventoryListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

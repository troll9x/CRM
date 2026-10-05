import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateStockAdjustmentDto {
  @IsString()
  warehouseId: string;

  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/)
  countedQuantity: string;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,18}$/)
  unitCostVnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

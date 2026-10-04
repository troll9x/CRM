import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export const STOCK_ADJUSTMENT_REASONS = [
  'COUNT_VARIANCE',
  'DAMAGE',
  'LOSS',
  'FOUND',
  'OTHER',
] as const;

export class CreateStockAdjustmentDto {
  @IsString()
  warehouseId: string;

  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;

  @IsString()
  @Matches(/^\d{1,14}(?:\.\d{1,6})?$/)
  countedQuantity: string;

  @IsIn(STOCK_ADJUSTMENT_REASONS)
  reasonCode: (typeof STOCK_ADJUSTMENT_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

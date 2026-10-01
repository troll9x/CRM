import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateOpeningStockDto {
  @IsString()
  warehouseId: string;

  @IsString()
  variantId: string;

  @IsString()
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,14}(?:\.\d{1,6})?$/)
  quantity: string;

  @IsString()
  @Matches(/^\d{1,18}$/)
  unitCostVnd: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

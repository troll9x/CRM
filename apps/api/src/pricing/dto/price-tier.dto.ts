import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

export class ListPriceTiersQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  variantId?: string;
}

export class ResolveWholesalePriceQueryDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  variantId: string;

  @IsString()
  @Matches(/^(?=.*[1-9])\d{1,9}(?:\.\d{1,6})?$/)
  quantity: string;
}

export class SetPriceTierDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantityFrom: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedVersion: number;

  @ApiProperty({ example: '80000', nullable: true })
  @ValidateIf((_value, current) => current !== null)
  @IsString()
  @Matches(/^[1-9]\d{0,19}$/)
  priceVnd: string | null;
}

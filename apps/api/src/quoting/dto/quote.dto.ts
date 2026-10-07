import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const vndPattern = /^(?:0|[1-9]\d{0,19})$/;
const decimalPattern = /^(?=.*[1-9])\d{1,9}(?:\.\d{1,6})?$/;
const valuePattern = /^(?:0|[1-9]\d{0,19})(?:\.\d{1,4})?$/;

export class QuoteLineInputDto {
  @IsString()
  @Matches(idPattern)
  variantId: string;

  @IsString()
  @Matches(decimalPattern)
  quantity: string;

  @IsOptional()
  @IsIn(['PERCENTAGE', 'FIXED_VND'])
  discountMode?: 'PERCENTAGE' | 'FIXED_VND' | null;

  @IsOptional()
  @IsString()
  @Matches(valuePattern)
  discountValue?: string | null;
}

export class CreateQuoteDto {
  @IsString()
  @Matches(idPattern)
  customerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineInputDto)
  lines: QuoteLineInputDto[];

  @IsOptional()
  @IsIn(['PERCENTAGE', 'FIXED_VND'])
  orderDiscountMode?: 'PERCENTAGE' | 'FIXED_VND' | null;

  @IsOptional()
  @IsString()
  @Matches(valuePattern)
  orderDiscountValue?: string | null;

  @IsOptional()
  @IsString()
  @Matches(vndPattern)
  shippingFeeVnd?: string;

  @IsOptional()
  @IsIn(['PERCENTAGE', 'FIXED_VND'])
  taxMode?: 'PERCENTAGE' | 'FIXED_VND' | null;

  @IsOptional()
  @IsString()
  @Matches(valuePattern)
  taxValue?: string | null;

  @IsOptional()
  @IsString()
  @Matches(vndPattern)
  depositVnd?: string;

  @IsOptional()
  @IsString()
  paymentNote?: string;

  @IsOptional()
  @IsString()
  internalNote?: string;
}

export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;
}

export class SendQuoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;

  @IsString()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  receivedAt: string;
}

export class ConvertQuoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;
}

export class ListQuotesQueryDto {
  @IsOptional()
  @IsString()
  @Matches(idPattern)
  customerId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED'])
  status?: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';
}

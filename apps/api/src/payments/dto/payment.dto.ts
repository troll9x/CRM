import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const vndPattern = /^(?=.*[1-9])\d{1,20}$/;

export class PaymentAllocationInputDto {
  @IsString()
  @Matches(idPattern)
  orderId: string;

  @IsString()
  @Matches(vndPattern)
  amountVnd: string;
}

export class CreatePaymentDto {
  @IsString()
  @Matches(idPattern)
  customerId: string;

  @IsString()
  @Matches(vndPattern)
  amountVnd: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInputDto)
  allocations?: PaymentAllocationInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PaymentSuggestionsQueryDto {
  @IsString()
  @Matches(idPattern)
  customerId: string;
}

export class ApplyCustomerCreditDto {
  @IsString()
  @Matches(idPattern)
  orderId: string;

  @IsString()
  @Matches(vndPattern)
  amountVnd: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;
}

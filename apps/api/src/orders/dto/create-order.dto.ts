import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const quantityPattern = /^(?=.*[1-9])\d{1,9}(?:\.\d{1,6})?$/;

export class CreateOrderLineDto {
  @IsString()
  @Matches(idPattern)
  variantId: string;

  @IsString()
  @Matches(quantityPattern)
  quantity: string;
}

export class CreateOrderDto {
  @IsString()
  @Matches(idPattern)
  customerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines: CreateOrderLineDto[];
}

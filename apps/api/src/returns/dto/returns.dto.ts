import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const quantityPattern = /^\d{1,14}(?:\.\d{1,6})?$/;

export class ReturnLineInputDto {
  @IsString()
  @Matches(idPattern)
  shipmentLineId: string;

  @IsString()
  @Matches(quantityPattern)
  quantity: string;
}

export class CreateReturnDto {
  @IsString()
  @Matches(idPattern)
  shipmentId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineInputDto)
  lines: ReturnLineInputDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class InspectReturnLineDto {
  @IsString()
  @Matches(idPattern)
  returnLineId: string;

  @IsString()
  @Matches(quantityPattern)
  saleableQuantity: string;

  @IsString()
  @Matches(quantityPattern)
  quarantineQuantity: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class InspectReturnDto {
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectReturnLineDto)
  lines: InspectReturnLineDto[];
}

export class SetReturnWindowDto {
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;

  @IsInt()
  @Min(1)
  expectedVersion: number;
}

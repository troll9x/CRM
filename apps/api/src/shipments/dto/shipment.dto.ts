import { IsInt, IsString, Matches, Min } from 'class-validator';

const idPattern = /^[A-Za-z0-9_-]{1,64}$/;

export class CreateShipmentDto {
  @IsString()
  @Matches(idPattern)
  orderId: string;

  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class DeliverShipmentDto {
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

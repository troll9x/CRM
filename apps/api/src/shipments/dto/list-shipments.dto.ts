import { IsEnum, IsOptional } from 'class-validator';
import { ShipmentStatus } from '../../generated/prisma/client';

export class ListShipmentsDto {
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;
}

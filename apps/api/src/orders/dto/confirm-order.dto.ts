import { IsInt, Min } from 'class-validator';

export class ConfirmOrderDto {
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

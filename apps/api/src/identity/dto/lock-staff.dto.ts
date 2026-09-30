import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class LockStaffDto {
  @ApiProperty()
  @IsBoolean()
  locked: boolean;
}

import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CustomerProfileNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}

export class CustomerTimelineQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;
}

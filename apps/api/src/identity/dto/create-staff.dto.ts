import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'nhanvien@example.com' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(120)
  displayName: string;

  @ApiProperty({ format: 'password', minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;

  @ApiProperty({ type: [String], example: ['sales'] })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  roleCodes: string[];
}

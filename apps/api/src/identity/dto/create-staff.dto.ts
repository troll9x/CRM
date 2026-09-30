import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'nhanvien@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
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

import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class DuplicateScanDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class DuplicateDecisionDto {
  @IsIn(['CONFIRM_SAME', 'REJECT', 'REVIEW_AGAIN'])
  decision: 'CONFIRM_SAME' | 'REJECT' | 'REVIEW_AGAIN';

  @IsInt()
  @Min(1)
  versionA: number;

  @IsInt()
  @Min(1)
  versionB: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class MergePreviewDto {
  @IsString()
  @MinLength(1)
  targetCustomerId: string;
}

export class MergeCustomerDto extends MergePreviewDto {
  @IsInt()
  @Min(1)
  sourceVersion: number;

  @IsInt()
  @Min(1)
  targetVersion: number;
}

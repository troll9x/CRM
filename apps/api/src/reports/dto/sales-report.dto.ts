import { IsOptional, Matches } from 'class-validator';

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export class SalesReportQueryDto {
  @IsOptional()
  @Matches(dateOnlyPattern)
  from?: string;

  @IsOptional()
  @Matches(dateOnlyPattern)
  to?: string;
}

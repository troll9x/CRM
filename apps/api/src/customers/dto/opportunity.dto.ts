import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOpportunityDto {
  @IsString()
  customerId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @IsIn(['FIRST_PURCHASE', 'REPEAT_PURCHASE'])
  kind: 'FIRST_PURCHASE' | 'REPEAT_PURCHASE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  assignedStaffId?: string;
}

export class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(['NEW', 'QUALIFIED', 'WON', 'LOST'])
  stage?: 'NEW' | 'QUALIFIED' | 'WON' | 'LOST';

  @IsOptional()
  @IsIn(['FIRST_PURCHASE', 'REPEAT_PURCHASE'])
  kind?: 'FIRST_PURCHASE' | 'REPEAT_PURCHASE';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  assignedStaffId?: string;
}

export class ListOpportunitiesQueryDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsIn(['NEW', 'QUALIFIED', 'WON', 'LOST'])
  stage?: 'NEW' | 'QUALIFIED' | 'WON' | 'LOST';
}

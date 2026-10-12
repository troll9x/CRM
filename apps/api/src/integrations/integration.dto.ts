import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateConnectionDto {
  @IsIn(['FACEBOOK', 'ZALO', 'SHOPEE', 'TIKTOK_SHOP'])
  provider: 'FACEBOOK' | 'ZALO' | 'SHOPEE' | 'TIKTOK_SHOP';

  @IsString()
  @MinLength(1)
  @MaxLength(190)
  externalAccountId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(190)
  displayName: string;
}

export class FacebookStartDto {
  @IsOptional()
  @IsString()
  reconnectConnectionId?: string;
}

export class FacebookFinalizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(190)
  pageId: string;
}

export class ZaloFinalizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(190)
  oaId: string;
}

export class AddNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class LinkCustomerDto {
  @IsString()
  @MinLength(1)
  customerId: string;
}

export class VersionedLinkCustomerDto extends LinkCustomerDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsOptional()
  @IsString()
  expectedCustomerId?: string | null;
}

export class UnlinkIdentityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsOptional()
  @IsString()
  expectedCustomerId?: string | null;
}

export class IdentityLinkPreviewDto {
  @IsString()
  @MinLength(1)
  customerId: string;
}

export class UpdateConversationDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

  @IsOptional()
  @IsString()
  assignedStaffId?: string | null;
}

export class ProductMappingDto {
  @IsString()
  @MinLength(1)
  connectionId: string;

  @IsString()
  @MinLength(1)
  externalProductId: string;

  @IsOptional()
  @IsString()
  externalModelId?: string;

  @IsString()
  @MinLength(1)
  variantId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  conversionFactor: number;
}

export class ListIntegrationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  connectionId?: string;
}

export class ConnectionStatusDto {
  @IsIn(['PAUSED', 'CONFIGURED_UNVERIFIED'])
  status: 'PAUSED' | 'CONFIGURED_UNVERIFIED';
}

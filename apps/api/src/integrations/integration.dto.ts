import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  Max,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(190)
  pageId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  pageIds?: string[];
}

export class IntegrationStaffAccessDto {
  @IsBoolean()
  canRead: boolean;

  @IsBoolean()
  canSend: boolean;
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

export class SendSocialTextDto {
  @IsUUID()
  requestKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
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

export class CreateSocialTicketDto {
  @IsIn(['CONVERSATION', 'COMMENT'])
  sourceType: 'CONVERSATION' | 'COMMENT';

  @IsString()
  @MinLength(1)
  sourceId: string;

  @IsString()
  @MinLength(8)
  @MaxLength(190)
  requestKey: string;

  @IsIn(['PRODUCT', 'QUOTE', 'ORDER', 'DELIVERY', 'COMPLAINT', 'OTHER'])
  kind: 'PRODUCT' | 'QUOTE' | 'ORDER' | 'DELIVERY' | 'COMPLAINT' | 'OTHER';

  @IsIn(['NORMAL', 'HIGH', 'URGENT'])
  priority: 'NORMAL' | 'HIGH' | 'URGENT';

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  labels?: string[];

  @IsOptional()
  @IsString()
  assignedStaffId?: string | null;
}

export class UpdateSocialTicketDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @IsOptional()
  @IsIn(['PRODUCT', 'QUOTE', 'ORDER', 'DELIVERY', 'COMPLAINT', 'OTHER'])
  kind?: CreateSocialTicketDto['kind'];

  @IsOptional()
  @IsIn(['NORMAL', 'HIGH', 'URGENT'])
  priority?: CreateSocialTicketDto['priority'];

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  labels?: string[];

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

export class ListConversationMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  cursor?: string;
}

export class ConnectionStatusDto {
  @IsIn(['PAUSED', 'CONFIGURED_UNVERIFIED'])
  status: 'PAUSED' | 'CONFIGURED_UNVERIFIED';
}

export class StartFacebookBackfillDto {
  @IsString()
  connectionId: string;

  @IsIn(['MESSAGES', 'COMMENTS'])
  dataset: 'MESSAGES' | 'COMMENTS';

  @IsString()
  since: string;

  @IsString()
  until: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageLimit?: number;
}

export class ExtendFacebookBackfillDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  additionalPages: number;
}

export class FacebookBackfillPreflightDto {
  @IsString()
  connectionId: string;

  @IsIn(['MESSAGES', 'COMMENTS'])
  dataset: 'MESSAGES' | 'COMMENTS';
}

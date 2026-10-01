import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ACCESS_REQUEST_LIMITS,
  ACCESS_REQUEST_MATCH_TYPES,
  ACCESS_REQUEST_STATUSES,
  ACCESS_REQUEST_TABS,
} from '@safescript/shared';

const LIST_STATUSES = [
  ACCESS_REQUEST_STATUSES.PENDING,
  ACCESS_REQUEST_STATUSES.APPROVED,
  ACCESS_REQUEST_STATUSES.REJECTED,
  ACCESS_REQUEST_STATUSES.DUPLICATE,
  ACCESS_REQUEST_STATUSES.NEEDS_REVIEW,
  ACCESS_REQUEST_STATUSES.EXISTING_MATCH,
] as const;

const TABS = [
  ACCESS_REQUEST_TABS.ALL,
  ACCESS_REQUEST_TABS.PENDING,
  ACCESS_REQUEST_TABS.NEW,
  ACCESS_REQUEST_TABS.EXISTING,
  ACCESS_REQUEST_TABS.ACTIVATED,
  ACCESS_REQUEST_TABS.REJECTED,
] as const;

const MATCH_TYPES = [
  ACCESS_REQUEST_MATCH_TYPES.NONE,
  ACCESS_REQUEST_MATCH_TYPES.PHIX_EXACT,
  ACCESS_REQUEST_MATCH_TYPES.SAFESCRIBE_EXACT,
  ACCESS_REQUEST_MATCH_TYPES.POSSIBLE,
] as const;

export class CreateAccessRequestDto {
  @ApiProperty({ example: 'Main Street Pharmacy' })
  @IsString()
  @MinLength(2)
  @MaxLength(ACCESS_REQUEST_LIMITS.PHARMACY_NAME)
  pharmacyName!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(2)
  @MaxLength(ACCESS_REQUEST_LIMITS.LICENCE_NUMBER)
  licenceNumber!: string;

  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @MinLength(2)
  @MaxLength(ACCESS_REQUEST_LIMITS.CONTACT_NAME)
  contactName!: string;

  @ApiProperty({ example: 'jane@pharmacy.ca' })
  @IsEmail()
  @MaxLength(ACCESS_REQUEST_LIMITS.EMAIL)
  email!: string;

  @ApiPropertyOptional({ example: '7801234567' })
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.PHONE)
  phone?: string;

  @ApiProperty({ description: 'Server-issued capture token from POST /public/capture-ip' })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  captureToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.UTM)
  utmSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.UTM)
  utmMedium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.UTM)
  utmCampaign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.HONEYPOT)
  companyWebsite?: string;
}

export class ListAccessRequestsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: LIST_STATUSES })
  @IsOptional()
  @IsIn([...LIST_STATUSES])
  status?: (typeof LIST_STATUSES)[number];

  @ApiPropertyOptional({ enum: TABS })
  @IsOptional()
  @IsIn([...TABS])
  tab?: (typeof TABS)[number];

  @ApiPropertyOptional({ enum: MATCH_TYPES })
  @IsOptional()
  @IsIn([...MATCH_TYPES])
  matchType?: (typeof MATCH_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  province?: string;
}

export class AccessRequestNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.NOTES)
  notes?: string;
}

export class ApproveAccessRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.NOTES)
  notes?: string;

  /** Allow creating a new pharmacy even when a possible (not exact) match exists. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;
}

export class LinkExistingAccessRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pharmacyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.NOTES)
  notes?: string;
}

export class RejectAccessRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.REJECT_REASON)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ACCESS_REQUEST_LIMITS.NOTES)
  notes?: string;
}

import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  CONTACT_INQUIRY_NOTE_MAX,
  CONTACT_INQUIRY_STATUSES,
  CONTACT_MESSAGE_MAX,
  CONTACT_TOPICS,
} from '@safescript/shared';

const TOPICS = [
  CONTACT_TOPICS.PRODUCT_SUPPORT,
  CONTACT_TOPICS.REQUEST_DEMO,
  CONTACT_TOPICS.PARTNERSHIPS,
] as const;

const STATUSES = [
  CONTACT_INQUIRY_STATUSES.NEW,
  CONTACT_INQUIRY_STATUSES.OPEN,
  CONTACT_INQUIRY_STATUSES.CLOSED,
] as const;

export class CreateContactInquiryDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'jane.smith@pharmacy.ca' })
  @IsEmail()
  @MaxLength(254)
  workEmail!: string;

  @ApiProperty({ example: 'HealthPlus Pharmacy' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organization!: string;

  @ApiProperty({ enum: TOPICS })
  @IsIn([...TOPICS])
  topic!: (typeof TOPICS)[number];

  @ApiProperty({ example: 'How can we help you?' })
  @IsString()
  @MinLength(10)
  @MaxLength(CONTACT_MESSAGE_MAX)
  message!: string;

  /** Honeypot — must stay empty. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyWebsite?: string;
}

export class ListContactInquiriesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @ApiPropertyOptional({ enum: TOPICS })
  @IsOptional()
  @IsIn([...TOPICS])
  topic?: (typeof TOPICS)[number];

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];
}

export class UpdateContactInquiryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(CONTACT_INQUIRY_NOTE_MAX)
  internalNote?: string;
}

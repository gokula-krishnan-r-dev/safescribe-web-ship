import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PHIX_SYNC_EVENTS } from '../phix-mapping';

export class PhixPharmacyPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phixPharmacyId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string;

  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @IsOptional()
  @IsBoolean()
  suspended?: boolean;
}

export class PhixUserPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phixUserId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phixPharmacyId!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  passwordHash?: string | null;
}

export class PhixSyncEventDto {
  @IsIn([...PHIX_SYNC_EVENTS])
  event!: (typeof PHIX_SYNC_EVENTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PhixPharmacyPayloadDto)
  pharmacy?: PhixPharmacyPayloadDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PhixUserPayloadDto)
  user?: PhixUserPayloadDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PhixUserPayloadDto)
  users?: PhixUserPayloadDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  passwordHash?: string;
}

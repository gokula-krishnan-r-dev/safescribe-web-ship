import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IpAccessMode } from '@prisma/client';

export class UpdateIpAccessSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(IpAccessMode)
  mode?: IpAccessMode;

  @IsOptional()
  @IsBoolean()
  includeCurrentIp?: boolean;
}

export class CreateIpAllowlistEntryDto {
  @IsString()
  cidr!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateIpAllowlistEntryDto {
  @IsOptional()
  @IsString()
  cidr?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class UserAllowlistEntryDto {
  @IsString()
  cidr!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ReplaceUserAllowlistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAllowlistEntryDto)
  entries!: UserAllowlistEntryDto[];
}

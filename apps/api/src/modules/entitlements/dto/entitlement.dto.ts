import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertEntitlementItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  module!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Null = unlimited' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  includedQuantity?: number | null;

  @ApiPropertyOptional({ example: 'daily' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePharmacyEntitlementsDto {
  @ApiPropertyOptional({ example: 'America/Edmonton' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: [UpsertEntitlementItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertEntitlementItemDto)
  items?: UpsertEntitlementItemDto[];
}

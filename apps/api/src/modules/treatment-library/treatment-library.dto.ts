import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  TREATMENT_LIBRARY_LIST_TABS,
  TREATMENT_LIBRARY_MATCH_STATUSES,
  TREATMENT_LIBRARY_PAGE_SIZES,
  TREATMENT_LIBRARY_POPULATIONS,
} from '@safescript/shared';

export class ListTreatmentLibraryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: TREATMENT_LIBRARY_LIST_TABS })
  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_LIST_TABS])
  status?: (typeof TREATMENT_LIBRARY_LIST_TABS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_POPULATIONS])
  population?: (typeof TREATMENT_LIBRARY_POPULATIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_MATCH_STATUSES])
  matchStatus?: (typeof TREATMENT_LIBRARY_MATCH_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['displayName', 'listStatus', 'pathwayUsageCount', 'updatedAt'])
  sort?: 'displayName' | 'listStatus' | 'pathwayUsageCount' | 'updatedAt';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...TREATMENT_LIBRARY_PAGE_SIZES])
  pageSize?: number = 25;
}

export class SaveTreatmentLibraryPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  genericName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  brandName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  strength?: string;

  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_POPULATIONS])
  population?: (typeof TREATMENT_LIBRARY_POPULATIONS)[number];

  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_MATCH_STATUSES])
  matchStatus?: (typeof TREATMENT_LIBRARY_MATCH_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  productFormDisplay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  routeDisplay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  regimenLabel?: string;

  @IsOptional()
  @IsObject()
  medication?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  regimens?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  directions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eligibility?: string;

  @IsOptional()
  @IsObject()
  safety?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  extras?: Record<string, unknown>;
}

export class CreateTreatmentLibraryDto extends SaveTreatmentLibraryPayloadDto {}

export class UpdateTreatmentLibraryVersionDto extends SaveTreatmentLibraryPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class SearchApprovedLibraryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pathwayId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PRESCRIPTION', 'OTC', 'SUPPLEMENT', 'NON_DRUG'])
  treatmentType?: 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | 'NON_DRUG';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...TREATMENT_LIBRARY_POPULATIONS])
  population?: (typeof TREATMENT_LIBRARY_POPULATIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}

export class ReviewNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;
}

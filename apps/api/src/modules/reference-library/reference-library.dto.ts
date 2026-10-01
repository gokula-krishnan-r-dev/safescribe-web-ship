import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CLINICAL_USE_TAG_CODES,
  EVIDENCE_DOCUMENT_TYPES,
  EVIDENCE_IMPORT_SECTIONS,
  EVIDENCE_JURISDICTIONS,
  EVIDENCE_REFERENCE_STATUSES,
  REFERENCE_LIBRARY_PAGE_SIZES,
} from '@safescript/shared';

export class ListReferenceLibraryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...EVIDENCE_DOCUMENT_TYPES])
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...EVIDENCE_REFERENCE_STATUSES, 'active', 'retired'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['citationTitle', 'status', 'pathwayUsageCount', 'updatedAt'])
  sort?: 'citationTitle' | 'status' | 'pathwayUsageCount' | 'updatedAt';

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
  @IsIn([...REFERENCE_LIBRARY_PAGE_SIZES])
  pageSize?: number = 25;
}

export class SearchReferenceLibraryQueryDto {
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}

export class SaveReferenceLibraryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(400)
  citationTitle!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  organization!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  edition?: string | null;

  @IsOptional()
  @IsInt()
  publicationYear?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  doi?: string | null;

  @IsString()
  @IsIn([...EVIDENCE_DOCUMENT_TYPES])
  documentType!: string;

  @IsString()
  @IsIn([...EVIDENCE_JURISDICTIONS])
  jurisdiction!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceType?: string;

  @IsOptional()
  @IsIn([...EVIDENCE_REFERENCE_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  verifiedBy?: string | null;

  @IsOptional()
  @IsString()
  verificationDate?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsIn([...CLINICAL_USE_TAG_CODES], { each: true })
  clinicalUseTags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn([...EVIDENCE_IMPORT_SECTIONS], { each: true })
  suggestedSections?: string[];

  @IsOptional()
  @IsBoolean()
  documentationCandidate?: boolean;

  @IsOptional()
  @IsBoolean()
  verificationRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  pathwayIds?: string[];
}

export class UpdateReferenceLibraryDto extends SaveReferenceLibraryDto {}

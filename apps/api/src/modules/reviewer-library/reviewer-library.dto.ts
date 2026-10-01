import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { REFERENCE_LIBRARY_PAGE_SIZES, REVIEWER_TYPES } from '@safescript/shared';

export class ListReviewerLibraryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([...REVIEWER_TYPES, 'all'])
  reviewerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['active', 'retired', 'all'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['name', 'reviewerType', 'pathwayUsageCount', 'updatedAt'])
  sort?: 'name' | 'reviewerType' | 'pathwayUsageCount' | 'updatedAt';

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

export class SearchReviewerLibraryQueryDto {
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
  @IsIn([...REVIEWER_TYPES])
  reviewerType?: string;

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

export class SaveReviewerLibraryDto {
  @IsIn([...REVIEWER_TYPES])
  reviewerType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  credentials!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organization?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  role!: string;
}

export class UpdateReviewerLibraryDto extends SaveReviewerLibraryDto {}

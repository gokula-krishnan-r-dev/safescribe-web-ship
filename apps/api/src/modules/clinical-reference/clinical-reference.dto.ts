import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ClinicalReferenceListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  population?: string;

  @IsOptional()
  @IsString()
  inputCode?: string;
}

export class PatchReferenceValueDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() population?: string;
  @IsOptional() @IsString() sex?: string;
  @IsOptional() @IsString() context?: string | null;
  @IsOptional() @IsString() referenceStrategy?: string;
  @IsOptional() @IsString() referenceKind?: string;
  @IsOptional() @IsString() uiUse?: string | null;
  @IsOptional() @IsNumber() lowerNumeric?: number | null;
  @IsOptional() @IsNumber() upperNumeric?: number | null;
  @IsOptional() @IsString() operator?: string | null;
  @IsOptional() @IsString() targetValue?: string | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsString() displayText?: string | null;
  @IsOptional() @IsString() sourceCode?: string | null;
  @IsOptional() @IsInt() sourcePriority?: number | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class PatchTreatmentTargetDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() population?: string;
  @IsOptional() @IsString() clinicalContext?: string;
  @IsOptional() @IsString() parameter?: string;
  @IsOptional() @IsString() operator?: string | null;
  @IsOptional() @IsString() targetValue?: string | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsString() displayText?: string;
  @IsOptional() @IsString() sourceCode?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsString() notes?: string | null;
}

export class PatchPediatricPolicyDto {
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsString() category?: string | null;
  @IsOptional() @IsString() strategy?: string;
  @IsOptional() @IsString() preferredSource?: string | null;
  @IsOptional() @IsBoolean() fallbackAllowed?: boolean;
  @IsOptional() @IsBoolean() adultFallbackAllowed?: boolean;
  @IsOptional() @IsString() implementationNote?: string | null;
  @IsOptional() @IsString() sourceUrl?: string | null;
}

export class PatchReferenceSourceDto {
  @IsOptional() @IsString() sourceName?: string;
  @IsOptional() @IsString() sourceType?: string;
  @IsOptional() @IsString() publisher?: string | null;
  @IsOptional() @IsString() jurisdiction?: string | null;
  @IsOptional() @IsString() version?: string | null;
  @IsOptional() @IsString() sourceUrl?: string | null;
  @IsOptional() @IsString() useCase?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() lastReviewedAt?: string | null;
  @IsOptional() @IsString() nextReviewDueAt?: string | null;
}

export class PublishReferenceReleaseDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  releaseId?: string;
}

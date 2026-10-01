import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ListApprovedIndicationsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;

  @IsOptional()
  @IsString()
  active?: string;
}

export class CreateConditionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultEffectivenessQuestion?: string | null;

  @IsOptional()
  @IsBoolean()
  commonForRenewal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayPriority?: number;

  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];
}

export class UpdateConditionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  defaultEffectivenessQuestion?: string | null;

  @IsOptional()
  @IsBoolean()
  commonForRenewal?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  displayPriority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString({ each: true })
  aliases?: string[];
}

const MAPPING_STRENGTHS = ['primary', 'common', 'possible', 'rare'] as const;

export class CreateIndicationMapDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  medicationConceptId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ingredientId?: string | null;

  @IsString()
  conditionId!: string;

  @IsIn(MAPPING_STRENGTHS)
  mappingStrength!: (typeof MAPPING_STRENGTHS)[number];

  @IsOptional()
  @Type(() => Number)
  rankingWeight?: number | null;

  @IsOptional()
  @IsBoolean()
  autoGroupAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  alwaysRequireConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  commonIndication?: boolean;
}

export class UpdateIndicationMapDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  medicationConceptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ingredientId?: string | null;

  @IsOptional()
  @IsString()
  conditionId?: string;

  @IsOptional()
  @IsIn(MAPPING_STRENGTHS)
  mappingStrength?: (typeof MAPPING_STRENGTHS)[number];

  @IsOptional()
  @Type(() => Number)
  rankingWeight?: number | null;

  @IsOptional()
  @IsBoolean()
  autoGroupAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  alwaysRequireConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  commonIndication?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ListIndicationMapsQueryDto extends ListApprovedIndicationsQueryDto {
  @IsOptional()
  @IsString()
  ingredient?: string;

  @IsOptional()
  @IsString()
  conditionId?: string;
}

const MAPPING_LEVELS = [
  'therapeutic_moiety',
  'ingredient',
  'ingredient_combination',
  'clinical_drug',
  'product',
] as const;

const RELATIONSHIP_TYPES = [
  'approved_indication',
  'guideline_supported',
  'off_label',
  'other',
] as const;

const JURISDICTIONS = ['CA', 'AB', 'BC', 'ON', 'MB', 'SK'] as const;

export class ListGovernedMappingsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  relationship?: string;

  @IsOptional()
  @IsString()
  level?: string;

  /** approved | retired | all */
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateGovernedMappingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  medicationConceptId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  medicationDisplayName!: string;

  @IsIn(MAPPING_LEVELS)
  medicationMappingLevel!: (typeof MAPPING_LEVELS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  indicationConceptId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  indicationDisplayName!: string;

  @IsIn(RELATIONSHIP_TYPES)
  relationshipType!: (typeof RELATIONSHIP_TYPES)[number];

  @IsIn(JURISDICTIONS)
  jurisdiction!: (typeof JURISDICTIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceReferenceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateGovernedMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medicationConceptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  medicationDisplayName?: string;

  @IsOptional()
  @IsIn(MAPPING_LEVELS)
  medicationMappingLevel?: (typeof MAPPING_LEVELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  indicationConceptId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  indicationDisplayName?: string;

  @IsOptional()
  @IsIn(RELATIONSHIP_TYPES)
  relationshipType?: (typeof RELATIONSHIP_TYPES)[number];

  @IsOptional()
  @IsIn(JURISDICTIONS)
  jurisdiction?: (typeof JURISDICTIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceReferenceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class ListCandidatesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}

export class ReviewCandidateDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNotes?: string | null;
}

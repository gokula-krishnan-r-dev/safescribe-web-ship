import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SafetyParticipantDto {
  @IsString()
  participantKey!: string;

  @IsString()
  selectorType!: string;

  @IsString()
  conceptText!: string;

  @IsOptional()
  @IsString()
  conceptCode?: string;
}

export class SafetyLabDetailDto {
  @IsString()
  drugIngredient!: string;

  @IsString()
  observationKey!: string;

  @IsOptional()
  @IsString()
  observationDisplay?: string;

  @IsOptional()
  @IsString()
  loincCode?: string;

  @IsString()
  comparator!: string;

  @IsOptional()
  thresholdLow?: number;

  @IsOptional()
  thresholdHigh?: number;

  @IsOptional()
  @IsString()
  expectedUnit?: string;

  @IsOptional()
  maxAgeDays?: number;

  @IsOptional()
  @IsString()
  missingLabAction?: string;
}

export class CreateSafetyRuleDto {
  @IsString()
  code!: string;

  @IsString()
  ruleType!: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsString()
  summary!: string;

  @IsString()
  detail!: string;

  @IsString()
  clinicalSeverity!: string;

  @IsString()
  recommendedAction!: string;

  @IsOptional()
  @IsBoolean()
  overrideAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  overrideReasonRequired?: boolean;

  @IsOptional()
  @IsString()
  matchType?: string;

  @IsOptional()
  @IsString()
  relationshipType?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsString()
  evidenceSource?: string;

  @IsOptional()
  @IsString()
  evidenceSection?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyParticipantDto)
  participants!: SafetyParticipantDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SafetyLabDetailDto)
  labDetail?: SafetyLabDetailDto;
}

export class UpdateSafetyRuleDto {
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsString()
  clinicalSeverity?: string;

  @IsOptional()
  @IsString()
  recommendedAction?: string;

  @IsOptional()
  @IsBoolean()
  overrideAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  overrideReasonRequired?: boolean;

  @IsOptional()
  @IsString()
  matchType?: string;

  @IsOptional()
  @IsString()
  relationshipType?: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyParticipantDto)
  participants?: SafetyParticipantDto[];
}

export class BulkUpdateSafetyRulesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  clinicalSeverity?: string;
}

export class BulkDeleteSafetyRulesDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ApproveAllDraftRulesDto {
  @ApiPropertyOptional({
    description: 'Optional rule type filter (e.g. RENAL_EGFR_BAND). When omitted, all draft rules are approved.',
  })
  @IsOptional()
  @IsString()
  ruleType?: string;

  @ApiPropertyOptional({ description: 'Optional search filter applied to rule code / summary.' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class SafetyPatientAllergyDto {
  @IsString()
  substance!: string;

  @IsOptional()
  @IsString()
  clinicalStatus?: string;

  @IsOptional()
  @IsString()
  verificationStatus?: string;

  @IsOptional()
  @IsString()
  reaction?: string;
}

export class SafetySelectedMedicationDto {
  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  endedAt?: string;
}

export class SafetyPatientLabDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  observedAt?: string;
}

export class SafetyAiLabDto {
  @IsString()
  test!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class SafetyPatientPregnancyDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  trimester?: string;
}

export class SafetyPatientContextDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  age?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyPatientAllergyDto)
  allergies!: SafetyPatientAllergyDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyPatientLabDto)
  labs?: SafetyPatientLabDto[];

  @IsOptional()
  @IsString()
  labValuesText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetyAiLabDto)
  aiLabs?: SafetyAiLabDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SafetyPatientPregnancyDto)
  pregnancy?: SafetyPatientPregnancyDto;

  @IsOptional()
  @IsString()
  breastfeeding?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetySelectedMedicationDto)
  currentMedications?: SafetySelectedMedicationDto[];
}

export class EvaluateMedicationSafetyDto {
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @ValidateNested()
  @Type(() => SafetyPatientContextDto)
  patientContext!: SafetyPatientContextDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SafetySelectedMedicationDto)
  selectedMedications!: SafetySelectedMedicationDto[];
}

export class SafetyOverrideDto {
  @IsString()
  reasonCode!: string;

  @IsOptional()
  @IsString()
  reasonComment?: string;
}

export class ListSafetyRulesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ruleType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jurisdiction?: string;
}

import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  IsArray,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  ValidateIf,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PathwayStatus,
  QuestionType,
  QuestionStatus,
  RuleAction,
  RuleSeverity,
  RequirementLevel,
  TreatmentCategory,
  RecommendationLevel,
  DocumentRole,
  ClinicalConceptCategory,
} from '@prisma/client';

export class CreatePathwayDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  condition!: string;

  /** Display / legacy single field (e.g. first province name or joined labels). */
  @IsString()
  province!: string;

  /** Comma-separated province codes for availability (e.g. "AB,ON,BC"). */
  @IsOptional()
  @IsString()
  provinceAvailability?: string;

  /** One or more categories, comma-separated. */
  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePathwayDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // ── Overview metadata ────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  provinceAvailability?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMin?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  ageMax?: number | null;

  @IsOptional()
  @IsBoolean()
  pharmacistPrescribingEligible?: boolean;

  @IsOptional()
  @IsEnum(RequirementLevel)
  requiresPhysicalExam?: RequirementLevel;

  @IsOptional()
  @IsEnum(RequirementLevel)
  requiresLabResults?: RequirementLevel;

  @IsOptional()
  @IsBoolean()
  requiresFollowUp?: boolean;

  @IsOptional()
  @IsString()
  guidelineSource?: string;

  @IsOptional()
  @IsString()
  lastClinicalReview?: string | null;

  @IsOptional()
  assessmentSectionsEnabled?: {
    diagnosisConfirmation?: boolean;
    additionalAssessment?: boolean;
    treatmentEligibility?: boolean;
  };

  /** Custom Assessment section settings (name + conditional visibility) */
  @IsOptional()
  customAssessment?: {
    displayName?: string;
    visibility?: {
      all?: Array<{
        field: string;
        operator: string;
        value: string | number | string[];
      }>;
    } | null;
  };

  // ── Pathway Matching / Routing ───────────────────────────────────────────

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  routingAliases?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  routingPresentingComplaints?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  routingContextTerms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  routingDescription?: string | null;
}

export class UpdatePathwayStatusDto {
  @IsEnum(PathwayStatus)
  status!: PathwayStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PublishPathwayDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQuestionDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  /** Prefer sectionName for Assessment modules — backend upserts the ClinicalSection */
  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsString()
  @MinLength(5)
  question!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  helpText?: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  options?: Record<string, string>[];

  @IsOptional()
  @IsString()
  sourceDocument?: string;

  @IsOptional()
  @IsInt()
  sourcePage?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds?: string[];

  @IsOptional()
  visibilityRule?: {
    sourceField?: string;
    operator?: string;
    value?: unknown;
    label?: string;
  } | null;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  sectionName?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  helpText?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  options?: Record<string, string>[];

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds?: string[];

  @IsOptional()
  visibilityRule?: {
    sourceField?: string;
    operator?: string;
    value?: unknown;
    label?: string;
  } | null;
}

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  questionId?: string;

  @IsString()
  condition!: string;

  @IsString()
  operator!: string;

  @IsString()
  value!: string;

  @IsEnum(RuleAction)
  action!: RuleAction;

  @IsEnum(RuleSeverity)
  severity!: RuleSeverity;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  details?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  condition?: string;

  @IsOptional()
  @IsString()
  operator?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsEnum(RuleAction)
  action?: RuleAction;

  @IsOptional()
  @IsEnum(RuleSeverity)
  severity?: RuleSeverity;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;
}

export class CreateTreatmentDto {
  @IsString()
  medicationName!: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsEnum(TreatmentCategory)
  category?: TreatmentCategory;

  @IsOptional()
  @IsEnum(RecommendationLevel)
  recommendationLevel?: RecommendationLevel;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  dose?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsString()
  directions?: string;

  @IsOptional()
  @IsString()
  maxDose?: string;

  @IsOptional()
  @IsString()
  eligibility?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string;

  @IsOptional()
  @IsString()
  clinicalNotes?: string;

  @IsOptional()
  @IsString()
  guidelineReference?: string;

  @IsOptional()
  @IsString()
  evidenceStrength?: string;

  @IsOptional()
  @IsString()
  renalAdjustment?: string;

  @IsOptional()
  @IsString()
  hepaticAdjustment?: string;

  @IsOptional()
  @IsString()
  pregnancyNotes?: string;

  @IsOptional()
  @IsString()
  breastfeedingNotes?: string;

  @IsOptional()
  @IsString()
  pregnancyReason?: string;

  @IsOptional()
  @IsString()
  renalAdjustmentReason?: string;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsIn(['CrCl', 'eGFR', 'OTHER', 'NONE'])
  renalSourceBasis?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsIn(['CrCl', 'eGFR', 'NONE'])
  renalDosingBasis?: string | null;

  @IsOptional()
  @IsArray()
  renalDosingRules?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  hepaticAdjustmentReason?: string;

  @IsOptional()
  @IsString()
  monitoringReason?: string;

  @IsOptional()
  @IsString()
  counsellingNotes?: string;

  @IsOptional()
  @IsString()
  followUpAdvice?: string;

  @IsOptional()
  @IsString()
  ageRestriction?: string;

  @IsOptional()
  @IsString()
  provinceAvailability?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interactions?: string[];

  @IsOptional()
  @IsString()
  monitoring?: string;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  treatmentLibraryItemId?: string;

  @IsOptional()
  @IsString()
  treatmentLibraryVersionId?: string;

  @IsOptional()
  @IsInt()
  sourceVersionNumber?: number;

  @IsOptional()
  @IsString()
  sourcePayloadHash?: string;

  @IsOptional()
  sourceSnapshot?: Record<string, unknown>;

  @IsOptional()
  pathwayOverrides?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['LINKED', 'DETACHED', 'MANUAL'])
  libraryLinkStatus?: 'LINKED' | 'DETACHED' | 'MANUAL';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds?: string[];

  @IsOptional()
  @IsString()
  documentationReferenceId?: string | null;
}

export class UpdateTreatmentSectionEvidenceDto {
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds!: string[];
}

export class ReorderTreatmentsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

export class ReorderQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

export class BulkQuestionIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class ReorderCounsellingDto {
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];

  @ApiPropertyOptional({ enum: ['what_to_expect', 'self_care', 'follow_up'] })
  @IsOptional()
  @IsIn(['what_to_expect', 'self_care', 'follow_up'])
  outputSection?: 'what_to_expect' | 'self_care' | 'follow_up';
}

export class BulkTreatmentIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class BulkCounsellingIdsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class CreateCounsellingDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  point!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  descriptor?: string;

  @IsOptional()
  @IsIn(['what_to_expect', 'self_care', 'follow_up'])
  outputSection?: 'what_to_expect' | 'self_care' | 'follow_up';

  @IsOptional()
  @IsString()
  guidanceType?: string;

  @IsOptional()
  @IsIn(['first_line', 'alternative', 'optional'])
  priority?: 'first_line' | 'alternative' | 'optional';

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  legacySource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  legacyId?: string;
}

export class UpdateCounsellingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  point?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  descriptor?: string;

  @IsOptional()
  @IsIn(['what_to_expect', 'self_care', 'follow_up'])
  outputSection?: 'what_to_expect' | 'self_care' | 'follow_up';

  @IsOptional()
  @IsString()
  guidanceType?: string;

  @IsOptional()
  @IsIn(['first_line', 'alternative', 'optional'])
  priority?: 'first_line' | 'alternative' | 'optional';

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsInt()
  itemVersion?: number;
}

// ─── Red Flags (pathway-level JSON) ──────────────────────────────────────────

export enum RedFlagSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

export enum RedFlagAction {
  IMMEDIATE_REFERRAL = 'IMMEDIATE_REFERRAL',
  SAME_DAY_PHYSICIAN = 'SAME_DAY_PHYSICIAN',
  EMERGENCY = 'EMERGENCY',
  PATHWAY_EXCLUDED = 'PATHWAY_EXCLUDED',
  PHARMACIST_DISCRETION = 'PHARMACIST_DISCRETION',
}

export class RedFlagItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RedFlagSeverity)
  severity!: RedFlagSeverity;

  /** Structured action (preferred) or free-text legacy action */
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  whyItMatters?: string;

  @IsOptional()
  @IsString()
  actionNote?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds?: string[];
}

export class UpdateRedFlagsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RedFlagItemDto)
  redFlags!: RedFlagItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionEvidenceRefIds?: string[];
}

// ─── Differential Diagnoses (pathway-level JSON) ─────────────────────────────

export enum DifferentialLikelihood {
  COMMON = 'COMMON',
  LESS_COMMON = 'LESS_COMMON',
  RARE = 'RARE',
}

export class DifferentialItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  condition!: string;

  /** Screening question that points toward this differential */
  @IsOptional()
  @IsString()
  question?: string;

  /** Clinical rationale for ruling out this condition */
  @IsOptional()
  @IsString()
  whyItMatters?: string;

  /** Suggested alternate pathway name/slug if YES */
  @IsOptional()
  @IsString()
  suggestedPathway?: string;

  @IsOptional()
  @IsString()
  distinguishingFeatures?: string;

  @IsOptional()
  @IsString()
  keySymptoms?: string;

  @IsOptional()
  @IsString()
  recommendedAction?: string;

  @IsOptional()
  @IsEnum(DifferentialLikelihood)
  likelihood?: DifferentialLikelihood;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRefIds?: string[];
}

export class UpdateDifferentialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DifferentialItemDto)
  differentials!: DifferentialItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionEvidenceRefIds?: string[];
}

export class ListPathwaysQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PathwayStatus)
  status?: PathwayStatus;

  @IsOptional()
  @IsString()
  province?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class RegenerateDto {
  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];

  /** Force full document reparse + reclassification instead of regenerating from stored concepts. */
  @IsOptional()
  @IsBoolean()
  reparseDocuments?: boolean;
}

export class ImportQuestionScriptDto {
  @ValidateIf((o: ImportQuestionScriptDto) => !o.fileBase64)
  @IsString()
  @MinLength(8)
  text?: string;

  /** UTF-8 or Word document as base64 when importing from a .docx/.doc/.txt file */
  @ValidateIf((o: ImportQuestionScriptDto) => !o.text)
  @IsOptional()
  @IsString()
  @MinLength(24)
  @MaxLength(3_500_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  /** merge = append (skip duplicates); replace_section = replace questions in selected sections */
  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace_section';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: Array<
    'diagnosisConfirmation' | 'additionalAssessment' | 'treatmentEligibility'
  >;

  /** When true (default), use AI to structure unstructured ChatGPT text if parser finds nothing */
  @IsOptional()
  @IsBoolean()
  useAiFallback?: boolean;
}

export class ImportChatGptScriptDto {
  @IsString()
  target!:
    | 'overview'
    | 'concepts'
    | 'assessment'
    | 'red-flags'
    | 'differentials'
    | 'rules'
    | 'treatments'
    | 'counselling'
    | 'references';

  @ValidateIf((o: ImportChatGptScriptDto) => !o.fileBase64)
  @IsString()
  @MinLength(8)
  text?: string;

  /** UTF-8 or Word document as base64 (ChatGPT → Word → import) */
  @ValidateIf((o: ImportChatGptScriptDto) => !o.text)
  @IsOptional()
  @IsString()
  @MinLength(24)
  @MaxLength(3_500_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: Array<
    'diagnosisConfirmation' | 'additionalAssessment' | 'treatmentEligibility'
  >;

  @IsOptional()
  @IsBoolean()
  useAiFallback?: boolean;
}

export class ConfirmDocumentRoleItemDto {
  @IsString()
  documentId!: string;

  @IsEnum(DocumentRole)
  role!: DocumentRole;
}

export class ConfirmDocumentRolesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmDocumentRoleItemDto)
  roles!: ConfirmDocumentRoleItemDto[];

  /** When true (default), start concept extraction after confirming roles. */
  @IsOptional()
  @IsBoolean()
  startExtraction?: boolean;
}

export class UpdateConceptDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  label?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(ClinicalConceptCategory)
  category?: ClinicalConceptCategory;

  @IsOptional()
  @IsString()
  importance?: string | null;

  @IsOptional()
  @IsBoolean()
  approved?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class MergeConceptsDto {
  @IsString()
  targetConceptId!: string;

  @IsArray()
  @IsString({ each: true })
  sourceConceptIds!: string[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  canonicalLabel?: string;
}

export class RegenerateFromConceptsDto {
  @IsOptional()
  limits?: Record<string, number>;
}

export class CreateEvidenceReferenceDto {
  @IsString()
  @MinLength(2)
  citationTitle!: string;

  @IsString()
  @MinLength(1)
  organization!: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsInt()
  publicationYear?: number;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  doi?: string;

  @IsString()
  documentType!: string;

  @IsString()
  jurisdiction!: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsIn(['verified', 'needs_review', 'verification_required', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  verifiedBy?: string;

  @IsOptional()
  @IsString()
  verificationDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicalUseTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
}

export class LinkEvidenceFromLibraryDto {
  @IsString()
  @MinLength(1)
  libraryItemId!: string;
}

export class UpdateEvidenceReferenceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  citationTitle?: string;

  @IsOptional()
  @IsString()
  organization?: string | null;

  @IsOptional()
  @IsString()
  edition?: string | null;

  @IsOptional()
  @IsInt()
  publicationYear?: number | null;

  @IsOptional()
  @IsString()
  url?: string | null;

  @IsOptional()
  @IsString()
  doi?: string | null;

  @IsOptional()
  @IsString()
  documentType?: string | null;

  @IsOptional()
  @IsString()
  jurisdiction?: string | null;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsIn(['verified', 'needs_review', 'verification_required', 'archived'])
  status?: string;

  @IsOptional()
  @IsString()
  verifiedBy?: string | null;

  @IsOptional()
  @IsString()
  verificationDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicalUseTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
}

export class UpdatePresentationReviewSectionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionEvidenceRefIds?: string[];
}

export class EvidenceMappingItemDto {
  @IsIn([
    'presentation_review',
    'differential_review',
    'red_flags',
    'treatment_options',
    'patient_guidance',
    'section_wide',
  ])
  section!: string;

  @IsIn(['section', 'question', 'differential', 'red_flag', 'treatment', 'guidance'])
  mappingType!: string;

  @IsOptional()
  @IsString()
  targetId?: string | null;

  @IsOptional()
  @IsBoolean()
  suggested?: boolean;
}

export class ReplaceEvidenceMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvidenceMappingItemDto)
  mappings!: EvidenceMappingItemDto[];
}

export class UpdatePathwayGovernanceDto {
  @IsOptional()
  @IsIn(['not_started', 'pending', 'completed'])
  internalReviewStatus?: string;

  @IsOptional()
  @IsIn(['not_started', 'pending', 'completed'])
  externalPeerReviewStatus?: string;

  @IsOptional()
  @IsString()
  lastReviewedAt?: string | null;

  @IsOptional()
  @IsString()
  nextReviewDueAt?: string | null;

  @IsOptional()
  @IsString()
  primaryDocumentationReferenceId?: string | null;

  @IsOptional()
  @IsString()
  secondaryDocumentationReferenceId?: string | null;
}

export class CreatePathwayReviewerDto {
  @IsIn(['internal', 'external'])
  reviewerType!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  credentials!: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsString()
  @MinLength(1)
  role!: string;

  @IsArray()
  @IsString({ each: true })
  reviewedAreas!: string[];

  @IsString()
  reviewDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LinkReviewerFromLibraryDto {
  @IsString()
  @MinLength(1)
  libraryReviewerId!: string;

  @IsIn(['internal', 'external'])
  reviewerType!: string;

  @IsArray()
  @IsString({ each: true })
  reviewedAreas!: string[];

  @IsString()
  reviewDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePathwayReviewerDto {
  @IsOptional()
  @IsIn(['internal', 'external'])
  reviewerType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  credentials?: string;

  @IsOptional()
  @IsString()
  organization?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reviewedAreas?: string[];

  @IsOptional()
  @IsString()
  reviewDate?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class PreviewReferencesImportDto {
  @ValidateIf((o: PreviewReferencesImportDto) => !o.fileBase64)
  @IsString()
  @MinLength(8)
  text?: string;

  @ValidateIf((o: PreviewReferencesImportDto) => !o.text)
  @IsOptional()
  @IsString()
  @MinLength(24)
  @MaxLength(3_500_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class ReferenceImportDecisionDto {
  @IsString()
  importKey!: string;

  @IsIn(['use_existing', 'create_new', 'skip'])
  action!: 'use_existing' | 'create_new' | 'skip';

  @IsOptional()
  @IsString()
  existingReferenceId?: string;
}

export class CommitReferencesImportDto {
  @ValidateIf((o: CommitReferencesImportDto) => !o.fileBase64)
  @IsString()
  @MinLength(8)
  text?: string;

  @ValidateIf((o: CommitReferencesImportDto) => !o.text)
  @IsOptional()
  @IsString()
  @MinLength(24)
  @MaxLength(3_500_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImportDecisionDto)
  decisions!: ReferenceImportDecisionDto[];
}

export class PreviewPresentationReviewImportDto {
  @ValidateIf((o: PreviewPresentationReviewImportDto) => !o.fileBase64)
  @IsString()
  @MinLength(8)
  text?: string;

  @ValidateIf((o: PreviewPresentationReviewImportDto) => !o.text)
  @IsOptional()
  @IsString()
  @MinLength(24)
  @MaxLength(3_500_000)
  fileBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class CommitPresentationReviewImportDto extends PreviewPresentationReviewImportDto {
  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsOptional()
  @IsBoolean()
  confirmedReplace?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImportDecisionDto)
  decisions?: ReferenceImportDecisionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skipQuestionKeys?: string[];
}

export class PreviewRedFlagsImportDto extends PreviewPresentationReviewImportDto {}

export class CommitRedFlagsImportDto extends PreviewPresentationReviewImportDto {
  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsOptional()
  @IsBoolean()
  confirmedReplace?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImportDecisionDto)
  decisions?: ReferenceImportDecisionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skipFlagKeys?: string[];
}

export class PreviewDifferentialsImportDto extends PreviewPresentationReviewImportDto {}

export class CommitDifferentialsImportDto extends PreviewPresentationReviewImportDto {
  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsOptional()
  @IsBoolean()
  confirmedReplace?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImportDecisionDto)
  decisions?: ReferenceImportDecisionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skipDifferentialKeys?: string[];
}

export class PreviewTreatmentsImportDto extends PreviewPresentationReviewImportDto {}

export class CommitTreatmentsImportDto extends PreviewPresentationReviewImportDto {
  @IsOptional()
  @IsString()
  mode?: 'merge' | 'replace';

  @IsOptional()
  @IsBoolean()
  confirmedReplace?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImportDecisionDto)
  decisions?: ReferenceImportDecisionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skipTreatmentKeys?: string[];
}

import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
  ValidateIf,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REFERRAL_DESTINATIONS,
  REFERRAL_ACTIONS,
  PATIENT_REFERRAL_RESPONSES,
  REFERRAL_CONTACT_METHODS,
  MANUAL_REFERRAL_HANDLING_METHODS,
  type ReferralDestination,
  type ReferralAction,
  type PatientReferralResponse,
  type ReferralContactMethod,
  MONITORING_REVIEW_ACTIONS,
  CONTEXT_REMOVAL_REASONS,
  MONITORING_REMOVAL_REASONS,
  type ContextRemovalReasonId,
  type MonitoringRemovalReasonId,
} from '@safescript/shared';

export class CreateConsultationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientRef?: string;

  @ApiPropertyOptional({ enum: ['prescribe', 'renew', 'adapt'] })
  @IsOptional()
  @IsIn(['prescribe', 'renew', 'adapt'])
  module?: 'prescribe' | 'renew' | 'adapt';
}

export class SaveStepDto {
  @ApiProperty({ description: 'Step index 0-9' })
  @IsInt()
  @Min(0)
  @Max(12)
  stepIndex!: number;

  @ApiProperty()
  @IsString()
  currentStep!: string;

  @ApiPropertyOptional()
  @IsOptional()
  data?: Record<string, unknown>;
}

export class UpdateTranscriptDto {
  @ApiProperty()
  @IsString()
  transcript!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  aiEntities?: Record<string, unknown>;
}

export class SelectPathwayDto {
  @ApiProperty()
  @IsString()
  pathwayId!: string;

  // Can be an array of suggestions or a map — skip strict shape validation
  @ApiPropertyOptional()
  @IsOptional()
  aiSuggestions?: unknown;
}

export class SelectApproachDto {
  @ApiProperty({ enum: ['GUIDED_PATHWAY', 'CLINICAL_JUDGMENT'] })
  @IsIn(['GUIDED_PATHWAY', 'CLINICAL_JUDGMENT'])
  mode!: 'GUIDED_PATHWAY' | 'CLINICAL_JUDGMENT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pathwayId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  aiSuggestions?: unknown;
}

export class SaveClinicalImpressionDto {
  @ApiPropertyOptional({ enum: ['SAVE_DRAFT', 'CONFIRM_AND_CONTINUE'] })
  @IsOptional()
  @IsIn(['SAVE_DRAFT', 'CONFIRM_AND_CONTINUE'])
  action?: 'SAVE_DRAFT' | 'CONFIRM_AND_CONTINUE';

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  workingDiagnosisText!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workingDiagnosisCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  workingDiagnosisSystem?: string;

  @ApiPropertyOptional({ enum: ['CONFIRMED', 'PROBABLE', 'UNCERTAIN'] })
  @IsOptional()
  @IsIn(['CONFIRMED', 'PROBABLE', 'UNCERTAIN'])
  diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  assessmentSummary?: string;

  @ApiPropertyOptional({
    enum: ['PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED'],
  })
  @IsOptional()
  @IsIn(['PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED'])
  assessmentSummarySource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class GenerateAssessmentSummaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(250)
  workingDiagnosisText?: string;

  @ApiPropertyOptional({ enum: ['CONFIRMED', 'PROBABLE', 'UNCERTAIN'] })
  @IsOptional()
  @IsIn(['CONFIRMED', 'PROBABLE', 'UNCERTAIN'])
  diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';
}

export class SavePrescribingReadinessDto {
  @ApiProperty()
  @IsBoolean()
  assessmentSufficient!: boolean;

  /**
   * @deprecated Red-flag clearance is a prerequisite from the Red Flags step.
   * Kept optional for backward compatibility with older clients.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  unresolvedRedFlags?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reasonCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasonDetail?: string;

  /** @deprecated Prefer reasonDetail */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  readinessReason?: string;

  @ApiPropertyOptional({
    enum: [
      'CONTINUE_TO_TREATMENT',
      'OBTAIN_OR_UPDATE_INFORMATION',
      'DOCUMENT_AND_REFER',
    ],
  })
  @IsOptional()
  @IsIn([
    'CONTINUE_TO_TREATMENT',
    'OBTAIN_OR_UPDATE_INFORMATION',
    'DOCUMENT_AND_REFER',
  ])
  nextAction?:
    | 'CONTINUE_TO_TREATMENT'
    | 'OBTAIN_OR_UPDATE_INFORMATION'
    | 'DOCUMENT_AND_REFER';

  @ApiPropertyOptional({
    enum: ['CLINICAL_IMPRESSION', 'PATIENT_PROFILE', 'RED_FLAG_CHECK'],
  })
  @IsOptional()
  @IsIn(['CLINICAL_IMPRESSION', 'PATIENT_PROFILE', 'RED_FLAG_CHECK'])
  returnTarget?: 'CLINICAL_IMPRESSION' | 'PATIENT_PROFILE' | 'RED_FLAG_CHECK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedSourceSnapshotHash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedReadinessRowVersion?: number | null;
}

export class GenerateRationaleSectionDto {
  @ApiProperty({
    enum: [
      'REASON_FOR_PRESCRIBING',
      'SELECTION_RATIONALE',
      'ALTERNATIVE_SUGGESTIONS',
      'SAFETY_MITIGATION_SUMMARY',
      'ALL',
    ],
  })
  @IsIn([
    'REASON_FOR_PRESCRIBING',
    'SELECTION_RATIONALE',
    'ALTERNATIVE_SUGGESTIONS',
    'SAFETY_MITIGATION_SUMMARY',
    'ALL',
  ])
  section!:
    | 'REASON_FOR_PRESCRIBING'
    | 'SELECTION_RATIONALE'
    | 'ALTERNATIVE_SUGGESTIONS'
    | 'SAFETY_MITIGATION_SUMMARY'
    | 'ALL';
}

export class SaveTreatmentRationaleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonForPrescribing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED', 'SYSTEM'])
  reasonSource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  selectionRationale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED', 'SYSTEM'])
  rationaleSource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyMitigationSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['PHARMACIST', 'AI_DRAFT', 'AI_EDITED', 'AI_ACCEPTED', 'SYSTEM'])
  safetySummarySource?: 'PHARMACIST' | 'AI_DRAFT' | 'AI_EDITED' | 'AI_ACCEPTED' | 'SYSTEM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reasonConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  selectionConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alternativesConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  safetyConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noAlternativesDocumented?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  alternatives?: Array<{
    category: string;
    selected: boolean;
    details?: string;
    notSelectedReason?: string;
  }>;
}

export class ConsultationListQueryDto {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;
  /** ISO datetime — return consultations created or updated on/after this instant (client local day start). */
  @IsOptional() @IsDateString() activeSince?: string;
  @ApiPropertyOptional({ enum: ['prescribe', 'renew'] })
  @IsOptional()
  @IsIn(['prescribe', 'renew'])
  module?: 'prescribe' | 'renew';
}

export class ParseLabTextDto {
  @ApiProperty({
    description: 'Pasted or typed laboratory values / report text',
    example: 'HbA1c: 7.2%\neGFR: 65 mL/min\nCreatinine: 98 µmol/L',
  })
  @IsString()
  @MinLength(3, { message: 'Please enter or paste at least one lab value.' })
  @MaxLength(20000, { message: 'Text is too long (max 20,000 characters).' })
  text!: string;
}

export class FormalHandoffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  providerFacility!: string;

  @ApiPropertyOptional({ enum: REFERRAL_CONTACT_METHODS })
  @IsOptional()
  @IsIn([...REFERRAL_CONTACT_METHODS])
  contactMethod?: ReferralContactMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactMethodOtherText?: string;

  @ApiPropertyOptional({ description: 'true | false | omit/null = unable to confirm' })
  @IsOptional()
  @IsBoolean()
  confirmationReceived?: boolean | null;

  @ApiProperty({ description: 'ISO datetime of handoff' })
  @IsDateString()
  handoffAt!: string;
}

export class SaveReferralOutcomeDto {
  @ApiProperty()
  @IsString()
  pathwayId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  pathwayVersion!: number;

  @ApiProperty({ enum: REFERRAL_DESTINATIONS })
  @IsIn([...REFERRAL_DESTINATIONS])
  destination!: ReferralDestination;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationOtherText?: string;

  @ApiProperty({
    description: 'Pharmacist-reviewed reason for referral (auto-drafted from assessment, then editable)',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  reasonForReferral!: string;

  @ApiPropertyOptional({
    enum: REFERRAL_ACTIONS,
    description: 'Optional. Defaults to patient_advised — not collected in the referral UI.',
  })
  @IsOptional()
  @IsIn([...REFERRAL_ACTIONS])
  actionTaken?: ReferralAction;

  @ApiPropertyOptional({
    enum: PATIENT_REFERRAL_RESPONSES,
    description: 'Optional. Defaults to agreed — not collected in the referral UI.',
  })
  @IsOptional()
  @IsIn([...PATIENT_REFERRAL_RESPONSES])
  patientResponse?: PatientReferralResponse;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  additionalNote?: string;

  @ApiPropertyOptional({ type: FormalHandoffDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FormalHandoffDto)
  handoff?: FormalHandoffDto;

  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  clientRequestId!: string;

  @ApiProperty({ description: 'When true, finalize consultation as referred' })
  @IsBoolean()
  completeConsultation!: boolean;

  @ApiPropertyOptional({
    enum: MANUAL_REFERRAL_HANDLING_METHODS,
    description: 'How the approved letter was handled. Faxed-from-SafeScribe is not accepted here.',
  })
  @IsOptional()
  @IsIn([...MANUAL_REFERRAL_HANDLING_METHODS])
  handlingMethod?: (typeof MANUAL_REFERRAL_HANDLING_METHODS)[number];

  @ApiPropertyOptional({ description: 'Required when handlingMethod is SENT_ANOTHER_WAY' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  handlingDetail?: string;

  @ApiPropertyOptional({
    description: 'Latest red-flag screening payload to persist with the referral',
  })
  @IsOptional()
  redFlagsData?: Record<string, unknown>;
}

export class CreateReferralLetterDto {
  @ApiPropertyOptional({ description: 'Optional draft field overrides before letter generation' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SaveReferralOutcomeDto)
  outcomeDraft?: SaveReferralOutcomeDto;

  @ApiPropertyOptional({ description: 'Client idempotency key for letter generation' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  clientRequestId?: string;

  @ApiPropertyOptional({ description: 'Expected source revision for optimistic concurrency' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedSourceRevision?: number;
}

export class DraftReferralReasonDto {
  @ApiPropertyOptional({ enum: REFERRAL_DESTINATIONS })
  @IsOptional()
  @IsIn([...REFERRAL_DESTINATIONS])
  destination?: ReferralDestination;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destinationOtherText?: string;

  @ApiPropertyOptional({ description: 'Client generation request id for race guards' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  requestId?: string;

  @ApiPropertyOptional({ description: 'Client source revision / generation key' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sourceRevision?: number;

  @ApiPropertyOptional({
    description: 'Latest red-flag screening payload so triggers can be rebuilt before save',
  })
  @IsOptional()
  redFlagsData?: Record<string, unknown>;
}

export class UpdateReferralLetterDraftDto {
  @ApiProperty({
    description: 'Edited referral letter draft (plain text or TipTap HTML)',
  })
  @IsString()
  @MaxLength(100_000)
  letterDraft!: string;
}

export class ApproveReferralLetterDto {
  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  clientRequestId!: string;

  @ApiPropertyOptional({ description: 'Optional final letter HTML/text before approval' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  letterDraft?: string;

  @ApiPropertyOptional({ description: 'Expected source revision for optimistic concurrency' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedSourceRevision?: number;

  @ApiPropertyOptional({
    description:
      'When action_taken is referral_sent, confirm the referral was sent outside SafeScribe',
  })
  @IsOptional()
  @IsBoolean()
  externalSendConfirmed?: boolean;
}

export class CompleteConsultationDto {
  @ApiProperty({
    description:
      'Pharmacist attestation that required documentation was saved to the pharmacy record',
  })
  @IsBoolean()
  documentationConfirmed!: boolean;

  @ApiPropertyOptional({ description: 'Client idempotency key' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  clientRequestId?: string;
}

export class CjRedFlagAnswerItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  questionId!: string;

  @ApiProperty({ enum: ['NO', 'YES'] })
  @IsIn(['NO', 'YES'])
  answer!: 'NO' | 'YES';
}

export class SaveCjRedFlagAnswerDto {
  @ApiProperty({ enum: ['NO', 'YES'] })
  @IsIn(['NO', 'YES'])
  answer!: 'NO' | 'YES';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  answerNotes?: string | null;

  @ApiPropertyOptional({
    description: 'Ignored for answer saves — confirm uses source snapshot instead',
  })
  @IsOptional()
  @IsInt()
  expectedCheckRowVersion?: number;
}

export class SaveCjRedFlagAttestationDto {
  @ApiProperty()
  @IsBoolean()
  otherUnresolvedConcern!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  otherConcernDetails?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedCheckRowVersion?: number;
}

export class ConfirmCjRedFlagCheckDto {
  @ApiProperty()
  @IsBoolean()
  otherUnresolvedConcern!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  otherConcernDetails?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedCheckRowVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedSourceSnapshotHash?: string;

  @ApiPropertyOptional({
    type: [CjRedFlagAnswerItemDto],
    description: 'Pharmacist answers at confirm time — source of truth if autosave raced',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CjRedFlagAnswerItemDto)
  answers?: CjRedFlagAnswerItemDto[];
}

export class GenerateDocumentationDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      'Canonical document keys to generate. Prescription and Patient Care Summary are assembled without an LLM.',
  })
  @IsOptional()
  @IsArray()
  @IsIn(
    [
      'consultation_note',
      'prescriber_communication',
      'prescription',
      'patient_care_summary',
    ],
    { each: true },
  )
  requestedDocumentTypes?: Array<
    | 'consultation_note'
    | 'prescriber_communication'
    | 'prescription'
    | 'patient_care_summary'
  >;

  @ApiPropertyOptional({
    description: 'Bypass source-hash reuse and regenerate the requested LLM documents.',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class TranslatePatientHandoutDto {
  @ApiProperty({
    description:
      'Curated Patient Care Summary language code (en, fr-CA, zh-CN, pa, …). Server loads confirmed source — do not send clinical text.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(12)
  targetLanguage!: string;
}

export class QuickAddQueryDto {
  @ApiPropertyOptional({ enum: ['frequent', 'condition'] })
  @IsOptional()
  @IsIn(['frequent', 'condition'])
  source?: 'frequent' | 'condition';

  @ApiPropertyOptional({ description: 'Collapsed view uses 3; View all may request up to 20' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class RecordQuickAddUsageDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  medicationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clinicalDrugConceptId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  strengthLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dosageFormLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  genericName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  terminologySource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rxcui?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ndc?: string;

  @ApiPropertyOptional({ enum: ['frequent', 'condition', 'search'] })
  @IsOptional()
  @IsIn(['frequent', 'condition', 'search'])
  selectionSource?: 'frequent' | 'condition' | 'search';
}

export class EvaluateTreatmentCandidateRegimenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  doseUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  frequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  duration?: string;
}

export class EvaluateTreatmentCandidateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentInstanceId?: string;

  @ApiProperty({ enum: ['SEARCH', 'QUICK_ADD', 'MANUAL'] })
  @IsIn(['SEARCH', 'QUICK_ADD', 'MANUAL'])
  source!: 'SEARCH' | 'QUICK_ADD' | 'MANUAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  medicationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  drugId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  medicationName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  genericName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  rxcui?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ndc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => EvaluateTreatmentCandidateRegimenDto)
  regimen?: EvaluateTreatmentCandidateRegimenDto;

  @ApiPropertyOptional({
    description: 'In-memory catalog (pathway + pharmacist-added) for duplicate comparison',
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  existingTreatments?: Array<Record<string, unknown>>;
}

export class SavePathwayClinicalJudgementDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  workingDiagnosisDisplay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workingDiagnosisConceptId?: string;

  @ApiPropertyOptional({ enum: ['CONFIRMED', 'PROBABLE', 'UNCERTAIN'] })
  @IsOptional()
  @IsIn(['CONFIRMED', 'PROBABLE', 'UNCERTAIN'])
  diagnosticCertainty?: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rationaleDraft?: string;

  @ApiPropertyOptional({ enum: ['prompt', 'form', 'documented'] })
  @IsOptional()
  @IsIn(['prompt', 'form', 'documented'])
  uiState?: 'prompt' | 'form' | 'documented';
}

export class ConfirmPathwayClinicalJudgementDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  workingDiagnosisDisplay!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workingDiagnosisConceptId?: string;

  @ApiProperty({ enum: ['CONFIRMED', 'PROBABLE', 'UNCERTAIN'] })
  @IsIn(['CONFIRMED', 'PROBABLE', 'UNCERTAIN'])
  diagnosticCertainty!: 'CONFIRMED' | 'PROBABLE' | 'UNCERTAIN';

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  rationaleApproved!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceAnswerRevision!: string;
}

export class SearchRenewConditionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class AddRenewConditionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customText?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicationIds?: string[];
}

export class SetRenewIndicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conditionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  customIndicationText?: string | null;
}

export class PatchRenewConditionReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['yes', 'no'])
  adherenceStatus?: 'yes' | 'no' | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['yes', 'no', 'unable_to_assess', 'unsure', 'no_unsure'])
  effectivenessStatus?: 'yes' | 'no' | 'unable_to_assess' | 'unsure' | 'no_unsure' | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['no', 'yes'])
  medicationConcernStatus?: 'no' | 'yes' | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  issues?: unknown[];
}

export class ApplyRenewStableAllDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skipReviewIds?: string[];
}

export class SaveRenewMonitoringResultDto {
  @ApiPropertyOptional()
  @IsOptional()
  numericValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  secondaryNumericValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  valueText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observedDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string | null;
}

export class MarkRenewMonitoringUnavailableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SaveRenewMonitoringReviewDto {
  @ApiProperty({ enum: MONITORING_REVIEW_ACTIONS })
  @IsIn([...MONITORING_REVIEW_ACTIONS])
  action!: (typeof MONITORING_REVIEW_ACTIONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  otherText?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedMedicationIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['7_days', '14_days', 'custom'])
  shorterDurationId?: string | null;
}

export class PatientContextFollowupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  onset?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  details?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  action?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class SaveRenewContextAnswerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ANSWERED', 'UNKNOWN', 'UNAVAILABLE'])
  status?: 'ANSWERED' | 'UNKNOWN' | 'UNAVAILABLE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  valueText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @Type(() => Number)
  numericValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  enteredUnit?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unableReasonCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  unableReasonText?: string | null;

  @ApiPropertyOptional({ type: PatientContextFollowupDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => PatientContextFollowupDto)
  followup?: PatientContextFollowupDto | null;
}

export class SaveRenewContextAnswerItemDto {
  @ApiProperty()
  @IsString()
  questionRuleId!: string;

  @ApiProperty({ enum: ['YES', 'NO', 'UNKNOWN'] })
  @IsIn(['YES', 'NO', 'UNKNOWN'])
  answer!: 'YES' | 'NO' | 'UNKNOWN';

  @ApiPropertyOptional({ enum: ['MANUAL', 'BULK_NO_CONCERNS'] })
  @IsOptional()
  @IsIn(['MANUAL', 'BULK_NO_CONCERNS'])
  source?: 'MANUAL' | 'BULK_NO_CONCERNS';
}

export class RemovedRenewContextQuestionDto {
  @ApiProperty()
  @IsString()
  questionRuleId!: string;

  @ApiProperty({ enum: CONTEXT_REMOVAL_REASONS.map((row) => row.id) })
  @IsIn(CONTEXT_REMOVAL_REASONS.map((row) => row.id))
  reasonCode!: ContextRemovalReasonId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reasonText?: string | null;
}

export class SaveRenewPatientSpecificInformationDto {
  @ApiPropertyOptional({ type: [SaveRenewContextAnswerItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveRenewContextAnswerItemDto)
  answers?: SaveRenewContextAnswerItemDto[];

  @ApiPropertyOptional({ type: [RemovedRenewContextQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemovedRenewContextQuestionDto)
  removedQuestions?: RemovedRenewContextQuestionDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restoreQuestionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  applyNoConcerns?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  undoBulkActionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ackBulkConfirm?: boolean;
}

export class RemovedRenewMonitoringItemDto {
  @ApiProperty()
  @IsString()
  inputCode!: string;

  @ApiProperty({ enum: MONITORING_REMOVAL_REASONS.map((row) => row.id) })
  @IsIn(MONITORING_REMOVAL_REASONS.map((row) => row.id))
  reasonCode!: MonitoringRemovalReasonId;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reasonText?: string | null;
}

export class SaveRenewMonitoringWorkspaceDto {
  @ApiPropertyOptional({ type: [RemovedRenewMonitoringItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RemovedRenewMonitoringItemDto)
  removedItems?: RemovedRenewMonitoringItemDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  restoreInputCodes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraInputCodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class ConfirmRenewExtractionDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedCodes?: string[];
}

export class PatchRenewPlanItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  medicationId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @ApiPropertyOptional({ enum: ['7_days', '14_days', '30_days', 'next_blister_cycle', 'custom'] })
  @IsOptional()
  @IsIn(['7_days', '14_days', '30_days', 'next_blister_cycle', 'custom'])
  durationId?: '7_days' | '14_days' | '30_days' | 'next_blister_cycle' | 'custom' | null;

  @ApiPropertyOptional()
  @IsOptional()
  customDurationDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  customDurationText?: string | null;

  @ApiPropertyOptional({ enum: ['DEFAULT', 'BULK', 'MANUAL'] })
  @IsOptional()
  @IsIn(['DEFAULT', 'BULK', 'MANUAL'])
  durationSource?: 'DEFAULT' | 'BULK' | 'MANUAL';
}

export class ApplyRenewPlanDurationDto {
  @ApiProperty({ enum: ['7_days', '14_days', '30_days', 'next_blister_cycle', 'custom'] })
  @IsIn(['7_days', '14_days', '30_days', 'next_blister_cycle', 'custom'])
  durationId!: '7_days' | '14_days' | '30_days' | 'next_blister_cycle' | 'custom';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  customDurationDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overwriteManual?: boolean;
}

export class UndoRenewPlanDurationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  bulkActionId!: string;
}

export class GenerateRenewDocumentsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsIn(['consultation_note', 'renewal_summary', 'patient_handout', 'prescriber_notification'], { each: true })
  kinds?: Array<
    'consultation_note' | 'renewal_summary' | 'patient_handout' | 'prescriber_notification'
  >;
}

export class SaveRenewPatientInfoDto {
  @ApiPropertyOptional({
    description: 'Skip patient details and generate documents without identity headers.',
  })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;

  @ApiProperty({ example: 'Taylor, Morgan', required: false })
  @ValidateIf((body: SaveRenewPatientInfoDto) => !body.skipped)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName!: string;

  @ApiProperty({ example: '1990-04-12', required: false })
  @ValidateIf((body: SaveRenewPatientInfoDto) => !body.skipped)
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  dateOfBirth!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phn?: string | null;
}

export class UpdateRenewDocumentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reviewed?: boolean;
}

export class AttestRenewDocumentationDto {
  @ApiProperty()
  @IsBoolean()
  attested!: boolean;
}

export class SaveRenewCommunicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  noAffectedProfessional?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'NOTIFICATION_ONLY',
    'FOLLOW_UP_REQUESTED',
    'CLARIFICATION_REQUESTED',
    'URGENT_CLINICAL_FOLLOW_UP',
  ])
  purpose?:
    | 'NOTIFICATION_ONLY'
    | 'FOLLOW_UP_REQUESTED'
    | 'CLARIFICATION_REQUESTED'
    | 'URGENT_CLINICAL_FOLLOW_UP';

  @ApiPropertyOptional()
  @IsOptional()
  recipient?: {
    recipientType:
      | 'ORIGINAL_PRESCRIBER'
      | 'PRIMARY_CARE_PRESCRIBER'
      | 'SPECIALIST'
      | 'NURSE_PRACTITIONER'
      | 'PHARMACIST'
      | 'OTHER_REGULATED_HEALTH_PROFESSIONAL';
    name?: string | null;
    profession?: string | null;
    clinicName?: string | null;
    fax?: string | null;
    phone?: string | null;
    secureMessageAddress?: string | null;
  } | null;
}

export class CompleteRenewCommunicationDto {
  @ApiProperty()
  @IsIn([
    'SECURE_FAX',
    'SECURE_ELECTRONIC_MESSAGE',
    'PHONE',
    'SHARED_HEALTH_RECORD',
    'HAND_DELIVERED',
    'OTHER',
  ])
  method!: 'SECURE_FAX' | 'SECURE_ELECTRONIC_MESSAGE' | 'PHONE' | 'SHARED_HEALTH_RECORD' | 'HAND_DELIVERED' | 'OTHER';

  @ApiProperty({ example: '2026-09-08T20:45:00.000Z' })
  @IsString()
  @MinLength(10)
  communicatedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  phoneSummary?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  recipient?: SaveRenewCommunicationDto['recipient'];
}

export class ValidateOptionalDobDto {
  @ApiProperty({ example: '2020-05-15' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  dob!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedPatientSnapshotVersion?: number;
}

export class ConfirmMatchingDobDto {
  @ApiProperty({ example: '1999-05-15' })
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  dob!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedPatientSnapshotVersion?: number;
}

export class ResolveAgeDobConflictDto {
  @ApiProperty({ enum: ['USE_DOB_RECHECK_AGE', 'KEEP_MANUAL_AGE_REMOVE_DOB'] })
  @IsIn(['USE_DOB_RECHECK_AGE', 'KEEP_MANUAL_AGE_REMOVE_DOB'])
  resolution!: 'USE_DOB_RECHECK_AGE' | 'KEEP_MANUAL_AGE_REMOVE_DOB';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  dob?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  expectedPatientSnapshotVersion?: number;
}


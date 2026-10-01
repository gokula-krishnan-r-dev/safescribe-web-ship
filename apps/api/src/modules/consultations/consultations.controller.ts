import {
  Controller, Get, Post, Patch, Put, Param, Body, Query, Delete,
  Req, Res, UseGuards, HttpCode, HttpStatus, UseInterceptors, UploadedFile, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/auth.decorator';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { Request, Response } from 'express';
import { ConsultationsService } from './consultations.service';
import { ClinicalExtractionService } from './clinical-extraction.service';
import { ClinicalAssessmentService } from './clinical-assessment.service';
import {
  CreateConsultationDto,
  SaveStepDto,
  UpdateTranscriptDto,
  SelectPathwayDto,
  SelectApproachDto,
  SaveClinicalImpressionDto,
  GenerateAssessmentSummaryDto,
  SavePrescribingReadinessDto,
  GenerateRationaleSectionDto,
  SaveTreatmentRationaleDto,
  ConsultationListQueryDto,
  ParseLabTextDto,
  SaveReferralOutcomeDto,
  CreateReferralLetterDto,
  DraftReferralReasonDto,
  UpdateReferralLetterDraftDto,
  ApproveReferralLetterDto,
  CompleteConsultationDto,
  GenerateDocumentationDto,
  TranslatePatientHandoutDto,
  ConfirmPathwayClinicalJudgementDto,
  SavePathwayClinicalJudgementDraftDto,
  SaveCjRedFlagAnswerDto,
  SaveCjRedFlagAttestationDto,
  ConfirmCjRedFlagCheckDto,
  QuickAddQueryDto,
  RecordQuickAddUsageDto,
  EvaluateTreatmentCandidateDto,
  SearchRenewConditionsDto,
  AddRenewConditionDto,
  SetRenewIndicationDto,
  PatchRenewConditionReviewDto,
  ApplyRenewStableAllDto,
  SaveRenewMonitoringResultDto,
  MarkRenewMonitoringUnavailableDto,
  SaveRenewMonitoringReviewDto,
  SaveRenewContextAnswerDto,
  SaveRenewPatientSpecificInformationDto,
  SaveRenewMonitoringWorkspaceDto,
  ConfirmRenewExtractionDto,
  PatchRenewPlanItemDto,
  ApplyRenewPlanDurationDto,
  UndoRenewPlanDurationDto,
  GenerateRenewDocumentsDto,
  SaveRenewPatientInfoDto,
  UpdateRenewDocumentDto,
  AttestRenewDocumentationDto,
  SaveRenewCommunicationDto,
  CompleteRenewCommunicationDto,
  ValidateOptionalDobDto,
  ConfirmMatchingDobDto,
  ResolveAgeDobConflictDto,
} from './dto/consultation.dto';
import { ClinicalJudgmentService } from './clinical-judgment.service';
import { ClinicalJudgmentRedFlagsService } from './clinical-judgment-red-flags.service';
import { BrandingService } from '@/modules/branding/branding.service';
import { TreatmentQuickAddService } from './treatment-quick-add.service';
import { TreatmentCandidateService } from './treatment-candidate.service';
import { AdjustedRegimenProductService } from './adjusted-regimen-product.service';
import { AdjustedProductCandidatesDto } from './dto/adjusted-regimen-product.dto';
import { PathwayClinicalJudgementService } from './pathway-clinical-judgement.service';
import { RenewTherapyReviewService } from './renew-therapy-review.service';
import { RenewMonitoringSafetyService } from './renew-monitoring-safety.service';
import { RenewDecisionService } from './renew-decision.service';
import { AdaptReferenceSelectorService } from './adapt-reference-selector.service';
import { AdaptDocumentationService } from './adapt-documentation.service';
import { AdaptIndicationService } from './adapt-indication.service';
import { AdaptSubstitutionAlternativesService } from './adapt-substitution-alternatives.service';
import { AdaptClinicalGuidanceService } from './adapt-clinical-guidance.service';
import { AdaptClinicalRationaleService } from './adapt-clinical-rationale.service';
import { AdaptCounsellingService } from './adapt-counselling.service';
import type { AdaptReferenceSelectorInput } from '@safescript/shared';

@ApiTags('Consultations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly service: ConsultationsService,
    private readonly clinicalJudgment: ClinicalJudgmentService,
    private readonly cjRedFlags: ClinicalJudgmentRedFlagsService,
    private readonly branding: BrandingService,
    private readonly quickAdd: TreatmentQuickAddService,
    private readonly treatmentCandidates: TreatmentCandidateService,
    private readonly adjustedRegimenProduct: AdjustedRegimenProductService,
    private readonly pathwayClinicalJudgement: PathwayClinicalJudgementService,
    private readonly renewTherapyReview: RenewTherapyReviewService,
    private readonly renewMonitoring: RenewMonitoringSafetyService,
    private readonly renewDecision: RenewDecisionService,
    private readonly clinicalExtraction: ClinicalExtractionService,
    private readonly clinicalAssessment: ClinicalAssessmentService,
    private readonly adaptReferenceSelector: AdaptReferenceSelectorService,
    private readonly adaptDocumentation: AdaptDocumentationService,
    private readonly adaptIndication: AdaptIndicationService,
    private readonly adaptSubstitutionAlternatives: AdaptSubstitutionAlternativesService,
    private readonly adaptClinicalGuidance: AdaptClinicalGuidanceService,
    private readonly adaptClinicalRationale: AdaptClinicalRationaleService,
    private readonly adaptCounselling: AdaptCounsellingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a new consultation' })
  create(@Body() dto: CreateConsultationDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.create(dto, user, req);
  }

  @Post('workspace')
  @ApiOperation({
    summary:
      'Start a new consultation for this module, or reuse an unused blank draft. Never resumes in-progress work.',
  })
  ensureWorkspace(
    @Body() dto: CreateConsultationDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.ensureWorkspace(dto, user, req);
  }

  @Get()
  @ApiOperation({ summary: 'List consultations' })
  list(@Query() query: ConsultationListQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Get('active')
  @ApiOperation({ summary: 'List active consultations (work-queue sidebar projection)' })
  listActive(
    @CurrentUser() user: RequestUser,
    @Query('module') module?: string,
  ) {
    const resolved =
      module === 'renew' ? 'renew' : 'prescribe';
    return this.service.listActive(user, resolved);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get consultation with full data' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.findOne(id, user);
  }

  @Get(':id/branding/signature')
  @ApiOperation({ summary: 'Stream the consulting pharmacist signature for Step 6 PDFs' })
  streamPharmacistSignature(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.branding.streamConsultationSignature(id, user, res);
  }

  @Get(':id/branding/logo')
  @ApiOperation({ summary: 'Stream the pharmacy logo for Step 6 prescription PDFs' })
  streamPharmacyLogo(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.branding.streamConsultationLogo(id, user, res);
  }

  @Patch(':id/step')
  @ApiOperation({ summary: 'Auto-save a consultation step' })
  saveStep(@Param('id') id: string, @Body() dto: SaveStepDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.saveStep(id, dto, user, req);
  }

  @Post(':id/patient/validate-optional-dob')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an optional Documentation DOB against the recorded intake age without committing' })
  validateOptionalDob(
    @Param('id') id: string,
    @Body() dto: ValidateOptionalDobDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.validateOptionalDob(id, dto, user);
  }

  @Post(':id/patient/confirm-matching-dob')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Commit a Documentation DOB that matches the recorded intake age' })
  confirmMatchingDob(
    @Param('id') id: string,
    @Body() dto: ConfirmMatchingDobDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.confirmMatchingDob(id, dto, user, req);
  }

  @Post(':id/patient/resolve-age-dob-conflict')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a Documentation DOB vs intake-age conflict' })
  resolveAgeDobConflict(
    @Param('id') id: string,
    @Body() dto: ResolveAgeDobConflictDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.resolveAgeDobConflict(id, dto, user, req);
  }

  @Get(':id/pathway-clinical-judgement')
  @ApiOperation({ summary: 'Evaluate Diagnosis Confirmation / Treatment Eligibility clinical judgement' })
  getPathwayClinicalJudgement(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.pathwayClinicalJudgement.getEvaluation(id, user);
  }

  @Put(':id/pathway-clinical-judgement')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save a clinical-judgement draft without confirming' })
  savePathwayClinicalJudgementDraft(
    @Param('id') id: string,
    @Body() dto: SavePathwayClinicalJudgementDraftDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.pathwayClinicalJudgement.saveDraft(id, dto, user, req);
  }

  @Post(':id/pathway-clinical-judgement/draft-rationale')
  @ApiOperation({ summary: 'Draft a clinical-judgement rationale from captured assessment facts' })
  draftPathwayClinicalJudgementRationale(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.pathwayClinicalJudgement.draftRationale(id, user, req);
  }

  @Post(':id/pathway-clinical-judgement/confirm')
  @ApiOperation({ summary: 'Confirm clinical judgement and allow Safety Screening' })
  confirmPathwayClinicalJudgement(
    @Param('id') id: string,
    @Body() dto: ConfirmPathwayClinicalJudgementDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.pathwayClinicalJudgement.confirm(id, dto, user, req);
  }

  @Post(':id/pathway-clinical-judgement/no-treatment')
  @ApiOperation({ summary: 'Document without treatment after unsupported assessment' })
  documentWithoutTreatment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.pathwayClinicalJudgement.documentWithoutTreatment(id, user, req);
  }

  @Patch(':id/transcript')
  updateTranscript(@Param('id') id: string, @Body() dto: UpdateTranscriptDto, @CurrentUser() user: RequestUser) {
    return this.service.updateTranscript(id, dto, user);
  }

  @Patch(':id/pathway')
  selectPathway(@Param('id') id: string, @Body() dto: SelectPathwayDto, @CurrentUser() user: RequestUser) {
    return this.service.selectPathway(id, dto, user);
  }

  @Put(':id/approach')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select Guided Pathway or Clinical Judgment approach' })
  selectApproach(
    @Param('id') id: string,
    @Body() dto: SelectApproachDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.selectApproach(id, dto, user, req);
  }

  @Get(':id/clinical-judgment/impression')
  @ApiOperation({ summary: 'Get Clinical Judgment clinical impression' })
  getClinicalImpression(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.clinicalJudgment.getImpression(id, user);
  }

  @Put(':id/clinical-judgment/impression')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save or confirm Clinical Judgment clinical impression' })
  saveClinicalImpression(
    @Param('id') id: string,
    @Body() dto: SaveClinicalImpressionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.saveImpression(id, dto, user, req);
  }

  @Post(':id/clinical-judgment/impression/generate-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Draft assessment summary for Clinical Judgment' })
  generateAssessmentSummary(
    @Param('id') id: string,
    @Body() dto: GenerateAssessmentSummaryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.generateAssessmentSummary(id, user, req, dto);
  }

  @Get(':id/clinical-judgment/readiness')
  @ApiOperation({ summary: 'Get prescribing readiness page model (Clinical Judgment)' })
  getPrescribingReadiness(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.clinicalJudgment.getReadiness(id, user);
  }

  @Put(':id/clinical-judgment/readiness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm prescribing readiness (or route to referral / obtain info)' })
  savePrescribingReadiness(
    @Param('id') id: string,
    @Body() dto: SavePrescribingReadinessDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.saveReadiness(id, dto, user, req);
  }

  @Get(':id/clinical-judgment/red-flags')
  @ApiOperation({ summary: 'Get current Clinical Judgment red-flag check' })
  getCjRedFlags(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.cjRedFlags.getCurrent(id, user);
  }

  @Post(':id/clinical-judgment/red-flags/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate red-flag questions (Clinical Judgment only)' })
  generateCjRedFlags(
    @Param('id') id: string,
    @Body()
    body: {
      reason?: string;
      reasonDetail?: string | null;
      expectedConsultationRowVersion?: number;
      forceManualFallback?: boolean;
    },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.cjRedFlags.generate(id, body ?? {}, user, req);
  }

  @Put(':id/clinical-judgment/red-flags/:checkId/questions/:questionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save an answer to a CJ red-flag question' })
  saveCjRedFlagAnswer(
    @Param('id') id: string,
    @Param('checkId') checkId: string,
    @Param('questionId') questionId: string,
    @Body() body: SaveCjRedFlagAnswerDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.cjRedFlags.saveAnswer(id, checkId, questionId, body, user, req);
  }

  @Put(':id/clinical-judgment/red-flags/:checkId/attestation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save final unresolved-concern attestation' })
  saveCjRedFlagAttestation(
    @Param('id') id: string,
    @Param('checkId') checkId: string,
    @Body() body: SaveCjRedFlagAttestationDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.cjRedFlags.saveAttestation(id, checkId, body, user, req);
  }

  @Post(':id/clinical-judgment/red-flags/:checkId/concerns')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a pharmacist-entered red-flag concern' })
  addCjRedFlagConcern(
    @Param('id') id: string,
    @Param('checkId') checkId: string,
    @Body()
    body: {
      concernText: string;
      whyItMatters?: string | null;
      responseStatus?: string;
      referralAction?: string | null;
    },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.cjRedFlags.addConcern(id, checkId, body, user, req);
  }

  @Post(':id/clinical-judgment/red-flags/:checkId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm CJ red-flag check and route to readiness or referral' })
  confirmCjRedFlags(
    @Param('id') id: string,
    @Param('checkId') checkId: string,
    @Body() body: ConfirmCjRedFlagCheckDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.cjRedFlags.confirm(id, checkId, body, user, req);
  }

  @Get(':id/rationale')
  @ApiOperation({ summary: 'Get treatment rationale (Clinical Judgment)' })
  getRationale(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.clinicalJudgment.getRationale(id, user);
  }

  @Put(':id/rationale')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save treatment rationale draft' })
  saveRationale(
    @Param('id') id: string,
    @Body() dto: SaveTreatmentRationaleDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.saveRationale(id, dto, user, req);
  }

  @Post(':id/rationale/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate draft for a rationale section' })
  generateRationale(
    @Param('id') id: string,
    @Body() dto: GenerateRationaleSectionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.generateRationaleSection(id, dto, user, req);
  }

  @Post(':id/rationale/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm treatment rationale and advance to documents' })
  confirmRationale(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalJudgment.confirmRationale(id, user, req);
  }

  @Get(':id/finalization-readiness')
  @ApiOperation({ summary: 'Check whether consultation can be finalized' })
  finalizationReadiness(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.clinicalJudgment.getFinalizationReadiness(id, user);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.submit(id, user, req);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Complete consultation after documentation confirmation — permanently deletes temporary consultation data',
  })
  completeConsultation(
    @Param('id') id: string,
    @Body() dto: CompleteConsultationDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.completeConsultation(id, dto, user, req);
  }

  @Put(':id/referral-outcome')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save or complete a structured referral outcome from Safety screening',
  })
  saveReferralOutcome(
    @Param('id') id: string,
    @Body() dto: SaveReferralOutcomeDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.saveReferralOutcome(id, dto, user, req);
  }

  @Post(':id/referral-letter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a draft referral letter (does not mark referral as sent)',
  })
  createReferralLetter(
    @Param('id') id: string,
    @Body() dto: CreateReferralLetterDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.createReferralLetter(id, dto, user, req);
  }

  @Post(':id/referral/reason-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Draft a provider-facing reason for referral from confirmed screening and consultation facts',
  })
  draftReferralReason(
    @Param('id') id: string,
    @Body() dto: DraftReferralReasonDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.draftReferralReason(id, dto, user);
  }

  @Patch(':id/referral-letter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Persist pharmacist edits to the referral letter draft',
  })
  updateReferralLetterDraft(
    @Param('id') id: string,
    @Body() dto: UpdateReferralLetterDraftDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.updateReferralLetterDraft(id, dto, user, req);
  }

  @Post(':id/referral-letter/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve the current referral letter version (required before Document & complete)',
  })
  approveReferralLetter(
    @Param('id') id: string,
    @Body() dto: ApproveReferralLetterDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.approveReferralLetter(id, dto, user, req);
  }

  @Post(':id/ai/extract-clinical-note')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Extract a concise clinically relevant consultation note from intake text or a temporary transcript',
  })
  extractClinicalNote(
    @Param('id') id: string,
    @Body()
    body: {
      transcript?: string;
      presentingConcern?: string;
      captureMode?: 'type' | 'dictation' | 'conversation' | null;
      rewriteNote?: boolean;
    },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalExtraction.extract(id, user, body, req);
  }

  @Post(':id/consultation-note/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve the reviewed consultation note, delete temporary transcript/audio, and unlock Clinical Assessment',
  })
  approveConsultationNote(
    @Param('id') id: string,
    @Body()
    body: {
      presentingConcern?: string;
      transcript?: string;
      captureMode?: 'type' | 'dictation' | 'conversation' | null;
    },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalExtraction.approve(id, user, body, req);
  }

  @Post(':id/clinical-assessment/match')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Match pharmacist-authored clinical assessment text to at most one approved pathway',
  })
  matchClinicalAssessment(
    @Param('id') id: string,
    @Body() body: { assessmentText?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalAssessment.match(id, user, body, req);
  }

  @Post(':id/clinical-assessment/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Persist the pharmacist-selected Step 2 route and pathway version snapshot' })
  confirmClinicalAssessment(
    @Param('id') id: string,
    @Body()
    body: {
      assessmentText?: string;
      matchedPathwayId?: string | null;
      route: 'structured_pathway' | 'clinical_judgment';
    },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalAssessment.confirm(id, user, body, req);
  }

  @Post(':id/clinical-assessment/events')
  @HttpCode(HttpStatus.OK)
  recordClinicalAssessmentEvent(
    @Param('id') id: string,
    @Body() body: { event: string; pathwayId?: string; pathwayVersion?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalAssessment.recordEvent(id, user, body, req);
  }

  @Get(':id/pathways/:pathwayId/evidence')
  @ApiOperation({ summary: 'Version-specific pathway evidence, reviewers, references, and history' })
  pathwayEvidence(
    @Param('id') id: string,
    @Param('pathwayId') pathwayId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.clinicalAssessment.evidence(id, pathwayId, user, req);
  }

  @Post(':id/ai/analyze-transcript')
  @HttpCode(HttpStatus.OK)
  analyzeTranscript(
    @Param('id') id: string,
    @Body() body: { transcript?: string; chiefComplaint?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.analyzeTranscript(id, user, body);
  }

  @Post(':id/ai/recommend-pathways')
  @HttpCode(HttpStatus.OK)
  recommendPathways(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.recommendPathways(id, user);
  }

  @Post(':id/ai/answer-questions')
  @HttpCode(HttpStatus.OK)
  answerQuestions(
    @Param('id') id: string,
    @Body() body: { forceRefresh?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.answerQuestions(id, user, body);
  }

  @Post(':id/ai/screen-red-flags')
  @HttpCode(HttpStatus.OK)
  screenRedFlags(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.screenRedFlags(id, user);
  }

  @Post(':id/ai/assess-eligibility')
  @HttpCode(HttpStatus.OK)
  assessEligibility(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.assessEligibility(id, user);
  }

  @Post(':id/ai/recommend-treatment')
  @HttpCode(HttpStatus.OK)
  recommendTreatment(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.recommendTreatment(id, user);
  }

  @Post(':id/treatment-plan/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm the selected treatment plan and unlock counselling generation',
  })
  confirmTreatmentPlan(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      selectedIndexes: number[];
      selectedTreatments: Array<Record<string, unknown>>;
      expectedPlanVersion?: number;
      idempotencyKey?: string;
    },
  ) {
    return this.service.confirmTreatmentPlan(id, user, body);
  }

  @Post(':id/ai/generate-counselling')
  @HttpCode(HttpStatus.OK)
  generateCounselling(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body()
    body?: {
      treatmentPlan?: Record<string, unknown>;
      selectedTreatments?: unknown[];
      confirmationId?: string;
      mode?: 'fast' | 'ai';
      draft?: Record<string, unknown>;
    },
  ) {
    return this.service.generateCounselling(id, user, body);
  }

  @Post(':id/ai/generate-documentation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate Prescribe documentation. Prescription and Patient Care Summary are deterministic; DAP and PCP are drafted concurrently and reused when the clinical source hash is unchanged.',
  })
  generateDocumentation(
    @Param('id') id: string,
    @Body() dto: GenerateDocumentationDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.generateDocumentation(id, user, req, dto ?? {});
  }

  @Post(':id/patient-handout/translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Translate the pharmacist-confirmed Patient Care Summary. Server loads confirmed source; client sends only target_language.',
  })
  translatePatientHandout(
    @Param('id') id: string,
    @Body() dto: TranslatePatientHandoutDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.translatePatientHandout(id, dto.targetLanguage, user, req);
  }

  @Post(':id/check-allergy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check medications against patient allergies using rule engine' })
  checkAllergy(
    @Param('id') id: string,
    @Body() body: { medications: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.checkConsultationAllergies(id, user, body.medications ?? []);
  }

  @Get(':id/treatment-safety')
  @ApiOperation({
    summary:
      'Treatment safety profile for a selected medicine (Safety Engine patient CDS + pathway context)',
  })
  treatmentSafety(
    @Param('id') id: string,
    @Query('medicationName') medicationName: string,
    @Query('genericName') genericName: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getTreatmentSafety(id, user, { medicationName, genericName });
  }

  @Get(':id/treatments/quick-add')
  @ApiOperation({
    summary: 'Ranked medication shortcuts for the Add treatment picker (identity only)',
  })
  getTreatmentQuickAdd(
    @Param('id') id: string,
    @Query() query: QuickAddQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.quickAdd.getQuickAdd(id, user, query.source ?? 'frequent', query.limit);
  }

  @Post(':id/treatments/quick-add/usage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a completed manual medication addition for Quick add ranking',
  })
  recordTreatmentQuickAddUsage(
    @Param('id') id: string,
    @Body() dto: RecordQuickAddUsageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.quickAdd.recordUsage(id, user, dto);
  }

  @Post(':id/treatment-candidates/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Normalize, duplicate-check, and safety-evaluate a Search / Quick add medication candidate',
  })
  evaluateTreatmentCandidate(
    @Param('id') id: string,
    @Body() dto: EvaluateTreatmentCandidateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.treatmentCandidates.evaluate(id, user, dto);
  }

  @Post(':id/treatments/:treatmentKey/adjusted-product-candidates')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Search medication products compatible with the active renal-adjusted regimen',
  })
  getAdjustedProductCandidates(
    @Param('id') id: string,
    @Param('treatmentKey') treatmentKey: string,
    @Body() dto: AdjustedProductCandidatesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adjustedRegimenProduct.getCandidates(id, user, {
      treatmentKey: dto.treatmentKey?.trim() || treatmentKey,
      query: dto.query,
      recommendationId: dto.recommendationId,
    });
  }

  @Post(':id/extract-lab-values')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract laboratory values from uploaded lab report image or PDF' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  extractLabValues(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Please upload a file');
    return this.service.extractLabValues(id, user, file);
  }

  @Post(':id/renew/extract-medications')
  @Post(':id/adapt/extract-medications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract medications from pharmacy screenshots or a document' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 8 },
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 },
      },
    ),
  )
  extractRenewMedications(
    @Param('id') id: string,
    @UploadedFiles()
    uploaded: { files?: Express.Multer.File[]; file?: Express.Multer.File[] },
    @CurrentUser() user: RequestUser,
    @Query('sourceType') sourceType?: string,
    @Body('note') note?: string,
  ) {
    const files = [...(uploaded?.files ?? []), ...(uploaded?.file ?? [])];
    if (!files.length) throw new BadRequestException('Please upload at least one file');
    const resolved =
      sourceType === 'screenshot' ? 'screenshot' : 'pharmacy_document';
    return this.service.extractRenewMedications(
      id,
      user,
      files,
      resolved,
      typeof note === 'string' ? note : undefined,
    );
  }

  @Post(':id/adapt/reference-selection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select approved SafeScribe supporting references for Adapt Step 3B' })
  async selectAdaptReferences(
    @Param('id') id: string,
    @Body() input: AdaptReferenceSelectorInput,
    @CurrentUser() user: RequestUser,
  ) {
    await this.service.findOne(id, user);
    return this.adaptReferenceSelector.selectReferences(id, input);
  }

  @Post(':id/adapt/step4/documents/refine-dap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Refine Adapt Pharmacist Consultation Note (DAP) with the Adapt Document Session prompt. Falls back to deterministic Nest draft when AI is unavailable or invalid.',
  })
  refineAdaptDapNote(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.adaptDocumentation.refineDapNote(id, user);
  }

  @Post(':id/adapt/step4/documents/refine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Refine Adapt DAP, PCP, and/or Patient Handout with Adapt Document Session prompts. Falls back to deterministic Nest drafts when AI is unavailable or invalid.',
  })
  refineAdaptClinicalDocuments(
    @Param('id') id: string,
    @Body()
    body: {
      kinds?: Array<
        'consultation_note' | 'prescriber_communication' | 'patient_care_summary'
      >;
    },
    @CurrentUser() user: RequestUser,
  ) {
    const kinds =
      Array.isArray(body?.kinds) && body.kinds.length > 0
        ? body.kinds
        : ([
            'consultation_note',
            'prescriber_communication',
            'patient_care_summary',
          ] as const);
    return this.adaptDocumentation.refineClinicalDocuments(id, user, [...kinds]);
  }

  @Get(':id/adapt/indication')
  @ApiOperation({
    summary:
      'Resolve approved indication candidates and patient-based suggestions for Adapt Step 1',
  })
  resolveAdaptIndication(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('suggest') suggest?: string,
    @Query('medicationId') medicationId?: string,
    @Query('medicationText') medicationText?: string,
    @Query('genericName') genericName?: string,
    @Query('brandName') brandName?: string,
    @Query('medicationConceptId') medicationConceptId?: string,
  ) {
    return this.adaptIndication.resolve(id, user, {
      suggest: suggest !== 'false',
      medicationHint: {
        medicationId,
        medicationText,
        genericName,
        brandName,
        medicationConceptId,
      },
    });
  }

  @Get(':id/adapt/indication/conditions/search')
  @ApiOperation({ summary: 'Search the approved condition library for Adapt indication selection' })
  searchAdaptIndicationConditions(
    @Param('id') id: string,
    @Query() query: SearchRenewConditionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptIndication.searchConditions(id, user, query.q ?? '');
  }

  @Post(':id/adapt/indication/manual-candidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record a consultation-level medication_indication_candidate for a SNOMED selection not in the approved repository',
  })
  recordAdaptIndicationManualCandidate(
    @Param('id') id: string,
    @Body()
    body: { snomedConceptId: string; displayName: string; medicationId: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptIndication.recordManualCandidate(id, user, body);
  }

  @Post(':id/adapt/substitution-alternatives')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI evidence-linked therapeutic substitution alternatives for Adapt Step 3A',
  })
  suggestAdaptSubstitutionAlternatives(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptSubstitutionAlternatives.suggest(id, user);
  }

  @Post(':id/adapt/clinical-guidance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI patient- and case-specific clinical guidance for Adapt Step 3A sidebar',
  })
  generateAdaptClinicalGuidance(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptClinicalGuidance.generate(id, user);
  }

  @Post(':id/adapt/clinical-rationale')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI clinical rationale draft for Adapt Step 3A (patient history + proposed change)',
  })
  generateAdaptClinicalRationale(
    @Param('id') id: string,
    @Body() body: { proposedPrescription?: Record<string, unknown> },
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptClinicalRationale.generate(
      id,
      user,
      (body?.proposedPrescription as never) ?? null,
    );
  }

  @Post(':id/adapt/counselling')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI counselling Cards 2–4 for Adapt (What to expect, Self-care, Follow-up). Card 1 is deterministic from SIG.',
  })
  generateAdaptCounselling(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adaptCounselling.generate(id, user);
  }

  @Get(':id/renew/therapy-review')
  @ApiOperation({ summary: 'Load Renew Step 2 therapy review mappings' })
  getRenewTherapyReview(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewTherapyReview.getTherapyReview(id, user);
  }

  @Post(':id/renew/therapy-review/suggest-mappings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rank unresolved indications and suggested conditions' })
  suggestRenewMappings(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewTherapyReview.suggestMappings(id, user);
  }

  @Get(':id/condition-catalog/search')
  @ApiOperation({
    summary:
      'Search the approved indication/condition master table (common list when q is empty)',
  })
  searchConditionCatalog(
    @Param('id') id: string,
    @Query() query: SearchRenewConditionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.searchConditionCatalog(id, user, query.q ?? '');
  }

  @Get(':id/renew/conditions/search')
  @ApiOperation({ summary: 'Search the approved Renew condition library' })
  searchRenewConditions(
    @Param('id') id: string,
    @Query() query: SearchRenewConditionsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.searchConditions(id, user, query.q ?? '');
  }

  @Post(':id/renew/conditions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a condition card to this renewal' })
  addRenewCondition(
    @Param('id') id: string,
    @Body() dto: AddRenewConditionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.addCondition(id, user, dto);
  }

  @Patch(':id/renew/medications/:medId/indication')
  @ApiOperation({ summary: 'Set or change a medication indication' })
  setRenewIndication(
    @Param('id') id: string,
    @Param('medId') medId: string,
    @Body() dto: SetRenewIndicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.setMedicationIndication(id, user, medId, dto);
  }

  @Patch(':id/renew/condition-reviews/:reviewId')
  @ApiOperation({ summary: 'Update a condition-level therapy review' })
  patchRenewConditionReview(
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: PatchRenewConditionReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.patchConditionReview(id, user, reviewId, dto);
  }

  @Post(':id/renew/therapy-review/apply-stable-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply stable Yes/Yes/No answers to unanswered therapy-review fields' })
  applyRenewStableAll(
    @Param('id') id: string,
    @Body() dto: ApplyRenewStableAllDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewTherapyReview.applyStableAll(id, user, dto?.skipReviewIds ?? []);
  }

  @Post(':id/renew/therapy-review/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm Step 2 therapy review and continue' })
  completeRenewTherapyReview(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewTherapyReview.complete(id, user);
  }

  @Get(':id/renew/step3')
  @ApiOperation({ summary: 'Resolve Renew Step 3 monitoring and safety requirements' })
  getRenewStep3(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewMonitoring.getStep3(id, user);
  }

  @Put(':id/renew/step3/monitoring/:inputCode')
  @ApiOperation({ summary: 'Save a pharmacist-confirmed monitoring result' })
  saveRenewMonitoring(
    @Param('id') id: string,
    @Param('inputCode') inputCode: string,
    @Body() dto: SaveRenewMonitoringResultDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.saveMonitoringResult(id, user, inputCode, dto);
  }

  @Post(':id/renew/step3/monitoring/:inputCode/unavailable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a monitoring item as not available' })
  markRenewMonitoringUnavailable(
    @Param('id') id: string,
    @Param('inputCode') inputCode: string,
    @Body() dto: MarkRenewMonitoringUnavailableDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.markUnavailable(id, user, inputCode, dto.note);
  }

  @Put(':id/renew/step3/monitoring/:inputCode/review')
  @ApiOperation({ summary: 'Save the pharmacist action for a monitoring finding' })
  saveRenewMonitoringReview(
    @Param('id') id: string,
    @Param('inputCode') inputCode: string,
    @Body() dto: SaveRenewMonitoringReviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.saveMonitoringReview(id, user, inputCode, dto);
  }

  @Put(':id/renew/step3/context/:inputCode')
  @ApiOperation({ summary: 'Save a patient-context answer' })
  saveRenewContext(
    @Param('id') id: string,
    @Param('inputCode') inputCode: string,
    @Body() dto: SaveRenewContextAnswerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.saveContextAnswer(id, user, inputCode, dto);
  }

  @Put(':id/renew/step3/patient-specific-information')
  @ApiOperation({ summary: 'Save patient-specific information (bulk, remove, restore, confirm)' })
  saveRenewPatientSpecificInformation(
    @Param('id') id: string,
    @Body() dto: SaveRenewPatientSpecificInformationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.savePatientSpecificInformation(id, user, dto);
  }

  @Put(':id/renew/step3/monitoring-workspace')
  @ApiOperation({ summary: 'Remove, restore, add-other, or confirm Accordion 2 monitoring' })
  saveRenewMonitoringWorkspace(
    @Param('id') id: string,
    @Body() dto: SaveRenewMonitoringWorkspaceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.saveMonitoringWorkspace(id, user, dto);
  }

  @Post(':id/renew/step3/extractions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract monitoring values from pasted screenshots or an uploaded file' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 8 },
        { name: 'file', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 20 * 1024 * 1024 },
      },
    ),
  )
  extractRenewMonitoring(
    @Param('id') id: string,
    @UploadedFiles()
    uploaded: { files?: Express.Multer.File[]; file?: Express.Multer.File[] },
    @CurrentUser() user: RequestUser,
    @Query('sourceType') sourceType?: string,
    @Body('note') note?: string,
  ) {
    const files = [...(uploaded?.files ?? []), ...(uploaded?.file ?? [])];
    if (!files.length) throw new BadRequestException('Please upload at least one file');
    const resolved = sourceType === 'screenshot' ? 'PASTED_SCREENSHOT' : 'UPLOADED_DOCUMENT';
    return this.renewMonitoring.extractResults(
      id,
      user,
      files,
      resolved,
      typeof note === 'string' ? note : undefined,
    );
  }

  @Post(':id/renew/step3/extractions/:extractionId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm extracted monitoring candidates' })
  confirmRenewExtraction(
    @Param('id') id: string,
    @Param('extractionId') extractionId: string,
    @Body() dto: ConfirmRenewExtractionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.confirmExtraction(id, user, extractionId, dto.selectedCodes);
  }

  @Post(':id/renew/step3/extractions/:extractionId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discard an extracted monitoring batch' })
  rejectRenewExtraction(
    @Param('id') id: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewMonitoring.rejectExtraction(id, user, extractionId);
  }

  @Post(':id/renew/step3/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm Step 3 monitoring & safety and continue' })
  completeRenewStep3(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewMonitoring.complete(id, user);
  }

  @Get(':id/renew/step4')
  @ApiOperation({ summary: 'Load Renew Step 4 renewal plan and documentation' })
  getRenewStep4(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewDecision.getStep4(id, user);
  }

  @Patch(':id/renew/step4/plan')
  @ApiOperation({ summary: 'Update a medication row on the renewal plan' })
  patchRenewPlan(
    @Param('id') id: string,
    @Body() dto: PatchRenewPlanItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.patchPlan(id, user, dto);
  }

  @Post(':id/renew/step4/plan/renew-all-eligible')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select all eligible medications for renewal' })
  renewAllEligible(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewDecision.renewAllEligible(id, user);
  }

  @Post(':id/renew/step4/plan/apply-duration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a duration to selected renewal medications where eligible' })
  applyRenewPlanDuration(
    @Param('id') id: string,
    @Body() dto: ApplyRenewPlanDurationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.applyDuration(id, user, dto);
  }

  @Post(':id/renew/step4/plan/undo-duration')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo the last bulk duration apply where still owned by that action' })
  undoRenewPlanDuration(
    @Param('id') id: string,
    @Body() dto: UndoRenewPlanDurationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.undoDuration(id, user, dto.bulkActionId);
  }

  @Post(':id/renew/step4/plan/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the renewal plan' })
  confirmRenewPlan(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewDecision.confirmPlan(id, user);
  }

  @Post(':id/renew/step4/plan/unconfirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-open a confirmed renewal plan for editing' })
  unconfirmRenewPlan(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.renewDecision.unconfirmPlan(id, user);
  }

  @Post(':id/renew/step4/patient-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save patient identity and generate required renewal documents' })
  saveRenewPatientInfo(
    @Param('id') id: string,
    @Body() dto: SaveRenewPatientInfoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.savePatientInfo(id, user, dto);
  }

  @Post(':id/renew/step4/documents/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate renewal documentation from the confirmed plan' })
  generateRenewDocuments(
    @Param('id') id: string,
    @Body() dto: GenerateRenewDocumentsDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.generateDocuments(id, user, dto.kinds);
  }

  @Patch(':id/renew/step4/documents/:kind')
  @ApiOperation({ summary: 'Edit generated renewal documentation' })
  updateRenewDocument(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body() dto: UpdateRenewDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (
      kind !== 'consultation_note' &&
      kind !== 'renewal_summary' &&
      kind !== 'patient_handout' &&
      kind !== 'prescriber_notification'
    ) {
      throw new BadRequestException('Unknown document type.');
    }
    const documentKind = kind;
    return this.renewDecision.updateDocument(id, user, documentKind, {
      body: dto.body,
      reviewed: dto.reviewed,
    });
  }

  @Post(':id/renew/step4/documents/patient_handout/translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Translate the Renew patient handout. Server loads the confirmed English source; client sends only target language.',
  })
  translateRenewPatientHandout(
    @Param('id') id: string,
    @Body() dto: TranslatePatientHandoutDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.translatePatientHandout(id, user, dto.targetLanguage);
  }

  @Post(':id/renew/step4/attest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record pharmacist professional-judgment attestation' })
  attestRenewDocumentation(
    @Param('id') id: string,
    @Body() dto: AttestRenewDocumentationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.attest(id, user, dto.attested);
  }

  @Patch(':id/renew/step4/communication')
  @ApiOperation({ summary: 'Save prescriber communication recipient or no-affected-professional confirmation' })
  saveRenewCommunication(
    @Param('id') id: string,
    @Body() dto: SaveRenewCommunicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.saveCommunication(id, user, {
      noAffectedProfessional: dto.noAffectedProfessional,
      purpose: dto.purpose,
      recipient: dto.recipient
        ? {
            recipientType: dto.recipient.recipientType,
            name: dto.recipient.name?.trim() || null,
            profession: dto.recipient.profession?.trim() || null,
            clinicName: dto.recipient.clinicName?.trim() || null,
            fax: dto.recipient.fax?.trim() || null,
            phone: dto.recipient.phone?.trim() || null,
            secureMessageAddress: dto.recipient.secureMessageAddress?.trim() || null,
          }
        : dto.recipient,
    });
  }

  @Post(':id/renew/step4/communication/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark required prescriber communication as completed' })
  completeRenewCommunication(
    @Param('id') id: string,
    @Body() dto: CompleteRenewCommunicationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.renewDecision.markCommunicationComplete(id, user, {
      method: dto.method,
      communicatedAt: dto.communicatedAt,
      note: dto.note,
      phoneSummary: dto.phoneSummary,
      recipient: dto.recipient
        ? {
            recipientType: dto.recipient.recipientType,
            name: dto.recipient.name?.trim() || null,
            profession: dto.recipient.profession?.trim() || null,
            clinicName: dto.recipient.clinicName?.trim() || null,
            fax: dto.recipient.fax?.trim() || null,
            phone: dto.recipient.phone?.trim() || null,
            secureMessageAddress: dto.recipient.secureMessageAddress?.trim() || null,
          }
        : dto.recipient,
    });
  }

  @Post(':id/parse-lab-text')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Parse laboratory values from pasted or typed text',
  })
  parseLabText(
    @Param('id') id: string,
    @Body() dto: ParseLabTextDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.parseLabText(id, user, dto.text);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload optional clinical photos (max 5 total, JPG/PNG/WebP)' })
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: RequestUser,
  ) {
    if (!files?.length) throw new BadRequestException('Please select at least one image');
    return this.service.uploadAttachments(id, user, files);
  }

  @Get(':id/attachments/:attachmentId/file')
  @ApiOperation({ summary: 'Download / preview a clinical photo (authenticated)' })
  streamAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.service.streamAttachment(id, attachmentId, user, res);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a clinical photo attachment' })
  deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.deleteAttachment(id, attachmentId, user);
  }
}

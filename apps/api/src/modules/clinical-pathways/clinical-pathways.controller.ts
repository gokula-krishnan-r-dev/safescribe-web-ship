import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseInterceptors,
  UseGuards,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess } from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { Request, Response } from 'express';
import { ClinicalFileValidator } from './validators/clinical-file.validator';
import { ClinicalPathwaysService } from './clinical-pathways.service';
import {
  CreatePathwayDto,
  UpdatePathwayDto,
  UpdatePathwayStatusDto,
  PublishPathwayDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateRuleDto,
  UpdateRuleDto,
  CreateTreatmentDto,
  UpdateTreatmentSectionEvidenceDto,
  ReorderTreatmentsDto,
  ReorderQuestionsDto,
  BulkQuestionIdsDto,
  ReorderCounsellingDto,
  BulkTreatmentIdsDto,
  BulkCounsellingIdsDto,
  CreateCounsellingDto,
  UpdateCounsellingDto,
  ListPathwaysQueryDto,
  RegenerateDto,
  ImportQuestionScriptDto,
  ImportChatGptScriptDto,
  UpdateRedFlagsDto,
  UpdateDifferentialsDto,
  ConfirmDocumentRolesDto,
  UpdateConceptDto,
  MergeConceptsDto,
  RegenerateFromConceptsDto,
  CreateEvidenceReferenceDto,
  LinkEvidenceFromLibraryDto,
  UpdateEvidenceReferenceDto,
  UpdatePresentationReviewSectionDto,
  ReplaceEvidenceMappingsDto,
  UpdatePathwayGovernanceDto,
  CreatePathwayReviewerDto,
  LinkReviewerFromLibraryDto,
  UpdatePathwayReviewerDto,
  PreviewReferencesImportDto,
  CommitReferencesImportDto,
  PreviewPresentationReviewImportDto,
  CommitPresentationReviewImportDto,
  PreviewRedFlagsImportDto,
  CommitRedFlagsImportDto,
  PreviewDifferentialsImportDto,
  CommitDifferentialsImportDto,
  PreviewTreatmentsImportDto,
  CommitTreatmentsImportDto,
} from './dto/clinical-pathways.dto';

@ApiTags('Clinical Pathways')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('clinical-pathways')
export class ClinicalPathwaysController {
  constructor(private readonly service: ClinicalPathwaysService) {}

  // ─── Pathway CRUD ─────────────────────────────────────────────────────────────

  @Get()
  
  @ApiOperation({ summary: 'List all clinical pathways' })
  list(@Query() query: ListPathwaysQueryDto, @CurrentUser() user: any) {
    return this.service.listPathways(query, user);
  }

  @Get('stats')
  
  @ApiOperation({ summary: 'Get pathway statistics' })
  stats(@CurrentUser() user: any) {
    return this.service.getStats(user);
  }

  @Get(':id')
  
  @ApiOperation({ summary: 'Get a single pathway with full details' })
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getPathway(id, user);
  }

  @Post()
  
  @ApiOperation({ summary: 'Create a new clinical pathway' })
  create(@Body() dto: CreatePathwayDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.createPathway(dto, user, req);
  }

  @Patch(':id')
  
  @ApiOperation({ summary: 'Update pathway metadata' })
  update(@Param('id') id: string, @Body() dto: UpdatePathwayDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.updatePathway(id, dto, user, req);
  }

  @Get(':id/presentation-review')
  @ApiOperation({ summary: 'Pharmacist/admin Presentation Review payload with linked evidence' })
  getPresentationReview(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getPresentationReview(id, user);
  }

  @Patch(':id/presentation-review')
  @ApiOperation({ summary: 'Update Presentation Review section-level evidence links' })
  updatePresentationReviewSection(
    @Param('id') id: string,
    @Body() dto: UpdatePresentationReviewSectionDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updatePresentationReviewSection(id, dto, user, req);
  }

  @Post(':id/evidence-references')
  @ApiOperation({ summary: 'Add a citation to the pathway References & Governance library' })
  createEvidenceReference(
    @Param('id') id: string,
    @Body() dto: CreateEvidenceReferenceDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createEvidenceReference(id, dto, user, req);
  }

  @Post(':id/evidence-references/link-from-library')
  @ApiOperation({ summary: 'Link a master library citation onto this pathway' })
  linkEvidenceFromLibrary(
    @Param('id') id: string,
    @Body() dto: LinkEvidenceFromLibraryDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.linkEvidenceFromLibrary(id, dto, user, req);
  }

  @Post(':id/evidence-references/import-chatgpt/preview')
  @ApiOperation({ summary: 'Preview ChatGPT reference library import (dedupe + review)' })
  previewReferencesImport(
    @Param('id') id: string,
    @Body() dto: PreviewReferencesImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.previewReferencesImport(id, dto, user, req);
  }

  @Post(':id/evidence-references/import-chatgpt/commit')
  @ApiOperation({ summary: 'Commit ChatGPT reference library import after admin review' })
  commitReferencesImport(
    @Param('id') id: string,
    @Body() dto: CommitReferencesImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.commitReferencesImport(id, dto, user, req);
  }

  @Post(':id/evidence-references/:referenceId/duplicate')
  @ApiOperation({ summary: 'Duplicate a library citation' })
  duplicateEvidenceReference(
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.duplicateEvidenceReference(id, referenceId, user, req);
  }

  @Patch(':id/evidence-references/:referenceId')
  @ApiOperation({ summary: 'Update a library citation' })
  updateEvidenceReference(
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @Body() dto: UpdateEvidenceReferenceDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateEvidenceReference(id, referenceId, dto, user, req);
  }

  @Post(':id/evidence-references/:referenceId/archive')
  @ApiOperation({ summary: 'Archive a library citation' })
  archiveEvidenceReference(
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.archiveEvidenceReference(id, referenceId, user, req);
  }

  @Delete(':id/evidence-references/:referenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a library citation and unlink it from pathway content' })
  deleteEvidenceReference(
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteEvidenceReference(id, referenceId, user, req);
  }

  @Put(':id/evidence-references/:referenceId/mappings')
  @ApiOperation({ summary: 'Replace evidence mappings for a library citation' })
  replaceEvidenceMappings(
    @Param('id') id: string,
    @Param('referenceId') referenceId: string,
    @Body() dto: ReplaceEvidenceMappingsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.replaceEvidenceMappings(id, referenceId, dto, user, req);
  }

  @Patch(':id/governance')
  @ApiOperation({ summary: 'Update pathway References & Governance summary' })
  updatePathwayGovernance(
    @Param('id') id: string,
    @Body() dto: UpdatePathwayGovernanceDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updatePathwayGovernance(id, dto, user, req);
  }

  @Get(':id/publishing-readiness')
  @ApiOperation({ summary: 'Calculated publishing readiness for References & Governance' })
  getPublishingReadiness(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getPublishingReadiness(id, user);
  }

  @Post(':id/reviewers')
  @ApiOperation({ summary: 'Add an internal or external pathway reviewer' })
  createPathwayReviewer(
    @Param('id') id: string,
    @Body() dto: CreatePathwayReviewerDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createPathwayReviewer(id, dto, user, req);
  }

  @Post(':id/reviewers/link-from-library')
  @ApiOperation({ summary: 'Link a master reviewer onto this pathway' })
  linkReviewerFromLibrary(
    @Param('id') id: string,
    @Body() dto: LinkReviewerFromLibraryDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.linkReviewerFromLibrary(id, dto, user, req);
  }

  @Patch(':id/reviewers/:reviewerId')
  @ApiOperation({ summary: 'Update a pathway reviewer' })
  updatePathwayReviewer(
    @Param('id') id: string,
    @Param('reviewerId') reviewerId: string,
    @Body() dto: UpdatePathwayReviewerDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updatePathwayReviewer(id, reviewerId, dto, user, req);
  }

  @Delete(':id/reviewers/:reviewerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a pathway reviewer (does not erase published history)' })
  deletePathwayReviewer(
    @Param('id') id: string,
    @Param('reviewerId') reviewerId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deletePathwayReviewer(id, reviewerId, user, req);
  }

  @Post(':id/generate-routing-suggestions')
  @ApiOperation({
    summary: 'Generate draft Pathway Matching terms (admin review required before save)',
  })
  generateRoutingSuggestions(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.generateRoutingSuggestions(id, user, req);
  }

  @Patch(':id/status')
  
  @ApiOperation({ summary: 'Update pathway status (approve, reject, suspend, etc.)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePathwayStatusDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateStatus(id, dto, user, req);
  }

  @Post(':id/publish')
  
  @ApiOperation({ summary: 'Publish a pathway (creates version snapshot)' })
  publish(@Param('id') id: string, @Body() dto: PublishPathwayDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.publishPathway(id, dto, user, req);
  }

  @Post(':id/regenerate')
  
  @ApiOperation({ summary: 'Regenerate pathway content' })
  regenerate(@Param('id') id: string, @Body() dto: RegenerateDto, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.regeneratePathway(id, dto, user, req);
  }

  @Delete(':id')
  
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a pathway' })
  delete(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.deletePathway(id, user, req);
  }

  // ─── Document Upload ──────────────────────────────────────────────────────────

  @Post(':id/upload')
  @ApiOperation({ summary: 'Upload one or more clinical guideline documents (PDF, DOCX, DOC, TXT)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadDocuments(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Please upload at least one file');
    }

    const validator = new ClinicalFileValidator(20);
    const invalid = files.filter((f) => !validator.isValid(f));
    if (invalid.length) {
      throw new BadRequestException(
        `These files are not supported: ${invalid.map((f) => f.originalname).join(', ')}. ${validator.buildErrorMessage()}`,
      );
    }

    return this.service.processUploadedDocuments(id, files, user);
  }

  // ─── Staged authoring pipeline ───────────────────────────────────────────────

  @Post(':id/documents/confirm-roles')
  @ApiOperation({ summary: 'Confirm Primary / Supporting / Reference document roles' })
  confirmDocumentRoles(
    @Param('id') id: string,
    @Body() dto: ConfirmDocumentRolesDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.confirmDocumentRoles(id, dto, user, req);
  }

  @Post(':id/extract-concepts')
  @ApiOperation({ summary: 'Extract + normalize clinical concepts, then generate pathway' })
  extractConcepts(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.startConceptExtraction(id, user, req);
  }

  @Post(':id/regenerate-from-concepts')
  @ApiOperation({ summary: 'Regenerate pathway from stored clinical concepts (no PDF re-read)' })
  regenerateFromConcepts(
    @Param('id') id: string,
    @Body() dto: RegenerateFromConceptsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.regenerateFromConcepts(id, dto, user, req);
  }

  @Post(':id/clinical-review/approve')
  @ApiOperation({ summary: 'Clinical admin approval required before publish' })
  approveClinicalReview(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.approveClinicalReview(id, user, req);
  }

  @Patch(':id/concepts/:conceptId')
  @ApiOperation({ summary: 'Update a clinical concept' })
  updateConcept(
    @Param('id') id: string,
    @Param('conceptId') conceptId: string,
    @Body() dto: UpdateConceptDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateConcept(id, conceptId, dto, user, req);
  }

  @Delete(':id/concepts/:conceptId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a clinical concept' })
  deleteConcept(
    @Param('id') id: string,
    @Param('conceptId') conceptId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteConcept(id, conceptId, user, req);
  }

  @Post(':id/concepts/curate')
  @ApiOperation({
    summary: 'Keep the most important clinical concepts (max 20) and remove the rest',
  })
  curateConcepts(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.curateConcepts(id, user, req);
  }

  @Post(':id/concepts/merge')
  @ApiOperation({ summary: 'Merge clinical concepts into one canonical concept' })
  mergeConcepts(
    @Param('id') id: string,
    @Body() dto: MergeConceptsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.mergeConcepts(id, dto, user, req);
  }

  @Post(':id/import-chatgpt')
  @ApiOperation({
    summary: 'Import pathway content from a ChatGPT script (any authoring tab)',
  })
  importChatGptScript(
    @Param('id') id: string,
    @Body() dto: ImportChatGptScriptDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.importChatGptScript(id, dto, user, req);
  }

  @Post(':id/presentation-review/import-chatgpt/preview')
  @ApiOperation({ summary: 'Preview Presentation Review ChatGPT import (questions + evidence)' })
  previewPresentationReviewImport(
    @Param('id') id: string,
    @Body() dto: PreviewPresentationReviewImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.previewPresentationReviewImport(id, dto, user, req);
  }

  @Post(':id/presentation-review/import-chatgpt/commit')
  @ApiOperation({ summary: 'Commit Presentation Review ChatGPT import after preview' })
  commitPresentationReviewImport(
    @Param('id') id: string,
    @Body() dto: CommitPresentationReviewImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.commitPresentationReviewImport(id, dto, user, req);
  }

  @Post(':id/red-flags/import-chatgpt/preview')
  @ApiOperation({ summary: 'Preview Red Flags ChatGPT import (criteria + evidence)' })
  previewRedFlagsImport(
    @Param('id') id: string,
    @Body() dto: PreviewRedFlagsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.previewRedFlagsImport(id, dto, user, req);
  }

  @Post(':id/red-flags/import-chatgpt/commit')
  @ApiOperation({ summary: 'Commit Red Flags ChatGPT import after preview' })
  commitRedFlagsImport(
    @Param('id') id: string,
    @Body() dto: CommitRedFlagsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.commitRedFlagsImport(id, dto, user, req);
  }

  @Post(':id/differentials/import-chatgpt/preview')
  @ApiOperation({ summary: 'Preview Differential Review ChatGPT import (conditions + evidence)' })
  previewDifferentialsImport(
    @Param('id') id: string,
    @Body() dto: PreviewDifferentialsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.previewDifferentialsImport(id, dto, user, req);
  }

  @Post(':id/differentials/import-chatgpt/commit')
  @ApiOperation({ summary: 'Commit Differential Review ChatGPT import after preview' })
  commitDifferentialsImport(
    @Param('id') id: string,
    @Body() dto: CommitDifferentialsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.commitDifferentialsImport(id, dto, user, req);
  }

  @Post(':id/treatments/import-chatgpt/preview')
  @ApiOperation({ summary: 'Preview Treatment Options ChatGPT import (treatments + evidence)' })
  previewTreatmentsImport(
    @Param('id') id: string,
    @Body() dto: PreviewTreatmentsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.previewTreatmentsImport(id, dto, user, req);
  }

  @Post(':id/treatments/import-chatgpt/commit')
  @ApiOperation({ summary: 'Commit Treatment Options ChatGPT import after preview' })
  commitTreatmentsImport(
    @Param('id') id: string,
    @Body() dto: CommitTreatmentsImportDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.commitTreatmentsImport(id, dto, user, req);
  }

  // ─── Questions ────────────────────────────────────────────────────────────────

  @Post(':id/questions/import-script')
  @ApiOperation({
    summary: 'Import assessment questions from a ChatGPT / admin script (paste or .txt/.md)',
  })
  importQuestionScript(
    @Param('id') id: string,
    @Body() dto: ImportQuestionScriptDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.importQuestionScript(id, dto, user, req);
  }

  @Post(':id/questions')
  
  @ApiOperation({ summary: 'Add a manual question to a pathway' })
  createQuestion(
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createQuestion(id, dto, user, req);
  }

  @Patch(':id/questions/:questionId')
  
  @ApiOperation({ summary: 'Update a question (edit, approve, reject)' })
  updateQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateQuestion(id, questionId, dto, user, req);
  }

  @Delete(':id/questions/:questionId')
  
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a question' })
  deleteQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteQuestion(id, questionId, user, req);
  }

  @Post(':id/questions/approve-all')
  
  @ApiOperation({ summary: 'Approve all questions in a pathway' })
  approveAllQuestions(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.approveAllQuestions(id, user, req);
  }

  @Put(':id/questions/reorder')
  @ApiOperation({ summary: 'Reorder assessment questions within a pathway' })
  reorderQuestions(
    @Param('id') id: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reorderQuestions(id, dto.orderedIds ?? [], user);
  }

  @Post(':id/questions/bulk-approve')
  @ApiOperation({ summary: 'Approve selected assessment questions' })
  bulkApproveQuestions(
    @Param('id') id: string,
    @Body() dto: BulkQuestionIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkApproveQuestions(id, dto.ids ?? [], user, req);
  }

  @Post(':id/questions/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete selected assessment questions' })
  bulkDeleteQuestions(
    @Param('id') id: string,
    @Body() dto: BulkQuestionIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkDeleteQuestions(id, dto.ids ?? [], user, req);
  }

  // ─── Red Flags ────────────────────────────────────────────────────────────────

  @Put(':id/red-flags')
  @ApiOperation({ summary: 'Replace the pathway red flag list' })
  updateRedFlags(
    @Param('id') id: string,
    @Body() dto: UpdateRedFlagsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateRedFlags(id, dto, user, req);
  }

  // ─── Differential Diagnoses ─────────────────────────────────────────────────────

  @Put(':id/differentials')
  @ApiOperation({ summary: 'Replace the pathway differential diagnosis list' })
  updateDifferentials(
    @Param('id') id: string,
    @Body() dto: UpdateDifferentialsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateDifferentials(id, dto, user, req);
  }

  // ─── Rules ────────────────────────────────────────────────────────────────────

  @Post(':id/rules')
  
  @ApiOperation({ summary: 'Add a clinical rule' })
  createRule(
    @Param('id') id: string,
    @Body() dto: CreateRuleDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createRule(id, dto, user, req);
  }

  @Patch(':id/rules/:ruleId')
  
  @ApiOperation({ summary: 'Update a clinical rule' })
  updateRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateRule(id, ruleId, dto, user, req);
  }

  @Delete(':id/rules/:ruleId')
  
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a clinical rule' })
  deleteRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteRule(id, ruleId, user, req);
  }

  // ─── Treatments ───────────────────────────────────────────────────────────────

  @Get(':id/treatments/import/template')
  @ApiOperation({ summary: 'Download pathway treatment Excel import template (with warning reasons)' })
  downloadTreatmentImportTemplate(@Res() res: Response) {
    const buffer = this.service.getTreatmentImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="pathway-treatments-template.xlsx"',
    );
    res.send(buffer);
  }

  @Post(':id/treatments/import/preview')
  @ApiOperation({ summary: 'Preview / validate pathway treatment Excel or CSV import' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  previewTreatmentImport(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Please upload a .xlsx, .xls, or .csv file');
    }
    return this.service.previewTreatmentImport(id, file, user);
  }

  @Post(':id/treatments/import')
  @ApiOperation({ summary: 'Import pathway treatments from Excel or CSV (includes warning reasons)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  importTreatments(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Please upload a .xlsx, .xls, or .csv file');
    }
    return this.service.importTreatmentsFromExcel(id, file, user, req);
  }

  @Post(':id/treatments')
  
  @ApiOperation({ summary: 'Add a treatment option' })
  createTreatment(
    @Param('id') id: string,
    @Body() dto: CreateTreatmentDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createTreatment(id, dto, user, req);
  }

  @Patch(':id/treatments/:treatmentId')
  @ApiOperation({ summary: 'Update a treatment option' })
  updateTreatment(
    @Param('id') id: string,
    @Param('treatmentId') treatmentId: string,
    @Body() dto: Partial<CreateTreatmentDto>,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateTreatment(id, treatmentId, dto, user, req);
  }

  @Put(':id/treatments/reorder')
  @ApiOperation({ summary: 'Reorder treatment options within a pathway' })
  reorderTreatments(
    @Param('id') id: string,
    @Body() dto: ReorderTreatmentsDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reorderTreatments(id, dto.orderedIds ?? [], user);
  }

  @Put(':id/treatments/section-evidence')
  @ApiOperation({ summary: 'Update section-level evidence for treatment options' })
  updateTreatmentSectionEvidence(
    @Param('id') id: string,
    @Body() dto: UpdateTreatmentSectionEvidenceDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updateTreatmentSectionEvidence(id, dto, user, req);
  }

  @Post(':id/treatments/bulk-approve')
  @ApiOperation({ summary: 'Approve selected treatment options' })
  bulkApproveTreatments(
    @Param('id') id: string,
    @Body() dto: BulkTreatmentIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkApproveTreatments(id, dto.ids ?? [], user, req);
  }

  @Post(':id/treatments/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete selected treatment options' })
  bulkDeleteTreatments(
    @Param('id') id: string,
    @Body() dto: BulkTreatmentIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkDeleteTreatments(id, dto.ids ?? [], user, req);
  }

  @Post(':id/treatments/:treatmentId/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a treatment option (soft-disable)' })
  archiveTreatment(
    @Param('id') id: string,
    @Param('treatmentId') treatmentId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.archiveTreatment(id, treatmentId, user, true);
  }

  @Post(':id/treatments/:treatmentId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived treatment option' })
  restoreTreatment(
    @Param('id') id: string,
    @Param('treatmentId') treatmentId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.archiveTreatment(id, treatmentId, user, false);
  }

  @Delete(':id/treatments/:treatmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a treatment option' })
  deleteTreatment(
    @Param('id') id: string,
    @Param('treatmentId') treatmentId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteTreatment(id, treatmentId, user, req);
  }

  // ─── Counselling ──────────────────────────────────────────────────────────────

  @Post(':id/counselling')
  
  @ApiOperation({ summary: 'Add a counselling point' })
  createCounselling(
    @Param('id') id: string,
    @Body() dto: CreateCounsellingDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.createCounselling(id, dto, user, req);
  }

  @Patch(':id/counselling/:itemId')
  @ApiOperation({ summary: 'Update a patient guidance item' })
  updateCounselling(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCounsellingDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateCounselling(id, itemId, dto, user);
  }

  @Post(':id/counselling/:itemId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived patient guidance item' })
  restoreCounselling(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.restoreCounselling(id, itemId, user);
  }

  @Delete(':id/counselling/:itemId')
  
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a counselling point' })
  deleteCounselling(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.deleteCounselling(id, itemId, user, req);
  }

  @Put(':id/counselling/reorder')
  @ApiOperation({ summary: 'Reorder patient education points within a pathway' })
  reorderCounselling(
    @Param('id') id: string,
    @Body() dto: ReorderCounsellingDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reorderCounselling(id, dto.orderedIds ?? [], user, dto.outputSection);
  }

  @Post(':id/counselling/bulk-approve')
  @ApiOperation({ summary: 'Approve selected patient guidance items' })
  bulkApproveCounselling(
    @Param('id') id: string,
    @Body() dto: BulkCounsellingIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkApproveCounselling(id, dto.ids ?? [], user, req);
  }

  @Post(':id/counselling/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete or archive selected patient guidance items' })
  bulkDeleteCounselling(
    @Param('id') id: string,
    @Body() dto: BulkCounsellingIdsDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.bulkDeleteCounselling(id, dto.ids ?? [], user, req);
  }
}

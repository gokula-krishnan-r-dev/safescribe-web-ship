import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLES } from '@safescript/shared';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  Roles,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { ClinicalReferenceService } from './clinical-reference.service';
import {
  ClinicalReferenceListQueryDto,
  PatchPediatricPolicyDto,
  PatchReferenceSourceDto,
  PatchReferenceValueDto,
  PatchTreatmentTargetDto,
  PublishReferenceReleaseDto,
} from './clinical-reference.dto';

@ApiTags('Clinical Reference & Target Values (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('admin/clinical-references')
export class ClinicalReferenceController {
  constructor(private readonly service: ClinicalReferenceService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Published release, draft counts, and repository totals' })
  summary() {
    return this.service.summary();
  }

  @Get('values')
  listValues(@Query() query: ClinicalReferenceListQueryDto) {
    return this.service.listValues(query);
  }

  @Get('values/:id')
  getValue(@Param('id') id: string) {
    return this.service.getValue(id);
  }

  @Post('values/:id/draft')
  @HttpCode(HttpStatus.OK)
  createValueDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.createDraft('value', id, user);
  }

  @Patch('values/:id')
  patchValue(
    @Param('id') id: string,
    @Body() dto: PatchReferenceValueDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patchValue(id, dto, user);
  }

  @Delete('values/:id')
  deleteValue(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteDraft('value', id, user);
  }

  @Post('values/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  submitValue(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submitForReview('value', id, user);
  }

  @Post('values/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveValue(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve('value', id, user);
  }

  @Post('values/:id/return-draft')
  @HttpCode(HttpStatus.OK)
  returnValue(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.returnToDraft('value', id, user);
  }

  @Get('targets')
  listTargets(@Query() query: ClinicalReferenceListQueryDto) {
    return this.service.listTargets(query);
  }

  @Get('targets/:id')
  getTarget(@Param('id') id: string) {
    return this.service.getTarget(id);
  }

  @Post('targets/:id/draft')
  @HttpCode(HttpStatus.OK)
  createTargetDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.createDraft('target', id, user);
  }

  @Patch('targets/:id')
  patchTarget(
    @Param('id') id: string,
    @Body() dto: PatchTreatmentTargetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patchTarget(id, dto, user);
  }

  @Delete('targets/:id')
  deleteTarget(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteDraft('target', id, user);
  }

  @Post('targets/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  submitTarget(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submitForReview('target', id, user);
  }

  @Post('targets/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveTarget(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve('target', id, user);
  }

  @Post('targets/:id/return-draft')
  @HttpCode(HttpStatus.OK)
  returnTarget(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.returnToDraft('target', id, user);
  }

  @Get('pediatric')
  listPediatric(@Query() query: ClinicalReferenceListQueryDto) {
    return this.service.listPediatric(query);
  }

  @Get('pediatric/:id')
  getPediatric(@Param('id') id: string) {
    return this.service.getPediatric(id);
  }

  @Post('pediatric/:id/draft')
  @HttpCode(HttpStatus.OK)
  createPediatricDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.createDraft('pediatric', id, user);
  }

  @Patch('pediatric/:id')
  patchPediatric(
    @Param('id') id: string,
    @Body() dto: PatchPediatricPolicyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patchPediatric(id, dto, user);
  }

  @Delete('pediatric/:id')
  deletePediatric(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteDraft('pediatric', id, user);
  }

  @Post('pediatric/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  submitPediatric(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submitForReview('pediatric', id, user);
  }

  @Post('pediatric/:id/approve')
  @HttpCode(HttpStatus.OK)
  approvePediatric(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve('pediatric', id, user);
  }

  @Post('pediatric/:id/return-draft')
  @HttpCode(HttpStatus.OK)
  returnPediatric(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.returnToDraft('pediatric', id, user);
  }

  @Get('sources')
  listSources(@Query() query: ClinicalReferenceListQueryDto) {
    return this.service.listSources(query);
  }

  @Get('sources/:id')
  getSource(@Param('id') id: string) {
    return this.service.getSource(id);
  }

  @Post('sources/:id/draft')
  @HttpCode(HttpStatus.OK)
  createSourceDraft(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.createDraft('source', id, user);
  }

  @Patch('sources/:id')
  patchSource(
    @Param('id') id: string,
    @Body() dto: PatchReferenceSourceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.patchSource(id, dto, user);
  }

  @Delete('sources/:id')
  deleteSource(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteDraft('source', id, user);
  }

  @Post('sources/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  submitSource(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.submitForReview('source', id, user);
  }

  @Post('sources/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveSource(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.approve('source', id, user);
  }

  @Post('sources/:id/return-draft')
  @HttpCode(HttpStatus.OK)
  returnSource(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.returnToDraft('source', id, user);
  }

  @Get('releases')
  listReleases() {
    return this.service.listReleases();
  }

  @Get('by-input/:inputCode')
  lookup(@Param('inputCode') inputCode: string) {
    return this.service.lookupByInputCode(inputCode);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export the currently published reference pack' })
  exportPack() {
    return this.service.exportPack();
  }

  @Post('import-pack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Import the governed Reference Values Master. First load publishes; later imports create drafts only.',
  })
  importPack(@CurrentUser() user: RequestUser) {
    return this.service.importPack(user);
  }

  @Post('releases/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish approved in-review records into an immutable release' })
  publish(
    @CurrentUser() user: RequestUser,
    @Body() dto: PublishReferenceReleaseDto,
  ) {
    return this.service.publishRelease(user, dto.notes, dto.releaseId);
  }
}

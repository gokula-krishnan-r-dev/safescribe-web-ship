import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response, Request } from 'express';
import { ROLES } from '@safescript/shared';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { ClinicalRepositoryService } from './clinical-repository.service';
import { ClinicalRepositoryTestRunner } from './tests/repository-test-runner';
import { TerminologySnapshotService } from '@/modules/terminology/snapshot/terminology-snapshot.service';
import { ClinicalRepositoryPublicationService } from './governance/publication.service';

const IMPORT_FILE_LIMITS = {
  storage: memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
} as const;

const DEFAULT_SNAPSHOT_QUERIES = [
  'amoxicillin',
  'clavulanic acid',
  'amoxicillin clavulanate',
  'cefadroxil',
  'propranolol',
  'metformin',
  'spironolactone',
  'ibuprofen',
  'naproxen',
  'diclofenac',
  'codeine',
  'sildenafil',
  'nitroglycerin',
  'isosorbide',
  'warfarin',
  'methotrexate',
  'lisinopril',
  'simvastatin',
  'ciprofloxacin',
  'trimethoprim',
];

@ApiTags('Clinical Repository (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('admin/clinical-repository')
export class ClinicalRepositoryController {
  constructor(
    private readonly service: ClinicalRepositoryService,
    private readonly testRunner: ClinicalRepositoryTestRunner,
    private readonly terminology: TerminologySnapshotService,
    private readonly publication: ClinicalRepositoryPublicationService,
  ) {}

  @Get('workbooks')
  @ApiOperation({ summary: 'List registered 12-file workbook contracts' })
  listWorkbooks() {
    return this.service.listWorkbooks();
  }

  @Post('imports')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload clinical repository XLSX (fingerprint + validate + stage). Does not publish.',
  })
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_LIMITS))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Query('jurisdiction') jurisdiction?: string,
    @Query('targetReleaseId') targetReleaseId?: string,
  ) {
    if (!file) throw new BadRequestException('File required');
    return this.service.uploadAndValidate(file, user, req, {
      jurisdiction,
      targetReleaseId,
    });
  }

  @Get('imports')
  listImports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listImportBatches({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      status,
    });
  }

  @Get('imports/:batchId')
  getImport(@Param('batchId') batchId: string) {
    return this.service.getImportBatch(batchId);
  }

  @Post('imports/:batchId/promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Promote a zero-error import batch to DRAFT repository records (transactional)',
  })
  promote(
    @Param('batchId') batchId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.promote(batchId, user, req);
  }

  @Get('imports/:batchId/issues.csv')
  async exportIssues(@Param('batchId') batchId: string, @Res() res: Response) {
    const csv = await this.service.exportIssuesCsv(batchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="import-issues-${batchId}.csv"`,
    );
    res.send(csv);
  }

  @Get('value-sets')
  listValueSets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listValueSets({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('value-sets/:id')
  getValueSet(@Param('id') id: string) {
    return this.service.getValueSet(id);
  }

  @Get('evidence')
  listEvidence(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listEvidence({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('test-cases')
  listTestCases(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('domain') domain?: string,
  ) {
    return this.service.listTestCases({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      domain,
    });
  }

  @Get('test-inputs')
  listTestInputs(
    @Query('bundleKey') bundleKey?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listTestInputs({
      bundleKey,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
  }

  @Post('test-runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute repository test suite against the production evaluator' })
  runTests(@Query('suiteVersion') suiteVersion?: string) {
    return this.testRunner.runAll({ suiteVersion });
  }

  @Get('releases/preflight')
  preflight() {
    return this.publication.preflight();
  }

  @Get('releases')
  @ApiOperation({ summary: 'List Safety Engine knowledge release history' })
  listReleases(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.publication.listReleases({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Post('releases/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish approved draft release after preflight + required tests pass',
  })
  publish(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Body() body?: { releaseNotes?: string },
  ) {
    return this.publication.publish(user, req, body?.releaseNotes);
  }

  @Post('releases/:releaseId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore (rollback) active pointer to an immutable prior knowledge release',
  })
  restoreRelease(
    @Param('releaseId') releaseId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.publication.restoreRelease(releaseId, user, req, body?.reason);
  }

  @Get('terminology/active')
  @ApiOperation({ summary: 'Active terminology release + concept counts' })
  async activeTerminology() {
    return this.terminology.getActiveReleaseSummary();
  }

  @Get('terminology/concepts')
  @ApiOperation({ summary: 'Paginated concepts in the active terminology release' })
  listTerminologyConcepts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('conceptType') conceptType?: string,
  ) {
    return this.terminology.listConcepts({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      conceptType,
    });
  }

  @Get('terminology/releases')
  @ApiOperation({ summary: 'Terminology release / sync history' })
  listTerminologyReleases(@Query('limit') limit?: string) {
    return this.terminology.listReleases(limit ? Number(limit) : 20);
  }

  @Post('terminology/snapshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resync / snapshot medication concepts from CCDD into local terminology release',
  })
  snapshotTerminology(
    @CurrentUser() user: RequestUser,
    @Body() body: { queries?: string[] },
  ) {
    const queries = body?.queries?.length
      ? body.queries.map((q) => ({ query: q }))
      : DEFAULT_SNAPSHOT_QUERIES.map((q) => ({ query: q }));
    return this.terminology.snapshotConcepts(queries, user.id);
  }

  @Get('renew-workflow/counts')
  @ApiOperation({ summary: 'Counts for Renew workflow-configuration datasets' })
  renewWorkflowCounts() {
    return this.service.renewWorkflowCounts();
  }

  @Get('renew-workflow/:dataset')
  @ApiOperation({ summary: 'List published Renew workflow configuration rows' })
  listRenewWorkflow(
    @Param('dataset') dataset: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    if (!['indications', 'monitoring', 'inputs', 'questions'].includes(dataset)) {
      throw new BadRequestException('Unknown Renew workflow dataset');
    }
    return this.service.listRenewWorkflow({
      dataset: dataset as 'indications' | 'monitoring' | 'inputs' | 'questions',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('terminology/medications/search')
  searchLocalMeds(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.terminology.searchLocal(q ?? '', limit ? Number(limit) : 20);
  }
}

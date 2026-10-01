import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response, Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ROLES } from '@safescript/shared';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import {
  BulkDeleteSafetyRulesDto,
  BulkUpdateSafetyRulesDto,
  ApproveAllDraftRulesDto,
  CreateSafetyRuleDto,
  EvaluateMedicationSafetyDto,
  ListSafetyRulesQueryDto,
  SafetyOverrideDto,
  UpdateSafetyRuleDto,
} from './dto/medication-safety.dto';
import { MedicationSafetyService } from './medication-safety.service';
import { MedicationSafetyReleaseService } from './medication-safety-release.service';

const IMPORT_FILE_LIMITS = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
} as const;

const MAX_BATCH_FILES = 6;

@ApiTags('Medication Safety (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('admin/medication-safety')
export class MedicationSafetyAdminController {
  constructor(
    private readonly service: MedicationSafetyService,
    private readonly releaseService: MedicationSafetyReleaseService,
  ) {}

  @Get('rules')
  listRules(@Query() query: ListSafetyRulesQueryDto) {
    return this.service.listRules({
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
      search: query.search,
      ruleType: query.ruleType,
      status: query.status,
      jurisdiction: query.jurisdiction,
    });
  }

  @Get('rules/:id')
  getRule(@Param('id') id: string) {
    return this.service.getRule(id);
  }

  @Post('rules')
  createRule(
    @Body() dto: CreateSafetyRuleDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.createRule(dto, user, req);
  }

  @Patch('rules/:id/versions/:versionId')
  updateVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateSafetyRuleDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.updateDraftVersion(id, versionId, dto, user, req);
  }

  @Post('rules/:id/versions/:versionId/approve')
  @HttpCode(HttpStatus.OK)
  approveVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.approveVersion(id, versionId, user, req);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.deleteRule(id, user, req);
  }

  @Post('rules/bulk-update')
  @HttpCode(HttpStatus.OK)
  bulkUpdate(
    @Body() dto: BulkUpdateSafetyRulesDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.bulkUpdate(dto.ids, dto, user, req);
  }

  @Post('rules/approve-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve all draft safety rules',
    description:
      'Marks every DRAFT rule version as APPROVED (optionally filtered by rule type / search). Does not publish a release.',
  })
  approveAllDrafts(
    @Body() dto: ApproveAllDraftRulesDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.approveAllDrafts(
      { ruleType: dto.ruleType, search: dto.search },
      user,
      req,
    );
  }

  @Post('rules/bulk-delete')
  @HttpCode(HttpStatus.OK)
  bulkDelete(
    @Body() dto: BulkDeleteSafetyRulesDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.bulkDelete(dto.ids, user, req);
  }

  @Post('import/preview')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Preview / validate a single safety import file' })
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_LIMITS))
  importPreview(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File required');
    return this.service.importPreview(file.buffer, file.originalname);
  }

  @Post('import/commit')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Commit a single safety import file' })
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_LIMITS))
  importCommit(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('File required');
    return this.service.importCommit(file.buffer, file.originalname, user, req);
  }

  @Post('import/preview-batch')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Preview / validate up to 6 safety import files at once',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_BATCH_FILES, {
      ...IMPORT_FILE_LIMITS,
      limits: { ...IMPORT_FILE_LIMITS.limits, files: MAX_BATCH_FILES },
    }),
  )
  importPreviewBatch(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException('Upload 1–6 .csv / .xlsx / .xls files');
    }
    if (files.length > MAX_BATCH_FILES) {
      throw new BadRequestException(`Maximum ${MAX_BATCH_FILES} files per import`);
    }
    return this.service.importPreviewBatch(files);
  }

  @Post('import/commit-batch')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import up to 6 safety files at once (valid files commit; invalid are reported)',
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_BATCH_FILES, {
      ...IMPORT_FILE_LIMITS,
      limits: { ...IMPORT_FILE_LIMITS.limits, files: MAX_BATCH_FILES },
    }),
  )
  importCommitBatch(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!files?.length) {
      throw new BadRequestException('Upload 1–6 .csv / .xlsx / .xls files');
    }
    if (files.length > MAX_BATCH_FILES) {
      throw new BadRequestException(`Maximum ${MAX_BATCH_FILES} files per import`);
    }
    return this.service.importCommitBatch(files, user, req);
  }

  @Get('drug-classes')
  listDrugClasses(@Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string) {
    return this.service.listDrugClasses({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get('drugs')
  listDrugs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('className') className?: string,
  ) {
    return this.service.listDrugCatalog({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      className,
    });
  }

  @Get('import/template')
  @ApiOperation({ summary: 'Download safety rules import template (Excel)' })
  downloadTemplate(@Res() res: Response) {
    const buffer = this.service.getImportTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="safety-rules-template.xlsx"');
    res.send(buffer);
  }

  @Get('releases/current')
  getCurrentRelease() {
    return this.releaseService.getCurrent();
  }

  @Get('releases')
  @ApiOperation({ summary: 'List immutable Safety Engine knowledge releases (newest first)' })
  listReleases(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.releaseService.list({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Post('releases/publish')
  @HttpCode(HttpStatus.OK)
  publishRelease(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Body() body?: { releaseNotes?: string },
  ) {
    return this.releaseService.publish(user, req, {
      releaseNotes: body?.releaseNotes,
    });
  }

  @Post('releases/:releaseId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Restore (rollback) the active Safety Engine pointer to an immutable prior release',
  })
  restoreRelease(
    @Param('releaseId') releaseId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.releaseService.restore(releaseId, user, req, {
      reason: body?.reason,
    });
  }
}

@ApiTags('Medication Safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('medication-safety')
export class MedicationSafetyEvaluateController {
  constructor(private readonly service: MedicationSafetyService) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Evaluate medication safety for patient context' })
  evaluate(@Body() dto: EvaluateMedicationSafetyDto, @CurrentUser() user: RequestUser) {
    return this.service.evaluate(dto as Parameters<MedicationSafetyService['evaluate']>[0], user, user.tenantId);
  }

  @Post('evaluations/:evaluationId/override')
  @HttpCode(HttpStatus.OK)
  recordOverride(
    @Param('evaluationId') evaluationId: string,
    @Body() dto: SafetyOverrideDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.recordOverride(
      evaluationId,
      dto.reasonCode,
      dto.reasonComment,
      user,
      req,
    );
  }
}

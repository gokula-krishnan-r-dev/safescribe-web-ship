import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CreatePathwayQaRunDto, ListPathwayQaRunsQueryDto } from './pathway-qa.dto';
import { PathwayQaParseError } from './pathway-qa.parser';
import { PathwayQaService } from './pathway-qa.service';

const UPLOAD = {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
} as const;

@ApiTags('Pathway QA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('pathway-qa')
export class PathwayQaController {
  constructor(private readonly service: PathwayQaService) {}

  @Get('workbooks')
  @ApiOperation({ summary: 'List uploaded pathway QA workbooks' })
  listWorkbooks() {
    return this.service.listWorkbooks();
  }

  @Post('workbooks')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and parse a 48-pathway developer test pack' })
  @UseInterceptors(FileInterceptor('file', UPLOAD))
  async uploadWorkbook(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    this.assertExcel(file);
    try {
      return await this.service.saveWorkbook(file, user, req);
    } catch (err) {
      this.rethrowParse(err);
    }
  }

  @Post('workbooks/preview')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Parse a workbook without persisting it' })
  @UseInterceptors(FileInterceptor('file', UPLOAD))
  preview(@UploadedFile() file: Express.Multer.File) {
    this.assertExcel(file);
    try {
      return this.service.previewUpload(file);
    } catch (err) {
      this.rethrowParse(err);
    }
  }

  @Get('runs')
  @ApiOperation({ summary: 'List pathway QA runs' })
  listRuns(@Query() query: ListPathwayQaRunsQueryDto) {
    return this.service.listRuns({
      pathwayId: query.pathwayId,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
    });
  }

  @Get('pathways/:pathwayId/latest')
  @ApiOperation({ summary: 'Latest QA run for a pathway' })
  latest(@Param('pathwayId') pathwayId: string) {
    return this.service.latestForPathway(pathwayId);
  }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get a pathway QA run with results' })
  getRun(@Param('runId') runId: string) {
    return this.service.getRun(runId);
  }

  @Post('runs')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Run unique test cases for a selected pathway' })
  @UseInterceptors(FileInterceptor('file', UPLOAD))
  async createRun(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreatePathwayQaRunDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!body.pathwayId) {
      throw new BadRequestException('Select a clinical pathway first.');
    }
    if (file) this.assertExcel(file);
    try {
      return await this.service.run({
        pathwayId: body.pathwayId,
        workbookId: body.workbookId,
        file,
        user,
        req,
      });
    } catch (err) {
      this.rethrowParse(err);
    }
  }

  private assertExcel(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Please upload a .xlsx workbook.');
    const name = file.originalname?.toLowerCase() ?? '';
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('Please upload a .xlsx or .xls file.');
    }
  }

  private rethrowParse(err: unknown): never {
    if (err instanceof PathwayQaParseError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}

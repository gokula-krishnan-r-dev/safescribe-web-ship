import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { TreatmentLibraryService } from './treatment-library.service';
import {
  CreateTreatmentLibraryDto,
  ListTreatmentLibraryQueryDto,
  ReviewNotesDto,
  SearchApprovedLibraryQueryDto,
  UpdateTreatmentLibraryVersionDto,
} from './treatment-library.dto';

@ApiTags('Treatment Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('treatment-library')
export class TreatmentLibraryController {
  constructor(private readonly service: TreatmentLibraryService) {}

  @Get()
  @ApiOperation({ summary: 'List Treatment Library items' })
  list(@Query() query: ListTreatmentLibraryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search approved library treatments for pathway reuse' })
  search(@Query() query: SearchApprovedLibraryQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.searchApproved(query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a draft Treatment Library item' })
  create(
    @Body() dto: CreateTreatmentLibraryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, user, req);
  }

  @Get(':itemId')
  @ApiOperation({ summary: 'Get a Treatment Library item and versions' })
  get(@Param('itemId') itemId: string, @CurrentUser() user: RequestUser) {
    return this.service.get(itemId, user);
  }

  @Get(':itemId/review-payload')
  @ApiOperation({ summary: 'Load an approved library version for pathway review' })
  reviewPayload(@Param('itemId') itemId: string, @CurrentUser() user: RequestUser) {
    return this.service.reviewPayload(itemId, user);
  }

  @Get(':itemId/usage')
  @ApiOperation({ summary: 'List pathways using this library treatment' })
  usage(@Param('itemId') itemId: string, @CurrentUser() user: RequestUser) {
    return this.service.usage(itemId, user);
  }

  @Patch(':itemId/versions/:versionId')
  @ApiOperation({ summary: 'Update a draft library version' })
  updateDraft(
    @Param('itemId') itemId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateTreatmentLibraryVersionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.updateDraft(itemId, versionId, dto, user, req);
  }

  @Post(':itemId/versions/:versionId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a library version without changing status' })
  validate(
    @Param('itemId') itemId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.validate(itemId, versionId, user);
  }

  @Post(':itemId/versions/:versionId/submit-review')
  @HttpCode(HttpStatus.OK)
  submitReview(
    @Param('itemId') itemId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.submitReview(itemId, versionId, user, req);
  }

  @Post(':itemId/versions/:versionId/request-changes')
  @HttpCode(HttpStatus.OK)
  requestChanges(
    @Param('itemId') itemId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ReviewNotesDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.requestChanges(itemId, versionId, dto, user, req);
  }

  @Post(':itemId/versions/:versionId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('itemId') itemId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.approve(itemId, versionId, user, req);
  }

  @Post(':itemId/versions')
  createVersion(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.createNewVersion(itemId, user, req);
  }

  @Post(':itemId/retire')
  @HttpCode(HttpStatus.OK)
  retire(
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.retire(itemId, user, req);
  }
}

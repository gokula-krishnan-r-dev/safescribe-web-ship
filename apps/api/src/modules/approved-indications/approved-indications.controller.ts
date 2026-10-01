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
import {
  CreateConditionDto,
  CreateGovernedMappingDto,
  CreateIndicationMapDto,
  ListApprovedIndicationsQueryDto,
  ListCandidatesQueryDto,
  ListGovernedMappingsQueryDto,
  ListIndicationMapsQueryDto,
  ReviewCandidateDto,
  UpdateConditionDto,
  UpdateGovernedMappingDto,
  UpdateIndicationMapDto,
} from './approved-indications.dto';
import { ApprovedIndicationsService } from './approved-indications.service';
import { IndicationMappingsService } from './indication-mappings.service';

@ApiTags('Approved Indications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
@Controller('approved-indications')
export class ApprovedIndicationsController {
  constructor(
    private readonly service: ApprovedIndicationsService,
    private readonly mappings: IndicationMappingsService,
  ) {}

  @Get('snomed/search')
  @ApiOperation({ summary: 'Search SNOMED CT clinical findings for indication mapping' })
  searchSnomed(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.mappings.searchSnomed(q ?? '', limit ? parseInt(limit, 10) : 12);
  }

  @Get('mappings')
  @ApiOperation({ summary: 'List governed CCDD↔SNOMED indication mappings' })
  listMappings(@Query() query: ListGovernedMappingsQueryDto) {
    return this.mappings.listMappings(query);
  }

  @Get('mappings/:id')
  @ApiOperation({ summary: 'Get a governed indication mapping' })
  getMapping(@Param('id') id: string) {
    return this.mappings.getMapping(id);
  }

  @Post('mappings')
  @ApiOperation({ summary: 'Create a governed CCDD↔SNOMED indication mapping' })
  createMapping(
    @Body() dto: CreateGovernedMappingDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.mappings.createMapping(dto, user, req);
  }

  @Patch('mappings/:id')
  @ApiOperation({ summary: 'Update a governed indication mapping' })
  updateMapping(
    @Param('id') id: string,
    @Body() dto: UpdateGovernedMappingDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.mappings.updateMapping(id, dto, user, req);
  }

  @Post('mappings/:id/retire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retire a governed indication mapping' })
  retireMapping(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.mappings.retireMapping(id, user, req);
  }

  @Get('candidates')
  @ApiOperation({ summary: 'List medication–indication review candidates' })
  listCandidates(@Query() query: ListCandidatesQueryDto) {
    return this.mappings.listCandidates(query);
  }

  @Post('candidates/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject a review candidate' })
  reviewCandidate(
    @Param('id') id: string,
    @Body() dto: ReviewCandidateDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.mappings.reviewCandidate(id, dto, user, req);
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Indication mapping coverage metrics' })
  coverage() {
    return this.mappings.coverage();
  }

  @Post('bootstrap-from-legacy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Idempotently promote RenewMedicationIndicationMap rows into the governed Approved Indications repository',
  })
  bootstrapFromLegacy(@CurrentUser() user: RequestUser) {
    return this.mappings.bootstrapFromLegacyLibrary({ actorUserId: user.id });
  }

  @Get('versions')
  @ApiOperation({ summary: 'List published indication repository versions' })
  listVersions() {
    return this.mappings.listVersions();
  }

  @Post('versions')
  @ApiOperation({ summary: 'Publish an indication repository version snapshot' })
  publishVersion(
    @Body() body: { changeSummary?: string },
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.mappings.publishVersion(user, req, body?.changeSummary);
  }

  @Get('conditions')
  @ApiOperation({ summary: 'List approved indication conditions' })
  listConditions(@Query() query: ListApprovedIndicationsQueryDto) {
    return this.service.listConditions(query);
  }

  @Post('conditions')
  @ApiOperation({ summary: 'Create an approved indication condition' })
  createCondition(
    @Body() dto: CreateConditionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.createCondition(dto, user, req);
  }

  @Get('conditions/:id')
  @ApiOperation({ summary: 'Get an approved indication condition' })
  getCondition(@Param('id') id: string) {
    return this.service.getCondition(id);
  }

  @Patch('conditions/:id')
  @ApiOperation({ summary: 'Update an approved indication condition' })
  updateCondition(
    @Param('id') id: string,
    @Body() dto: UpdateConditionDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.updateCondition(id, dto, user, req);
  }

  @Delete('conditions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate an approved indication condition' })
  deleteCondition(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.deleteCondition(id, user, req);
  }

  @Get('maps')
  @ApiOperation({ summary: 'List medication → indication maps' })
  listMaps(@Query() query: ListIndicationMapsQueryDto) {
    return this.service.listMaps(query);
  }

  @Post('maps')
  @ApiOperation({ summary: 'Create a medication → indication map' })
  createMap(
    @Body() dto: CreateIndicationMapDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.createMap(dto, user, req);
  }

  @Patch('maps/:id')
  @ApiOperation({ summary: 'Update a medication → indication map' })
  updateMap(
    @Param('id') id: string,
    @Body() dto: UpdateIndicationMapDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.updateMap(id, dto, user, req);
  }

  @Delete('maps/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a medication → indication map' })
  deleteMap(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.deleteMap(id, user, req);
  }
}

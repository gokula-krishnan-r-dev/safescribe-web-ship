import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ROLES } from '@safescript/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  Roles,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { AccessRequestsService } from './access-requests.service';
import {
  AccessRequestNotesDto,
  ApproveAccessRequestDto,
  LinkExistingAccessRequestDto,
  ListAccessRequestsQueryDto,
  RejectAccessRequestDto,
} from './dto/access-request.dto';

@ApiTags('access-requests')
@Controller('access-requests')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@ApiBearerAuth()
@SkipThrottle()
export class AccessRequestsAdminController {
  constructor(private readonly accessRequests: AccessRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List SafeScribe access requests' })
  list(@Query() query: ListAccessRequestsQueryDto) {
    return this.accessRequests.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Access request queue metrics' })
  summary() {
    return this.accessRequests.summary();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export access requests as CSV' })
  async export(@Query() query: ListAccessRequestsQueryDto, @Res() res: Response) {
    const csv = await this.accessRequests.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=safescribe-access-requests.csv');
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an access request' })
  findOne(@Param('id') id: string) {
    return this.accessRequests.findById(id);
  }

  @Post(':id/recheck-match')
  @ApiOperation({ summary: 'Re-run existing pharmacy match for an open request' })
  recheckMatch(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.accessRequests.recheckMatch(id, user);
  }

  @Post(':id/approve-new')
  @ApiOperation({ summary: 'Create a new pharmacy and activate complimentary SafeScribe access' })
  approveNew(
    @Param('id') id: string,
    @Body() dto: ApproveAccessRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accessRequests.approveNew(id, dto, user);
  }

  @Post(':id/link-existing')
  @ApiOperation({ summary: 'Link an access request to an existing pharmacy and activate SafeScribe' })
  linkExisting(
    @Param('id') id: string,
    @Body() dto: LinkExistingAccessRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accessRequests.linkExisting(id, dto, user);
  }

  @Post(':id/needs-review')
  @ApiOperation({ summary: 'Hold an access request for further review' })
  needsReview(
    @Param('id') id: string,
    @Body() dto: AccessRequestNotesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accessRequests.markNeedsReview(id, dto.notes, user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject an access request without creating a pharmacy' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectAccessRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accessRequests.reject(id, dto, user);
  }

  @Patch(':id/notes')
  @ApiOperation({ summary: 'Save internal admin notes' })
  saveNotes(
    @Param('id') id: string,
    @Body() dto: AccessRequestNotesDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.accessRequests.saveNotes(id, dto.notes ?? '', user);
  }
}
